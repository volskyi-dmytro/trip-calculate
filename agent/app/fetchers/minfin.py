"""Ukraine average fuel prices scraped from index.minfin.com.ua.

No official API exists — this is the fragile source in the failure ladder.
The refresh wrapper keeps serving stale cached rows when this breaks.

Verified live (2026-07): the site serves Russian-language rows by default,
e.g. "Бензин А-95 премиум", "Бензин А-95", "Бензин А-92", "Дизельное
топливо", "Газ автомобильный" — spelled out in full, not the plan's assumed
Ukrainian abbreviations ("А-95+", "ДТ", "Газ"). Critically, the "премиум"
(premium) petrol row is listed BEFORE the plain "А-95" row and also
contains the substring "95", so it must be excluded explicitly or the
higher premium price gets picked up as the plain benchmark.
"""
import re
from datetime import datetime, timezone

import httpx
from bs4 import BeautifulSoup

from ..db import FuelPriceRow

MINFIN_URL = "https://index.minfin.com.ua/markets/fuel/"
_PRICE_RE = re.compile(r"(\d+[.,]\d+)")


def _fuel_type(name: str):
    n = name.strip().lower()
    if any(x in n for x in ("95+", "98", "92", "премиум", "преміум", "premium")):
        return None                      # only the plain A-95 benchmark
    if "95" in n:
        return "petrol"
    if n.startswith(("дт", "дп", "диз")) and "+" not in n:
        return "diesel"
    if "газ" in n:
        return "lpg"
    return None


def parse_minfin(html: str) -> list[FuelPriceRow]:
    soup = BeautifulSoup(html, "html.parser")
    now = datetime.now(timezone.utc)
    rows: dict[str, FuelPriceRow] = {}
    for tr in soup.find_all("tr"):
        cells = [td.get_text(" ", strip=True) for td in tr.find_all(["td", "th"])]
        if len(cells) < 2:
            continue
        fuel = _fuel_type(cells[0])
        if fuel is None or fuel in rows:
            continue
        for cell in cells[1:]:
            m = _PRICE_RE.search(cell)
            if m:
                price = float(m.group(1).replace(",", "."))
                if 10 < price < 200:     # sanity bounds for UAH/litre
                    rows[fuel] = FuelPriceRow(
                        country_code="UA", fuel_type=fuel, price=price,
                        currency="UAH", source="minfin", fetched_at=now,
                    )
                break
    return list(rows.values())


async def fetch_minfin() -> list[FuelPriceRow]:
    async with httpx.AsyncClient(follow_redirects=True) as client:
        resp = await client.get(
            MINFIN_URL, timeout=30.0,
            headers={"User-Agent": "tripcalculate-agent/1.0"},
        )
        resp.raise_for_status()
        return parse_minfin(resp.text)


if __name__ == "__main__":  # manual live-format verification
    import asyncio
    for r in asyncio.run(fetch_minfin()):
        print(r.fuel_type, r.price, r.currency)
