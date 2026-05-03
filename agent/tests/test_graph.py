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


@respx.mock
@patch("app.nodes.ChatOpenAI")
@pytest.mark.asyncio
async def test_graph_happy_path_two_cities(mock_llm_class):
    """Full graph run: origin + destination → success response."""
    parsed = ParsedRoute(
        locations=[
            ParsedLocation(name="Kyiv Ukraine", location_type="origin"),
            ParsedLocation(name="Lviv Ukraine", location_type="destination"),
        ],
        settings=TripSettings(passengers=1, currency="UAH"),
    )
    mock_chain = AsyncMock()
    mock_chain.ainvoke = AsyncMock(return_value=parsed)
    mock_llm = MagicMock()
    mock_llm.with_structured_output.return_value = mock_chain
    mock_llm_class.return_value = mock_llm

    call_count = 0
    responses = [
        _nominatim_resp("Kyiv", "50.4501", "30.5234"),
        _nominatim_resp("Lviv", "49.8397", "24.0297"),
    ]

    def handler(request):
        nonlocal call_count
        resp = responses[call_count % 2]
        call_count += 1
        return httpx.Response(200, json=resp)

    respx.get("https://nominatim.openstreetmap.org/search").mock(side_effect=handler)

    graph = build_graph()
    result = await graph.ainvoke({
        "message": "Kyiv to Lviv",
        "language": "en",
        "user_id": "test@example.com",
        "parsed": None,
        "geocoded": [],
        "response": None,
        "error": None,
    })

    assert result["response"].success is True
    assert len(result["response"].route.waypoints) == 2
    assert result["response"].route.waypoints[0].name == "Kyiv"
    assert result["response"].route.waypoints[1].name == "Lviv"


@respx.mock
@patch("app.nodes.ChatOpenAI")
@pytest.mark.asyncio
async def test_graph_routes_to_error_on_parse_failure(mock_llm_class):
    """If OpenAI fails, graph should return success=False."""
    mock_chain = AsyncMock()
    mock_chain.ainvoke = AsyncMock(side_effect=Exception("API timeout"))
    mock_llm = MagicMock()
    mock_llm.with_structured_output.return_value = mock_chain
    mock_llm_class.return_value = mock_llm

    graph = build_graph()
    result = await graph.ainvoke({
        "message": "Trip to somewhere",
        "language": "en",
        "user_id": "test@example.com",
        "parsed": None,
        "geocoded": [],
        "response": None,
        "error": None,
    })

    assert result["response"].success is False
    assert "Failed to parse" in result["response"].error


@respx.mock
@patch("app.nodes.ChatOpenAI")
@pytest.mark.asyncio
async def test_graph_routes_to_error_when_only_one_location_geocodes(mock_llm_class):
    """If only 1 out of 2 locations geocodes, return error."""
    parsed = ParsedRoute(
        locations=[
            ParsedLocation(name="Kyiv Ukraine", location_type="origin"),
            ParsedLocation(name="Xyzzy Nowhere", location_type="destination"),
        ],
        settings=TripSettings(),
    )
    mock_chain = AsyncMock()
    mock_chain.ainvoke = AsyncMock(return_value=parsed)
    mock_llm = MagicMock()
    mock_llm.with_structured_output.return_value = mock_chain
    mock_llm_class.return_value = mock_llm

    def handler(request):
        q = request.url.params.get("q", "")
        if "Kyiv" in q:
            return httpx.Response(200, json=_nominatim_resp("Kyiv", "50.4501", "30.5234"))
        return httpx.Response(200, json=[])

    respx.get("https://nominatim.openstreetmap.org/search").mock(side_effect=handler)

    graph = build_graph()
    result = await graph.ainvoke({
        "message": "Kyiv to Xyzzy",
        "language": "en",
        "user_id": "test@example.com",
        "parsed": None,
        "geocoded": [],
        "response": None,
        "error": None,
    })

    assert result["response"].success is False
    assert "1" in result["response"].error
