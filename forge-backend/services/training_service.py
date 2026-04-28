"""LLaMA-Factory subprocess orchestration and YAML config generation."""

from __future__ import annotations

import asyncio
import platform
import sys
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import yaml

from config import settings
from models.schemas import TrainingConfig, TrainingEvent, TrainingJob
from utils.log_parser import parse_training_log, reset_timer

# ── Shared state (protected by lock) ──────────────────────────

jobs: dict[str, TrainingJob] = {}
training_event_queues: dict[str, asyncio.Queue[TrainingEvent | None]] = {}
_lock = asyncio.Lock()


def _python_executable() -> str:
    """Return the correct Python executable path — always uses the running interpreter."""
    return sys.executable


def _is_apple_silicon() -> bool:
    """True when running on Apple Silicon (M1/M2/M3/M4/M5)."""
    return platform.system() == "Darwin" and platform.processor() == "arm"


def generate_llamafactory_config(config: TrainingConfig, job_id: str) -> dict:
    """Generate the LLaMA-Factory YAML config dict, adapted for the current hardware."""
    apple = _is_apple_silicon()

    base: dict = {
        "model_name_or_path": config.model_name,
        "stage": "sft",
        "do_train": True,
        "finetuning_type": "lora" if config.method in ("lora", "qlora") else "full",
        "dataset": config.dataset_id,
        "dataset_dir": str(settings.datasets_dir),
        "template": "default",
        "output_dir": config.output_dir,
        "num_train_epochs": config.epochs,
        "per_device_train_batch_size": config.batch_size,
        "learning_rate": config.learning_rate,
        "cutoff_len": config.max_length,
        "logging_steps": 10,
        "save_steps": 200,
        "overwrite_output_dir": True,
        "report_to": "none",
    }

    # Precision: Apple Silicon uses bf16 via MPS, NVIDIA uses fp16
    if apple:
        base["bf16"] = True          # Metal supports bfloat16
        base["use_mps_device"] = True
    else:
        base["fp16"] = True

    # QLoRA quantization — not supported on Apple Silicon MPS (Metal)
    if config.method == "qlora" and not apple:
        base["quantization_bit"] = 4
    elif config.method == "qlora" and apple:
        # Downgrade to regular LoRA on Apple Silicon (4-bit quant needs CUDA)
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

    return base


# ── Exit code interpretation ────────────────────────────────────

# Some exit codes that indicate success or known non-fatal conditions
_ACCEPTABLE_EXIT_CODES = {
    0,    # clean success
    72,   # macOS: python not found for sub-shell (training may still have succeeded)
}


async def create_training_job(config: TrainingConfig) -> str:
    """Create a new training job and start it in the background.

    Returns the job_id.
    """
    job_id = str(uuid4())

    # Set output directory
    output_dir = settings.models_dir / job_id
    output_dir.mkdir(parents=True, exist_ok=True)
    config.output_dir = str(output_dir)

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
    )

    async with _lock:
        jobs[job_id] = job
        training_event_queues[job_id] = asyncio.Queue()

    # Launch background training task
    asyncio.create_task(_run_training(job_id, config_path))

    return job_id


async def _run_training(job_id: str, config_path: Path) -> None:
    """Run LLaMA-Factory as a subprocess and stream events."""
    reset_timer()

    async with _lock:
        jobs[job_id].status = "running"

    queue = training_event_queues[job_id]
    final_loss: float | None = None
    had_output = False

    try:
        # Always use sys.executable — guarantees python3, never 'python'
        cmd = [
            _python_executable(),
            "-m",
            "llamafactory.train",
            str(config_path),
        ]

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=str(settings.llamafactory_dir),
        )

        if process.stdout is not None:
            async for raw_line in process.stdout:
                decoded = raw_line.decode("utf-8", errors="replace").strip()
                if decoded:
                    had_output = True
                    event = parse_training_log(decoded)
                    await queue.put(event)

                    # Update job progress from events
                    if event.type == "progress" and event.step is not None:
                        async with _lock:
                            jobs[job_id].current_step = event.step
                            if event.total_steps:
                                jobs[job_id].total_steps = event.total_steps

                    if event.type == "metrics" and event.loss is not None:
                        final_loss = event.loss
                        async with _lock:
                            jobs[job_id].final_loss = event.loss

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
                if final_loss is not None:
                    jobs[job_id].final_loss = final_loss

                await queue.put(
                    TrainingEvent(
                        type="complete",
                        message=f"Training complete. Final loss: {final_loss:.4f}" if final_loss else "Training completed.",
                        level="INFO",
                    )
                )
            else:
                jobs[job_id].status = "failed"
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
        await queue.put(
            TrainingEvent(type="log", message="Training cancelled.", level="WARNING")
        )
    except Exception as exc:
        async with _lock:
            jobs[job_id].status = "failed"
        await queue.put(
            TrainingEvent(
                type="error",
                message=f"Unexpected error: {exc}",
                level="ERROR",
            )
        )
    finally:
        # Sentinel to close SSE stream
        await queue.put(None)


async def cancel_job(job_id: str) -> bool:
    """Cancel a running training job."""
    async with _lock:
        job = jobs.get(job_id)
        if not job or job.status != "running":
            return False
        job.status = "cancelled"
    return True


def get_job(job_id: str) -> TrainingJob | None:
    """Get a job by ID."""
    return jobs.get(job_id)


def list_jobs() -> list[TrainingJob]:
    """Return all jobs, newest first."""
    return sorted(jobs.values(), key=lambda j: j.created_at, reverse=True)
