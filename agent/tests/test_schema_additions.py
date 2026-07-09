import pytest
from pydantic import ValidationError

from app.schema import FuelData, CountryFuelPrice, SettingsContext, ParseRouteRequest


def test_settings_context_defaults():
    ctx = SettingsContext()
    assert ctx.fuel_type == "petrol" and ctx.currency == "UAH"


def test_settings_context_rejects_unknown_values():
    with pytest.raises(ValidationError):
        SettingsContext(fuel_type="kerosene")
    with pytest.raises(ValidationError):
        SettingsContext(currency="GBP")


def test_request_accepts_settings_context():
    req = ParseRouteRequest(message="Kyiv to Lviv",
                            settings_context={"fuel_type": "diesel", "currency": "EUR"})
    assert req.settings_context.fuel_type == "diesel"


def test_fuel_data_serializes():
    fd = FuelData(price_per_liter=1.55, currency="EUR", fuel_type="petrol",
                  countries=[CountryFuelPrice(code="PL", price=1.42, weight=1.0)],
                  source="eu_oil_bulletin", fetched_at="2026-07-07T04:00:00Z")
    dumped = fd.model_dump(mode="json")
    assert dumped["stale"] is False and dumped["countries"][0]["code"] == "PL"
