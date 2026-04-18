"""
SSE endpoint tests.

M2 scope: verify JWT guard is enforced.
Full streaming integration test is deferred to M3 (requires a real or mocked graph).

Tests:
- POST /api/agent/stream without Authorization header → 401
- POST /api/agent/stream with expired token → 401
- POST /api/agent/stream with valid token → 200 (graph mocked, no real Postgres/LLM)
"""

import time
from unittest.mock import AsyncMock, MagicMock, patch

import jwt
import pytest
from fastapi.testclient import TestClient

_TEST_SECRET = "test-secret-32-bytes-xxxxxxxxxx"


def _make_valid_token(sub: str = "user-123", exp_offset: int = 30) -> str:
    payload = {"sub": sub, "exp": int(time.time()) + exp_offset}
    return jwt.encode(payload, _TEST_SECRET, algorithm="HS256")


def _make_expired_token() -> str:
    payload = {"sub": "user-123", "exp": int(time.time()) - 5}
    return jwt.encode(payload, _TEST_SECRET, algorithm="HS256")


@pytest.fixture
def test_client():
    """
    Create a TestClient with persistence and graph compilation mocked out
    so tests don't need a real Postgres or Anthropic key.
    """
    import os
    os.environ["INTERNAL_JWT_SECRET"] = _TEST_SECRET
    os.environ.setdefault("PG_URL", "postgresql://test:test@localhost:5432/test")
    os.environ.setdefault("ANTHROPIC_API_KEY", "sk-ant-test")
    os.environ.setdefault("MAPBOX_TOKEN", "pk.test")

    # Mock out the expensive startup operations. setup_persistence returns
    # (checkpointer, store, pool) — the 3-tuple must match app.py's unpack.
    async def _mock_setup():
        return MagicMock(), MagicMock(), MagicMock()

    with (
        patch("app.setup_persistence", side_effect=_mock_setup),
        patch("app.compile_graph", return_value=MagicMock()),
        patch("security._SECRET", _TEST_SECRET),
    ):
        # Import after env is set so security module initialises correctly.
        import importlib
        import sys
        for mod in ["security", "app"]:
            if mod in sys.modules:
                del sys.modules[mod]

        import app as agent_app
        client = TestClient(agent_app.app, raise_server_exceptions=False)
        yield client


class TestSseEndpointAuth:
    def test_no_auth_header_returns_401(self, test_client):
        response = test_client.post(
            "/api/agent/stream",
            json={"message": "Plan a trip", "thread_id": "thread-001"},
        )
        assert response.status_code == 401

    def test_expired_token_returns_401(self, test_client):
        token = _make_expired_token()
        response = test_client.post(
            "/api/agent/stream",
            headers={"X-Internal-Token": token},
            json={"message": "Plan a trip", "thread_id": "thread-001"},
        )
        assert response.status_code == 401

    def test_valid_token_accepted(self, test_client):
        """
        With a valid JWT the endpoint should return 200 (SSE stream).
        The actual graph is mocked to an AsyncMock that yields nothing,
        so the stream closes immediately after the `done` event.

        Full streaming integration test is a TODO for M3.
        """
        import app as agent_app

        # Patch the module-level graph to return an async iterable with no items.
        async def _empty_stream(*args, **kwargs):
            return
            yield  # make it an async generator

        mock_graph = MagicMock()
        mock_graph.astream = _empty_stream

        agent_app._compiled_graph = mock_graph

        token = _make_valid_token()
        response = test_client.post(
            "/api/agent/stream",
            headers={"X-Internal-Token": token},
            json={"message": "Plan a trip to Kyiv", "thread_id": "thread-001"},
        )
        assert response.status_code == 200
        assert "text/event-stream" in response.headers["content-type"]


class TestHealthEndpoint:
    def test_healthz_no_auth_required(self, test_client):
        response = test_client.get("/healthz")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
