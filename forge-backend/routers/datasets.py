"""Dataset upload and listing."""

from __future__ import annotations

from fastapi import APIRouter, UploadFile, File, HTTPException, Query

from models.schemas import DatasetMeta
from services.dataset_service import process_upload
from services.persistence import (
    dataset_record_to_meta,
    get_dataset_record,
    list_dataset_records,
)
from services.kaggle_service import search_kaggle_datasets

router = APIRouter(prefix="/datasets", tags=["datasets"])


@router.post("/upload", response_model=DatasetMeta)
async def upload_dataset(file: UploadFile = File(...)) -> DatasetMeta:
    """Upload and validate a dataset file (CSV, JSON, JSONL)."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    suffix = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if suffix not in ("csv", "json", "jsonl"):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: .{suffix}. Accepted: .csv, .json, .jsonl",
        )

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    return await process_upload(file.filename, content)


@router.get("", response_model=list[DatasetMeta])
async def list_datasets() -> list[DatasetMeta]:
    """List all uploaded datasets."""
    return [dataset_record_to_meta(record) for record in list_dataset_records()]


@router.get("/{dataset_id}", response_model=DatasetMeta)
async def get_dataset(dataset_id: str) -> DatasetMeta:
    """Get metadata for a specific dataset."""
    record = get_dataset_record(dataset_id)
    if not record:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dataset_record_to_meta(record)


@router.get("/{dataset_id}/preview", response_model=DatasetMeta)
async def get_dataset_preview(dataset_id: str) -> DatasetMeta:
    """Return dataset metadata plus preview rows."""
    record = get_dataset_record(dataset_id)
    if not record:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dataset_record_to_meta(record)


@router.get("/kaggle/search")
async def search_kaggle(q: str = Query(default="", min_length=0), limit: int = Query(default=20, ge=1, le=50)) -> dict:
    """Search Kaggle datasets when credentials are configured."""
    if not q:
        return {"items": [], "enabled": False}
    items = await search_kaggle_datasets(q, limit=limit)
    return {"items": items, "enabled": True}
