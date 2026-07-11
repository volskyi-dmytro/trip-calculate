"""Corridor weather for a route — deterministic, zero LLM tokens.

Sampling model: each waypoint plus points interpolated every ~100 km along
the straight line between consecutive waypoints (the fuel tool's geometry
model), hard-capped at 20 samples. Forecast: Open-Meteo daily variables for
the departure date (keyless, free). Advisory contract: any failure returns
None — never an error the user sees.
"""
import logging
from datetime import date as date_cls, datetime, timedelta, timezone
from typing import Optional

import httpx

from ..schema import RiskFlag, WeatherData, WeatherSample
from .fuel import haversine_km

logger = logging.getLogger(__name__)

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
FORECAST_WINDOW_DAYS = 16
STEP_KM = 100.0
SAMPLE_CAP = 20
FETCH_TIMEOUT_S = 5.0

# Risk-flag thresholds (spec-fixed)
HEAVY_RAIN_MM = 15.0
STRONG_WIND_KMH = 60.0
_STORM_CODES = range(95, 100)  # WMO thunderstorm codes

_DAILY_VARS = ",".join([
    "temperature_2m_max", "temperature_2m_min", "precipitation_sum",
    "snowfall_sum", "wind_gusts_10m_max", "weather_code",
])

Point = tuple[float, float, Optional[str]]  # (lat, lon, label|None)


def sample_corridor(points: list[Point], step_km: float = STEP_KM,
                    cap: int = SAMPLE_CAP) -> list[Point]:
    """Waypoints (labeled) plus unlabeled points interpolated along the
    straight legs between them. Cap enforcement drops interpolated points
    (evenly) first; waypoints are only truncated when they alone exceed
    the cap."""
    if not points:
        return []
    if len(points) >= cap:
        return points[:cap]

    samples: list[Point] = []
    for (lat1, lon1, label1), (lat2, lon2, _) in zip(points, points[1:]):
        samples.append((lat1, lon1, label1))
        n_extra = int(haversine_km(lat1, lon1, lat2, lon2) // step_km)
        for i in range(1, n_extra + 1):
            f = i / (n_extra + 1)
            samples.append((lat1 + (lat2 - lat1) * f,
                            lon1 + (lon2 - lon1) * f, None))
    samples.append(points[-1])

    if len(samples) <= cap:
        return samples
    # Keep all waypoints; retain an even spread of interpolated points
    budget = cap - len(points)
    interp_idx = [i for i, s in enumerate(samples) if s[2] is None]
    kept: set[int] = set()
    if budget > 0:
        stride = len(interp_idx) / budget
        kept = {interp_idx[int(k * stride)] for k in range(budget)}
    return [s for i, s in enumerate(samples) if s[2] is not None or i in kept]


async def fetch_forecast(samples: list[Point], day: date_cls) -> list[dict]:
    """One batched Open-Meteo call; returns one forecast row per sample in
    order. Raises on transport errors or shape mismatch — the caller's
    advisory try/except turns that into weather_data=None."""
    params = {
        "latitude": ",".join(f"{lat:.4f}" for lat, _, _ in samples),
        "longitude": ",".join(f"{lon:.4f}" for _, lon, _ in samples),
        "daily": _DAILY_VARS,
        "start_date": day.isoformat(),
        "end_date": day.isoformat(),
        "timezone": "UTC",
    }
    async with httpx.AsyncClient() as client:
        resp = await client.get(OPEN_METEO_URL, params=params,
                                timeout=FETCH_TIMEOUT_S)
        resp.raise_for_status()
        payload = resp.json()
    # Open-Meteo returns a bare object for one location, an array for many
    rows = payload if isinstance(payload, list) else [payload]
    if len(rows) != len(samples):
        raise ValueError(
            f"expected {len(samples)} forecast rows, got {len(rows)}")
    return rows


def _nearest_label(samples: list[WeatherSample], idx: int) -> Optional[str]:
    """Nearest labeled stop by sample index — samples are roughly evenly
    spaced along the corridor, so index distance approximates km distance."""
    if samples[idx].label:
        return samples[idx].label
    for offset in range(1, len(samples)):
        for j in (idx - offset, idx + offset):
            if 0 <= j < len(samples) and samples[j].label:
                return samples[j].label
    return None


def derive_risk_flags(samples: list[WeatherSample]) -> list[RiskFlag]:
    """One flag per type across the corridor, keeping the worst instance
    (highest severity metric); `near` names the nearest labeled stop."""
    worst: dict[str, tuple[float, Optional[str]]] = {}

    def consider(flag_type: str, severity: float, near: Optional[str]) -> None:
        current = worst.get(flag_type)
        if current is None or severity > current[0]:
            worst[flag_type] = (severity, near)

    for i, s in enumerate(samples):
        near = _nearest_label(samples, i)
        if s.snowfall_cm > 0:
            consider("snow", s.snowfall_cm, near)
        if s.precipitation_mm >= HEAVY_RAIN_MM:
            consider("heavy_rain", s.precipitation_mm, near)
        if s.wind_gust_kmh >= STRONG_WIND_KMH:
            consider("strong_wind", s.wind_gust_kmh, near)
        if s.temp_min_c <= 0 and s.precipitation_mm > 0:
            consider("ice_risk", -s.temp_min_c, near)
        if s.weather_code in _STORM_CODES:
            consider("storm", float(s.weather_code), near)
    return [RiskFlag(type=t, near=near)
            for t, (_, near) in sorted(worst.items())]


async def compute_weather_data(points: list[Point],
                               day: date_cls) -> Optional[WeatherData]:
    """Single entry point for both the graph node and the corridor endpoint."""
    try:
        today = datetime.now(timezone.utc).date()
        if not points or not (today <= day <= today + timedelta(days=FORECAST_WINDOW_DAYS)):
            return None
        corridor = sample_corridor(points)
        rows = await fetch_forecast(corridor, day)

        samples: list[WeatherSample] = []
        for (lat, lon, label), row in zip(corridor, rows):
            daily = row["daily"]
            values = [daily[k][0] for k in (
                "temperature_2m_max", "temperature_2m_min",
                "precipitation_sum", "snowfall_sum",
                "wind_gusts_10m_max", "weather_code")]
            if any(v is None for v in values):
                continue  # one gap shouldn't nuke the whole corridor
            t_max, t_min, precip, snow, gust, code = values
            samples.append(WeatherSample(
                lat=round(lat, 4), lon=round(lon, 4), label=label,
                temp_max_c=t_max, temp_min_c=t_min, precipitation_mm=precip,
                snowfall_cm=snow, wind_gust_kmh=gust, weather_code=int(code)))
        if not samples:
            return None
        return WeatherData(
            date=day.isoformat(),
            samples=samples,
            risk_flags=derive_risk_flags(samples),
            source="open-meteo",
            fetched_at=datetime.now(timezone.utc),
        )
    except Exception:
        logger.info("weather corridor unavailable", exc_info=True)
        return None
