import os
import pytest
from datetime import datetime, timezone
from app import db
from app.db import FuelPriceRow, FxRateRow, pg_dsn


# ── pg_dsn (pure) ───────────────────────────────────────────────────────────

def test_pg_dsn_parses_jdbc_url(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "jdbc:postgresql://db-host:5432/tripplanner")
    monkeypatch.setenv("DATABASE_USERNAME", "tripplanner")
    monkeypatch.setenv("DATABASE_PASSWORD", "s3cret")
    assert pg_dsn() == "postgresql://tripplanner:s3cret@db-host:5432/tripplanner"


def test_pg_dsn_urlencodes_password(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "jdbc:postgresql://h:5432/d")
    monkeypatch.setenv("DATABASE_USERNAME", "u")
    monkeypatch.setenv("DATABASE_PASSWORD", "p@ss/w:rd")
    assert pg_dsn() == "postgresql://u:p%40ss%2Fw%3Ard@h:5432/d"


def test_pg_dsn_accepts_plain_postgres_url(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://h:5432/d")
    monkeypatch.setenv("DATABASE_USERNAME", "u")
    monkeypatch.setenv("DATABASE_PASSWORD", "p")
    assert pg_dsn() == "postgresql://u:p@h:5432/d"


def test_pg_dsn_none_when_unset(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    assert pg_dsn() is None


# ── graceful no-DB behavior ─────────────────────────────────────────────────

async def test_reads_return_empty_without_pool():
    assert db._pool is None
    assert await db.get_fuel_prices(["UA"], "petrol") == []
    assert await db.get_fx_rates() == []


async def test_upserts_noop_without_pool():
    row = FuelPriceRow(country_code="UA", fuel_type="petrol", price=58.9,
                       currency="UAH", source="test",
                       fetched_at=datetime.now(timezone.utc))
    assert await db.upsert_fuel_prices([row]) == 0
    assert await db.upsert_fx_rates([]) == 0


# ── round-trip against a real Postgres (opt-in) ────────────────────────────

@pytest.mark.db
@pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL")
async def test_upsert_and_read_roundtrip():
    assert await db.open_pool()
    try:
        now = datetime.now(timezone.utc)
        rows = [FuelPriceRow(country_code="XX", fuel_type="petrol", price=1.5,
                             currency="EUR", source="test", fetched_at=now)]
        assert await db.upsert_fuel_prices(rows) == 1
        got = await db.get_fuel_prices(["XX"], "petrol")
        assert len(got) == 1 and got[0].price == pytest.approx(1.5)
        # Upsert overwrites on conflict
        rows[0].price = 1.6
        await db.upsert_fuel_prices(rows)
        got = await db.get_fuel_prices(["XX"], "petrol")
        assert got[0].price == pytest.approx(1.6)
    finally:
        await db.close_pool()
