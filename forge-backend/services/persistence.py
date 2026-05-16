"""SQLite persistence layer for Forge state."""

from __future__ import annotations

import json
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from sqlmodel import Field, Session, SQLModel, create_engine, select

from config import settings
from models.schemas import (
    DatasetMeta,
    ExportArtifactInfo,
    FineTunedModelInfo,
    HardwareStats,
    TrainingConfig,
    TrainingJob,
    ValidationIssue,
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class DatasetRecord(SQLModel, table=True):
    id: str = Field(primary_key=True)
    filename: str = Field(index=True)
    file_path: str
    format: str = "unknown"
    rows: int = 0
    valid_rows: int = 0
    size_bytes: int = 0
    columns_json: str = "[]"
    preview_rows_json: str = "[]"
    validation_issues_json: str = "[]"
    validation_status: str = "unknown"
    validation_message: str | None = None
    source: str = "upload"
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)


class TrainingJobRecord(SQLModel, table=True):
    job_id: str = Field(primary_key=True)
    status: str = "queued"
    model_name: str
    dataset_id: str
    dataset_path: str = ""
    method: str = "qlora"
    config_json: str = "{}"
    output_dir: str = ""
    progress: float = 0.0
    current_epoch: int = 0
    total_epochs: int = 0
    current_step: int = 0
    total_steps: int = 0
    current_loss: float | None = None
    final_loss: float | None = None
    loss_history_json: str = "[]"
    latest_logs_json: str = "[]"
    export_status: str = "not_started"
    export_model_name: str | None = None
    simulation_mode: bool = False
    error_message: str | None = None
    output_model_path: str | None = None
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)
    started_at: datetime | None = None
    completed_at: datetime | None = None


class FineTunedModelRecord(SQLModel, table=True):
    id: str = Field(primary_key=True)
    job_id: str = Field(index=True)
    name: str
    base_model: str
    method: str = "qlora"
    status: str = "trained"
    export_format: str = "adapter"
    export_status: str = "pending"
    artifact_path: str = ""
    ollama_model_name: str | None = None
    final_loss: float | None = None
    metrics_json: str = "{}"
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)
    exported_at: datetime | None = None


class ExportArtifactRecord(SQLModel, table=True):
    id: str = Field(primary_key=True)
    job_id: str = Field(index=True)
    model_id: str | None = None
    export_format: str = "adapter"
    export_status: str = "pending"
    source_path: str = ""
    target_path: str | None = None
    ollama_model_name: str | None = None
    error_message: str | None = None
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)
    completed_at: datetime | None = None


class SystemEventRecord(SQLModel, table=True):
    id: str = Field(primary_key=True)
    kind: str = "system"
    level: str = "INFO"
    message: str
    payload_json: str = "{}"
    created_at: datetime = Field(default_factory=_utcnow)


_engine = create_engine(
    f"sqlite:///{settings.database_path}",
    connect_args={"check_same_thread": False},
)


def init_database() -> bool:
    """Create tables and ensure the database file exists."""
    settings.database_path.parent.mkdir(parents=True, exist_ok=True)
    SQLModel.metadata.create_all(_engine)
    sync_dataset_info_file()
    return settings.database_path.exists()


@contextmanager
def db_session() -> Iterator[Session]:
    with Session(_engine) as session:
        yield session


def _dump(value: Any) -> str:
    return json.dumps(value, default=str)


def _load(value: str | None, default: Any) -> Any:
    if not value:
        return default
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return default


def dataset_record_to_meta(record: DatasetRecord) -> DatasetMeta:
    return DatasetMeta(
        id=record.id,
        filename=record.filename,
        format=record.format,  # type: ignore[arg-type]
        rows=record.rows,
        valid_rows=record.valid_rows,
        file_path=record.file_path,
        size_bytes=record.size_bytes,
        columns=list(_load(record.columns_json, [])),
        validation_status=record.validation_status,  # type: ignore[arg-type]
        preview_rows=list(_load(record.preview_rows_json, [])),
        source=record.source,
        validation_message=record.validation_message,
        issues=[ValidationIssue(**issue) for issue in _load(record.validation_issues_json, [])],
        created_at=record.created_at,
    )


def training_record_to_job(record: TrainingJobRecord) -> TrainingJob:
    config = TrainingConfig(**_load(record.config_json, {}))
    return TrainingJob(
        job_id=record.job_id,
        status=record.status,  # type: ignore[arg-type]
        config=config,
        created_at=record.created_at,
        completed_at=record.completed_at,
        current_step=record.current_step,
        total_steps=record.total_steps,
        progress=record.progress,
        current_epoch=record.current_epoch,
        final_loss=record.final_loss,
        output_model_path=record.output_model_path,
        simulation_mode=record.simulation_mode,
        error_message=record.error_message,
        loss_history=list(_load(record.loss_history_json, [])),
        latest_logs=list(_load(record.latest_logs_json, [])),
        export_status=record.export_status,  # type: ignore[arg-type]
        export_model_name=record.export_model_name,
    )


def model_record_to_info(record: FineTunedModelRecord) -> FineTunedModelInfo:
    return FineTunedModelInfo(
        id=record.id,
        job_id=record.job_id,
        name=record.name,
        base_model=record.base_model,
        method=record.method,  # type: ignore[arg-type]
        status=record.status,
        export_format=record.export_format,
        export_status=record.export_status,
        artifact_path=record.artifact_path,
        ollama_model_name=record.ollama_model_name,
        final_loss=record.final_loss,
        created_at=record.created_at,
        exported_at=record.exported_at,
    )


def artifact_record_to_info(record: ExportArtifactRecord) -> ExportArtifactInfo:
    return ExportArtifactInfo(
        id=record.id,
        job_id=record.job_id,
        model_id=record.model_id,
        export_format=record.export_format,
        export_status=record.export_status,
        source_path=record.source_path,
        target_path=record.target_path,
        ollama_model_name=record.ollama_model_name,
        error_message=record.error_message,
        created_at=record.created_at,
        completed_at=record.completed_at,
    )


def save_dataset_record(meta: DatasetMeta) -> DatasetRecord:
    record = DatasetRecord(
        id=meta.id,
        filename=meta.filename,
        file_path=meta.file_path,
        format=meta.format,
        rows=meta.rows,
        valid_rows=meta.valid_rows,
        size_bytes=meta.size_bytes,
        columns_json=_dump(meta.columns),
        preview_rows_json=_dump(meta.preview_rows),
        validation_issues_json=_dump([issue.model_dump() for issue in meta.issues]),
        validation_status=meta.validation_status,
        validation_message=meta.validation_message,
        source=meta.source,
        created_at=meta.created_at,
        updated_at=_utcnow(),
    )
    with db_session() as session:
        session.merge(record)
        session.commit()
    sync_dataset_info_file()
    return record


def sync_dataset_info_file() -> Path:
    """Write the LLaMA-Factory dataset metadata file from persisted datasets."""
    dataset_info: dict[str, dict[str, Any]] = {}

    for record in list_dataset_records():
        columns: dict[str, Any] = {"prompt": "instruction", "response": "output"}
        dataset_columns = list(_load(record.columns_json, []))
        if not dataset_columns:
            try:
                dataset_path = Path(record.file_path)
                if dataset_path.suffix.lower() == ".jsonl" and dataset_path.exists():
                    with dataset_path.open("r", encoding="utf-8") as handle:
                        for line in handle:
                            line = line.strip()
                            if not line:
                                continue
                            sample = json.loads(line)
                            if isinstance(sample, dict):
                                dataset_columns = list(sample.keys())
                                break
            except Exception:
                dataset_columns = []

        if "input" in dataset_columns:
            columns["query"] = "input"
        else:
            columns["query"] = None

        if record.format == "sharegpt":
            columns = {"messages": "conversations", "role_tag": "from", "content_tag": "value"}

        dataset_info[record.id] = {
            "file_name": Path(record.file_path).name,
            "formatting": record.format,
            "split": "train",
            "columns": columns,
        }

    settings.datasets_dir.mkdir(parents=True, exist_ok=True)
    dataset_info_path = settings.datasets_dir / "dataset_info.json"
    dataset_info_path.write_text(json.dumps(dataset_info, indent=2, sort_keys=True), encoding="utf-8")
    return dataset_info_path


def list_dataset_records() -> list[DatasetRecord]:
    with db_session() as session:
        return list(session.exec(select(DatasetRecord).order_by(DatasetRecord.created_at.desc())))


def get_dataset_record(dataset_id: str) -> DatasetRecord | None:
    with db_session() as session:
        return session.get(DatasetRecord, dataset_id)


def save_training_job_record(job: TrainingJob) -> TrainingJobRecord:
    dataset_record = get_dataset_record(job.config.dataset_id)
    record = TrainingJobRecord(
        job_id=job.job_id,
        status=job.status,
        model_name=job.config.model_name,
        dataset_id=job.config.dataset_id,
        dataset_path=dataset_record.file_path if dataset_record else job.config.dataset_id,
        method=job.config.method,
        config_json=_dump(job.config.model_dump()),
        output_dir=job.config.output_dir,
        progress=job.progress,
        current_epoch=job.current_epoch,
        total_epochs=job.config.epochs,
        current_step=job.current_step,
        total_steps=job.total_steps,
        current_loss=job.final_loss,
        final_loss=job.final_loss,
        loss_history_json=_dump(job.loss_history),
        latest_logs_json=_dump(job.latest_logs),
        export_status=job.export_status,
        export_model_name=job.export_model_name,
        simulation_mode=job.simulation_mode,
        error_message=job.error_message,
        output_model_path=job.output_model_path,
        created_at=job.created_at,
        updated_at=_utcnow(),
        completed_at=job.completed_at,
    )
    with db_session() as session:
        session.merge(record)
        session.commit()
    return record


def update_training_job_record(job_id: str, **updates: Any) -> TrainingJobRecord | None:
    with db_session() as session:
        record = session.get(TrainingJobRecord, job_id)
        if not record:
            return None
        for key, value in updates.items():
            if hasattr(record, key):
                setattr(record, key, value)
        record.updated_at = _utcnow()
        session.add(record)
        session.commit()
        session.refresh(record)
        return record


def get_training_job_record(job_id: str) -> TrainingJobRecord | None:
    with db_session() as session:
        return session.get(TrainingJobRecord, job_id)


def list_training_job_records() -> list[TrainingJobRecord]:
    with db_session() as session:
        return list(session.exec(select(TrainingJobRecord).order_by(TrainingJobRecord.created_at.desc())))


def save_model_record(record: FineTunedModelRecord) -> FineTunedModelRecord:
    record.updated_at = _utcnow()
    with db_session() as session:
        merged = session.merge(record)
        session.commit()
        session.refresh(merged)
        return merged


def upsert_model_record(
    *,
    model_id: str,
    job_id: str,
    name: str,
    base_model: str,
    method: str,
    status: str,
    export_format: str,
    export_status: str,
    artifact_path: str,
    ollama_model_name: str | None,
    final_loss: float | None,
    metrics: dict[str, Any] | None = None,
    exported_at: datetime | None = None,
) -> FineTunedModelRecord:
    with db_session() as session:
        record = session.get(FineTunedModelRecord, model_id)
        if record is None:
            record = FineTunedModelRecord(
                id=model_id,
                job_id=job_id,
                name=name,
                base_model=base_model,
                method=method,
                status=status,
                export_format=export_format,
                export_status=export_status,
                artifact_path=artifact_path,
                ollama_model_name=ollama_model_name,
                final_loss=final_loss,
                metrics_json=_dump(metrics or {}),
                created_at=_utcnow(),
                updated_at=_utcnow(),
                exported_at=exported_at,
            )
        else:
            record.job_id = job_id
            record.name = name
            record.base_model = base_model
            record.method = method
            record.status = status
            record.export_format = export_format
            record.export_status = export_status
            record.artifact_path = artifact_path
            record.ollama_model_name = ollama_model_name
            record.final_loss = final_loss
            record.metrics_json = _dump(metrics or _load(record.metrics_json, {}))
            record.exported_at = exported_at or record.exported_at
            record.updated_at = _utcnow()
        merged = session.merge(record)
        session.commit()
        session.refresh(merged)
        return merged


def list_model_records() -> list[FineTunedModelRecord]:
    with db_session() as session:
        return list(session.exec(select(FineTunedModelRecord).order_by(FineTunedModelRecord.created_at.desc())))


def get_model_record(model_id: str) -> FineTunedModelRecord | None:
    with db_session() as session:
        return session.get(FineTunedModelRecord, model_id)


def save_export_artifact(record: ExportArtifactRecord) -> ExportArtifactRecord:
    record.updated_at = _utcnow()
    with db_session() as session:
        merged = session.merge(record)
        session.commit()
        session.refresh(merged)
        return merged


def upsert_export_artifact(
    *,
    artifact_id: str,
    job_id: str,
    model_id: str | None,
    export_format: str,
    export_status: str,
    source_path: str,
    target_path: str | None,
    ollama_model_name: str | None,
    error_message: str | None,
    completed_at: datetime | None,
) -> ExportArtifactRecord:
    with db_session() as session:
        record = session.get(ExportArtifactRecord, artifact_id)
        if record is None:
            record = ExportArtifactRecord(
                id=artifact_id,
                job_id=job_id,
                model_id=model_id,
                export_format=export_format,
                export_status=export_status,
                source_path=source_path,
                target_path=target_path,
                ollama_model_name=ollama_model_name,
                error_message=error_message,
                created_at=_utcnow(),
                updated_at=_utcnow(),
                completed_at=completed_at,
            )
        else:
            record.job_id = job_id
            record.model_id = model_id
            record.export_format = export_format
            record.export_status = export_status
            record.source_path = source_path
            record.target_path = target_path
            record.ollama_model_name = ollama_model_name
            record.error_message = error_message
            record.completed_at = completed_at or record.completed_at
            record.updated_at = _utcnow()
        session.merge(record)
        session.commit()
        session.refresh(record)
        return record


def get_export_artifact(artifact_id: str) -> ExportArtifactRecord | None:
    with db_session() as session:
        return session.get(ExportArtifactRecord, artifact_id)


def list_export_artifacts(job_id: str | None = None) -> list[ExportArtifactRecord]:
    with db_session() as session:
        statement = select(ExportArtifactRecord).order_by(ExportArtifactRecord.created_at.desc())
        if job_id:
            statement = statement.where(ExportArtifactRecord.job_id == job_id)
        return list(session.exec(statement))


def record_system_event(kind: str, message: str, level: str = "INFO", payload: dict[str, Any] | None = None) -> SystemEventRecord:
    record = SystemEventRecord(
        id=f"evt-{int(datetime.now(timezone.utc).timestamp() * 1000)}",
        kind=kind,
        level=level,
        message=message,
        payload_json=_dump(payload or {}),
    )
    with db_session() as session:
        session.merge(record)
        session.commit()
    return record


def recover_incomplete_jobs() -> int:
    """Mark leftover live jobs as interrupted after a restart."""
    affected = 0
    with db_session() as session:
        jobs = session.exec(
            select(TrainingJobRecord).where(TrainingJobRecord.status.in_(["queued", "preparing", "running", "training"]))
        ).all()
        for job in jobs:
            job.status = "failed"
            job.error_message = "Forge backend restarted before training completed."
            job.completed_at = _utcnow()
            job.updated_at = _utcnow()
            session.add(job)
            affected += 1
        session.commit()
    if affected:
        record_system_event("startup", f"Recovered {affected} interrupted training job(s)", level="WARNING")
    return affected


def bootstrap_summary(db_ready: bool) -> dict[str, Any]:
    return {
        "db_ready": db_ready,
        "datasets": len(list_dataset_records()),
        "jobs": len(list_training_job_records()),
        "models": len(list_model_records()),
        "artifacts": len(list_export_artifacts()),
    }
