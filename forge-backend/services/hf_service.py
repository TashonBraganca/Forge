"""Hugging Face Hub API client for model search."""

from __future__ import annotations

import httpx

from config import settings
from models.schemas import ModelInfo
from utils.vram_calculator import estimate_vram_gb


_HF_API = "https://huggingface.co/api/models"


async def search_hf_models(query: str, limit: int = 20) -> list[ModelInfo]:
    """Search Hugging Face Hub for text-generation models."""
    params = {
        "search": query,
        "limit": limit,
        "sort": "downloads",
        "filter": "text-generation",
    }
    headers = {}
    if settings.huggingface_token:
        headers["Authorization"] = f"Bearer {settings.huggingface_token}"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(_HF_API, params=params, headers=headers)
            resp.raise_for_status()
            data = resp.json()
    except (httpx.ConnectError, httpx.TimeoutException, httpx.HTTPStatusError, OSError):
        return []

    models: list[ModelInfo] = []
    for item in data:
        model_id: str = item.get("modelId", item.get("id", ""))
        tags: list[str] = item.get("tags", [])

        # Try to extract param count from tags (e.g. "7b", "13b")
        param_str = ""
        size_gb = 0.0
        for tag in tags:
            tag_lower = tag.lower()
            if tag_lower.endswith("b") and tag_lower[:-1].replace(".", "").isdigit():
                param_str = tag
                param_billions = float(tag_lower[:-1])
                # Estimate: fp16 = 2 bytes per param
                size_gb = round(param_billions * 2.0, 1)
                break

        vram_req = estimate_vram_gb(size_gb, "qlora", 2, 2048) if size_gb > 0 else 0.0

        models.append(
            ModelInfo(
                id=model_id,
                name=model_id.split("/")[-1] if "/" in model_id else model_id,
                family=model_id.split("/")[0] if "/" in model_id else "",
                size_gb=size_gb,
                vram_required_gb=vram_req,
                quantization="fp16",
                context_length=item.get("config", {}).get("max_position_embeddings", 2048),
                is_installed=False,
                source="huggingface",
                tags=tags[:10],
            )
        )

    return models
