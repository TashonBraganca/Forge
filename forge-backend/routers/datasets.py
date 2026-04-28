"""Dataset upload and listing."""

from __future__ import annotations

from fastapi import APIRouter, UploadFile, File, HTTPException

from models.schemas import DatasetMeta
from services.dataset_service import process_upload
from config import settings

router = APIRouter(prefix="/datasets", tags=["datasets"])

# In-memory registry of uploaded datasets
_datasets: dict[str, DatasetMeta] = {}


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

    meta = await process_upload(file.filename, content)
    _datasets[meta.id] = meta
    return meta


@router.get("", response_model=list[DatasetMeta])
async def list_datasets() -> list[DatasetMeta]:
    """List all uploaded datasets."""
    return list(_datasets.values())


@router.get("/{dataset_id}", response_model=DatasetMeta)
async def get_dataset(dataset_id: str) -> DatasetMeta:
    """Get metadata for a specific dataset."""
    meta = _datasets.get(dataset_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return meta
