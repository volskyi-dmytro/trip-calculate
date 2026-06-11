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
6. For EVERY location, set original_name to its exact spelling as written in the user's
   message (keep the original language and script, e.g. "Соловичі")
7. Provide lat/lon ONLY for world-famous landmarks and major cities you are CERTAIN about.
   For villages, small towns, and any place you are not certain of, ALWAYS leave lat/lon null —
   a wrong guess silently corrupts the route
8. location_type: first location = "origin", last = "destination", middle = "waypoint"
9. "picking my friend" / "з другом" → set passengers to 2"""

_RETRY_SYSTEM_PROMPT = """Some locations failed to geocode. Rewrite ONLY these failed locations
with alternative normalizations that are more likely to be found by OpenStreetMap Nominatim.

OUTPUT: a JSON object matching the ParsedRoute schema — locations array (same order and
location_type as given) and settings (may be empty). No markdown, JSON only.

STRATEGIES (try a different one than before):
1. Use a different transliteration variant ("Kiev" vs "Kyiv")
2. Replace a POI you cannot pinpoint with its host city ("Café X Lviv" → "Lviv Ukraine")
3. Add or change the country suffix
4. Strip street numbers and qualifiers
5. Set original_name to the location's exact spelling from the original request
   (native script, e.g. "Соловичі") — OSM often matches native names directly
6. Provide lat/lon ONLY if you are CERTAIN (world-famous landmark or major city);
   never guess coordinates for villages or obscure places"""

# Bounded self-correction: one LLM re-normalization pass for failed geocodes
MAX_GEOCODE_RETRIES = 1

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
    # First pass never trusts LLM coordinates: a hallucinated lat/lon would
    # mask the geocoding failure and bypass the retry loop entirely
    tasks = [
        geocode_location(loc, user_agent, allow_ai_coords=False)
        for loc in state["parsed"].locations
    ]
    results: list[GeocodedLocation] = list(await asyncio.gather(*tasks))
    return {**state, "geocoded": results}


def route_after_geocode(state: GraphState) -> str:
    """Conditional edge router: returns the name of the next node.

    Routes to the retry node while failed locations remain and the retry
    budget is not exhausted; otherwise decides success vs error.
    """
    if state.get("error"):
        return "format_error"
    geocoded = state.get("geocoded", [])
    failed = [loc for loc in geocoded if loc.source == "failed"]
    if failed and state.get("retry_count", 0) < MAX_GEOCODE_RETRIES:
        return "retry_failed"
    return "format_response" if len(geocoded) - len(failed) >= 2 else "format_error"


async def retry_failed_locations(state: GraphState) -> GraphState:
    """Self-correction pass: ask the LLM to re-normalize the locations that
    failed to geocode, then geocode only those again and merge the results.
    Always increments retry_count so the graph loop is bounded."""
    geocoded = state.get("geocoded", [])
    failed_idx = [i for i, loc in enumerate(geocoded) if loc.source == "failed"]
    next_count = state.get("retry_count", 0) + 1
    if not failed_idx:
        return {**state, "retry_count": next_count}

    failed_names = [geocoded[i].name for i in failed_idx]
    try:
        response = await _openai_client.beta.chat.completions.parse(
            model="gpt-4o-mini",
            temperature=0.4,
            messages=[
                {"role": "system", "content": _RETRY_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": (
                        f"Original request: {state['message']}\n"
                        f"Failed locations (in order): {', '.join(failed_names)}"
                    ),
                },
            ],
            response_format=ParsedRoute,
        )
        result = response.choices[0].message.parsed
        if result is None or not result.locations:
            raise ValueError("Retry parsing returned no locations")
    except Exception:
        # Retry is best-effort: keep the original failures and let the router decide
        return {**state, "retry_count": next_count}

    user_agent = os.getenv("NOMINATIM_USER_AGENT", "tripcalculate-agent/1.0")
    retry_locs = result.locations[: len(failed_idx)]
    # Only the retry pass may fall back to LLM-provided coordinates —
    # by now Nominatim has rejected both normalized and original names twice
    tasks = [
        geocode_location(loc, user_agent, allow_ai_coords=True)
        for loc in retry_locs
    ]
    retried: list[GeocodedLocation] = list(await asyncio.gather(*tasks))

    merged = list(geocoded)
    for idx, new_loc in zip(failed_idx, retried):
        if new_loc.source != "failed":
            # Keep the original slot's location_type; the LLM may have mangled it
            merged[idx] = new_loc.model_copy(
                update={"location_type": geocoded[idx].location_type, "recovered": True}
            )
    return {**state, "geocoded": merged, "retry_count": next_count}


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
    recovered_count = sum(1 for l in successful if l.recovered)

    msg = f"Route created with {len(waypoints_out)} waypoint(s)"
    if ai_count > 0:
        msg += f" ({ai_count} from AI, {nominatim_count} from geocoding)"
    if recovered_count > 0:
        msg += f". Recovered {recovered_count} location(s) after retry"
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
            recovered=recovered_count,
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
