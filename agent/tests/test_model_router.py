"""
Tests for agent/model_router.py — M5.

Verifies:
  - _is_infra_failure correctly classifies common exceptions.
  - HTTP 429 / 5xx / timeout → returns True.
  - HTTP 4xx (other than 429) → returns False (semantic, not infra).
  - build_routed_model raises if no provider key is configured.
  - build_routed_model picks a primary that matches the configured key.
"""

from __future__ import annotations

import os
from unittest.mock import patch

import httpx
import pytest

from model_router import (
    FALLBACK_MODEL,
    LAST_DITCH_MODEL,
    PRIMARY_MODEL,
    _is_infra_failure,
    build_routed_model,
)


def _make_http_status_error(status: int) -> httpx.HTTPStatusError:
    request = httpx.Request("POST", "https://example.test/api")
    response = httpx.Response(status, request=request)
    return httpx.HTTPStatusError(
        f"HTTP {status}", request=request, response=response
    )


class TestInfraFailureClassifier:
    def test_429_is_infra(self):
        assert _is_infra_failure(_make_http_status_error(429)) is True

    @pytest.mark.parametrize("status", [500, 502, 503, 504])
    def test_5xx_is_infra(self, status):
        assert _is_infra_failure(_make_http_status_error(status)) is True

    def test_timeout_is_infra(self):
        assert _is_infra_failure(httpx.TimeoutException("slow")) is True
        assert _is_infra_failure(TimeoutError("slow")) is True

    def test_connect_error_is_infra(self):
        assert _is_infra_failure(httpx.ConnectError("refused")) is True

    @pytest.mark.parametrize("status", [400, 401, 403, 404, 422])
    def test_4xx_other_than_429_is_semantic(self, status):
        assert _is_infra_failure(_make_http_status_error(status)) is False

    def test_value_error_is_not_infra(self):
        assert _is_infra_failure(ValueError("bad json")) is False


class TestBuildRoutedModel:
    def test_raises_when_no_keys_configured(self):
        with patch.dict(os.environ, {}, clear=True):
            with pytest.raises(RuntimeError, match="No LLM provider"):
                build_routed_model()

    def test_anthropic_primary_when_only_key_set(self):
        # Only ANTHROPIC_API_KEY set — primary is Anthropic, no fallbacks.
        env = {"ANTHROPIC_API_KEY": "sk-ant-test"}
        with patch.dict(os.environ, env, clear=True):
            try:
                model = build_routed_model()
            except ImportError:
                pytest.skip("langchain_anthropic not installed")
            metadata = model.config.get("metadata", {}) if hasattr(model, "config") else {}
            assert metadata.get("served_by_model") == PRIMARY_MODEL

    def test_gemini_primary_when_only_gemini_key_set(self):
        pytest.importorskip("langchain_google_genai", reason="optional fallback tier")
        env = {"GEMINI_API_KEY": "google-test"}
        with patch.dict(os.environ, env, clear=True):
            model = build_routed_model()
            metadata = model.config.get("metadata", {}) if hasattr(model, "config") else {}
            assert metadata.get("served_by_model") == FALLBACK_MODEL

    def test_openrouter_primary_when_only_openrouter_key_set(self):
        pytest.importorskip("langchain_openai", reason="optional last-ditch tier")
        env = {"OPENROUTER_API_KEY": "or-test"}
        with patch.dict(os.environ, env, clear=True):
            model = build_routed_model()
            metadata = model.config.get("metadata", {}) if hasattr(model, "config") else {}
            assert metadata.get("served_by_model") == LAST_DITCH_MODEL
