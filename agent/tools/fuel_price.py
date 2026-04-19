"""
Fuel price tool — country-keyed hardcoded table (European countries).

Returns petrol/diesel price in EUR/L for a given ISO 3166-1 alpha-2 country code.
This is a pure-function tool (no HTTP calls) and is synchronous.

# TODO M5: replace with live provider (e.g. globalpetrolprices scrape or OPEC API)

Prices in EUR/L sourced from public references (Q1 2026 estimates).
Values are approximate and for planning purposes only.

CLAUDE.md §Non-negotiable #9: tools return structured dicts on failure, never raw exceptions.
"""

import logging
from typing import Any

from langchain_core.tools import tool
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# Hardcoded table of fuel prices for European countries (EUR/L, Q1 2026 estimates).
# TODO M5: replace with live provider (e.g. globalpetrolprices scrape or OPEC API)
_FUEL_TABLE: dict[str, dict[str, float]] = {
    "UA": {"petrol_95": 1.45, "diesel": 1.38},
    "PL": {"petrol_95": 1.52, "diesel": 1.48},
    "DE": {"petrol_95": 1.85, "diesel": 1.72},
    "FR": {"petrol_95": 1.78, "diesel": 1.65},
    "IT": {"petrol_95": 1.82, "diesel": 1.70},
    "ES": {"petrol_95": 1.62, "diesel": 1.55},
    "NL": {"petrol_95": 2.05, "diesel": 1.75},
    "BE": {"petrol_95": 1.75, "diesel": 1.65},
    "AT": {"petrol_95": 1.68, "diesel": 1.60},
    "CZ": {"petrol_95": 1.55, "diesel": 1.48},
    "SK": {"petrol_95": 1.58, "diesel": 1.50},
    "HU": {"petrol_95": 1.62, "diesel": 1.55},
    "RO": {"petrol_95": 1.42, "diesel": 1.38},
    "BG": {"petrol_95": 1.38, "diesel": 1.32},
    "GR": {"petrol_95": 1.90, "diesel": 1.78},
}

_VALID_FUEL_TYPES = frozenset({"petrol_95", "diesel"})


class FuelPriceInput(BaseModel):
    country_code: str = Field(
        description="ISO 3166-1 alpha-2 country code (e.g. 'UA', 'DE', 'PL').",
        min_length=2,
        max_length=2,
    )
    fuel_type: str = Field(
        default="petrol_95",
        description="Fuel type: 'petrol_95' (default) or 'diesel'.",
    )


@tool(args_schema=FuelPriceInput)
def fuel_price(country_code: str, fuel_type: str = "petrol_95") -> dict[str, Any]:
    """
    Look up the approximate fuel price for a European country.

    Returns price in EUR/L from a hardcoded reference table (Q1 2026 estimates).
    Use this to estimate fuel costs for road trips across European countries.
    On failure returns a dict with a 'status' key describing the problem.
    """
    normalized_code = country_code.upper().strip()
    normalized_fuel = fuel_type.lower().strip()

    if normalized_fuel not in _VALID_FUEL_TYPES:
        logger.warning(
            "Unknown fuel_type=%r requested for country=%s", fuel_type, normalized_code
        )
        return {
            "status": "no_data",
            "hint": (
                f"Unknown fuel type {fuel_type!r}. "
                f"Supported types: {', '.join(sorted(_VALID_FUEL_TYPES))}."
            ),
        }

    country_prices = _FUEL_TABLE.get(normalized_code)
    if country_prices is None:
        logger.warning(
            "No fuel price data for country_code=%r", normalized_code
        )
        return {
            "status": "no_data",
            "hint": (
                f"No fuel price data for country code {normalized_code!r}. "
                "Supported countries: "
                + ", ".join(sorted(_FUEL_TABLE.keys()))
                + ". "
                "For unsupported countries, use an approximate regional average."
            ),
        }

    price = country_prices.get(normalized_fuel)
    if price is None:
        # Shouldn't happen given the validation above, but guard defensively.
        return {
            "status": "no_data",
            "hint": f"No {normalized_fuel} price for {normalized_code}.",
        }

    return {
        "status": "ok",
        "country": normalized_code,
        "fuel_type": normalized_fuel,
        "price_eur_per_l": price,
        "source": "hardcoded_table_2026_q1",
    }
