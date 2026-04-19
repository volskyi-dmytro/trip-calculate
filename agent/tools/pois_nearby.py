"""
Points-of-interest tool — OpenTripMap API (free tier, OTM_KEY required).

Returns nearby POIs within a radius for a given lat/lon.
Structured failure dicts on every error path.

CLAUDE.md §Non-negotiable #9: tools return structured dicts on failure, never raw exceptions.
CLAUDE.md §Forbidden: httpx only, never requests.
"""

import logging
import os
from typing import Any

import httpx
from langchain_core.tools import tool
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

_OTM_BASE = "https://api.opentripmap.com/0.1/en/places/radius"
_TIMEOUT_SECONDS = 5.0
_DEFAULT_RADIUS = 5000
_MAX_RADIUS = 50000
_DEFAULT_LIMIT = 10
_MAX_LIMIT = 30

_OTM_KEY = os.environ.get("OTM_KEY", "")


class PoisNearbyInput(BaseModel):
    latitude: float = Field(
        description="Latitude of the center point in decimal degrees.",
        ge=-90.0,
        le=90.0,
    )
    longitude: float = Field(
        description="Longitude of the center point in decimal degrees.",
        ge=-180.0,
        le=180.0,
    )
    radius_meters: int = Field(
        default=_DEFAULT_RADIUS,
        description=f"Search radius in metres. Default {_DEFAULT_RADIUS}, max {_MAX_RADIUS}.",
        ge=1,
        le=_MAX_RADIUS,
    )
    kinds: str | None = Field(
        default=None,
        description=(
            "Comma-separated OpenTripMap kinds filter "
            "(e.g. 'interesting_places,foods'). "
            "Omit to search all categories."
        ),
    )
    limit: int = Field(
        default=_DEFAULT_LIMIT,
        description=f"Maximum number of POIs to return. Default {_DEFAULT_LIMIT}, max {_MAX_LIMIT}.",
        ge=1,
        le=_MAX_LIMIT,
    )


@tool(args_schema=PoisNearbyInput)
async def pois_nearby(
    latitude: float,
    longitude: float,
    radius_meters: int = _DEFAULT_RADIUS,
    kinds: str | None = None,
    limit: int = _DEFAULT_LIMIT,
) -> dict[str, Any]:
    """
    Find points of interest near a location using OpenTripMap.

    Returns a list of nearby places with name, kind, unique xid, distance, and coordinates.
    On failure returns a dict with a 'status' key describing the problem.
    """
    if not _OTM_KEY:
        logger.error("OTM_KEY is not set")
        return {
            "status": "upstream_error",
            "hint": "OpenTripMap API key (OTM_KEY) is not configured. Cannot fetch POIs.",
        }

    params: dict[str, Any] = {
        "apikey": _OTM_KEY,
        "radius": radius_meters,
        "lon": longitude,
        "lat": latitude,
        "limit": limit,
        "format": "json",
    }
    if kinds:
        params["kinds"] = kinds

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
            response = await client.get(_OTM_BASE, params=params)
    except httpx.TimeoutException:
        logger.warning(
            "OpenTripMap timeout for lat=%s lon=%s radius=%s",
            latitude,
            longitude,
            radius_meters,
        )
        return {
            "status": "timeout",
            "hint": f"OpenTripMap timed out after {_TIMEOUT_SECONDS}s. Try a smaller radius or different location.",
        }
    except httpx.RequestError as exc:
        # Log class name only — str(exc) may include the request URL with apikey in query params.
        logger.warning("OpenTripMap network error: %s", type(exc).__name__)
        logger.debug("OpenTripMap network error detail: %s", exc)
        return {
            "status": "upstream_error",
            "hint": "Network error contacting OpenTripMap. The service may be temporarily unavailable.",
        }

    if response.status_code == 403:
        logger.error("OpenTripMap returned 403 — API key invalid or quota exceeded")
        return {
            "status": "upstream_error",
            "hint": "OpenTripMap API key is invalid or quota exceeded (HTTP 403).",
        }

    if response.status_code != 200:
        logger.warning(
            "OpenTripMap HTTP %d for lat=%s lon=%s: %s",
            response.status_code,
            latitude,
            longitude,
            response.text[:200],
        )
        return {
            "status": "upstream_error",
            "hint": f"OpenTripMap returned HTTP {response.status_code}.",
        }

    features = response.json()

    # Empty list is a valid API response meaning no POIs found.
    if not features:
        return {
            "status": "no_results",
            "hint": (
                f"No points of interest found within {radius_meters}m of "
                f"lat={latitude}, lon={longitude}. "
                "Try a larger radius or different kinds filter."
            ),
        }

    pois: list[dict[str, Any]] = []
    for feature in features:
        # OpenTripMap format (json): each item has name, kinds, xid, dist, point.lon/lat
        point = feature.get("point", {})
        pois.append({
            "name": feature.get("name") or "(unnamed)",
            "kind": feature.get("kinds", ""),
            "xid": feature.get("xid", ""),
            "distance_m": feature.get("dist", 0),
            "lon": point.get("lon"),
            "lat": point.get("lat"),
        })

    return {
        "status": "ok",
        "pois": pois,
    }
