"""Dataset file parsing, format detection, and validation."""

from __future__ import annotations

import csv
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from config import settings
from models.schemas import DatasetMeta, ValidationIssue


def detect_format(file_path: Path) -> Literal["alpaca", "sharegpt", "unknown"]:
    """Auto-detect dataset format from file content.

    Alpaca: keys 'instruction', 'output' (input optional)
    ShareGPT: key 'conversations' with list of {from, value}
    """
    suffix = file_path.suffix.lower()

    try:
        if suffix == ".jsonl":
            with file_path.open("r", encoding="utf-8") as f:
                for _ in range(3):
                    line = f.readline().strip()
                    if not line:
                        continue
                    obj = json.loads(line)
                    if isinstance(obj, dict):
                        if "instruction" in obj and "output" in obj:
                            return "alpaca"
                        if "conversations" in obj and isinstance(obj["conversations"], list):
                            return "sharegpt"

        elif suffix == ".json":
            with file_path.open("r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, list) and len(data) > 0:
                sample = data[0]
                if isinstance(sample, dict):
                    if "instruction" in sample and "output" in sample:
                        return "alpaca"
                    if "conversations" in sample:
                        return "sharegpt"

        elif suffix == ".csv":
            with file_path.open("r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                fields = reader.fieldnames or []
                if "instruction" in fields and "output" in fields:
                    return "alpaca"

    except (json.JSONDecodeError, UnicodeDecodeError, csv.Error, KeyError):
        pass

    return "unknown"


def _validate_alpaca(row: dict, idx: int) -> list[ValidationIssue]:
    """Validate a single Alpaca-format row."""
    issues: list[ValidationIssue] = []
    if not isinstance(row.get("instruction"), str) or not row["instruction"].strip():
        issues.append(
            ValidationIssue(row_index=idx, field="instruction", message="Must be a non-empty string")
        )
    if not isinstance(row.get("output"), str) or not row["output"].strip():
        issues.append(
            ValidationIssue(row_index=idx, field="output", message="Must be a non-empty string")
        )
    return issues


def _validate_sharegpt(row: dict, idx: int) -> list[ValidationIssue]:
    """Validate a single ShareGPT-format row."""
    issues: list[ValidationIssue] = []
    convos = row.get("conversations")
    if not isinstance(convos, list) or len(convos) == 0:
        issues.append(
            ValidationIssue(
                row_index=idx,
                field="conversations",
                message="Must be a non-empty list",
            )
        )
        return issues

    for ci, turn in enumerate(convos):
        if not isinstance(turn, dict):
            issues.append(
                ValidationIssue(row_index=idx, field=f"conversations[{ci}]", message="Must be a dict")
            )
            continue
        if "from" not in turn:
            issues.append(
                ValidationIssue(row_index=idx, field=f"conversations[{ci}].from", message="Missing 'from' key")
            )
        if "value" not in turn:
            issues.append(
                ValidationIssue(row_index=idx, field=f"conversations[{ci}].value", message="Missing 'value' key")
            )
    return issues


def validate_dataset(file_path: Path, fmt: Literal["alpaca", "sharegpt", "unknown"]) -> tuple[int, int, list[ValidationIssue]]:
    """Validate every row in the dataset.

    Returns: (total_rows, valid_rows, issues)
    """
    if fmt == "unknown":
        return 0, 0, []

    rows: list[dict] = []
    suffix = file_path.suffix.lower()

    try:
        if suffix == ".jsonl":
            with file_path.open("r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line:
                        rows.append(json.loads(line))
        elif suffix == ".json":
            with file_path.open("r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, list):
                rows = data
        elif suffix == ".csv":
            with file_path.open("r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                rows = list(reader)
    except (json.JSONDecodeError, UnicodeDecodeError, csv.Error):
        return 0, 0, [ValidationIssue(row_index=0, field="file", message="Failed to parse file")]

    validator = _validate_alpaca if fmt == "alpaca" else _validate_sharegpt
    all_issues: list[ValidationIssue] = []
    valid = 0

    for i, row in enumerate(rows):
        if not isinstance(row, dict):
            all_issues.append(ValidationIssue(row_index=i, field="row", message="Not a JSON object"))
            continue
        row_issues = validator(row, i)
        if not row_issues:
            valid += 1
        else:
            all_issues.extend(row_issues)

    return len(rows), valid, all_issues


async def process_upload(filename: str, content: bytes) -> DatasetMeta:
    """Save uploaded file, detect format, validate, return metadata."""
    dataset_id = str(uuid.uuid4())[:8]
    safe_name = f"{dataset_id}_{filename}"
    file_path = settings.datasets_dir / safe_name

    settings.datasets_dir.mkdir(parents=True, exist_ok=True)
    file_path.write_bytes(content)

    fmt = detect_format(file_path)
    total_rows, valid_rows, issues = validate_dataset(file_path, fmt)

    return DatasetMeta(
        id=dataset_id,
        filename=filename,
        format=fmt,
        rows=total_rows,
        valid_rows=valid_rows,
        file_path=str(file_path),
        size_bytes=len(content),
        issues=issues,
        created_at=datetime.now(timezone.utc),
    )
