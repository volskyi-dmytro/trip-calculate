from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic import ValidationError

from app.nodes import supervise, route_after_supervisor
from app.schema import (
    SupervisorDecision, TripSettings, CurrentWaypoint, ParsedRoute,
)


def _llm_response(decision: SupervisorDecision):
    msg = MagicMock()
    msg.parsed = decision
    choice = MagicMock()
    choice.message = msg
    resp = MagicMock()
    resp.choices = [choice]
    return resp


def _state(message="Kyiv to Lviv", language="en", current_route=None):
    return {"message": message, "language": language, "user_id": "t",
            "current_route": current_route, "parsed": None, "geocoded": [],
            "response": None, "error": None, "retry_count": 0,
            "settings_context": None, "fuel_data": None, "intent": None}


_ROUTE = [CurrentWaypoint(name="Kyiv", latitude=50.45, longitude=30.52),
          CurrentWaypoint(name="Lviv", latitude=49.84, longitude=24.03)]


async def test_supervise_create_passes_through():
    decision = SupervisorDecision(intent="create", settings=TripSettings())
    with patch("app.nodes._openai_client") as client:
        client.beta.chat.completions.parse = AsyncMock(return_value=_llm_response(decision))
        result = await supervise(_state())
    assert result["intent"] == "create" and not result.get("error")
    assert route_after_supervisor(result) == "parse_locations"


async def test_supervise_off_topic_sets_localized_error():
    decision = SupervisorDecision(intent="off_topic", settings=TripSettings())
    with patch("app.nodes._openai_client") as client:
        client.beta.chat.completions.parse = AsyncMock(return_value=_llm_response(decision))
        result = await supervise(_state(message="хто ти?", language="uk"))
    assert result["intent"] == "off_topic"
    assert "маршрути" in result["error"]
    assert route_after_supervisor(result) == "format_error"


async def test_supervise_settings_only_rebuilds_route_deterministically():
    decision = SupervisorDecision(
        intent="settings_only",
        settings=TripSettings(fuelCostPerLiter=60.0),
    )
    with patch("app.nodes._openai_client") as client:
        client.beta.chat.completions.parse = AsyncMock(return_value=_llm_response(decision))
        result = await supervise(_state(message="зміни ціну палива на 60",
                                        language="uk", current_route=_ROUTE))
    parsed = result["parsed"]
    assert isinstance(parsed, ParsedRoute)
    assert [l.name for l in parsed.locations] == ["Kyiv", "Lviv"]
    assert all(l.from_current_route for l in parsed.locations)
    assert parsed.settings.fuelCostPerLiter == 60.0
    assert route_after_supervisor(result) == "geocode_locations"


async def test_supervise_settings_only_applies_fuel_type_without_changing_currency():
    decision = SupervisorDecision(
        intent="settings_only",
        settings=TripSettings(passengers=3, fuelType="diesel"),
    )
    with patch("app.nodes._openai_client") as client:
        client.beta.chat.completions.parse = AsyncMock(return_value=_llm_response(decision))
        result = await supervise(_state(
            message="Change passengers to 3 and use diesel",
            current_route=_ROUTE,
        ))

    parsed = result["parsed"]
    assert parsed.settings.passengers == 3
    assert parsed.settings.fuelType == "diesel"
    assert parsed.settings.currency is None


def test_trip_settings_rejects_fuel_type_as_currency():
    with pytest.raises(ValidationError):
        TripSettings(fuelType="diesel", currency="diesel")


async def test_supervise_settings_only_without_route_is_off_topic():
    decision = SupervisorDecision(
        intent="settings_only", settings=TripSettings(fuelCostPerLiter=60.0))
    with patch("app.nodes._openai_client") as client:
        client.beta.chat.completions.parse = AsyncMock(return_value=_llm_response(decision))
        result = await supervise(_state(message="change fuel price to 60"))
    assert result["intent"] == "off_topic" and result["error"]


async def test_supervise_fails_open_to_create_on_llm_error():
    with patch("app.nodes._openai_client") as client:
        client.beta.chat.completions.parse = AsyncMock(side_effect=RuntimeError("api down"))
        result = await supervise(_state())
    # Fail open: the route agent's in-band guards still backstop garbage
    assert result["intent"] == "create" and not result.get("error")
    assert route_after_supervisor(result) == "parse_locations"


async def test_supervise_modify_routes_to_parser():
    decision = SupervisorDecision(intent="modify", settings=TripSettings())
    with patch("app.nodes._openai_client") as client:
        client.beta.chat.completions.parse = AsyncMock(return_value=_llm_response(decision))
        result = await supervise(_state(message="додай Тернопіль", language="uk",
                                        current_route=_ROUTE))
    assert result["intent"] == "modify"
    assert route_after_supervisor(result) == "parse_locations"
