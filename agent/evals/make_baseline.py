"""Produce a sanitized, reviewable baseline manifest from a live run.

The full JSON and Markdown reports stay local and git-ignored: they carry
per-case diagnostics — fixture prompts, resolved stop names, observed
settings — and that is trace-shaped data we do not want accumulating in git
history. What gets committed instead is this manifest: aggregate numbers plus
provenance, and nothing that describes an individual request.

The allowlist below is the whole security model. Fields are copied out by
name; nothing is copied wholesale from the report, so a new diagnostic field
appearing upstream can never leak into a commit by default.

    python -m evals.make_baseline evals/results/latest-live.json \\
        --out evals/baselines/live.v1.yaml --notes "First reviewed live baseline"
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Optional


def _p95(values: list[float]) -> Optional[int]:
    if not values:
        return None
    ordered = sorted(values)
    idx = min(len(ordered) - 1, int(round((len(ordered) - 1) * 0.95)))
    return int(ordered[idx] * 1000)


def build(report: dict[str, Any], notes: str, git_sha: Optional[str] = None) -> dict:
    results = report["results"]
    route = [r for r in results if r["kind"] == "route"]
    car = [r for r in results if r["kind"] == "car"]
    latencies = [
        r["diagnostics"]["latency_s"] for r in results
        if isinstance(r["diagnostics"].get("latency_s"), (int, float))
    ]
    # The model the provider actually served, not the alias we asked for.
    resolved = sorted({
        r["diagnostics"].get("model") for r in results
        if r["diagnostics"].get("model")
    })

    def rate(rows: list) -> Optional[float]:
        return round(sum(1 for r in rows if r["passed"]) / len(rows), 4) if rows else None

    return {
        "dataset_version": "+".join(sorted({d["version"] for d in report["datasets"]})),
        "dataset_hashes": {d["name"]: d["sha256"] for d in report["datasets"]},
        "git_sha": git_sha or report.get("git_sha"),
        "model": resolved[0] if len(resolved) == 1 else (resolved or report["model"]),
        "mode": report["mode"],
        "geocoder": report["geocoder"],
        "recorded_at": report["started_at"],
        "route_cases": len(route),
        "route_case_pass_rate": rate(route),
        "explicit_waypoint_retention_rate": report["metrics"].get("waypoint_retention_rate"),
        "car_cases": len(car),
        "car_estimate_pass_rate": rate(car),
        # Safety invariant, not a quality score: any non-zero value here means
        # the agent accepted a coordinate the model invented.
        "unsafe_accepted_model_coordinates": int(
            report["metrics"].get("unsafe_ai_coords") or 0),
        "p95_latency_ms": _p95(latencies),
        "total_cost_usd": round(report["total_cost_usd"], 5) if report.get("total_cost_usd") else None,
        "notes": notes,
    }


def to_yaml(manifest: dict) -> str:
    """Hand-rolled so the output stays a flat, reviewable, diff-friendly block
    and cannot pick up an unexpected nested structure from the report."""
    lines = [
        "# Reviewed live evaluation baseline.",
        "#",
        "# Aggregates only — no prompts, routes, stop names, settings or",
        "# per-case diagnostics. Regenerate with:",
        "#   python -m evals.make_baseline evals/results/latest-live.json \\",
        "#       --out evals/baselines/live.v1.yaml --notes '...'",
        "# Review the diff before committing.",
        "",
    ]
    for key, value in manifest.items():
        if isinstance(value, dict):
            lines.append(f"{key}:")
            for k, v in value.items():
                lines.append(f"  {k}: {v}")
        elif value is None:
            lines.append(f"{key}: null")
        elif isinstance(value, str):
            lines.append(f'{key}: "{value}"')
        else:
            lines.append(f"{key}: {value}")
    return "\n".join(lines) + "\n"


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m evals.make_baseline")
    parser.add_argument("report", type=Path, help="a live-mode results JSON")
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--notes", default="Reviewed live baseline")
    parser.add_argument("--git-sha", help="override the SHA recorded in the manifest")
    args = parser.parse_args(argv)

    report = json.loads(args.report.read_text())
    if report.get("mode") != "live":
        print(f"error: {args.report} is a {report.get('mode')!r} run; a baseline "
              f"must come from a live run", file=sys.stderr)
        return 2

    manifest = build(report, args.notes, args.git_sha)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(to_yaml(manifest), encoding="utf-8")
    print(to_yaml(manifest))
    print(f"wrote {args.out}", file=sys.stderr)
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
