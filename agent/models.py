"""
Pydantic v2 models for the outer graph's structured output.

FinalItinerary is the structured result produced by the `finalize` node
via model.with_structured_output(FinalItinerary).

It is also stashed on the outer graph state as `final_itinerary`.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class Leg(BaseModel):
    """A single journey leg between two places."""

    from_place: str = Field(description="Origin place name.")
    to_place: str = Field(description="Destination place name.")
    distance_km: float = Field(
        description="Estimated distance in kilometres.", ge=0
    )
    duration_minutes: int = Field(
        description="Estimated driving time in minutes (excluding breaks).", ge=0
    )
    mode: str = Field(
        description="Transport mode (e.g. 'driving', 'train', 'bus', 'walking')."
    )


class FinalItinerary(BaseModel):
    """
    Structured trip itinerary produced by the finalize node.

    The critic node validates this model for correctness before the graph ends.
    """

    summary: str = Field(
        description=(
            "A human-readable summary of the trip plan, including the destination "
            "and key highlights."
        )
    )
    legs: list[Leg] = Field(
        description="Ordered list of journey legs (origin → waypoints → destination).",
        min_length=0,  # Critic will flag empty legs list
    )
    weather_notes: list[str] | None = Field(
        default=None,
        description="Optional weather observations per leg or destination.",
    )
    pois: list[str] | None = Field(
        default=None,
        description="Optional list of notable points of interest along the route.",
    )
    total_distance_km: float | None = Field(
        default=None,
        description="Total trip distance in kilometres (sum of all legs).",
    )
    estimated_fuel_cost_eur: float | None = Field(
        default=None,
        description="Estimated total fuel cost in EUR (if fuel_price was called).",
    )
