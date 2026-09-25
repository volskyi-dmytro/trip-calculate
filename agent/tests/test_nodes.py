import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.schema import (
    GraphState, ParsedRoute, ParsedLocation, TripSettings,
    GeocodedLocation, FuelData, CountryFuelPrice, SettingsContext,
)
from app.nodes import (
    parse_locations, geocode_locations, retry_failed_locations,
    fuel_enrichment, _ordered_successful,
    format_response, format_error, route_after_geocode,
    _PARSE_FAILED_ERRORS,
)


def _state(**kwargs) -> GraphState:
    base: GraphState = {
        "message": "Kyiv to Lviv",
        "language": "en",
        "user_id": "test@example.com",
        "parsed": None,
        "geocoded": [],
        "response": None,
        "error": None,
        "retry_count": 0,
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
    call = mock_client.beta.chat.completions.parse.call_args.kwargs
    assert call["model"] == "gpt-4o-mini-2024-07-18"
    assert call["temperature"] == 0


@patch("app.nodes._openai_client")
@pytest.mark.asyncio
async def test_parse_locations_sets_error_on_exception(mock_client):
    mock_client.beta.chat.completions.parse = AsyncMock(
        side_effect=Exception("OpenAI down: http://agent:8001/internal"))

    result = await parse_locations(_state())

    assert result["error"] == _PARSE_FAILED_ERRORS["en"]
    assert "OpenAI down" not in result["error"]  # internals never reach the user
    assert result["parsed"] is None


@patch("app.nodes._openai_client")
@pytest.mark.asyncio
async def test_parse_locations_error_follows_request_language(mock_client):
    mock_client.beta.chat.completions.parse = AsyncMock(side_effect=Exception("boom"))

    result = await parse_locations(_state(language="uk"))

    assert result["error"] == _PARSE_FAILED_ERRORS["uk"]


@patch("app.nodes._openai_client")
@pytest.mark.asyncio
async def test_parse_locations_rejects_non_route_request(mock_client):
    """Off-topic guard: the LLM classifies the message in-band via
    is_route_request; the node must short-circuit with a friendly error
    instead of passing garbage downstream."""
    parsed = ParsedRoute(is_route_request=False, locations=[], settings=TripSettings())
    mock_message = MagicMock()
    mock_message.parsed = parsed
    mock_choice = MagicMock()
    mock_choice.message = mock_message
    mock_response = MagicMock()
    mock_response.choices = [mock_choice]
    mock_client.beta.chat.completions.parse = AsyncMock(return_value=mock_response)

    result = await parse_locations(_state(message="What is the capital of France?"))

    assert result["error"] is not None
    assert "route" in result["error"].lower()
    assert result["parsed"] is None
    # The error must route straight to format_error, skipping geocoding
    assert route_after_geocode(result) == "format_error"


@patch("app.nodes._openai_client")
@pytest.mark.asyncio
async def test_parse_locations_rejects_empty_locations(mock_client):
    """Even if the LLM claims is_route_request=true, an empty locations
    list means there is nothing to geocode — fail fast with the same
    friendly error rather than a confusing geocode-count message."""
    parsed = ParsedRoute(is_route_request=True, locations=[], settings=TripSettings())
    mock_message = MagicMock()
    mock_message.parsed = parsed
    mock_choice = MagicMock()
    mock_choice.message = mock_message
    mock_response = MagicMock()
    mock_response.choices = [mock_choice]
    mock_client.beta.chat.completions.parse = AsyncMock(return_value=mock_response)

    result = await parse_locations(_state(message="hello there"))

    assert result["error"] is not None
    assert "route" in result["error"].lower()


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
    # First pass must never trust LLM-provided coordinates
    for call in mock_geocode.call_args_list:
        assert call.kwargs["allow_ai_coords"] is False


# ── route_after_geocode ───────────────────────────────────────────────────

def test_router_routes_to_format_response():
    geocoded = [
        _geocoded("Kyiv", "origin", "nominatim"),
        _geocoded("Lviv", "destination", "nominatim", lat=49.84, lon=24.03),
    ]
    assert route_after_geocode(_state(geocoded=geocoded)) == "format_response"


def test_router_rejects_duplicate_origin_and_destination():
    """A failed destination must never be recovered as the already-resolved
    origin. The live release gate observed Kyiv -> Kyiv for Kyiv -> Liutivka."""
    geocoded = [
        _geocoded("Kyiv Ukraine", "origin", "nominatim", lat=50.4501, lon=30.5234),
        _geocoded("Kyiv Ukraine", "destination", "nominatim", lat=50.4501, lon=30.5234),
    ]

    assert route_after_geocode(_state(geocoded=geocoded)) == "format_error"


def test_router_routes_to_retry_when_budget_remains():
    geocoded = [
        _geocoded("Kyiv", "origin", "nominatim"),
        _geocoded("Unknown", "destination", "failed"),
    ]
    assert route_after_geocode(_state(geocoded=geocoded)) == "retry_failed"


def test_router_routes_to_format_error_when_retries_exhausted():
    geocoded = [
        _geocoded("Kyiv", "origin", "nominatim"),
        _geocoded("Unknown", "destination", "failed"),
    ]
    assert route_after_geocode(_state(geocoded=geocoded, retry_count=1)) == "format_error"


def test_router_routes_to_format_response_with_skips_when_retries_exhausted():
    geocoded = [
        _geocoded("Kyiv", "origin", "nominatim"),
        _geocoded("Unknown", "waypoint", "failed"),
        _geocoded("Lviv", "destination", "nominatim", lat=49.84, lon=24.03),
    ]
    assert route_after_geocode(_state(geocoded=geocoded, retry_count=1)) == "format_response"


def test_router_routes_to_format_error_on_state_error():
    assert route_after_geocode(_state(error="parse failed")) == "format_error"


# ── retry_failed_locations ────────────────────────────────────────────────

def _mock_parse_response(parsed):
    mock_message = MagicMock()
    mock_message.parsed = parsed
    mock_choice = MagicMock()
    mock_choice.message = mock_message
    mock_response = MagicMock()
    mock_response.choices = [mock_choice]
    return mock_response


@patch("app.nodes.geocode_location", new_callable=AsyncMock)
@patch("app.nodes._openai_client")
@pytest.mark.asyncio
async def test_retry_recovers_failed_location(mock_client, mock_geocode):
    geocoded = [
        _geocoded("Kyiv", "origin", "nominatim"),
        _geocoded("Льввв", "destination", "failed"),
    ]
    renormalized = ParsedRoute(
        locations=[ParsedLocation(name="Lviv Ukraine", location_type="destination")],
        settings=TripSettings(),
    )
    mock_client.beta.chat.completions.parse = AsyncMock(
        return_value=_mock_parse_response(renormalized)
    )
    mock_geocode.return_value = _geocoded("Lviv Ukraine", "destination", "nominatim", lat=49.84, lon=24.03)

    result = await retry_failed_locations(_state(geocoded=geocoded))

    assert result["retry_count"] == 1
    assert result["geocoded"][1].source == "nominatim"
    assert result["geocoded"][1].recovered is True
    assert result["geocoded"][1].location_type == "destination"
    # Only the failed location is re-geocoded, and only the retry pass
    # may fall back to LLM-provided coordinates
    assert mock_geocode.call_count == 1
    assert mock_geocode.call_args.kwargs["allow_ai_coords"] is True
    call = mock_client.beta.chat.completions.parse.call_args.kwargs
    assert call["model"] == "gpt-4o-mini-2024-07-18"
    assert call["temperature"] == 0


@patch("app.nodes.geocode_location", new_callable=AsyncMock)
@patch("app.nodes._openai_client")
@pytest.mark.asyncio
async def test_retry_keeps_original_failure_when_retry_also_fails(mock_client, mock_geocode):
    geocoded = [
        _geocoded("Kyiv", "origin", "nominatim"),
        _geocoded("Xyzzy", "destination", "failed"),
    ]
    renormalized = ParsedRoute(
        locations=[ParsedLocation(name="Xyzzy Nowhere", location_type="destination")],
        settings=TripSettings(),
    )
    mock_client.beta.chat.completions.parse = AsyncMock(
        return_value=_mock_parse_response(renormalized)
    )
    mock_geocode.return_value = _geocoded("Xyzzy Nowhere", "destination", "failed")

    result = await retry_failed_locations(_state(geocoded=geocoded))

    assert result["retry_count"] == 1
    assert result["geocoded"][1].source == "failed"
    assert result["geocoded"][1].name == "Xyzzy"  # original slot kept


@patch("app.nodes._openai_client")
@pytest.mark.asyncio
async def test_retry_is_best_effort_on_llm_failure(mock_client):
    geocoded = [
        _geocoded("Kyiv", "origin", "nominatim"),
        _geocoded("Xyzzy", "destination", "failed"),
    ]
    mock_client.beta.chat.completions.parse = AsyncMock(side_effect=Exception("OpenAI down"))

    result = await retry_failed_locations(_state(geocoded=geocoded))

    assert result["retry_count"] == 1
    assert result["geocoded"][1].source == "failed"


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


def test_format_response_leaves_unmentioned_settings_null():
    """Settings the user did not mention must stay None: filling defaults
    made every AI request silently reset the user's passenger count and
    fuel settings on the frontend."""
    parsed = ParsedRoute(
        locations=[
            ParsedLocation(name="Kyiv Ukraine", location_type="origin"),
            ParsedLocation(name="Lviv Ukraine", location_type="destination"),
        ],
        settings=TripSettings(passengers=3),  # only passengers mentioned
    )
    geocoded = [
        _geocoded("Kyiv Ukraine", "origin", "nominatim", lat=50.45, lon=30.52),
        _geocoded("Lviv Ukraine", "destination", "nominatim", lat=49.84, lon=24.03),
    ]
    result = format_response(_state(parsed=parsed, geocoded=geocoded))

    s = result["response"].route.settings
    assert s.passengers == 3
    assert s.fuelConsumption is None
    assert s.fuelCostPerLiter is None
    assert s.currency is None


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


# ── current-route modification context ────────────────────────────────────

def _mock_parse_response(parsed):
    mock_message = MagicMock()
    mock_message.parsed = parsed
    mock_choice = MagicMock()
    mock_choice.message = mock_message
    mock_response = MagicMock()
    mock_response.choices = [mock_choice]
    return mock_response


@patch("app.nodes._openai_client")
@pytest.mark.asyncio
async def test_parse_locations_sends_current_route_context(mock_client):
    """When the caller provides the route already on the map, the LLM call
    must include it as a context block so 'add a stop in X' can be merged
    into the existing route instead of failing as a 1-location request."""
    from app.schema import CurrentWaypoint

    parsed = ParsedRoute(
        is_route_request=True,
        locations=[
            ParsedLocation(name="Lviv", location_type="origin",
                           lat=49.84, lon=24.03, from_current_route=True),
            ParsedLocation(name="Ternopil Ukraine", location_type="waypoint"),
            ParsedLocation(name="Kyiv", location_type="destination",
                           lat=50.45, lon=30.52, from_current_route=True),
        ],
        settings=TripSettings(),
    )
    mock_client.beta.chat.completions.parse = AsyncMock(
        return_value=_mock_parse_response(parsed)
    )

    current = [
        CurrentWaypoint(name="Lviv", latitude=49.84, longitude=24.03),
        CurrentWaypoint(name="Kyiv", latitude=50.45, longitude=30.52),
    ]
    result = await parse_locations(
        _state(message="Додай проміжну точку - Тернопіль", current_route=current)
    )

    assert result["error"] is None
    assert result["parsed"] is parsed
    sent_messages = mock_client.beta.chat.completions.parse.call_args.kwargs["messages"]
    context_blocks = [m for m in sent_messages if "already on the user's map" in m["content"]]
    assert len(context_blocks) == 1
    assert "Lviv (49.84, 24.03)" in context_blocks[0]["content"]
    assert "Kyiv (50.45, 30.52)" in context_blocks[0]["content"]


@patch("app.nodes._openai_client")
@pytest.mark.asyncio
async def test_parse_locations_omits_context_without_current_route(mock_client):
    """No current route → prompt stays exactly as before (system + user)."""
    parsed = ParsedRoute(
        is_route_request=True,
        locations=[
            ParsedLocation(name="Kyiv Ukraine", location_type="origin"),
            ParsedLocation(name="Lviv Ukraine", location_type="destination"),
        ],
        settings=TripSettings(),
    )
    mock_client.beta.chat.completions.parse = AsyncMock(
        return_value=_mock_parse_response(parsed)
    )

    result = await parse_locations(_state(message="Kyiv to Lviv"))

    assert result["error"] is None
    sent_messages = mock_client.beta.chat.completions.parse.call_args.kwargs["messages"]
    assert len(sent_messages) == 2
    assert all("already on the user's map" not in m["content"] for m in sent_messages)


@patch("app.nodes._openai_client")
@pytest.mark.asyncio
async def test_not_a_route_error_is_localized(mock_client):
    """The guard message is user-facing; a uk request must get the uk text."""
    parsed = ParsedRoute(is_route_request=False, locations=[], settings=TripSettings())
    mock_client.beta.chat.completions.parse = AsyncMock(
        return_value=_mock_parse_response(parsed)
    )

    result = await parse_locations(_state(message="розкажи анекдот", language="uk"))

    assert result["error"] is not None
    assert "маршрути" in result["error"]


@pytest.mark.asyncio
async def test_geocode_locations_trusts_kept_current_waypoints():
    """Locations copied from the current route (matching coordinates) must
    skip Nominatim entirely — their coordinates came from the user's map."""
    from app.schema import CurrentWaypoint

    parsed = ParsedRoute(
        locations=[
            ParsedLocation(name="Lviv", location_type="origin",
                           lat=49.84, lon=24.03, from_current_route=True),
            ParsedLocation(name="Kyiv", location_type="destination",
                           lat=50.45, lon=30.52, from_current_route=True),
        ],
        settings=TripSettings(),
    )
    current = [
        CurrentWaypoint(name="Lviv", latitude=49.84, longitude=24.03),
        CurrentWaypoint(name="Kyiv", latitude=50.45, longitude=30.52),
    ]
    state = _state(parsed=parsed, current_route=current)

    with patch("app.nodes.geocode_location", new=AsyncMock(side_effect=AssertionError(
            "kept current-route waypoints must not be re-geocoded"))):
        result = await geocode_locations(state)

    assert [l.source for l in result["geocoded"]] == ["current_route", "current_route"]
    assert result["geocoded"][0].latitude == 49.84
    # Kept waypoints count as successful, so a modification of a 2-stop
    # route passes the ≥2 valid locations rule
    assert route_after_geocode(result) == "format_response"


@pytest.mark.asyncio
async def test_geocode_locations_regeocode_on_coordinate_mismatch():
    """from_current_route=true with coordinates NOT matching any sent
    waypoint means the LLM invented them — fall back to real geocoding."""
    from app.schema import CurrentWaypoint

    parsed = ParsedRoute(
        locations=[
            ParsedLocation(name="Odesa", location_type="origin",
                           lat=11.11, lon=22.22, from_current_route=True),
            ParsedLocation(name="Kyiv", location_type="destination",
                           lat=50.45, lon=30.52, from_current_route=True),
        ],
        settings=TripSettings(),
    )
    current = [CurrentWaypoint(name="Kyiv", latitude=50.45, longitude=30.52)]
    state = _state(parsed=parsed, current_route=current)

    geocoded = _geocoded("Odesa", "origin", "nominatim", lat=46.48, lon=30.73)
    with patch("app.nodes.geocode_location", new=AsyncMock(return_value=geocoded)) as mock_geo:
        result = await geocode_locations(state)

    assert mock_geo.await_count == 1  # only the mismatched location
    assert result["geocoded"][0].source == "nominatim"
    assert result["geocoded"][1].source == "current_route"


@patch("app.nodes._openai_client")
@pytest.mark.asyncio
async def test_settings_only_modification_keeps_current_route(mock_client):
    """'Change fuel price to 60' against an existing route: the model
    reliably extracts the setting but often returns no locations — the node
    must rebuild the unchanged map route instead of rejecting the request."""
    from app.schema import CurrentWaypoint

    parsed = ParsedRoute(
        is_route_request=False,  # model frequently misclassifies these
        locations=[],
        settings=TripSettings(fuelCostPerLiter=60.0),
    )
    mock_client.beta.chat.completions.parse = AsyncMock(
        return_value=_mock_parse_response(parsed)
    )

    current = [
        CurrentWaypoint(name="Lviv", latitude=49.84, longitude=24.03),
        CurrentWaypoint(name="Ternopil", latitude=49.66, longitude=25.61),
        CurrentWaypoint(name="Kyiv", latitude=50.45, longitude=30.52),
    ]
    result = await parse_locations(
        _state(message="зміни ціну палива на 60 грн", language="uk", current_route=current)
    )

    assert result["error"] is None
    locs = result["parsed"].locations
    assert [l.name for l in locs] == ["Lviv", "Ternopil", "Kyiv"]
    assert [l.location_type for l in locs] == ["origin", "waypoint", "destination"]
    assert all(l.from_current_route for l in locs)
    assert result["parsed"].settings.fuelCostPerLiter == 60.0


@patch("app.nodes._openai_client")
@pytest.mark.asyncio
async def test_off_topic_with_current_route_still_rejected(mock_client):
    """A current route must not weaken the guard: no locations AND no
    settings means the message is genuinely off-topic."""
    from app.schema import CurrentWaypoint

    parsed = ParsedRoute(is_route_request=False, locations=[], settings=TripSettings())
    mock_client.beta.chat.completions.parse = AsyncMock(
        return_value=_mock_parse_response(parsed)
    )

    current = [CurrentWaypoint(name="Lviv", latitude=49.84, longitude=24.03)]
    result = await parse_locations(
        _state(message="tell me a joke", current_route=current)
    )

    assert result["error"] is not None
    assert result["parsed"] is None


# ── fuel_enrichment ────────────────────────────────────────────────────────

def _geo(name, lt, lat, lon, cc=None, source="nominatim"):
    return GeocodedLocation(name=name, clean_name=name, location_type=lt,
                            latitude=lat, longitude=lon, source=source,
                            country_code=cc)


_FD = FuelData(price_per_liter=58.9, currency="UAH", fuel_type="petrol",
               countries=[CountryFuelPrice(code="UA", price=58.9, weight=1.0)],
               source="minfin", fetched_at="2026-07-07T04:00:00Z")


@pytest.mark.asyncio
async def test_fuel_enrichment_passes_ordered_points_and_context():
    state = {
        "geocoded": [_geo("Lviv", "destination", 49.84, 24.03, "UA"),
                     _geo("Kyiv", "origin", 50.45, 30.52, "UA")],
        "settings_context": SettingsContext(fuel_type="diesel", currency="EUR"),
        "error": None,
    }
    with patch("app.nodes.compute_fuel_data",
               AsyncMock(return_value=_FD)) as compute:
        result = await fuel_enrichment(state)
    assert result["fuel_data"] is _FD
    points = compute.await_args.args[0]
    assert points[0][:2] == (50.45, 30.52)          # origin first
    assert compute.await_args.args[1] == "diesel"
    assert compute.await_args.args[2] == "EUR"


@pytest.mark.asyncio
async def test_fuel_enrichment_uses_explicitly_requested_fuel_type():
    state = {
        "geocoded": [_geo("Kyiv", "origin", 50.45, 30.52, "UA"),
                     _geo("Lviv", "destination", 49.84, 24.03, "UA")],
        "parsed": ParsedRoute(locations=[], settings=TripSettings(fuelType="diesel")),
        "settings_context": SettingsContext(fuel_type="petrol", currency="UAH"),
        "error": None,
    }
    with patch("app.nodes.compute_fuel_data", AsyncMock(return_value=_FD)) as compute:
        await fuel_enrichment(state)
    assert compute.await_args.args[1] == "diesel"
    assert compute.await_args.args[2] == "UAH"


@pytest.mark.asyncio
async def test_fuel_enrichment_defaults_context_when_absent():
    state = {"geocoded": [_geo("Kyiv", "origin", 50.45, 30.52, "UA"),
                          _geo("Lviv", "destination", 49.84, 24.03, "UA")],
             "settings_context": None, "error": None}
    with patch("app.nodes.compute_fuel_data", AsyncMock(return_value=None)) as compute:
        result = await fuel_enrichment(state)
    assert result["fuel_data"] is None
    assert compute.await_args.args[1] == "petrol"
    assert compute.await_args.args[2] == "UAH"


@pytest.mark.asyncio
async def test_fuel_enrichment_reverse_geocodes_current_route_points():
    kept = _geo("Home", "origin", 50.45, 30.52, cc=None, source="current_route")
    state = {"geocoded": [kept, _geo("Lviv", "destination", 49.84, 24.03, "UA")],
             "settings_context": None, "error": None}
    with patch("app.nodes.reverse_country", AsyncMock(return_value="UA")) as rev, \
         patch("app.nodes.compute_fuel_data", AsyncMock(return_value=_FD)) as compute:
        await fuel_enrichment(state)
    rev.assert_awaited_once()
    assert compute.await_args.args[0][0][2] == "UA"


@pytest.mark.asyncio
async def test_fuel_enrichment_never_breaks_routing():
    state = {"geocoded": [_geo("Kyiv", "origin", 50.45, 30.52, "UA"),
                          _geo("Lviv", "destination", 49.84, 24.03, "UA")],
             "settings_context": None, "error": None}
    with patch("app.nodes.compute_fuel_data",
               AsyncMock(side_effect=RuntimeError("db exploded"))):
        result = await fuel_enrichment(state)
    assert result["fuel_data"] is None and not result.get("error")


@pytest.mark.asyncio
async def test_fuel_enrichment_skips_on_error_state():
    state = {"error": "boom", "geocoded": [], "settings_context": None}
    result = await fuel_enrichment(state)
    assert result.get("fuel_data") is None


def test_format_response_attaches_fuel_data_and_country_codes():
    state = {
        "geocoded": [_geo("Kyiv", "origin", 50.45, 30.52, "UA"),
                     _geo("Lviv", "destination", 49.84, 24.03, "UA")],
        "parsed": ParsedRoute(locations=[], settings=TripSettings(fuelType="diesel")),
        "fuel_data": _FD,
    }
    result = format_response(state)
    resp = result["response"]
    assert resp.fuel_data is _FD
    assert resp.route.settings.fuelType == "diesel"
    assert resp.route.settings.currency is None
    assert resp.route.waypoints[0].countryCode == "UA"


# ── departure_date ───────────────────────────────────────────────────────

from datetime import datetime as _dt, timedelta as _td, timezone as _tz

from app.nodes import _valid_departure_date
from app.schema import GeocodedLocation, ParsedRoute, TripSettings

_TODAY = _dt.now(_tz.utc).date()


def test_valid_departure_date_accepts_today_and_future():
    assert _valid_departure_date(_TODAY.isoformat()) == _TODAY.isoformat()
    future = (_TODAY + _td(days=10)).isoformat()
    assert _valid_departure_date(future) == future


def test_valid_departure_date_rejects_past_garbage_and_none():
    assert _valid_departure_date((_TODAY - _td(days=1)).isoformat()) is None
    assert _valid_departure_date("next Saturday") is None
    assert _valid_departure_date("2026-13-45") is None
    assert _valid_departure_date(None) is None
    assert _valid_departure_date("") is None


def test_valid_departure_date_accepts_window_boundary_and_rejects_beyond():
    # Mirrors tools/weather.py:FORECAST_WINDOW_DAYS (16) — the boundary date
    # itself is still in-window, one day past it is not.
    boundary = (_TODAY + _td(days=16)).isoformat()
    assert _valid_departure_date(boundary) == boundary

    beyond = (_TODAY + _td(days=17)).isoformat()
    assert _valid_departure_date(beyond) is None


def _state_with_date(departure_date):
    return {
        "parsed": ParsedRoute(is_route_request=True, locations=[],
                              settings=TripSettings(),
                              departure_date=departure_date),
        "geocoded": [_geo("Kyiv", "origin", 50.45, 30.52),
                     _geo("Lviv", "destination", 49.84, 24.03)],
    }


def test_format_response_echoes_valid_departure_date():
    day = (_TODAY + _td(days=3)).isoformat()
    result = format_response(_state_with_date(day))
    assert result["response"].route.settings.departureDate == day


def test_format_response_drops_invalid_departure_date():
    past = (_TODAY - _td(days=3)).isoformat()
    assert format_response(_state_with_date(past)) \
        ["response"].route.settings.departureDate is None
    assert format_response(_state_with_date(None)) \
        ["response"].route.settings.departureDate is None


# ── weather_enrichment ──────────────────────────────────────────────────

from unittest.mock import AsyncMock as _AsyncMock, patch as _patch

from app.nodes import weather_enrichment
from app.schema import WeatherData


async def test_weather_enrichment_attaches_weather():
    fake = WeatherData(date=_TODAY.isoformat(), samples=[], risk_flags=[],
                       source="open-meteo",
                       fetched_at=_dt.now(_tz.utc))
    state = _state_with_date(None)
    with _patch("app.nodes.compute_weather_data",
                new=_AsyncMock(return_value=fake)) as compute:
        result = await weather_enrichment(state)
    assert result["weather_data"] is fake
    # Points built from ordered successful geocodes with clean_name labels
    points = compute.await_args.args[0]
    assert points == [(50.45, 30.52, "Kyiv"), (49.84, 24.03, "Lviv")]


async def test_weather_enrichment_never_errors():
    state = _state_with_date(None)
    with _patch("app.nodes.compute_weather_data",
                new=_AsyncMock(side_effect=RuntimeError("boom"))):
        result = await weather_enrichment(state)
    assert result["weather_data"] is None
    assert not result.get("error")


async def test_weather_enrichment_skips_on_error_state():
    with _patch("app.nodes.compute_weather_data", new=_AsyncMock()) as compute:
        result = await weather_enrichment({"error": "nope", "geocoded": []})
    assert "weather_data" not in result
    compute.assert_not_awaited()


def test_format_response_carries_weather_data():
    fake = WeatherData(date=_TODAY.isoformat(), samples=[], risk_flags=[],
                       source="open-meteo", fetched_at=_dt.now(_tz.utc))
    state = {**_state_with_date(None), "weather_data": fake}
    assert format_response(state)["response"].weather_data is fake


# ── transit waypoints ("через X") ─────────────────────────────────────────
#
# Regression cover for Langfuse trace 9bb9866543a6debd3b1d0756e83ce459:
# "подорож з Нітри до Поморіє на 4 пасажирів через Румунію" came back with
# only origin + destination — the "через Румунію" constraint was silently
# dropped because the prompt never said a transit phrase yields a waypoint,
# and rule 5's "[Proper Name] [City] [Country]" format left a bare country
# with no slot to land in.
#
# The parser's behaviour lives in the prompt, so it splits into two kinds of
# test: prompt-contract assertions below (cheap, run always) and the live
# integration test at the end (the only one that actually proves the model
# obeys). Mocked parse_locations tests cannot validate a prompt — mocking the
# response makes them pass whatever the prompt says.

from app.nodes import _SYSTEM_PROMPT, _RETRY_SYSTEM_PROMPT


def _flat(text: str) -> str:
    """Collapse newlines and indentation so these assertions survive a
    reflow of the prompt. Matching raw text made a one-word wording fix
    fail the suite for a purely cosmetic line-wrap change."""
    return " ".join(text.split())


def test_system_prompt_forbids_dropping_transit_stops():
    prompt = _flat(_SYSTEM_PROMPT.format(today="2026-07-27"))
    assert "через" in prompt and "via" in prompt
    assert "waypoint" in prompt
    assert "never drop" in prompt.lower()


def test_system_prompt_covers_country_and_same_country_region_transit():
    """A transit stop may be larger than a city. Countries ("через Румунію")
    and regions inside the trip's own country ("через Черкаську область")
    must both be named in the prompt, or the model has no template for them
    and omits them — which is exactly how the original bug presented."""
    prompt = _flat(_SYSTEM_PROMPT.format(today="2026-07-27"))
    assert "Румунію" in prompt and "Romania" in prompt
    assert "Cherkasy Oblast Ukraine" in prompt
    assert "-щина" in prompt  # colloquial oblast forms (Полтавщина, Львівщина)
    # Countries/regions must reach Nominatim, not carry guessed coordinates,
    # and must not be silently swapped for a city the model invents
    assert "countries and regions ALWAYS leave lat/lon null" in prompt
    assert "Never replace a named country or region with a city" in prompt


def test_retry_prompt_falls_back_to_admin_centre_instead_of_dropping():
    """If a region name misses in Nominatim, the retry pass must downgrade it
    to its administrative centre rather than quietly shrink the route."""
    assert "administrative centre" in _flat(_RETRY_SYSTEM_PROMPT)
    assert "Cherkasy" in _RETRY_SYSTEM_PROMPT


def test_country_transit_waypoint_survives_into_response():
    """Nitra → Romania → Pomorie: the country waypoint keeps its middle slot
    and is returned to the frontend as a real stop."""
    parsed = ParsedRoute(
        locations=[
            ParsedLocation(name="Nitra Slovakia", location_type="origin",
                           original_name="Нітри"),
            ParsedLocation(name="Romania", location_type="waypoint",
                           original_name="Румунію"),
            ParsedLocation(name="Pomorie Bulgaria", location_type="destination",
                           original_name="Поморіє"),
        ],
        settings=TripSettings(passengers=4),
    )
    geocoded = [
        _geocoded("Nitra Slovakia", "origin", "nominatim", lat=48.31, lon=18.09),
        _geocoded("Romania", "waypoint", "nominatim", lat=45.94, lon=24.97),
        _geocoded("Pomorie Bulgaria", "destination", "nominatim", lat=42.56, lon=27.64),
    ]
    result = format_response(_state(parsed=parsed, geocoded=geocoded))

    waypoints = result["response"].route.waypoints
    assert [w.positionOrder for w in waypoints] == [0, 1, 2]
    assert waypoints[1].name == "Romania"
    assert (waypoints[1].latitude, waypoints[1].longitude) == (45.94, 24.97)
    assert result["response"].stats.skipped == 0
    assert result["response"].route.settings.passengers == 4


def test_same_country_region_transit_waypoints_keep_user_order():
    """Kyiv → Cherkasy Oblast → Vinnytsia Oblast → Odesa: several transit
    regions inside one country stay in the order the user named them."""
    parsed = ParsedRoute(
        locations=[
            ParsedLocation(name="Kyiv Ukraine", location_type="origin"),
            ParsedLocation(name="Cherkasy Oblast Ukraine", location_type="waypoint",
                           original_name="Черкащину"),
            ParsedLocation(name="Vinnytsia Oblast Ukraine", location_type="waypoint",
                           original_name="Вінниччину"),
            ParsedLocation(name="Odesa Ukraine", location_type="destination"),
        ],
        settings=TripSettings(),
    )
    geocoded = [
        _geocoded("Kyiv Ukraine", "origin", "nominatim", lat=50.45, lon=30.52),
        _geocoded("Cherkasy Oblast Ukraine", "waypoint", "nominatim", lat=49.35, lon=31.55),
        _geocoded("Vinnytsia Oblast Ukraine", "waypoint", "nominatim", lat=49.10, lon=28.60),
        _geocoded("Odesa Ukraine", "destination", "nominatim", lat=46.48, lon=30.73),
    ]
    result = format_response(_state(parsed=parsed, geocoded=geocoded))

    names = [w.name for w in result["response"].route.waypoints]
    assert names == [
        "Kyiv Ukraine",
        "Cherkasy Oblast Ukraine",
        "Vinnytsia Oblast Ukraine",
        "Odesa Ukraine",
    ]


@pytest.mark.integration
@pytest.mark.parametrize("message,expect_any_of", [
    # The original failing trace: transit country, cross-border trip
    ("подорож з Нітри до Поморіє на 4 пасажирів через Румунію",
     ("romania", "românia", "румун", "bucharest", "bucure")),
    # Transit region inside the trip's own country
    ("з Києва до Одеси через Черкащину",
     ("cherkas", "черкас")),
    ("поїздка зі Львова до Харкова через Полтавську область",
     ("poltava", "полтав")),
])
async def test_transit_stop_is_parsed_as_waypoint_live(message, expect_any_of):
    """The only test that actually proves the prompt fix: calls gpt-4o-mini
    with the real system prompt. Requires a live OPENAI_API_KEY —
    `pytest -m integration`. Skipped by default (conftest sets a dummy key)."""
    import os
    if os.environ.get("OPENAI_API_KEY", "").startswith("sk-test"):
        pytest.skip("needs a real OPENAI_API_KEY")

    result = await parse_locations(_state(message=message, language="uk"))

    assert result.get("error") is None
    locations = result["parsed"].locations
    waypoints = [l for l in locations if l.location_type == "waypoint"]
    assert waypoints, f"transit stop dropped from {[l.name for l in locations]}"
    blob = " ".join(f"{l.name} {l.original_name or ''}" for l in waypoints).lower()
    assert any(token in blob for token in expect_any_of), \
        f"no expected transit stop in waypoints: {[l.name for l in waypoints]}"


# ── Production route-shape telemetry ───────────────────────────────────────

def _shape_geo(name, type_, source="nominatim", recovered=False):
    from app.schema import GeocodedLocation
    return GeocodedLocation(
        name=name, clean_name=name, location_type=type_,
        latitude=50.0, longitude=30.0, source=source, recovered=recovered,
        error=(source == "failed"),
    )


def test_format_response_records_requested_versus_retained_stops():
    """A dropped transit stop is invisible in production: the response is a
    success and the trace looks healthy. These deterministic counts are the
    only in-trace signal that a stop the user asked for did not survive."""
    from unittest.mock import patch
    from app.nodes import format_response
    from app.schema import ParsedRoute, ParsedLocation, TripSettings

    parsed = ParsedRoute(
        is_route_request=True, settings=TripSettings(),
        locations=[ParsedLocation(name=n, location_type=t) for n, t in
                   [("A", "origin"), ("B", "waypoint"), ("C", "destination")]],
    )
    state = {
        "geocoded": [_shape_geo("A", "origin"), _shape_geo("B", "waypoint", source="failed"),
                     _shape_geo("C", "destination")],
        "parsed": parsed, "retry_count": 1,
    }

    with patch("app.nodes.get_client") as get_client:
        format_response(state)

    kwargs = get_client.return_value.create_event.call_args.kwargs
    assert kwargs["name"] == "route_shape"
    meta = kwargs["metadata"]
    assert meta["requested_stops"] == 3
    assert meta["retained_stops"] == 2
    assert meta["requested_waypoints"] == 1
    assert meta["retained_waypoints"] == 0
    assert meta["geocode_failures"] == 1
    assert meta["geocode_retry_count"] == 1
    # Deterministic counts only — never the user's prompt or their locations
    assert not any(isinstance(v, str) and v in ("A", "B", "C") for v in meta.values())


def test_format_response_survives_broken_langfuse():
    """Observability must never fail a user's route request."""
    from unittest.mock import patch
    from app.nodes import format_response
    from app.schema import ParsedRoute, TripSettings

    state = {
        "geocoded": [_shape_geo("A", "origin"), _shape_geo("B", "destination")],
        "parsed": ParsedRoute(is_route_request=True, settings=TripSettings(), locations=[]),
        "retry_count": 0,
    }
    with patch("app.nodes.get_client", side_effect=RuntimeError("langfuse down")):
        result = format_response(state)
    assert result["response"].success is True
    assert len(result["response"].route.waypoints) == 2


# ── Retry slot matching ────────────────────────────────────────────────────

def _retry_llm(parsed_route):
    from unittest.mock import AsyncMock, MagicMock
    msg = MagicMock(); msg.parsed = parsed_route
    choice = MagicMock(); choice.message = msg
    resp = MagicMock(); resp.choices = [choice]
    return AsyncMock(return_value=resp)


async def test_retry_does_not_merge_the_origin_into_a_failed_destination():
    """Found by the live evaluation: asked for Kyiv -> <unresolvable village>,
    the agent returned Kyiv -> Kyiv with success=true.

    The retry prompt asks for only the failed locations, but the model often
    returns the whole route. Taking the first N locations then merges the
    ORIGIN into the failed destination's slot and silently corrupts the route.
    Slots must be matched by location_type, not by position."""
    from unittest.mock import patch
    from app.nodes import retry_failed_locations
    from app.schema import (GeocodedLocation, ParsedLocation, ParsedRoute,
                            TripSettings)

    geocoded = [
        GeocodedLocation(name="Kyiv Ukraine", clean_name="Kyiv", location_type="origin",
                         latitude=50.45, longitude=30.52, source="nominatim"),
        GeocodedLocation(name="Liutivka Ukraine", clean_name="Liutivka Ukraine",
                         location_type="destination", source="failed", error=True),
    ]
    whole_route = ParsedRoute(
        is_route_request=True, settings=TripSettings(),
        locations=[
            ParsedLocation(name="Kyiv Ukraine", location_type="origin"),
            ParsedLocation(name="Kovel Ukraine", location_type="destination"),
        ])

    async def fake_geocode(loc, _ua="x", allow_ai_coords=True):
        return GeocodedLocation(
            name=loc.name, clean_name=loc.name.split()[0],
            location_type=loc.location_type,
            latitude=51.2, longitude=24.7, source="nominatim")

    with patch("app.nodes._openai_client") as client, \
            patch("app.nodes.geocode_location", fake_geocode):
        client.beta.chat.completions.parse = _retry_llm(whole_route)
        out = await retry_failed_locations(
            {"geocoded": geocoded, "retry_count": 0, "message": "з Києва до Лютівки"})

    destination = out["geocoded"][1]
    assert destination.location_type == "destination"
    assert destination.clean_name == "Kovel", (
        "the failed destination must be filled from the retried DESTINATION, "
        f"not from the origin; got {destination.clean_name!r}")
    # The already-resolved origin must be untouched
    assert out["geocoded"][0].clean_name == "Kyiv"


async def test_retry_matches_multiple_failed_waypoints_in_order():
    from unittest.mock import patch
    from app.nodes import retry_failed_locations
    from app.schema import (GeocodedLocation, ParsedLocation, ParsedRoute,
                            TripSettings)

    geocoded = [
        GeocodedLocation(name="A", clean_name="A", location_type="origin",
                         latitude=1.0, longitude=1.0, source="nominatim"),
        GeocodedLocation(name="B", clean_name="B", location_type="waypoint",
                         source="failed", error=True),
        GeocodedLocation(name="C", clean_name="C", location_type="waypoint",
                         source="failed", error=True),
        GeocodedLocation(name="D", clean_name="D", location_type="destination",
                         latitude=2.0, longitude=2.0, source="nominatim"),
    ]
    retried = ParsedRoute(
        is_route_request=True, settings=TripSettings(),
        locations=[ParsedLocation(name="B2", location_type="waypoint"),
                   ParsedLocation(name="C2", location_type="waypoint")])

    async def fake_geocode(loc, _ua="x", allow_ai_coords=True):
        return GeocodedLocation(name=loc.name, clean_name=loc.name,
                                location_type=loc.location_type,
                                latitude=1.5, longitude=1.5, source="nominatim")

    with patch("app.nodes._openai_client") as client, \
            patch("app.nodes.geocode_location", fake_geocode):
        client.beta.chat.completions.parse = _retry_llm(retried)
        out = await retry_failed_locations(
            {"geocoded": geocoded, "retry_count": 0, "message": "A to D via B and C"})

    assert [l.clean_name for l in out["geocoded"]] == ["A", "B2", "C2", "D"]


async def test_retry_keeps_the_failure_when_no_slot_matches():
    """Better a skipped stop the user can see than a wrong one they cannot."""
    from unittest.mock import patch
    from app.nodes import retry_failed_locations
    from app.schema import (GeocodedLocation, ParsedLocation, ParsedRoute,
                            TripSettings)

    geocoded = [
        GeocodedLocation(name="A", clean_name="A", location_type="origin",
                         latitude=1.0, longitude=1.0, source="nominatim"),
        GeocodedLocation(name="B", clean_name="B", location_type="destination",
                         source="failed", error=True),
    ]
    # More locations than failed slots, so the model echoed a route rather than
    # answering the question — and none of them fits the failed destination.
    # Positional pairing here is what produced "Kyiv -> Kyiv" in production.
    mismatched = ParsedRoute(
        is_route_request=True, settings=TripSettings(),
        locations=[ParsedLocation(name="Y", location_type="waypoint"),
                   ParsedLocation(name="Z", location_type="waypoint")])

    async def fake_geocode(loc, _ua="x", allow_ai_coords=True):
        return GeocodedLocation(name=loc.name, clean_name=loc.name,
                                location_type=loc.location_type,
                                latitude=9.0, longitude=9.0, source="nominatim")

    with patch("app.nodes._openai_client") as client, \
            patch("app.nodes.geocode_location", fake_geocode):
        client.beta.chat.completions.parse = _retry_llm(mismatched)
        out = await retry_failed_locations(
            {"geocoded": geocoded, "retry_count": 0, "message": "A to B"})

    assert out["geocoded"][1].source == "failed"


async def test_retry_falls_back_to_position_when_counts_match_exactly():
    """The retry prompt asks for ONLY the failed locations, and the old
    positional code deliberately tolerated the model mangling location_type.
    Type matching must not lose that: when the model returns exactly as many
    locations as there are failed slots it did what was asked, so pair them in
    order regardless of the type it labelled them with."""
    from unittest.mock import patch
    from app.nodes import retry_failed_locations
    from app.schema import (GeocodedLocation, ParsedLocation, ParsedRoute,
                            TripSettings)

    geocoded = [
        GeocodedLocation(name="A", clean_name="A", location_type="origin",
                         latitude=1.0, longitude=1.0, source="nominatim"),
        GeocodedLocation(name="B", clean_name="B", location_type="waypoint",
                         source="failed", error=True),
        GeocodedLocation(name="C", clean_name="C", location_type="destination",
                         latitude=2.0, longitude=2.0, source="nominatim"),
    ]
    # Exactly one location for exactly one failed slot — but mislabelled
    mangled = ParsedRoute(
        is_route_request=True, settings=TripSettings(),
        locations=[ParsedLocation(name="B2", location_type="destination")])

    async def fake_geocode(loc, _ua="x", allow_ai_coords=True):
        return GeocodedLocation(name=loc.name, clean_name=loc.name,
                                location_type=loc.location_type,
                                latitude=1.5, longitude=1.5, source="nominatim")

    with patch("app.nodes._openai_client") as client, \
            patch("app.nodes.geocode_location", fake_geocode):
        client.beta.chat.completions.parse = _retry_llm(mangled)
        out = await retry_failed_locations(
            {"geocoded": geocoded, "retry_count": 0, "message": "A to C via B"})

    assert [l.clean_name for l in out["geocoded"]] == ["A", "B2", "C"]
    # The slot's own type survives the merge
    assert out["geocoded"][1].location_type == "waypoint"


async def test_retry_pairs_by_identity_not_by_position_when_transposed():
    """Equal counts do not mean matching order. If the model returns the two
    fixes transposed, positional pairing swaps origin and destination and the
    user drives the route backwards — silently, with success=true."""
    from app.nodes import _pair_retry_slots
    from app.schema import GeocodedLocation, ParsedLocation

    failed = [
        GeocodedLocation(name="Kyiv Ukraine", clean_name="Kyiv Ukraine",
                         location_type="origin", source="failed", error=True),
        GeocodedLocation(name="Liutivka Ukraine", clean_name="Liutivka Ukraine",
                         location_type="destination", source="failed", error=True),
    ]
    transposed = [
        ParsedLocation(name="Kovel Ukraine", location_type="destination",
                       original_name="Лютівки"),
        ParsedLocation(name="Kyiv Ukraine", location_type="origin"),
    ]
    pairs = dict(_pair_retry_slots([0, 1], failed, transposed))
    assert pairs[0].name == "Kyiv Ukraine", "origin slot took the destination's fix"
    assert pairs[1].name == "Kovel Ukraine", "destination slot took the origin's fix"


async def test_retry_does_not_fill_a_failed_waypoint_with_another_waypoints_fix():
    """Only waypoint C failed, but the model echoed the whole route. Grabbing
    the first same-type location replaces the stop the user explicitly asked
    for with a duplicate of a different one — worse than skipping it."""
    from app.nodes import _pair_retry_slots
    from app.schema import GeocodedLocation, ParsedLocation

    geocoded = [
        GeocodedLocation(name="Kyiv Ukraine", clean_name="Kyiv", location_type="origin",
                         latitude=1.0, longitude=1.0, source="nominatim"),
        GeocodedLocation(name="Zhytomyr Ukraine", clean_name="Zhytomyr",
                         location_type="waypoint", latitude=1.0, longitude=1.0,
                         source="nominatim"),
        GeocodedLocation(name="Soloniv Ukraine", clean_name="Soloniv",
                         location_type="waypoint", source="failed", error=True),
        GeocodedLocation(name="Lviv Ukraine", clean_name="Lviv",
                         location_type="destination", latitude=2.0, longitude=2.0,
                         source="nominatim"),
    ]
    whole_route = [
        ParsedLocation(name="Kyiv Ukraine", location_type="origin"),
        ParsedLocation(name="Zhytomyr Ukraine", location_type="waypoint"),
        ParsedLocation(name="Soloniv Rivne Ukraine", location_type="waypoint",
                       original_name="Солонів"),
        ParsedLocation(name="Lviv Ukraine", location_type="destination"),
    ]
    pairs = dict(_pair_retry_slots([2], geocoded, whole_route))
    assert 2 in pairs, "the failed waypoint found no correction at all"
    assert "Soloniv" in pairs[2].name, (
        f"failed waypoint was filled from a different stop: {pairs[2].name!r}")


async def test_retry_skips_rather_than_guessing_between_same_type_candidates():
    """When nothing identifies which correction belongs to the failed stop, a
    visibly skipped stop beats a plausible wrong one."""
    from app.nodes import _pair_retry_slots
    from app.schema import GeocodedLocation, ParsedLocation

    geocoded = [
        GeocodedLocation(name="A Ukraine", clean_name="A", location_type="origin",
                         latitude=1.0, longitude=1.0, source="nominatim"),
        GeocodedLocation(name="B Ukraine", clean_name="B", location_type="waypoint",
                         latitude=1.0, longitude=1.0, source="nominatim"),
        GeocodedLocation(name="C Ukraine", clean_name="C", location_type="waypoint",
                         source="failed", error=True),
        GeocodedLocation(name="D Ukraine", clean_name="D", location_type="destination",
                         latitude=2.0, longitude=2.0, source="nominatim"),
    ]
    # Two same-type candidates, neither identifiable as the failed stop's fix
    unidentifiable = [
        ParsedLocation(name="Somewhere Else", location_type="waypoint"),
        ParsedLocation(name="Another Place", location_type="waypoint"),
    ]
    assert _pair_retry_slots([2], geocoded, unidentifiable) == []


# ── Pinned clock (evaluations replay recorded dates on any calendar day) ──

def test_pinned_today_drives_departure_date_validation():
    from datetime import date
    from app.nodes import pinned_today, today_utc

    with pinned_today(date(2026, 8, 15)):
        assert today_utc() == date(2026, 8, 15)
        assert _valid_departure_date("2026-08-16") == "2026-08-16"
        assert _valid_departure_date("2026-08-14") is None


def test_system_prompt_uses_the_pinned_date():
    from datetime import date
    from app.nodes import pinned_today, _system_prompt

    with pinned_today(date(2026, 8, 15)):
        assert "2026-08-15" in _system_prompt()
