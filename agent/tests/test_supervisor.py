import asyncio
import time
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
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


async def test_supervise_gives_up_on_slow_llm_and_fails_open():
    """A stalled provider must not own the user's latency: trace
    4a10c386… spent 14.9s of an 18.3s request inside this one call."""
    async def _stall(*args, **kwargs):
        await asyncio.sleep(30)

    with patch("app.nodes._SUPERVISOR_TIMEOUT_S", 0.05), \
            patch("app.nodes.get_client") as get_client, \
            patch("app.nodes._openai_client") as client:
        client.beta.chat.completions.parse = _stall
        started = time.monotonic()
        result = await supervise(_state())
        elapsed = time.monotonic() - started

    # Bounded by the budget, not by the provider
    assert elapsed < 1.0
    # Same fail-open target as any other supervisor failure
    assert result["intent"] == "create" and not result.get("error")
    assert route_after_supervisor(result) == "parse_locations"
    # wait_for cancels the request, so the generation span may never export —
    # the event is the only in-trace record that the stall happened
    assert get_client.return_value.create_event.call_args.kwargs["name"] \
        == "supervisor_timeout"


async def test_supervise_timeout_survives_broken_langfuse():
    """Observability must never fail a request."""
    async def _stall(*args, **kwargs):
        await asyncio.sleep(30)

    with patch("app.nodes._SUPERVISOR_TIMEOUT_S", 0.05), \
            patch("app.nodes.get_client", side_effect=RuntimeError("no client")), \
            patch("app.nodes._openai_client") as client:
        client.beta.chat.completions.parse = _stall
        result = await supervise(_state())

    assert result["intent"] == "create" and not result.get("error")


async def test_supervise_modify_routes_to_parser():
    decision = SupervisorDecision(intent="modify", settings=TripSettings())
    with patch("app.nodes._openai_client") as client:
        client.beta.chat.completions.parse = AsyncMock(return_value=_llm_response(decision))
        result = await supervise(_state(message="додай Тернопіль", language="uk",
                                        current_route=_ROUTE))
    assert result["intent"] == "modify"
    assert route_after_supervisor(result) == "parse_locations"


def _jev_response(choice, probability):
    resp = MagicMock()
    resp.raise_for_status = MagicMock()
    resp.json.return_value = {"answers": {"intent": {
        "type": "choice", "choice": choice, "probabilities": {choice: probability}}}}
    return resp


@pytest.mark.parametrize("choice", ["create", "modify"])
async def test_supervise_confident_jev_skips_llm(monkeypatch, choice):
    monkeypatch.setenv("OPENROUTER_API_KEY", "or-test")
    with patch("app.nodes._jev_http") as http, patch("app.nodes._openai_client") as client:
        http.post = AsyncMock(return_value=_jev_response(choice, 0.95))
        client.beta.chat.completions.parse = AsyncMock()
        result = await supervise(_state(current_route=_ROUTE))
    assert result["intent"] == choice
    assert route_after_supervisor(result) == "parse_locations"
    client.beta.chat.completions.parse.assert_not_called()


async def test_supervise_confident_jev_off_topic_sets_error(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "or-test")
    with patch("app.nodes._jev_http") as http:
        http.post = AsyncMock(return_value=_jev_response("off_topic", 1.0))
        result = await supervise(_state(message="хто ти?", language="uk"))
    assert result["intent"] == "off_topic" and "маршрути" in result["error"]
    # No route: "modify" must not be offered to Jev at all
    criteria = http.post.call_args.kwargs["json"]["questions"]["intent"]["criteria"]
    assert "modify" not in criteria


@pytest.mark.parametrize("jev", [
    _jev_response("off_topic", 0.6),            # not confident
    _jev_response("settings_only", 1.0),        # Jev can't extract settings
    httpx.HTTPStatusError("503", request=MagicMock(), response=MagicMock()),
])
async def test_supervise_defers_to_llm_when_jev_cannot_decide(monkeypatch, jev):
    monkeypatch.setenv("OPENROUTER_API_KEY", "or-test")
    decision = SupervisorDecision(intent="create", settings=TripSettings())
    with patch("app.nodes._jev_http") as http, patch("app.nodes._openai_client") as client:
        http.post = AsyncMock(side_effect=jev) if isinstance(jev, Exception) \
            else AsyncMock(return_value=jev)
        client.beta.chat.completions.parse = AsyncMock(return_value=_llm_response(decision))
        result = await supervise(_state())
    assert result["intent"] == "create" and not result.get("error")
    client.beta.chat.completions.parse.assert_awaited_once()
