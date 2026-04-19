"""
Time estimation tool — pure function, no HTTP calls, synchronous.

Calculates driving time from distance and average speed, with optional breaks.

CLAUDE.md §Non-negotiable #9: tools return structured dicts on failure, never raw exceptions.
"""

import logging
from typing import Any

from langchain_core.tools import tool
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

_MIN_SPEED_KMH = 5
_MAX_SPEED_KMH = 200
_DEFAULT_SPEED_KMH = 80


class EstimateTimeInput(BaseModel):
    distance_km: float = Field(
        description="Trip distance in kilometres. Must be a positive number.",
        gt=0,
    )
    avg_speed_kmh: float = Field(
        default=_DEFAULT_SPEED_KMH,
        description=(
            f"Average driving speed in km/h. "
            f"Default {_DEFAULT_SPEED_KMH}, range {_MIN_SPEED_KMH}–{_MAX_SPEED_KMH}."
        ),
        ge=_MIN_SPEED_KMH,
        le=_MAX_SPEED_KMH,
    )
    breaks_minutes: int = Field(
        default=0,
        description="Total planned break time in minutes (rest stops, meals, etc.). Must be non-negative.",
        ge=0,
    )


@tool(args_schema=EstimateTimeInput)
def estimate_time(
    distance_km: float,
    avg_speed_kmh: float = _DEFAULT_SPEED_KMH,
    breaks_minutes: int = 0,
) -> dict[str, Any]:
    """
    Estimate driving time for a trip given distance and average speed.

    Returns total time including optional breaks, formatted as HH:MM.
    On invalid inputs returns a dict with status='invalid_input'.
    """
    # Pydantic validation on the args_schema handles range checks, but guard defensively
    # in case the tool is called without the schema layer (e.g. direct invocation in tests).
    if avg_speed_kmh < _MIN_SPEED_KMH or avg_speed_kmh > _MAX_SPEED_KMH:
        logger.warning(
            "estimate_time: avg_speed_kmh=%s is out of range [%s, %s]",
            avg_speed_kmh,
            _MIN_SPEED_KMH,
            _MAX_SPEED_KMH,
        )
        return {
            "status": "invalid_input",
            "hint": (
                f"avg_speed_kmh must be between {_MIN_SPEED_KMH} and {_MAX_SPEED_KMH} km/h. "
                f"Got {avg_speed_kmh}."
            ),
        }

    if breaks_minutes < 0:
        logger.warning("estimate_time: breaks_minutes=%s is negative", breaks_minutes)
        return {
            "status": "invalid_input",
            "hint": f"breaks_minutes must be non-negative. Got {breaks_minutes}.",
        }

    if distance_km <= 0:
        return {
            "status": "invalid_input",
            "hint": f"distance_km must be positive. Got {distance_km}.",
        }

    driving_minutes = int(round((distance_km / avg_speed_kmh) * 60))
    total_minutes = driving_minutes + breaks_minutes

    hours, minutes = divmod(total_minutes, 60)
    hh_mm = f"{hours:02d}:{minutes:02d}"

    return {
        "status": "ok",
        "driving_minutes": driving_minutes,
        "breaks_minutes": breaks_minutes,
        "total_minutes": total_minutes,
        "hh_mm": hh_mm,
    }
