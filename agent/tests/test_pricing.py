"""
Tests for agent/pricing.py — M5.

Verifies:
  - Hand-computed costs for each tier match cost_usd_for(...).
  - Unknown model returns 0.0 + WARNING (does not raise).
"""

from __future__ import annotations

import logging

import pytest

from pricing import PRICING, cost_usd_for


class TestPricingTable:
    def test_all_pricing_tiers_have_required_keys(self):
        for model, tier in PRICING.items():
            assert "input_per_1k" in tier, f"{model} missing input_per_1k"
            assert "output_per_1k" in tier, f"{model} missing output_per_1k"
            assert tier["input_per_1k"] >= 0, f"{model} negative input price"
            assert tier["output_per_1k"] >= 0, f"{model} negative output price"

    def test_known_models_present(self):
        # Sonnet 4.5 (M4 carry-forward primary) MUST be present.
        assert "claude-sonnet-4-5-20250929" in PRICING
        # Gemini and OpenRouter fallback tiers MUST be present.
        assert "gemini-2.5-flash" in PRICING
        assert "meta-llama/llama-3.3-70b-instruct" in PRICING


class TestCostUsdFor:
    def test_anthropic_sonnet_45_cost(self):
        # 1000 input + 500 output @ $0.003/1k input + $0.015/1k output
        # = (1000/1000)*0.003 + (500/1000)*0.015 = 0.003 + 0.0075 = 0.0105
        cost = cost_usd_for("claude-sonnet-4-5-20250929", 1000, 500)
        assert cost == pytest.approx(0.0105, rel=1e-9)

    def test_gemini_25_flash_cost(self):
        # 10_000 input + 2_000 output @ $0.000075/1k input + $0.0003/1k output
        # = (10000/1000)*0.000075 + (2000/1000)*0.0003 = 0.00075 + 0.0006 = 0.00135
        cost = cost_usd_for("gemini-2.5-flash", 10_000, 2_000)
        assert cost == pytest.approx(0.00135, rel=1e-9)

    def test_openrouter_llama_cost(self):
        # 5_000 input + 1_000 output @ $0.00012/1k + $0.0003/1k
        # = (5000/1000)*0.00012 + (1000/1000)*0.0003 = 0.0006 + 0.0003 = 0.0009
        cost = cost_usd_for("meta-llama/llama-3.3-70b-instruct", 5_000, 1_000)
        assert cost == pytest.approx(0.0009, rel=1e-9)

    def test_zero_tokens_returns_zero(self):
        assert cost_usd_for("claude-sonnet-4-5-20250929", 0, 0) == 0.0

    def test_unknown_model_returns_zero_and_warns(self, caplog):
        with caplog.at_level(logging.WARNING, logger="pricing"):
            cost = cost_usd_for("definitely-not-a-real-model", 1000, 500)
        assert cost == 0.0
        assert any("unknown model" in rec.message for rec in caplog.records)

    def test_unknown_model_does_not_raise(self):
        # Defensive: never raise on unknown models — would crash the LLM callback
        # mid-session.
        cost_usd_for("unknown", 100, 100)
