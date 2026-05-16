"""Async Ollama API client wrapping httpx."""

from __future__ import annotations

import asyncio
import logging
import platform
import shutil
import subprocess
from pathlib import Path
from typing import AsyncIterator

import httpx

from config import settings
from models.schemas import ModelInfo

logger = logging.getLogger("forge.ollama")

# ── Gated model registry ─────────────────────────────────────────
# These HuggingFace repos require accepting a license AND an auth token.
# If a user selects one of these without a token, we fail fast with a clear message.
GATED_HF_REPOS: set[str] = {
    # Meta Llama family
    "meta-llama/Llama-3.2-3B-Instruct",
    "meta-llama/Llama-3.2-1B-Instruct",
    "meta-llama/Llama-3.1-8B-Instruct",
    "meta-llama/Llama-3.1-70B-Instruct",
    "meta-llama/Meta-Llama-3-8B-Instruct",
    "meta-llama/Meta-Llama-3-70B-Instruct",
    "meta-llama/Llama-2-7b-chat-hf",
    "meta-llama/Llama-2-13b-chat-hf",
    # Gemma family
    "google/gemma-7b-it",
    "google/gemma-2b-it",
    "google/gemma-2-9b-it",
    "google/gemma-2-2b-it",
    "google/gemma-2-27b-it",
    # CodeLlama
    "codellama/CodeLlama-7b-Instruct-hf",
    "codellama/CodeLlama-13b-Instruct-hf",
}

# ── Ollama name → HuggingFace repo ID mapping ───────────────────
# This table maps common Ollama model names to their HuggingFace counterparts
# so that LLaMA-Factory can load the tokenizer and model weights correctly.
OLLAMA_TO_HF: dict[str, str] = {
    # TinyLlama
    "tinyllama": "TinyLlama/TinyLlama-1.1B-Chat-v1.0",
    "tinyllama:latest": "TinyLlama/TinyLlama-1.1B-Chat-v1.0",
    "tinyllama:1.1b": "TinyLlama/TinyLlama-1.1B-Chat-v1.0",
    # Llama 3.2
    "llama3.2": "meta-llama/Llama-3.2-3B-Instruct",
    "llama3.2:latest": "meta-llama/Llama-3.2-3B-Instruct",
    "llama3.2:1b": "meta-llama/Llama-3.2-1B-Instruct",
    "llama3.2:3b": "meta-llama/Llama-3.2-3B-Instruct",
    # Llama 3.1
    "llama3.1": "meta-llama/Llama-3.1-8B-Instruct",
    "llama3.1:latest": "meta-llama/Llama-3.1-8B-Instruct",
    "llama3.1:8b": "meta-llama/Llama-3.1-8B-Instruct",
    "llama3.1:70b": "meta-llama/Llama-3.1-70B-Instruct",
    # Llama 3
    "llama3": "meta-llama/Meta-Llama-3-8B-Instruct",
    "llama3:latest": "meta-llama/Meta-Llama-3-8B-Instruct",
    "llama3:8b": "meta-llama/Meta-Llama-3-8B-Instruct",
    "llama3:70b": "meta-llama/Meta-Llama-3-70B-Instruct",
    # Llama 2
    "llama2": "meta-llama/Llama-2-7b-chat-hf",
    "llama2:latest": "meta-llama/Llama-2-7b-chat-hf",
    "llama2:7b": "meta-llama/Llama-2-7b-chat-hf",
    "llama2:13b": "meta-llama/Llama-2-13b-chat-hf",
    # Mistral
    "mistral": "mistralai/Mistral-7B-Instruct-v0.3",
    "mistral:latest": "mistralai/Mistral-7B-Instruct-v0.3",
    "mistral:7b": "mistralai/Mistral-7B-Instruct-v0.3",
    # Mixtral
    "mixtral": "mistralai/Mixtral-8x7B-Instruct-v0.1",
    "mixtral:latest": "mistralai/Mixtral-8x7B-Instruct-v0.1",
    "mixtral:8x7b": "mistralai/Mixtral-8x7B-Instruct-v0.1",
    # Phi
    "phi3": "microsoft/Phi-3-mini-4k-instruct",
    "phi3:latest": "microsoft/Phi-3-mini-4k-instruct",
    "phi3:mini": "microsoft/Phi-3-mini-4k-instruct",
    "phi3:medium": "microsoft/Phi-3-medium-4k-instruct",
    "phi3.5": "microsoft/Phi-3.5-mini-instruct",
    "phi3.5:latest": "microsoft/Phi-3.5-mini-instruct",
    # Gemma
    "gemma": "google/gemma-7b-it",
    "gemma:latest": "google/gemma-7b-it",
    "gemma:2b": "google/gemma-2b-it",
    "gemma:7b": "google/gemma-7b-it",
    "gemma2": "google/gemma-2-9b-it",
    "gemma2:latest": "google/gemma-2-9b-it",
    "gemma2:2b": "google/gemma-2-2b-it",
    "gemma2:9b": "google/gemma-2-9b-it",
    "gemma2:27b": "google/gemma-2-27b-it",
    # Qwen
    "qwen2": "Qwen/Qwen2-7B-Instruct",
    "qwen2:latest": "Qwen/Qwen2-7B-Instruct",
    "qwen2:0.5b": "Qwen/Qwen2-0.5B-Instruct",
    "qwen2:1.5b": "Qwen/Qwen2-1.5B-Instruct",
    "qwen2:7b": "Qwen/Qwen2-7B-Instruct",
    "qwen2.5": "Qwen/Qwen2.5-7B-Instruct",
    "qwen2.5:latest": "Qwen/Qwen2.5-7B-Instruct",
    "qwen2.5:0.5b": "Qwen/Qwen2.5-0.5B-Instruct",
    "qwen2.5:1.5b": "Qwen/Qwen2.5-1.5B-Instruct",
    "qwen2.5:3b": "Qwen/Qwen2.5-3B-Instruct",
    "qwen2.5:7b": "Qwen/Qwen2.5-7B-Instruct",
    # CodeLlama
    "codellama": "codellama/CodeLlama-7b-Instruct-hf",
    "codellama:latest": "codellama/CodeLlama-7b-Instruct-hf",
    "codellama:7b": "codellama/CodeLlama-7b-Instruct-hf",
    "codellama:13b": "codellama/CodeLlama-13b-Instruct-hf",
    # Deepseek
    "deepseek-r1": "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B",
    "deepseek-r1:latest": "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B",
    "deepseek-r1:1.5b": "deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B",
    "deepseek-r1:7b": "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B",
    "deepseek-r1:8b": "deepseek-ai/DeepSeek-R1-Distill-Llama-8B",
    "deepseek-coder-v2": "deepseek-ai/DeepSeek-Coder-V2-Lite-Instruct",
    # Vicuna
    "vicuna": "lmsys/vicuna-7b-v1.5",
    "vicuna:latest": "lmsys/vicuna-7b-v1.5",
    # StarCoder
    "starcoder2": "bigcode/starcoder2-7b",
    "starcoder2:latest": "bigcode/starcoder2-7b",
    "starcoder2:3b": "bigcode/starcoder2-3b",
    "starcoder2:7b": "bigcode/starcoder2-7b",
}

# ── Template mapping: Ollama model → LLaMA-Factory template ────
OLLAMA_TO_TEMPLATE: dict[str, str] = {
    "tinyllama": "default",
    "llama2": "llama2",
    "llama3": "llama3",
    "llama3.1": "llama3",
    "llama3.2": "llama3",
    "mistral": "mistral",
    "mixtral": "mistral",
    "phi3": "phi",
    "phi3.5": "phi",
    "gemma": "gemma",
    "gemma2": "gemma",
    "qwen2": "qwen",
    "qwen2.5": "qwen",
    "codellama": "llama2",
    "deepseek-r1": "deepseek",
    "deepseek-coder-v2": "deepseek",
    "vicuna": "vicuna",
    "starcoder2": "default",
}


def resolve_hf_model_name(ollama_name: str) -> str:
    """Resolve an Ollama model name (e.g. 'tinyllama:latest') to a HuggingFace repo ID.

    Falls back to the original name if no mapping is found (e.g. user typed an HF repo directly).
    """
    clean = ollama_name.strip().lower()
    if clean in OLLAMA_TO_HF:
        resolved = OLLAMA_TO_HF[clean]
        logger.info("[MODEL RESOLVE] '%s' → '%s' (from lookup table)", ollama_name, resolved)
        return resolved

    # Try without :latest suffix
    base = clean.split(":")[0]
    if base in OLLAMA_TO_HF:
        resolved = OLLAMA_TO_HF[base]
        logger.info("[MODEL RESOLVE] '%s' (base: '%s') → '%s'", ollama_name, base, resolved)
        return resolved

    # If it already looks like a valid HF repo (contains /) pass through
    if "/" in ollama_name and ":" not in ollama_name:
        logger.info("[MODEL RESOLVE] '%s' looks like a HF repo ID, using as-is", ollama_name)
        return ollama_name

    # Last resort: strip the tag part (e.g. 'model:7b' → 'model')
    # This will likely fail at HF but at least won't crash with validation error
    if ":" in ollama_name:
        stripped = ollama_name.split(":")[0]
        logger.warning(
            "[MODEL RESOLVE] No mapping for '%s'. Stripped to '%s' — this may fail at HF. "
            "Consider adding it to OLLAMA_TO_HF in ollama_service.py.",
            ollama_name, stripped,
        )
        return stripped

    logger.info("[MODEL RESOLVE] '%s' has no mapping, using as-is", ollama_name)
    return ollama_name


def resolve_chat_template(ollama_name: str) -> str:
    """Resolve the LLaMA-Factory chat template for an Ollama model."""
    clean = ollama_name.strip().lower()
    base = clean.split(":")[0]

    if base in OLLAMA_TO_TEMPLATE:
        template = OLLAMA_TO_TEMPLATE[base]
        logger.info("[TEMPLATE RESOLVE] '%s' → template '%s'", ollama_name, template)
        return template

    logger.info("[TEMPLATE RESOLVE] No template for '%s', using 'default'", ollama_name)
    return "default"


def is_gated_model(hf_repo: str) -> bool:
    """Check if a HuggingFace repo requires authentication (gated access)."""
    return hf_repo in GATED_HF_REPOS


def find_hf_cache_path(hf_repo: str) -> str | None:
    """Check if HuggingFace model weights are already cached locally.

    HF hub caches models at: ~/.cache/huggingface/hub/models--{org}--{name}/
    If the cache exists with snapshots, LLaMA-Factory can load from it directly
    without re-downloading.

    Returns the repo ID if cached (HF handles cache lookup internally),
    or None if not cached.
    """
    cache_dir = Path.home() / ".cache" / "huggingface" / "hub"
    # HF cache uses -- as separator: "meta-llama/Llama-3.2" → "models--meta-llama--Llama-3.2"
    cache_name = f"models--{hf_repo.replace('/', '--')}"
    model_cache = cache_dir / cache_name

    if model_cache.exists():
        snapshots = model_cache / "snapshots"
        if snapshots.exists() and any(snapshots.iterdir()):
            logger.info("[HF CACHE] ✓ Found cached weights for '%s' at %s", hf_repo, model_cache)
            return hf_repo  # HF transformers will find it in cache automatically
        logger.info("[HF CACHE] Directory exists but no snapshots for '%s'", hf_repo)
    else:
        logger.info("[HF CACHE] No cache found for '%s' (looked at %s)", hf_repo, model_cache)

    return None


def preflight_model_check(ollama_name: str, hf_token: str | None = None) -> dict:
    """Run pre-flight checks on a model before training.

    Returns a dict with:
      - ok: bool — whether training can proceed
      - hf_repo: str — resolved HF repo ID
      - is_gated: bool — whether the model requires HF auth
      - is_cached: bool — whether HF weights are locally cached
      - message: str | None — human-readable error/warning
    """
    hf_repo = resolve_hf_model_name(ollama_name)
    gated = is_gated_model(hf_repo)
    cached = find_hf_cache_path(hf_repo) is not None
    token_available = bool(hf_token and hf_token.strip())

    logger.info(
        "[PREFLIGHT] Model check: ollama='%s' hf='%s' gated=%s cached=%s token=%s",
        ollama_name, hf_repo, gated, cached, "yes" if token_available else "no",
    )

    # Case 1: Gated model without token and not cached
    if gated and not cached and not token_available:
        msg = (
            f"Model '{hf_repo}' requires HuggingFace authentication. "
            f"Please set HUGGINGFACE_TOKEN in your .env file and accept the model license at "
            f"https://huggingface.co/{hf_repo}"
        )
        return {"ok": False, "hf_repo": hf_repo, "is_gated": True, "is_cached": False, "message": msg}

    # Case 2: Gated model with token (or cached) — proceed
    if gated and (token_available or cached):
        return {
            "ok": True, "hf_repo": hf_repo, "is_gated": True, "is_cached": cached,
            "message": "Gated model — using HF token for authentication" if not cached else None,
        }

    # Case 3: Non-gated model — always OK
    return {
        "ok": True, "hf_repo": hf_repo, "is_gated": False, "is_cached": cached,
        "message": None,
    }


async def search_ollama_library(query: str, limit: int = 20) -> list[dict]:
    """Search the Ollama model catalog for models matching the query.

    Ollama does not provide a public search API for its library,
    so we maintain a comprehensive curated catalog and filter locally.
    Returns a list of dicts with name, description, tags (size variants), and size.
    """
    logger.info("[OLLAMA SEARCH] Searching catalog for: '%s' (limit=%d)", query, limit)

    CATALOG = [
        # ── Meta Llama ──
        {"name": "llama3.2", "description": "Meta's Llama 3.2 — lightweight & powerful", "tags": ["1b", "3b"], "size": "2.0 GB"},
        {"name": "llama3.1", "description": "Meta's Llama 3.1 — industry leading open model", "tags": ["8b", "70b", "405b"], "size": "4.7 GB"},
        {"name": "llama3", "description": "Meta's Llama 3", "tags": ["8b", "70b"], "size": "4.7 GB"},
        {"name": "llama2", "description": "Meta's original Llama 2", "tags": ["7b", "13b", "70b"], "size": "3.8 GB"},
        # ── Mistral / Mixtral ──
        {"name": "mistral", "description": "Mistral AI 7B — fast and capable", "tags": ["7b"], "size": "4.1 GB"},
        {"name": "mixtral", "description": "Mistral Mixture of Experts — multi-expert architecture", "tags": ["8x7b", "8x22b"], "size": "26 GB"},
        {"name": "mistral-small", "description": "Mistral Small — efficient reasoning model", "tags": ["24b"], "size": "14 GB"},
        {"name": "mistral-nemo", "description": "Mistral Nemo — compact reasoning", "tags": ["12b"], "size": "7.1 GB"},
        # ── Google Gemma ──
        {"name": "gemma3", "description": "Google's Gemma 3 — latest generation", "tags": ["1b", "4b", "12b", "27b"], "size": "2.3 GB"},
        {"name": "gemma2", "description": "Google's Gemma 2 — efficient & capable", "tags": ["2b", "9b", "27b"], "size": "5.4 GB"},
        {"name": "gemma", "description": "Google's Gemma — open weights", "tags": ["2b", "7b"], "size": "5.0 GB"},
        # ── Alibaba Qwen ──
        {"name": "qwen3", "description": "Alibaba's Qwen 3 — cutting-edge multilingual", "tags": ["0.6b", "1.7b", "4b", "8b", "14b", "30b", "32b"], "size": "4.7 GB"},
        {"name": "qwen2.5", "description": "Alibaba's Qwen 2.5 — strong general-purpose", "tags": ["0.5b", "1.5b", "3b", "7b", "14b", "32b", "72b"], "size": "4.7 GB"},
        {"name": "qwen2.5-coder", "description": "Qwen 2.5 optimized for coding tasks", "tags": ["0.5b", "1.5b", "3b", "7b", "14b", "32b"], "size": "4.7 GB"},
        {"name": "qwen2", "description": "Alibaba's Qwen 2", "tags": ["0.5b", "1.5b", "7b", "72b"], "size": "4.4 GB"},
        # ── Microsoft Phi ──
        {"name": "phi4", "description": "Microsoft's Phi-4 — strong small model", "tags": ["14b"], "size": "9.1 GB"},
        {"name": "phi3.5", "description": "Microsoft's Phi-3.5 — efficient reasoning", "tags": ["3.8b"], "size": "2.2 GB"},
        {"name": "phi3", "description": "Microsoft's Phi-3 — compact & powerful", "tags": ["3.8b", "14b"], "size": "2.3 GB"},
        # ── DeepSeek ──
        {"name": "deepseek-r1", "description": "DeepSeek R1 — reasoning-first model", "tags": ["1.5b", "7b", "8b", "14b", "32b", "70b", "671b"], "size": "4.7 GB"},
        {"name": "deepseek-v3", "description": "DeepSeek V3 — large MoE model", "tags": ["671b"], "size": "404 GB"},
        {"name": "deepseek-coder-v2", "description": "DeepSeek Coder V2 — code generation", "tags": ["16b", "236b"], "size": "8.9 GB"},
        # ── Coding Models ──
        {"name": "codellama", "description": "Meta's Code Llama — code generation & infill", "tags": ["7b", "13b", "34b", "70b"], "size": "3.8 GB"},
        {"name": "codegemma", "description": "Google's CodeGemma — code-focused", "tags": ["2b", "7b"], "size": "5.0 GB"},
        {"name": "starcoder2", "description": "BigCode StarCoder 2 — code generation", "tags": ["3b", "7b", "15b"], "size": "4.0 GB"},
        {"name": "codestral", "description": "Mistral's Codestral — enterprise code model", "tags": ["22b"], "size": "12.3 GB"},
        # ── Small / Efficient ──
        {"name": "tinyllama", "description": "TinyLlama 1.1B — tiny but capable for edge", "tags": ["1.1b"], "size": "0.6 GB"},
        {"name": "smollm2", "description": "HuggingFace SmolLM 2 — ultra-compact", "tags": ["135m", "360m", "1.7b"], "size": "1.0 GB"},
        {"name": "moondream", "description": "Moondream — tiny vision-language model", "tags": ["1.8b"], "size": "1.7 GB"},
        # ── Chat / General ──
        {"name": "vicuna", "description": "LMSYS Vicuna — fine-tuned LLaMA", "tags": ["7b", "13b", "33b"], "size": "3.8 GB"},
        {"name": "neural-chat", "description": "Intel Neural Chat — optimized for dialogue", "tags": ["7b"], "size": "4.1 GB"},
        {"name": "openchat", "description": "OpenChat — strong open chat model", "tags": ["7b"], "size": "4.1 GB"},
        {"name": "zephyr", "description": "HuggingFace Zephyr — DPO-tuned Mistral", "tags": ["7b"], "size": "4.1 GB"},
        {"name": "solar", "description": "Upstage Solar — depth-upscaled LLaMA", "tags": ["10.7b"], "size": "6.1 GB"},
        {"name": "nous-hermes2", "description": "Nous Research Hermes 2 — versatile chat", "tags": ["7b", "34b"], "size": "4.1 GB"},
        # ── Stability / Other ──
        {"name": "stablelm2", "description": "Stability AI StableLM 2", "tags": ["1.6b", "12b"], "size": "1.0 GB"},
        {"name": "yi", "description": "01.AI Yi — strong bilingual model", "tags": ["6b", "9b", "34b"], "size": "3.5 GB"},
        {"name": "command-r", "description": "Cohere Command R — retrieval-augmented", "tags": ["35b", "104b"], "size": "20 GB"},
        {"name": "orca-mini", "description": "Orca Mini — reasoning-tuned small model", "tags": ["3b", "7b", "13b"], "size": "2.0 GB"},
        {"name": "dolphin-phi", "description": "Dolphin Phi — uncensored Phi variant", "tags": ["2.7b"], "size": "1.6 GB"},
        {"name": "wizard-vicuna-uncensored", "description": "Wizard Vicuna — unrestricted chat", "tags": ["7b", "13b", "30b"], "size": "3.8 GB"},
        {"name": "falcon", "description": "TII Falcon — open-source enterprise LLM", "tags": ["7b", "40b", "180b"], "size": "3.8 GB"},
    ]

    q = query.lower().strip()
    filtered = [
        {**m, "pulls": 0}
        for m in CATALOG
        if q in m["name"].lower() or q in m["description"].lower()
    ]

    logger.info("[OLLAMA SEARCH] Catalog search returned %d results for '%s'", len(filtered), query)
    return filtered[:limit]


async def check_ollama_running() -> bool:
    """Return True if Ollama is reachable."""
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get(f"{settings.ollama_base_url}/api/tags")
            return resp.status_code == 200
    except (httpx.ConnectError, httpx.TimeoutException, OSError):
        return False


def _find_ollama_binary() -> str | None:
    """Find a local Ollama binary on the current system."""
    path = shutil.which("ollama")
    if path:
        return path

    candidates = ["/usr/local/bin/ollama", "/opt/homebrew/bin/ollama"]

    if platform.system() == "Windows":
        localappdata = Path.home() / "AppData" / "Local"
        candidates.extend([
            str(localappdata / "Programs" / "Ollama" / "ollama.exe"),
            r"C:\Program Files\Ollama\ollama.exe",
        ])

    for candidate in candidates:
        if Path(candidate).exists():
            return candidate
    return None


async def ensure_ollama_running() -> bool:
    """Start Ollama locally if possible and wait for it to become ready."""
    if await check_ollama_running():
        return True

    ollama = _find_ollama_binary()
    if not ollama:
        return False

    try:
        subprocess.Popen(
            [ollama, "serve"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
    except Exception:
        return False

    for _ in range(20):
        await asyncio.sleep(1)
        if await check_ollama_running():
            return True

    return False


async def list_ollama_models() -> list[ModelInfo]:
    """Fetch installed models from Ollama."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{settings.ollama_base_url}/api/tags")
            resp.raise_for_status()
            data = resp.json()
    except (httpx.ConnectError, httpx.TimeoutException, httpx.HTTPStatusError, OSError):
        return []

    models: list[ModelInfo] = []
    for m in data.get("models", []):
        name = m.get("name", "")
        size_bytes = m.get("size", 0)
        size_gb = round(size_bytes / (1024**3), 2) if size_bytes else 0.0

        # Parse family from model name (e.g. "llama3.2:3b" → "llama")
        family = name.split(":")[0].split("/")[-1].rstrip("0123456789.")

        models.append(
            ModelInfo(
                id=name,
                name=name,
                family=family,
                size_gb=size_gb,
                vram_required_gb=size_gb * 1.2,
                quantization=m.get("details", {}).get("quantization_level", ""),
                context_length=m.get("details", {}).get("context_length", 2048),
                is_installed=True,
                source="ollama",
                tags=[f.strip() for f in m.get("details", {}).get("families", [])],
            )
        )
    return models


async def stream_chat(
    model: str,
    messages: list[dict[str, str]],
    temperature: float = 0.7,
    max_tokens: int = 2048,
) -> AsyncIterator[str]:
    """Stream chat tokens from Ollama as an async iterator of text chunks."""
    payload = {
        "model": model,
        "messages": messages,
        "stream": True,
        "options": {
            "temperature": temperature,
            "num_predict": max_tokens,
        },
    }

    async with httpx.AsyncClient(timeout=httpx.Timeout(300.0, connect=5.0)) as client:
        async with client.stream(
            "POST",
            f"{settings.ollama_base_url}/api/chat",
            json=payload,
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line.strip():
                    continue
                try:
                    import json

                    data = json.loads(line)
                    content = data.get("message", {}).get("content", "")
                    done = data.get("done", False)
                    if content:
                        yield content
                    if done:
                        return
                except (ValueError, KeyError):
                    continue


_active_pulls: dict[str, asyncio.Event] = {}


async def pull_model(model_name: str) -> AsyncIterator[dict]:
    """Pull/download a model from Ollama. Yields progress dicts.

    Supports cancellation via cancel_pull(model_name).
    """
    cancel_event = asyncio.Event()
    _active_pulls[model_name] = cancel_event
    payload = {"name": model_name, "stream": True}

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(600.0, connect=5.0)) as client:
            async with client.stream(
                "POST",
                f"{settings.ollama_base_url}/api/pull",
                json=payload,
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    # Check for cancellation
                    if cancel_event.is_set():
                        logger.info("[OLLAMA] Pull cancelled by user: %s", model_name)
                        yield {"status": "cancelled", "progress": 0, "total": 0, "completed": 0}
                        return

                    if not line.strip():
                        continue
                    try:
                        import json

                        data = json.loads(line)
                        status = data.get("status", "")
                        total = data.get("total", 0)
                        completed = data.get("completed", 0)

                        progress = 0
                        if total > 0:
                            progress = round((completed / total) * 100)

                        yield {
                            "status": status,
                            "progress": progress,
                            "total": total,
                            "completed": completed,
                        }

                        # Check for completion
                        if status == "success":
                            return
                    except (ValueError, KeyError):
                        continue
    finally:
        _active_pulls.pop(model_name, None)


async def cancel_pull(model_name: str) -> bool:
    """Cancel an active model pull. Returns True if a pull was cancelled."""
    event = _active_pulls.get(model_name)
    if event:
        logger.info("[OLLAMA] Cancelling pull: %s", model_name)
        event.set()
        return True
    logger.warning("[OLLAMA] No active pull found for: %s", model_name)
    return False


async def delete_model(model_name: str) -> bool:
    """Delete a model from Ollama. Returns True on success."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.delete(
                f"{settings.ollama_base_url}/api/delete",
                json={"name": model_name},
            )
            return resp.status_code == 200
    except (httpx.ConnectError, httpx.TimeoutException, OSError):
        return False


