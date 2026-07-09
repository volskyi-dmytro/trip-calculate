import asyncio
from typing import Callable, Awaitable, Optional
import httpx
from .schema import ParsedLocation, GeocodedLocation

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
REVERSE_URL = "https://nominatim.openstreetmap.org/reverse"
_BACKOFF = [2.0, 4.0, 8.0]
# Country cache for kept current-route waypoints: keyed by coords rounded to
# 2 decimals (~1 km) — plenty for country attribution, tiny memory footprint
_country_cache: dict[tuple[float, float], Optional[str]] = {}
_COUNTRY_CACHE_MAX = 5000

# Indirection so tests can patch sleep without patching asyncio.sleep globally
_sleep: Callable[[float], Awaitable[None]] = asyncio.sleep


async def geocode_location(
    location: ParsedLocation,
    user_agent: str = "tripcalculate-agent/1.0",
    allow_ai_coords: bool = True,
) -> GeocodedLocation:
    """
    Geocode one location. Strategy:
    1. Try Nominatim with the normalized name (up to 3 retries with backoff on 418/429).
    2. Try Nominatim with the original user-language name — OSM knows small
       villages by their native spelling, where transliterations often miss.
    3. Fall back to AI-provided coordinates only when allow_ai_coords is True.
       The LLM can hallucinate plausible-looking coordinates for obscure
       places, so callers should keep this as a genuine last resort.
    4. Return source="failed" if everything fails.
    """
    queries = [location.name]
    original = (location.original_name or "").strip()
    if original and original != location.name:
        queries.append(original)

    async with httpx.AsyncClient() as client:
        for query in queries:
            best = await _query_nominatim(client, query, user_agent)
            if best:
                addr = best.get("address", {})
                clean = (
                    best.get("name")
                    or addr.get("city")
                    or addr.get("town")
                    or addr.get("village")
                    or best["display_name"].split(",")[0].strip()
                )
                country = str(addr.get("country_code") or "").strip().upper() or None
                return GeocodedLocation(
                    name=location.name,
                    clean_name=clean,
                    location_type=location.location_type,
                    latitude=float(best["lat"]),
                    longitude=float(best["lon"]),
                    source="nominatim",
                    country_code=country,
                )

    # AI coordinates fallback — last resort only
    if (
        allow_ai_coords
        and location.lat is not None
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


async def _query_nominatim(
    client: httpx.AsyncClient,
    query: str,
    user_agent: str,
) -> Optional[dict]:
    """Run one Nominatim search (with 418/429 backoff retries) and return the
    best valid result, or None when nothing acceptable is found."""
    is_poi = _is_specific_place(query)
    params: dict = {
        "q": query,
        "format": "json",
        "limit": 10,
        "addressdetails": 1,
    }
    if not is_poi:
        params["featuretype"] = "city"

    max_retries = len(_BACKOFF)
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
                return None

            resp.raise_for_status()
            results = resp.json()
            valid = [r for r in results if is_poi or _is_valid_settlement(r)]
            return valid[0] if valid else None

        except httpx.HTTPStatusError:
            if attempt < max_retries:
                await _sleep(_BACKOFF[attempt])
                continue
            return None
        except Exception:
            return None

    return None


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


async def reverse_country(lat: float, lon: float, user_agent: str) -> Optional[str]:
    """Resolve the country of a coordinate (zoom=3 reverse lookup). Used only
    for waypoints that skipped forward geocoding (kept current-route points),
    so call volume is low and the cache absorbs repeats."""
    key = (round(lat, 2), round(lon, 2))
    if key in _country_cache:
        return _country_cache[key]
    country: Optional[str] = None
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                REVERSE_URL,
                params={"format": "json", "lat": lat, "lon": lon,
                        "zoom": 3, "addressdetails": 1},
                headers={"User-Agent": user_agent},
                timeout=10.0,
            )
            resp.raise_for_status()
            cc = (resp.json().get("address") or {}).get("country_code")
            country = str(cc).strip().upper() if cc else None
    except Exception:
        country = None
    if len(_country_cache) >= _COUNTRY_CACHE_MAX:
        _country_cache.clear()
    _country_cache[key] = country
    return country
