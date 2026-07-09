"""EU Weekly Oil Bulletin — country-average fuel prices in EUR per 1000 L.

The real published file (verified live 2026-07) is NOT the ISO2-coded sheet
the source description implies: the first column holds full English country
names ("Austria", "Belgium", ...) followed by a row of unit labels ("1000 l",
"t") between the header and the data, and a "Gas oil de chauffage" (heating
oil) column whose header also contains the substring "gas oil" — it must be
told apart from "Gas oil automobile" (road diesel). The parser scans every
sheet for a header row naming the fuels, skips the units row (its first cell
isn't a known country name), and maps full country names to ISO2 codes.
"""
import io
from datetime import datetime, timezone

import httpx
import openpyxl

from ..db import FuelPriceRow

# Stable per-document UUID on energy.ec.europa.eu; the `filename` query param
# is cosmetic (server ignores it) and the endpoint always serves the current
# week's workbook. This is the "with taxes" edition — pump prices actually
# paid by travelers, not the pre-tax "without taxes" edition.
OIL_BULLETIN_URL = (
    "https://energy.ec.europa.eu/document/download/"
    "264c2d0f-f161-4ea3-a777-78faae59bea0_en"
    "?filename=Weekly_Oil_Bulletin_prices_with_taxes.xlsx"
)
# Prices in the raw file are per 1000 litres
PRICE_DIVISOR = 1000.0
# header-substring (lowercase) → our fuel_type. "gas oil automobile" (not
# just "gas oil") is required to avoid matching the heating-oil column
# ("Gas oil de chauffage Heating gas oil").
_FUEL_HEADERS = {
    "euro-super": "petrol",
    "gas oil automobile": "diesel",
    "lpg": "lpg",
}
# The bulletin identifies countries by full English name, not ISO2.
_COUNTRY_CODES = {
    "austria": "AT", "belgium": "BE", "bulgaria": "BG", "croatia": "HR",
    "cyprus": "CY", "czechia": "CZ", "czech republic": "CZ", "denmark": "DK",
    "estonia": "EE", "finland": "FI", "france": "FR", "germany": "DE",
    "greece": "GR", "hungary": "HU", "ireland": "IE", "italy": "IT",
    "latvia": "LV", "lithuania": "LT", "luxembourg": "LU", "malta": "MT",
    "netherlands": "NL", "poland": "PL", "portugal": "PT", "romania": "RO",
    "slovakia": "SK", "slovenia": "SI", "spain": "ES", "sweden": "SE",
}


def _header_columns(row) -> dict[int, str]:
    cols: dict[int, str] = {}
    for idx, cell in enumerate(row):
        text = str(cell or "").lower()
        for needle, fuel in _FUEL_HEADERS.items():
            if needle in text:
                cols[idx] = fuel
    return cols


def parse_oil_bulletin(content: bytes) -> list[FuelPriceRow]:
    wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    now = datetime.now(timezone.utc)
    best: dict[tuple[str, str], FuelPriceRow] = {}
    for ws in wb.worksheets:
        fuel_cols: dict[int, str] = {}
        for row in ws.iter_rows(values_only=True):
            if not fuel_cols:
                fuel_cols = _header_columns(row)
                continue
            country = _COUNTRY_CODES.get(str(row[0] or "").strip().lower())
            if not country:
                continue  # units row, or a EUR27/euro-area aggregate row
            for idx, fuel in fuel_cols.items():
                value = row[idx] if idx < len(row) else None
                if isinstance(value, (int, float)) and value > 0:
                    best[(country, fuel)] = FuelPriceRow(
                        country_code=country, fuel_type=fuel,
                        price=round(float(value) / PRICE_DIVISOR, 5),
                        currency="EUR", source="eu_oil_bulletin", fetched_at=now,
                    )
    return list(best.values())


async def fetch_oil_bulletin() -> list[FuelPriceRow]:
    async with httpx.AsyncClient(follow_redirects=True) as client:
        resp = await client.get(OIL_BULLETIN_URL, timeout=60.0)
        resp.raise_for_status()
        return parse_oil_bulletin(resp.content)


if __name__ == "__main__":  # manual live-format verification
    import asyncio
    rows = asyncio.run(fetch_oil_bulletin())
    for r in sorted(rows, key=lambda r: (r.country_code, r.fuel_type))[:15]:
        print(r.country_code, r.fuel_type, r.price, r.currency)
    print(f"total rows: {len(rows)}")
