"""Model listing, pull (download), search, and delete via Ollama."""

from __future__ import annotations

import logging
from typing import AsyncIterator

from fastapi import APIRouter, HTTPException, Query
from sse_starlette.sse import EventSourceResponse

from models.schemas import ExportArtifactInfo, FineTunedModelInfo, ModelInfo
from services.model_export_service import export_to_ollama
from services.ollama_service import (
    list_ollama_models,
    pull_model,
    cancel_pull,
    delete_model,
    search_ollama_library,
)
from services.hf_service import search_hf_models
from services.persistence import (
    artifact_record_to_info,
    get_export_artifact,
    list_export_artifacts,
    list_model_records,
    model_record_to_info,
)

logger = logging.getLogger("forge.models")

router = APIRouter(prefix="/models", tags=["models"])


@router.get("/ollama", response_model=list[ModelInfo])
async def get_ollama_models() -> list[ModelInfo]:
    """List all locally installed Ollama models."""
    models = await list_ollama_models()
    logger.info("[MODELS] Listed %d installed Ollama models", len(models))
    return models


@router.get("/ollama/search")
async def search_ollama_models(
    q: str = Query(default="", description="Search query for Ollama library"),
    limit: int = Query(default=20, ge=1, le=50),
) -> list[dict]:
    """Search the Ollama library for models to pull.

    Returns a list of available models with name, description, tags, and size.
    Used by the frontend search dropdown for model discovery.
    """
    if not q or len(q) < 2:
        return []
    logger.info("[MODELS] Searching Ollama library for: '%s'", q)
    results = await search_ollama_library(query=q, limit=limit)
    logger.info("[MODELS] Search returned %d results for '%s'", len(results), q)
    return results


@router.get("/huggingface", response_model=list[ModelInfo])
async def get_hf_models(
    q: str = Query(default="", description="Search query"),
    limit: int = Query(default=20, ge=1, le=50),
) -> list[ModelInfo]:
    """Search Hugging Face Hub for text-generation models."""
    if not q:
        return []
    return await search_hf_models(query=q, limit=limit)


@router.post("/pull/{model_name:path}")
async def pull_ollama_model(model_name: str) -> EventSourceResponse:
    """Pull (download) a model from Ollama. Streams progress via SSE."""
    import json

    logger.info("[MODELS] Pull requested: %s", model_name)

    async def generate() -> AsyncIterator[dict[str, str]]:
        try:
            async for progress in pull_model(model_name):
                logger.debug("[MODELS] Pull progress: %s — %s", model_name, progress.get("status", ""))
                yield {"data": json.dumps(progress)}
        except Exception as exc:
            logger.error("[MODELS] Pull failed for %s: %s", model_name, exc)
            yield {"data": json.dumps({"status": "error", "error": str(exc)})}

    return EventSourceResponse(
        generate(),
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/pull/cancel/{model_name:path}")
async def cancel_pull_model(model_name: str) -> dict[str, str]:
    """Cancel an in-progress model pull."""
    logger.info("[MODELS] Cancel pull requested: %s", model_name)
    success = await cancel_pull(model_name)
    if success:
        logger.info("[MODELS] ✓ Pull cancelled: %s", model_name)
    else:
        logger.warning("[MODELS] No active pull found for: %s", model_name)
    return {
        "status": "cancelled" if success else "not_found",
        "model": model_name,
    }


@router.delete("/{model_name:path}")
async def delete_ollama_model(model_name: str) -> dict[str, str]:
    """Delete a model from Ollama."""
    logger.info("[MODELS] Delete requested: %s", model_name)
    success = await delete_model(model_name)
    if not success:
        logger.error("[MODELS] Delete failed: %s", model_name)
        raise HTTPException(status_code=400, detail=f"Failed to delete {model_name}")
    logger.info("[MODELS] ✓ Deleted: %s", model_name)
    return {"status": "deleted", "model": model_name}


@router.get("/registry", response_model=list[FineTunedModelInfo])
async def get_registry_models() -> list[FineTunedModelInfo]:
    """List trained models and export status from the registry."""
    return [model_record_to_info(record) for record in list_model_records()]


@router.get("/artifacts", response_model=list[ExportArtifactInfo])
async def get_artifacts() -> list[ExportArtifactInfo]:
    """List model export artifacts."""
    return [artifact_record_to_info(record) for record in list_export_artifacts()]


@router.get("/artifacts/{artifact_id}", response_model=ExportArtifactInfo)
async def get_artifact(artifact_id: str) -> ExportArtifactInfo:
    record = get_export_artifact(artifact_id)
    if not record:
        raise HTTPException(status_code=404, detail="Artifact not found")
    return artifact_record_to_info(record)

