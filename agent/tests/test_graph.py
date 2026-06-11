import pytest
import respx
import httpx
from unittest.mock import AsyncMock, MagicMock, patch
from app.graph import build_graph
from app.schema import ParsedRoute, ParsedLocation, TripSettings


def _nominatim_resp(name: str, lat: str, lon: str):
    return [
        {
            "place_id": 1,
            "lat": lat,
            "lon": lon,
            "display_name": f"{name}, Ukraine",
            "name": name,
            "type": "city",
            "class": "place",
            "importance": 0.8,
            "address": {"city": name, "country": "Ukraine"},
        }
    ]


def _mock_parse_response(parsed):
    """Build the object shape returned by AsyncOpenAI beta.chat.completions.parse."""
    mock_message = MagicMock()
    mock_message.parsed = parsed
    mock_choice = MagicMock()
    mock_choice.message = mock_message
    mock_response = MagicMock()
    mock_response.choices = [mock_choice]
    return mock_response


def _initial_state(message: str) -> dict:
    return {
        "message": message,
        "language": "en",
        "user_id": "test@example.com",
        "parsed": None,
        "geocoded": [],
        "response": None,
        "error": None,
        "retry_count": 0,
    }


@respx.mock
@patch("app.nodes._openai_client")
@pytest.mark.asyncio
async def test_graph_happy_path_two_cities(mock_client):
    """Full graph run: origin + destination → success response."""
    parsed = ParsedRoute(
        locations=[
            ParsedLocation(name="Kyiv Ukraine", location_type="origin"),
            ParsedLocation(name="Lviv Ukraine", location_type="destination"),
        ],
        settings=TripSettings(passengers=1, currency="UAH"),
    )
    mock_client.beta.chat.completions.parse = AsyncMock(
        return_value=_mock_parse_response(parsed)
    )

    def handler(request):
        q = request.url.params.get("q", "")
        if "Kyiv" in q:
            return httpx.Response(200, json=_nominatim_resp("Kyiv", "50.4501", "30.5234"))
        return httpx.Response(200, json=_nominatim_resp("Lviv", "49.8397", "24.0297"))

    respx.get("https://nominatim.openstreetmap.org/search").mock(side_effect=handler)

    graph = build_graph()
    result = await graph.ainvoke(_initial_state("Kyiv to Lviv"))

    assert result["response"].success is True
    assert len(result["response"].route.waypoints) == 2
    assert result["response"].route.waypoints[0].name == "Kyiv"
    assert result["response"].route.waypoints[1].name == "Lviv"


@respx.mock
@patch("app.nodes._openai_client")
@pytest.mark.asyncio
async def test_graph_routes_to_error_on_parse_failure(mock_client):
    """If OpenAI fails, graph should return success=False."""
    mock_client.beta.chat.completions.parse = AsyncMock(side_effect=Exception("API timeout"))

    graph = build_graph()
    result = await graph.ainvoke(_initial_state("Trip to somewhere"))

    assert result["response"].success is False
    assert "Failed to parse" in result["response"].error


@respx.mock
@patch("app.nodes._openai_client")
@pytest.mark.asyncio
async def test_graph_retry_loop_recovers_failed_location(mock_client):
    """Agentic self-correction: a location that fails geocoding is re-normalized
    by the LLM and geocoded successfully on the retry pass."""
    parsed = ParsedRoute(
        locations=[
            ParsedLocation(name="Kyiv Ukraine", location_type="origin"),
            ParsedLocation(name="Lwiw", location_type="destination"),
        ],
        settings=TripSettings(),
    )
    renormalized = ParsedRoute(
        locations=[ParsedLocation(name="Lviv Ukraine", location_type="destination")],
        settings=TripSettings(),
    )
    mock_client.beta.chat.completions.parse = AsyncMock(
        side_effect=[_mock_parse_response(parsed), _mock_parse_response(renormalized)]
    )

    def handler(request):
        q = request.url.params.get("q", "")
        if "Kyiv" in q:
            return httpx.Response(200, json=_nominatim_resp("Kyiv", "50.4501", "30.5234"))
        if "Lviv" in q:
            return httpx.Response(200, json=_nominatim_resp("Lviv", "49.8397", "24.0297"))
        return httpx.Response(200, json=[])  # "Lwiw" not found

    respx.get("https://nominatim.openstreetmap.org/search").mock(side_effect=handler)

    graph = build_graph()
    result = await graph.ainvoke(_initial_state("Kyiv to Lwiw"))

    assert result["response"].success is True
    assert result["retry_count"] == 1
    assert result["response"].stats.recovered == 1
    assert result["response"].route.waypoints[1].name == "Lviv"
    # Two LLM calls: initial parse + retry re-normalization
    assert mock_client.beta.chat.completions.parse.call_count == 2


@respx.mock
@patch("app.nodes._openai_client")
@pytest.mark.asyncio
async def test_graph_routes_to_error_when_only_one_location_geocodes(mock_client):
    """If only 1 of 2 locations geocodes even after the retry pass, return error."""
    parsed = ParsedRoute(
        locations=[
            ParsedLocation(name="Kyiv Ukraine", location_type="origin"),
            ParsedLocation(name="Xyzzy Nowhere", location_type="destination"),
        ],
        settings=TripSettings(),
    )
    retry_parsed = ParsedRoute(
        locations=[ParsedLocation(name="Xyzzy Nowhere Land", location_type="destination")],
        settings=TripSettings(),
    )
    mock_client.beta.chat.completions.parse = AsyncMock(
        side_effect=[_mock_parse_response(parsed), _mock_parse_response(retry_parsed)]
    )

    def handler(request):
        q = request.url.params.get("q", "")
        if "Kyiv" in q:
            return httpx.Response(200, json=_nominatim_resp("Kyiv", "50.4501", "30.5234"))
        return httpx.Response(200, json=[])

    respx.get("https://nominatim.openstreetmap.org/search").mock(side_effect=handler)

    graph = build_graph()
    result = await graph.ainvoke(_initial_state("Kyiv to Xyzzy"))

    assert result["response"].success is False
    assert result["retry_count"] == 1
    assert "1" in result["response"].error
