from datetime import date, datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest

from app.schema import RiskFlag, WeatherSample
from app.tools.weather import (
    SAMPLE_CAP, compute_weather_data, derive_risk_flags, sample_corridor,
)

KYIV = (50.4501, 30.5234, "Kyiv")
LVIV = (49.8397, 24.0297, "Lviv")     # ~469 km from Kyiv
ZHYTOMYR = (50.2547, 28.6587, "Zhytomyr")  # ~120 km from Kyiv
TODAY = datetime.now(timezone.utc).date()


def _sample(**overrides) -> WeatherSample:
    base = dict(lat=50.0, lon=30.0, label=None, temp_max_c=20.0,
                temp_min_c=10.0, precipitation_mm=0.0, snowfall_cm=0.0,
                wind_gust_kmh=20.0, weather_code=1)
    return WeatherSample(**{**base, **overrides})


# ── sample_corridor ─────────────────────────────────────────────────────

def test_single_point_yields_one_labeled_sample():
    assert sample_corridor([KYIV]) == [KYIV]


def test_interpolates_along_leg_every_step():
    # Kyiv→Lviv ~469 km with 100 km step → 4 interpolated points
    samples = sample_corridor([KYIV, LVIV])
    labels = [s[2] for s in samples]
    assert labels[0] == "Kyiv" and labels[-1] == "Lviv"
    assert labels.count(None) == 4
    # Interpolated points lie strictly between the endpoints
    for lat, lon, label in samples:
        if label is None:
            assert LVIV[0] < lat < KYIV[0]
            assert LVIV[1] < lon < KYIV[1]


def test_short_leg_adds_no_interpolation():
    # Kyiv→Zhytomyr ~120 km → 1 interpolated point; step > distance → none
    assert [s[2] for s in sample_corridor([KYIV, ZHYTOMYR], step_km=200.0)] \
        == ["Kyiv", "Zhytomyr"]


def test_cap_drops_interpolated_points_never_waypoints():
    # Kyiv→Lisbon-ish: one very long leg would interpolate dozens of points
    lisbon = (38.7223, -9.1393, "Lisbon")
    samples = sample_corridor([KYIV, LVIV, lisbon], cap=10)
    assert len(samples) <= 10
    labels = [s[2] for s in samples if s[2] is not None]
    assert labels == ["Kyiv", "Lviv", "Lisbon"]


def test_more_waypoints_than_cap_keeps_first_cap_in_order():
    many = [(50.0 + i * 0.01, 30.0, f"Stop{i}") for i in range(25)]
    samples = sample_corridor(many, cap=SAMPLE_CAP)
    assert len(samples) == SAMPLE_CAP
    assert samples == many[:SAMPLE_CAP]


def test_empty_points_yield_empty():
    assert sample_corridor([]) == []


# ── derive_risk_flags ───────────────────────────────────────────────────

def test_clear_day_has_no_flags():
    assert derive_risk_flags([_sample()]) == []


def test_each_threshold_boundary():
    assert derive_risk_flags([_sample(snowfall_cm=0.1)]) == [RiskFlag(type="snow")]
    assert derive_risk_flags([_sample(precipitation_mm=14.9)]) == []
    assert derive_risk_flags([_sample(precipitation_mm=15.0)]) == [RiskFlag(type="heavy_rain")]
    assert derive_risk_flags([_sample(wind_gust_kmh=59.9)]) == []
    assert derive_risk_flags([_sample(wind_gust_kmh=60.0)]) == [RiskFlag(type="strong_wind")]
    # ice needs BOTH freezing minimum and precipitation
    assert derive_risk_flags([_sample(temp_min_c=-2.0)]) == []
    assert derive_risk_flags([_sample(temp_min_c=0.0, precipitation_mm=1.0)]) \
        == [RiskFlag(type="ice_risk")]
    assert derive_risk_flags([_sample(weather_code=95)]) == [RiskFlag(type="storm")]
    assert derive_risk_flags([_sample(weather_code=94)]) == []


def test_flags_collapse_per_type_keeping_worst_instance():
    flags = derive_risk_flags([
        _sample(label="Kyiv", wind_gust_kmh=65.0),
        _sample(label="Rivne", wind_gust_kmh=90.0),
    ])
    assert flags == [RiskFlag(type="strong_wind", near="Rivne")]


def test_flag_on_unlabeled_sample_names_nearest_labeled_stop():
    flags = derive_risk_flags([
        _sample(label="Kyiv"),
        _sample(label=None, snowfall_cm=2.0),
        _sample(label=None),
        _sample(label="Lviv"),
    ])
    assert flags == [RiskFlag(type="snow", near="Kyiv")]


# ── compute_weather_data ────────────────────────────────────────────────

def _forecast_row(**daily_overrides):
    daily = {
        "time": [TODAY.isoformat()],
        "temperature_2m_max": [21.5], "temperature_2m_min": [11.0],
        "precipitation_sum": [0.0], "snowfall_sum": [0.0],
        "wind_gusts_10m_max": [25.0], "weather_code": [2],
    }
    for key, value in daily_overrides.items():
        daily[key] = [value]
    return {"daily": daily}


async def test_happy_path_builds_weather_data():
    rows = [_forecast_row(), _forecast_row(), _forecast_row()]
    with patch("app.tools.weather.fetch_forecast", new=AsyncMock(return_value=rows)):
        result = await compute_weather_data([KYIV, ZHYTOMYR], TODAY)
    assert result is not None
    assert result.date == TODAY.isoformat()
    assert result.source == "open-meteo"
    # Kyiv→Zhytomyr ~120 km → 1 interpolated → 3 samples
    assert [s.label for s in result.samples] == ["Kyiv", None, "Zhytomyr"]
    assert result.samples[0].temp_max_c == 21.5
    assert result.risk_flags == []


async def test_fetch_failure_returns_none():
    with patch("app.tools.weather.fetch_forecast",
               new=AsyncMock(side_effect=RuntimeError("boom"))):
        assert await compute_weather_data([KYIV, LVIV], TODAY) is None


async def test_date_outside_window_returns_none_without_fetching():
    fetch = AsyncMock()
    with patch("app.tools.weather.fetch_forecast", new=fetch):
        assert await compute_weather_data([KYIV], TODAY + timedelta(days=17)) is None
        assert await compute_weather_data([KYIV], TODAY - timedelta(days=1)) is None
    fetch.assert_not_awaited()


async def test_empty_points_return_none():
    assert await compute_weather_data([], TODAY) is None


async def test_null_forecast_values_skip_that_sample_only():
    rows = [_forecast_row(), _forecast_row(temperature_2m_max=None),
            _forecast_row()]
    with patch("app.tools.weather.fetch_forecast", new=AsyncMock(return_value=rows)):
        result = await compute_weather_data([KYIV, ZHYTOMYR], TODAY)
    assert result is not None
    assert [s.label for s in result.samples] == ["Kyiv", "Zhytomyr"]


async def test_all_samples_null_returns_none():
    rows = [_forecast_row(temperature_2m_max=None)]
    with patch("app.tools.weather.fetch_forecast", new=AsyncMock(return_value=rows)):
        assert await compute_weather_data([KYIV], TODAY) is None
