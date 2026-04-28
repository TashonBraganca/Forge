"""GET /api/health → HardwareStats"""

from fastapi import APIRouter

from models.schemas import HardwareStats
from services.hardware_service import get_hardware_stats
from services.ollama_service import check_ollama_running

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HardwareStats)
async def health_check() -> HardwareStats:
    """Return hardware stats and service status.

    Polled every 2 seconds by the frontend.
    Must complete in <200ms (GPU stats are cached for 1 second).
    """
    ollama_ok = await check_ollama_running()
    return await get_hardware_stats(ollama_running=ollama_ok)
