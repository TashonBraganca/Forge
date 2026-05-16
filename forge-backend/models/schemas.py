"""All Pydantic v2 schemas for the Forge backend."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


# ── Hardware ──────────────────────────────────────────────────

class HardwareStats(BaseModel):
    # Connectivity
    ollama_running: bool = False
    llamafactory_available: bool = False

    # GPU
    cuda_available: bool = False
    metal_available: bool = False
    gpu_name: str | None = None
    vram_total_gb: float = 0.0
    vram_free_gb: float = 0.0
    gpu_util_percent: float = 0.0   # 0-100, real-time
    gpu_temp_c: float = 0.0         # Celsius, real-time

    # CPU
    cpu_name: str = ""
    cpu_cores: int = 0
    cpu_threads: int = 0
    cpu_percent: float = 0.0        # real-time utilisation

    # RAM
    ram_total_gb: float = 0.0
    ram_free_gb: float = 0.0
    ram_percent: float = 0.0        # real-time utilisation

    # Disk
    disk_total_gb: float = 0.0
    disk_free_gb: float = 0.0

    # System
    platform: str = ""
    forge_version: str = "1.0.0"
    db_ready: bool = False
    database_path: str = ""
    datasets_dir_ready: bool = False
    models_dir_ready: bool = False
    jobs_dir_ready: bool = False
    training_backend_available: bool = False
    simulation_fallback_available: bool = True


# ── Models ────────────────────────────────────────────────────

class ModelInfo(BaseModel):
    id: str
    name: str
    family: str = ""
    size_gb: float = 0.0
    vram_required_gb: float = 0.0
    quantization: str = ""
    context_length: int = 2048
    is_installed: bool = False
    source: Literal["ollama", "huggingface"] = "ollama"
    tags: list[str] = []


# ── Datasets ──────────────────────────────────────────────────

class ValidationIssue(BaseModel):
    row_index: int
    field: str
    message: str


class DatasetMeta(BaseModel):
    id: str
    filename: str
    format: Literal["alpaca", "sharegpt", "unknown"] = "unknown"
    rows: int = 0
    valid_rows: int = 0
    file_path: str = ""
    size_bytes: int = 0
    columns: list[str] = Field(default_factory=list)
    validation_status: Literal["pending", "valid", "invalid", "unknown"] = "unknown"
    preview_rows: list[dict] = Field(default_factory=list)
    source: str = "upload"
    validation_message: str | None = None
    issues: list[ValidationIssue] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ── Training ──────────────────────────────────────────────────

class TrainingConfig(BaseModel):
    model_name: str
    dataset_id: str
    method: Literal["lora", "qlora", "full"] = "qlora"
    lora_rank: int = 16
    lora_alpha: int = 32
    lora_dropout: float = 0.05
    target_modules: list[str] = ["q_proj", "v_proj"]
    epochs: int = 3
    learning_rate: float = 5e-5
    batch_size: int = 2
    max_length: int = 2048
    output_dir: str = ""


class TrainingJob(BaseModel):
    job_id: str
    status: Literal["queued", "preparing", "training", "running", "complete", "failed", "cancelled"] = "queued"
    config: TrainingConfig
    created_at: datetime = Field(default_factory=datetime.utcnow)
    started_at: datetime | None = None
    completed_at: datetime | None = None
    current_step: int = 0
    total_steps: int = 0
    progress: float = 0.0
    current_epoch: int = 0
    current_loss: float | None = None
    final_loss: float | None = None
    output_model_path: str | None = None
    simulation_mode: bool = False
    error_message: str | None = None
    loss_history: list[float] = Field(default_factory=list)
    latest_logs: list[str] = Field(default_factory=list)
    export_status: Literal["not_started", "pending", "running", "completed", "failed"] = "not_started"
    export_model_name: str | None = None


class TrainingEvent(BaseModel):
    type: Literal["log", "metrics", "progress", "complete", "error"] = "log"
    step: int | None = None
    total_steps: int | None = None
    loss: float | None = None
    lr: float | None = None
    grad_norm: float | None = None
    epoch: float | None = None
    eta_seconds: int | None = None
    message: str | None = None
    level: Literal["INFO", "WARNING", "ERROR"] | None = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class TrainingStartResponse(BaseModel):
    job_id: str | None = None
    mode: Literal["live", "simulation", "disabled"] = "live"
    message: str | None = None


class FineTunedModelInfo(BaseModel):
    id: str
    job_id: str
    name: str
    base_model: str
    method: Literal["lora", "qlora", "full"] = "lora"
    status: str = "trained"
    export_format: str = "adapter"
    export_status: str = "pending"
    artifact_path: str = ""
    ollama_model_name: str | None = None
    final_loss: float | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    exported_at: datetime | None = None


class ExportArtifactInfo(BaseModel):
    id: str
    job_id: str
    model_id: str | None = None
    export_format: str = "adapter"
    export_status: str = "pending"
    source_path: str = ""
    target_path: str | None = None
    ollama_model_name: str | None = None
    error_message: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: datetime | None = None


# ── Chat ──────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    model: str
    messages: list[dict[str, str]]
    temperature: float = 0.7
    max_tokens: int = 2048
    system: str | None = None


class ChatToken(BaseModel):
    token: str = ""
    done: bool = False
