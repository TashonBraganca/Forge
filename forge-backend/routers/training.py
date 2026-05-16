"""Training job management and SSE log streaming."""

from __future__ import annotations

import asyncio
import logging
from typing import AsyncIterator

from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse

from config import settings
from models.schemas import TrainingConfig, TrainingJob, TrainingStartResponse
from pydantic import BaseModel
from fastapi import BackgroundTasks
from services.export_service import run_export_pipeline
from services.training_service import (
    create_training_job,
    cancel_job,
    get_job,
    list_jobs,
    training_event_queues,
)

logger = logging.getLogger("forge.training")

router = APIRouter(prefix="/training", tags=["training"])

class ExportRequest(BaseModel):
    ollama_model_name: str


@router.post("/start", response_model=TrainingStartResponse)
async def start_training(config: TrainingConfig) -> TrainingStartResponse:
    """Start a new training job and return its mode explicitly."""
    logger.info(
        "[TRAINING] Start requested:\n"
        "  Model:    %s\n"
        "  Dataset:  %s\n"
        "  Method:   %s\n"
        "  Epochs:   %d\n"
        "  Batch:    %d\n"
        "  LR:       %s",
        config.model_name, config.dataset_id, config.method,
        config.epochs, config.batch_size, config.learning_rate,
    )
    job_id = await create_training_job(config)
    mode = "live" if settings.llamafactory_dir.exists() else "simulation"
    message = None if mode == "live" else "LLaMA-Factory unavailable — backend simulation enabled"
    logger.info("[TRAINING] ✓ Job %s created (mode=%s)", job_id, mode)
    return TrainingStartResponse(job_id=job_id, mode=mode, message=message)


@router.get("/stream/{job_id}")
async def stream_training_events(job_id: str) -> EventSourceResponse:
    """SSE endpoint streaming real-time training events for a job."""
    
    # Check if the job exists at all
    job = get_job(job_id)
    if not job:
        logger.warning("[TRAINING] Stream requested for unknown job: %s", job_id)
        raise HTTPException(status_code=404, detail="Job not found")

    async def generate() -> AsyncIterator[dict[str, str]]:
        # If the backend was restarted, or the job is already complete/failed, 
        # it won't have an active event queue. We send a single event to sync the frontend.
        if job_id not in training_event_queues:
            logger.info("[TRAINING] No active queue for job %s, sending final state sync", job_id)
            if job.status in ("complete", "failed", "cancelled"):
                event_type = "complete" if job.status == "complete" else "error"
                from models.schemas import TrainingEvent
                from datetime import datetime, timezone
                event = TrainingEvent(
                    type=event_type,
                    message=job.error_message or f"Job is {job.status}",
                    level="INFO" if job.status == "complete" else "ERROR",
                    timestamp=datetime.now(timezone.utc),
                    loss=job.final_loss
                )
                yield {"data": event.model_dump_json()}
            return

        # Normal active streaming
        logger.info("[TRAINING] SSE stream opened for active job %s", job_id)
        queue = training_event_queues[job_id]
        try:
            while True:
                event = await queue.get()
                if event is None:
                    logger.info("[TRAINING] SSE stream ended for job %s (sentinel received)", job_id)
                    break
                yield {"data": event.model_dump_json()}
        except asyncio.CancelledError:
            logger.info("[TRAINING] SSE stream cancelled for job %s (client disconnected)", job_id)

    return EventSourceResponse(
        generate(),
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/cancel/{job_id}")
async def cancel_training(job_id: str) -> dict[str, str]:
    """Cancel a running training job. Idempotent — always returns 200."""
    logger.info("[TRAINING] Cancel requested for job %s", job_id)
    success = await cancel_job(job_id)
    if success:
        logger.info("[TRAINING] ✓ Job %s cancelled", job_id)
    else:
        logger.warning("[TRAINING] Job %s not found or not cancellable", job_id)
    return {
        "status": "cancelled" if success else "not_found",
        "job_id": job_id,
    }


@router.get("/jobs", response_model=list[TrainingJob])
async def get_all_jobs() -> list[TrainingJob]:
    """List all training jobs, newest first."""
    jobs = list_jobs()
    logger.info("[TRAINING] Listed %d jobs", len(jobs))
    return jobs


@router.get("/jobs/{job_id}", response_model=TrainingJob)
async def get_training_job(job_id: str) -> TrainingJob:
    """Get a specific training job by ID."""
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.post("/export/{job_id}")
async def export_training_job(job_id: str, request: ExportRequest, background_tasks: BackgroundTasks) -> dict:
    """Start the export pipeline in the background."""
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
        
    if job.status != "complete":
        raise HTTPException(status_code=400, detail="Only completed jobs can be exported")
        
    job.export_status = "pending"
    from services.training_service import _persist_job
    _persist_job(job)

    # Pre-create the SSE queue so the frontend can reconnect immediately
    import asyncio
    training_event_queues[job_id] = asyncio.Queue()
    logger.info("[TRAINING] Export queue pre-created for job %s", job_id)

    background_tasks.add_task(run_export_pipeline, job_id, request.ollama_model_name)
    return {"status": "accepted", "job_id": job_id, "export_model_name": request.ollama_model_name}
