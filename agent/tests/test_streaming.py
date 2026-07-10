import json
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from app.main import app
from app.schema import ParseRouteResponse
from app.streaming import stream_route, NODE_TO_STAGE, sse_frame


def _frames(raw: str) -> list[tuple[str, dict]]:
    """Parse concatenated SSE text into (event, data) tuples."""
    out = []
    for block in raw.split("\n\n"):
        if not block.strip():
            continue
        event, data = None, None
        for line in block.split("\n"):
            if line.startswith("event: "):
                event = line[len("event: "):]
            elif line.startswith("data: "):
                data = json.loads(line[len("data: "):])
        out.append((event, data))
    return out


class _FakeGraph:
    """Yields updates like graph.astream(stream_mode='updates')."""
    def __init__(self, updates):
        self._updates = updates

    def astream(self, initial_state, stream_mode="updates"):
        async def gen():
            for u in self._updates:
                yield u
        return gen()


_OK_RESPONSE = ParseRouteResponse(success=True, message="Route created")
_FAIL_RESPONSE = ParseRouteResponse(success=False, error="Цей асистент планує лише маршрути подорожей.")


async def test_happy_path_frame_sequence():
    graph = _FakeGraph([
        {"supervise": {"intent": "create"}},
        {"parse_locations": {"parsed": object()}},
        {"geocode_locations": {"geocoded": []}},
        {"fuel_enrichment": {"fuel_data": None}},
        {"format_response": {"response": _OK_RESPONSE}},
    ])
    raw = "".join([f async for f in stream_route(graph, {})])
    frames = _frames(raw)
    assert frames[0] == ("stage", {"stage": "supervisor", "status": "running"})
    stage_dones = [d["stage"] for e, d in frames if e == "stage" and d["status"] == "done"]
    assert stage_dones == ["supervisor", "route", "geocoding", "fuel", "compose"]
    assert frames[-1][0] == "result"
    assert frames[-1][1]["success"] is True


async def test_retry_folds_into_single_geocoding_stage():
    graph = _FakeGraph([
        {"supervise": {}},
        {"parse_locations": {}},
        {"geocode_locations": {}},
        {"retry_failed_locations": {}},   # same stage → no duplicate frame
        {"fuel_enrichment": {}},
        {"format_response": {"response": _OK_RESPONSE}},
    ])
    raw = "".join([f async for f in stream_route(graph, {})])
    stage_dones = [d["stage"] for e, d in _frames(raw) if e == "stage" and d["status"] == "done"]
    assert stage_dones.count("geocoding") == 1


async def test_graph_failure_is_a_result_frame_not_error():
    # Off-topic guard: supervisor sets error → format_error produces success=false
    graph = _FakeGraph([
        {"supervise": {"error": "off topic"}},
        {"format_error": {"response": _FAIL_RESPONSE}},
    ])
    raw = "".join([f async for f in stream_route(graph, {})])
    frames = _frames(raw)
    events = [e for e, _ in frames]
    assert "error" not in events
    assert frames[-1][0] == "result"
    assert frames[-1][1]["success"] is False
    assert "маршрути" in frames[-1][1]["error"]


async def test_unexpected_exception_yields_sentinel_error_frame():
    class _BoomGraph:
        def astream(self, *a, **k):
            async def gen():
                yield {"supervise": {}}
                raise RuntimeError("secret internals")
            return gen()

    raw = "".join([f async for f in stream_route(_BoomGraph(), {})])
    frames = _frames(raw)
    assert frames[-1] == ("error", {"error": "stream_failed"})
    assert "secret" not in raw  # never leak exception text


async def test_missing_response_yields_error_frame():
    graph = _FakeGraph([{"supervise": {}}])
    raw = "".join([f async for f in stream_route(graph, {})])
    assert _frames(raw)[-1] == ("error", {"error": "stream_failed"})


def test_endpoint_streams_and_sets_headers():
    fake = _FakeGraph([{"format_response": {"response": _OK_RESPONSE}}])
    with patch("app.main.route_graph", fake):
        client = TestClient(app)
        resp = client.post("/parse-route/stream", json={"message": "Kyiv to Lviv"})
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/event-stream")
    assert resp.headers["x-accel-buffering"] == "no"
    frames = _frames(resp.text)
    assert frames[-1][0] == "result"


def test_endpoint_validates_request():
    client = TestClient(app)
    assert client.post("/parse-route/stream", json={"message": ""}).status_code == 422
