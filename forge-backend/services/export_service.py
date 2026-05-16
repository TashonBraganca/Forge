import asyncio
import logging
import os
import sys
import shutil
import yaml
from pathlib import Path
from datetime import datetime, timezone
from config import settings
from services.training_service import get_job, _persist_job, _append_log, _emit_progress, training_event_queues
from services.ollama_service import resolve_hf_model_name, OLLAMA_TO_TEMPLATE
from models.schemas import TrainingEvent

logger = logging.getLogger("forge.export")

async def run_export_pipeline(job_id: str, ollama_model_name: str) -> None:
    """Run the end-to-end export pipeline to convert LLaMA-Factory LoRA to an Ollama GGUF model."""
    job = get_job(job_id)
    if not job:
        logger.error(f"[EXPORT] Job {job_id} not found")
        return

    job.export_status = "running"
    job.export_model_name = ollama_model_name
    _persist_job(job)

    # Initialize SSE queue so frontend can reconnect and see export logs
    if job_id not in training_event_queues:
        training_event_queues[job_id] = asyncio.Queue()

    async def log(msg: str, level="INFO"):
        logger.info(f"[EXPORT] {msg}")
        job.latest_logs.append(msg)
        await _emit_progress(job_id, TrainingEvent(type="log", message=msg, level=level))

    try:
        await log(f"Starting export pipeline for {job_id} -> {ollama_model_name}")

        # 1. Paths setup — adapters are saved in models_dir, not jobs_dir
        output_dir = Path(job.config.output_dir) if job.config.output_dir else settings.models_dir / job_id
        job_dir = settings.jobs_dir / job_id
        job_dir.mkdir(parents=True, exist_ok=True)
        exports_dir = settings.models_dir.parent / "exports"
        exports_dir.mkdir(parents=True, exist_ok=True)
        merged_dir = exports_dir / f"{job_id}_merged"
        
        # 2. Merge LoRA using LLaMA-Factory
        await log("Phase 1/4: Merging LoRA adapters with base model...")
        await _emit_progress(job_id, TrainingEvent(type="progress", step=10, total_steps=100))
        hf_repo = resolve_hf_model_name(job.config.model_name)
        template = OLLAMA_TO_TEMPLATE.get(job.config.model_name.split(":")[0], "default")
        
        export_config = {
            "model_name_or_path": hf_repo,
            "adapter_name_or_path": str(output_dir),
            "template": template,
            "finetuning_type": "lora",
            "export_dir": str(merged_dir),
            "export_size": 2,
            "export_device": "auto"
        }
        await log(f"Adapter path: {output_dir}")
        config_path = job_dir / "export_config.yaml"
        with open(config_path, "w", encoding="utf-8") as f:
            yaml.dump(export_config, f)

        # Run merge process
        cmd = [
            sys.executable,
            "-m",
            "llamafactory.cli",
            "export",
            str(config_path)
        ]
        
        env = os.environ.copy()
        env["USE_TF"] = "0"
        if settings.huggingface_token:
            env["HF_TOKEN"] = settings.huggingface_token
        
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=str(settings.llamafactory_dir),
            env=env,
            limit=1024 * 1024  # 1MB buffer to handle long chat template lines
        )
        
        if process.stdout:
            buffer = b""
            while True:
                chunk = await process.stdout.read(65536)
                if not chunk:
                    if buffer:
                        for part in buffer.decode("utf-8", errors="replace").split("\n"):
                            part = part.strip()
                            if part:
                                await log(part)
                    break
                buffer += chunk
                text = buffer.decode("utf-8", errors="replace")
                lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
                buffer = lines[-1].encode("utf-8")
                for line_text in lines[:-1]:
                    line_text = line_text.strip()
                    if line_text:
                        await log(line_text)
                
        await process.wait()
        if process.returncode != 0:
            raise RuntimeError(f"Merge failed with code {process.returncode}")

        # 3. Clone and Setup llama.cpp
        await log("Phase 2/4: Converting to GGUF using llama.cpp...")
        await _emit_progress(job_id, TrainingEvent(type="progress", step=40, total_steps=100))
        llama_cpp_dir = settings.llamacpp_dir
        if not llama_cpp_dir.exists():
            await log("Cloning llama.cpp repository...")
            clone_proc = await asyncio.create_subprocess_shell(
                f"git clone https://github.com/ggerganov/llama.cpp.git {llama_cpp_dir}"
            )
            await clone_proc.wait()
            
            await log("Installing gguf conversion dependencies...")
            pip_proc = await asyncio.create_subprocess_shell(
                f"{sys.executable} -m pip install gguf --quiet",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT
            )
            if pip_proc.stdout:
                async for line in pip_proc.stdout:
                    line_str = line.decode().strip()
                    if line_str:
                        await log(line_str)
            await pip_proc.wait()

        # 4. Convert to GGUF
        f16_gguf = exports_dir / f"{job_id}_forged_f16.gguf"
        convert_proc = await asyncio.create_subprocess_shell(
            f'"{sys.executable}" "{llama_cpp_dir}/convert_hf_to_gguf.py" "{merged_dir}" --outfile "{f16_gguf}" --outtype f16',
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT
        )
        
        if convert_proc.stdout:
            buffer = b""
            while True:
                chunk = await convert_proc.stdout.read(65536)
                if not chunk:
                    if buffer:
                        for part in buffer.decode("utf-8", errors="replace").split("\n"):
                            part = part.strip()
                            if part:
                                await log(part)
                    break
                buffer += chunk
                text = buffer.decode("utf-8", errors="replace")
                lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
                buffer = lines[-1].encode("utf-8")
                for line_text in lines[:-1]:
                    line_text = line_text.strip()
                    if line_text:
                        await log(line_text)
        await convert_proc.wait()
        if convert_proc.returncode != 0:
            raise RuntimeError(f"GGUF conversion failed with code {convert_proc.returncode}")

        # 5. Quantize (optional — only if llama-quantize is pre-built)
        await _emit_progress(job_id, TrainingEvent(type="progress", step=70, total_steps=100))
        
        # Check if llama-quantize binary exists (pre-built)
        quantize_bin = None
        possible_paths = [
            llama_cpp_dir / "build" / "bin" / "llama-quantize",
            llama_cpp_dir / "llama-quantize",
            llama_cpp_dir / "build" / "llama-quantize",
        ]
        for p in possible_paths:
            if p.exists():
                quantize_bin = p
                break
        
        # Use quantized version if possible, otherwise use F16 directly
        final_gguf = f16_gguf
        if quantize_bin is not None:
            await log("Phase 3/3: Quantizing to Q4_K_M...")
            q4_gguf = exports_dir / f"{job_id}_forged_q4_k_m.gguf"
            quant_proc = await asyncio.create_subprocess_shell(
                f'"{quantize_bin}" "{f16_gguf}" "{q4_gguf}" Q4_K_M',
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT
            )
            if quant_proc.stdout:
                buffer = b""
                while True:
                    chunk = await quant_proc.stdout.read(65536)
                    if not chunk:
                        if buffer:
                            for part in buffer.decode("utf-8", errors="replace").split("\n"):
                                part = part.strip()
                                if part:
                                    await log(part)
                        break
                    buffer += chunk
                    text = buffer.decode("utf-8", errors="replace")
                    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
                    buffer = lines[-1].encode("utf-8")
                    for line_text in lines[:-1]:
                        line_text = line_text.strip()
                        if line_text:
                            await log(line_text)
            await quant_proc.wait()
            if quant_proc.returncode == 0 and q4_gguf.exists():
                final_gguf = q4_gguf
                await log("✓ Quantization successful — using Q4_K_M")
            else:
                await log("⚠ Quantization failed — falling back to F16 GGUF")
        else:
            await log("Phase 3/3: Skipping quantization (no llama-quantize found) — using F16 directly")

        # 6. Import into Ollama
        await log(f"Importing to Ollama as '{ollama_model_name}'...")
        await _emit_progress(job_id, TrainingEvent(type="progress", step=90, total_steps=100))
        modelfile_path = exports_dir / "Modelfile"
        
        # Determine prompt template
        template_str = ""
        if template == "qwen":
            template_str = 'TEMPLATE """{{ if .System }}<|im_start|>system\\n{{ .System }}<|im_end|>\\n{{ end }}{{ if .Prompt }}<|im_start|>user\\n{{ .Prompt }}<|im_end|>\\n{{ end }}<|im_start|>assistant\\n"""'
        elif template == "llama3":
            template_str = 'TEMPLATE """<|start_header_id|>system<|end_header_id|>\\n\\n{{ .System }}<|eot_id|><|start_header_id|>user<|end_header_id|>\\n\\n{{ .Prompt }}<|eot_id|><|start_header_id|>assistant<|end_header_id|>\\n\\n"""'
        
        modelfile_content = f"FROM {final_gguf}\n{template_str}\n"
        with open(modelfile_path, "w") as f:
            f.write(modelfile_content)

        import_proc = await asyncio.create_subprocess_shell(
            f"ollama create {ollama_model_name} -f {modelfile_path}",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT
        )
        if import_proc.stdout:
            async for line in import_proc.stdout:
                await log(line.decode().strip())
        await import_proc.wait()
        if import_proc.returncode != 0:
            raise RuntimeError("Ollama import failed")

        await log("✅ Export pipeline completed successfully!")
        await _emit_progress(job_id, TrainingEvent(type="progress", step=100, total_steps=100))
        
        # Cleanup temp large files
        try:
            shutil.rmtree(merged_dir)
            # Only delete gguf files if Ollama imported successfully
            if final_gguf != f16_gguf and f16_gguf.exists():
                f16_gguf.unlink(missing_ok=True)
        except Exception as e:
            await log(f"Cleanup warning: {e}", level="WARNING")

        job.export_status = "completed"
        _persist_job(job)

    except Exception as e:
        logger.error(f"[EXPORT] Pipeline failed: {e}", exc_info=True)
        await log(f"❌ Export failed: {e}", level="ERROR")
        job.export_status = "failed"
        job.error_message = str(e)
        _persist_job(job)
    finally:
        if job_id in training_event_queues:
            await training_event_queues[job_id].put(None)
            del training_event_queues[job_id]
