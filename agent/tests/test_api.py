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
