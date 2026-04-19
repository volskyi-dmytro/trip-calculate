"""
Tests for agent/cost_tracking.py — M5.

Verifies:
  - on_llm_end accumulates token + cost into the per-thread accumulator.
  - get_session_totals returns the accumulated values.
  - clear_session removes the entry.
  - Concurrent thread_ids do not bleed into one another.
  - Unknown model returns 0 cost (delegated to pricing.cost_usd_for).
"""

from __future__ import annotations

from langchain_core.outputs import Generation, LLMResult

from cost_tracking import (
    CostTrackingCallback,
    clear_session,
    get_session_totals,
)


def _llm_result(model: str, input_tokens: int, output_tokens: int) -> LLMResult:
    """Build an LLMResult with the standard llm_output token_usage shape."""
    return LLMResult(
        generations=[[Generation(text="ignored")]],
        llm_output={
            "model_name": model,
            "token_usage": {
                "prompt_tokens": input_tokens,
                "completion_tokens": output_tokens,
            },
        },
    )


class TestCostTrackingCallback:
    def test_on_llm_end_accumulates_tokens_and_cost(self):
        thread_id = "test-thread-1"
        clear_session(thread_id)
        cb = CostTrackingCallback(thread_id=thread_id)

        cb.on_llm_end(_llm_result("claude-sonnet-4-5-20250929", 1000, 500))

        totals = get_session_totals(thread_id)
        assert totals["tokens"] == 1500
        # Cost: 1000/1000 * 0.003 + 500/1000 * 0.015 = 0.003 + 0.0075 = 0.0105
        assert abs(totals["cost_usd"] - 0.0105) < 1e-9

        clear_session(thread_id)

    def test_multiple_calls_accumulate(self):
        thread_id = "test-thread-2"
        clear_session(thread_id)
        cb = CostTrackingCallback(thread_id=thread_id)

        cb.on_llm_end(_llm_result("claude-sonnet-4-5-20250929", 1000, 500))
        cb.on_llm_end(_llm_result("claude-sonnet-4-5-20250929", 2000, 1000))

        totals = get_session_totals(thread_id)
        assert totals["tokens"] == 1500 + 3000
        # Sum of two calls: 0.0105 + (2*0.003 + 1*0.015) = 0.0105 + 0.021 = 0.0315
        assert abs(totals["cost_usd"] - 0.0315) < 1e-9

        clear_session(thread_id)

    def test_clear_session_removes_entry(self):
        thread_id = "test-thread-3"
        cb = CostTrackingCallback(thread_id=thread_id)
        cb.on_llm_end(_llm_result("claude-sonnet-4-5-20250929", 100, 100))

        assert get_session_totals(thread_id)["tokens"] > 0
        clear_session(thread_id)
        # After clear, returns the default zero entry.
        assert get_session_totals(thread_id) == {"tokens": 0, "cost_usd": 0.0}

    def test_per_thread_isolation(self):
        thread_a, thread_b = "session-a", "session-b"
        clear_session(thread_a)
        clear_session(thread_b)

        cb_a = CostTrackingCallback(thread_id=thread_a)
        cb_b = CostTrackingCallback(thread_id=thread_b)

        cb_a.on_llm_end(_llm_result("gemini-2.5-flash", 1000, 500))
        cb_b.on_llm_end(_llm_result("claude-sonnet-4-5-20250929", 2000, 1000))

        totals_a = get_session_totals(thread_a)
        totals_b = get_session_totals(thread_b)
        assert totals_a["tokens"] == 1500
        assert totals_b["tokens"] == 3000
        # Sessions don't leak.
        assert totals_a["cost_usd"] != totals_b["cost_usd"]

        clear_session(thread_a)
        clear_session(thread_b)

    def test_unknown_model_yields_zero_cost(self):
        thread_id = "test-thread-unknown-model"
        clear_session(thread_id)
        cb = CostTrackingCallback(thread_id=thread_id)
        cb.on_llm_end(_llm_result("not-a-real-model", 1000, 500))
        totals = get_session_totals(thread_id)
        # Tokens still tracked.
        assert totals["tokens"] == 1500
        # Cost should be zero because pricing.cost_usd_for unknown model returns 0.
        assert totals["cost_usd"] == 0.0
        clear_session(thread_id)

    def test_default_returns_zero_for_missing_thread(self):
        assert get_session_totals("never-seen-this-thread") == {
            "tokens": 0,
            "cost_usd": 0.0,
        }
