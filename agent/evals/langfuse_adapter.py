"""Optional Langfuse publishing for evaluation runs.

Quality belongs next to cost and latency, so a configured Langfuse gets a
dedicated evaluation trace per run with deterministic numeric scores attached.

Everything here is best-effort by contract. Local evaluation correctness must
never depend on a cloud dashboard or an external account being reachable: if
Langfuse is unconfigured, unreachable, or throws, the run still produces its
JSON and Markdown reports and still returns its exit code.

Evaluation traces are separate from production traces on purpose. Production
user prompts can carry personal travel detail, so nothing is ever copied from
a production trace into a fixture automatically — see README.md, "Turning a
production incident into a regression case".
"""
from __future__ import annotations

import logging
import os
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:  # pragma: no cover
    from .runner import RunReport

logger = logging.getLogger(__name__)

# Per-case scores, mirrored from the scorer metric keys.
_CASE_SCORES = (
    "intent_correct",
    "route_request_correct",
    "ordered_stops_correct",
    "settings_correct",
    "current_route_preserved",
    "usable_route",
    "departure_date_correct",
    "fuel_type_correct",
    "consumption_in_range",
    "unknown_correct",
)


def is_configured() -> bool:
    return bool(os.getenv("LANGFUSE_PUBLIC_KEY") and os.getenv("LANGFUSE_SECRET_KEY"))


def publish(report: "RunReport") -> Optional[str]:
    """Push one evaluation trace plus its scores. Returns the trace id, or
    None when Langfuse is unconfigured or publishing failed."""
    if not is_configured():
        logger.info("Langfuse not configured — skipping evaluation publish")
        return None
    try:
        return _publish(report)
    except Exception:
        # An observability outage must not turn a green evaluation red.
        logger.warning("Langfuse publish failed — reports are unaffected", exc_info=True)
        return None


def _publish(report: "RunReport") -> Optional[str]:
    from langfuse import Langfuse

    client = Langfuse(
        public_key=os.getenv("LANGFUSE_PUBLIC_KEY", ""),
        secret_key=os.getenv("LANGFUSE_SECRET_KEY", ""),
        host=os.getenv("LANGFUSE_HOST", "https://cloud.langfuse.com"),
    )

    versions = sorted({d.version for d in report.datasets})
    tags = [
        "evaluation",
        f"mode:{report.mode}",
        f"model:{report.model}",
        *[f"dataset:{v}" for v in versions],
    ]
    if report.git_sha:
        tags.append(f"git_sha:{report.git_sha}")

    trace_id: Optional[str] = None
    with client.start_as_current_observation(
        name="route_intelligence_eval",
        as_type="evaluator",
        input={
            "mode": report.mode,
            "geocoder": report.geocoder,
            "datasets": [
                {"name": d.name, "version": d.version, "sha256": d.sha256, "cases": d.cases}
                for d in report.datasets
            ],
        },
        output={k: v for k, v in report.metrics.items() if v is not None},
        metadata={
            "git_sha": report.git_sha,
            "duration_s": report.duration_s,
            "total_cost_usd": report.total_cost_usd,
            "skipped": report.skipped,
        },
    ):
        trace_id = client.get_current_trace_id()
        client.update_current_span(tags=tags)

        # Run-level aggregates
        for name, value in report.metrics.items():
            if value is None:
                continue
            client.create_score(
                name=f"eval.{name}", value=float(value), trace_id=trace_id,
                data_type="NUMERIC",
                comment=f"{report.mode} run, datasets {','.join(versions)}",
            )

        # Per-case detail. Comments carry only fixture ids and check names —
        # never a production prompt.
        for result in report.results:
            client.create_score(
                name="eval_pass", value=float(result.passed), trace_id=trace_id,
                data_type="BOOLEAN",
                comment=f"{result.id}: " + (
                    "ok" if result.passed
                    else "; ".join(c.name for c in result.failed_checks)
                ),
                metadata={"case_id": result.id, "kind": result.kind, "tags": result.tags},
            )
            for metric in _CASE_SCORES:
                value = result.metrics.get(metric)
                if value is None:
                    continue
                client.create_score(
                    name=metric, value=float(value), trace_id=trace_id,
                    data_type="NUMERIC",
                    metadata={"case_id": result.id, "kind": result.kind},
                )

            # Naturally fractional, so it is scored per case as a ratio rather
            # than as a 0/1 flag. Only meaningful when the case asked for a
            # transit stop at all.
            requested = result.metrics.get("waypoints_requested") or 0
            if requested:
                client.create_score(
                    name="waypoint_retention",
                    value=(result.metrics.get("waypoints_retained") or 0) / requested,
                    trace_id=trace_id, data_type="NUMERIC",
                    metadata={"case_id": result.id, "requested": requested},
                )

        retention = report.metrics.get("waypoint_retention_rate")
        if retention is not None:
            client.create_score(
                name="waypoint_retention", value=float(retention), trace_id=trace_id,
                data_type="NUMERIC",
                comment=f"{int(report.metrics.get('waypoints_retained') or 0)}/"
                        f"{int(report.metrics.get('waypoints_requested') or 0)} "
                        f"requested transit stops retained in order",
            )

    client.flush()
    return trace_id
