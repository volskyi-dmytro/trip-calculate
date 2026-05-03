import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.schema import (
    GraphState, ParsedRoute, ParsedLocation, TripSettings,
    GeocodedLocation,
)
from app.nodes import parse_locations, geocode_locations, format_response, format_error, check_viable


def _state(**kwargs) -> GraphState:
    base: GraphState = {
        "message": "Kyiv to Lviv",
        "language": "en",
        "user_id": "test@example.com",
        "parsed": None,
        "geocoded": [],
        "response": None,
        "error": None,
    }
    base.update(kwargs)
    return base


def _geocoded(name: str, loc_type: str, source: str, lat=50.0, lon=30.0) -> GeocodedLocation:
    return GeocodedLocation(
        name=name,
        clean_name=name,
        location_type=loc_type,
        latitude=lat if source != "failed" else None,
        longitude=lon if source != "failed" else None,
        source=source,
        error=(source == "failed"),
        message="Not found" if source == "failed" else None,
    )


# ── parse_locations ───────────────────────────────────────────────────────

@patch("app.nodes._openai_client")
@pytest.mark.asyncio
async def test_parse_locations_happy_path(mock_client):
    parsed = ParsedRoute(
        locations=[
            ParsedLocation(name="Kyiv Ukraine", location_type="origin"),
            ParsedLocation(name="Lviv Ukraine", location_type="destination"),
        ],
        settings=TripSettings(),
    )
    mock_message = MagicMock()
    mock_message.parsed = parsed
    mock_choice = MagicMock()
    mock_choice.message = mock_message
    mock_response = MagicMock()
    mock_response.choices = [mock_choice]
    mock_client.beta.chat.completions.parse = AsyncMock(return_value=mock_response)

    result = await parse_locations(_state())

    assert result["error"] is None
    assert result["parsed"] is not None
    assert len(result["parsed"].locations) == 2


@patch("app.nodes._openai_client")
@pytest.mark.asyncio
async def test_parse_locations_sets_error_on_exception(mock_client):
    mock_client.beta.chat.completions.parse = AsyncMock(side_effect=Exception("OpenAI down"))

    result = await parse_locations(_state())

    assert "Failed to parse" in result["error"]
    assert result["parsed"] is None


# ── geocode_locations ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_geocode_locations_passes_through_on_error():
    state = _state(error="already failed")
    result = await geocode_locations(state)
    assert result["geocoded"] == []


@patch("app.nodes.geocode_location", new_callable=AsyncMock)
@pytest.mark.asyncio
async def test_geocode_locations_fans_out_to_all_locations(mock_geocode):
    kyiv = _geocoded("Kyiv", "origin", "nominatim")
    lviv = _geocoded("Lviv", "destination", "nominatim", lat=49.84, lon=24.03)
    mock_geocode.side_effect = [kyiv, lviv]

    parsed = ParsedRoute(
        locations=[
            ParsedLocation(name="Kyiv Ukraine", location_type="origin"),
            ParsedLocation(name="Lviv Ukraine", location_type="destination"),
        ],
        settings=TripSettings(),
    )
    result = await geocode_locations(_state(parsed=parsed))

    assert len(result["geocoded"]) == 2
    assert mock_geocode.call_count == 2


# ── check_viable ──────────────────────────────────────────────────────────

def test_check_viable_routes_to_format_response():
    geocoded = [
        _geocoded("Kyiv", "origin", "nominatim"),
        _geocoded("Lviv", "destination", "nominatim", lat=49.84, lon=24.03),
    ]
    assert check_viable(_state(geocoded=geocoded)) == "format_response"


def test_check_viable_routes_to_format_error_insufficient():
    geocoded = [
        _geocoded("Kyiv", "origin", "nominatim"),
        _geocoded("Unknown", "destination", "failed"),
    ]
    assert check_viable(_state(geocoded=geocoded)) == "format_error"


def test_check_viable_routes_to_format_error_on_state_error():
    assert check_viable(_state(error="parse failed")) == "format_error"


# ── format_response ───────────────────────────────────────────────────────

def test_format_response_orders_origin_waypoint_destination():
    parsed = ParsedRoute(
        locations=[
            ParsedLocation(name="Kyiv Ukraine", location_type="origin"),
            ParsedLocation(name="Zhytomyr Ukraine", location_type="waypoint"),
            ParsedLocation(name="Lviv Ukraine", location_type="destination"),
        ],
        settings=TripSettings(passengers=2, currency="UAH"),
    )
    geocoded = [
        _geocoded("Kyiv Ukraine", "origin", "nominatim", lat=50.45, lon=30.52),
        _geocoded("Zhytomyr Ukraine", "waypoint", "nominatim", lat=50.25, lon=28.66),
        _geocoded("Lviv Ukraine", "destination", "nominatim", lat=49.84, lon=24.03),
    ]
    result = format_response(_state(parsed=parsed, geocoded=geocoded))

    waypoints = result["response"].route.waypoints
    assert waypoints[0].positionOrder == 0
    assert waypoints[0].name == "Kyiv Ukraine"
    assert waypoints[1].name == "Zhytomyr Ukraine"
    assert waypoints[2].name == "Lviv Ukraine"
    assert result["response"].route.settings.passengers == 2


def test_format_response_includes_skipped_locations():
    parsed = ParsedRoute(
        locations=[
            ParsedLocation(name="Kyiv Ukraine", location_type="origin"),
            ParsedLocation(name="BadPlace", location_type="waypoint"),
            ParsedLocation(name="Lviv Ukraine", location_type="destination"),
        ],
        settings=TripSettings(),
    )
    geocoded = [
        _geocoded("Kyiv Ukraine", "origin", "nominatim", lat=50.45, lon=30.52),
        _geocoded("BadPlace", "waypoint", "failed"),
        _geocoded("Lviv Ukraine", "destination", "nominatim", lat=49.84, lon=24.03),
    ]
    result = format_response(_state(parsed=parsed, geocoded=geocoded))

    assert result["response"].stats.skipped == 1
    assert result["response"].skippedLocations[0]["name"] == "BadPlace"


def test_format_response_uses_defaults_for_missing_settings():
    parsed = ParsedRoute(
        locations=[
            ParsedLocation(name="Kyiv Ukraine", location_type="origin"),
            ParsedLocation(name="Lviv Ukraine", location_type="destination"),
        ],
        settings=TripSettings(),  # all None
    )
    geocoded = [
        _geocoded("Kyiv Ukraine", "origin", "nominatim", lat=50.45, lon=30.52),
        _geocoded("Lviv Ukraine", "destination", "nominatim", lat=49.84, lon=24.03),
    ]
    result = format_response(_state(parsed=parsed, geocoded=geocoded))

    s = result["response"].route.settings
    assert s.passengers == 1
    assert s.fuelConsumption == 6.0
    assert s.fuelCostPerLiter == 50.0
    assert s.currency == "UAH"


# ── format_error ──────────────────────────────────────────────────────────

def test_format_error_uses_state_error_message():
    result = format_error(_state(error="OpenAI API error"))
    assert result["response"].success is False
    assert "OpenAI API error" in result["response"].error


def test_format_error_generates_message_from_geocoded_count():
    geocoded = [_geocoded("Kyiv", "origin", "nominatim")]
    result = format_error(_state(geocoded=geocoded))
    assert result["response"].success is False
    assert "1" in result["response"].error
