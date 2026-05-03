import asyncio
from typing import Callable, Awaitable
import httpx
from .schema import ParsedLocation, GeocodedLocation

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
_BACKOFF = [2.0, 4.0, 8.0]

# Indirection so tests can patch sleep without patching asyncio.sleep globally
_sleep: Callable[[float], Awaitable[None]] = asyncio.sleep


async def geocode_location(
    location: ParsedLocation,
    user_agent: str = "tripcalculate-agent/1.0",
) -> GeocodedLocation:
    """
    Geocode one location. Strategy:
    1. Try Nominatim (up to 3 retries with backoff on 418/429).
    2. Fall back to AI-provided coordinates if nominatim returns nothing.
    3. Return source="failed" if both fail.
    """
    is_poi = _is_specific_place(location.name)
    params: dict = {
        "q": location.name,
        "format": "json",
        "limit": 10,
        "addressdetails": 1,
    }
    if not is_poi:
        params["featuretype"] = "city"

    max_retries = len(_BACKOFF)
    async with httpx.AsyncClient() as client:
        for attempt in range(max_retries + 1):
            try:
                resp = await client.get(
                    NOMINATIM_URL,
                    params=params,
                    headers={"User-Agent": user_agent},
                    timeout=10.0,
                )
                if resp.status_code in (418, 429):
                    if attempt < max_retries:
                        await _sleep(_BACKOFF[attempt])
                        continue
                    break

                resp.raise_for_status()
                results = resp.json()
                valid = [r for r in results if is_poi or _is_valid_settlement(r)]

                if valid:
                    best = valid[0]
                    addr = best.get("address", {})
                    clean = (
                        best.get("name")
                        or addr.get("city")
                        or addr.get("town")
                        or addr.get("village")
                        or best["display_name"].split(",")[0].strip()
                    )
                    return GeocodedLocation(
                        name=location.name,
                        clean_name=clean,
                        location_type=location.location_type,
                        latitude=float(best["lat"]),
                        longitude=float(best["lon"]),
                        source="nominatim",
                    )
                # Empty valid results — fall through to AI coords
                break

            except httpx.HTTPStatusError:
                if attempt < max_retries:
                    await _sleep(_BACKOFF[attempt])
                    continue
                break
            except Exception:
                break

    # AI coordinates fallback
    if (
        location.lat is not None
        and location.lon is not None
        and abs(location.lat) >= 10
        and abs(location.lat) <= 85
        and abs(location.lon) >= 10
    ):
        clean = location.name.split(" in ")[0].split(" near ")[0].split(" біля ")[0].strip()
        return GeocodedLocation(
            name=location.name,
            clean_name=clean,
            location_type=location.location_type,
            latitude=location.lat,
            longitude=location.lon,
            source="ai_provided",
        )

    return GeocodedLocation(
        name=location.name,
        clean_name=location.name,
        location_type=location.location_type,
        source="failed",
        error=True,
        message=f"Could not find location: {location.name}",
    )


def _is_valid_settlement(result: dict) -> bool:
    if result.get("class") in ("highway", "railway", "waterway"):
        return False
    valid_types = {
        "city", "town", "village", "hamlet", "municipality",
        "suburb", "neighbourhood", "quarter", "locality",
        "administrative", "residential", "district",
    }
    return result.get("type", "") in valid_types


def _is_specific_place(name: str) -> bool:
    lower = name.lower()
    poi_keywords = [
        "restaurant", "cafe", "bar", "hotel", "motel", "hostel", "shop",
        "store", "mall", "museum", "gallery", "park", "garden", "church",
        "cathedral", "temple", "castle", "fortress", "monument", "memorial",
        "station", "airport", "hospital", "clinic", "university", "school",
        "stadium", "arena", "theater", "theatre", "cinema", "market",
        "bazaar", "tower", "building",
        "ресторан", "кафе", "бар", "готель", "мотель", "хостел", "магазин",
        "центр", "музей", "галерея", "парк", "сад", "церква", "собор",
        "храм", "замок", "фортеця", "пам'ятник", "меморіал", "станція",
        "аеропорт", "лікарня", "клініка", "університет", "школа", "стадіон",
        "арена", "театр", "кінотеатр", "ринок", "базар", "вежа", "будівля",
    ]
    modifiers = ["near", "next to", "at", "by", "beside", "біля", "поруч з", "навпроти"]
    address_words = ["street", "вулиця", "вул", "avenue", "проспект", "square", "площа", "road"]
    return (
        any(kw in lower for kw in poi_keywords)
        or any(mod in lower for mod in modifiers)
        or any(aw in lower for aw in address_words)
    )
