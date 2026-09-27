import pytest
import respx
import httpx
from app.geocoding import geocode_location, reverse_country, REVERSE_URL, _country_cache
from app.schema import ParsedLocation


def _loc(name: str, location_type: str = "origin", lat=None, lon=None, original_name=None) -> ParsedLocation:
    return ParsedLocation(
        name=name, location_type=location_type, lat=lat, lon=lon, original_name=original_name
    )


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
async def test_retries_on_429_and_returns_failed_after_exhaustion(monkeypatch):
    respx.get("https://nominatim.openstreetmap.org/search").mock(
        return_value=httpx.Response(429)
    )
    import app.geocoding as geocoding_module

    async def fast_sleep(_):
        pass

    monkeypatch.setattr(geocoding_module, "_sleep", fast_sleep)

    result = await geocode_location(_loc("Kyiv Ukraine"))
    assert result.source == "failed"


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


@respx.mock
@pytest.mark.asyncio
async def test_original_name_fallback_beats_ai_coords():
    """Incident regression (2026-06-11): 'Соловичі' was transliterated to
    'Solovichi Ukraine' (no Nominatim match) and the LLM's hallucinated
    coordinates were used, placing the village ~55 km off. The original
    native-script name must be tried and must win over AI coordinates."""
    village = [{
        "place_id": 2,
        "lat": "51.0651400",
        "lon": "24.4741100",
        "display_name": "Соловичі, Турійська селищна громада, Волинська область, Україна",
        "name": "Соловичі",
        "type": "village",
        "class": "place",
        "importance": 0.3,
        "address": {"village": "Соловичі", "country": "Україна"},
    }]

    def handler(request):
        q = request.url.params.get("q", "")
        if q == "Соловичі":
            return httpx.Response(200, json=village)
        return httpx.Response(200, json=[])

    respx.get("https://nominatim.openstreetmap.org/search").mock(side_effect=handler)

    loc = _loc("Solovichi Ukraine", "waypoint", lat=50.6, lon=24.2, original_name="Соловичі")
    result = await geocode_location(loc)

    assert result.source == "nominatim"
    assert result.latitude == 51.06514
    assert result.longitude == 24.47411
    assert result.clean_name == "Соловичі"


@respx.mock
@pytest.mark.asyncio
async def test_ai_coords_ignored_when_disallowed():
    """With allow_ai_coords=False a Nominatim miss is a failure, never a
    silent fall-through to LLM-guessed coordinates."""
    respx.get("https://nominatim.openstreetmap.org/search").mock(
        return_value=httpx.Response(200, json=[])
    )
    loc = _loc("High Castle Lviv Ukraine", lat=49.852, lon=24.027)
    result = await geocode_location(loc, allow_ai_coords=False)
    assert result.source == "failed"
    assert result.error is True


@respx.mock
@pytest.mark.asyncio
async def test_forward_geocode_captures_country_code():
    respx.get("https://nominatim.openstreetmap.org/search").mock(
        return_value=httpx.Response(200, json=[{
            "lat": "50.45", "lon": "30.52", "display_name": "Kyiv, Ukraine",
            "name": "Kyiv", "class": "place", "type": "city",
            "address": {"city": "Kyiv", "country_code": "ua"},
        }])
    )
    loc = _loc("Kyiv Ukraine", location_type="origin")
    result = await geocode_location(loc)
    assert result.country_code == "UA"


@respx.mock
@pytest.mark.asyncio
async def test_reverse_country_caches_by_rounded_coords():
    _country_cache.clear()
    route = respx.get(REVERSE_URL).mock(
        return_value=httpx.Response(200, json={"address": {"country_code": "pl"}})
    )
    assert await reverse_country(52.2297, 21.0122, "test-agent") == "PL"
    # Second call within ~1km rounds to the same key → served from cache
    assert await reverse_country(52.2301, 21.0119, "test-agent") == "PL"
    assert route.call_count == 1


@respx.mock
@pytest.mark.asyncio
async def test_reverse_country_failure_returns_none():
    _country_cache.clear()
    respx.get(REVERSE_URL).mock(return_value=httpx.Response(500))
    assert await reverse_country(1.0, 1.0, "test-agent") is None


# ── Labels must match the request language, not the geocoded place's own ──

@respx.mock
@pytest.mark.asyncio
async def test_passes_accept_language_to_nominatim(nominatim_kyiv):
    route = respx.get("https://nominatim.openstreetmap.org/search").mock(
        return_value=httpx.Response(200, json=nominatim_kyiv)
    )
    await geocode_location(_loc("Kyiv Ukraine"), language="uk")
    assert route.calls.last.request.url.params["accept-language"] == "uk"


@respx.mock
@pytest.mark.asyncio
async def test_defaults_to_english_for_unknown_language(nominatim_kyiv):
    route = respx.get("https://nominatim.openstreetmap.org/search").mock(
        return_value=httpx.Response(200, json=nominatim_kyiv)
    )
    await geocode_location(_loc("Kyiv Ukraine"), language="fr")
    assert route.calls.last.request.url.params["accept-language"] == "en"


@respx.mock
@pytest.mark.asyncio
async def test_plain_city_search_prefers_settlement_name_over_district_name():
    """Regression for the audit finding ("Krakow, Старий город"): Nominatim
    can rank a district/suburb above the city itself for a plain city query.
    Its own "name" field is then the district ("Old Town"), which must never
    replace the city label the user actually asked for."""
    district = [{
        "place_id": 9,
        "lat": "50.0614",
        "lon": "19.9366",
        "display_name": "Old Town, Kraków, Poland",
        "name": "Old Town",
        "type": "suburb",
        "class": "place",
        "importance": 0.5,
        "address": {"city": "Kraków", "suburb": "Old Town", "country_code": "pl"},
    }]
    respx.get("https://nominatim.openstreetmap.org/search").mock(
        return_value=httpx.Response(200, json=district)
    )
    result = await geocode_location(_loc("Krakow Poland", "destination"))
    assert result.clean_name == "Kraków"


@respx.mock
@pytest.mark.asyncio
async def test_poi_search_still_prefers_the_matched_feature_name():
    poi = [{
        "place_id": 10,
        "lat": "50.0", "lon": "19.9",
        "display_name": "Wawel Castle, Kraków, Poland",
        "name": "Wawel Castle",
        "type": "castle",
        "class": "historic",
        "importance": 0.7,
        "address": {"city": "Kraków", "country_code": "pl"},
    }]
    respx.get("https://nominatim.openstreetmap.org/search").mock(
        return_value=httpx.Response(200, json=poi)
    )
    result = await geocode_location(_loc("Wawel Castle Krakow Poland", "waypoint"))
    assert result.clean_name == "Wawel Castle"
