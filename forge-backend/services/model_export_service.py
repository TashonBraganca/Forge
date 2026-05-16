"""Post-training model export: LoRA merge → GGUF conversion → Ollama registration."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import httpx

from config import settings
from services.persistence import (
    ExportArtifactRecord,
    FineTunedModelRecord,
    get_export_artifact,
    get_model_record,
    get_training_job_record,
    list_export_artifacts,
    model_record_to_info,
    upsert_export_artifact,
    upsert_model_record,
    update_training_job_record,
)
from services.training_service import get_job, jobs, _lock


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


async def export_to_ollama(job_id: str) -> ExportArtifactRecord | None:
    """Run a staged export pipeline and persist every stage."""
    job = get_job(job_id)
    if not job or job.status != "complete":
        return None

    output_dir = Path(job.config.output_dir)
    merged_dir = output_dir / "merged"
    gguf_output = output_dir / f"forge-{job_id[:8]}.gguf"
    artifact_id = f"art-{uuid4().hex[:10]}"
    model_id = f"ft-{job_id[:8]}"

    artifact = upsert_export_artifact(
        artifact_id=artifact_id,
        job_id=job_id,
        model_id=model_id,
        export_format="adapter",
        export_status="running",
        source_path=str(output_dir),
        target_path=None,
        ollama_model_name=None,
        error_message=None,
        completed_at=None,
    )
    update_training_job_record(job_id, export_status="running")
    upsert_model_record(
        model_id=model_id,
        job_id=job_id,
        name=f"forge-{job.config.model_name.replace('/', '-')}",
        base_model=job.config.model_name,
        method=job.config.method,
        status="exporting",
        export_format="adapter",
        export_status="running",
        artifact_path=str(output_dir),
        ollama_model_name=None,
        final_loss=job.final_loss,
        metrics={"progress": job.progress, "export_stage": "merge"},
    )

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
        upsert_export_artifact(
            artifact_id=artifact_id,
            job_id=job_id,
            model_id=model_id,
            export_format="adapter",
            export_status="failed",
            source_path=str(output_dir),
            target_path=None,
            ollama_model_name=None,
            error_message="LoRA merge failed",
            completed_at=datetime.now(timezone.utc),
        )
        update_training_job_record(job_id, export_status="failed")
        upsert_model_record(
            model_id=model_id,
            job_id=job_id,
            name=f"forge-{job.config.model_name.replace('/', '-')}",
            base_model=job.config.model_name,
            method=job.config.method,
            status="failed",
            export_format="adapter",
            export_status="failed",
            artifact_path=str(output_dir),
            ollama_model_name=None,
            final_loss=job.final_loss,
            metrics={"error": "LoRA merge failed"},
        )
        return get_export_artifact(artifact_id)

    # Step 2: Convert to GGUF
    convert_script = settings.llamacpp_dir / "convert_hf_to_gguf.py"
    if not convert_script.exists():
        artifact = upsert_export_artifact(
            artifact_id=artifact_id,
            job_id=job_id,
            model_id=model_id,
            export_format="merged",
            export_status="completed",
            source_path=str(output_dir),
            target_path=str(merged_dir),
            ollama_model_name=None,
            error_message=None,
            completed_at=datetime.now(timezone.utc),
        )
        update_training_job_record(job_id, export_status="completed", output_model_path=str(merged_dir))
        upsert_model_record(
            model_id=model_id,
            job_id=job_id,
            name=f"forge-{job.config.model_name.replace('/', '-')}",
            base_model=job.config.model_name,
            method=job.config.method,
            status="ready",
            export_format="merged",
            export_status="completed",
            artifact_path=str(merged_dir),
            ollama_model_name=None,
            final_loss=job.final_loss,
            metrics={"export_format": "merged"},
            exported_at=datetime.now(timezone.utc),
        )
        return artifact

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
        artifact = upsert_export_artifact(
            artifact_id=artifact_id,
            job_id=job_id,
            model_id=model_id,
            export_format="merged",
            export_status="failed",
            source_path=str(output_dir),
            target_path=str(merged_dir),
            ollama_model_name=None,
            error_message="GGUF conversion failed",
            completed_at=datetime.now(timezone.utc),
        )
        update_training_job_record(job_id, export_status="failed")
        upsert_model_record(
            model_id=model_id,
            job_id=job_id,
            name=f"forge-{job.config.model_name.replace('/', '-')}",
            base_model=job.config.model_name,
            method=job.config.method,
            status="failed",
            export_format="merged",
            export_status="failed",
            artifact_path=str(merged_dir),
            ollama_model_name=None,
            final_loss=job.final_loss,
            metrics={"error": "GGUF conversion failed"},
        )
        return artifact

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
        artifact = upsert_export_artifact(
            artifact_id=artifact_id,
            job_id=job_id,
            model_id=model_id,
            export_format="gguf",
            export_status="completed",
            source_path=str(output_dir),
            target_path=str(gguf_output),
            ollama_model_name=None,
            error_message="Ollama registration failed",
            completed_at=datetime.now(timezone.utc),
        )
        update_training_job_record(job_id, export_status="completed", output_model_path=str(gguf_output))
        upsert_model_record(
            model_id=model_id,
            job_id=job_id,
            name=f"forge-{job.config.model_name.replace('/', '-')}",
            base_model=job.config.model_name,
            method=job.config.method,
            status="ready",
            export_format="gguf",
            export_status="completed",
            artifact_path=str(gguf_output),
            ollama_model_name=None,
            final_loss=job.final_loss,
            metrics={"export_format": "gguf"},
            exported_at=datetime.now(timezone.utc),
        )
        return artifact

    async with _lock:
        jobs[job_id].output_model_path = str(gguf_output)
        jobs[job_id].export_status = "completed"
        _persisted_job = jobs[job_id]

    update_training_job_record(job_id, export_status="completed", output_model_path=str(gguf_output))
    artifact = upsert_export_artifact(
        artifact_id=artifact_id,
        job_id=job_id,
        model_id=model_id,
        export_format="gguf",
        export_status="completed",
        source_path=str(output_dir),
        target_path=str(gguf_output),
        ollama_model_name=model_name,
        error_message=None,
        completed_at=datetime.now(timezone.utc),
    )
    upsert_model_record(
        model_id=model_id,
        job_id=job_id,
        name=f"forge-{job.config.model_name.replace('/', '-')}",
        base_model=job.config.model_name,
        method=job.config.method,
        status="ready",
        export_format="gguf",
        export_status="completed",
        artifact_path=str(gguf_output),
        ollama_model_name=model_name,
        final_loss=job.final_loss,
        metrics={"export_format": "gguf", "ollama_model": model_name},
        exported_at=datetime.now(timezone.utc),
    )

    return artifact


def list_registered_models() -> list[FineTunedModelRecord]:
    from services.persistence import list_model_records

    return list_model_records()
