"""LLaMA-Factory subprocess orchestration and YAML config generation."""

from __future__ import annotations

import asyncio
import logging
import os
import platform
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import yaml

from config import settings
from models.schemas import FineTunedModelInfo, TrainingConfig, TrainingEvent, TrainingJob
from services.persistence import (
    FineTunedModelRecord,
    TrainingJobRecord,
    get_training_job_record,
    list_training_job_records,
    model_record_to_info,
    save_model_record,
    save_training_job_record,
    training_record_to_job,
    update_training_job_record,
    upsert_model_record,
)
from services.ollama_service import resolve_hf_model_name, resolve_chat_template, preflight_model_check
from utils.log_parser import parse_training_log, reset_timer

logger = logging.getLogger("forge.training")

# ── Shared state (protected by lock) ──────────────────────────

jobs: dict[str, TrainingJob] = {}
training_event_queues: dict[str, asyncio.Queue[TrainingEvent | None]] = {}
training_tasks: dict[str, asyncio.Task[None]] = {}
training_processes: dict[str, asyncio.subprocess.Process] = {}
_lock = asyncio.Lock()


def _python_executable() -> str:
    """Return the correct Python executable path — always uses the running interpreter."""
    return sys.executable


def _training_env() -> dict[str, str]:
    """Return subprocess env vars that keep LLaMA-Factory from importing TensorFlow.

    Also injects the HuggingFace token for gated model access.
    """
    env = os.environ.copy()
    env.setdefault("TRANSFORMERS_NO_TF", "1")
    env.setdefault("USE_TF", "0")
    env.setdefault("TRANSFORMERS_NO_FLAX", "1")
    env.setdefault("TOKENIZERS_PARALLELISM", "false")
    # Prevent torchao import crash with incompatible torch versions
    env.setdefault("TRANSFORMERS_NO_TORCHAO", "1")
    # Suppress noisy pynvml / future warnings
    env.setdefault("PYTHONWARNINGS", "ignore")

    # Inject HuggingFace token for gated model access
    hf_token = settings.huggingface_token
    if hf_token:
        env["HF_TOKEN"] = hf_token
        env["HUGGING_FACE_HUB_TOKEN"] = hf_token
        logger.info("[ENV] HF_TOKEN injected into training environment")
    else:
        logger.info("[ENV] No HF_TOKEN configured — gated models will fail")

    # Force unbuffered output so tqdm and metrics lines flush immediately
    env["PYTHONUNBUFFERED"] = "1"

    # Prevent MPS "command buffer exited with error status" on Apple Silicon
    # by disabling the memory watermark limit so PyTorch can use all available memory
    env.setdefault("PYTORCH_MPS_HIGH_WATERMARK_RATIO", "0.0")

    return env


def _llamafactory_cli() -> str:
    """Locate the installed LLaMA-Factory CLI binary if it is available."""
    cli = shutil.which("llamafactory-cli")
    if cli:
        return cli
    return "llamafactory-cli"


def _is_apple_silicon() -> bool:
    """True when running on Apple Silicon (M1/M2/M3/M4/M5)."""
    return platform.system() == "Darwin" and platform.processor() == "arm"


def generate_llamafactory_config(config: TrainingConfig, job_id: str) -> dict:
    """Generate the LLaMA-Factory YAML config dict, adapted for the current hardware.

    IMPORTANT: Ollama model names (e.g. 'tinyllama:latest') contain colons which are
    invalid HuggingFace repo IDs. We resolve them to the correct HF repo ID here.
    """
    apple = _is_apple_silicon()

    # ── Resolve Ollama name → HuggingFace repo ID ──────────────
    original_name = config.model_name
    hf_model_path = resolve_hf_model_name(original_name)
    chat_template = resolve_chat_template(original_name)

    logger.info(
        "[CONFIG] Generating LLaMA-Factory config for job %s:\n"
        "  Original model name: %s\n"
        "  Resolved HF path:    %s\n"
        "  Chat template:       %s\n"
        "  Method:              %s\n"
        "  Dataset:             %s\n"
        "  Epochs:              %d\n"
        "  Batch size:          %d\n"
        "  Learning rate:       %s\n"
        "  Apple Silicon:       %s",
        job_id, original_name, hf_model_path, chat_template,
        config.method, config.dataset_id, config.epochs,
        config.batch_size, config.learning_rate, apple,
    )

    base: dict = {
        "model_name_or_path": hf_model_path,
        "stage": "sft",
        "do_train": True,
        "finetuning_type": "lora" if config.method in ("lora", "qlora") else "full",
        "dataset": config.dataset_id,
        "dataset_dir": str(settings.datasets_dir),
        "template": chat_template,
        "output_dir": config.output_dir,
        "num_train_epochs": config.epochs,
        "per_device_train_batch_size": config.batch_size,
        "learning_rate": config.learning_rate,
        "cutoff_len": config.max_length,
        "save_steps": 200,
        "overwrite_output_dir": True,
        "max_grad_norm": 1.0,
        "report_to": "none",
        # Stability: gradient clipping + warmup prevent explosions on small models
        "max_grad_norm": 1.0,
        # warmup_ratio is deprecated in transformers >=5.2 — use warmup_steps
        "warmup_steps": max(1, int((30 / config.batch_size) * config.epochs * 0.1)),
        "lr_scheduler_type": "cosine",
    }

    # Dynamic logging frequency — log every step for small jobs, every 10 for large
    # Total steps ≈ (num_examples / batch_size) * epochs
    estimated_steps = max(1, int((30 / config.batch_size) * config.epochs))  # rough estimate
    logging_steps = 1 if estimated_steps <= 50 else 5 if estimated_steps <= 200 else 10
    base["logging_steps"] = logging_steps
    logger.info("[CONFIG] logging_steps=%d (estimated %d total steps)", logging_steps, estimated_steps)

    # Precision: Apple Silicon MPS does NOT properly support bf16 training
    # (causes loss=0 and grad_norm=NaN). Default (no flag) = fp32.
    if not apple:
        base["fp16"] = True
    # On Apple Silicon: fp32 is used by default (no flag needed)

    # QLoRA quantization — not supported on Apple Silicon MPS (Metal)
    if config.method == "qlora" and not apple:
        base["quantization_bit"] = 4
    elif config.method == "qlora" and apple:
        # Downgrade to regular LoRA on Apple Silicon (4-bit quant needs CUDA)
        logger.info("[CONFIG] QLoRA not supported on Apple Silicon — downgrading to LoRA")
        base["finetuning_type"] = "lora"

    if config.method in ("lora", "qlora"):
        base.update(
            {
                "lora_rank": config.lora_rank,
                "lora_alpha": config.lora_alpha,
                "lora_dropout": config.lora_dropout,
                "lora_target": ",".join(config.target_modules),
            }
        )

    logger.info("[CONFIG] Final YAML config keys: %s", list(base.keys()))
    return base


def _append_log(job: TrainingJob, message: str) -> None:
    job.latest_logs = (job.latest_logs + [message])[-50:]


def _persist_job(job: TrainingJob) -> None:
    save_training_job_record(job)


def _sync_live_job(job_id: str, **patch: object) -> TrainingJob | None:
    job = jobs.get(job_id)
    if not job:
        record = get_training_job_record(job_id)
        if not record:
            return None
        job = training_record_to_job(record)
        jobs[job_id] = job

    for key, value in patch.items():
        if hasattr(job, key):
            setattr(job, key, value)

    job.config.output_dir = job.config.output_dir or patch.get("output_dir", job.config.output_dir)
    _persist_job(job)
    return job


def _register_finetuned_model(job: TrainingJob) -> None:
    model_id = f"ft-{job.job_id[:8]}"
    name = f"forge-{job.config.model_name.replace('/', '-')}"
    upsert_model_record(
        model_id=model_id,
        job_id=job.job_id,
        name=name,
        base_model=job.config.model_name,
        method=job.config.method,
        status="trained" if job.export_status != "completed" else "ready",
        export_format="adapter",
        export_status=job.export_status,
        artifact_path=job.config.output_dir,
        ollama_model_name=job.output_model_path,
        final_loss=job.final_loss,
        metrics={
            "progress": job.progress,
            "steps": job.total_steps,
            "epochs": job.config.epochs,
        },
        exported_at=job.completed_at,
    )


async def _enqueue_event(job_id: str, event: TrainingEvent) -> None:
    queue = training_event_queues.get(job_id)
    if queue:
        await queue.put(event)


async def _finalize_job(job_id: str, status: str, message: str, error: str | None = None) -> None:
    job = jobs.get(job_id)
    if not job:
        return
    job.status = status  # type: ignore[assignment]
    job.completed_at = datetime.now(timezone.utc)
    job.error_message = error
    if message:
        _append_log(job, message)
    _persist_job(job)


def is_training_backend_available() -> bool:
    return settings.llamafactory_dir.exists()


# ── Exit code interpretation ────────────────────────────────────

# Some exit codes that indicate success or known non-fatal conditions
_ACCEPTABLE_EXIT_CODES = {
    0,    # clean success
    72,   # macOS: python not found for sub-shell (training may still have succeeded)
}


def _validate_dataset(dataset_id: str) -> tuple[bool, str]:
    """Validate that a dataset exists and is registered in dataset_info.json.

    Returns (ok, message).
    """
    import json

    datasets_dir = settings.datasets_dir
    info_path = datasets_dir / "dataset_info.json"

    if not info_path.exists():
        return False, f"dataset_info.json not found at {info_path}. Upload a dataset first."

    try:
        with info_path.open("r") as f:
            registry = json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        return False, f"Failed to read dataset_info.json: {e}"

    if dataset_id not in registry:
        return False, (
            f"Dataset '{dataset_id}' not found in dataset_info.json. "
            f"Available datasets: {list(registry.keys())}"
        )

    entry = registry[dataset_id]
    file_name = entry.get("file_name", "")
    file_path = datasets_dir / file_name

    if not file_path.exists():
        return False, f"Dataset file '{file_name}' not found at {file_path}"

    logger.info(
        "[PREFLIGHT] Dataset validated: id=%s file=%s format=%s",
        dataset_id, file_name, entry.get("formatting", "unknown"),
    )
    return True, f"Dataset '{dataset_id}' validated ({file_name})"


async def create_training_job(config: TrainingConfig) -> str:
    """Create a new training job and start it in the background.

    Runs pre-flight checks on the model and dataset before starting.
    Returns the job_id.
    """
    job_id = str(uuid4())

    # ── Pre-flight: Model check ────────────────────────────────
    model_check = preflight_model_check(config.model_name, settings.huggingface_token)
    logger.info(
        "[PREFLIGHT] Model result: ok=%s hf_repo=%s gated=%s cached=%s msg=%s",
        model_check["ok"], model_check["hf_repo"],
        model_check["is_gated"], model_check["is_cached"],
        model_check.get("message"),
    )

    # ── Pre-flight: Dataset check ──────────────────────────────
    ds_ok, ds_msg = _validate_dataset(config.dataset_id)
    logger.info("[PREFLIGHT] Dataset result: ok=%s msg=%s", ds_ok, ds_msg)

    # Set output directory
    output_dir = settings.models_dir / job_id
    output_dir.mkdir(parents=True, exist_ok=True)
    config.output_dir = str(output_dir)

    simulation_mode = not is_training_backend_available()

    # Generate LLaMA-Factory YAML config
    job_dir = settings.jobs_dir / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    config_path = job_dir / "config.yaml"

    yaml_config = generate_llamafactory_config(config, job_id)
    with config_path.open("w") as f:
        yaml.dump(yaml_config, f, default_flow_style=False)

    # Create the job record
    job = TrainingJob(
        job_id=job_id,
        status="queued",
        config=config,
        created_at=datetime.now(timezone.utc),
        current_epoch=0,
        progress=0.0,
        simulation_mode=simulation_mode,
        export_status="pending",
    )

    async with _lock:
        jobs[job_id] = job
        training_event_queues[job_id] = asyncio.Queue()

    _persist_job(job)

    # ── Fail fast on pre-flight failures ───────────────────────
    preflight_errors: list[str] = []
    if not model_check["ok"]:
        preflight_errors.append(model_check["message"])
    if not ds_ok:
        preflight_errors.append(ds_msg)

    if preflight_errors:
        error_msg = " | ".join(preflight_errors)
        logger.error("[PREFLIGHT] Training blocked: %s", error_msg)

        async with _lock:
            job.status = "failed"
            job.error_message = error_msg
            _append_log(job, f"[PREFLIGHT FAILED] {error_msg}")
            _persist_job(job)

        queue = training_event_queues[job_id]
        await queue.put(TrainingEvent(
            type="error",
            message=error_msg,
            level="ERROR",
        ))
        await queue.put(None)  # Sentinel to close SSE
        return job_id

    # Log pre-flight success info
    if model_check.get("message"):
        async with _lock:
            _append_log(job, f"[PREFLIGHT] {model_check['message']}")
            _persist_job(job)

    # Launch background training task
    task = asyncio.create_task(_run_training(job_id, config_path, simulation_mode))
    training_tasks[job_id] = task

    return job_id


async def _emit_progress(job_id: str, event: TrainingEvent, log_text: str | None = None) -> None:
    async with _lock:
        job = jobs.get(job_id)
        if job and log_text:
            _append_log(job, log_text)
            _persist_job(job)
    await _enqueue_event(job_id, event)


def _update_job_from_event(job: TrainingJob, event: TrainingEvent) -> None:
    """Update a job's state based on a parsed training event.

    Centralizes all the step/loss/epoch tracking logic.
    """
    if event.type == "progress" and event.step is not None:
        job.current_step = event.step
        if event.total_steps:
            job.total_steps = event.total_steps
        if event.total_steps and event.step > 0:
            job.progress = round((event.step / event.total_steps) * 100, 2)
        if job.total_steps > 0 and event.step > 0:
            job.current_epoch = min(
                job.config.epochs,
                max(1, int((job.current_step / job.total_steps) * job.config.epochs) + 1),
            )

    if event.type == "metrics" and event.loss is not None:
        job.final_loss = event.loss
        job.current_loss = event.loss
        job.loss_history = (job.loss_history + [event.loss])[-300:]


async def _run_simulation_training(job_id: str) -> None:
    """Backend-driven simulation mode that still persists state."""
    reset_timer()
    async with _lock:
        job = jobs[job_id]
        job.status = "preparing"
        job.started_at = datetime.now(timezone.utc)
        _persist_job(job)

    await _enqueue_event(job_id, TrainingEvent(type="log", message="Simulation mode enabled.", level="WARNING"))
    await asyncio.sleep(0.5)

    steps = 240
    total_epochs = jobs[job_id].config.epochs
    loss = 1.6

    async with _lock:
        job = jobs[job_id]
        job.status = "training"
        job.total_steps = steps
        job.total_epochs = total_epochs
        job.current_epoch = 1
        _persist_job(job)

    for step in range(1, steps + 1):
        try:
            await asyncio.sleep(0.08)
        except asyncio.CancelledError:
            async with _lock:
                job = jobs[job_id]
                job.status = "cancelled"
                job.error_message = "Cancelled by user."
                _persist_job(job)
            await _enqueue_event(job_id, TrainingEvent(type="log", message="Training cancelled.", level="WARNING"))
            raise

        loss = max(0.22, loss - 0.004 - (0.004 * (step % 3) / 3))
        progress = round((step / steps) * 100, 2)
        epoch = min(total_epochs, max(1, int((step / steps) * total_epochs) + 1))

        async with _lock:
          job = jobs[job_id]
          job.status = "training"
          job.progress = progress
          job.current_step = step
          job.total_steps = steps
          job.current_epoch = epoch
          job.current_loss = loss
          job.final_loss = loss
          job.loss_history = (job.loss_history + [loss])[-300:]
          _append_log(job, f"[SIM] step {step}/{steps} loss={loss:.4f}")
          _persist_job(job)

        await _enqueue_event(
            job_id,
            TrainingEvent(
                type="progress",
                step=step,
                total_steps=steps,
                loss=loss,
                message=f"Step {step}/{steps}",
                level="INFO",
            ),
        )

    async with _lock:
        job = jobs[job_id]
        job.status = "complete"
        job.completed_at = datetime.now(timezone.utc)
        job.progress = 100.0
        job.export_status = "pending"
        _persist_job(job)
        _register_finetuned_model(job)

    await _enqueue_event(job_id, TrainingEvent(type="complete", message="Simulation training complete.", level="INFO"))


async def _run_training(job_id: str, config_path: Path, simulation_mode: bool) -> None:
    """Run LLaMA-Factory as a subprocess and stream events."""
    reset_timer()

    async with _lock:
        jobs[job_id].status = "preparing"
        jobs[job_id].started_at = datetime.now(timezone.utc)
        _persist_job(jobs[job_id])

    if simulation_mode:
        await _run_simulation_training(job_id)
        return

    async with _lock:
        jobs[job_id].status = "training"
        _persist_job(jobs[job_id])

    queue = training_event_queues[job_id]
    final_loss: float | None = None
    had_output = False
    process: asyncio.subprocess.Process | None = None

    try:
        # Use the real CLI entrypoint and disable TensorFlow imports in transformers.
        cmd = [
            _python_executable(),
            "-m",
            "llamafactory.cli",
            "train",
            str(config_path),
        ]

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=str(settings.llamafactory_dir),
            env=_training_env(),
        )
        training_processes[job_id] = process
        logger.info("[TRAINING] Subprocess started (PID %s) for job %s", process.pid, job_id)

        if process.stdout is not None:
            # Read stdout in chunks to handle both \n and \r (tqdm progress bars)
            buffer = b""
            while True:
                chunk = await process.stdout.read(4096)
                if not chunk:
                    # Process EOF — handle any remaining buffer
                    if buffer:
                        for part in buffer.decode("utf-8", errors="replace").split("\r"):
                            decoded = part.strip()
                            if decoded:
                                had_output = True
                                event = parse_training_log(decoded)
                                await queue.put(event)
                                async with _lock:
                                    job = jobs[job_id]
                                    _append_log(job, decoded)
                                    _update_job_from_event(job, event)
                                    if event.type == "metrics" and event.loss is not None:
                                        final_loss = event.loss
                                    _persist_job(job)
                    break

                buffer += chunk
                # Split on both \n and \r to catch tqdm progress bars
                # Process complete lines, keep incomplete ones in buffer
                text = buffer.decode("utf-8", errors="replace")
                lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
                # Last element is incomplete — keep in buffer
                buffer = lines[-1].encode("utf-8")
                for line_text in lines[:-1]:
                    decoded = line_text.strip()
                    if not decoded:
                        continue
                    had_output = True
                    event = parse_training_log(decoded)
                    await queue.put(event)
                    async with _lock:
                        job = jobs[job_id]
                        _append_log(job, decoded)
                        _update_job_from_event(job, event)
                        if event.type == "metrics" and event.loss is not None:
                            final_loss = event.loss
                        _persist_job(job)

        await process.wait()
        returncode = process.returncode

        # Determine success: exit 0 is clean, exit 72 on macOS is "python not found"
        # which happens AFTER training completes (post-processing shell calls).
        # If we had real output (loss values), treat it as success regardless.
        success = (returncode == 0) or (returncode in _ACCEPTABLE_EXIT_CODES and had_output and final_loss is not None)

        async with _lock:
            if success:
                jobs[job_id].status = "complete"
                jobs[job_id].completed_at = datetime.now(timezone.utc)
                jobs[job_id].progress = 100.0
                if final_loss is not None:
                    jobs[job_id].final_loss = final_loss
                jobs[job_id].export_status = "pending"
                _persist_job(jobs[job_id])
                _register_finetuned_model(jobs[job_id])

                await queue.put(
                    TrainingEvent(
                        type="complete",
                        message=f"Training complete. Final loss: {final_loss:.4f}" if final_loss else "Training completed.",
                        level="INFO",
                    )
                )
            else:
                jobs[job_id].status = "failed"
                jobs[job_id].error_message = f"Training exited with code {returncode}. Check logs above."
                _persist_job(jobs[job_id])
                await queue.put(
                    TrainingEvent(
                        type="error",
                        message=f"Training exited with code {returncode}. Check logs above.",
                        level="ERROR",
                    )
                )

    except FileNotFoundError as exc:
        async with _lock:
            jobs[job_id].status = "failed"
            jobs[job_id].error_message = str(exc)
            _persist_job(jobs[job_id])
        await queue.put(
            TrainingEvent(
                type="error",
                message=f"Could not start training: {exc}. LLaMA-Factory may not be installed correctly.",
                level="ERROR",
            )
        )
    except asyncio.CancelledError:
        async with _lock:
            jobs[job_id].status = "cancelled"
            jobs[job_id].error_message = "Cancelled by user."
            _persist_job(jobs[job_id])
        await queue.put(
            TrainingEvent(type="log", message="Training cancelled.", level="WARNING")
        )
    except Exception as exc:
        async with _lock:
            jobs[job_id].status = "failed"
            jobs[job_id].error_message = str(exc)
            _persist_job(jobs[job_id])
        await queue.put(
            TrainingEvent(
                type="error",
                message=f"Unexpected error: {exc}",
                level="ERROR",
            )
        )
    finally:
        training_tasks.pop(job_id, None)
        training_processes.pop(job_id, None)
        # Sentinel to close SSE stream
        await queue.put(None)


async def cancel_job(job_id: str) -> bool:
    """Cancel a running training job."""
    async with _lock:
        job = jobs.get(job_id)
        if not job or job.status not in {"queued", "preparing", "training"}:
            return False
        job.status = "cancelled"
        job.error_message = "Cancelled by user."
        _persist_job(job)

    task = training_tasks.get(job_id)
    if task:
        task.cancel()
    process = training_processes.get(job_id)
    if process and process.returncode is None:
        try:
            process.terminate()
        except ProcessLookupError:
            pass
    return True


def get_job(job_id: str) -> TrainingJob | None:
    """Get a job by ID."""
    if job_id in jobs:
        return jobs[job_id]
    record = get_training_job_record(job_id)
    if not record:
        return None
    job = training_record_to_job(record)
    jobs[job_id] = job
    return job


def list_jobs() -> list[TrainingJob]:
    """Return all jobs, newest first."""
    return [training_record_to_job(record) for record in list_training_job_records()]


def restore_runtime_jobs() -> None:
    """Warm the in-memory cache from persisted jobs."""
    for record in list_training_job_records():
        jobs[record.job_id] = training_record_to_job(record)
