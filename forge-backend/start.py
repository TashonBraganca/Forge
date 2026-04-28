#!/usr/bin/env python3
"""Forge Backend — Fully automatic startup with auto-install of all dependencies."""

from __future__ import annotations

import os
import platform
import shutil
import subprocess
import sys
import time
import threading
import warnings
import webbrowser
from pathlib import Path

# Suppress noisy deprecation warnings from pynvml / nvidia-ml-py
warnings.filterwarnings("ignore", category=FutureWarning, module="pynvml")
warnings.filterwarnings("ignore", message=".*pynvml.*")

# ── Logging ──────────────────────────────────────────────────

def info(msg: str) -> None:
    print(f"  ✓ {msg}")

def warn(msg: str) -> None:
    print(f"  ⚠ {msg}")

def step(msg: str) -> None:
    print(f"  → {msg}")

def fail(msg: str) -> None:
    print(f"  ✗ {msg}")


# ── Python Check ────────────────────────────────────────────

def check_python() -> None:
    major, minor = sys.version_info[:2]
    if major < 3 or (major == 3 and minor < 11):
        fail(f"Python 3.11+ required (found {major}.{minor})")
        sys.exit(1)
    info(f"Python {major}.{minor}")


# ── pip auto-install helper ──────────────────────────────────

def pip_install(*packages: str, upgrade: bool = False) -> bool:
    """Install/upgrade pip packages silently."""
    cmd = [sys.executable, "-m", "pip", "install", "--quiet"]
    if upgrade:
        cmd.append("--upgrade")
    cmd.extend(packages)
    try:
        subprocess.run(cmd, capture_output=True, timeout=300)
        return True
    except Exception:
        return False


def ensure_pip_deps() -> None:
    """Make sure all required pip packages are installed and up to date."""
    required = [
        "fastapi", "uvicorn[standard]", "pydantic", "pydantic-settings",
        "httpx", "python-multipart", "sse-starlette", "psutil",
        "python-dotenv", "aiofiles", "pyyaml",
    ]

    missing = []
    for pkg in required:
        # Strip extras for import check
        mod_name = pkg.split("[")[0].replace("-", "_")
        try:
            __import__(mod_name)
        except ImportError:
            missing.append(pkg)

    if missing:
        step(f"Installing {len(missing)} missing Python packages...")
        pip_install(*missing)
        info("Python dependencies installed")
    else:
        info("Python dependencies OK")


# ── Apple Silicon GPU ────────────────────────────────────────

def detect_gpu() -> dict | None:
    """Detect GPU — NVIDIA or Apple Silicon."""
    # Try NVIDIA
    try:
        import pynvml
        pynvml.nvmlInit()
        handle = pynvml.nvmlDeviceGetHandleByIndex(0)
        name = pynvml.nvmlDeviceGetName(handle)
        if isinstance(name, bytes):
            name = name.decode("utf-8")
        mem = pynvml.nvmlDeviceGetMemoryInfo(handle)
        vram_gb = round(mem.total / (1024**3), 1)
        pynvml.nvmlShutdown()
        info(f"GPU: {name} ({vram_gb} GB VRAM)")
        return {"name": name, "vram": vram_gb, "type": "cuda"}
    except Exception:
        pass

    # Apple Silicon
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
            mem_gb = round(mem_bytes / (1024**3))
            info(f"GPU: {chip} — {mem_gb} GB Unified Memory (Metal)")
            return {"name": chip, "vram": mem_gb, "type": "metal"}
        except Exception:
            pass

    warn("No GPU detected — training will be CPU-only")
    return None


# ── Homebrew ─────────────────────────────────────────────────

def ensure_homebrew() -> str | None:
    """Check for Homebrew, install if missing on macOS."""
    brew = shutil.which("brew")
    if brew:
        return brew

    if platform.system() != "Darwin":
        return None

    step("Homebrew not found — installing...")
    try:
        subprocess.run(
            ["/bin/bash", "-c",
             'NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'],
            timeout=300,
        )
        # Add to PATH for this session
        for p in ["/opt/homebrew/bin/brew", "/usr/local/bin/brew"]:
            if Path(p).exists():
                os.environ["PATH"] = str(Path(p).parent) + ":" + os.environ.get("PATH", "")
                info("Homebrew installed")
                return p
    except Exception as e:
        warn(f"Could not install Homebrew: {e}")

    return None


# ── Ollama ───────────────────────────────────────────────────

def find_ollama() -> str | None:
    """Find Ollama binary — macOS, Linux, Windows."""
    path = shutil.which("ollama")
    if path:
        return path

    candidates = ["/usr/local/bin/ollama", "/opt/homebrew/bin/ollama"]

    # Windows paths
    if platform.system() == "Windows":
        localappdata = os.environ.get("LOCALAPPDATA", "")
        if localappdata:
            candidates.append(str(Path(localappdata) / "Programs" / "Ollama" / "ollama.exe"))
        candidates.append(str(Path.home() / "AppData" / "Local" / "Programs" / "Ollama" / "ollama.exe"))
        candidates.append(r"C:\Program Files\Ollama\ollama.exe")

    for candidate in candidates:
        if Path(candidate).exists():
            return candidate
    return None


def is_ollama_running() -> bool:
    """Check if Ollama server is responding."""
    try:
        import urllib.request
        req = urllib.request.urlopen("http://localhost:11434/api/version", timeout=3)
        return req.status == 200
    except Exception:
        return False


def ensure_ollama() -> None:
    """Auto-install Ollama if missing, auto-start if not running. Cross-platform."""
    ollama = find_ollama()
    sys_name = platform.system()

    if not ollama:
        step("Ollama not found — installing automatically...")

        if sys_name == "Darwin":
            # macOS: try Homebrew
            brew = ensure_homebrew()
            if brew:
                try:
                    subprocess.run([brew, "install", "ollama"], capture_output=True, timeout=300)
                    ollama = find_ollama()
                    if ollama:
                        info("Ollama installed via Homebrew")
                except Exception:
                    pass
            # Fallback: install script
            if not ollama:
                try:
                    subprocess.run(
                        ["/bin/bash", "-c", "curl -fsSL https://ollama.com/install.sh | sh"],
                        capture_output=True, text=True, timeout=300,
                    )
                    ollama = find_ollama()
                    if ollama:
                        info("Ollama installed via install script")
                except Exception:
                    pass

        elif sys_name == "Linux":
            try:
                subprocess.run(
                    ["/bin/bash", "-c", "curl -fsSL https://ollama.com/install.sh | sh"],
                    capture_output=True, timeout=300,
                )
                ollama = find_ollama()
                if ollama:
                    info("Ollama installed")
            except Exception:
                pass

        elif sys_name == "Windows":
            # Try winget first
            winget = shutil.which("winget")
            if winget:
                try:
                    step("Installing via winget...")
                    subprocess.run(
                        [winget, "install", "--id", "Ollama.Ollama", "--accept-package-agreements", "--accept-source-agreements"],
                        capture_output=True, timeout=300,
                    )
                    ollama = find_ollama()
                    if ollama:
                        info("Ollama installed via winget")
                except Exception:
                    pass

            if not ollama:
                warn("Auto-install failed on Windows")
                warn("Download from: https://ollama.com/download/windows")

        if not ollama:
            warn("Could not auto-install Ollama")
            warn("Install manually: https://ollama.com/download")
            return

    # Get version
    try:
        v = subprocess.run([ollama, "--version"], capture_output=True, text=True, timeout=5)
        version = v.stdout.strip() or v.stderr.strip()
        info(f"Ollama: {version}")
    except Exception:
        info("Ollama installed")

    # Start if not running
    if is_ollama_running():
        info("Ollama server running")
    else:
        step("Starting Ollama server...")
        try:
            subprocess.Popen(
                [ollama, "serve"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
            # Wait for startup
            for i in range(20):
                time.sleep(1)
                if is_ollama_running():
                    info("Ollama server started")
                    return
            warn("Ollama started but not responding yet — may need a moment")
        except Exception as e:
            warn(f"Could not start Ollama: {e}")


# ── LLaMA-Factory ────────────────────────────────────────────

def ensure_llamafactory() -> None:
    """Auto-clone and install LLaMA-Factory if missing."""
    from config import settings

    llama_dir = settings.llamafactory_dir

    if llama_dir.exists() and (llama_dir / "src").exists():
        info(f"LLaMA-Factory at {llama_dir}")

        # Check if it needs updating (git pull)
        try:
            result = subprocess.run(
                ["git", "-C", str(llama_dir), "pull", "--ff-only"],
                capture_output=True, text=True, timeout=60,
            )
            if "Already up to date" not in result.stdout:
                info("LLaMA-Factory updated")
        except Exception:
            pass  # Not a git repo or no git — skip update

        return

    # Not found — auto-clone
    step(f"LLaMA-Factory not found — cloning to {llama_dir}...")
    llama_dir.parent.mkdir(parents=True, exist_ok=True)

    try:
        subprocess.run(
            ["git", "clone", "--depth=1",
             "https://github.com/hiyouga/LLaMA-Factory.git",
             str(llama_dir)],
            timeout=120,
        )

        if llama_dir.exists():
            info("LLaMA-Factory cloned")

            # Install LLaMA-Factory dependencies
            step("Installing LLaMA-Factory dependencies (this may take a few minutes)...")
            subprocess.run(
                [sys.executable, "-m", "pip", "install", "--quiet",
                 "-e", str(llama_dir)],
                timeout=600,
            )
            info("LLaMA-Factory dependencies installed")
        else:
            warn("Clone completed but directory not found")
    except subprocess.TimeoutExpired:
        warn("LLaMA-Factory clone timed out — try manually:")
        warn(f"  git clone https://github.com/hiyouga/LLaMA-Factory.git {llama_dir}")
    except FileNotFoundError:
        if platform.system() == "Darwin":
            warn("git not found — install Xcode CLI tools: xcode-select --install")
        elif platform.system() == "Windows":
            warn("git not found — install from https://git-scm.com/download/win")
        else:
            warn("git not found — install via: sudo apt install git")
    except Exception as e:
        warn(f"Could not install LLaMA-Factory: {e}")


# ── Create .env if missing ───────────────────────────────────

def ensure_env_file() -> None:
    """Create .env with real computed paths. Never copies placeholder values."""
    env_path = Path(__file__).parent / ".env"

    # Always write fresh defaults — safe because blank values fall back to
    # config.py defaults, and we set the critical paths explicitly.
    home = Path.home()
    defaults = {
        "FORGE_HOST": "localhost",
        "FORGE_PORT": "8421",
        "FRONTEND_ORIGIN": "http://localhost:3004",
        "OLLAMA_BASE_URL": "http://localhost:11434",
        "LLAMAFACTORY_DIR": str(home / "LLaMA-Factory"),
        "LLAMACPP_DIR": str(home / "llama.cpp"),
        "DATASETS_DIR": str(home / "forge" / "datasets"),
        "MODELS_DIR": str(home / "forge" / "models"),
        "JOBS_DIR": str(home / "forge" / "jobs"),
        "HUGGINGFACE_TOKEN": "",
        "KAGGLE_USERNAME": "",
        "KAGGLE_KEY": "",
    }

    if env_path.exists():
        # Read existing — only keep non-placeholder values
        existing: dict[str, str] = {}
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, _, v = line.partition("=")
                    # Reject obvious placeholder values
                    if v and not v.startswith("/path/to") and "your_" not in v:
                        existing[k.strip()] = v.strip()
        # Merge: keep existing valid values, fill missing with defaults
        merged = {**defaults, **existing}
    else:
        merged = defaults

    lines = []
    for k, v in merged.items():
        lines.append(f"{k}={v}")

    env_path.write_text("\n".join(lines) + "\n")
    info("Environment configured")


# ── Browser ──────────────────────────────────────────────────

def open_browser_later(url: str, delay: float = 2.5) -> None:
    def _open() -> None:
        time.sleep(delay)
        webbrowser.open(url)
    threading.Thread(target=_open, daemon=True).start()


# ── Main ─────────────────────────────────────────────────────

def print_system_info() -> None:
    """Print comprehensive system hardware details."""
    import psutil

    # CPU
    cpu_count_phys = psutil.cpu_count(logical=False) or 0
    cpu_count_log = psutil.cpu_count(logical=True) or 0
    try:
        cpu_freq = psutil.cpu_freq()
        freq_str = f" @ {cpu_freq.max / 1000:.1f} GHz" if cpu_freq and cpu_freq.max else ""
    except Exception:
        freq_str = ""

    # Get CPU model name
    cpu_name = platform.processor() or "Unknown"
    if platform.system() == "Darwin":
        try:
            cpu_name = subprocess.run(
                ["sysctl", "-n", "machdep.cpu.brand_string"],
                capture_output=True, text=True, timeout=5,
            ).stdout.strip()
        except Exception:
            pass
    elif platform.system() == "Linux":
        try:
            with open("/proc/cpuinfo") as f:
                for line in f:
                    if line.startswith("model name"):
                        cpu_name = line.split(":")[1].strip()
                        break
        except Exception:
            pass
    elif platform.system() == "Windows":
        cpu_name = platform.processor()

    info(f"CPU: {cpu_name}")
    info(f"  Cores: {cpu_count_phys} physical / {cpu_count_log} logical{freq_str}")

    # RAM
    vm = psutil.virtual_memory()
    ram_total = round(vm.total / (1024**3), 1)
    ram_avail = round(vm.available / (1024**3), 1)
    info(f"RAM: {ram_avail} / {ram_total} GB available")

    # Disk
    try:
        disk = psutil.disk_usage(str(Path.home()))
        disk_free = round(disk.free / (1024**3), 1)
        disk_total = round(disk.total / (1024**3), 1)
        info(f"Disk: {disk_free} / {disk_total} GB free")
    except Exception:
        pass


def main() -> None:
    print()
    print("  ═══════════════════════════════════════════")
    print("   FORGE — Local LLM Fine-Tuning Studio")
    print("  ═══════════════════════════════════════════")
    print(f"   {platform.system()} {platform.machine()} | Python {sys.version_info.major}.{sys.version_info.minor}")
    print()

    # Phase 1: Core setup
    check_python()
    ensure_env_file()
    ensure_pip_deps()

    print()

    # Phase 2: Hardware detection
    print_system_info()
    detect_gpu()

    print()

    # Phase 3: External tools (auto-install)
    ensure_ollama()

    print()

    ensure_llamafactory()

    print()
    print("  ───────────────────────────────────────────")

    from config import settings
    host = settings.forge_host
    port = settings.forge_port

    print(f"   Backend:  http://{host}:{port}")
    print(f"   Frontend: {settings.frontend_origin}")
    print("  ───────────────────────────────────────────")
    print()

    open_browser_later(settings.frontend_origin)

    import uvicorn
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=False,
        log_level="info",
    )


if __name__ == "__main__":
    main()
