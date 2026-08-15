"""Report rendering.

Two artefacts per run: a machine-readable JSON blob (the baseline format) and
a Markdown summary a human can read in a terminal or paste into a PR. Both
land in an ignored directory — generated run output is never committed.

The Markdown leads with the failures, because a report whose first screen is
green percentages buries the one thing the reader needs.
"""
from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:  # pragma: no cover
    from .runner import RunReport

# Order matters: these are the headline dimensions, most load-bearing first.
_HEADLINE = [
    ("case_pass_rate", "End-to-end case pass rate"),
    ("waypoint_retention_rate", "Explicit waypoint retention"),
    ("intent_accuracy", "Supervisor intent accuracy"),
    ("route_request_accuracy", "Route-request classification"),
    ("ordered_stops_rate", "Ordered-stop correctness"),
    ("settings_rate", "Settings extraction"),
    ("current_route_preservation_rate", "Current-route preservation"),
    ("usable_route_rate", "Usable route / geocode success"),
    ("departure_date_rate", "Departure-date correctness"),
    ("classification_accuracy", "Car recognized/unknown classification"),
    ("fuel_type_accuracy", "Car fuel-type accuracy"),
    ("consumption_in_range_rate", "Car consumption in range"),
]


def _pct(value: Optional[float]) -> str:
    return "n/a" if value is None else f"{value * 100:.1f}%"


def _delta(current: Optional[float], baseline: Optional[float]) -> str:
    if current is None or baseline is None:
        return ""
    diff = (current - baseline) * 100
    if abs(diff) < 0.05:
        return " (=)"
    return f" ({diff:+.1f}pp)"


def _latencies(report: "RunReport") -> tuple[Optional[float], Optional[float]]:
    values = sorted(
        v for v in (r.diagnostics.get("latency_s") for r in report.results)
        if isinstance(v, (int, float))
    )
    if not values:
        return None, None
    def q(p: float) -> float:
        idx = min(len(values) - 1, int(round((len(values) - 1) * p)))
        return values[idx]
    return q(0.5), q(0.95)


def render_markdown(report: "RunReport", baseline: Optional["RunReport"] = None) -> str:
    lines: list[str] = []
    a = lines.append

    a(f"# Route intelligence evaluation — `{report.mode}` mode")
    a("")
    a(f"- **Git SHA**: `{report.git_sha or 'unknown'}`")
    a(f"- **Model**: `{report.model}`")
    a(f"- **Geocoder**: `{report.geocoder}`")
    a(f"- **Started**: {report.started_at}  ·  **Duration**: {report.duration_s}s")
    for d in report.datasets:
        a(f"- **Dataset** `{d.name}` v`{d.version}` "
          f"(`{d.kind}`, {d.cases} cases, sha256 `{d.sha256}`)")
    p50, p95 = _latencies(report)
    if p50 is not None:
        a(f"- **Per-case latency**: p50 {p50:.2f}s · p95 {p95:.2f}s")
    if report.total_cost_usd:
        a(f"- **Cost**: ${report.total_cost_usd:.4f}")
    if baseline:
        a(f"- **Baseline**: `{baseline.git_sha or 'unknown'}` "
          f"(`{baseline.mode}`, model `{baseline.model}`)")
        current_hashes = {d.name: d.sha256 for d in report.datasets}
        for d in baseline.datasets:
            if current_hashes.get(d.name) not in (None, d.sha256):
                a(f"  - ⚠️ dataset `{d.name}` changed since the baseline "
                  f"(`{d.sha256}` → `{current_hashes[d.name]}`) — scores are "
                  f"not directly comparable")
    a("")

    if report.mode == "mock":
        a("> Contract mode: model output comes from the fixtures, so this run "
          "validates the graph wiring and the scoring logic, **not** model "
          "quality. Run `--mode live` to detect a prompt or model regression.")
        a("")

    # ── Failures first ────────────────────────────────────────────────────
    failures = [r for r in report.results if not r.passed]
    if failures:
        a(f"## ❌ {len(failures)} failing case(s)")
        a("")
        for r in failures:
            a(f"### `{r.id}` ({r.kind})")
            diag = r.diagnostics
            probe = diag.get("message") or diag.get("description")
            a(f"- **Input**: `{probe}`" + (f" (`{diag.get('language')}`)" if diag.get("language") else ""))
            if diag.get("observed_stops") is not None:
                a(f"- **Observed stops**: `{diag['observed_stops']}`")
            if diag.get("observed_intent") is not None:
                a(f"- **Observed intent**: `{diag['observed_intent']}`")
            if diag.get("observed_settings"):
                a(f"- **Observed settings**: `{diag['observed_settings']}`")
            if diag.get("observed") is not None:
                a(f"- **Observed estimate**: `{diag['observed']}`")
            if diag.get("observed_error"):
                a(f"- **Observed error**: `{diag['observed_error']}`")
            if diag.get("runner_error"):
                a(f"- **Runner error**: `{diag['runner_error']}`")
            a("- **Failed assertions**:")
            for c in r.failed_checks:
                a(f"  - `{c.name}` — {c.detail}")
            a("")
    else:
        a("## ✅ All cases passed")
        a("")

    # ── Metrics ───────────────────────────────────────────────────────────
    a("## Metrics")
    a("")
    header = "| Metric | Value |" + (" Baseline |" if baseline else "")
    a(header)
    a("|---|---|" + ("---|" if baseline else ""))
    for key, label in _HEADLINE:
        value = report.metrics.get(key)
        row = f"| {label} | {_pct(value)}"
        if baseline:
            base = baseline.metrics.get(key)
            row += f"{_delta(value, base)} | {_pct(base)} |"
        else:
            row += " |"
        a(row)

    retained = int(report.metrics.get("waypoints_retained") or 0)
    requested = int(report.metrics.get("waypoints_requested") or 0)
    a(f"| Transit stops retained | {retained}/{requested} |"
      + (" |" if baseline else ""))
    unsafe = int(report.metrics.get("unsafe_ai_coords") or 0)
    a(f"| Unsafe accepted model coordinates | {unsafe} "
      f"{'✅' if unsafe == 0 else '❌ must be zero'} |" + (" |" if baseline else ""))
    a(f"| Cases | {int(report.metrics.get('cases') or 0)} |"
      + (" |" if baseline else ""))
    a("")

    if len(report.per_dataset) > 1:
        a("### Per dataset")
        a("")
        a("| Dataset | Cases | Pass rate | Waypoint retention |")
        a("|---|---|---|---|")
        for name, m in report.per_dataset.items():
            a(f"| `{name}` | {int(m.get('cases') or 0)} | "
              f"{_pct(m.get('case_pass_rate'))} | "
              f"{_pct(m.get('waypoint_retention_rate'))} |")
        a("")

    if report.skipped:
        a(f"### Skipped ({len(report.skipped)})")
        a("")
        a("Cases with no mock block cannot run in contract mode; they are "
          "reported here rather than counted as passes.")
        a("")
        for s in report.skipped:
            a(f"- `{s}`")
        a("")

    return "\n".join(lines)


def write_reports(report: "RunReport", out_dir: Path) -> tuple[Path, Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = report.started_at.replace(":", "").replace("-", "")[:15]
    json_path = out_dir / f"eval-{report.mode}-{stamp}.json"
    md_path = out_dir / f"eval-{report.mode}-{stamp}.md"
    json_path.write_text(report.model_dump_json(indent=2), encoding="utf-8")
    md_path.write_text(render_markdown(report), encoding="utf-8")
    # Stable filenames for CI artefacts and baseline pinning
    (out_dir / f"latest-{report.mode}.json").write_text(
        report.model_dump_json(indent=2), encoding="utf-8")
    return json_path, md_path
