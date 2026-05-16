"""Parse LLaMA-Factory stdout lines into structured TrainingEvent objects.

Handles three types of progress indicators from LLaMA-Factory / HF Trainer:
1. Metrics JSON: {'loss': 2.345, 'grad_norm': 0.123, ...}  — logged at every logging_steps
2. tqdm progress bars: 42%|████| 10/24 [01:30<02:00]       — stderr progress bar
3. Completion JSON: {'train_runtime': 120.5, 'train_loss': 1.23, ...}
"""

from __future__ import annotations

import json
import logging
import re
import time
from datetime import datetime, timezone

from models.schemas import TrainingEvent

logger = logging.getLogger("forge.log_parser")

# ── Regex patterns ────────────────────────────────────────────────

# Metrics JSON: {'loss': 2.345, 'grad_norm': 0.123, 'learning_rate': 2e-4, 'epoch': 0.5}
_METRICS_JSON_RE = re.compile(r"\{[^{}]*'loss'[^{}]*\}")

# Completion JSON: {'train_runtime': ..., 'train_loss': ...}
_COMPLETE_RE = re.compile(r"train_runtime")

# tqdm progress bar: 42%|████| 10/24 [01:30<02:00, 9.00s/it]
_TQDM_RE = re.compile(r"(\d+)%\|.*?\|\s*(\d+)/(\d+)\s*\[")

# HF Trainer step/total format: step 10/24 or just 10/24 in context
# Must be preceded by non-digit or start-of-line to avoid matching random fractions
_STEP_RE = re.compile(r"(?:^|\s)(\d+)/(\d+)(?:\s|$|\[)")

# Total optimization steps extraction from setup lines
_TOTAL_STEPS_RE = re.compile(r"Total optimization steps\s*=\s*(\d+)")

# Num examples extraction
_NUM_EXAMPLES_RE = re.compile(r"Num examples\s*=\s*(\d+)")

# Num epochs extraction
_NUM_EPOCHS_RE = re.compile(r"Num Epochs\s*=\s*(\d+)")

# Trainable params extraction
_TRAINABLE_PARAMS_RE = re.compile(r"trainable params:\s*([\d,]+)")

# Error detection — must be specific to avoid false positives from warnings & paths
_ERROR_RE = re.compile(
    r"(?:^Traceback \(most recent call last\):|RuntimeError:|CUDA Error:|"
    r"OutOfMemoryError:|OOM|fatal:|OSError: Failed to load)",
    re.IGNORECASE | re.MULTILINE,
)
# MPS buffer warnings are non-fatal on Apple Silicon — don't treat as errors
_MPS_BUFFER_RE = re.compile(r"command buffer exited with error status|Metal Performance Shaders", re.IGNORECASE)

# Warning detection
_WARNING_RE = re.compile(r"\[WARNING\||\bWarning\b|FutureWarning|UserWarning|DeprecationWarning", re.IGNORECASE)

_training_start_time: float | None = None
_total_steps_seen: int | None = None


def parse_training_log(line: str) -> TrainingEvent:
    """Parse a single line of LLaMA-Factory output into a TrainingEvent.

    Handles malformed lines gracefully — never raises.
    """
    global _training_start_time, _total_steps_seen

    now = datetime.now(timezone.utc)

    if not line.strip():
        return TrainingEvent(type="log", message="", level="INFO", timestamp=now)

    # ── Metrics JSON (loss, lr, grad_norm) ─────────────────────
    metrics_match = _METRICS_JSON_RE.search(line)
    if metrics_match:
        try:
            raw = metrics_match.group(0).replace("'", '"')
            data = json.loads(raw)
            loss = data.get("loss")
            lr = data.get("learning_rate")
            grad_norm = data.get("grad_norm")
            epoch = data.get("epoch")
            logger.info("[PARSER] Metrics: loss=%.4f lr=%s grad_norm=%s epoch=%s", float(loss or 0), lr, grad_norm, epoch)
            return TrainingEvent(
                type="metrics",
                loss=loss,
                lr=lr,
                grad_norm=grad_norm,
                epoch=epoch,
                message=line,
                level="INFO",
                timestamp=now,
            )
        except (json.JSONDecodeError, ValueError) as e:
            logger.warning("[PARSER] Failed to parse metrics JSON: %s — line: %s", e, line[:100])

    # ── Completion marker ──────────────────────────────────────
    if _COMPLETE_RE.search(line):
        logger.info("[PARSER] ✓ Completion marker detected")
        try:
            raw = _METRICS_JSON_RE.search(line)
            if raw:
                data = json.loads(raw.group(0).replace("'", '"'))
                train_loss = data.get("train_loss")
                logger.info("[PARSER] Final train_loss=%.4f", float(train_loss or 0))
                return TrainingEvent(
                    type="complete",
                    loss=train_loss,
                    message=line,
                    level="INFO",
                    timestamp=now,
                )
        except (json.JSONDecodeError, ValueError):
            pass
        return TrainingEvent(type="complete", message=line, level="INFO", timestamp=now)

    # ── Total optimization steps (from setup) ──────────────────
    total_match = _TOTAL_STEPS_RE.search(line)
    if total_match:
        _total_steps_seen = int(total_match.group(1))
        logger.info("[PARSER] Total optimization steps detected: %d", _total_steps_seen)
        return TrainingEvent(
            type="progress",
            step=0,
            total_steps=_total_steps_seen,
            message=line,
            level="INFO",
            timestamp=now,
        )

    # ── tqdm progress bar ──────────────────────────────────────
    tqdm_match = _TQDM_RE.search(line)
    if tqdm_match:
        _pct = int(tqdm_match.group(1))
        step = int(tqdm_match.group(2))
        total = int(tqdm_match.group(3))
        _total_steps_seen = total

        eta_seconds = _calc_eta(step, total)
        logger.info("[PARSER] tqdm progress: %d/%d (%d%%)", step, total, _pct)
        return TrainingEvent(
            type="progress",
            step=step,
            total_steps=total,
            eta_seconds=eta_seconds,
            message=line,
            level="INFO",
            timestamp=now,
        )

    # ── HF Trainer step/total ──────────────────────────────────
    # Only match if it looks like actual training progress (not "Num examples = 30")
    step_match = _STEP_RE.search(line)
    if step_match and "=" not in line and "Num" not in line:
        step = int(step_match.group(1))
        total = int(step_match.group(2))
        if total >= 2 and step <= total:
            _total_steps_seen = total
            eta_seconds = _calc_eta(step, total)
            logger.info("[PARSER] Step progress: %d/%d", step, total)
            return TrainingEvent(
                type="progress",
                step=step,
                total_steps=total,
                eta_seconds=eta_seconds,
                message=line,
                level="INFO",
                timestamp=now,
            )

    # ── Trainable params info ──────────────────────────────────
    params_match = _TRAINABLE_PARAMS_RE.search(line)
    if params_match:
        logger.info("[PARSER] Trainable params: %s", params_match.group(1))

    # ── Error detection ────────────────────────────────────────
    # Skip MPS buffer warnings — they are non-fatal on Apple Silicon
    if _ERROR_RE.search(line) and not _MPS_BUFFER_RE.search(line):
        logger.error("[PARSER] Error detected: %s", line[:200])
        return TrainingEvent(type="error", message=line, level="ERROR", timestamp=now)

    # ── Warning detection ──────────────────────────────────────
    if _WARNING_RE.search(line):
        return TrainingEvent(type="log", message=line, level="WARNING", timestamp=now)

    # ── Generic log line ───────────────────────────────────────
    return TrainingEvent(type="log", message=line, level="INFO", timestamp=now)


def _calc_eta(step: int, total: int) -> int | None:
    """Calculate ETA in seconds based on elapsed time and steps completed."""
    global _training_start_time
    if _training_start_time is not None and step > 0:
        elapsed = time.time() - _training_start_time
        remaining = total - step
        return int((elapsed / step) * remaining)
    elif step == 0:
        _training_start_time = time.time()
    return None


def reset_timer() -> None:
    """Reset the training start time and step counter for a new job."""
    global _training_start_time, _total_steps_seen
    _training_start_time = None
    _total_steps_seen = None
