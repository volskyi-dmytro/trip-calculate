"""Async Postgres access for the fuel-price agent.

The agent shares the Spring app's database and env-var contract:
DATABASE_URL is a JDBC URL; credentials live in DATABASE_USERNAME /
DATABASE_PASSWORD. Everything degrades gracefully when the DB is not
configured — the agent must keep planning routes without fuel data.
"""
import logging
import os
import re
from datetime import datetime
from typing import Optional
from urllib.parse import quote

from psycopg.rows import class_row
from psycopg_pool import AsyncConnectionPool
from pydantic import BaseModel

logger = logging.getLogger(__name__)


class FuelPriceRow(BaseModel):
    country_code: str
    fuel_type: str
    price: float
    currency: str
    source: str
    fetched_at: datetime


class FxRateRow(BaseModel):
    base: str
    quote: str
    rate: float
    fetched_at: datetime


_pool: Optional[AsyncConnectionPool] = None


def pg_dsn() -> Optional[str]:
    url = os.getenv("DATABASE_URL", "")
    m = re.match(r"(?:jdbc:)?postgresql://([^/]+)/([^?]+)", url)
    if not m:
        return None
    hostport, dbname = m.groups()
    user = quote(os.getenv("DATABASE_USERNAME", ""), safe="")
    password = quote(os.getenv("DATABASE_PASSWORD", ""), safe="")
    return f"postgresql://{user}:{password}@{hostport}/{dbname}"


async def open_pool() -> bool:
    """Open the connection pool. Returns False (and leaves the agent
    DB-less) when DATABASE_URL is absent or the DB is unreachable."""
    global _pool
    dsn = pg_dsn()
    if not dsn:
        return False
    try:
        _pool = AsyncConnectionPool(dsn, min_size=1, max_size=4, open=False)
        await _pool.open(wait=True, timeout=10)
        return True
    except Exception as exc:
        _pool = None
        logger.warning("fuel DB pool failed to open: %s", exc)
        return False


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


async def get_fuel_prices(countries: list[str], fuel_type: str) -> list[FuelPriceRow]:
    if _pool is None or not countries:
        return []
    async with _pool.connection() as conn:
        async with conn.cursor(row_factory=class_row(FuelPriceRow)) as cur:
            await cur.execute(
                """SELECT trim(country_code) AS country_code, fuel_type,
                          price::float8 AS price, trim(currency) AS currency,
                          source, fetched_at
                   FROM fuel_prices
                   WHERE fuel_type = %s AND country_code = ANY(%s)""",
                (fuel_type, countries),
            )
            return await cur.fetchall()


async def get_fx_rates() -> list[FxRateRow]:
    if _pool is None:
        return []
    async with _pool.connection() as conn:
        async with conn.cursor(row_factory=class_row(FxRateRow)) as cur:
            await cur.execute(
                """SELECT trim(base) AS base, trim(quote) AS quote,
                          rate::float8 AS rate, fetched_at
                   FROM fx_rates"""
            )
            return await cur.fetchall()


async def upsert_fuel_prices(rows: list[FuelPriceRow]) -> int:
    if _pool is None or not rows:
        return 0
    async with _pool.connection() as conn:
        async with conn.cursor() as cur:
            for r in rows:
                await cur.execute(
                    """INSERT INTO fuel_prices
                           (country_code, fuel_type, price, currency, source, fetched_at)
                       VALUES (%s, %s, %s, %s, %s, %s)
                       ON CONFLICT (country_code, fuel_type) DO UPDATE SET
                           price = EXCLUDED.price, currency = EXCLUDED.currency,
                           source = EXCLUDED.source, fetched_at = EXCLUDED.fetched_at""",
                    (r.country_code, r.fuel_type, r.price, r.currency,
                     r.source, r.fetched_at),
                )
    return len(rows)


async def upsert_fx_rates(rows: list[FxRateRow]) -> int:
    if _pool is None or not rows:
        return 0
    async with _pool.connection() as conn:
        async with conn.cursor() as cur:
            for r in rows:
                await cur.execute(
                    """INSERT INTO fx_rates (base, quote, rate, fetched_at)
                       VALUES (%s, %s, %s, %s)
                       ON CONFLICT (base, quote) DO UPDATE SET
                           rate = EXCLUDED.rate, fetched_at = EXCLUDED.fetched_at""",
                    (r.base, r.quote, r.rate, r.fetched_at),
                )
    return len(rows)
