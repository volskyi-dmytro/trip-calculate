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
import os
from contextlib import asynccontextmanager
from typing import Annotated, Any, AsyncGenerator

from fastapi import Depends, FastAPI, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

import metrics
from cost_tracking import CostTrackingCallback, clear_session, get_session_totals
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


def _init_otel() -> None:
    """
    Initialize the OpenTelemetry SDK (metrics + traces) with OTLP gRPC exporters.

    No-op if the SDK or the exporter packages are not installed (common in test
    environments). The endpoint is read from OTEL_EXPORTER_OTLP_ENDPOINT; if
    unset the SDK is initialized with no exporter (instruments work but emit
    nowhere — useful for unit tests).
    """
    try:
        from opentelemetry import metrics as otel_metrics, trace as otel_trace
        from opentelemetry.sdk.metrics import MeterProvider
        from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
    except ImportError:
        logger.info("opentelemetry SDK not installed — skipping OTEL init (metrics/traces no-op)")
        return

    service_name = os.environ.get("OTEL_SERVICE_NAME", "tripcalc-langgraph-agent")
    endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT")
    resource = Resource.create({"service.name": service_name})

    metric_readers = []
    span_exporters = []
    if endpoint:
        try:
            from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import (
                OTLPMetricExporter,
            )
            from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import (
                OTLPSpanExporter,
            )
            metric_readers.append(
                PeriodicExportingMetricReader(OTLPMetricExporter(endpoint=endpoint, insecure=True))
            )
            span_exporters.append(OTLPSpanExporter(endpoint=endpoint, insecure=True))
        except ImportError:
            logger.warning(
                "opentelemetry-exporter-otlp-proto-grpc not installed — OTLP export disabled"
            )

    otel_metrics.set_meter_provider(
        MeterProvider(resource=resource, metric_readers=metric_readers)
    )
    tracer_provider = TracerProvider(resource=resource)
    for exporter in span_exporters:
        tracer_provider.add_span_processor(BatchSpanProcessor(exporter))
    otel_trace.set_tracer_provider(tracer_provider)

    # FastAPI + httpx auto-instrumentation (best-effort).
    try:
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor

        FastAPIInstrumentor.instrument_app(app)
        HTTPXClientInstrumentor().instrument()
    except ImportError:
        logger.info("FastAPI/httpx auto-instrumentation packages not installed — skipping")
    except Exception as exc:
        logger.warning("OTEL auto-instrumentation failed: %s", type(exc).__name__)

    logger.info(
        "OpenTelemetry initialized: service=%s endpoint=%s",
        service_name,
        endpoint or "(no exporter — instruments are no-op)",
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup: init OTEL, set up Postgres persistence (idempotent), compile the graph.
    Shutdown: close the Postgres connection pool cleanly.
    """
    global _compiled_graph, _checkpointer, _store, _pg_pool

    logger.info("Agent service starting up...")

    # M5: OTEL must be initialized before graph compile so any traces emitted
    # during compile are captured.
    _init_otel()

    # Runs idempotent CREATE TABLE / CREATE INDEX on the langgraph schema.
    # Also ensures pgvector extension exists before store.setup().
    _checkpointer, _store, _pg_pool = await setup_persistence()

    _compiled_graph = compile_graph(_checkpointer, _store)
    logger.info("LangGraph agent compiled and ready")

    yield

    logger.info("Agent service shutting down")
    if _pg_pool is not None:
        await _pg_pool.close()


def _build_langfuse_callback() -> Any | None:
    """
    Return a Langfuse LangChain callback handler if the SDK is installed and
    LANGFUSE_PUBLIC_KEY + LANGFUSE_SECRET_KEY are set. Returns None otherwise
    (callback list will be empty — no Langfuse traces, but the agent runs).
    """
    public_key = os.environ.get("LANGFUSE_PUBLIC_KEY")
    secret_key = os.environ.get("LANGFUSE_SECRET_KEY")
    if not (public_key and secret_key):
        return None
    try:
        from langfuse.langchain import CallbackHandler  # type: ignore[import-not-found]
    except ImportError:
        logger.debug("langfuse SDK not installed — Langfuse tracing disabled")
        return None
    try:
        return CallbackHandler()
    except Exception as exc:
        logger.warning("Langfuse CallbackHandler init failed: %s", type(exc).__name__)
        return None


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

    M5:
      - The `done` frame includes `tokens` and `cost_usd` totals from the
        per-thread CostTrackingCallback accumulator.
      - Emits agent_sessions_total{status} and agent_session_cost_usd metrics
        on terminal events.
      - Treats a `custom` event of type "budget_exhausted" as a terminal hint:
        the next terminal event (done|error) will be tagged status="budget_exhausted".
    """
    queue: asyncio.Queue[str | None] = asyncio.Queue()
    session_status_hint: dict[str, str] = {"status": "ok"}

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
                    # Inspect for budget_exhausted hint so we can label the
                    # session metric correctly on the terminal done event.
                    if isinstance(chunk, dict) and chunk.get("type") == "budget_exhausted":
                        session_status_hint["status"] = "budget_exhausted"
                    await queue.put(_sse_event("custom", chunk))
                # Silently drop unknown stream modes to be forward-compatible.

            # Graph finished normally — emit terminal done event with cost totals.
            totals = get_session_totals(thread_id)
            await queue.put(
                _sse_event(
                    "done",
                    {
                        "thread_id": thread_id,
                        "tokens": int(totals.get("tokens", 0)),
                        "cost_usd": float(totals.get("cost_usd", 0.0)),
                    },
                )
            )
            # Emit session metrics — status from the hint (default "ok").
            try:
                metrics.agent_sessions_total.add(1, {"status": session_status_hint["status"]})
                metrics.agent_session_cost_usd.record(
                    float(totals.get("cost_usd", 0.0)),
                    {"status": session_status_hint["status"]},
                )
            except Exception as exc:
                logger.debug("metric emission failed: %s", type(exc).__name__)
            # Free the per-thread accumulator entry.
            clear_session(thread_id)
        except Exception:  # pylint: disable=broad-except
            # Full traceback goes to server logs. The browser-facing error frame
            # carries a generic message only — str(exc) may contain connection strings,
            # schema details, or upstream API keys.
            logger.exception("Graph stream error for thread_id=%s", thread_id)
            await queue.put(
                _sse_event("error", {"message": "Agent encountered an internal error. Please try again."})
            )
            try:
                metrics.agent_sessions_total.add(1, {"status": "error"})
            except Exception:
                pass
            clear_session(thread_id)
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

    # M5: cap claims surfaced from JWT (security.verify_internal_jwt populates
    # them with sensible defaults if older tokens lack them).
    daily_cap_usd = float(claims.get("daily_cap_usd", 0))
    monthly_cap_usd = float(claims.get("monthly_cap_usd", 0))

    # M5: per-thread cost-tracking callback. The accumulator is keyed by
    # thread_id so concurrent sessions never bleed into one another.
    cost_callback = CostTrackingCallback(thread_id=thread_id)
    callbacks: list[Any] = [cost_callback]

    # M5: optional Langfuse callback for richer traces (no-op if SDK or
    # LANGFUSE_PUBLIC_KEY/SECRET_KEY are not set).
    langfuse_callback = _build_langfuse_callback()
    if langfuse_callback is not None:
        callbacks.append(langfuse_callback)

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
            # M5: cap claims read by BudgetGuardMiddleware via get_config().
            "daily_cap_usd": daily_cap_usd,
            "monthly_cap_usd": monthly_cap_usd,
        },
        # M5: Langfuse trace metadata contract (docs/observability-setup.md).
        # langfuse_user_id + langfuse_session_id are recognized by the Langfuse
        # callback handler and surface as first-class fields in the Langfuse UI.
        "metadata": {
            "user_id": user_id,
            "langfuse_user_id": user_id,
            "langfuse_session_id": thread_id,
            "langfuse_tags": ["trip-planner", "v1"],
        },
        "callbacks": callbacks,
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
