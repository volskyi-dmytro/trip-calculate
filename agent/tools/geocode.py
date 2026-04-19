"""
Geocode tool — Mapbox Geocoding API v5.

Returns the first matching location as {longitude, latitude, place_name, relevance}.
On any failure path returns a structured dict with a `status` field so the LLM can
self-route rather than receiving an untyped exception.

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

_MAPBOX_TOKEN = os.environ.get("MAPBOX_TOKEN", "")
_GEOCODING_URL = "https://api.mapbox.com/geocoding/v5/mapbox.places/{query}.json"
_TIMEOUT_SECONDS = 5.0


class GeocodeInput(BaseModel):
    query: str = Field(
        description="Place name, address, or landmark to geocode.",
        min_length=1,
        max_length=256,
    )
    country: str | None = Field(
        default=None,
        description="ISO 3166-1 alpha-2 country code to restrict results (e.g. 'UA', 'DE').",
    )


@tool(args_schema=GeocodeInput)
async def geocode(query: str, country: str | None = None) -> dict[str, Any]:
    """
    Convert a place name or address into geographic coordinates using Mapbox Geocoding v5.

    Returns the best matching result with longitude, latitude, place_name, and relevance score.
    On failure returns a dict with a 'status' key describing the problem.
    """
    if not _MAPBOX_TOKEN:
        logger.error("MAPBOX_TOKEN is not set")
        return {
            "status": "upstream_error",
            "hint": "Mapbox token is not configured. Cannot geocode.",
        }

    params: dict[str, Any] = {
        "access_token": _MAPBOX_TOKEN,
        "limit": 1,
        "types": "place,address,poi,region,country",
    }
    if country:
        params["country"] = country.lower()

    url = _GEOCODING_URL.format(query=query)

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
            response = await client.get(url, params=params)
    except httpx.TimeoutException:
        logger.warning("Geocode timeout for query=%r", query)
        return {
            "status": "timeout",
            "hint": f"Mapbox geocoding timed out after {_TIMEOUT_SECONDS}s. Try a simpler query.",
        }
    except httpx.RequestError as exc:
        # Log class name only — str(exc) may include the request URL with access_token in
        # query params (Mapbox Geocoding v5 appends access_token to every request URL).
        logger.warning("Geocode network error for query=%r: %s", query, type(exc).__name__)
        logger.debug("Geocode network error detail for query=%r: %s", query, exc)
        return {
            "status": "upstream_error",
            "hint": "Network error contacting Mapbox. The service may be temporarily unavailable.",
        }

    if response.status_code != 200:
        logger.warning(
            "Geocode HTTP %d for query=%r: %s",
            response.status_code,
            query,
            response.text[:200],
        )
        return {
            "status": "upstream_error",
            "hint": f"Mapbox returned HTTP {response.status_code}. Check the query or token.",
        }

    data = response.json()
    features = data.get("features", [])

    if not features:
        return {
            "status": "no_results",
            "hint": f"No geocoding results found for {query!r}. Try a more specific query.",
        }

    best = features[0]
    longitude, latitude = best["geometry"]["coordinates"]

    return {
        "status": "ok",
        "longitude": longitude,
        "latitude": latitude,
        "place_name": best.get("place_name", query),
        "relevance": best.get("relevance", 0.0),
    }
