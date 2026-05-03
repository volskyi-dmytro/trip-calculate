import asyncio
import os
from langfuse.openai import AsyncOpenAI
from .schema import (
    GraphState, ParsedRoute, GeocodedLocation,
    ParseRouteResponse, RouteOut, WaypointOut, RouteSettings, RouteStats,
)
from .geocoding import geocode_location

_SYSTEM_PROMPT = """You normalize location names for geocoding AND provide coordinates when possible.

OUTPUT: a JSON object matching the ParsedRoute schema — locations array and settings.
No markdown, no explanation, JSON only.

RULES:
1. Ukrainian declensions → nominative case: "Високого Замку" → "Високий Замок", "у Львові" → "Lviv"
2. Transliterate and append country: "Київ" → "Kyiv Ukraine", "Львів" → "Lviv Ukraine"
3. Remove filler words ("той", generic "ресторан"), keep proper names ("McDonald's")
4. "біля/near X" → output X itself, not the modifier
5. Format: [Proper Name] [City] [Country]
6. If you are CONFIDENT you know exact coordinates (famous landmark, capital city), provide lat/lon
7. If uncertain, leave lat/lon as null
8. location_type: first location = "origin", last = "destination", middle = "waypoint"
9. "picking my friend" / "з другом" → set passengers to 2"""

# Module-level singleton — patched by unit tests via @patch("app.nodes._openai_client")
_openai_client = AsyncOpenAI()


async def parse_locations(state: GraphState) -> GraphState:
    try:
        response = await _openai_client.beta.chat.completions.parse(
            model="gpt-4o-mini",
            temperature=0.2,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": state["message"]},
            ],
            response_format=ParsedRoute,
        )
        result = response.choices[0].message.parsed
        if result is None:
            raise ValueError("Structured output parsing returned None")
        return {**state, "parsed": result}
    except Exception as exc:
        return {**state, "error": f"Failed to parse route request: {exc}"}


async def geocode_locations(state: GraphState) -> GraphState:
    if state.get("error") or not state.get("parsed"):
        return state

    user_agent = os.getenv("NOMINATIM_USER_AGENT", "tripcalculate-agent/1.0")
    tasks = [geocode_location(loc, user_agent) for loc in state["parsed"].locations]
    results: list[GeocodedLocation] = list(await asyncio.gather(*tasks))
    return {**state, "geocoded": results}


def check_viable(state: GraphState) -> str:
    """Conditional edge router: returns the name of the next node."""
    if state.get("error"):
        return "format_error"
    successful = [loc for loc in state.get("geocoded", []) if loc.source != "failed"]
    return "format_response" if len(successful) >= 2 else "format_error"


def format_response(state: GraphState) -> GraphState:
    geocoded = state["geocoded"]
    successful = [loc for loc in geocoded if loc.source != "failed"]
    failed = [loc for loc in geocoded if loc.source == "failed"]

    origin = next((l for l in successful if l.location_type == "origin"), None)
    waypoints = [l for l in successful if l.location_type == "waypoint"]
    destination = next((l for l in successful if l.location_type == "destination"), None)
    ordered = [l for l in [origin, *waypoints, destination] if l is not None]

    waypoints_out = [
        WaypointOut(
            positionOrder=i,
            name=loc.clean_name,
            latitude=loc.latitude,
            longitude=loc.longitude,
        )
        for i, loc in enumerate(ordered)
    ]

    settings = state["parsed"].settings
    ai_count = sum(1 for l in successful if l.source == "ai_provided")
    nominatim_count = sum(1 for l in successful if l.source == "nominatim")

    msg = f"Route created with {len(waypoints_out)} waypoint(s)"
    if ai_count > 0:
        msg += f" ({ai_count} from AI, {nominatim_count} from geocoding)"
    if failed:
        msg += f". Skipped {len(failed)} unverified location(s)"

    response = ParseRouteResponse(
        success=True,
        route=RouteOut(
            waypoints=waypoints_out,
            settings=RouteSettings(
                passengers=settings.passengers or 1,
                fuelConsumption=settings.fuelConsumption or 6.0,
                fuelCostPerLiter=settings.fuelCostPerLiter or 50.0,
                currency=settings.currency or "UAH",
            ),
        ),
        message=msg,
        stats=RouteStats(
            totalRequested=len(geocoded),
            successful=len(successful),
            skipped=len(failed),
            aiProvided=ai_count,
            nominatimProvided=nominatim_count,
        ),
        skippedLocations=[{"name": l.name, "reason": l.message} for l in failed] or None,
    )
    return {**state, "response": response}


def format_error(state: GraphState) -> GraphState:
    msg = state.get("error")
    if not msg:
        n = sum(1 for l in state.get("geocoded", []) if l.source != "failed")
        msg = f"Need at least 2 valid locations, found {n}"

    return {**state, "response": ParseRouteResponse(success=False, error=msg)}
