"""Recorded geocoding, so route behaviour is reproducible.

The evaluation target is the agent's LLM-facing contract, not OpenStreetMap's
uptime. Letting live Nominatim into every run would make a red suite ambiguous
— a dropped `via` stop and a rate-limited geocoder look identical in the
report. So by default the suite replays hand-authored, Nominatim-shaped
responses and a query that matches nothing simply fails to geocode, exactly as
a real miss would.

`--geocoder network` restores the real thing for the small labelled smoke path
where hitting OSM is the point.

These recordings are hand-authored fixtures shaped like Nominatim results, not
verbatim captures of live responses. Coordinates are approximate and exist to
make routes plausible, never to assert geographic precision.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Optional

import yaml

RECORDINGS = Path(__file__).parent / "datasets" / "geocode_recordings.v1.yaml"


class RecordedGeocoder:
    """Substitutes app.geocoding._query_nominatim.

    Longest matched needle wins, so "Bucharest Romania" resolves to Bucharest
    rather than to Romania regardless of declaration order — ordering-sensitive
    matching is exactly the kind of silent fixture bug that makes a suite lie.
    """

    def __init__(self, places: list[dict[str, Any]]):
        self._places = places
        self.queries: list[str] = []
        self.misses: list[str] = []

    @classmethod
    def load(cls, path: Path | None = None) -> "RecordedGeocoder":
        raw = yaml.safe_load((path or RECORDINGS).read_text(encoding="utf-8"))
        places = raw["places"]
        for place in places:
            needles = place["match_any"]
            for needle in needles:
                if needle != needle.lower():
                    raise ValueError(
                        f"{place['id']}: match needles must be lowercase, got {needle!r}"
                    )
        return cls(places)

    def find(self, query: str) -> Optional[dict[str, Any]]:
        lowered = query.lower()
        best: Optional[dict[str, Any]] = None
        best_len = 0
        for place in self._places:
            for needle in place["match_any"]:
                if needle in lowered and len(needle) > best_len:
                    best, best_len = place, len(needle)
        return best

    def as_nominatim_result(self, place: dict[str, Any]) -> dict[str, Any]:
        return {
            "place_id": abs(hash(place["id"])) % 10_000_000,
            "lat": str(place["lat"]),
            "lon": str(place["lon"]),
            "display_name": place["display_name"],
            "name": place["name"],
            "type": place.get("type", "city"),
            "class": place.get("class", "place"),
            "importance": place.get("importance", 0.7),
            "address": {
                "country_code": place["country_code"].lower(),
                "country": place.get("country", ""),
            },
        }

    def _nearest(self, lat: float, lon: float) -> Optional[dict[str, Any]]:
        if not self._places:
            return None
        return min(
            self._places,
            key=lambda p: (p["lat"] - lat) ** 2 + (p["lon"] - lon) ** 2,
        )

    def respond(self, url: str, params: dict[str, Any]) -> "_RecordedResponse":
        """Answer one Nominatim HTTP call from the recordings."""
        if "reverse" in url:
            place = self._nearest(float(params["lat"]), float(params["lon"]))
            address = {"country_code": place["country_code"]} if place else {}
            return _RecordedResponse({"address": address})

        query = str(params.get("q", ""))
        self.queries.append(query)
        place = self.find(query)
        if place is None:
            self.misses.append(query)
            return _RecordedResponse([])
        # A LIST, exactly as the search endpoint returns — so the caller's own
        # result filtering actually runs against it.
        return _RecordedResponse([self.as_nominatim_result(place)])

    def httpx_get(self):
        """Replacement for httpx.AsyncClient.get.

        Substituting at the transport boundary rather than swapping out
        app.geocoding._query_nominatim wholesale is deliberate: patching the
        function would skip its result filtering (_is_valid_settlement), its
        POI/city parameter selection and its 418/429 backoff entirely, so a
        regression in any of them would leave the suite green. Intercepting the
        HTTP call keeps all of that real code on the path.
        """
        recorder = self

        async def _get(_client, url, *, params=None, headers=None, timeout=None, **_kw):
            return recorder.respond(str(url), params or {})

        return _get


class _RecordedResponse:
    """The slice of httpx.Response that app.geocoding actually touches."""

    def __init__(self, payload: Any, status_code: int = 200):
        self.status_code = status_code
        self._payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self) -> Any:
        return self._payload
