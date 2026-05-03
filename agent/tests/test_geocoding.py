import pytest
import respx
import httpx
from app.geocoding import geocode_location
from app.schema import ParsedLocation


def _loc(name: str, location_type: str = "origin", lat=None, lon=None) -> ParsedLocation:
    return ParsedLocation(name=name, location_type=location_type, lat=lat, lon=lon)


@respx.mock
@pytest.mark.asyncio
async def test_returns_nominatim_result(nominatim_kyiv):
    respx.get("https://nominatim.openstreetmap.org/search").mock(
        return_value=httpx.Response(200, json=nominatim_kyiv)
    )
    result = await geocode_location(_loc("Kyiv Ukraine"))
    assert result.source == "nominatim"
    assert result.latitude == 50.4501
    assert result.longitude == 30.5234
    assert result.clean_name == "Kyiv"


@respx.mock
@pytest.mark.asyncio
async def test_falls_back_to_ai_coords_when_nominatim_empty():
    respx.get("https://nominatim.openstreetmap.org/search").mock(
        return_value=httpx.Response(200, json=[])
    )
    loc = _loc("High Castle Lviv Ukraine", lat=49.852, lon=24.027)
    result = await geocode_location(loc)
    assert result.source == "ai_provided"
    assert result.latitude == 49.852
    assert result.longitude == 24.027


@respx.mock
@pytest.mark.asyncio
async def test_returns_failed_when_no_results_and_no_ai_coords():
    respx.get("https://nominatim.openstreetmap.org/search").mock(
        return_value=httpx.Response(200, json=[])
    )
    result = await geocode_location(_loc("Xyzzy Nowhere"))
    assert result.source == "failed"
    assert result.error is True


@respx.mock
@pytest.mark.asyncio
async def test_retries_on_429_and_returns_failed_after_exhaustion():
    respx.get("https://nominatim.openstreetmap.org/search").mock(
        return_value=httpx.Response(429)
    )
    # Patch sleep so retries don't actually wait
    import app.geocoding as geocoding_module
    import asyncio
    original_sleep = asyncio.sleep

    async def fast_sleep(_):
        pass

    geocoding_module._sleep = fast_sleep

    result = await geocode_location(_loc("Kyiv Ukraine"))
    assert result.source == "failed"

    geocoding_module._sleep = original_sleep


@respx.mock
@pytest.mark.asyncio
async def test_rejects_suspicious_ai_coords():
    """AI coords near equator/poles (abs(lat) < 10) should not be used."""
    respx.get("https://nominatim.openstreetmap.org/search").mock(
        return_value=httpx.Response(200, json=[])
    )
    loc = _loc("Unknown Place", lat=0.5, lon=1.2)
    result = await geocode_location(loc)
    assert result.source == "failed"
