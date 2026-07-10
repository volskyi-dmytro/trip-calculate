"""Country-average fuel pricing for a route — deterministic, zero LLM tokens.

Weighting model: consecutive waypoints form legs; each leg's haversine
distance is split 50/50 between its endpoint countries (spec: transit
countries between waypoints are a documented limitation). Prices convert to
the user's currency by pivoting through UAH (NBU publishes UAH per USD/EUR).
"""
import math
from datetime import datetime, timezone
from typing import Optional

from .. import db
from ..schema import CountryFuelPrice, FuelData

STALE_AFTER_DAYS = 14
_EARTH_RADIUS_KM = 6371.0


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * _EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def country_weights(points: list[tuple[float, float, Optional[str]]]) -> dict[str, float]:
    raw: dict[str, float] = {}
    for (lat1, lon1, c1), (lat2, lon2, c2) in zip(points, points[1:]):
        dist = haversine_km(lat1, lon1, lat2, lon2)
        for country in (c1, c2):
            if country:
                raw[country] = raw.get(country, 0.0) + dist / 2
    total = sum(raw.values())
    if total <= 0:
        return {}
    return {c: d / total for c, d in raw.items()}


def convert_via_uah(amount: float, from_cur: str, to_cur: str,
                    uah_rates: dict[str, float]) -> Optional[float]:
    from_rate, to_rate = uah_rates.get(from_cur), uah_rates.get(to_cur)
    if not from_rate or not to_rate:
        return None
    return amount * from_rate / to_rate


async def compute_fuel_data(points: list[tuple[float, float, Optional[str]]],
                            fuel_type: str, currency: str) -> Optional[FuelData]:
    weights = country_weights(points)
    if not weights:
        return None
    rows = await db.get_fuel_prices(sorted(weights), fuel_type)
    if not rows:
        return None

    uah_rates = {"UAH": 1.0}
    for fx in await db.get_fx_rates():
        if fx.quote == "UAH":
            uah_rates[fx.base] = fx.rate

    now = datetime.now(timezone.utc)
    priced: list[tuple[str, float, str, datetime]] = []
    stale = False
    for row in rows:
        converted = convert_via_uah(row.price, row.currency, currency, uah_rates)
        if converted is None:
            continue
        stale = stale or (now - row.fetched_at).days >= STALE_AFTER_DAYS
        priced.append((row.country_code, converted, row.source, row.fetched_at))
    if not priced:
        return None

    # Renormalize over the countries that actually have data
    total_w = sum(weights[code] for code, _, _, _ in priced)
    if total_w <= 0:
        return None
    avg = sum(price * weights[code] for code, price, _, _ in priced) / total_w
    return FuelData(
        price_per_liter=round(avg, 2),
        currency=currency,
        fuel_type=fuel_type,
        countries=[
            CountryFuelPrice(code=code, price=round(price, 3),
                             weight=round(weights[code] / total_w, 3))
            for code, price, _, _ in priced
        ],
        source=" + ".join(sorted({src for _, _, src, _ in priced})),
        fetched_at=min(fa for _, _, _, fa in priced),
        stale=stale,
    )
