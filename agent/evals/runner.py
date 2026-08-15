"""Evaluation runner.

Two modes, and the difference matters:

* ``mock``  — no API key, no network. Canned model outputs are fed through the
  *real* graph (supervisor, routing edges, geocoding node, composer) and the
  *real* scorers. It proves the plumbing and the scoring logic, and it is what
  blocks CI. It cannot tell you whether the model is any good, because the
  model's answer is supplied by the fixture.
* ``live``  — real ``OPENAI_API_KEY``, real model, real parsing path. This is
  the mode that detects a prompt or model regression. It never silently falls
  back to mocked results.

Geocoding is replayed from recorded fixtures in both modes by default, so a
red run means the agent changed rather than that OpenStreetMap was slow. Fuel
and weather enrichment are stubbed out: both are deterministic, advisory, and
already covered by their own unit tests, and leaving them live would put an
external HTTP call on every case.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import subprocess
import sys
import time
from contextlib import ExitStack
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Optional
from unittest.mock import patch

from pydantic import BaseModel, Field

from .geocoder import RecordedGeocoder
from .loader import discover, file_sha256, load_dataset
from .models import CarCase, CarDataset, RouteCase, RouteDataset
from .scoring import (
    CarObservation, CaseResult, ObservedStop, RouteObservation,
    aggregate, score_car_case, score_route_case,
)

DEFAULT_MODEL = "gpt-4o-mini-2024-07-18"
RESULTS_DIR = Path(__file__).parent / "results"

# USD per token. Verified against Langfuse-reported totalCost on this
# project's own production generations (543 in / 40 out -> $0.00010545).
_PRICING = {
    "gpt-4o-mini": (0.15 / 1_000_000, 0.60 / 1_000_000),
    "gpt-4o-mini-2024-07-18": (0.15 / 1_000_000, 0.60 / 1_000_000),
}


class MissingCredentials(RuntimeError):
    """Raised when live mode is requested without an API key. Live mode must
    never quietly degrade to mocks — a green run that never called the model
    is worse than no run."""


def require_live_credentials(mode: str, env: Optional[dict[str, str]] = None) -> None:
    env = os.environ if env is None else env
    if mode != "live":
        return
    if not (env.get("OPENAI_API_KEY") or "").strip():
        raise MissingCredentials(
            "live mode needs a real OPENAI_API_KEY; refusing to fall back to "
            "mocked results. Export the key or run with --mode mock."
        )


# ── Mocked model ───────────────────────────────────────────────────────────

class _MockParsed:
    """Mimics the shape openai returns from beta.chat.completions.parse."""

    def __init__(self, parsed: Any):
        message = type("_Msg", (), {"parsed": parsed})()
        self.choices = [type("_Choice", (), {"message": message})()]
        self.usage = None


def render_template(payload: Any, today: date) -> Any:
    """Resolve ``{{today+N}}`` / ``{{today-N}}`` placeholders.

    Fixtures cannot hard-code an ISO departure date: a committed date silently
    rots into the past and the case starts failing for calendar reasons rather
    than behavioural ones.
    """
    if isinstance(payload, dict):
        return {k: render_template(v, today) for k, v in payload.items()}
    if isinstance(payload, list):
        return [render_template(v, today) for v in payload]
    if isinstance(payload, str) and payload.startswith("{{today"):
        body = payload.strip("{}").removeprefix("today")
        offset = int(body) if body else 0
        from datetime import timedelta

        return (today + timedelta(days=offset)).isoformat()
    return payload


class _MockLLM:
    """Stands in for app.nodes._openai_client in mock mode.

    Dispatch is by requested response_format, and repeated ParsedRoute calls
    walk parser -> retry, mirroring the graph's own call order.
    """

    def __init__(self, case: RouteCase | CarCase, today: date):
        self._case = case
        self._today = today
        self._parsed_route_calls = 0
        self.beta = type("_Beta", (), {"chat": self})()
        self.chat = self
        self.completions = self

    async def parse(self, *, response_format, **_kw):
        from app.schema import CarEstimate, ParsedRoute, SupervisorDecision

        mock = self._case.mock
        if mock is None:
            raise RuntimeError(f"case {self._case.id!r} has no mock block")

        if response_format is SupervisorDecision:
            if getattr(mock, "supervisor", None) is None:
                raise RuntimeError(f"case {self._case.id!r} has no mock.supervisor")
            return _MockParsed(SupervisorDecision.model_validate(mock.supervisor))

        if response_format is ParsedRoute:
            self._parsed_route_calls += 1
            if self._parsed_route_calls == 1:
                payload = getattr(mock, "parser", None)
                slot = "parser"
            else:
                payload = getattr(mock, "retry", None)
                slot = "retry"
            if payload is None:
                raise RuntimeError(
                    f"case {self._case.id!r} has no mock.{slot} — the graph made a "
                    f"parser call this fixture does not expect"
                )
            return _MockParsed(
                ParsedRoute.model_validate(render_template(payload, self._today))
            )

        if response_format is CarEstimate:
            payload = getattr(mock, "estimate", None)
            if payload is None:
                raise RuntimeError(f"case {self._case.id!r} has no mock.estimate")
            return _MockParsed(CarEstimate.model_validate(payload))

        raise RuntimeError(f"unexpected response_format {response_format!r}")


class _UsageRecorder:
    """Wraps the real client in live mode to accumulate token usage, which the
    graph itself does not surface."""

    def __init__(self, inner):
        self._inner = inner
        self.usage: dict[str, int] = {"input": 0, "output": 0, "total": 0}
        self.model: Optional[str] = None
        # Privacy-safe call summaries for post-run observability. Prompts and
        # outputs deliberately never enter this structure.
        self.calls: list[dict[str, Any]] = []
        self.beta = type("_Beta", (), {"chat": self})()
        self.chat = self
        self.completions = self

    async def parse(self, **kwargs):
        started = time.monotonic()
        response = await self._inner.beta.chat.completions.parse(**kwargs)
        usage = getattr(response, "usage", None)
        model = getattr(response, "model", None)
        if usage is not None:
            call_usage = {
                "input": getattr(usage, "prompt_tokens", 0) or 0,
                "output": getattr(usage, "completion_tokens", 0) or 0,
                "total": getattr(usage, "total_tokens", 0) or 0,
            }
            for key, value in call_usage.items():
                self.usage[key] += value
            call = {
                "operation": getattr(kwargs.get("response_format"), "__name__", "structured_parse"),
                "model": model,
                "input_tokens": call_usage["input"],
                "output_tokens": call_usage["output"],
                "total_tokens": call_usage["total"],
                "latency_s": round(time.monotonic() - started, 3),
            }
            cost = _cost_usd(model, call_usage)
            if cost is not None:
                call["cost_usd"] = cost
            self.calls.append(call)
        self.model = model or self.model
        return response


def _cost_usd(model: Optional[str], usage: dict[str, int]) -> Optional[float]:
    if not model:
        return None
    for known, (per_in, per_out) in _PRICING.items():
        if model.startswith(known):
            return usage.get("input", 0) * per_in + usage.get("output", 0) * per_out
    return None


# ── Environment patching ───────────────────────────────────────────────────

class _NullLangfuseClient:
    """Absorbs the nodes' best-effort operational events during a run."""

    def create_event(self, **_kw) -> None:
        return None


def _NullLangfuse():  # matches the get_client() call shape in app.nodes
    return _NullLangfuseClient()


def _build_live_client():
    """Use the provider SDK without Langfuse's OpenAI auto-instrumentation.

    Evaluation calls are exported once, under the privacy-safe post-run
    hierarchy. Reusing app.nodes._openai_client here would additionally emit
    orphan generations while no evaluation root is active and double-count
    tokens and cost in Langfuse.
    """
    from openai import AsyncOpenAI

    return AsyncOpenAI()


def _patches(stack: ExitStack, geocoder: Optional[RecordedGeocoder], client: Any):
    """Install the substitutions a reproducible run needs."""
    async def _no_weather(*_a, **_kw):
        return None

    async def _no_fuel(*_a, **_kw):
        return None

    # Advisory enrichment is deterministic and separately tested; live HTTP
    # here would add latency and flakiness to every single case.
    stack.enter_context(patch("app.nodes.compute_weather_data", _no_weather))
    stack.enter_context(patch("app.nodes.compute_fuel_data", _no_fuel))

    # The nodes emit operational events (supervisor_timeout, route_shape) onto
    # whatever Langfuse trace is current. During an evaluation there is none,
    # so a configured Langfuse would receive a stray orphan trace per case and
    # pollute production telemetry with synthetic traffic. The run publishes
    # its own dedicated evaluation trace afterwards instead.
    stack.enter_context(patch("app.nodes.get_client", _NullLangfuse))

    if geocoder is not None:
        # Intercepted at the HTTP boundary, not at _query_nominatim: this keeps
        # the real result filtering, parameter selection, backoff and
        # reverse-lookup code on the path, so a regression in app/geocoding.py
        # still turns the suite red.
        import httpx

        stack.enter_context(patch.object(httpx.AsyncClient, "get", geocoder.httpx_get()))

    if client is not None:
        stack.enter_context(patch("app.nodes._openai_client", client))


# ── Case execution ─────────────────────────────────────────────────────────

async def run_route_case(
    case: RouteCase, mode: str, geocoder: Optional[RecordedGeocoder], today: date,
    provider_client: Any = None,
) -> RouteObservation:
    from app.graph import build_graph
    from app.nodes import _openai_client as real_client
    from app.schema import CurrentWaypoint, SettingsContext

    client: Any
    recorder: Optional[_UsageRecorder] = None
    if mode == "mock":
        client = _MockLLM(case, today)
    else:
        recorder = _UsageRecorder(provider_client or real_client)
        client = recorder

    state = {
        "message": case.input.message,
        "language": case.input.language,
        "user_id": f"eval-{case.id}",
        "current_route": [
            CurrentWaypoint(name=w.name, latitude=w.latitude, longitude=w.longitude)
            for w in (case.input.current_route or [])
        ] or None,
        "parsed": None,
        "geocoded": [],
        "response": None,
        "error": None,
        "retry_count": 0,
        "settings_context": (
            SettingsContext(**case.input.settings_context.model_dump())
            if case.input.settings_context else None
        ),
        "fuel_data": None,
        "weather_data": None,
        "intent": None,
    }

    started = time.monotonic()
    try:
        with ExitStack() as stack:
            _patches(stack, geocoder, client)
            final = await build_graph().ainvoke(state)
        raw_error = None
    except Exception as exc:  # a runner failure, not an agent verdict
        return RouteObservation(
            success=False, latency_s=time.monotonic() - started,
            raw_error=f"{type(exc).__name__}: {exc}",
        )
    latency = time.monotonic() - started

    response = final.get("response")
    geocoded = final.get("geocoded") or []
    parsed = final.get("parsed")

    stops: list[ObservedStop] = []
    settings: dict[str, Any] = {}
    if response is not None and response.route is not None:
        waypoints = response.route.waypoints
        last = len(waypoints) - 1
        stops = [
            ObservedStop(
                name=w.name,
                type="origin" if i == 0 else "destination" if i == last else "waypoint",
                latitude=w.latitude, longitude=w.longitude,
            )
            for i, w in enumerate(waypoints)
        ]
        settings = response.route.settings.model_dump()

    usage = recorder.usage if recorder else {}
    model = (recorder.model if recorder else None) or (
        DEFAULT_MODEL if mode == "live" else "mock"
    )

    return RouteObservation(
        intent=final.get("intent"),
        route_request=getattr(parsed, "is_route_request", None),
        success=bool(response and response.success),
        error=(response.error if response else None),
        message=(response.message if response else None),
        stops=stops,
        settings=settings,
        # The graph only permits model coordinates on the retry pass; anything
        # else is a first-pass acceptance and a hard failure.
        unsafe_ai_coords=sum(
            1 for loc in geocoded if loc.source == "ai_provided" and not loc.recovered
        ),
        recovered=sum(1 for loc in geocoded if loc.recovered),
        geocode_failures=sum(1 for loc in geocoded if loc.source == "failed"),
        latency_s=round(latency, 3),
        usage=usage,
        model_calls=recorder.calls if recorder else [],
        cost_usd=_cost_usd(model, usage) if usage else None,
        model=model,
        # Same evidence-of-a-real-call guard the car path uses: supervise()
        # and parse_locations() also swallow provider errors and degrade.
        raw_error=raw_error or _no_model_call(mode, usage),
    )


async def run_car_case(
    case: CarCase, mode: str, today: date, provider_client: Any = None,
) -> CarObservation:
    from app.nodes import _openai_client as real_client, estimate_car

    recorder: Optional[_UsageRecorder] = None
    if mode == "mock":
        client: Any = _MockLLM(case, today)
    else:
        recorder = _UsageRecorder(provider_client or real_client)
        client = recorder

    started = time.monotonic()
    try:
        with patch("app.nodes._openai_client", client):
            result = await estimate_car(case.input.description, case.input.language)
    except Exception as exc:
        return CarObservation(
            unknown=True, latency_s=time.monotonic() - started,
            raw_error=f"{type(exc).__name__}: {exc}",
        )
    latency = time.monotonic() - started

    usage = recorder.usage if recorder else {}
    model = (recorder.model if recorder else None) or (
        DEFAULT_MODEL if mode == "live" else "mock"
    )
    return CarObservation(
        unknown=result.unknown,
        fuel_type=result.fuelType,
        consumption=result.consumptionL100km,
        make_model=result.makeModel,
        latency_s=round(latency, 3),
        usage=usage,
        model_calls=recorder.calls if recorder else [],
        cost_usd=_cost_usd(model, usage) if usage else None,
        model=model,
        raw_error=_no_model_call(mode, usage),
    )


def _no_model_call(mode: str, usage: dict) -> Optional[str]:
    """Flag a live observation that burned no tokens.

    estimate_car() and supervise() both swallow provider errors and degrade
    gracefully — correct for the product, but it means a live run could score a
    clean pass having never reached the model. Token usage is the only reliable
    evidence a call actually happened, so a live case with none is treated as
    inconclusive rather than passing.
    """
    if mode != "live":
        return None
    if usage.get("total"):
        return None
    return ("no model call was recorded for this live case (0 tokens) — the "
            "provider call failed and was swallowed; result is inconclusive")


# ── Run orchestration ──────────────────────────────────────────────────────

class DatasetRef(BaseModel):
    name: str
    version: str
    kind: str
    sha256: str
    cases: int


class RunReport(BaseModel):
    mode: str
    model: str
    git_sha: Optional[str] = None
    geocoder: str
    started_at: str
    finished_at: str
    duration_s: float
    datasets: list[DatasetRef] = Field(default_factory=list)
    metrics: dict[str, Optional[float]] = Field(default_factory=dict)
    per_dataset: dict[str, dict[str, Optional[float]]] = Field(default_factory=dict)
    results: list[CaseResult] = Field(default_factory=list)
    skipped: list[str] = Field(default_factory=list)
    total_cost_usd: Optional[float] = None
    total_tokens: int = 0


def _git_sha() -> Optional[str]:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=Path(__file__).resolve().parents[2], stderr=subprocess.DEVNULL,
            text=True,
        ).strip()
    except Exception:
        return None


async def run(
    mode: str,
    dataset_filter: Optional[str] = None,
    case_filter: Optional[str] = None,
    use_network_geocoder: bool = False,
    today: Optional[date] = None,
) -> RunReport:
    require_live_credentials(mode)
    today = today or datetime.now(timezone.utc).date()
    geocoder = None if use_network_geocoder else RecordedGeocoder.load()

    # Module-level country cache in app.geocoding would otherwise carry
    # attributions between runs and make results order-dependent.
    from app.geocoding import _country_cache

    _country_cache.clear()

    started_at = datetime.now(timezone.utc)
    started = time.monotonic()

    refs: list[DatasetRef] = []
    results: list[CaseResult] = []
    skipped: list[str] = []
    per_dataset: dict[str, dict[str, Optional[float]]] = {}
    # One connection pool for the whole run. This is intentionally the plain
    # provider client; see _build_live_client for why the production app's
    # instrumented client is not reused here.
    live_client = _build_live_client() if mode == "live" else None

    for path in discover():
        if dataset_filter and dataset_filter not in path.name:
            continue
        dataset = load_dataset(path)
        refs.append(DatasetRef(
            name=path.name, version=dataset.version, kind=dataset.kind,
            sha256=file_sha256(path), cases=len(dataset.cases),
        ))
        dataset_results: list[CaseResult] = []
        for case in dataset.cases:
            if case_filter and case_filter != case.id:
                continue
            if mode == "mock" and case.mock is None:
                # Contract mode can only exercise a case that declares the
                # model output it stands in for. Silently passing it would
                # overstate coverage.
                skipped.append(f"{path.name}:{case.id} (no mock block)")
                continue
            if isinstance(dataset, RouteDataset):
                obs = await run_route_case(
                    case, mode, geocoder, today, live_client)  # type: ignore[arg-type]
                dataset_results.append(score_route_case(case, obs, today))  # type: ignore[arg-type]
            elif isinstance(dataset, CarDataset):
                obs_car = await run_car_case(
                    case, mode, today, live_client)  # type: ignore[arg-type]
                dataset_results.append(score_car_case(case, obs_car))  # type: ignore[arg-type]
        if dataset_results:
            per_dataset[path.name] = aggregate(dataset_results)
        results.extend(dataset_results)

    finished_at = datetime.now(timezone.utc)
    total_cost = sum(
        c for c in (r.diagnostics.get("cost_usd") for r in results) if c
    ) or None
    total_tokens = sum(
        int(r.diagnostics.get("tokens") or 0) for r in results
    )

    return RunReport(
        mode=mode,
        model=DEFAULT_MODEL if mode == "live" else "mock",
        git_sha=_git_sha(),
        geocoder="network" if use_network_geocoder else "recorded",
        started_at=started_at.isoformat(),
        finished_at=finished_at.isoformat(),
        duration_s=round(time.monotonic() - started, 3),
        datasets=refs,
        metrics=aggregate(results),
        per_dataset=per_dataset,
        results=results,
        skipped=skipped,
        total_cost_usd=total_cost,
        total_tokens=total_tokens,
    )


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m evals.runner",
        description="Run the TripCalculate route-intelligence evaluation suite.",
    )
    parser.add_argument("--mode", choices=["mock", "live"], default="mock",
                        help="mock: no API key, canned model output (CI gate). "
                             "live: real OPENAI_API_KEY and real model calls.")
    parser.add_argument("--dataset", help="substring filter on dataset filename")
    parser.add_argument("--case-id", help="run a single case by id")
    parser.add_argument("--geocoder", choices=["recorded", "network"], default="recorded",
                        help="'network' hits real Nominatim; only useful for a "
                             "deliberate geocoding smoke check.")
    parser.add_argument("--baseline", type=Path,
                        help="a previous results JSON to compare this run against")
    parser.add_argument("--out", type=Path, default=RESULTS_DIR,
                        help="output directory for the JSON and Markdown reports")
    parser.add_argument("--fail-under", type=float, default=None,
                        help="exit non-zero if the case pass rate falls below this")
    args = parser.parse_args(argv)

    try:
        require_live_credentials(args.mode)
    except MissingCredentials as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    # app.nodes builds an AsyncOpenAI client at import time, which refuses an
    # empty key. Mock mode never issues a request, so a placeholder is safe —
    # and live mode has already been checked above.
    os.environ.setdefault("OPENAI_API_KEY", "sk-eval-mock-not-used")

    report = asyncio.run(run(
        mode=args.mode,
        dataset_filter=args.dataset,
        case_filter=args.case_id,
        use_network_geocoder=args.geocoder == "network",
    ))

    from .report import render_markdown, write_reports

    # Read the baseline BEFORE writing: write_reports refreshes
    # latest-<mode>.json, so pinning that file as the baseline would otherwise
    # compare the run against itself and report a flat "no change".
    baseline = None
    if args.baseline and args.baseline.exists():
        baseline = RunReport.model_validate_json(args.baseline.read_text())

    json_path, md_path = write_reports(report, args.out)

    print(render_markdown(report, baseline))
    print(f"\nwrote {json_path}\nwrote {md_path}")

    from .langfuse_adapter import publish

    published = publish(report)
    if published.status == "published":
        print(f"Langfuse publish: published trace {published.trace_id}")
        if published.url:
            print(f"Langfuse trace: {published.url}")
    elif published.status == "submitted_unverified":
        print(f"{published.message}: {published.trace_id}", file=sys.stderr)
        if published.url:
            print(f"Langfuse trace: {published.url}", file=sys.stderr)
    else:
        # Best-effort observability remains non-blocking, but it must never be
        # invisible in a release log again.
        print(published.message, file=sys.stderr)

    return exit_code(report, args.fail_under)


def exit_code(report: RunReport, fail_under: Optional[float] = None) -> int:
    """0 only when the run met its bar.

    Two independent gates. Accepting model-invented coordinates fails the run
    outright whatever the pass rate — it is a safety invariant, not a quality
    score. The pass-rate bar is 100% unless --fail-under explicitly relaxes it,
    which an explicitly exploratory live run may want. The production release
    workflow deliberately keeps the 100% bar.
    """
    if report.metrics.get("unsafe_ai_coords"):
        print("FAIL: model-provided coordinates were accepted on a first "
              "geocoding pass", file=sys.stderr)
        return 1

    pass_rate = report.metrics.get("case_pass_rate")
    if pass_rate is None:
        print("FAIL: no cases ran — check --dataset / --case-id filters",
              file=sys.stderr)
        return 1

    threshold = 1.0 if fail_under is None else fail_under
    if pass_rate < threshold:
        print(f"FAIL: case pass rate {pass_rate:.3f} below required {threshold}",
              file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
