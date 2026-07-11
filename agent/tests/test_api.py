import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient
from app.schema import ParseRouteResponse, RouteOut, WaypointOut, RouteSettings, RouteStats


def _success_response() -> ParseRouteResponse:
    return ParseRouteResponse(
        success=True,
        route=RouteOut(
            waypoints=[
                WaypointOut(positionOrder=0, name="Kyiv", latitude=50.45, longitude=30.52),
                WaypointOut(positionOrder=1, name="Lviv", latitude=49.84, longitude=24.03),
            ],
            settings=RouteSettings(),
        ),
        message="Route created with 2 waypoint(s)",
        stats=RouteStats(totalRequested=2, successful=2, skipped=0, aiProvided=0, nominatimProvided=2),
    )


def _error_response() -> ParseRouteResponse:
    return ParseRouteResponse(success=False, error="Need at least 2 valid locations, found 0")


@patch("app.main.route_graph")
def test_parse_route_returns_200_on_success(mock_graph):
    mock_graph.ainvoke = AsyncMock(return_value={"response": _success_response()})

    from app.main import app
    client = TestClient(app)
    response = client.post("/parse-route", json={"message": "Kyiv to Lviv", "language": "en", "user_id": "test@test.com"})

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert len(data["route"]["waypoints"]) == 2
    assert data["route"]["waypoints"][0]["name"] == "Kyiv"


@patch("app.main.route_graph")
def test_parse_route_returns_200_on_graph_error(mock_graph):
    """Error responses are still HTTP 200 — the success field signals failure."""
    mock_graph.ainvoke = AsyncMock(return_value={"response": _error_response()})

    from app.main import app
    client = TestClient(app)
    response = client.post("/parse-route", json={"message": "??", "language": "en"})

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is False
    assert "error" in data


@patch("app.main.route_graph")
def test_parse_route_rejects_message_over_500_chars(mock_graph):
    """Length cap: an over-long message must be rejected by schema
    validation (422) before any LLM call is made."""
    mock_graph.ainvoke = AsyncMock(return_value={"response": _success_response()})

    from app.main import app
    client = TestClient(app)
    response = client.post("/parse-route", json={"message": "x" * 501})

    assert response.status_code == 422
    mock_graph.ainvoke.assert_not_called()


@patch("app.main.route_graph")
def test_parse_route_rejects_empty_message(mock_graph):
    mock_graph.ainvoke = AsyncMock(return_value={"response": _success_response()})

    from app.main import app
    client = TestClient(app)
    response = client.post("/parse-route", json={"message": ""})

    assert response.status_code == 422
    mock_graph.ainvoke.assert_not_called()


@patch("app.main.route_graph")
def test_parse_route_accepts_message_at_500_chars(mock_graph):
    mock_graph.ainvoke = AsyncMock(return_value={"response": _success_response()})

    from app.main import app
    client = TestClient(app)
    response = client.post("/parse-route", json={"message": "x" * 500})

    assert response.status_code == 200


def test_health_returns_ok():
    from app.main import app
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@patch("app.main.route_graph")
def test_parse_route_uses_defaults_for_optional_fields(mock_graph):
    mock_graph.ainvoke = AsyncMock(return_value={"response": _success_response()})

    from app.main import app
    client = TestClient(app)
    # Omit language and user_id — should use defaults
    response = client.post("/parse-route", json={"message": "Kyiv to Lviv"})

    assert response.status_code == 200


@patch("app.main.route_graph")
def test_parse_route_accepts_current_route(mock_graph):
    """Modification requests carry the route already on the map; the
    endpoint must accept it and pass it into the graph state."""
    mock_graph.ainvoke = AsyncMock(return_value={"response": _success_response()})

    from app.main import app
    client = TestClient(app)
    response = client.post("/parse-route", json={
        "message": "add a stop in Ternopil",
        "language": "en",
        "current_route": [
            {"name": "Lviv", "latitude": 49.84, "longitude": 24.03},
            {"name": "Kyiv", "latitude": 50.45, "longitude": 30.52},
        ],
    })

    assert response.status_code == 200
    state = mock_graph.ainvoke.await_args.args[0]
    assert [wp.name for wp in state["current_route"]] == ["Lviv", "Kyiv"]


@patch("app.main.route_graph")
def test_parse_route_rejects_oversized_current_route(mock_graph):
    """Waypoint cap (25) bounds context-block token cost, mirroring the
    500-char message cap."""
    mock_graph.ainvoke = AsyncMock(return_value={"response": _success_response()})

    from app.main import app
    client = TestClient(app)
    response = client.post("/parse-route", json={
        "message": "add a stop",
        "current_route": [
            {"name": f"wp{i}", "latitude": 50.0, "longitude": 30.0}
            for i in range(26)
        ],
    })

    assert response.status_code == 422
    mock_graph.ainvoke.assert_not_awaited()


@patch("app.main.route_graph")
def test_parse_route_accepts_settings_context(mock_graph):
    mock_graph.ainvoke = AsyncMock(return_value={"response": _success_response()})

    from app.main import app
    client = TestClient(app)
    resp = client.post("/parse-route", json={
        "message": "Kyiv to Lviv",
        "settings_context": {"fuel_type": "diesel", "currency": "EUR"},
    })
    assert resp.status_code == 200
    state = mock_graph.ainvoke.await_args.args[0]
    assert state["settings_context"].fuel_type == "diesel"


@patch("app.main.route_graph")
def test_parse_route_rejects_bad_settings_context(mock_graph):
    mock_graph.ainvoke = AsyncMock(return_value={"response": _success_response()})

    from app.main import app
    client = TestClient(app)
    resp = client.post("/parse-route", json={
        "message": "Kyiv to Lviv",
        "settings_context": {"fuel_type": "rocket"},
    })
    assert resp.status_code == 422
    mock_graph.ainvoke.assert_not_awaited()


# ── Weather Corridor Tests ────────────────────────────────────────────────

from datetime import datetime as _dt2, timezone as _tz2
from unittest.mock import AsyncMock as _AsyncMock2, patch as _patch2

from app.schema import WeatherData as _WeatherData

_CORRIDOR_BODY = {
    "waypoints": [
        {"name": "Kyiv", "latitude": 50.45, "longitude": 30.52},
        {"name": "Lviv", "latitude": 49.84, "longitude": 24.03},
    ],
    "date": _dt2.now(_tz2.utc).date().isoformat(),
}


def test_weather_corridor_returns_data():
    fake = _WeatherData(date=_CORRIDOR_BODY["date"], samples=[],
                        risk_flags=[], source="open-meteo",
                        fetched_at=_dt2.now(_tz2.utc))
    with _patch2("app.main.compute_weather_data",
                 new=_AsyncMock2(return_value=fake)) as compute:
        from app.main import app
        client = TestClient(app)
        resp = client.post("/weather-corridor", json=_CORRIDOR_BODY)
    assert resp.status_code == 200
    assert resp.json()["weather_data"]["source"] == "open-meteo"
    # Waypoint names travel as labels
    assert compute.await_args.args[0] == [
        (50.45, 30.52, "Kyiv"), (49.84, 24.03, "Lviv")]


def test_weather_corridor_null_when_unavailable():
    with _patch2("app.main.compute_weather_data",
                 new=_AsyncMock2(return_value=None)):
        from app.main import app
        client = TestClient(app)
        resp = client.post("/weather-corridor", json=_CORRIDOR_BODY)
    assert resp.status_code == 200
    assert resp.json() == {"weather_data": None}


def test_weather_corridor_validates_payload():
    from app.main import app
    client = TestClient(app)
    assert client.post("/weather-corridor", json={
        "waypoints": [], "date": _CORRIDOR_BODY["date"]}).status_code == 422
    assert client.post("/weather-corridor", json={
        "waypoints": _CORRIDOR_BODY["waypoints"],
        "date": "not-a-date"}).status_code == 422
    too_many = {"waypoints": [_CORRIDOR_BODY["waypoints"][0]] * 26,
                "date": _CORRIDOR_BODY["date"]}
    assert client.post("/weather-corridor", json=too_many).status_code == 422
