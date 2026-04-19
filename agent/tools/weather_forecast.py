"""
Weather forecast tool — Open-Meteo API (free, no key required).

Fetches daily forecast for a given latitude/longitude over an optional date range.
Returns structured daily data: max/min temp, precipitation, WMO weather code.

On any failure path returns a structured dict with a `status` field so the LLM can
self-route rather than receiving an untyped exception.

CLAUDE.md §Non-negotiable #9: tools return structured dicts on failure, never raw exceptions.
CLAUDE.md §Forbidden: httpx only, never requests.
"""

import logging
from typing import Any

import httpx
from langchain_core.tools import tool
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

_OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
_TIMEOUT_SECONDS = 5.0


class WeatherForecastInput(BaseModel):
    latitude: float = Field(
        description="Latitude of the location in decimal degrees.",
        ge=-90.0,
        le=90.0,
    )
    longitude: float = Field(
        description="Longitude of the location in decimal degrees.",
        ge=-180.0,
        le=180.0,
    )
    start_date: str | None = Field(
        default=None,
        description="Start date in ISO 8601 format (YYYY-MM-DD). Defaults to today.",
    )
    end_date: str | None = Field(
        default=None,
        description="End date in ISO 8601 format (YYYY-MM-DD). Defaults to 7 days from start.",
    )


@tool(args_schema=WeatherForecastInput)
async def weather_forecast(
    latitude: float,
    longitude: float,
    start_date: str | None = None,
    end_date: str | None = None,
) -> dict[str, Any]:
    """
    Fetch a daily weather forecast for a given location using Open-Meteo (free, no API key).

    Returns daily temperature range, precipitation, and WMO weather codes for each day.
    On failure returns a dict with a 'status' key describing the problem.

    WMO weather codes: 0=clear, 1-3=partly cloudy, 45-48=fog, 51-67=rain,
    71-77=snow, 80-82=showers, 95-99=thunderstorm.
    """
    params: dict[str, Any] = {
        "latitude": latitude,
        "longitude": longitude,
        "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode",
        "timezone": "auto",
    }
    if start_date:
        params["start_date"] = start_date
    if end_date:
        params["end_date"] = end_date

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
            response = await client.get(_OPEN_METEO_URL, params=params)
    except httpx.TimeoutException:
        logger.warning(
            "Open-Meteo timeout for lat=%s lon=%s", latitude, longitude
        )
        return {
            "status": "timeout",
            "hint": f"Open-Meteo timed out after {_TIMEOUT_SECONDS}s. Try a different date range.",
        }
    except httpx.RequestError as exc:
        # Log class name only — str(exc) may include the request URL with query params.
        logger.warning("Open-Meteo network error: %s", type(exc).__name__)
        logger.debug("Open-Meteo network error detail: %s", exc)
        return {
            "status": "upstream_error",
            "hint": "Network error contacting Open-Meteo. The service may be temporarily unavailable.",
        }

    if response.status_code != 200:
        logger.warning(
            "Open-Meteo HTTP %d for lat=%s lon=%s: %s",
            response.status_code,
            latitude,
            longitude,
            response.text[:200],
        )
        return {
            "status": "upstream_error",
            "hint": f"Open-Meteo returned HTTP {response.status_code}. Check coordinates.",
        }

    data = response.json()
    daily = data.get("daily", {})

    # This is the "blackhole" case: Open-Meteo returned 200 but daily is empty.
    # Must return no_data cleanly — never crash the run.
    dates = daily.get("time", [])
    if not dates:
        logger.warning(
            "Open-Meteo returned empty daily for lat=%s lon=%s", latitude, longitude
        )
        return {
            "status": "no_data",
            "hint": (
                "Open-Meteo returned no daily forecast data for this location and date range. "
                "The location may be over the ocean or the date range may be out of the forecast window."
            ),
        }

    temp_max = daily.get("temperature_2m_max", [])
    temp_min = daily.get("temperature_2m_min", [])
    precip = daily.get("precipitation_sum", [])
    weather_codes = daily.get("weathercode", [])

    # Zip all arrays together; use None as default for missing values (array length mismatch safety).
    daily_entries: list[dict[str, Any]] = []
    for i, date in enumerate(dates):
        daily_entries.append({
            "date": date,
            "temp_max": temp_max[i] if i < len(temp_max) else None,
            "temp_min": temp_min[i] if i < len(temp_min) else None,
            "precip_mm": precip[i] if i < len(precip) else None,
            "weather_code": weather_codes[i] if i < len(weather_codes) else None,
        })

    return {
        "status": "ok",
        "daily": daily_entries,
    }
