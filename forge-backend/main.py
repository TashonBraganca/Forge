"""Forge Backend — FastAPI application entry point."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from routers.health import router as health_router
from routers.models import router as models_router
from routers.datasets import router as datasets_router
from routers.training import router as training_router
from routers.chat import router as chat_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("forge")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan: startup and shutdown logic."""
    # ── Startup ───────────────────────────────────────────────
    logger.info("Forge Backend starting up...")

    # Create data directories
    settings.ensure_dirs()
    logger.info(f"Data directories: datasets={settings.datasets_dir}, models={settings.models_dir}")

    # Detect GPU (NVIDIA or Apple Silicon)
    from services.hardware_service import _get_gpu_info
    gpu = _get_gpu_info()
    if gpu.get("gpu_name"):
        logger.info(f"GPU detected: {gpu['gpu_name']}")
        if gpu.get("vram_total_gb"):
            logger.info(f"  VRAM: {gpu['vram_free_gb']}/{gpu['vram_total_gb']} GB available")
    else:
        logger.warning("No GPU detected — training will be CPU-only")

    # Check Ollama
    from services.ollama_service import check_ollama_running

    if await check_ollama_running():
        logger.info(f"Ollama connected at {settings.ollama_base_url}")
    else:
        logger.warning(f"Ollama not reachable at {settings.ollama_base_url}")

    logger.info(f"Forge Backend ready at http://{settings.forge_host}:{settings.forge_port}")

    yield

    # ── Shutdown ──────────────────────────────────────────────
    try:
        import pynvml

        pynvml.nvmlShutdown()
    except Exception:
        pass
    logger.info("Forge Backend shut down.")


app = FastAPI(
    title="Forge Backend",
    description="Local LLM fine-tuning studio API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.frontend_origin,
        "http://localhost:3000",
        "http://localhost:3004",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Register routers ──────────────────────────────────────────
app.include_router(health_router, prefix="/api")
app.include_router(models_router, prefix="/api")
app.include_router(datasets_router, prefix="/api")
app.include_router(training_router, prefix="/api")
app.include_router(chat_router, prefix="/api")
