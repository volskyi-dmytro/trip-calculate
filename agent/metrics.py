"""
OTEL metrics instruments — M5.

Defines the 6 agent-specific instruments from CLAUDE.md §Observability plus a
per-session cost histogram used by the Grafana dynamic-threshold alert (rule 2).

These instruments are imported by middleware (BudgetGuardMiddleware, the tool-call
wrapper, InjectPreferencesMiddleware) and by the CostTrackingCallback. The OTEL SDK
is initialized in app.py :: lifespan; if it has not been initialized yet
(e.g. during pytest collection without a running OTLP collector), the global
MeterProvider is the SDK's no-op default and `counter.add(...)` becomes a no-op.

Lazy SDK import: the `opentelemetry` package may not be installed in every
environment (older M4 deployments; partial-deploy windows). We try the SDK and
fall back to stub instruments so middleware code can call `counter.add(...)`
unconditionally without an ImportError.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


class _StubInstrument:
    """No-op replacement for an OTEL Counter / Histogram when the SDK is unavailable."""

    def add(self, _value: float, _attributes: dict | None = None) -> None:
        return None

    def record(self, _value: float, _attributes: dict | None = None) -> None:
        return None


try:
    from opentelemetry import metrics as _otel_metrics

    _meter = _otel_metrics.get_meter("tripcalc-langgraph-agent", "0.5.0")

    # ---------------------------------------------------------------------------
    # 1. agent_sessions_total{status}
    #    Incremented in app.py once per stream completion.
    # ---------------------------------------------------------------------------
    agent_sessions_total = _meter.create_counter(
        "agent_sessions_total",
        description="Total number of agent sessions, partitioned by terminal status.",
        unit="1",
    )

    # ---------------------------------------------------------------------------
    # 2. agent_steps_per_session
    #    Recorded in app.py at stream end with the number of model calls or
    #    AI messages produced during the run.
    # ---------------------------------------------------------------------------
    agent_steps_per_session = _meter.create_histogram(
        "agent_steps_per_session",
        description="Number of model invocations per agent session.",
        unit="1",
    )

    # ---------------------------------------------------------------------------
    # 3. agent_tool_calls_total{tool_name, status}
    #    Incremented by the tool-call wrapper middleware for every tool invocation.
    # ---------------------------------------------------------------------------
    agent_tool_calls_total = _meter.create_counter(
        "agent_tool_calls_total",
        description="Total number of tool calls, partitioned by tool name and status.",
        unit="1",
    )

    # ---------------------------------------------------------------------------
    # 4. agent_llm_cost_usd_total{model}
    #    Incremented by CostTrackingCallback on every on_llm_end with the
    #    USD cost computed by pricing.cost_usd_for(...).
    # ---------------------------------------------------------------------------
    agent_llm_cost_usd_total = _meter.create_counter(
        "agent_llm_cost_usd_total",
        description="Cumulative LLM cost in USD, partitioned by model name.",
        unit="USD",
    )

    # ---------------------------------------------------------------------------
    # 5. agent_budget_blocks_total{scope}
    #    Incremented by BudgetGuardMiddleware on every blocked model call.
    # ---------------------------------------------------------------------------
    agent_budget_blocks_total = _meter.create_counter(
        "agent_budget_blocks_total",
        description="Total budget-guard blocks, partitioned by cap scope (daily|monthly).",
        unit="1",
    )

    # ---------------------------------------------------------------------------
    # 6. agent_cache_hits_total{layer}
    #    Incremented by InjectPreferencesMiddleware on store hits (layer="postgres-store").
    #    Spring-side Redis grant lookups are NOT emitted from Python — gap documented
    #    in docs/observability-setup.md.
    # ---------------------------------------------------------------------------
    agent_cache_hits_total = _meter.create_counter(
        "agent_cache_hits_total",
        description="Cache hits, partitioned by storage layer.",
        unit="1",
    )

    # ---------------------------------------------------------------------------
    # 7. agent_session_cost_usd (histogram)
    #    Recorded once per session in app.py from the CostTrackingCallback accumulator.
    #    Drives the Grafana dynamic median×3 cost-per-session alert (rule 2).
    # ---------------------------------------------------------------------------
    agent_session_cost_usd = _meter.create_histogram(
        "agent_session_cost_usd",
        description="Per-session total LLM cost in USD.",
        unit="USD",
    )

    _SDK_AVAILABLE = True

except ImportError:
    logger.warning(
        "opentelemetry SDK not available — metrics will be no-op stubs. "
        "Install opentelemetry-sdk + opentelemetry-exporter-otlp-proto-grpc to enable."
    )
    agent_sessions_total = _StubInstrument()
    agent_steps_per_session = _StubInstrument()
    agent_tool_calls_total = _StubInstrument()
    agent_llm_cost_usd_total = _StubInstrument()
    agent_budget_blocks_total = _StubInstrument()
    agent_cache_hits_total = _StubInstrument()
    agent_session_cost_usd = _StubInstrument()
    _SDK_AVAILABLE = False


def sdk_available() -> bool:
    """Return True if the opentelemetry SDK was successfully imported."""
    return _SDK_AVAILABLE
