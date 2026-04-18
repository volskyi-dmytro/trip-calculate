"""
Tool tests — happy path + failure paths for geocode and route_osrm.

Uses respx to mock httpx calls so no real network requests are made.
Asserts that failure paths return structured dicts with a `status` field,
not raw exceptions — this is CLAUDE.md §Non-negotiable #9.
"""

import json
from unittest.mock import patch

import httpx
import pytest
import respx

# Patch MAPBOX_TOKEN before importing tools to avoid env-check issues.
import os
os.environ.setdefault("MAPBOX_TOKEN", "pk.test-token")
os.environ.setdefault("INTERNAL_JWT_SECRET", "test-secret-32-bytes-xxxxxxxxxx")
os.environ.setdefault("PG_URL", "postgresql://test:test@localhost:5432/test")
os.environ.setdefault("ANTHROPIC_API_KEY", "sk-ant-test")


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
