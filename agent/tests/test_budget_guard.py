"""
Tests for BudgetGuardMiddleware (agent/middleware.py) — M5.

Covers the four documented states:
  1. Spend at cap → custom budget_exhausted event + model NOT called.
  2. Spend just under cap → call goes through.
  3. Redis failure → fail open (call goes through, WARNING logged).
  4. No user_id / no caps → skip the gate.
"""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from middleware import BudgetGuardMiddleware


def _today_key(user_id: str) -> str:
    return f"ai:usage:{user_id}:day:{datetime.now(timezone.utc).strftime('%Y-%m-%d')}:usd"


def _month_key(user_id: str) -> str:
    return f"ai:usage:{user_id}:month:{datetime.now(timezone.utc).strftime('%Y-%m')}:usd"


def _config(user_id: str = "test-user", daily_cap: float = 0.50, monthly_cap: float = 10.0):
    return {
        "configurable": {
            "user_id": user_id,
            "daily_cap_usd": daily_cap,
            "monthly_cap_usd": monthly_cap,
        }
    }


def _patch_get_config(config_dict):
    """Helper that returns a patcher for langgraph.config.get_config used by middleware."""
    return patch("middleware.get_config", return_value=config_dict)


def _stub_redis_returning(daily_value: float | None, monthly_value: float | None):
    """Build a fake redis client whose .get returns the supplied strings."""
    client = MagicMock()
    async def _get(key):
        if "day:" in key:
            return None if daily_value is None else str(daily_value)
        if "month:" in key:
            return None if monthly_value is None else str(monthly_value)
        return None
    client.get = AsyncMock(side_effect=_get)
    return client


@pytest.mark.asyncio
class TestBudgetGuard:
    async def test_at_daily_cap_blocks_and_emits_custom_event(self):
        guard = BudgetGuardMiddleware()
        guard._redis = _stub_redis_returning(daily_value=0.50, monthly_value=0.10)

        writes = []
        with _patch_get_config(_config(daily_cap=0.50, monthly_cap=10.0)), \
             patch("middleware.get_stream_writer", return_value=lambda payload: writes.append(payload)):
            result = await guard.abefore_model({"messages": []}, runtime=None)

        assert result is not None, "Expected a state update that ends the loop"
        assert result.get("jump_to") == "__end__"
        assert any(w.get("type") == "budget_exhausted" and w.get("scope") == "daily" for w in writes)

    async def test_at_monthly_cap_blocks_with_monthly_scope(self):
        guard = BudgetGuardMiddleware()
        guard._redis = _stub_redis_returning(daily_value=0.10, monthly_value=10.0)

        writes = []
        with _patch_get_config(_config(daily_cap=0.50, monthly_cap=10.0)), \
             patch("middleware.get_stream_writer", return_value=lambda payload: writes.append(payload)):
            result = await guard.abefore_model({"messages": []}, runtime=None)

        assert result is not None
        assert any(w.get("scope") == "monthly" for w in writes)

    async def test_under_cap_passes_through(self):
        guard = BudgetGuardMiddleware()
        guard._redis = _stub_redis_returning(daily_value=0.10, monthly_value=0.20)

        with _patch_get_config(_config(daily_cap=0.50, monthly_cap=10.0)), \
             patch("middleware.get_stream_writer", return_value=lambda _: None):
            result = await guard.abefore_model({"messages": []}, runtime=None)

        assert result is None, "Under-cap should not return a state update"

    async def test_redis_failure_fails_open(self):
        guard = BudgetGuardMiddleware()
        client = MagicMock()
        client.get = AsyncMock(side_effect=RuntimeError("redis down"))
        guard._redis = client

        with _patch_get_config(_config()):
            result = await guard.abefore_model({"messages": []}, runtime=None)

        assert result is None, "Redis failure must fail OPEN — never block on infra blips"

    async def test_no_user_id_skips_gate(self):
        guard = BudgetGuardMiddleware()
        # Even if redis is set, no user_id means skip.
        guard._redis = _stub_redis_returning(daily_value=999.0, monthly_value=999.0)

        with _patch_get_config({"configurable": {}}):
            result = await guard.abefore_model({"messages": []}, runtime=None)

        assert result is None

    async def test_no_caps_skips_gate(self):
        guard = BudgetGuardMiddleware()
        guard._redis = _stub_redis_returning(daily_value=999.0, monthly_value=999.0)

        with _patch_get_config(_config(daily_cap=0.0, monthly_cap=0.0)):
            result = await guard.abefore_model({"messages": []}, runtime=None)

        assert result is None
