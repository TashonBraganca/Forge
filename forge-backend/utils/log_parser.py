"""Parse LLaMA-Factory stdout lines into structured TrainingEvent objects."""

from __future__ import annotations

import json
import re
import time
from datetime import datetime, timezone

from models.schemas import TrainingEvent

# Pattern: {'loss': 2.345, 'grad_norm': 0.123, 'learning_rate': 2e-4, 'epoch': 0.5}
_METRICS_JSON_RE = re.compile(r"\{[^{}]*'loss'[^{}]*\}")

# Pattern: Step 100/812 or  100/812
_STEP_RE = re.compile(r"(\d+)\s*/\s*(\d+)")

# Pattern: train_runtime or train_loss (completion marker)
_COMPLETE_RE = re.compile(r"train_runtime")

# Pattern: error/traceback detection
_ERROR_RE = re.compile(r"(?:Error|error|Traceback|CUDA|OOM|RuntimeError)", re.IGNORECASE)

_training_start_time: float | None = None


def parse_training_log(line: str) -> TrainingEvent:
    """Parse a single line of LLaMA-Factory output into a TrainingEvent.

    Handles malformed lines gracefully — never raises.
    """
    global _training_start_time

    now = datetime.now(timezone.utc)

    if not line.strip():
        return TrainingEvent(type="log", message="", level="INFO", timestamp=now)

    # ── Metrics JSON (loss, lr, grad_norm) ─────────────────────
    metrics_match = _METRICS_JSON_RE.search(line)
    if metrics_match:
        try:
            # LLaMA-Factory uses single quotes in its dict repr — fix for JSON
            raw = metrics_match.group(0).replace("'", '"')
            data = json.loads(raw)
            return TrainingEvent(
                type="metrics",
                loss=data.get("loss"),
                lr=data.get("learning_rate"),
                grad_norm=data.get("grad_norm"),
                message=line,
                level="INFO",
                timestamp=now,
            )
        except (json.JSONDecodeError, ValueError):
            pass  # Fall through to other parsers

    # ── Completion marker ──────────────────────────────────────
    if _COMPLETE_RE.search(line):
        try:
            raw = _METRICS_JSON_RE.search(line)
            if raw:
                data = json.loads(raw.group(0).replace("'", '"'))
                return TrainingEvent(
                    type="complete",
                    loss=data.get("train_loss"),
                    message=line,
                    level="INFO",
                    timestamp=now,
                )
        except (json.JSONDecodeError, ValueError):
            pass
        return TrainingEvent(
            type="complete",
            message=line,
            level="INFO",
            timestamp=now,
        )

    # ── Step progress ──────────────────────────────────────────
    step_match = _STEP_RE.search(line)
    if step_match:
        step = int(step_match.group(1))
        total = int(step_match.group(2))

        eta_seconds: int | None = None
        if _training_start_time is not None and step > 0:
            elapsed = time.time() - _training_start_time
            remaining_steps = total - step
            time_per_step = elapsed / step
            eta_seconds = int(remaining_steps * time_per_step)
        else:
            _training_start_time = time.time()

        return TrainingEvent(
            type="progress",
            step=step,
            total_steps=total,
            eta_seconds=eta_seconds,
            message=line,
            level="INFO",
            timestamp=now,
        )

    # ── Error detection ────────────────────────────────────────
    if _ERROR_RE.search(line):
        return TrainingEvent(
            type="error",
            message=line,
            level="ERROR",
            timestamp=now,
        )

    # ── Generic log line ───────────────────────────────────────
    level: str = "WARNING" if "warn" in line.lower() else "INFO"
    return TrainingEvent(
        type="log",
        message=line,
        level=level,
        timestamp=now,
    )


def reset_timer() -> None:
    """Reset the training start time for a new job."""
    global _training_start_time
    _training_start_time = None
