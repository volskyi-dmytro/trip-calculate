"""National Bank of Ukraine daily FX rates (free JSON, no key)."""
from datetime import datetime, timezone

import httpx

from ..db import FxRateRow

NBU_URL = "https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json"
_WANTED = {"USD", "EUR"}


def parse_nbu(payload) -> list[FxRateRow]:
    now = datetime.now(timezone.utc)
    rows: list[FxRateRow] = []
    for item in payload if isinstance(payload, list) else []:
        if not isinstance(item, dict):
            continue
        cc, rate = item.get("cc"), item.get("rate")
        if cc in _WANTED and isinstance(rate, (int, float)) and rate > 0:
            rows.append(FxRateRow(base=cc, quote="UAH", rate=float(rate), fetched_at=now))
    return rows


async def fetch_nbu() -> list[FxRateRow]:
    async with httpx.AsyncClient() as client:
        resp = await client.get(NBU_URL, timeout=15.0)
        resp.raise_for_status()
        return parse_nbu(resp.json())
