"""Typed fixture schema for the evaluation datasets.

Every model forbids unknown keys. That is deliberate: a mistyped expectation
key in a YAML fixture would otherwise be silently ignored, leaving a
regression case that asserts nothing while still reporting "pass".

Expectations are *semantic*, never exact model wording. A stop is matched by
case-insensitive substring against any of several accepted spellings, so a
model that answers "Nitra, Slovakia" and one that answers "Nitra" both pass —
what we regress on is whether the stop survived at all, not how it was
spelled. See evals/README.md for the reasoning.
"""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

FuelType = Literal["petrol", "diesel", "lpg"]
Intent = Literal["create", "modify", "settings_only", "off_topic"]
StopType = Literal["origin", "waypoint", "destination"]

# Settings field names a fixture may assert on, mirrored from the HTTP contract
# so a renamed response field breaks the fixtures loudly instead of silently
# never matching.
from app.schema import RouteSettings  # noqa: E402

_SETTINGS_FIELDS = set(RouteSettings.model_fields)


class _Base(BaseModel):
    model_config = ConfigDict(extra="forbid")


def _all_lowercase(values: list[str]) -> list[str]:
    """Needles are matched against a lowercased observation, so an uppercase
    needle could never match. Reject it at load time rather than silently
    failing every run."""
    for value in values:
        if not value.strip():
            raise ValueError("match substrings must be non-empty")
        if value != value.lower():
            raise ValueError(f"match substrings must be lowercase: {value!r}")
    return values


# ── Route fixtures ─────────────────────────────────────────────────────────

class StopExpect(_Base):
    type: StopType
    contains_any: list[str] = Field(min_length=1)

    _lower = field_validator("contains_any")(_all_lowercase)


class CurrentWaypointIn(_Base):
    """A stop already on the user's map, replayed as request context."""
    name: str
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class SettingsContextIn(_Base):
    fuel_type: FuelType = "petrol"
    currency: Literal["UAH", "USD", "EUR"] = "UAH"


class RouteInput(_Base):
    message: str = Field(min_length=1, max_length=500)
    language: str = "en"
    current_route: Optional[list[CurrentWaypointIn]] = None
    settings_context: Optional[SettingsContextIn] = None


class DepartureDateExpect(_Base):
    """Relative, never absolute: a committed ISO date would silently rot into
    a past date and start failing on its own."""
    offset_days: int = Field(ge=0, le=16)  # bounded by weather FORECAST_WINDOW_DAYS


class RouteExpect(_Base):
    intent: Optional[Intent] = None
    route_request: Optional[bool] = None
    success: Optional[bool] = None
    ordered_stops: Optional[list[StopExpect]] = None
    # field name -> required value, e.g. {"passengers": 4}
    settings: dict[str, Any] = Field(default_factory=dict)
    # fields that must stay unset — guards against the agent resetting a
    # setting the user never mentioned
    settings_absent: list[str] = Field(default_factory=list)
    min_geocoded_waypoints: Optional[int] = Field(default=None, ge=0)
    # every stop named in input.current_route must still be present
    preserve_current_route: Optional[bool] = None
    departure_date: Optional[DepartureDateExpect] = None
    departure_date_absent: Optional[bool] = None
    # the response must be the established friendly guidance text, not a
    # malformed route and not a raw internal error
    guidance_message: Optional[bool] = None

    @model_validator(mode="after")
    def _check(self) -> "RouteExpect":
        unknown = (set(self.settings) | set(self.settings_absent)) - _SETTINGS_FIELDS
        if unknown:
            raise ValueError(
                f"unknown settings field(s) {sorted(unknown)}; "
                f"valid: {sorted(_SETTINGS_FIELDS)}"
            )
        both = set(self.settings) & set(self.settings_absent)
        if both:
            raise ValueError(f"settings field(s) {sorted(both)} both required and absent")
        if self.departure_date is not None and self.departure_date_absent:
            raise ValueError("departure_date and departure_date_absent are mutually exclusive")
        return self


class RouteMock(_Base):
    """Canned model output for the no-API-key contract mode.

    Validated against the real app schemas at load time, so a mock that the
    production code could never produce is rejected as a broken fixture
    rather than quietly propping up a green run.
    """
    supervisor: Optional[dict[str, Any]] = None
    parser: Optional[dict[str, Any]] = None
    # Second-pass re-normalization. Only consulted when the first geocoding
    # pass leaves a failure; omitting it means "the retry should never fire",
    # and a case that unexpectedly reaches the retry node fails loudly.
    retry: Optional[dict[str, Any]] = None

    @model_validator(mode="after")
    def _validate_against_app_schema(self) -> "RouteMock":
        from app.schema import ParsedRoute, SupervisorDecision

        if self.supervisor is not None:
            SupervisorDecision.model_validate(self.supervisor)
        for payload in (self.parser, self.retry):
            if payload is not None:
                ParsedRoute.model_validate(payload)
        return self


class RouteCase(_Base):
    id: str = Field(min_length=1)
    kind: Optional[Literal["route"]] = None  # optional, redundant with the dataset
    tags: list[str] = Field(default_factory=list)
    input: RouteInput
    expect: RouteExpect
    mock: Optional[RouteMock] = None


# ── Car fixtures ───────────────────────────────────────────────────────────

class CarInput(_Base):
    description: str = Field(min_length=1, max_length=200)
    language: Literal["en", "uk"] = "en"


class CarExpect(_Base):
    unknown: bool
    fuel_type: Optional[FuelType] = None
    # Accepted band, not a magic number: real-world consumption legitimately
    # varies by trim, year and driving style.
    consumption_range: Optional[tuple[float, float]] = None
    make_model_contains_any: list[str] = Field(default_factory=list)

    _lower = field_validator("make_model_contains_any")(_all_lowercase)

    @model_validator(mode="after")
    def _check(self) -> "CarExpect":
        if self.unknown:
            if self.fuel_type or self.consumption_range or self.make_model_contains_any:
                raise ValueError(
                    "an `unknown: true` expectation cannot also assert vehicle details"
                )
            return self
        if self.fuel_type is None or self.consumption_range is None:
            raise ValueError(
                "a recognized-vehicle expectation needs both fuel_type and consumption_range"
            )
        low, high = self.consumption_range
        if low >= high:
            raise ValueError(f"consumption_range must be ascending, got {self.consumption_range}")
        # Mirrors the hard limits in _ESTIMATE_CAR_PROMPT
        if not (3.0 <= low and high <= 25.0):
            raise ValueError("consumption_range must lie within the prompt's 3.0-25.0 limits")
        if high - low < 1.0:
            raise ValueError(
                f"consumption_range {self.consumption_range} is narrower than 1.0 L/100km "
                "— brittle bands produce false regressions"
            )
        return self


class CarMock(_Base):
    estimate: dict[str, Any]

    @model_validator(mode="after")
    def _validate_against_app_schema(self) -> "CarMock":
        from app.schema import CarEstimate

        CarEstimate.model_validate(self.estimate)
        return self


class CarCase(_Base):
    id: str = Field(min_length=1)
    kind: Optional[Literal["car"]] = None
    tags: list[str] = Field(default_factory=list)
    input: CarInput
    expect: CarExpect
    mock: Optional[CarMock] = None


# ── Datasets ───────────────────────────────────────────────────────────────

class _Dataset(_Base):
    version: str = Field(min_length=1)
    description: str = ""

    @model_validator(mode="after")
    def _unique_ids(self):
        ids = [c.id for c in self.cases]
        dupes = sorted({i for i in ids if ids.count(i) > 1})
        if dupes:
            raise ValueError(f"duplicate case id(s): {dupes}")
        for case in self.cases:
            if case.kind is not None and case.kind != self.kind:
                raise ValueError(f"case {case.id!r} declares kind {case.kind!r} "
                                 f"in a {self.kind!r} dataset")
        return self


class RouteDataset(_Dataset):
    kind: Literal["route"]
    cases: list[RouteCase] = Field(min_length=1)


class CarDataset(_Dataset):
    kind: Literal["car"]
    cases: list[CarCase] = Field(min_length=1)
