"""
Route tool — public OSRM server (router.project-osrm.org).

Returns road-based distance (metres), duration (seconds), and the encoded
polyline geometry for the route. On any failure returns a structured dict
with a `status` field.

OSRM API docs: http://project-osrm.org/docs/v5.24.0/api/
Public demo server: https://router.project-osrm.org

CLAUDE.md §Non-negotiable #9: structured dict on failure, never raw exception.
CLAUDE.md §Forbidden: httpx only, never requests.
"""

import logging
from typing import Any

import httpx
from langchain_core.tools import tool
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

_OSRM_BASE = "https://router.project-osrm.org/route/v1/driving"
_TIMEOUT_SECONDS = 5.0


class RouteOsrmInput(BaseModel):
    origin_lon: float = Field(description="Origin longitude in decimal degrees.")
    origin_lat: float = Field(description="Origin latitude in decimal degrees.")
    dest_lon: float = Field(description="Destination longitude in decimal degrees.")
    dest_lat: float = Field(description="Destination latitude in decimal degrees.")


@tool(args_schema=RouteOsrmInput)
async def route_osrm(
    origin_lon: float,
    origin_lat: float,
    dest_lon: float,
    dest_lat: float,
) -> dict[str, Any]:
    """
    Calculate a driving route between two coordinates using the public OSRM server.

    Returns distance (metres), duration (seconds), and encoded polyline geometry.
    On failure returns a dict with a 'status' key describing the problem.
    """
    # OSRM coordinate format: {lon},{lat};{lon},{lat}
    coordinates = f"{origin_lon},{origin_lat};{dest_lon},{dest_lat}"
    url = f"{_OSRM_BASE}/{coordinates}"

    params = {
        "overview": "full",
        "geometries": "polyline",
        "steps": "false",
    }

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
            response = await client.get(url, params=params)
    except httpx.TimeoutException:
        logger.warning(
            "OSRM timeout for route (%s,%s) → (%s,%s)",
            origin_lon, origin_lat, dest_lon, dest_lat,
        )
        return {
            "status": "timeout",
            "hint": f"OSRM routing timed out after {_TIMEOUT_SECONDS}s. Try again or use fewer waypoints.",
        }
    except httpx.RequestError as exc:
        logger.warning("OSRM network error: %s", exc)
        return {
            "status": "upstream_error",
            "hint": f"Network error contacting OSRM: {exc}",
        }

    if response.status_code != 200:
        logger.warning("OSRM HTTP %d: %s", response.status_code, response.text[:200])
        return {
            "status": "upstream_error",
            "hint": f"OSRM returned HTTP {response.status_code}.",
        }

    data = response.json()

    # OSRM returns code "Ok" on success; anything else is a routing failure.
    if data.get("code") != "Ok":
        osrm_code = data.get("code", "Unknown")
        message = data.get("message", "No route found")
        logger.warning("OSRM routing failed: code=%s message=%s", osrm_code, message)
        return {
            "status": "no_results",
            "hint": f"OSRM could not find a route: {message} (code: {osrm_code}). "
                    "The coordinates may be in the ocean or an unreachable area.",
        }

    routes = data.get("routes", [])
    if not routes:
        return {
            "status": "no_results",
            "hint": "OSRM returned no routes for the given coordinates.",
        }

    best = routes[0]
    leg = best.get("legs", [{}])[0] if best.get("legs") else {}

    return {
        "status": "ok",
        "distance_metres": best.get("distance", 0.0),
        "duration_seconds": best.get("duration", 0.0),
        "geometry_polyline": best.get("geometry", ""),
        # Summary from the first leg (may be empty on OSRM demo server)
        "summary": leg.get("summary", ""),
    }
