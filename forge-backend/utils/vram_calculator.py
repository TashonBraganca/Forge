"""Estimate VRAM requirements for a given model + training configuration."""

from __future__ import annotations


def estimate_vram_gb(
    model_size_gb: float,
    method: str,
    batch_size: int,
    max_length: int,
) -> float:
    """Return estimated VRAM in GB needed for training.

    Args:
        model_size_gb: Size of the base model weights file in GB.
        method: Training method — 'qlora', 'lora', or 'full'.
        batch_size: Per-device batch size.
        max_length: Maximum sequence length (tokens).

    Returns:
        Estimated VRAM requirement in GB, rounded to 2 decimal places.
    """
    # Base model memory in VRAM
    if method == "qlora":
        # 4-bit quantized base ≈ 27% of fp16 size, plus LoRA adapters in fp16
        base = model_size_gb * 0.27
        lora_overhead = model_size_gb * 0.02
        base += lora_overhead
    elif method == "lora":
        # LoRA: base in fp16, optimizer states only for adapter params (~4%)
        optimizer_overhead = model_size_gb * 0.04
        base = model_size_gb + optimizer_overhead
    else:
        # Full fine-tune: model + Adam optimizer states (2×) + gradients
        base = model_size_gb * 4.0

    # Activation memory estimate:
    # ~0.5 GB per batch element per 2K sequence for a 7B model, scaled linearly
    activation_overhead = (batch_size * max_length / 2048) * (model_size_gb / 7.0) * 0.5

    # 0.5 GB runtime overhead (CUDA context, etc.)
    runtime_overhead = 0.5

    return round(base + activation_overhead + runtime_overhead, 2)
