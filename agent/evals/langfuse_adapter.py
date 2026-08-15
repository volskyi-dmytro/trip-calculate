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
import time
from dataclasses import dataclass
from typing import TYPE_CHECKING, Literal, Optional

if TYPE_CHECKING:  # pragma: no cover
    from .runner import RunReport

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PublishResult:
    """Visible outcome of the best-effort export step."""

    status: Literal["published", "submitted_unverified", "skipped", "failed"]
    trace_id: Optional[str] = None
    url: Optional[str] = None
    message: str = ""

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


def publish(report: "RunReport") -> PublishResult:
    """Push one evaluation trace plus its scores without hiding the outcome."""
    if not is_configured():
        message = ("Langfuse publish skipped: LANGFUSE_PUBLIC_KEY and "
                   "LANGFUSE_SECRET_KEY are required")
        logger.info(message)
        return PublishResult(status="skipped", message=message)
    try:
        return _publish(report)
    except Exception as exc:
        # An observability outage must not turn a green evaluation red.
        logger.warning("Langfuse publish failed — reports are unaffected", exc_info=True)
        return PublishResult(status="failed", message=f"Langfuse publish failed: {exc}")


def _trace_was_ingested(client, trace_id: str) -> bool:
    """Bounded read-after-write check for the asynchronous OTLP exporter.

    Langfuse ``flush()`` returns ``None`` and logs exporter failures rather than
    reliably raising them. A successful API read is therefore the only honest
    basis for saying the trace was published. Ingestion is eventually
    consistent, so retry briefly without making observability a release gate.
    """
    delays = (0.0, 0.5, 1.0, 2.0, 4.0)
    for attempt, delay in enumerate(delays):
        if delay:
            time.sleep(delay)
        try:
            trace = client.api.trace.get(trace_id)
            if getattr(trace, "id", None) == trace_id:
                return True
        except Exception:
            if attempt == len(delays) - 1:
                logger.warning(
                    "Langfuse trace submission could not be verified after flush",
                    exc_info=True,
                )
    return False


def _safe_trace_url(client, trace_id: Optional[str]) -> Optional[str]:
    """Build the dashboard URL without obscuring a completed submission."""
    if not trace_id:
        return None
    try:
        return client.get_trace_url(trace_id=trace_id)
    except Exception:
        # get_trace_url may query the projects API. Its failure says nothing
        # about whether the OTLP trace itself was accepted.
        logger.warning("Langfuse trace URL could not be resolved", exc_info=True)
        return None


def _publish(report: "RunReport") -> PublishResult:
    from langfuse import Langfuse

    client = Langfuse(
        public_key=os.getenv("LANGFUSE_PUBLIC_KEY", ""),
        secret_key=os.getenv("LANGFUSE_SECRET_KEY", ""),
        host=os.getenv("LANGFUSE_HOST", "https://cloud.langfuse.com"),
        environment=os.getenv("LANGFUSE_TRACING_ENVIRONMENT", "evaluation"),
        release=os.getenv("LANGFUSE_RELEASE") or report.git_sha,
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

        # Per-case detail. The child hierarchy carries only fixture ids,
        # deterministic scores and privacy-safe model telemetry. Prompts and
        # model outputs stay exclusively in the ignored local report.
        for result in report.results:
            with client.start_as_current_observation(
                name="route_intelligence_eval_case",
                as_type="evaluator",
                input={"case_id": result.id, "kind": result.kind, "tags": result.tags},
                output={
                    "passed": result.passed,
                    "failed_checks": [c.name for c in result.failed_checks],
                },
                metadata={"case_id": result.id, "kind": result.kind},
            ) as case_observation:
                client.create_score(
                    name="eval_pass", value=float(result.passed), trace_id=trace_id,
                    observation_id=case_observation.id,
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
                        observation_id=case_observation.id,
                        data_type="NUMERIC",
                        metadata={"case_id": result.id, "kind": result.kind},
                    )

                for call in result.diagnostics.get("model_calls", []):
                    usage = {
                        "input": int(call.get("input_tokens") or 0),
                        "output": int(call.get("output_tokens") or 0),
                        "total": int(call.get("total_tokens") or 0),
                    }
                    cost = call.get("cost_usd")
                    with client.start_as_current_observation(
                        name="eval_model_call",
                        as_type="generation",
                        model=call.get("model"),
                        usage_details=usage,
                        cost_details={"total": float(cost)} if cost is not None else None,
                        metadata={
                            "operation": call.get("operation"),
                            "measured_latency_s": call.get("latency_s"),
                            "case_id": result.id,
                            "post_run_summary": True,
                        },
                        status_message="privacy-safe post-run model-call summary",
                    ):
                        pass

            # Naturally fractional, so it is scored per case as a ratio rather
            # than as a 0/1 flag. Only meaningful when the case asked for a
            # transit stop at all.
            requested = result.metrics.get("waypoints_requested") or 0
            if requested:
                client.create_score(
                    name="waypoint_retention",
                    value=(result.metrics.get("waypoints_retained") or 0) / requested,
                    trace_id=trace_id, observation_id=case_observation.id,
                    data_type="NUMERIC",
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
    url = _safe_trace_url(client, trace_id)
    verified = bool(trace_id and _trace_was_ingested(client, trace_id))
    return PublishResult(
        status="published" if verified else "submitted_unverified",
        trace_id=trace_id,
        url=url,
        message=(
            "Langfuse evaluation trace published and verified"
            if verified
            else "Langfuse trace submitted, but ingestion was not visible after bounded retries"
        ),
    )
