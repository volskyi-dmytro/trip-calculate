import os
import time
from dotenv import load_dotenv
from fastapi import FastAPI
from langfuse import Langfuse, propagate_attributes
from .schema import ParseRouteRequest, ParseRouteResponse
from .graph import build_graph

load_dotenv()

app = FastAPI(title="TripCalculate Agent")

# Module-level graph instance — patched by API tests via @patch("app.main.route_graph")
route_graph = build_graph()

# Langfuse client is initialized once; tracing_enabled gracefully degrades
# when LANGFUSE_PUBLIC_KEY / SECRET_KEY env vars are missing (returns no-op spans)
_langfuse = Langfuse(
    public_key=os.getenv("LANGFUSE_PUBLIC_KEY", ""),
    secret_key=os.getenv("LANGFUSE_SECRET_KEY", ""),
    host=os.getenv("LANGFUSE_HOST", "https://cloud.langfuse.com"),
)


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
                initial_state = {
                    "message": request.message,
                    "language": request.language,
                    "user_id": request.user_id,
                    "current_route": request.current_route,
                    "parsed": None,
                    "geocoded": [],
                    "response": None,
                    "error": None,
                    "retry_count": 0,
                }

                result = await route_graph.ainvoke(initial_state)
    finally:
        # Flush ensures spans are exported before the HTTP response is returned,
        # even if ainvoke raises an unhandled exception.
        _langfuse.flush()

    return result["response"]
