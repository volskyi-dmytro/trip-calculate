"""Contract tests for the evaluation layer itself.

These guard the *evaluator*, not the agent: a scorer that silently passes a
regression is worse than no evaluation at all. Every scorer therefore gets a
negative control — a deliberately wrong observation that MUST fail — because a
scorer that only ever sees correct input proves nothing.
"""
from datetime import date, timedelta
from pathlib import Path

import pytest
from pydantic import ValidationError

from evals.models import CarCase, RouteCase
from evals.scoring import (
    CarObservation, ObservedStop, RouteObservation,
    aggregate, score_car_case, score_route_case,
)

TODAY = date(2026, 8, 15)
REPO_ROOT = Path(__file__).resolve().parents[2]


def _stops(*names: str) -> list[ObservedStop]:
    """Positional typing mirrors format_response: first origin, last
    destination, everything between a waypoint."""
    last = len(names) - 1
    return [
        ObservedStop(
            name=n,
            type="origin" if i == 0 else "destination" if i == last else "waypoint",
            latitude=50.0 + i,
            longitude=30.0 + i,
        )
        for i, n in enumerate(names)
    ]


def _route_case(**expect) -> RouteCase:
    return RouteCase.model_validate({
        "id": "t", "input": {"message": "m"}, "expect": expect,
    })


def _ok_obs(*names: str, **kw) -> RouteObservation:
    kw.setdefault("success", True)
    return RouteObservation(stops=_stops(*names), **kw)


# ── Dataset schema validation ──────────────────────────────────────────────

def test_route_case_rejects_unknown_expectation_key():
    """A typo in a fixture key must fail loudly. Silently ignoring an unknown
    key turns a regression test into a test that asserts nothing."""
    with pytest.raises(ValidationError):
        RouteCase.model_validate({
            "id": "typo-case",
            "input": {"message": "Kyiv to Lviv"},
            "expect": {"ordered_stopz": []},
        })


def test_route_case_rejects_uppercase_match_substring():
    """Matching is case-insensitive via lowercasing the observation, so an
    uppercase needle could never match — reject it at load time."""
    with pytest.raises(ValidationError):
        RouteCase.model_validate({
            "id": "bad-needle",
            "input": {"message": "Kyiv to Lviv"},
            "expect": {"ordered_stops": [
                {"type": "origin", "contains_any": ["Kyiv"]},
            ]},
        })


def test_route_case_rejects_empty_contains_any():
    with pytest.raises(ValidationError):
        RouteCase.model_validate({
            "id": "empty-needle",
            "input": {"message": "Kyiv to Lviv"},
            "expect": {"ordered_stops": [{"type": "origin", "contains_any": []}]},
        })


def test_car_case_rejects_inverted_consumption_range():
    with pytest.raises(ValidationError):
        CarCase.model_validate({
            "id": "inverted",
            "input": {"description": "octavia"},
            "expect": {"unknown": False, "fuel_type": "diesel",
                       "consumption_range": [9.0, 4.0]},
        })


def test_car_case_rejects_fields_on_an_unknown_expectation():
    """`unknown: true` means the model must admit ignorance — asserting a fuel
    type at the same time is contradictory."""
    with pytest.raises(ValidationError):
        CarCase.model_validate({
            "id": "contradictory",
            "input": {"description": "my toaster"},
            "expect": {"unknown": True, "fuel_type": "diesel"},
        })


# ── Ordered-stop and waypoint-retention scoring ────────────────────────────

_TRANSIT = _route_case(ordered_stops=[
    {"type": "origin", "contains_any": ["nitra"]},
    {"type": "waypoint", "contains_any": ["romania", "bucharest"]},
    {"type": "destination", "contains_any": ["pomorie", "помор"]},
])


def test_ordered_stops_pass_when_all_present_in_order():
    r = score_route_case(_TRANSIT, _ok_obs("Nitra", "Bucharest", "Pomorie"), TODAY)
    assert r.passed
    assert r.metrics["waypoints_requested"] == 1
    assert r.metrics["waypoints_retained"] == 1
    assert r.metrics["ordered_stops_correct"] == 1


def test_dropped_transit_stop_fails_and_is_counted():
    """The exact regression that shipped as commit 97a4e90: the model drops
    the `через X` stop and returns a plausible-looking two-stop route."""
    r = score_route_case(_TRANSIT, _ok_obs("Nitra", "Pomorie"), TODAY)
    assert not r.passed
    assert r.metrics["waypoints_retained"] == 0
    assert r.metrics["waypoints_requested"] == 1
    assert any("romania" in c.detail.lower() for c in r.checks if not c.passed)


def test_transit_stop_present_but_out_of_order_fails():
    """Order is a constraint, not a nicety — a waypoint after the
    destination sends the driver backwards."""
    r = score_route_case(_TRANSIT, _ok_obs("Nitra", "Pomorie", "Bucharest"), TODAY)
    assert not r.passed
    assert r.metrics["ordered_stops_correct"] == 0


def test_extra_intermediate_stop_still_passes():
    """Expectations are an ordered subsequence: a model that adds a sensible
    extra stop has not regressed on what the user explicitly asked for."""
    r = score_route_case(
        _TRANSIT, _ok_obs("Nitra", "Budapest", "Bucharest", "Pomorie"), TODAY)
    assert r.passed


def test_stop_matched_at_wrong_position_type_fails():
    """Romania as the destination is not Romania as a transit stop."""
    case = _route_case(ordered_stops=[
        {"type": "origin", "contains_any": ["nitra"]},
        {"type": "waypoint", "contains_any": ["romania"]},
    ])
    r = score_route_case(case, _ok_obs("Nitra", "Romania"), TODAY)
    assert not r.passed


# ── Settings scoring ───────────────────────────────────────────────────────

def test_settings_value_must_match():
    case = _route_case(settings={"passengers": 4})
    assert score_route_case(case, _ok_obs("A", "B", settings={"passengers": 4}), TODAY).passed
    bad = score_route_case(case, _ok_obs("A", "B", settings={"passengers": 2}), TODAY)
    assert not bad.passed
    assert bad.metrics["settings_correct"] == 0


def test_absent_settings_must_remain_absent():
    """An agent that helpfully fills in a passenger count the user never
    mentioned silently overwrites the user's own value in the UI."""
    case = _route_case(settings_absent=["passengers", "currency"])
    assert score_route_case(case, _ok_obs("A", "B", settings={}), TODAY).passed
    filled = score_route_case(
        case, _ok_obs("A", "B", settings={"passengers": 1}), TODAY)
    assert not filled.passed
    assert any("passengers" in c.detail for c in filled.checks if not c.passed)


def test_explicit_null_setting_counts_as_absent():
    case = _route_case(settings_absent=["currency"])
    assert score_route_case(case, _ok_obs("A", "B", settings={"currency": None}), TODAY).passed


# ── Current-route preservation ─────────────────────────────────────────────

_MODIFY = RouteCase.model_validate({
    "id": "add-stop",
    "input": {
        "message": "add a stop in Rivne",
        "current_route": [
            {"name": "Kyiv", "latitude": 50.45, "longitude": 30.52},
            {"name": "Lviv", "latitude": 49.84, "longitude": 24.03},
        ],
    },
    "expect": {"preserve_current_route": True, "ordered_stops": [
        {"type": "waypoint", "contains_any": ["rivne", "рівне"]},
    ]},
})


# Real coordinates: preservation is matched on the point the user pinned, not
# on the stop's name.
_KYIV = ObservedStop(name="Kyiv", type="origin", latitude=50.4501, longitude=30.5234)
_RIVNE = ObservedStop(name="Rivne", type="waypoint", latitude=50.6199, longitude=26.2516)
_LVIV = ObservedStop(name="Lviv", type="destination", latitude=49.8397, longitude=24.0297)


def test_current_route_preserved_when_endpoints_survive():
    r = score_route_case(
        _MODIFY, RouteObservation(success=True, stops=[_KYIV, _RIVNE, _LVIV]), TODAY)
    assert r.passed, [c.detail for c in r.failed_checks]
    assert r.metrics["current_route_preserved"] == 1


def test_dropping_an_untouched_endpoint_fails():
    """Adding a stop must not silently discard the user's destination."""
    dropped = RouteObservation(success=True, stops=[
        _KYIV,
        ObservedStop(name="Rivne", type="destination",
                     latitude=50.6199, longitude=26.2516),
    ])
    r = score_route_case(_MODIFY, dropped, TODAY)
    assert not r.passed
    assert r.metrics["current_route_preserved"] == 0
    assert any("Lviv" in c.detail for c in r.failed_checks)


def test_substring_collision_does_not_count_as_preserved():
    """A stop whose name merely *contains* the original is a different place.
    "Lviv" -> "Lviv Oblast" and "Kyiv" -> "Kyivska Square" both drop the user's
    actual stop while looking preserved to a naive substring check."""
    collided = RouteObservation(success=True, stops=[
        ObservedStop(name="Kyivska Square", type="origin",
                     latitude=50.44, longitude=30.51),
        ObservedStop(name="Lviv Oblast", type="destination",
                     latitude=49.65, longitude=23.90),
    ])
    r = score_route_case(_MODIFY, collided, TODAY)
    assert not r.passed
    assert r.metrics["current_route_preserved"] == 0


def test_one_stop_cannot_satisfy_two_current_waypoints():
    """Each untouched stop needs its own survivor; a single stop must not be
    double-counted to make a halved route look intact."""
    case = RouteCase.model_validate({
        "id": "dupes",
        "input": {"message": "add Rivne", "current_route": [
            {"name": "Kyiv", "latitude": 50.4501, "longitude": 30.5234},
            {"name": "Kyiv", "latitude": 50.4501, "longitude": 30.5234},
        ]},
        "expect": {"preserve_current_route": True},
    })
    only_one = RouteObservation(success=True, stops=[
        ObservedStop(name="Kyiv", type="origin", latitude=50.4501, longitude=30.5234),
        ObservedStop(name="Rivne", type="destination", latitude=50.6199, longitude=26.2516),
    ])
    assert not score_route_case(case, only_one, TODAY).passed


def test_preserved_stop_must_keep_its_coordinates():
    """Kept map waypoints carry the user's own coordinates. A stop that kept
    the name but moved 200 km is not the stop the user pinned."""
    moved = RouteObservation(success=True, stops=[
        ObservedStop(name="Kyiv", type="origin", latitude=48.0, longitude=28.0),
        ObservedStop(name="Rivne", type="waypoint", latitude=50.6199, longitude=26.2516),
        ObservedStop(name="Lviv", type="destination", latitude=49.8397, longitude=24.0297),
    ])
    assert not score_route_case(_MODIFY, moved, TODAY).passed


# ── Unsafe model coordinates ───────────────────────────────────────────────

def test_first_pass_ai_coordinates_are_unsafe():
    """Coordinates the model invented must never be accepted on the initial
    geocoding pass — a plausible-looking lat/lon silently corrupts the route
    and hides the geocoding failure from the retry loop."""
    case = _route_case(min_geocoded_waypoints=2)
    r = score_route_case(case, _ok_obs("A", "B", unsafe_ai_coords=1), TODAY)
    assert not r.passed
    assert r.metrics["unsafe_ai_coords"] == 1


def test_recovered_ai_coordinates_are_not_unsafe():
    """The retry pass is explicitly allowed to fall back to model coordinates
    after Nominatim has rejected the name twice."""
    case = _route_case(min_geocoded_waypoints=2)
    r = score_route_case(case, _ok_obs("A", "B", unsafe_ai_coords=0, recovered=1), TODAY)
    assert r.passed


# ── Departure date ─────────────────────────────────────────────────────────

def test_departure_date_offset_is_resolved_against_run_day():
    case = _route_case(departure_date={"offset_days": 1})
    good = _ok_obs("A", "B", settings={"departureDate": (TODAY + timedelta(days=1)).isoformat()})
    assert score_route_case(case, good, TODAY).passed
    bad = _ok_obs("A", "B", settings={"departureDate": (TODAY + timedelta(days=5)).isoformat()})
    assert not score_route_case(case, bad, TODAY).passed


def test_out_of_window_date_must_be_dropped():
    """A past or beyond-forecast date is treated as not-mentioned, so the
    picker keeps the user's own value."""
    case = _route_case(departure_date_absent=True)
    assert score_route_case(case, _ok_obs("A", "B", settings={}), TODAY).passed
    leaked = _ok_obs("A", "B", settings={"departureDate": "2020-01-01"})
    assert not score_route_case(case, leaked, TODAY).passed


# ── Off-topic / guidance ───────────────────────────────────────────────────

def test_guidance_message_must_be_the_established_text():
    from app.nodes import _NOT_A_ROUTE_ERRORS

    case = _route_case(success=False, guidance_message=True)
    good = RouteObservation(success=False, error=_NOT_A_ROUTE_ERRORS["en"])
    assert score_route_case(case, good, TODAY).passed
    # A raw internal error is a leak, not guidance
    leak = RouteObservation(success=False, error="Failed to parse route request: boom")
    assert not score_route_case(case, leak, TODAY).passed


def test_off_topic_case_must_not_return_a_route():
    case = _route_case(success=False, guidance_message=True)
    built = _ok_obs("A", "B")
    assert not score_route_case(case, built, TODAY).passed


# ── Car scoring ────────────────────────────────────────────────────────────

_CAR = CarCase.model_validate({
    "id": "octavia",
    "input": {"description": "octavia a5 1.9 tdi"},
    "expect": {"unknown": False, "fuel_type": "diesel",
               "consumption_range": [5.5, 7.5],
               "make_model_contains_any": ["octavia"]},
})


def test_car_pass_within_range():
    obs = CarObservation(unknown=False, fuel_type="diesel",
                         consumption=6.3, make_model="Škoda Octavia A5 1.9 TDI")
    r = score_car_case(_CAR, obs)
    assert r.passed
    assert r.metrics["fuel_type_correct"] == 1
    assert r.metrics["consumption_in_range"] == 1


def test_car_wrong_fuel_type_fails():
    obs = CarObservation(unknown=False, fuel_type="petrol",
                         consumption=6.3, make_model="Škoda Octavia")
    r = score_car_case(_CAR, obs)
    assert not r.passed
    assert r.metrics["fuel_type_correct"] == 0


def test_car_consumption_outside_band_fails():
    obs = CarObservation(unknown=False, fuel_type="diesel",
                         consumption=11.0, make_model="Škoda Octavia")
    r = score_car_case(_CAR, obs)
    assert not r.passed
    assert r.metrics["consumption_in_range"] == 0


def test_car_unknown_when_a_vehicle_was_expected_fails():
    r = score_car_case(_CAR, CarObservation(unknown=True))
    assert not r.passed
    assert r.metrics["recognized_correct"] == 0


def test_non_vehicle_must_be_unknown():
    case = CarCase.model_validate({
        "id": "toaster", "input": {"description": "my toaster"},
        "expect": {"unknown": True},
    })
    assert score_car_case(case, CarObservation(unknown=True)).passed
    fabricated = CarObservation(unknown=False, fuel_type="petrol",
                                consumption=7.0, make_model="Toaster GT")
    r = score_car_case(case, fabricated)
    assert not r.passed
    assert r.metrics["unknown_correct"] == 0


# ── Aggregation ────────────────────────────────────────────────────────────

def test_waypoint_retention_rate_is_stops_not_cases():
    """The headline metric is per-stop: a run that keeps 1 of 2 stops in one
    case and 2 of 2 in another retained 3 of 4, not "half the cases"."""
    two = _route_case(ordered_stops=[
        {"type": "origin", "contains_any": ["a"]},
        {"type": "waypoint", "contains_any": ["b"]},
        {"type": "waypoint", "contains_any": ["c"]},
        {"type": "destination", "contains_any": ["d"]},
    ])
    partial = score_route_case(two, _ok_obs("A", "B", "D"), TODAY)   # C dropped
    full = score_route_case(two, _ok_obs("A", "B", "C", "D"), TODAY)
    agg = aggregate([partial, full])
    assert agg["waypoint_retention_rate"] == pytest.approx(3 / 4)
    assert agg["case_pass_rate"] == pytest.approx(1 / 2)


def test_aggregate_reports_zero_denominator_as_none():
    """No case asserted an intent -> the accuracy is undefined, not 100%."""
    agg = aggregate([score_route_case(_route_case(), _ok_obs("A", "B"), TODAY)])
    assert agg["intent_accuracy"] is None


# ── Committed datasets ─────────────────────────────────────────────────────

def test_every_committed_dataset_loads_and_validates():
    from evals.loader import discover, load_dataset

    paths = discover()
    assert paths, "no datasets discovered"
    for path in paths:
        load_dataset(path)  # raises on a malformed fixture


def test_every_case_has_a_mock_so_contract_mode_covers_it():
    """A case without a mock block is invisible to CI. Allowing that silently
    would let coverage rot while the suite still reports green."""
    from evals.loader import discover, load_dataset

    missing = [
        f"{path.name}:{case.id}"
        for path in discover()
        for case in load_dataset(path).cases
        if case.mock is None
    ]
    assert not missing, f"cases with no mock block: {missing}"


def test_required_route_categories_are_covered():
    from evals.loader import DATASETS_DIR, load_dataset

    dataset = load_dataset(DATASETS_DIR / "route_parsing.v1.yaml")
    tags = {t for case in dataset.cases for t in case.tags}
    for required in ("transit", "country", "region", "ordering", "modify",
                     "settings_only", "off_topic", "injection", "departure_date",
                     "village", "safety"):
        assert required in tags, f"route dataset lost coverage of {required!r}"


def test_geocode_recordings_needles_are_lowercase():
    from evals.geocoder import RecordedGeocoder

    RecordedGeocoder.load()  # raises on an uppercase needle


def test_recorded_geocoder_prefers_the_longest_match():
    """"Bucharest Romania" must resolve to the city, not the country —
    declaration order must not decide the answer."""
    from evals.geocoder import RecordedGeocoder

    g = RecordedGeocoder.load()
    assert g.find("Bucharest Romania")["id"] == "bucharest"
    assert g.find("Romania")["id"] == "romania"
    assert g.find("Cherkasy Oblast Ukraine")["id"] == "cherkasy-oblast"
    assert g.find("Cherkasy Ukraine")["id"] == "cherkasy"
    # The village is knowable only by its native spelling
    assert g.find("Solovychi Ukraine") is None
    assert g.find("Соловичі")["id"] == "solovychi"


# ── Runner behaviour ───────────────────────────────────────────────────────

def test_live_mode_without_api_key_refuses_to_run():
    """Live mode must never silently degrade to mocked results — a green run
    that never called the model is worse than no run at all."""
    from evals.runner import MissingCredentials, require_live_credentials

    with pytest.raises(MissingCredentials):
        require_live_credentials("live", {})
    with pytest.raises(MissingCredentials):
        require_live_credentials("live", {"OPENAI_API_KEY": "   "})
    require_live_credentials("live", {"OPENAI_API_KEY": "sk-real"})
    require_live_credentials("mock", {})  # mock never needs a key


def test_runner_main_exits_nonzero_without_a_live_key(monkeypatch, capsys):
    from evals.runner import main

    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    assert main(["--mode", "live"]) == 2
    assert "live mode needs a real OPENAI_API_KEY" in capsys.readouterr().err


def test_template_placeholders_resolve_against_the_run_day():
    from evals.runner import render_template

    out = render_template(
        {"departure_date": "{{today+1}}", "nested": ["{{today-2}}", "plain"]}, TODAY)
    assert out["departure_date"] == (TODAY + timedelta(days=1)).isoformat()
    assert out["nested"] == [(TODAY - timedelta(days=2)).isoformat(), "plain"]


# ── Langfuse is best-effort ────────────────────────────────────────────────

def test_langfuse_publish_is_skipped_explicitly_when_unconfigured(monkeypatch):
    from evals import langfuse_adapter

    monkeypatch.delenv("LANGFUSE_PUBLIC_KEY", raising=False)
    monkeypatch.delenv("LANGFUSE_SECRET_KEY", raising=False)
    result = langfuse_adapter.publish(object())  # type: ignore[arg-type]
    assert result.status == "skipped"
    assert result.trace_id is None
    assert "LANGFUSE_PUBLIC_KEY" in result.message


def test_langfuse_publish_swallows_failures(monkeypatch):
    """An observability outage must never turn a green evaluation red."""
    from evals import langfuse_adapter

    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk-test")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "sk-test")
    monkeypatch.setattr(
        langfuse_adapter, "_publish",
        lambda _r: (_ for _ in ()).throw(RuntimeError("langfuse is down")))
    result = langfuse_adapter.publish(object())  # type: ignore[arg-type]
    assert result.status == "failed"
    assert result.trace_id is None
    assert "langfuse is down" in result.message


def test_langfuse_trace_verification_is_bounded_when_ingestion_is_not_visible(
    monkeypatch,
):
    from evals import langfuse_adapter

    calls: list[str] = []

    class TraceApi:
        @staticmethod
        def get(trace_id):
            calls.append(trace_id)
            raise RuntimeError("not visible yet")

    client = type(
        "Client", (), {"api": type("Api", (), {"trace": TraceApi()})()}
    )()
    monkeypatch.setattr(langfuse_adapter.time, "sleep", lambda _seconds: None)

    assert not langfuse_adapter._trace_was_ingested(client, "trace-abc")
    assert calls == ["trace-abc"] * 5


def test_langfuse_trace_url_failure_does_not_hide_submission():
    from evals import langfuse_adapter

    class Client:
        @staticmethod
        def get_trace_url(*, trace_id):
            raise RuntimeError(f"project lookup failed for {trace_id}")

    assert langfuse_adapter._safe_trace_url(Client(), "trace-abc") is None


async def test_usage_recorder_keeps_privacy_safe_per_call_telemetry():
    from evals.runner import _UsageRecorder

    class Usage:
        prompt_tokens = 11
        completion_tokens = 7
        total_tokens = 18

    response = type("Response", (), {"usage": Usage(), "model": "model-version"})()

    class Completions:
        async def parse(self, **_kwargs):
            return response

    inner = type(
        "Client", (),
        {"beta": type("Beta", (), {"chat": type("Chat", (), {"completions": Completions()})()})()},
    )()
    recorder = _UsageRecorder(inner)
    response_format = type("SupervisorDecision", (), {})

    await recorder.parse(
        response_format=response_format,
        messages=[{"role": "user", "content": "private fixture prompt"}],
    )

    assert recorder.calls == [{
        "operation": "SupervisorDecision",
        "model": "model-version",
        "input_tokens": 11,
        "output_tokens": 7,
        "total_tokens": 18,
        "latency_s": recorder.calls[0]["latency_s"],
    }]
    assert recorder.calls[0]["latency_s"] >= 0
    assert "private fixture prompt" not in repr(recorder.calls)


def test_live_evaluation_uses_uninstrumented_provider_client(monkeypatch):
    """The post-run evaluation hierarchy is the only Langfuse export. Using
    app.nodes' instrumented client would also emit orphan generation traces and
    duplicate tokens/cost outside the evaluation root."""
    import openai

    from evals import runner

    sentinel = object()
    monkeypatch.setattr(openai, "AsyncOpenAI", lambda: sentinel)
    assert runner._build_live_client() is sentinel


# ── Runner integration ─────────────────────────────────────────────────────

async def test_mock_mode_runs_a_real_case_through_the_real_graph():
    """Contract mode must exercise the actual graph — supervisor, routing
    edges, geocoding node and composer — with only the model and Nominatim
    substituted. If this ever passes without touching app code, the suite has
    become a self-referential no-op."""
    from evals.runner import run

    report = await run("mock", dataset_filter="route_parsing",
                       case_filter="uk-transit-country", today=date(2026, 8, 15))
    assert len(report.results) == 1
    result = report.results[0]
    assert result.passed, [c.detail for c in result.failed_checks]
    # The country transit stop survived as a real waypoint
    assert any("Romania" in s for s in result.diagnostics["observed_stops"])
    assert result.metrics["waypoints_retained"] == 1
    assert report.datasets[0].sha256  # provenance is recorded


async def test_mock_mode_needs_no_network_or_api_key(monkeypatch):
    """The CI gate must run on a box with no OpenAI key and no outbound
    network to OSM or open-meteo."""
    import httpx

    from evals.runner import run

    async def explode(*_a, **_kw):
        raise AssertionError("mock mode must not open a network connection")

    # Asserted on `send`, not `get`: the runner substitutes `get` itself, so
    # patching that would only prove the runner overrode the trap. `send` is
    # what a real request must go through, and nothing may reach it.
    monkeypatch.setattr(httpx.AsyncClient, "send", explode)
    for dataset in ("supervisor", "route_parsing", "car_estimates"):
        report = await run("mock", dataset_filter=dataset, today=date(2026, 8, 15))
        assert report.metrics["case_pass_rate"] == 1.0, dataset


async def test_langfuse_publish_emits_the_expected_scores(monkeypatch):
    """The failure path is covered above; this covers the path that actually
    has to produce data, so a broken adapter cannot hide behind its own
    exception handling."""
    from contextlib import contextmanager

    from evals import langfuse_adapter
    from evals.runner import run

    scores: list[dict] = []
    spans: list[dict] = []
    propagated_attributes: list[dict] = []
    verified_trace_calls: list[str] = []
    depth = 0

    class FakeClient:
        def __init__(self, **_kw):
            class TraceApi:
                @staticmethod
                def get(trace_id):
                    verified_trace_calls.append(trace_id)
                    return type("Trace", (), {"id": trace_id})()

            self.api = type("Api", (), {"trace": TraceApi()})()

        @contextmanager
        def start_as_current_observation(self, **kw):
            nonlocal depth
            spans.append({**kw, "depth": depth})
            depth += 1
            try:
                observation_id = (
                    "case-observation" if kw.get("name") == "route_intelligence_eval_case"
                    else f"observation-{len(spans)}"
                )
                yield type("Observation", (), {"id": observation_id})()
            finally:
                depth -= 1

        def get_current_trace_id(self): return "trace-abc"
        # Match Langfuse 4.14.4: update_current_span does not accept tags.
        def update_current_span(
            self, *, name=None, input=None, output=None, metadata=None,
            version=None, level=None, status_message=None,
        ):
            spans.append({"updated_name": name})
        def create_score(self, **kw): scores.append(kw)
        def flush(self): pass
        def get_trace_url(self, *, trace_id=None):
            return f"https://langfuse.test/traces/{trace_id}"

    import langfuse

    @contextmanager
    def fake_propagate_attributes(**kw):
        propagated_attributes.append(kw)
        yield

    monkeypatch.setattr(langfuse, "Langfuse", FakeClient)
    monkeypatch.setattr(langfuse, "propagate_attributes", fake_propagate_attributes)

    report = await run("mock", dataset_filter="route_parsing",
                       today=date(2026, 8, 15))
    report.results[0].diagnostics["model_calls"] = [{
        "operation": "SupervisorDecision",
        "model": "gpt-4o-mini-2024-07-18",
        "input_tokens": 11,
        "output_tokens": 7,
        "total_tokens": 18,
        "latency_s": 0.125,
    }]
    # Configured only after the run: the run itself must never publish to a
    # real Langfuse, and the fake below stands in for the publish step.
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk-test")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "sk-test")
    published = langfuse_adapter.publish(report)
    assert published.status == "published"
    assert published.trace_id == "trace-abc"
    assert published.url == "https://langfuse.test/traces/trace-abc"
    assert verified_trace_calls == ["trace-abc"]

    tags = propagated_attributes[0]["tags"]
    assert "evaluation" in tags
    assert "mode:mock" in tags
    assert any(t.startswith("dataset:") for t in tags)
    assert any(t.startswith("git_sha:") for t in tags)

    names = {s["name"] for s in scores}
    for required in ("eval_pass", "intent_correct", "ordered_stops_correct",
                     "settings_correct", "usable_route", "waypoint_retention",
                     "eval.case_pass_rate", "eval.waypoint_retention_rate"):
        assert required in names, f"missing score {required!r}"
    assert all(
        score["observation_id"] == "case-observation"
        for score in scores if score["name"] == "eval_pass"
    )

    # Fractional per-case retention, not a 0/1 flag
    retention = [s for s in scores if s["name"] == "waypoint_retention"]
    assert retention and all(0.0 <= s["value"] <= 1.0 for s in retention)

    root = next(s for s in spans if s.get("name") == "route_intelligence_eval")
    assert root["as_type"] == "evaluator" and root["depth"] == 0
    case = next(s for s in spans if s.get("name") == "route_intelligence_eval_case")
    assert case["as_type"] == "evaluator" and case["depth"] == 1
    generation = next(s for s in spans if s.get("name") == "eval_model_call")
    assert generation["as_type"] == "generation" and generation["depth"] == 2
    assert generation["model"] == "gpt-4o-mini-2024-07-18"
    assert generation["usage_details"] == {"input": 11, "output": 7, "total": 18}
    assert generation["metadata"]["operation"] == "SupervisorDecision"

    # Nothing published may carry a fixture's prompt text
    blob = repr(scores) + repr(spans)
    assert "Нітри" not in blob and "через" not in blob


async def test_eval_runs_do_not_emit_production_operational_events(monkeypatch):
    """A configured Langfuse must not receive a stray orphan trace per case:
    evaluation traffic is synthetic and belongs on the run's own evaluation
    trace, not mixed into production telemetry."""
    from unittest.mock import MagicMock

    import app.nodes as nodes

    from evals.runner import run

    real_client = MagicMock()
    monkeypatch.setattr(nodes, "get_client", lambda: real_client)
    await run("mock", dataset_filter="route_parsing", today=date(2026, 8, 15))
    real_client.create_event.assert_not_called()


def _report(pass_rate, unsafe=0.0):
    from evals.runner import RunReport

    return RunReport(
        mode="mock", model="mock", geocoder="recorded",
        started_at="x", finished_at="y", duration_s=0.0,
        metrics={"case_pass_rate": pass_rate, "unsafe_ai_coords": unsafe},
    )


def test_fail_under_relaxes_the_pass_bar_but_never_the_safety_invariant():
    """--fail-under lets a live run tolerate one flaky model answer. It must
    not be able to wave through accepted model coordinates."""
    from evals.runner import exit_code

    assert exit_code(_report(1.0)) == 0
    assert exit_code(_report(0.95)) == 1              # default bar is 100%
    assert exit_code(_report(0.95), fail_under=0.9) == 0
    assert exit_code(_report(0.85), fail_under=0.9) == 1
    # Unsafe coordinates fail regardless of how low the bar is set
    assert exit_code(_report(1.0, unsafe=1.0), fail_under=0.0) == 1


def test_production_deploy_is_gated_by_live_evaluation():
    workflow = (REPO_ROOT / ".github/workflows/deploy-prod.yml").read_text()

    assert "  evaluate:\n" in workflow
    assert "  build:\n    needs: evaluate\n" in workflow
    assert "OPENAI_API_KEY: ${{ secrets.PROD_OPENAI_API_KEY }}" in workflow
    assert "LANGFUSE_PUBLIC_KEY: ${{ secrets.PROD_LANGFUSE_PUBLIC_KEY }}" in workflow
    assert "LANGFUSE_SECRET_KEY: ${{ secrets.PROD_LANGFUSE_SECRET_KEY }}" in workflow
    assert "LANGFUSE_HOST: ${{ secrets.PROD_LANGFUSE_HOST }}" in workflow
    assert "LANGFUSE_TRACING_ENVIRONMENT: evaluation" in workflow
    assert "LANGFUSE_RELEASE: ${{ github.sha }}" in workflow
    assert "python -m evals.runner --mode live --fail-under 1.0" in workflow


def test_production_images_include_the_arm64_vps_platform():
    workflow = (REPO_ROOT / ".github/workflows/deploy-prod.yml").read_text()

    assert workflow.count(
        "docker buildx build --platform linux/amd64,linux/arm64"
    ) == 2
    assert workflow.count("--push") >= 2
    assert "docker/setup-qemu-action@v3" in workflow


def test_production_agent_traces_are_separated_and_release_tagged():
    workflow = (REPO_ROOT / ".github/workflows/deploy-prod.yml").read_text()

    assert '-e LANGFUSE_TRACING_ENVIRONMENT="production"' in workflow
    assert '-e LANGFUSE_RELEASE="${GITHUB_SHA}"' in workflow


def test_manual_live_workflow_maps_existing_production_secrets():
    workflow = (REPO_ROOT / ".github/workflows/eval-live.yml").read_text()

    assert "OPENAI_API_KEY: ${{ secrets.PROD_OPENAI_API_KEY }}" in workflow
    assert "LANGFUSE_PUBLIC_KEY: ${{ secrets.PROD_LANGFUSE_PUBLIC_KEY }}" in workflow
    assert "LANGFUSE_SECRET_KEY: ${{ secrets.PROD_LANGFUSE_SECRET_KEY }}" in workflow
    assert "LANGFUSE_HOST: ${{ secrets.PROD_LANGFUSE_HOST }}" in workflow
    assert "LANGFUSE_TRACING_ENVIRONMENT: evaluation" in workflow
    assert "LANGFUSE_RELEASE: ${{ github.sha }}" in workflow


def test_empty_run_fails_rather_than_reporting_success():
    """A typo'd --case-id must not look like a clean run."""
    from evals.runner import exit_code

    assert exit_code(_report(None)) == 1


# ── Baseline manifest privacy ──────────────────────────────────────────────

async def test_baseline_manifest_leaks_no_case_level_data(tmp_path):
    """The manifest is committed to git; the full report is not. It must carry
    aggregates and provenance only — never a prompt, stop name, observed
    setting or any other per-request detail."""
    import json

    from evals.make_baseline import build, to_yaml
    from evals.runner import run

    report = json.loads(
        (await run("mock", today=date(2026, 8, 15))).model_dump_json())
    report["mode"] = "live"  # build() is mode-agnostic; the CLI enforces live
    text = to_yaml(build(report, notes="test"))

    # Every fixture's input text, and every observed stop name, must be absent
    from evals.loader import discover, load_dataset
    from evals.models import RouteDataset

    for path in discover():
        dataset = load_dataset(path)
        for case in dataset.cases:
            probe = (case.input.message if isinstance(dataset, RouteDataset)
                     else case.input.description)
            assert probe not in text, f"manifest leaked the input of {case.id}"
            assert case.id not in text, f"manifest leaked the case id {case.id}"
    for r in report["results"]:
        for stop in r["diagnostics"].get("observed_stops") or []:
            assert stop.split(":", 1)[-1] not in text, "manifest leaked a stop name"

    # …while still carrying what a baseline is for
    for required in ("dataset_version", "git_sha", "model", "recorded_at",
                     "route_case_pass_rate", "explicit_waypoint_retention_rate",
                     "car_estimate_pass_rate", "p95_latency_ms",
                     "unsafe_accepted_model_coordinates"):
        assert required in text, f"manifest lost {required}"


def test_baseline_refuses_a_mock_run(tmp_path, capsys):
    """A mock run's numbers say nothing about model quality and must never be
    pinned as a quality baseline."""
    import json

    from evals.make_baseline import main

    report = tmp_path / "r.json"
    report.write_text(json.dumps({"mode": "mock", "results": [], "datasets": [],
                                  "metrics": {}, "model": "mock"}))
    assert main([str(report), "--out", str(tmp_path / "b.yaml")]) == 2
    assert "must come from a live run" in capsys.readouterr().err


# ── Live mode cannot pass without a real model call ────────────────────────

async def test_live_car_case_with_no_model_call_cannot_pass():
    """estimate_car() swallows every exception and returns unknown=True — the
    right behaviour for the product, but in live mode it makes a provider
    outage indistinguishable from the model correctly admitting ignorance.
    The `unknown: true` fixtures would score a clean pass having never called
    the model, which is exactly the silent fallback live mode must not have."""
    from unittest.mock import patch

    from evals.models import CarCase
    from evals.runner import run_car_case
    from evals.scoring import score_car_case

    case = CarCase.model_validate({
        "id": "ambiguous-probe", "input": {"description": "Toyota"},
        "expect": {"unknown": True}, "mock": {"estimate": {"unknown": True}},
    })

    async def boom(**_kw):
        raise RuntimeError("provider is down")

    with patch("app.nodes._openai_client") as client:
        client.beta.chat.completions.parse = boom
        obs = await run_car_case(case, "live", date(2026, 8, 15))

    assert obs.unknown is True          # the product degraded as designed…
    assert obs.raw_error, "a live case that burned no tokens must be flagged"
    assert not score_car_case(case, obs).passed, (
        "a live result produced without any model call must not score a pass")


async def test_mock_car_case_is_not_flagged_for_zero_tokens():
    """Mock mode legitimately makes no provider call; the guard is live-only."""
    from evals.loader import DATASETS_DIR, load_dataset
    from evals.runner import run_car_case
    from evals.scoring import score_car_case

    case = load_dataset(DATASETS_DIR / "car_estimates.v1.yaml").cases[0]
    obs = await run_car_case(case, "mock", date(2026, 8, 15))
    assert not obs.raw_error
    assert score_car_case(case, obs).passed


async def test_live_route_case_with_no_model_call_cannot_pass():
    """supervise() fails open to intent='create' on any provider error, so a
    live route case could otherwise reach the scorer without a model call."""
    from unittest.mock import patch

    from evals.models import RouteCase
    from evals.runner import run_route_case
    from evals.geocoder import RecordedGeocoder
    from evals.scoring import score_route_case

    case = RouteCase.model_validate({
        "id": "probe", "input": {"message": "from Kyiv to Lviv"},
        "expect": {"success": True, "min_geocoded_waypoints": 2},
    })

    async def boom(**_kw):
        raise RuntimeError("provider is down")

    with patch("app.nodes._openai_client") as client:
        client.beta.chat.completions.parse = boom
        obs = await run_route_case(case, "live", RecordedGeocoder.load(),
                                   date(2026, 8, 15))

    assert obs.raw_error, "a live route case that burned no tokens must be flagged"
    assert not score_route_case(case, obs, date(2026, 8, 15)).passed
