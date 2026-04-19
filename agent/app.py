"""
FastAPI application — LangGraph agent microservice.

Endpoints:
  GET  /healthz             — liveness probe (no auth required)
  POST /api/agent/stream    — SSE-streamed agent turns (JWT required)

SSE event names (matches the contract documented in docs/agent-sse-contract.md):
  updates   — node-level state updates from the graph
  messages  — LLM message deltas (token streaming)
  custom    — tool-emitted custom events
  done      — terminal event, signals stream end
  error     — JSON error payload, stream closes after this

CLAUDE.md §Non-negotiable:
  - 15-second SSE keep-alive `: ping\n\n`
  - StreamingResponse(media_type="text/event-stream")
  - Headers: Cache-Control: no-cache, X-Accel-Buffering: no
  - verify_internal_jwt dependency on every agent request
"""

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from typing import Annotated, Any, AsyncGenerator

from fastapi import Depends, FastAPI, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from graph import compile_graph
from persistence import setup_persistence
from security import verify_internal_jwt

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Module-level graph reference (populated in lifespan)
# ---------------------------------------------------------------------------
_compiled_graph: Any = None
_checkpointer: Any = None
_store: Any = None
_pg_pool: Any = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup: set up Postgres persistence (idempotent) and compile the graph.
    Shutdown: close the Postgres connection pool cleanly.
    """
    global _compiled_graph, _checkpointer, _store, _pg_pool

    logger.info("Agent service starting up...")

    # Runs idempotent CREATE TABLE / CREATE INDEX on the langgraph schema.
    # Also ensures pgvector extension exists before store.setup().
    _checkpointer, _store, _pg_pool = await setup_persistence()

    _compiled_graph = compile_graph(_checkpointer, _store)
    logger.info("LangGraph agent compiled and ready")

    yield

    logger.info("Agent service shutting down")
    if _pg_pool is not None:
        await _pg_pool.close()


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
app = FastAPI(
    title="TripCalculate LangGraph Agent",
    version="0.4.0",  # M4: full 6-tool set, outer graph (finalize + critic), middleware stack
    lifespan=lifespan,
)


# ---------------------------------------------------------------------------
# Health endpoint — no auth, used by Docker HEALTHCHECK and compose depends_on
# ---------------------------------------------------------------------------
@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# SSE stream helpers
# ---------------------------------------------------------------------------
_KEEP_ALIVE_INTERVAL = 15  # seconds between ping frames
_PING_FRAME = ": ping\n\n"  # SSE comment; keeps Cloudflare/nginx from closing idle connections


def _sse_event(event: str, data: Any) -> str:
    """Format a single SSE event frame."""
    payload = json.dumps(data) if not isinstance(data, str) else data
    return f"event: {event}\ndata: {payload}\n\n"


async def _stream_with_keepalive(
    graph_stream: AsyncGenerator,
    thread_id: str,
) -> AsyncGenerator[str, None]:
    """
    Merge graph stream events with periodic SSE keep-alive pings.

    The keep-alive runs as a background task: every _KEEP_ALIVE_INTERVAL seconds
    it sends `: ping\n\n` if no other event has been emitted.  This prevents
    Cloudflare (99s idle timeout) and nginx (proxy_read_timeout) from closing
    the connection during a long LLM inference step.
    """
    queue: asyncio.Queue[str | None] = asyncio.Queue()

    async def _pump_graph() -> None:
        """Read graph events and push SSE frames onto the queue."""
        try:
            async for stream_mode, chunk in graph_stream:
                if stream_mode == "messages":
                    # chunk is (AIMessageChunk, metadata) tuple from LangGraph messages mode
                    msg_chunk, metadata = chunk
                    await queue.put(
                        _sse_event(
                            "messages",
                            {
                                "content": msg_chunk.content,
                                "id": getattr(msg_chunk, "id", None),
                                "metadata": metadata,
                            },
                        )
                    )
                elif stream_mode == "updates":
                    await queue.put(_sse_event("updates", chunk))
                elif stream_mode == "custom":
                    await queue.put(_sse_event("custom", chunk))
                # Silently drop unknown stream modes to be forward-compatible.

            # Graph finished normally — emit terminal event.
            await queue.put(_sse_event("done", {"thread_id": thread_id}))
        except Exception:  # pylint: disable=broad-except
            # Full traceback goes to server logs. The browser-facing error frame
            # carries a generic message only — str(exc) may contain connection strings,
            # schema details, or upstream API keys.
            logger.exception("Graph stream error for thread_id=%s", thread_id)
            await queue.put(
                _sse_event("error", {"message": "Agent encountered an internal error. Please try again."})
            )
        finally:
            # Sentinel: tell the ping loop to stop.
            await queue.put(None)

    async def _ping_loop() -> None:
        """Push keep-alive pings while the graph is running."""
        while True:
            await asyncio.sleep(_KEEP_ALIVE_INTERVAL)
            # Only ping if the queue is empty (no real events pending).
            if queue.empty():
                await queue.put(_PING_FRAME)

    pump_task = asyncio.create_task(_pump_graph())
    ping_task = asyncio.create_task(_ping_loop())

    try:
        while True:
            frame = await queue.get()
            if frame is None:
                # Sentinel from pump — graph is done.
                break
            yield frame
    finally:
        pump_task.cancel()
        ping_task.cancel()
        # Suppress CancelledError from the background tasks.
        await asyncio.gather(pump_task, ping_task, return_exceptions=True)


# ---------------------------------------------------------------------------
# Agent stream endpoint
# ---------------------------------------------------------------------------
class AgentChatRequest(BaseModel):
    message: str = Field(description="User message to the agent.", min_length=1, max_length=4096)
    thread_id: str = Field(description="Conversation thread identifier (UUID recommended).")


@app.post("/api/agent/stream")
async def agent_stream(
    body: AgentChatRequest,
    claims: Annotated[dict, Depends(verify_internal_jwt)],
) -> StreamingResponse:
    """
    Stream an agent response as Server-Sent Events.

    Requires a valid HS256 JWT in the Authorization: Bearer header.
    The JWT `sub` claim identifies the user for preference injection (M4+).

    SSE event names: updates | messages | custom | done | error
    """
    user_id = claims["sub"]
    thread_id = body.thread_id

    # user_id is PII (Google sub); keep it at DEBUG so INFO logs can be shipped to
    # shared log stores without privacy review. thread_id is safe at INFO.
    logger.debug("Agent stream user_id=%s", user_id)
    logger.info(
        "Agent stream: thread_id=%s message_len=%d",
        thread_id,
        len(body.message),
    )

    if _compiled_graph is None:
        # Should not happen in normal operation — lifespan ensures graph is ready.
        async def _error_stream():
            yield _sse_event("error", {"message": "Agent not ready. Please retry."})
        return StreamingResponse(
            _error_stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            },
        )

    # LangGraph config: thread_id ties the run to its checkpoint history.
    # user_id is included in configurable so InjectPreferencesMiddleware can
    # read it via get_config() — the middleware needs it scoped per user.
    # CLAUDE.md §Non-negotiable: recursion_limit=40 enforced at the per-invocation config
    # level (top-level key, sibling of "configurable") so LangGraph merges it correctly
    # into the run config. The with_config() in graph.py is defense-in-depth only.
    config = {
        "recursion_limit": 40,
        "configurable": {
            "thread_id": thread_id,
            "user_id": user_id,  # Read by InjectPreferencesMiddleware (M4+)
        },
        # Tag with user_id for Langfuse trace metadata (M5).
        "metadata": {"user_id": user_id},
    }

    input_messages = {"messages": [{"role": "user", "content": body.message}]}

    # astream with all three stream modes so the frontend receives granular events.
    graph_stream = _compiled_graph.astream(
        input_messages,
        config=config,
        stream_mode=["custom", "updates", "messages"],
    )

    return StreamingResponse(
        _stream_with_keepalive(graph_stream, thread_id),
        media_type="text/event-stream",
        headers={
            # Required to prevent nginx and Cloudflare buffering the stream.
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
