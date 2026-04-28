"""Async Ollama API client wrapping httpx."""

from __future__ import annotations

from typing import AsyncIterator

import httpx

from config import settings
from models.schemas import ModelInfo


async def check_ollama_running() -> bool:
    """Return True if Ollama is reachable."""
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get(f"{settings.ollama_base_url}/api/tags")
            return resp.status_code == 200
    except (httpx.ConnectError, httpx.TimeoutException, OSError):
        return False


async def list_ollama_models() -> list[ModelInfo]:
    """Fetch installed models from Ollama."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{settings.ollama_base_url}/api/tags")
            resp.raise_for_status()
            data = resp.json()
    except (httpx.ConnectError, httpx.TimeoutException, httpx.HTTPStatusError, OSError):
        return []

    models: list[ModelInfo] = []
    for m in data.get("models", []):
        name = m.get("name", "")
        size_bytes = m.get("size", 0)
        size_gb = round(size_bytes / (1024**3), 2) if size_bytes else 0.0

        # Parse family from model name (e.g. "llama3.2:3b" → "llama")
        family = name.split(":")[0].split("/")[-1].rstrip("0123456789.")

        models.append(
            ModelInfo(
                id=name,
                name=name,
                family=family,
                size_gb=size_gb,
                vram_required_gb=size_gb * 1.2,
                quantization=m.get("details", {}).get("quantization_level", ""),
                context_length=m.get("details", {}).get("context_length", 2048),
                is_installed=True,
                source="ollama",
                tags=[f.strip() for f in m.get("details", {}).get("families", [])],
            )
        )
    return models


async def stream_chat(
    model: str,
    messages: list[dict[str, str]],
    temperature: float = 0.7,
    max_tokens: int = 2048,
) -> AsyncIterator[str]:
    """Stream chat tokens from Ollama as an async iterator of text chunks."""
    payload = {
        "model": model,
        "messages": messages,
        "stream": True,
        "options": {
            "temperature": temperature,
            "num_predict": max_tokens,
        },
    }

    async with httpx.AsyncClient(timeout=httpx.Timeout(300.0, connect=5.0)) as client:
        async with client.stream(
            "POST",
            f"{settings.ollama_base_url}/api/chat",
            json=payload,
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line.strip():
                    continue
                try:
                    import json

                    data = json.loads(line)
                    content = data.get("message", {}).get("content", "")
                    done = data.get("done", False)
                    if content:
                        yield content
                    if done:
                        return
                except (ValueError, KeyError):
                    continue


async def pull_model(model_name: str) -> AsyncIterator[dict]:
    """Pull/download a model from Ollama. Yields progress dicts."""
    payload = {"name": model_name, "stream": True}

    async with httpx.AsyncClient(timeout=httpx.Timeout(600.0, connect=5.0)) as client:
        async with client.stream(
            "POST",
            f"{settings.ollama_base_url}/api/pull",
            json=payload,
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line.strip():
                    continue
                try:
                    import json

                    data = json.loads(line)
                    status = data.get("status", "")
                    total = data.get("total", 0)
                    completed = data.get("completed", 0)

                    progress = 0
                    if total > 0:
                        progress = round((completed / total) * 100)

                    yield {
                        "status": status,
                        "progress": progress,
                        "total": total,
                        "completed": completed,
                    }

                    # Check for completion
                    if status == "success":
                        return
                except (ValueError, KeyError):
                    continue


async def delete_model(model_name: str) -> bool:
    """Delete a model from Ollama. Returns True on success."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.delete(
                f"{settings.ollama_base_url}/api/delete",
                json={"name": model_name},
            )
            return resp.status_code == 200
    except (httpx.ConnectError, httpx.TimeoutException, OSError):
        return False

