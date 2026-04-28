"""Training job management and SSE log streaming."""

from __future__ import annotations

import asyncio
from typing import AsyncIterator

from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse

from config import settings
from models.schemas import TrainingConfig, TrainingJob, TrainingStartResponse
from services.training_service import (
    create_training_job,
    cancel_job,
    get_job,
    list_jobs,
    training_event_queues,
)

router = APIRouter(prefix="/training", tags=["training"])


@router.post("/start")
async def start_training(config: TrainingConfig) -> dict:
    """Start a new training job. Returns immediately with job_id.
    If LLaMA-Factory is not installed, returns mode='simulation' so
    the frontend can fall back gracefully."""
    if not settings.llamafactory_dir.exists():
        return {
            "job_id": None,
            "mode": "simulation",
            "message": "LLaMA-Factory not installed — use simulation mode",
        }
    job_id = await create_training_job(config)
    return {"job_id": job_id, "mode": "live"}


@router.get("/stream/{job_id}")
async def stream_training_events(job_id: str) -> EventSourceResponse:
    """SSE endpoint streaming real-time training events for a job."""
    if job_id not in training_event_queues:
        raise HTTPException(status_code=404, detail="Job not found")

    async def generate() -> AsyncIterator[dict[str, str]]:
        queue = training_event_queues[job_id]
        try:
            while True:
                event = await queue.get()
                if event is None:
                    break
                yield {"data": event.model_dump_json()}
        except asyncio.CancelledError:
            # Client disconnected
            pass

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
    success = await cancel_job(job_id)
    return {
        "status": "cancelled" if success else "not_found",
        "job_id": job_id,
    }


@router.get("/jobs", response_model=list[TrainingJob])
async def get_all_jobs() -> list[TrainingJob]:
    """List all training jobs, newest first."""
    return list_jobs()


@router.get("/jobs/{job_id}", response_model=TrainingJob)
async def get_training_job(job_id: str) -> TrainingJob:
    """Get a specific training job by ID."""
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job
