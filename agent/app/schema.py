from typing import TypedDict, Optional
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
    currency: Optional[str] = None


class ParsedRoute(BaseModel):
    # In-band off-topic classifier: the same structured-output call that
    # extracts locations decides whether the message is a route request at
    # all, so the guard costs zero extra LLM calls. None (model omitted it)
    # fails open — the empty-locations check still backstops.
    is_route_request: Optional[bool] = None
    locations: list[ParsedLocation]
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


# ── HTTP contract models (FastAPI I/O) ─────────────────────────────────────

class CurrentWaypoint(BaseModel):
    """A waypoint already on the user's map, sent as context so the agent
    can apply modification requests ("add a stop in X") to the existing
    route instead of failing for lack of a full trip description."""
    name: str = Field(min_length=1, max_length=200)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class ParseRouteRequest(BaseModel):
    # Length cap bounds per-request token cost; the Spring proxy enforces
    # the same limit, this one protects direct callers of the agent
    message: str = Field(min_length=1, max_length=500)
    language: str = "en"
    user_id: str = "anonymous"
    # Waypoint cap bounds the context-block token cost the same way the
    # message cap bounds the message
    current_route: Optional[list[CurrentWaypoint]] = Field(default=None, max_length=25)


class WaypointOut(BaseModel):
    positionOrder: int
    name: str
    latitude: float
    longitude: float


class RouteSettings(BaseModel):
    passengers: int = 1
    fuelConsumption: float = 6.0
    fuelCostPerLiter: float = 50.0
    currency: str = "UAH"


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


class ParseRouteResponse(BaseModel):
    success: bool
    route: Optional[RouteOut] = None
    message: Optional[str] = None
    stats: Optional[RouteStats] = None
    error: Optional[str] = None
    skippedLocations: Optional[list[dict]] = None


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
