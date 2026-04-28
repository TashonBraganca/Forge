"""Kaggle Datasets API client."""

from __future__ import annotations

import httpx

from config import settings


async def search_kaggle_datasets(query: str, limit: int = 20) -> list[dict]:
    """Search Kaggle for datasets matching query.

    Returns raw dataset metadata dicts from the Kaggle API.
    Requires KAGGLE_USERNAME and KAGGLE_KEY in environment.
    """
    if not settings.kaggle_username or not settings.kaggle_key:
        return []

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://www.kaggle.com/api/v1/datasets/list",
                params={"search": query, "maxSize": limit},
                auth=(settings.kaggle_username, settings.kaggle_key),
            )
            resp.raise_for_status()
            return resp.json()
    except (httpx.ConnectError, httpx.TimeoutException, httpx.HTTPStatusError, OSError):
        return []
