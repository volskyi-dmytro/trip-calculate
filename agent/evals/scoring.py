"""Deterministic scorers.

No LLM judge. Every verdict here is reproducible from the observation alone,
so a failing case means the agent changed, never that the judge had an off
day. Matching is semantic (substring against several accepted spellings) but
the *decision* is exact.

Each scorer returns per-check detail rich enough to debug the failure without
re-running: what was expected, what was observed, and which assertion broke.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Iterable, Optional

from pydantic import BaseModel, Field

from .models import CarCase, RouteCase, StopExpect


# ── Observations (what the runner extracts from a response) ────────────────

class ObservedStop(BaseModel):
    name: str
    # Positional role, derived the same way format_response derives it:
    # first = origin, last = destination, everything between = waypoint.
    type: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class RouteObservation(BaseModel):
    intent: Optional[str] = None
    route_request: Optional[bool] = None
    success: bool = False
    error: Optional[str] = None
    message: Optional[str] = None
    stops: list[ObservedStop] = Field(default_factory=list)
    settings: dict[str, Any] = Field(default_factory=dict)
    # Locations whose coordinates came from the model on the FIRST geocoding
    # pass. The graph is supposed to make this impossible; a non-zero count is
    # a hard failure, not a quality score.
    unsafe_ai_coords: int = 0
    # Locations rescued by the retry pass — allowed to use model coordinates.
    recovered: int = 0
    geocode_failures: int = 0
    latency_s: Optional[float] = None
    usage: dict[str, Any] = Field(default_factory=dict)
    model_calls: list[dict[str, Any]] = Field(default_factory=list)
    cost_usd: Optional[float] = None
    model: Optional[str] = None
    raw_error: Optional[str] = None


class CarObservation(BaseModel):
    unknown: bool = True
    fuel_type: Optional[str] = None
    consumption: Optional[float] = None
    make_model: Optional[str] = None
    latency_s: Optional[float] = None
    usage: dict[str, Any] = Field(default_factory=dict)
    model_calls: list[dict[str, Any]] = Field(default_factory=list)
    cost_usd: Optional[float] = None
    model: Optional[str] = None
    raw_error: Optional[str] = None


# ── Results ────────────────────────────────────────────────────────────────

class Check(BaseModel):
    name: str
    passed: bool
    detail: str


class CaseResult(BaseModel):
    id: str
    kind: str
    passed: bool
    tags: list[str] = Field(default_factory=list)
    checks: list[Check] = Field(default_factory=list)
    # None = this case does not assert that dimension (excluded from its rate)
    metrics: dict[str, Optional[float]] = Field(default_factory=dict)
    diagnostics: dict[str, Any] = Field(default_factory=dict)

    @property
    def failed_checks(self) -> list[Check]:
        return [c for c in self.checks if not c.passed]


def _match_ordered(
    expected: list[StopExpect], observed: list[ObservedStop]
) -> list[Optional[int]]:
    """Greedy ordered-subsequence match of expectations against observed stops.

    Subsequence rather than positional: a model that inserts a sensible extra
    stop has not regressed on what the user explicitly asked for. What must
    hold is that every requested stop is present, has the right positional
    role, and appears in the requested order.
    """
    matched: list[Optional[int]] = []
    cursor = 0
    for exp in expected:
        found: Optional[int] = None
        for i in range(cursor, len(observed)):
            stop = observed[i]
            if stop.type == exp.type and any(
                needle in stop.name.lower() for needle in exp.contains_any
            ):
                found = i
                break
        matched.append(found)
        if found is not None:
            cursor = found + 1
    return matched


# Roughly 5 km. Kept map waypoints keep their exact coordinates
# (_is_kept_current_waypoint requires a 1e-4 match), and even a re-geocoded
# settlement lands well inside this. A stop that moved further is a different
# place wearing the same name.
_PRESERVED_TOLERANCE_DEG = 0.05


def _find_preserved(
    waypoint, observed: list[ObservedStop], claimed: set[int]
) -> Optional[int]:
    """Index of the observed stop that preserves `waypoint`, or None.

    Matching is by COORDINATE, not by name. Name containment is dangerously
    permissive here: "Lviv" is a substring of "Lviv Oblast" and "Kyiv" of
    "Kyivska Square", so a modification that replaced both endpoints with
    different places would score as fully preserving them. Coordinates are the
    thing the user actually pinned on the map.

    Already-claimed stops are excluded so one survivor cannot stand in for two
    untouched waypoints.
    """
    for i, stop in enumerate(observed):
        if i in claimed or stop.latitude is None or stop.longitude is None:
            continue
        if (abs(stop.latitude - waypoint.latitude) <= _PRESERVED_TOLERANCE_DEG
                and abs(stop.longitude - waypoint.longitude) <= _PRESERVED_TOLERANCE_DEG):
            return i
    return None


def _guidance_texts() -> set[str]:
    from app.nodes import _NOT_A_ROUTE_ERRORS

    return set(_NOT_A_ROUTE_ERRORS.values())


def score_route_case(
    case: RouteCase, obs: RouteObservation, today: date
) -> CaseResult:
    checks: list[Check] = []
    metrics: dict[str, Optional[float]] = {}
    exp = case.expect

    def check(name: str, passed: bool, detail: str) -> bool:
        checks.append(Check(name=name, passed=passed, detail=detail))
        return passed

    stop_summary = [f"{s.type}:{s.name}" for s in obs.stops]

    # An observation that never reached the model (or blew up in the runner)
    # cannot testify to anything. Fail loudly rather than letting a degraded
    # result masquerade as a verdict.
    if obs.raw_error:
        check("model_was_called", False, obs.raw_error)

    # Supervisor intent
    if exp.intent is not None:
        metrics["intent_correct"] = float(
            check("intent", obs.intent == exp.intent,
                  f"expected intent {exp.intent!r}, observed {obs.intent!r}")
        )
    else:
        metrics["intent_correct"] = None

    # Route-request classification
    if exp.route_request is not None:
        metrics["route_request_correct"] = float(
            check("route_request", obs.route_request == exp.route_request,
                  f"expected is_route_request {exp.route_request}, "
                  f"observed {obs.route_request}")
        )
    else:
        metrics["route_request_correct"] = None

    # Overall success flag
    if exp.success is not None:
        check("success", obs.success == exp.success,
              f"expected success={exp.success}, observed success={obs.success} "
              f"(error={obs.error!r})")

    # Ordered stops + explicit waypoint retention
    if exp.ordered_stops is not None:
        matched = _match_ordered(exp.ordered_stops, obs.stops)
        for expected_stop, index in zip(exp.ordered_stops, matched):
            check(
                f"stop:{expected_stop.type}:{expected_stop.contains_any[0]}",
                index is not None,
                f"expected a {expected_stop.type} matching any of "
                f"{expected_stop.contains_any} in order; observed stops "
                f"{stop_summary}",
            )
        metrics["ordered_stops_correct"] = float(all(i is not None for i in matched))

        requested = [
            (e, i) for e, i in zip(exp.ordered_stops, matched) if e.type == "waypoint"
        ]
        metrics["waypoints_requested"] = float(len(requested))
        metrics["waypoints_retained"] = float(sum(1 for _, i in requested if i is not None))
    else:
        metrics["ordered_stops_correct"] = None
        metrics["waypoints_requested"] = 0.0
        metrics["waypoints_retained"] = 0.0

    # Settings extraction — both the values that must be set and the ones that
    # must stay untouched
    if exp.settings or exp.settings_absent:
        ok = True
        for field, want in exp.settings.items():
            got = obs.settings.get(field)
            ok &= check(f"setting:{field}", got == want,
                        f"expected settings.{field}={want!r}, observed {got!r}")
        for field in exp.settings_absent:
            got = obs.settings.get(field)
            ok &= check(f"setting_absent:{field}", got is None,
                        f"expected settings.{field} to stay unset "
                        f"(the user never mentioned it), observed {got!r}")
        metrics["settings_correct"] = float(ok)
    else:
        metrics["settings_correct"] = None

    # Current-route preservation
    if exp.preserve_current_route:
        current = case.input.current_route or []
        ok = True
        claimed: set[int] = set()
        for waypoint in current:
            index = _find_preserved(waypoint, obs.stops, claimed)
            if index is not None:
                claimed.add(index)
            ok &= check(
                f"preserved:{waypoint.name}",
                index is not None,
                f"expected the untouched stop {waypoint.name!r} "
                f"({waypoint.latitude}, {waypoint.longitude}) to survive the "
                f"modification unchanged; observed stops {stop_summary}",
            )
        metrics["current_route_preserved"] = float(ok)
    else:
        metrics["current_route_preserved"] = None

    # Usable route — only meaningful when a route was supposed to come back
    expects_route = exp.success is not False
    if expects_route:
        minimum = exp.min_geocoded_waypoints if exp.min_geocoded_waypoints is not None else 2
        usable = obs.success and len(obs.stops) >= minimum
        metrics["usable_route"] = float(
            check("usable_route", usable,
                  f"expected a usable route with >= {minimum} geocoded stops, "
                  f"observed success={obs.success} with {len(obs.stops)} stops "
                  f"{stop_summary}; error={obs.error!r}")
        )
    else:
        metrics["usable_route"] = None

    # Friendly guidance instead of a malformed route or a leaked internal error
    if exp.guidance_message:
        check("guidance_message", obs.error in _guidance_texts(),
              f"expected the established off-topic guidance text, "
              f"observed error={obs.error!r}")

    # Departure date
    if exp.departure_date is not None:
        want = (today + timedelta(days=exp.departure_date.offset_days)).isoformat()
        got = obs.settings.get("departureDate")
        metrics["departure_date_correct"] = float(
            check("departure_date", got == want,
                  f"expected departureDate {want} (today+"
                  f"{exp.departure_date.offset_days}), observed {got!r}")
        )
    elif exp.departure_date_absent:
        got = obs.settings.get("departureDate")
        metrics["departure_date_correct"] = float(
            check("departure_date_absent", got is None,
                  f"expected departureDate to be dropped (not mentioned, past, "
                  f"or beyond the 16-day forecast window), observed {got!r}")
        )
    else:
        metrics["departure_date_correct"] = None

    # Hard invariant, asserted on every case: the graph must never accept
    # model-invented coordinates on the first geocoding pass.
    metrics["unsafe_ai_coords"] = float(obs.unsafe_ai_coords)
    check("no_unsafe_ai_coords", obs.unsafe_ai_coords == 0,
          f"expected 0 locations accepted from model-provided coordinates on "
          f"the first geocoding pass, observed {obs.unsafe_ai_coords}")

    passed = all(c.passed for c in checks)
    return CaseResult(
        id=case.id, kind="route", passed=passed, tags=case.tags,
        checks=checks, metrics=metrics,
        diagnostics={
            "message": case.input.message,
            "language": case.input.language,
            "observed_stops": stop_summary,
            "observed_settings": {k: v for k, v in obs.settings.items() if v is not None},
            "observed_intent": obs.intent,
            "observed_error": obs.error,
            "recovered": obs.recovered,
            "geocode_failures": obs.geocode_failures,
            "latency_s": obs.latency_s,
            "cost_usd": obs.cost_usd,
            "tokens": obs.usage.get("total", 0),
            "model_calls": obs.model_calls,
            "model": obs.model,
            "runner_error": obs.raw_error,
        },
    )


def score_car_case(case: CarCase, obs: CarObservation) -> CaseResult:
    checks: list[Check] = []
    metrics: dict[str, Optional[float]] = {}
    exp = case.expect

    def check(name: str, passed: bool, detail: str) -> bool:
        checks.append(Check(name=name, passed=passed, detail=detail))
        return passed

    if obs.raw_error:
        check("model_was_called", False, obs.raw_error)

    if exp.unknown:
        # Admitting ignorance is the correct answer; a fabricated precise
        # estimate is worse than no estimate at all.
        correct = check(
            "unknown", obs.unknown,
            f"expected unknown=true for {case.input.description!r}, observed "
            f"unknown={obs.unknown} ({obs.make_model!r}, {obs.fuel_type!r}, "
            f"{obs.consumption!r} L/100km)",
        )
        metrics["unknown_correct"] = float(correct)
        metrics["recognized_correct"] = None
        metrics["fuel_type_correct"] = None
        metrics["consumption_in_range"] = None
        metrics["make_model_correct"] = None
        metrics["classification_correct"] = float(correct)
    else:
        recognized = check(
            "recognized", not obs.unknown,
            f"expected a recognized vehicle for {case.input.description!r}, "
            f"observed unknown={obs.unknown}",
        )
        metrics["recognized_correct"] = float(recognized)
        metrics["unknown_correct"] = None
        metrics["classification_correct"] = float(recognized)

        metrics["fuel_type_correct"] = float(
            check("fuel_type", obs.fuel_type == exp.fuel_type,
                  f"expected fuelType {exp.fuel_type!r}, observed {obs.fuel_type!r}")
        )

        low, high = exp.consumption_range  # type: ignore[misc]
        in_range = obs.consumption is not None and low <= obs.consumption <= high
        metrics["consumption_in_range"] = float(
            check("consumption_in_range", in_range,
                  f"expected consumption within [{low}, {high}] L/100km, "
                  f"observed {obs.consumption!r}")
        )

        if exp.make_model_contains_any:
            observed_model = (obs.make_model or "").lower()
            metrics["make_model_correct"] = float(
                check("make_model",
                      any(n in observed_model for n in exp.make_model_contains_any),
                      f"expected makeModel matching any of "
                      f"{exp.make_model_contains_any}, observed {obs.make_model!r}")
            )
        else:
            metrics["make_model_correct"] = None

    passed = all(c.passed for c in checks)
    return CaseResult(
        id=case.id, kind="car", passed=passed, tags=case.tags,
        checks=checks, metrics=metrics,
        diagnostics={
            "description": case.input.description,
            "language": case.input.language,
            "observed": obs.model_dump(
                include={"unknown", "fuel_type", "consumption", "make_model"}),
            "latency_s": obs.latency_s,
            "cost_usd": obs.cost_usd,
            "tokens": obs.usage.get("total", 0),
            "model_calls": obs.model_calls,
            "model": obs.model,
            "runner_error": obs.raw_error,
        },
    )


# ── Aggregation ────────────────────────────────────────────────────────────

# Per-case 0/1 metrics averaged over the cases that actually assert them. A
# dimension no case asserts aggregates to None, never to a flattering 100%.
_RATE_METRICS = {
    "intent_correct": "intent_accuracy",
    "route_request_correct": "route_request_accuracy",
    "ordered_stops_correct": "ordered_stops_rate",
    "settings_correct": "settings_rate",
    "current_route_preserved": "current_route_preservation_rate",
    "usable_route": "usable_route_rate",
    "departure_date_correct": "departure_date_rate",
    "fuel_type_correct": "fuel_type_accuracy",
    "consumption_in_range": "consumption_in_range_rate",
    "classification_correct": "classification_accuracy",
    "make_model_correct": "make_model_rate",
}


def aggregate(results: Iterable[CaseResult]) -> dict[str, Optional[float]]:
    results = list(results)
    out: dict[str, Optional[float]] = {}

    for metric, name in _RATE_METRICS.items():
        values = [
            r.metrics[metric] for r in results
            if r.metrics.get(metric) is not None
        ]
        out[name] = (sum(values) / len(values)) if values else None

    # The headline metric is per-stop, not per-case: retaining 1 of 2 stops in
    # one case and 2 of 2 in another is 3/4, not "half the cases passed".
    requested = sum(r.metrics.get("waypoints_requested") or 0 for r in results)
    retained = sum(r.metrics.get("waypoints_retained") or 0 for r in results)
    out["waypoint_retention_rate"] = (retained / requested) if requested else None
    out["waypoints_requested"] = requested
    out["waypoints_retained"] = retained

    out["unsafe_ai_coords"] = sum(r.metrics.get("unsafe_ai_coords") or 0 for r in results)
    out["cases"] = float(len(results))
    out["cases_passed"] = float(sum(1 for r in results if r.passed))
    out["case_pass_rate"] = (
        out["cases_passed"] / len(results) if results else None
    )
    return out
