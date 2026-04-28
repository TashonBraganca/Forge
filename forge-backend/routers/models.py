"""Model listing, pull (download), and delete via Ollama."""

from __future__ import annotations

from typing import AsyncIterator

from fastapi import APIRouter, HTTPException, Query
from sse_starlette.sse import EventSourceResponse

from models.schemas import ModelInfo
from services.ollama_service import (
    list_ollama_models,
    pull_model,
    delete_model,
)
from services.hf_service import search_hf_models

router = APIRouter(prefix="/models", tags=["models"])


@router.get("/ollama", response_model=list[ModelInfo])
async def get_ollama_models() -> list[ModelInfo]:
    """List all locally installed Ollama models."""
    return await list_ollama_models()


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

    async def generate() -> AsyncIterator[dict[str, str]]:
        try:
            async for progress in pull_model(model_name):
                yield {"data": json.dumps(progress)}
        except Exception as exc:
            yield {"data": json.dumps({"status": "error", "error": str(exc)})}

    return EventSourceResponse(
        generate(),
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.delete("/{model_name:path}")
async def delete_ollama_model(model_name: str) -> dict[str, str]:
    """Delete a model from Ollama."""
    success = await delete_model(model_name)
    if not success:
        raise HTTPException(status_code=400, detail=f"Failed to delete {model_name}")
    return {"status": "deleted", "model": model_name}
