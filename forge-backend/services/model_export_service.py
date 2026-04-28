"""Post-training model export: LoRA merge → GGUF conversion → Ollama registration."""

from __future__ import annotations

import asyncio
from pathlib import Path

import httpx

from config import settings
from services.training_service import jobs, _lock


async def _run_subprocess(cmd: list[str], cwd: Path | None = None) -> int:
    """Run a subprocess and return exit code."""
    process = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
        cwd=str(cwd) if cwd else None,
    )
    await process.wait()
    return process.returncode or 0


async def export_to_ollama(job_id: str) -> bool:
    """Merge LoRA weights, convert to GGUF, register with Ollama.

    Returns True on success, False on any failure.
    """
    async with _lock:
        job = jobs.get(job_id)
    if not job or job.status != "complete":
        return False

    output_dir = Path(job.config.output_dir)
    merged_dir = output_dir / "merged"
    gguf_output = output_dir / f"forge-{job_id[:8]}.gguf"

    # Step 1: Merge LoRA weights with base model
    merge_cmd = [
        "python",
        "-m",
        "llamafactory.export",
        "--model_name_or_path",
        job.config.model_name,
        "--adapter_name_or_path",
        str(output_dir),
        "--export_dir",
        str(merged_dir),
        "--export_size",
        "2",
    ]
    rc = await _run_subprocess(merge_cmd, cwd=settings.llamafactory_dir)
    if rc != 0:
        return False

    # Step 2: Convert to GGUF
    convert_script = settings.llamacpp_dir / "convert_hf_to_gguf.py"
    if not convert_script.exists():
        return False

    convert_cmd = [
        "python",
        str(convert_script),
        str(merged_dir),
        "--outfile",
        str(gguf_output),
        "--outtype",
        "q4_k_m",
    ]
    rc = await _run_subprocess(convert_cmd)
    if rc != 0:
        return False

    # Step 3: Register with Ollama via Modelfile
    model_name = f"forge-{job_id[:8]}"
    modelfile_content = f'FROM {gguf_output}\nSYSTEM You are a fine-tuned AI assistant.'
    modelfile_path = output_dir / "Modelfile"
    modelfile_path.write_text(modelfile_content)

    try:
        async with httpx.AsyncClient(timeout=300.0) as client:
            resp = await client.post(
                f"{settings.ollama_base_url}/api/create",
                json={"name": model_name, "modelfile": modelfile_content},
            )
            resp.raise_for_status()
    except (httpx.ConnectError, httpx.TimeoutException, httpx.HTTPStatusError, OSError):
        return False

    async with _lock:
        jobs[job_id].output_model_path = str(gguf_output)

    return True
