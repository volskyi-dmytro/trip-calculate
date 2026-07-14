from typing import TypedDict, Optional, Literal
from datetime import datetime
from pydantic import BaseModel, Field


# ── Internal graph models ──────────────────────────────────────────────────

class ParsedLocation(BaseModel):
    name: str
    location_type: str  # "origin" | "waypoint" | "destination"
    # Exact spelling from the user's message (original language/script) —
    # OSM often matches native names where transliterations miss
    original_name: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    # True when the LLM copied this location from the CURRENT ROUTE context
    # block. Those coordinates came from the user's map (already geocoded),
    # so geocoding trusts them instead of re-querying Nominatim.
    from_current_route: Optional[bool] = None


class TripSettings(BaseModel):
    passengers: Optional[int] = None
    fuelConsumption: Optional[float] = None
    fuelCostPerLiter: Optional[float] = None
    fuelType: Optional[Literal["petrol", "diesel", "lpg"]] = None
    currency: Optional[Literal["UAH", "USD", "EUR"]] = None


class ParsedRoute(BaseModel):
    # In-band off-topic classifier: the same structured-output call that
    # extracts locations decides whether the message is a route request at
    # all, so the guard costs zero extra LLM calls. None (model omitted it)
    # fails open — the empty-locations check still backstops.
    is_route_request: Optional[bool] = None
    locations: list[ParsedLocation]
    settings: TripSettings
    # ISO YYYY-MM-DD departure date the user mentioned, resolved against
    # today by the parser prompt. None = not mentioned = leave picker alone.
    departure_date: Optional[str] = None


class SupervisorDecision(BaseModel):
    """Structured output of the supervisor node: which specialist path the
    request takes. settings is only trusted for settings_only intents."""
    intent: Literal["create", "modify", "settings_only", "off_topic"]
    settings: TripSettings


class GeocodedLocation(BaseModel):
    name: str
    clean_name: str
    location_type: str  # "origin" | "waypoint" | "destination"
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    source: str  # "nominatim" | "ai_provided" | "failed"
    error: bool = False
    message: Optional[str] = None
    recovered: bool = False  # geocoded successfully only after an LLM retry pass
    country_code: Optional[str] = None


# ── HTTP contract models (FastAPI I/O) ─────────────────────────────────────

class CurrentWaypoint(BaseModel):
    """A waypoint already on the user's map, sent as context so the agent
    can apply modification requests ("add a stop in X") to the existing
    route instead of failing for lack of a full trip description."""
    name: str = Field(min_length=1, max_length=200)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class SettingsContext(BaseModel):
    """The user's active fuel type and display currency — needed so the fuel
    agent prices the right fuel in the right currency. Defaults keep old
    clients (and the Spring proxy before its update) working."""
    fuel_type: Literal["petrol", "diesel", "lpg"] = "petrol"
    currency: Literal["UAH", "USD", "EUR"] = "UAH"


class ParseRouteRequest(BaseModel):
    # Length cap bounds per-request token cost; the Spring proxy enforces
    # the same limit, this one protects direct callers of the agent
    message: str = Field(min_length=1, max_length=500)
    language: str = "en"
    user_id: str = "anonymous"
    # Waypoint cap bounds the context-block token cost the same way the
    # message cap bounds the message
    current_route: Optional[list[CurrentWaypoint]] = Field(default=None, max_length=25)
    settings_context: Optional[SettingsContext] = None


class WaypointOut(BaseModel):
    positionOrder: int
    name: str
    latitude: float
    longitude: float
    countryCode: Optional[str] = None


class RouteSettings(BaseModel):
    # None means "the user did not mention it" — the frontend keeps the
    # user's current value. Filling defaults here silently reset the
    # user's passenger count and fuel settings on every AI request.
    passengers: Optional[int] = None
    fuelConsumption: Optional[float] = None
    fuelCostPerLiter: Optional[float] = None
    fuelType: Optional[Literal["petrol", "diesel", "lpg"]] = None
    currency: Optional[Literal["UAH", "USD", "EUR"]] = None
    departureDate: Optional[str] = None


class RouteOut(BaseModel):
    waypoints: list[WaypointOut]
    settings: RouteSettings


class RouteStats(BaseModel):
    totalRequested: int
    successful: int
    skipped: int
    aiProvided: int
    nominatimProvided: int
    recovered: int = 0  # locations rescued by the retry loop


class CountryFuelPrice(BaseModel):
    code: str
    price: float
    weight: float


class FuelData(BaseModel):
    """Advisory country-average fuel price for the route. Omitted (None)
    whenever it cannot be computed — never an error the user sees."""
    price_per_liter: float
    currency: str
    fuel_type: str
    countries: list[CountryFuelPrice]
    source: str
    fetched_at: datetime
    stale: bool = False


class WeatherSample(BaseModel):
    """Daily forecast at one corridor point. label is the stop name for
    waypoint samples and None for interpolated corridor points."""
    lat: float
    lon: float
    label: Optional[str] = None
    temp_max_c: float
    temp_min_c: float
    precipitation_mm: float
    snowfall_cm: float
    wind_gust_kmh: float
    weather_code: int


class RiskFlag(BaseModel):
    type: Literal["snow", "heavy_rain", "strong_wind", "ice_risk", "storm"]
    # Nearest labeled stop, for display ("strong wind near Rivne")
    near: Optional[str] = None


class WeatherData(BaseModel):
    """Advisory corridor forecast for the departure date. Omitted (None)
    whenever it cannot be computed — never an error the user sees."""
    date: str  # ISO YYYY-MM-DD the forecast is for
    samples: list[WeatherSample]
    risk_flags: list[RiskFlag]
    source: str
    fetched_at: datetime


class ParseRouteResponse(BaseModel):
    success: bool
    route: Optional[RouteOut] = None
    message: Optional[str] = None
    stats: Optional[RouteStats] = None
    error: Optional[str] = None
    skippedLocations: Optional[list[dict]] = None
    fuel_data: Optional[FuelData] = None
    weather_data: Optional[WeatherData] = None


class WeatherCorridorRequest(BaseModel):
    """Manual-flow corridor forecast request (proxied by Spring). Same
    waypoint cap as ParseRouteRequest.current_route."""
    waypoints: list[CurrentWaypoint] = Field(min_length=1, max_length=25)
    date: str  # ISO YYYY-MM-DD; format validated in the endpoint


class WeatherCorridorResponse(BaseModel):
    weather_data: Optional[WeatherData] = None


# ── LangGraph state ────────────────────────────────────────────────────────

class GraphState(TypedDict):
    message: str
    language: str
    user_id: str
    current_route: Optional[list[CurrentWaypoint]]
    parsed: Optional[ParsedRoute]
    geocoded: list[GeocodedLocation]
    response: Optional[ParseRouteResponse]
    error: Optional[str]
    retry_count: int
    settings_context: Optional[SettingsContext]
    fuel_data: Optional[FuelData]
    weather_data: Optional[WeatherData]
    intent: Optional[str]
