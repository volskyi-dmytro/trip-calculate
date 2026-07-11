import pytest
import respx
import httpx
from unittest.mock import AsyncMock, MagicMock, patch
from app.graph import build_graph
from app.schema import ParsedRoute, ParsedLocation, TripSettings, SupervisorDecision


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


def supervisor_llm_response(intent="create"):
    """The graph now enters at the supervisor node, which makes its own
    _openai_client.parse call before parse_locations ever runs. Full-graph
    tests that mock the shared client must answer this call first."""
    return _mock_parse_response(SupervisorDecision(intent=intent, settings=TripSettings()))


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
        side_effect=[supervisor_llm_response(), _mock_parse_response(parsed)]
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
        side_effect=[
            supervisor_llm_response(),
            _mock_parse_response(parsed),
            _mock_parse_response(renormalized),
        ]
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
    # Three LLM calls: supervisor classification + initial parse + retry re-normalization
    assert mock_client.beta.chat.completions.parse.call_count == 3


@respx.mock
@patch("app.nodes._openai_client")
@pytest.mark.asyncio
async def test_graph_village_resolved_by_original_name_not_hallucinated_coords(mock_client):
    """Incident regression (2026-06-11): round trip Нововолинськ – Соловичі.
    The LLM transliterated the village to 'Solovichi Ukraine' (no OSM match)
    AND hallucinated nearby coordinates for it. The graph must resolve the
    village via its original native-script name and ignore the guessed
    coordinates — they placed the waypoint ~55 km off and broke the trip
    cost calculation."""
    parsed = ParsedRoute(
        locations=[
            ParsedLocation(
                name="Novovolynsk Ukraine", location_type="origin",
                original_name="Нововолинськ", lat=50.5881, lon=24.1664,
            ),
            ParsedLocation(
                name="Solovichi Ukraine", location_type="waypoint",
                original_name="Соловичі", lat=50.6, lon=24.2,  # hallucinated
            ),
            ParsedLocation(
                name="Novovolynsk Ukraine", location_type="destination",
                original_name="Нововолинськ", lat=50.5881, lon=24.1664,
            ),
        ],
        settings=TripSettings(passengers=3, fuelCostPerLiter=81.99, currency="UAH"),
    )
    mock_client.beta.chat.completions.parse = AsyncMock(
        side_effect=[supervisor_llm_response(), _mock_parse_response(parsed)]
    )

    village = [{
        "place_id": 2,
        "lat": "51.0651400",
        "lon": "24.4741100",
        "display_name": "Соловичі, Волинська область, Україна",
        "name": "Соловичі",
        "type": "village",
        "class": "place",
        "importance": 0.3,
        "address": {"village": "Соловичі", "country": "Україна"},
    }]

    def handler(request):
        q = request.url.params.get("q", "")
        if "Novovolynsk" in q:
            return httpx.Response(200, json=_nominatim_resp("Нововолинськ", "50.7224829", "24.1648399"))
        if q == "Соловичі":
            return httpx.Response(200, json=village)
        return httpx.Response(200, json=[])  # transliterated village name misses

    respx.get("https://nominatim.openstreetmap.org/search").mock(side_effect=handler)

    graph = build_graph()
    result = await graph.ainvoke(_initial_state("Нововолинськ - Соловичі, туди і назад. Поїздка на трьох, вартість палива 81.99"))

    assert result["response"].success is True
    waypoints = result["response"].route.waypoints
    assert len(waypoints) == 3
    # The village must carry real Nominatim coordinates, not the LLM's guess
    assert waypoints[1].latitude == 51.06514
    assert waypoints[1].longitude == 24.47411
    # No retry pass needed: the original-name fallback resolves it first pass
    assert result["retry_count"] == 0
    assert result["response"].route.settings.passengers == 3
    assert result["response"].route.settings.fuelCostPerLiter == 81.99


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
        side_effect=[
            supervisor_llm_response(),
            _mock_parse_response(parsed),
            _mock_parse_response(retry_parsed),
        ]
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


@respx.mock
@patch("app.nodes._openai_client")
@pytest.mark.asyncio
async def test_weather_failure_still_yields_successful_route(mock_client):
    """Same arrangement as test_graph_happy_path_two_cities, plus a failing
    weather agent: the trip must still succeed with weather_data=None."""
    parsed = ParsedRoute(
        locations=[
            ParsedLocation(name="Kyiv Ukraine", location_type="origin"),
            ParsedLocation(name="Lviv Ukraine", location_type="destination"),
        ],
        settings=TripSettings(passengers=1, currency="UAH"),
    )
    mock_client.beta.chat.completions.parse = AsyncMock(
        side_effect=[supervisor_llm_response(), _mock_parse_response(parsed)]
    )

    def handler(request):
        q = request.url.params.get("q", "")
        if "Kyiv" in q:
            return httpx.Response(200, json=_nominatim_resp("Kyiv", "50.4501", "30.5234"))
        return httpx.Response(200, json=_nominatim_resp("Lviv", "49.8397", "24.0297"))

    respx.get("https://nominatim.openstreetmap.org/search").mock(side_effect=handler)

    graph = build_graph()
    with patch("app.nodes.compute_weather_data",
               new=AsyncMock(side_effect=RuntimeError("open-meteo down"))):
        result = await graph.ainvoke(_initial_state("Kyiv to Lviv"))

    assert result["response"].success is True
    assert result["response"].weather_data is None
