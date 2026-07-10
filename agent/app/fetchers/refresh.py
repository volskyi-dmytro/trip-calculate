"""Daily refresh of the fuel-price and FX caches.

Each source runs inside its own try/except: one source breaking (the minfin
scrape being the likely culprit) must never stop the others — the failure
ladder's rung 1 is 'keep serving the last cached rows'.
"""
import logging

from .. import db
from .minfin import fetch_minfin
from .nbu import fetch_nbu
from .oil_bulletin import fetch_oil_bulletin

logger = logging.getLogger(__name__)


async def refresh_all() -> dict[str, str]:
    results: dict[str, str] = {}

    async def _run(name, fetch, upsert):
        try:
            rows = await fetch()
            # Empty fetch result is not an error — just report ok:0 without
            # calling upsert (avoids spurious DB errors for sources that found nothing)
            if not rows:
                results[name] = "ok:0"
            else:
                count = await upsert(rows)
                results[name] = f"ok:{count}"
        except Exception as exc:
            logger.warning("fuel refresh source %s failed: %s", name, exc)
            results[name] = f"error:{exc}"

    await _run("oil_bulletin", fetch_oil_bulletin, db.upsert_fuel_prices)
    await _run("minfin", fetch_minfin, db.upsert_fuel_prices)
    await _run("nbu", fetch_nbu, db.upsert_fx_rates)
    logger.info("fuel refresh: %s", results)
    return results
