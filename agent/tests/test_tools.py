"""
Tool tests — happy path + failure paths for all 6 tools.

Uses respx to mock httpx calls so no real network requests are made.
Asserts that failure paths return structured dicts with a `status` field,
not raw exceptions — this is CLAUDE.md §Non-negotiable #9.

M4 additions: weather_forecast, pois_nearby, fuel_price, estimate_time.
"""

import json
from unittest.mock import patch

import httpx
import pytest
import respx

# Patch env vars before importing tools to avoid env-check issues.
import os
os.environ.setdefault("MAPBOX_TOKEN", "pk.test-token")
os.environ.setdefault("OTM_KEY", "test-otm-key")
os.environ.setdefault("INTERNAL_JWT_SECRET", "test-secret-32-bytes-xxxxxxxxxx")
os.environ.setdefault("PG_URL", "postgresql://test:test@localhost:5432/test")
os.environ.setdefault("ANTHROPIC_API_KEY", "dummy-key-for-tests")


# ---------------------------------------------------------------------------
# Geocode tests
# ---------------------------------------------------------------------------
class TestGeocodeTool:
    @pytest.mark.asyncio
    @respx.mock
    async def test_happy_path_returns_coordinates(self):
        from tools.geocode import geocode

        mapbox_response = {
            "features": [
                {
                    "geometry": {"coordinates": [30.5234, 50.4501]},
                    "place_name": "Kyiv, Ukraine",
                    "relevance": 0.99,
                }
            ]
        }
        respx.get(
            "https://api.mapbox.com/geocoding/v5/mapbox.places/Kyiv.json"
        ).mock(return_value=httpx.Response(200, json=mapbox_response))

        result = await geocode.ainvoke({"query": "Kyiv"})

        assert result["status"] == "ok"
        assert result["longitude"] == 30.5234
        assert result["latitude"] == 50.4501
        assert "Kyiv" in result["place_name"]
        assert result["relevance"] == 0.99

    @pytest.mark.asyncio
    @respx.mock
    async def test_no_results_returns_structured_dict(self):
        from tools.geocode import geocode

        respx.get(
            "https://api.mapbox.com/geocoding/v5/mapbox.places/zzz-nonexistent.json"
        ).mock(return_value=httpx.Response(200, json={"features": []}))

        result = await geocode.ainvoke({"query": "zzz-nonexistent"})

        # Must be a structured dict, not a raised exception.
        assert isinstance(result, dict)
        assert result["status"] == "no_results"
        assert "hint" in result

    @pytest.mark.asyncio
    @respx.mock
    async def test_http_error_returns_upstream_error(self):
        from tools.geocode import geocode

        respx.get(
            "https://api.mapbox.com/geocoding/v5/mapbox.places/Somewhere.json"
        ).mock(return_value=httpx.Response(500, text="Internal Server Error"))

        result = await geocode.ainvoke({"query": "Somewhere"})

        assert isinstance(result, dict)
        assert result["status"] == "upstream_error"
        assert "hint" in result

    @pytest.mark.asyncio
    async def test_timeout_returns_timeout_status(self):
        from tools.geocode import geocode

        with respx.mock:
            respx.get(
                "https://api.mapbox.com/geocoding/v5/mapbox.places/SlowCity.json"
            ).mock(side_effect=httpx.TimeoutException("timed out"))

            result = await geocode.ainvoke({"query": "SlowCity"})

        assert isinstance(result, dict)
        assert result["status"] == "timeout"
        assert "hint" in result

    @pytest.mark.asyncio
    async def test_missing_token_returns_upstream_error(self):
        # Temporarily patch the module-level token to exercise the guard branch.
        # Import the module (not the tool object) to reach module-level variables.
        import sys
        import importlib

        # Ensure the module is imported
        import tools.geocode  # noqa: F401
        geocode_mod = sys.modules["tools.geocode"]

        original = geocode_mod._MAPBOX_TOKEN
        geocode_mod._MAPBOX_TOKEN = ""
        try:
            result = await geocode_mod.geocode.ainvoke({"query": "Kyiv"})
            assert result["status"] == "upstream_error"
        finally:
            geocode_mod._MAPBOX_TOKEN = original


# ---------------------------------------------------------------------------
# Route OSRM tests
# ---------------------------------------------------------------------------
class TestRouteOsrmTool:
    @pytest.mark.asyncio
    @respx.mock
    async def test_happy_path_returns_route(self):
        from tools.route_osrm import route_osrm

        osrm_response = {
            "code": "Ok",
            "routes": [
                {
                    "distance": 543000.0,
                    "duration": 18000.0,
                    "geometry": "encoded_polyline_string_here",
                    "legs": [{"summary": "E40"}],
                }
            ],
        }
        respx.get(url__startswith="https://router.project-osrm.org").mock(
            return_value=httpx.Response(200, json=osrm_response)
        )

        result = await route_osrm.ainvoke(
            {
                "origin_lon": 30.5234,
                "origin_lat": 50.4501,
                "dest_lon": 36.2304,
                "dest_lat": 49.9935,
            }
        )

        assert result["status"] == "ok"
        assert result["distance_metres"] == 543000.0
        assert result["duration_seconds"] == 18000.0
        assert result["geometry_polyline"] == "encoded_polyline_string_here"

    @pytest.mark.asyncio
    @respx.mock
    async def test_no_route_found_returns_no_results(self):
        from tools.route_osrm import route_osrm

        respx.get(url__startswith="https://router.project-osrm.org").mock(
            return_value=httpx.Response(
                200,
                json={"code": "NoRoute", "message": "No route found between points"},
            )
        )

        result = await route_osrm.ainvoke(
            {
                "origin_lon": 0.0,
                "origin_lat": 0.0,
                "dest_lon": 0.1,
                "dest_lat": 0.1,
            }
        )

        assert isinstance(result, dict)
        assert result["status"] == "no_results"
        assert "hint" in result

    @pytest.mark.asyncio
    @respx.mock
    async def test_http_error_returns_upstream_error(self):
        from tools.route_osrm import route_osrm

        respx.get(url__startswith="https://router.project-osrm.org").mock(
            return_value=httpx.Response(503, text="Service Unavailable")
        )

        result = await route_osrm.ainvoke(
            {
                "origin_lon": 30.5234,
                "origin_lat": 50.4501,
                "dest_lon": 36.2304,
                "dest_lat": 49.9935,
            }
        )

        assert isinstance(result, dict)
        assert result["status"] == "upstream_error"

    @pytest.mark.asyncio
    async def test_timeout_returns_timeout_status(self):
        from tools.route_osrm import route_osrm

        with respx.mock:
            respx.get(url__startswith="https://router.project-osrm.org").mock(
                side_effect=httpx.TimeoutException("timed out")
            )

            result = await route_osrm.ainvoke(
                {
                    "origin_lon": 30.5234,
                    "origin_lat": 50.4501,
                    "dest_lon": 36.2304,
                    "dest_lat": 49.9935,
                }
            )

        assert isinstance(result, dict)
        assert result["status"] == "timeout"


# ---------------------------------------------------------------------------
# WeatherForecast tests
# ---------------------------------------------------------------------------
class TestWeatherForecastTool:
    @pytest.mark.asyncio
    @respx.mock
    async def test_happy_path_returns_daily_forecast(self):
        from tools.weather_forecast import weather_forecast

        open_meteo_response = {
            "daily": {
                "time": ["2026-04-20", "2026-04-21"],
                "temperature_2m_max": [18.5, 20.1],
                "temperature_2m_min": [10.2, 11.5],
                "precipitation_sum": [0.0, 2.5],
                "weathercode": [1, 61],
            }
        }
        respx.get(url__startswith="https://api.open-meteo.com").mock(
            return_value=httpx.Response(200, json=open_meteo_response)
        )

        result = await weather_forecast.ainvoke(
            {"latitude": 50.4501, "longitude": 30.5234}
        )

        assert result["status"] == "ok"
        assert len(result["daily"]) == 2
        assert result["daily"][0]["date"] == "2026-04-20"
        assert result["daily"][0]["temp_max"] == 18.5
        assert result["daily"][1]["precip_mm"] == 2.5

    @pytest.mark.asyncio
    @respx.mock
    async def test_empty_daily_returns_no_data(self):
        """Critical: Open-Meteo blackhole — empty daily must return no_data, not crash."""
        from tools.weather_forecast import weather_forecast

        respx.get(url__startswith="https://api.open-meteo.com").mock(
            return_value=httpx.Response(200, json={"daily": {"time": []}})
        )

        result = await weather_forecast.ainvoke(
            {"latitude": 50.4501, "longitude": 30.5234}
        )

        assert isinstance(result, dict)
        assert result["status"] == "no_data"
        assert "hint" in result

    @pytest.mark.asyncio
    @respx.mock
    async def test_missing_daily_key_returns_no_data(self):
        """Open-Meteo returns 200 with no 'daily' key at all."""
        from tools.weather_forecast import weather_forecast

        respx.get(url__startswith="https://api.open-meteo.com").mock(
            return_value=httpx.Response(200, json={"latitude": 50.45, "longitude": 30.52})
        )

        result = await weather_forecast.ainvoke(
            {"latitude": 50.4501, "longitude": 30.5234}
        )

        assert isinstance(result, dict)
        assert result["status"] == "no_data"

    @pytest.mark.asyncio
    @respx.mock
    async def test_http_error_returns_upstream_error(self):
        from tools.weather_forecast import weather_forecast

        respx.get(url__startswith="https://api.open-meteo.com").mock(
            return_value=httpx.Response(500, text="Internal Server Error")
        )

        result = await weather_forecast.ainvoke(
            {"latitude": 50.4501, "longitude": 30.5234}
        )

        assert isinstance(result, dict)
        assert result["status"] == "upstream_error"

    @pytest.mark.asyncio
    async def test_timeout_returns_timeout_status(self):
        from tools.weather_forecast import weather_forecast

        with respx.mock:
            respx.get(url__startswith="https://api.open-meteo.com").mock(
                side_effect=httpx.TimeoutException("timed out")
            )
            result = await weather_forecast.ainvoke(
                {"latitude": 50.4501, "longitude": 30.5234}
            )

        assert isinstance(result, dict)
        assert result["status"] == "timeout"


# ---------------------------------------------------------------------------
# PoisNearby tests
# ---------------------------------------------------------------------------
class TestPoisNearbyTool:
    @pytest.mark.asyncio
    @respx.mock
    async def test_happy_path_returns_pois(self):
        from tools.pois_nearby import pois_nearby

        otm_response = [
            {
                "name": "Kyiv Pechersk Lavra",
                "kinds": "interesting_places,religion",
                "xid": "N123456",
                "dist": 450.5,
                "point": {"lon": 30.5564, "lat": 50.4340},
            },
            {
                "name": "Independence Square",
                "kinds": "interesting_places",
                "xid": "N654321",
                "dist": 800.0,
                "point": {"lon": 30.5233, "lat": 50.4501},
            },
        ]
        respx.get(url__startswith="https://api.opentripmap.com").mock(
            return_value=httpx.Response(200, json=otm_response)
        )

        result = await pois_nearby.ainvoke(
            {"latitude": 50.4501, "longitude": 30.5234, "radius_meters": 5000}
        )

        assert result["status"] == "ok"
        assert len(result["pois"]) == 2
        assert result["pois"][0]["name"] == "Kyiv Pechersk Lavra"
        assert result["pois"][0]["distance_m"] == 450.5

    @pytest.mark.asyncio
    @respx.mock
    async def test_empty_results_returns_no_results(self):
        from tools.pois_nearby import pois_nearby

        respx.get(url__startswith="https://api.opentripmap.com").mock(
            return_value=httpx.Response(200, json=[])
        )

        result = await pois_nearby.ainvoke(
            {"latitude": 50.4501, "longitude": 30.5234}
        )

        assert isinstance(result, dict)
        assert result["status"] == "no_results"
        assert "hint" in result

    @pytest.mark.asyncio
    async def test_missing_key_returns_upstream_error(self):
        """OTM_KEY not set → upstream_error.

        Uses sys.modules to get the actual module object (not the StructuredTool
        exported from the package), then temporarily blanks the _OTM_KEY guard.
        """
        import sys
        import importlib
        # Ensure the module is loaded and get it from sys.modules.
        importlib.import_module("tools.pois_nearby")
        pois_module = sys.modules["tools.pois_nearby"]

        original_key = pois_module._OTM_KEY
        pois_module._OTM_KEY = ""
        try:
            result = await pois_module.pois_nearby.ainvoke(
                {"latitude": 50.4501, "longitude": 30.5234}
            )
            assert result["status"] == "upstream_error"
            assert "OTM_KEY" in result["hint"]
        finally:
            pois_module._OTM_KEY = original_key

    @pytest.mark.asyncio
    @respx.mock
    async def test_http_403_returns_upstream_error(self):
        from tools.pois_nearby import pois_nearby

        respx.get(url__startswith="https://api.opentripmap.com").mock(
            return_value=httpx.Response(403, text="Forbidden")
        )

        result = await pois_nearby.ainvoke(
            {"latitude": 50.4501, "longitude": 30.5234}
        )

        assert isinstance(result, dict)
        assert result["status"] == "upstream_error"

    @pytest.mark.asyncio
    async def test_timeout_returns_timeout_status(self):
        from tools.pois_nearby import pois_nearby

        with respx.mock:
            respx.get(url__startswith="https://api.opentripmap.com").mock(
                side_effect=httpx.TimeoutException("timed out")
            )
            result = await pois_nearby.ainvoke(
                {"latitude": 50.4501, "longitude": 30.5234}
            )

        assert isinstance(result, dict)
        assert result["status"] == "timeout"


# ---------------------------------------------------------------------------
# FuelPrice tests
# ---------------------------------------------------------------------------
class TestFuelPriceTool:
    def test_known_country_petrol(self):
        from tools.fuel_price import fuel_price

        result = fuel_price.invoke({"country_code": "UA", "fuel_type": "petrol_95"})

        assert result["status"] == "ok"
        assert result["country"] == "UA"
        assert result["fuel_type"] == "petrol_95"
        assert result["price_eur_per_l"] == 1.45
        assert result["source"] == "hardcoded_table_2026_q1"

    def test_known_country_diesel(self):
        from tools.fuel_price import fuel_price

        result = fuel_price.invoke({"country_code": "DE", "fuel_type": "diesel"})

        assert result["status"] == "ok"
        assert result["country"] == "DE"
        assert result["fuel_type"] == "diesel"
        assert result["price_eur_per_l"] == 1.72

    def test_country_code_case_insensitive(self):
        from tools.fuel_price import fuel_price

        result = fuel_price.invoke({"country_code": "pl"})

        assert result["status"] == "ok"
        assert result["country"] == "PL"

    def test_unknown_country_returns_no_data(self):
        from tools.fuel_price import fuel_price

        result = fuel_price.invoke({"country_code": "XX"})

        assert isinstance(result, dict)
        assert result["status"] == "no_data"
        assert "hint" in result

    def test_unknown_fuel_type_returns_no_data(self):
        from tools.fuel_price import fuel_price

        result = fuel_price.invoke({"country_code": "UA", "fuel_type": "kerosene"})

        assert isinstance(result, dict)
        assert result["status"] == "no_data"
        assert "hint" in result

    def test_default_fuel_type_is_petrol_95(self):
        from tools.fuel_price import fuel_price

        result = fuel_price.invoke({"country_code": "FR"})

        assert result["status"] == "ok"
        assert result["fuel_type"] == "petrol_95"


# ---------------------------------------------------------------------------
# EstimateTime tests
# ---------------------------------------------------------------------------
class TestEstimateTimeTool:
    def test_happy_path_basic(self):
        from tools.estimate_time import estimate_time

        result = estimate_time.invoke({"distance_km": 100.0})

        assert result["status"] == "ok"
        # 100 km at 80 km/h = 75 minutes
        assert result["driving_minutes"] == 75
        assert result["breaks_minutes"] == 0
        assert result["total_minutes"] == 75
        assert result["hh_mm"] == "01:15"

    def test_with_breaks(self):
        from tools.estimate_time import estimate_time

        result = estimate_time.invoke(
            {"distance_km": 400.0, "avg_speed_kmh": 100.0, "breaks_minutes": 30}
        )

        assert result["status"] == "ok"
        # 400 km at 100 km/h = 240 min driving + 30 min breaks = 270 min = 4:30
        assert result["driving_minutes"] == 240
        assert result["breaks_minutes"] == 30
        assert result["total_minutes"] == 270
        assert result["hh_mm"] == "04:30"

    def test_speed_too_low_returns_invalid_input(self):
        """
        Speed below 5 km/h (schema min) is caught by Pydantic validation at the
        .invoke() layer. The defensive guard in the function body is also correct
        for direct calls. Test both layers here:
        - Direct function call returns {"status": "invalid_input"}
        - .invoke() raises ValidationError (schema guards before function runs)
        """
        from pydantic import ValidationError
        import sys
        import importlib
        importlib.import_module("tools.estimate_time")
        mod = sys.modules["tools.estimate_time"]

        # Direct function call bypasses schema — returns structured dict.
        result = mod.estimate_time.func(distance_km=100.0, avg_speed_kmh=2.0, breaks_minutes=0)
        assert isinstance(result, dict)
        assert result["status"] == "invalid_input"
        assert "hint" in result

        # Via .invoke(), Pydantic schema catches it as a ValidationError.
        with pytest.raises(ValidationError):
            mod.estimate_time.invoke({"distance_km": 100.0, "avg_speed_kmh": 2.0})

    def test_speed_too_high_returns_invalid_input(self):
        """Speed above 200 km/h (schema max) is caught by Pydantic at .invoke()."""
        from pydantic import ValidationError
        import sys
        import importlib
        importlib.import_module("tools.estimate_time")
        mod = sys.modules["tools.estimate_time"]

        # Direct function call — defensive guard returns structured dict.
        result = mod.estimate_time.func(distance_km=100.0, avg_speed_kmh=250.0, breaks_minutes=0)
        assert isinstance(result, dict)
        assert result["status"] == "invalid_input"
        assert "hint" in result

        # Via .invoke(), Pydantic schema catches it.
        with pytest.raises(ValidationError):
            mod.estimate_time.invoke({"distance_km": 100.0, "avg_speed_kmh": 250.0})

    def test_negative_breaks_returns_invalid_input(self):
        """Negative breaks_minutes (schema ge=0) is caught by Pydantic at .invoke()."""
        from pydantic import ValidationError
        import sys
        import importlib
        importlib.import_module("tools.estimate_time")
        mod = sys.modules["tools.estimate_time"]

        # Direct function call — defensive guard returns structured dict.
        result = mod.estimate_time.func(distance_km=100.0, avg_speed_kmh=80.0, breaks_minutes=-5)
        assert isinstance(result, dict)
        assert result["status"] == "invalid_input"

        # Via .invoke(), Pydantic schema catches it.
        with pytest.raises(ValidationError):
            mod.estimate_time.invoke({"distance_km": 100.0, "breaks_minutes": -5})

    def test_hh_mm_format_over_24h(self):
        from tools.estimate_time import estimate_time

        # 2000 km at 80 km/h = 1500 min = 25 hours = 25:00
        result = estimate_time.invoke({"distance_km": 2000.0})

        assert result["status"] == "ok"
        assert result["hh_mm"] == "25:00"
