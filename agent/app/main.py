import asyncio
import logging
import os
import time
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from langfuse import Langfuse, propagate_attributes
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from . import db
from .fetchers.refresh import refresh_all
from .schema import ParseRouteRequest, ParseRouteResponse
from .graph import build_graph
from .streaming import stream_route

load_dotenv()

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Fuel data is optional infrastructure: without a DB the agent still
    # plans routes, it just returns no fuel_data.
    scheduler = None
    if await db.open_pool():
        scheduler = AsyncIOScheduler(timezone="UTC")
        scheduler.add_job(refresh_all, "cron", hour=4, minute=10)
        scheduler.start()
        # Startup refresh runs in the background so boot isn't blocked on
        # slow external sources; seed rows cover the gap.
        app.state.startup_refresh_task = asyncio.create_task(refresh_all())  # Retain for GC protection
        logger.info("fuel price cache enabled (daily refresh 04:10 UTC)")
    else:
        logger.warning("fuel prices disabled (no DB pool — unset DATABASE_URL or connection failure; see warnings above)")
    yield
    if scheduler is not None:
        scheduler.shutdown(wait=False)
    await db.close_pool()


app = FastAPI(title="TripCalculate Agent", lifespan=lifespan)

# Module-level graph instance — patched by API tests via @patch("app.main.route_graph")
route_graph = build_graph()

# Langfuse client is initialized once; tracing_enabled gracefully degrades
# when LANGFUSE_PUBLIC_KEY / SECRET_KEY env vars are missing (returns no-op spans)
_langfuse = Langfuse(
    public_key=os.getenv("LANGFUSE_PUBLIC_KEY", ""),
    secret_key=os.getenv("LANGFUSE_SECRET_KEY", ""),
    host=os.getenv("LANGFUSE_HOST", "https://cloud.langfuse.com"),
)


def _initial_state(request: ParseRouteRequest) -> dict:
    """Extract initial state from request, used by both sync and streaming endpoints."""
    return {
        "message": request.message,
        "language": request.language,
        "user_id": request.user_id,
        "current_route": request.current_route,
        "parsed": None,
        "geocoded": [],
        "response": None,
        "error": None,
        "retry_count": 0,
        "settings_context": request.settings_context,
        "fuel_data": None,
        "weather_data": None,
        "intent": None,
    }


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/parse-route", response_model=ParseRouteResponse)
async def parse_route(request: ParseRouteRequest):
    session_id = f"{request.user_id}-{int(time.time())}"

    # Wrap the full invocation in a Langfuse trace span so every LLM call
    # inside the graph is captured as a child observation.
    # _AgnosticContextManager is a sync context manager (uses OTEL spans under the hood),
    # but it is safe to use inside an async function — spans are attached to the current
    # OTEL context which propagates across awaits within the same task.
    try:
        with _langfuse.start_as_current_observation(
            name="parse_route",
            as_type="agent",
            input={"message": request.message, "language": request.language},
        ):
            with propagate_attributes(
                user_id=request.user_id,
                session_id=session_id,
                tags=[request.language],
                trace_name="parse_route",
            ):
                result = await route_graph.ainvoke(_initial_state(request))
    finally:
        # Flush ensures spans are exported before the HTTP response is returned,
        # even if ainvoke raises an unhandled exception.
        _langfuse.flush()

    return result["response"]


@app.post("/parse-route/stream")
async def parse_route_stream(request: ParseRouteRequest):
    session_id = f"{request.user_id}-{int(time.time())}"

    async def generator():
        # Same Langfuse span pattern as the sync endpoint; flush in finally
        # so spans export even if the client disconnects mid-stream.
        try:
            with _langfuse.start_as_current_observation(
                name="parse_route_stream",
                as_type="agent",
                input={"message": request.message, "language": request.language},
            ):
                with propagate_attributes(
                    user_id=request.user_id,
                    session_id=session_id,
                    tags=[request.language],
                    trace_name="parse_route_stream",
                ):
                    async for frame in stream_route(route_graph, _initial_state(request)):
                        yield frame
        finally:
            _langfuse.flush()

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
