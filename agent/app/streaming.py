"""SSE view over the route graph's execution.

The stream changes the envelope, never the payload: everything the graph
produces — including format_error's success=false response — travels as a
`result` frame so the frontend's existing success/failure handling applies
unchanged. The `error` frame is reserved for unexpected exceptions in this
layer and carries a sentinel, never exception text (no internals leakage).
"""
import json
import logging
from typing import AsyncIterator

logger = logging.getLogger(__name__)

# Graph node → user-visible stage key. Stage KEYS cross the wire; the
# frontend maps them through i18n. Retry folds into "geocoding" — users see
# one honest step, not internal retries.
NODE_TO_STAGE = {
    "supervise": "supervisor",
    "parse_locations": "route",
    "geocode_locations": "geocoding",
    "retry_failed_locations": "geocoding",
    "fuel_enrichment": "fuel",
    "format_response": "compose",
    "format_error": "compose",
}


def sse_frame(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


async def stream_route(graph, initial_state: dict) -> AsyncIterator[str]:
    yield sse_frame("stage", {"stage": "supervisor", "status": "running"})
    last_stage = None
    response = None
    try:
        async for update in graph.astream(initial_state, stream_mode="updates"):
            for node_name, delta in update.items():
                stage = NODE_TO_STAGE.get(node_name)
                if stage is not None and stage != last_stage:
                    yield sse_frame("stage", {"stage": stage, "status": "done"})
                    last_stage = stage
                if isinstance(delta, dict) and delta.get("response") is not None:
                    response = delta["response"]
        if response is None:
            raise ValueError("graph produced no response")
        yield sse_frame("result", response.model_dump(mode="json"))
    except Exception:
        logger.exception("route stream failed")
        yield sse_frame("error", {"error": "stream_failed"})
