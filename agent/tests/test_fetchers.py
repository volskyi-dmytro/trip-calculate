import io
from datetime import datetime, timezone

import openpyxl
import pytest

from app.fetchers.nbu import parse_nbu
from app.fetchers.oil_bulletin import parse_oil_bulletin
from app.fetchers.minfin import parse_minfin


# ── NBU ─────────────────────────────────────────────────────────────────────

def test_parse_nbu_extracts_usd_eur():
    payload = [
        {"cc": "USD", "rate": 41.8123, "txt": "Долар США"},
        {"cc": "EUR", "rate": 45.6001, "txt": "Євро"},
        {"cc": "PLN", "rate": 10.55, "txt": "Злотий"},
    ]
    rows = parse_nbu(payload)
    assert {(r.base, r.quote) for r in rows} == {("USD", "UAH"), ("EUR", "UAH")}
    usd = next(r for r in rows if r.base == "USD")
    assert usd.rate == pytest.approx(41.8123)
    assert usd.fetched_at.tzinfo is not None


def test_parse_nbu_skips_malformed_entries():
    assert parse_nbu([{"cc": "USD"}, {"rate": 1.0}, "junk"]) == []


# ── EU Oil Bulletin ─────────────────────────────────────────────────────────

def _bulletin_xlsx() -> bytes:
    """Fixture mirroring the REAL Oil Bulletin raw-data layout (verified live
    2026-07): the header row names the fuels, a units row ("1000 l") follows
    it before the data, countries are given as full English names (not ISO2),
    a "Gas oil de chauffage" (heating oil) column also contains the substring
    "gas oil" and must not be mistaken for "Gas oil automobile" (diesel), and
    trailing EUR27/euro-area aggregate rows are not real countries."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Sheet1"
    ws.append([
        "in EUR", "Euro-super 95  (I)",
        "Gas oil automobile Automotive gas oil Dieselkraftstoff (I)",
        " Gas oil de chauffage Heating gas oil Heizöl (II)",
        "GPL pour moteur LPG motor fuel",
    ])
    ws.append([datetime(2026, 7, 6), "1000 l", "1000 l", "1000 l", "1000 l"])  # units row → skipped
    ws.append(["Poland", 1420.55, 1450.10, 999.99, 680.00])
    ws.append(["Germany", 1751.00, 1650.30, 888.88, 980.20])
    ws.append(["Malta", None, None, None, None])   # missing prices → skipped
    ws.append(["CE/EC/EG EUR27_2020 (IV)", 1500, 1500, 1500, 1500])  # aggregate, not a country
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_parse_oil_bulletin_prices_per_liter_eur():
    rows = parse_oil_bulletin(_bulletin_xlsx())
    by_key = {(r.country_code, r.fuel_type): r for r in rows}
    assert by_key[("PL", "petrol")].price == pytest.approx(1.42055)
    assert by_key[("DE", "diesel")].price == pytest.approx(1.65030)
    assert by_key[("PL", "lpg")].price == pytest.approx(0.68)
    assert all(r.currency == "EUR" for r in rows)
    assert all(r.source == "eu_oil_bulletin" for r in rows)
    assert ("MT", "petrol") not in by_key
    assert not any(country not in ("PL", "DE") for country, _ in by_key)


def test_parse_oil_bulletin_empty_workbook_returns_nothing():
    wb = openpyxl.Workbook()
    buf = io.BytesIO()
    wb.save(buf)
    assert parse_oil_bulletin(buf.getvalue()) == []


# ── minfin ──────────────────────────────────────────────────────────────────

# Mirrors the REAL live table (verified 2026-07): full Russian-language
# labels, an empty icon <td> between name and price, and a "премиум"
# (premium) petrol row listed BEFORE the plain "А-95" row it must not shadow.
_MINFIN_HTML = """
<html><body><table>
<tr><th>Вид топлива</th><th>Цена (грн.)</th></tr>
<tr><td>Бензин А-95 премиум</td><td></td><td>78,72</td><td>0.02</td><td>0.025%</td></tr>
<tr><td>Бензин А-95</td><td></td><td>58,90</td><td>0.03</td><td>0.040%</td></tr>
<tr><td>Бензин А-92</td><td></td><td>55,10</td><td>0.13</td><td>0.187%</td></tr>
<tr><td>Дизельное топливо</td><td></td><td>56,50</td><td>0.02</td><td>0.026%</td></tr>
<tr><td>Газ автомобильный</td><td></td><td>33,97</td><td>0.00</td><td>0%</td></tr>
</table></body></html>
"""


def test_parse_minfin_maps_fuel_names():
    rows = parse_minfin(_MINFIN_HTML)
    by_type = {r.fuel_type: r for r in rows}
    assert by_type["petrol"].price == pytest.approx(58.90)   # А-95, not premium/А-92
    assert by_type["diesel"].price == pytest.approx(56.50)
    assert by_type["lpg"].price == pytest.approx(33.97)
    assert all(r.country_code == "UA" and r.currency == "UAH" for r in rows)
    assert all(r.source == "minfin" for r in rows)


def test_parse_minfin_garbage_returns_nothing():
    assert parse_minfin("<html><body>maintenance</body></html>") == []
