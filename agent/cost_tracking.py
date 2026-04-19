"""
CostTrackingCallback — M5.

A LangChain BaseCallbackHandler that records per-LLM-call cost and accumulates
session totals for the `done` SSE event payload.

Design decisions:
- Wired into the model object (NOT a middleware) so it sees every call site,
  including the `finalize` node's direct structured_model.ainvoke().
- Per-thread_id accumulator keyed in a module-level dict. Cleared by the caller
  (app.py) after the `done` event is emitted, not by the callback itself.
- Never persists anything — Spring is the source of truth for ai_usage_tracking
  writes (via AgentController.recordUsage → Supabase increment_ai_usage RPC).
- Prometheus counter (agent_llm_cost_usd_total{model}) incremented lazily so a
  missing agent/metrics.py at import time does not break tests.

CLAUDE.md §Non-negotiable: trace metadata must never include secrets, API keys,
or raw message contents. This callback records model_name, token counts, cost only.
"""

import logging
import threading
from typing import Any

from langchain_core.callbacks.base import BaseCallbackHandler
from langchain_core.outputs import LLMResult

from pricing import cost_usd_for

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Module-level per-thread accumulator
#
# Keyed by thread_id (str → {"tokens": int, "cost_usd": float}).
# Thread-safe: dict writes are GIL-protected for simple key assignments;
# for increments we use a threading.Lock to be explicit.
#
# Lifecycle: created on first LLM call for a thread_id; cleared by
# `clear_session(thread_id)` called from app.py after the done event is emitted.
# ---------------------------------------------------------------------------
_accumulator: dict[str, dict[str, Any]] = {}
_lock = threading.Lock()


def get_session_totals(thread_id: str) -> dict[str, Any]:
    """
    Return accumulated {tokens, cost_usd} for the given thread_id.
    Returns {"tokens": 0, "cost_usd": 0.0} when no calls have been recorded yet.
    """
    with _lock:
        return dict(_accumulator.get(thread_id, {"tokens": 0, "cost_usd": 0.0}))


def clear_session(thread_id: str) -> None:
    """Remove the accumulator entry for this session. Called after done event emission."""
    with _lock:
        _accumulator.pop(thread_id, None)


def _increment(thread_id: str, tokens: int, cost_usd: float) -> None:
    """Thread-safe increment of the session accumulator."""
    with _lock:
        entry = _accumulator.setdefault(thread_id, {"tokens": 0, "cost_usd": 0.0})
        entry["tokens"] += tokens
        entry["cost_usd"] += cost_usd


# ---------------------------------------------------------------------------
# CostTrackingCallback
# ---------------------------------------------------------------------------
class CostTrackingCallback(BaseCallbackHandler):
    """
    LangChain callback handler that records token usage and USD cost per LLM call.

    Usage:
        callback = CostTrackingCallback(thread_id="<thread-uuid>")
        model = build_routed_model().with_config({"callbacks": [callback]})

    The callback accumulates totals into the module-level `_accumulator` dict.
    After the session ends, call `clear_session(thread_id)` to free memory.

    Prometheus counter `agent_llm_cost_usd_total{model}` is incremented lazily
    on each on_llm_end. If agent/metrics.py is not yet present (during a partial
    deploy), the increment is a no-op with a DEBUG log.
    """

    def __init__(self, thread_id: str) -> None:
        super().__init__()
        self.thread_id = thread_id

    # -------------------------------------------------------------------------
    # BaseCallbackHandler interface
    # -------------------------------------------------------------------------

    def on_llm_end(self, response: LLMResult, **kwargs: Any) -> None:
        """
        Called after each LLM call completes.

        Extracts token usage from the LLMResult, calculates cost, and accumulates
        into the per-thread session total. Also increments the Prometheus counter.
        """
        # LLMResult carries usage_metadata at the generation level.
        # LangChain stores it in response.llm_output or per-generation.
        # We try both paths for compatibility across providers.
        input_tokens = 0
        output_tokens = 0
        model_name = "unknown"

        # Path 1: llm_output dict (standard LangChain location)
        if response.llm_output:
            usage = response.llm_output.get("usage", {}) or response.llm_output.get("token_usage", {})
            input_tokens = usage.get("prompt_tokens", 0) or usage.get("input_tokens", 0)
            output_tokens = usage.get("completion_tokens", 0) or usage.get("output_tokens", 0)
            model_name = response.llm_output.get("model_name", "unknown") or response.llm_output.get("model", "unknown")

        # Path 2: per-generation usage_metadata (Anthropic/Google providers set this)
        if input_tokens == 0 and response.generations:
            for gen_list in response.generations:
                for gen in gen_list:
                    meta = getattr(gen, "generation_info", None) or {}
                    usage_meta = meta.get("usage_metadata", {}) or {}
                    if usage_meta:
                        input_tokens += usage_meta.get("input_tokens", 0)
                        output_tokens += usage_meta.get("output_tokens", 0)
                    # Some providers set model_name at the generation level
                    if model_name == "unknown":
                        model_name = meta.get("model", "unknown")

        total_tokens = input_tokens + output_tokens
        cost = cost_usd_for(model_name, input_tokens, output_tokens)

        logger.debug(
            "CostTrackingCallback: model=%s input=%d output=%d cost=$%.6f thread=%s",
            model_name,
            input_tokens,
            output_tokens,
            cost,
            self.thread_id,
        )

        # Accumulate into the session total.
        _increment(self.thread_id, total_tokens, cost)

        # Increment OTEL counter lazily — if metrics.py is missing or the SDK
        # is not installed (stub instruments), this is a safe no-op.
        try:
            import metrics  # noqa: PLC0415 (lazy import by design)
            metrics.agent_llm_cost_usd_total.add(cost, {"model": model_name})
        except ImportError:
            logger.debug("agent/metrics.py not available — skipping cost metric increment")
        except Exception as exc:
            logger.debug("OTEL cost metric increment failed: %s", type(exc).__name__)
