from unittest.mock import AsyncMock, patch

from app.fetchers import refresh


async def test_refresh_all_isolates_failures():
    with patch("app.fetchers.refresh.fetch_oil_bulletin",
               AsyncMock(side_effect=RuntimeError("xlsx moved"))), \
         patch("app.fetchers.refresh.fetch_minfin",
               AsyncMock(return_value=["r1", "r2", "r3"])), \
         patch("app.fetchers.refresh.fetch_nbu",
               AsyncMock(return_value=["fx1", "fx2"])), \
         patch("app.fetchers.refresh.db.upsert_fuel_prices",
               AsyncMock(side_effect=lambda rows: len(rows))) as up_fuel, \
         patch("app.fetchers.refresh.db.upsert_fx_rates",
               AsyncMock(side_effect=lambda rows: len(rows))) as up_fx:
        results = await refresh.refresh_all()

    assert results["oil_bulletin"].startswith("error:")
    assert results["minfin"] == "ok:3"
    assert results["nbu"] == "ok:2"
    up_fuel.assert_awaited_once_with(["r1", "r2", "r3"])   # only the working source
    up_fx.assert_awaited_once_with(["fx1", "fx2"])


async def test_refresh_all_isolates_upsert_failures():
    with patch("app.fetchers.refresh.fetch_oil_bulletin",
               AsyncMock(return_value=["r"])), \
         patch("app.fetchers.refresh.fetch_minfin", AsyncMock(return_value=[])), \
         patch("app.fetchers.refresh.fetch_nbu", AsyncMock(return_value=[])), \
         patch("app.fetchers.refresh.db.upsert_fuel_prices",
               AsyncMock(side_effect=RuntimeError("db down"))), \
         patch("app.fetchers.refresh.db.upsert_fx_rates", AsyncMock(return_value=0)):
        results = await refresh.refresh_all()

    assert results["oil_bulletin"].startswith("error:")
    assert results["minfin"] == "ok:0"
    assert results["nbu"] == "ok:0"
