"""Hardware detection: GPU, CPU, RAM, disk — real-time stats with 1-second caching."""

from __future__ import annotations

import platform
import subprocess
import time
from pathlib import Path

import psutil

from models.schemas import HardwareStats

# ── Cache ──────────────────────────────────────────────────────────

_gpu_cache: dict = {}
_gpu_cache_time: float = 0.0
_GPU_CACHE_TTL = 1.0  # seconds

_cpu_name_cache: str = ""


# ── CPU Name ────────────────────────────────────────────────────────

def _get_cpu_name() -> str:
    """Detect CPU model name once and cache it."""
    global _cpu_name_cache
    if _cpu_name_cache:
        return _cpu_name_cache

    name = platform.processor() or "Unknown CPU"

    if platform.system() == "Darwin":
        try:
            name = subprocess.run(
                ["sysctl", "-n", "machdep.cpu.brand_string"],
                capture_output=True, text=True, timeout=5,
            ).stdout.strip() or name
        except Exception:
            pass

    elif platform.system() == "Linux":
        try:
            with open("/proc/cpuinfo") as f:
                for line in f:
                    if line.startswith("model name"):
                        name = line.split(":")[1].strip()
                        break
        except Exception:
            pass

    elif platform.system() == "Windows":
        try:
            result = subprocess.run(
                ["wmic", "cpu", "get", "Name", "/value"],
                capture_output=True, text=True, timeout=5,
            )
            for line in result.stdout.splitlines():
                if line.startswith("Name="):
                    name = line.split("=", 1)[1].strip()
                    break
        except Exception:
            pass

    _cpu_name_cache = name
    return name


# ── GPU Detection (cached 1s) ───────────────────────────────────────

def _get_gpu_info() -> dict:
    """Read GPU info with 1-second caching. NVIDIA → Apple Silicon → fallback."""
    global _gpu_cache, _gpu_cache_time

    now = time.time()
    if now - _gpu_cache_time < _GPU_CACHE_TTL and _gpu_cache:
        return _gpu_cache

    result: dict = {
        "cuda_available": False,
        "metal_available": False,
        "vram_total_gb": 0.0,
        "vram_free_gb": 0.0,
        "gpu_name": None,
        "gpu_util_percent": 0.0,
        "gpu_temp_c": 0.0,
    }

    # ── NVIDIA via pynvml ──────────────────────────────────────
    try:
        import pynvml  # type: ignore
        pynvml.nvmlInit()
        handle = pynvml.nvmlDeviceGetHandleByIndex(0)

        name = pynvml.nvmlDeviceGetName(handle)
        if isinstance(name, bytes):
            name = name.decode("utf-8")

        mem = pynvml.nvmlDeviceGetMemoryInfo(handle)

        # Real-time utilisation
        util = pynvml.nvmlDeviceGetUtilizationRates(handle)
        try:
            temp = float(pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU))
        except Exception:
            temp = 0.0

        result = {
            "cuda_available": True,
            "metal_available": False,
            "vram_total_gb": round(mem.total / (1024**3), 2),
            "vram_free_gb": round(mem.free / (1024**3), 2),
            "gpu_name": name,
            "gpu_util_percent": float(util.gpu),
            "gpu_temp_c": temp,
        }
        _gpu_cache = result
        _gpu_cache_time = now
        return result
    except Exception:
        pass

    # ── Apple Silicon via sysctl ───────────────────────────────
    if platform.system() == "Darwin" and platform.processor() == "arm":
        try:
            chip = subprocess.run(
                ["sysctl", "-n", "machdep.cpu.brand_string"],
                capture_output=True, text=True, timeout=5,
            ).stdout.strip()

            mem_bytes = int(subprocess.run(
                ["sysctl", "-n", "hw.memsize"],
                capture_output=True, text=True, timeout=5,
            ).stdout.strip())
            mem_gb = round(mem_bytes / (1024**3), 2)

            # Unified memory — estimate VRAM as ~75% of total
            vm = psutil.virtual_memory()
            vram_total = round(mem_gb * 0.75, 2)
            vram_free = round((vm.available / (1024**3)) * 0.75, 2)

            # GPU utilisation via powermetrics (requires sudo — skip if not available)
            gpu_util = 0.0
            gpu_temp = 0.0

            result = {
                "cuda_available": False,
                "metal_available": True,
                "vram_total_gb": vram_total,
                "vram_free_gb": vram_free,
                "gpu_name": f"{chip} (Metal)",
                "gpu_util_percent": gpu_util,
                "gpu_temp_c": gpu_temp,
            }
            _gpu_cache = result
            _gpu_cache_time = now
            return result
        except Exception:
            pass

    _gpu_cache = result
    _gpu_cache_time = now
    return result


# ── Main API ────────────────────────────────────────────────────────

async def get_hardware_stats(
    ollama_running: bool,
    db_ready: bool = False,
    training_backend_available: bool = False,
) -> HardwareStats:
    """Gather full real-time hardware stats. Sub-200ms thanks to caching."""
    from config import settings

    gpu = _get_gpu_info()
    vm = psutil.virtual_memory()

    try:
        disk = psutil.disk_usage(str(Path.home()))
    except Exception:
        disk = psutil.disk_usage("/")

    # CPU utilisation (non-blocking — uses interval=None for instant reading)
    try:
        cpu_percent = psutil.cpu_percent(interval=None)
    except Exception:
        cpu_percent = 0.0

    return HardwareStats(
        # Connectivity
        ollama_running=ollama_running,
        llamafactory_available=settings.llamafactory_dir.exists(),

        # GPU
        cuda_available=bool(gpu["cuda_available"]),
        metal_available=bool(gpu["metal_available"]),
        gpu_name=gpu["gpu_name"],
        vram_total_gb=float(gpu["vram_total_gb"]),
        vram_free_gb=float(gpu["vram_free_gb"]),
        gpu_util_percent=float(gpu["gpu_util_percent"]),
        gpu_temp_c=float(gpu["gpu_temp_c"]),

        # CPU
        cpu_name=_get_cpu_name(),
        cpu_cores=psutil.cpu_count(logical=False) or 1,
        cpu_threads=psutil.cpu_count(logical=True) or 1,
        cpu_percent=cpu_percent,

        # RAM
        ram_total_gb=round(vm.total / (1024**3), 2),
        ram_free_gb=round(vm.available / (1024**3), 2),
        ram_percent=round(vm.percent, 1),

        # Disk
        disk_total_gb=round(disk.total / (1024**3), 1),
        disk_free_gb=round(disk.free / (1024**3), 1),

        # System
        platform=f"{platform.system()} {platform.machine()}",
        forge_version="1.0.0",
        db_ready=db_ready,
        database_path=str(settings.database_path),
        datasets_dir_ready=settings.datasets_dir.exists(),
        models_dir_ready=settings.models_dir.exists(),
        jobs_dir_ready=settings.jobs_dir.exists(),
        training_backend_available=training_backend_available,
        simulation_fallback_available=settings.allow_simulation_fallback,
    )
