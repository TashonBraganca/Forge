"""Chat endpoint: SSE proxy to Ollama chat API."""

from __future__ import annotations

import asyncio
import json
from typing import AsyncIterator

from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse

from models.schemas import ChatRequest, ChatToken
from services.ollama_service import check_ollama_running, stream_chat

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/stream")
async def chat_stream(req: ChatRequest) -> EventSourceResponse:
    """Stream chat completion tokens from Ollama via SSE."""
    if not await check_ollama_running():
        raise HTTPException(
            status_code=503,
            detail="Ollama is not running. Start Ollama first.",
        )

    # Prepend system message if provided
    messages = list(req.messages)
    if req.system:
        messages.insert(0, {"role": "system", "content": req.system})

    async def generate() -> AsyncIterator[dict[str, str]]:
        try:
            async for token_text in stream_chat(
                model=req.model,
                messages=messages,
                temperature=req.temperature,
                max_tokens=req.max_tokens,
            ):
                payload = ChatToken(token=token_text, done=False)
                yield {"data": payload.model_dump_json()}

            # Final done signal
            done_payload = ChatToken(token="", done=True)
            yield {"data": done_payload.model_dump_json()}

        except asyncio.CancelledError:
            pass
        except Exception as exc:
            error_payload = json.dumps({"error": str(exc)})
            yield {"data": error_payload}

    return EventSourceResponse(
        generate(),
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
