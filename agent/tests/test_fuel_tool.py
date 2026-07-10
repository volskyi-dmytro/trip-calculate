from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest

from app.db import FuelPriceRow, FxRateRow
from app.tools.fuel import (
    haversine_km, country_weights, convert_via_uah, compute_fuel_data,
)

NOW = datetime.now(timezone.utc)


def test_haversine_kyiv_lviv_roughly_470km():
    assert haversine_km(50.4501, 30.5234, 49.8397, 24.0297) == pytest.approx(469, abs=15)


def test_country_weights_single_country():
    points = [(50.45, 30.52, "UA"), (49.84, 24.03, "UA")]
    assert country_weights(points) == {"UA": pytest.approx(1.0)}


def test_country_weights_border_leg_splits_5050():
    # One leg UA→PL: each endpoint country gets half the leg
    points = [(49.84, 24.03, "UA"), (52.23, 21.01, "PL")]
    w = country_weights(points)
    assert w["UA"] == pytest.approx(0.5) and w["PL"] == pytest.approx(0.5)


def test_country_weights_skips_unknown_countries():
    points = [(49.84, 24.03, "UA"), (51.0, 22.0, None), (52.23, 21.01, "PL")]
    w = country_weights(points)
    assert set(w) == {"UA", "PL"} and sum(w.values()) == pytest.approx(1.0)


def test_country_weights_empty_when_nothing_attributable():
    assert country_weights([(1.0, 1.0, None), (2.0, 2.0, None)]) == {}
    assert country_weights([(1.0, 1.0, "UA")]) == {}   # no legs


def test_convert_via_uah():
    rates = {"UAH": 1.0, "USD": 41.8, "EUR": 45.6}
    assert convert_via_uah(100.0, "UAH", "UAH", rates) == pytest.approx(100.0)
    assert convert_via_uah(1.0, "EUR", "UAH", rates) == pytest.approx(45.6)
    assert convert_via_uah(45.6, "UAH", "EUR", rates) == pytest.approx(1.0)
    assert convert_via_uah(1.0, "EUR", "USD", rates) == pytest.approx(45.6 / 41.8)
    assert convert_via_uah(1.0, "GBP", "UAH", rates) is None


def _rows(fetched_at=NOW):
    return [
        FuelPriceRow(country_code="UA", fuel_type="petrol", price=58.9,
                     currency="UAH", source="minfin", fetched_at=fetched_at),
        FuelPriceRow(country_code="PL", fuel_type="petrol", price=1.42,
                     currency="EUR", source="eu_oil_bulletin", fetched_at=fetched_at),
    ]


_FX = [FxRateRow(base="USD", quote="UAH", rate=41.8, fetched_at=NOW),
       FxRateRow(base="EUR", quote="UAH", rate=45.6, fetched_at=NOW)]

_POINTS = [(49.84, 24.03, "UA"), (52.23, 21.01, "PL")]


async def test_compute_fuel_data_weighted_and_converted():
    with patch("app.tools.fuel.db.get_fuel_prices", AsyncMock(return_value=_rows())), \
         patch("app.tools.fuel.db.get_fx_rates", AsyncMock(return_value=_FX)):
        fd = await compute_fuel_data(_POINTS, "petrol", "UAH")
    assert fd is not None
    pl_in_uah = 1.42 * 45.6
    assert fd.price_per_liter == pytest.approx(round((58.9 + pl_in_uah) / 2, 2))
    assert fd.currency == "UAH" and fd.fuel_type == "petrol" and fd.stale is False
    assert {c.code for c in fd.countries} == {"UA", "PL"}
    assert sum(c.weight for c in fd.countries) == pytest.approx(1.0, abs=0.01)


async def test_compute_fuel_data_stale_flag():
    old = NOW - timedelta(days=20)
    with patch("app.tools.fuel.db.get_fuel_prices", AsyncMock(return_value=_rows(old))), \
         patch("app.tools.fuel.db.get_fx_rates", AsyncMock(return_value=_FX)):
        fd = await compute_fuel_data(_POINTS, "petrol", "UAH")
    assert fd is not None and fd.stale is True


async def test_compute_fuel_data_renormalizes_over_countries_with_data():
    ua_only = [_rows()[0]]      # no PL row
    with patch("app.tools.fuel.db.get_fuel_prices", AsyncMock(return_value=ua_only)), \
         patch("app.tools.fuel.db.get_fx_rates", AsyncMock(return_value=_FX)):
        fd = await compute_fuel_data(_POINTS, "petrol", "UAH")
    assert fd.price_per_liter == pytest.approx(58.9)
    assert len(fd.countries) == 1 and fd.countries[0].weight == pytest.approx(1.0)


async def test_compute_fuel_data_none_when_no_rows_or_no_weights():
    with patch("app.tools.fuel.db.get_fuel_prices", AsyncMock(return_value=[])), \
         patch("app.tools.fuel.db.get_fx_rates", AsyncMock(return_value=_FX)):
        assert await compute_fuel_data(_POINTS, "petrol", "UAH") is None
    assert await compute_fuel_data([], "petrol", "UAH") is None


async def test_compute_fuel_data_none_when_fx_missing():
    with patch("app.tools.fuel.db.get_fuel_prices",
               AsyncMock(return_value=[_rows()[1]])), \
         patch("app.tools.fuel.db.get_fx_rates", AsyncMock(return_value=[])):
        # EUR row, UAH target, no rates → unconvertible → None
        assert await compute_fuel_data(_POINTS, "petrol", "UAH") is None
