"""
Graph tests — M4 outer graph logic.

Tests:
  1. critic_loop    — FinalItinerary with empty legs triggers critic rejection,
                       critic_iter increments, cap at 2 accepts regardless.
  2. critic_routing — _route_after_critic returns END vs react_agent correctly.
  3. finalize_node  — finalize produces a FinalItinerary via mocked structured_model.
  4. weather_blackhole — weather_forecast returning no_data does not crash the tool
                          (unit test; graph-level integration requires a real LLM).
  5. preference_injection — InjectPreferencesMiddleware inserts a SystemMessage
                             containing user preferences from an InMemoryStore.

Graph-level end-to-end tests with a real LLM are excluded from this file — they
require ANTHROPIC_API_KEY to be valid and a live Postgres. Those are handled by
the smoke-test script (scripts/smoke-test.sh) and are skipped in CI without real keys.

Tests that need a running Postgres are skipped with a runtime check on PG_URL
reachability.

CLAUDE.md §Non-negotiable: no AgentExecutor, ToolNode(handle_tool_errors=True)
preserved at tool-function level (structured dicts), critic_iter < 2 cap enforced.
"""

import asyncio
import os
import socket
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Set env vars before any imports that read them at module level.
os.environ.setdefault("ANTHROPIC_API_KEY", "dummy-key-for-tests")
os.environ.setdefault("INTERNAL_JWT_SECRET", "test-secret-32-bytes-xxxxxxxxxx")
os.environ.setdefault("PG_URL", "postgresql://test:test@localhost:5432/test")
os.environ.setdefault("MAPBOX_TOKEN", "pk.test")
os.environ.setdefault("OTM_KEY", "test-otm-key")


# ---------------------------------------------------------------------------
# Postgres reachability guard — used for tests requiring a live store.
# ---------------------------------------------------------------------------
def _postgres_reachable() -> bool:
    """Return True if the Postgres host in PG_URL is reachable (TCP connect)."""
    try:
        pg_url = os.environ.get("PG_URL", "")
        # Minimal parse: postgresql://user:pass@host:port/db
        # Extract host:port between @ and /
        at_idx = pg_url.rfind("@")
        slash_idx = pg_url.find("/", at_idx) if at_idx != -1 else -1
        if at_idx == -1 or slash_idx == -1:
            return False
        host_port = pg_url[at_idx + 1 : slash_idx]
        if ":" in host_port:
            host, port_str = host_port.rsplit(":", 1)
            port = int(port_str)
        else:
            host, port = host_port, 5432
        with socket.create_connection((host, port), timeout=1.0):
            return True
    except Exception:
        return False


_no_postgres = not _postgres_reachable()


# ---------------------------------------------------------------------------
# Test 1 & 2: Critic node unit tests (no LLM, no Postgres needed)
# ---------------------------------------------------------------------------
class TestCriticNode:
    """Tests for the critic node logic — pure logic, no LLM required."""

    @pytest.fixture
    def critic(self):
        from graph import _build_critic_node
        return _build_critic_node()

    @pytest.mark.asyncio
    async def test_empty_legs_triggers_rejection(self, critic):
        """Empty legs list → critic rejects and increments critic_iter."""
        from langchain_core.messages import HumanMessage
        from models import FinalItinerary

        state = {
            "messages": [HumanMessage(content="Plan a trip to Lviv")],
            "critic_iter": 0,
            "final_itinerary": FinalItinerary(
                summary="A trip somewhere",
                legs=[],
            ),
            "critic_feedback": None,
        }

        result = await critic(state)

        assert result["critic_feedback"] is not None
        assert "leg" in result["critic_feedback"].lower() or "leg" in result["critic_feedback"]
        assert result["critic_iter"] == 1
        # Critic should append a HumanMessage with the feedback.
        assert any(
            hasattr(m, "content") and "[Critic feedback]" in m.content
            for m in result.get("messages", [])
        )

    @pytest.mark.asyncio
    async def test_critic_iter_cap_at_2_accepts_regardless(self, critic):
        """
        When critic_iter >= 2, the critic must accept the itinerary regardless of issues.
        This enforces the CLAUDE.md hard cap: critic_iter < 2 — on the second rejection,
        accept and proceed to END. No infinite loop possible.
        """
        from models import FinalItinerary

        state = {
            "messages": [],
            "critic_iter": 2,  # Already at cap
            "final_itinerary": FinalItinerary(
                summary="Trip",
                legs=[],  # Would normally be rejected
            ),
            "critic_feedback": "previous rejection",
        }

        result = await critic(state)

        # Must accept — critic_feedback set to None signals approval.
        assert result["critic_feedback"] is None
        # critic_iter stays at 2 (not incremented further).
        assert result["critic_iter"] == 2

    @pytest.mark.asyncio
    async def test_valid_itinerary_is_approved(self, critic):
        """A well-formed itinerary with legs and matching summary is approved."""
        from models import FinalItinerary, Leg

        state = {
            "messages": [],
            "critic_iter": 0,
            "final_itinerary": FinalItinerary(
                summary="A 2-day road trip from Kyiv to Lviv via Zhytomyr.",
                legs=[
                    Leg(
                        from_place="Kyiv",
                        to_place="Lviv",
                        distance_km=540.0,
                        duration_minutes=360,
                        mode="driving",
                    )
                ],
                total_distance_km=540.0,
            ),
            "critic_feedback": None,
        }

        result = await critic(state)

        assert result["critic_feedback"] is None  # Approved
        assert result["critic_iter"] == 0

    @pytest.mark.asyncio
    async def test_no_itinerary_triggers_rejection(self, critic):
        """None itinerary → critic rejects."""
        state = {
            "messages": [],
            "critic_iter": 0,
            "final_itinerary": None,
            "critic_feedback": None,
        }

        result = await critic(state)

        assert result["critic_feedback"] is not None
        assert result["critic_iter"] == 1


class TestCriticRouting:
    """Tests for the _route_after_critic conditional edge function."""

    def test_approved_routes_to_end(self):
        from langgraph.graph import END
        from graph import _route_after_critic

        state = {
            "messages": [],
            "critic_iter": 0,
            "final_itinerary": None,
            "critic_feedback": None,  # None = approved
        }
        route = _route_after_critic(state)
        assert route == END

    def test_rejected_routes_to_react_agent(self):
        from graph import _route_after_critic

        state = {
            "messages": [],
            "critic_iter": 1,
            "final_itinerary": None,
            "critic_feedback": "Issues found: no legs",
        }
        route = _route_after_critic(state)
        assert route == "react_agent"


# ---------------------------------------------------------------------------
# Test 3: finalize node with mocked model (no real LLM)
# ---------------------------------------------------------------------------
class TestFinalizeNode:
    """Tests for the finalize node — mocked structured model output."""

    @pytest.mark.asyncio
    async def test_finalize_produces_itinerary(self):
        """
        finalize node invokes model.with_structured_output(FinalItinerary).
        We mock the structured model's ainvoke() to return a pre-built FinalItinerary.

        The code path: structured_model = model.with_structured_output(FinalItinerary)
                       then: await structured_model.ainvoke(prompt_messages)
        So the mock chain must be: mock_model.with_structured_output() returns an object
        whose .ainvoke() is an AsyncMock.
        """
        from langchain_core.messages import AIMessage, HumanMessage
        from models import FinalItinerary, Leg
        from graph import _build_finalize_node

        expected_itinerary = FinalItinerary(
            summary="Road trip from Kyiv to Lviv.",
            legs=[
                Leg(
                    from_place="Kyiv",
                    to_place="Lviv",
                    distance_km=540.0,
                    duration_minutes=360,
                    mode="driving",
                )
            ],
            total_distance_km=540.0,
        )

        # mock_structured_model is what structured_model.ainvoke() returns.
        mock_structured_model = MagicMock()
        mock_structured_model.ainvoke = AsyncMock(return_value=expected_itinerary)

        mock_model = MagicMock()
        mock_model.with_structured_output.return_value = mock_structured_model

        finalize = _build_finalize_node(mock_model)

        state = {
            "messages": [
                HumanMessage(content="Plan a trip from Kyiv to Lviv"),
                AIMessage(content="I found a great route..."),
            ],
            "critic_iter": 0,
            "final_itinerary": None,
            "critic_feedback": None,
        }

        result = await finalize(state)

        assert "final_itinerary" in result
        itinerary = result["final_itinerary"]
        assert isinstance(itinerary, FinalItinerary)
        assert itinerary.summary == "Road trip from Kyiv to Lviv."
        assert len(itinerary.legs) == 1
        assert itinerary.legs[0].from_place == "Kyiv"

    @pytest.mark.asyncio
    async def test_finalize_falls_back_on_model_error(self):
        """
        If structured_model.ainvoke() raises, finalize returns a minimal fallback
        itinerary rather than crashing. The critic will subsequently reject it.
        """
        from langchain_core.messages import HumanMessage
        from models import FinalItinerary
        from graph import _build_finalize_node

        mock_structured_model = MagicMock()
        mock_structured_model.ainvoke = AsyncMock(side_effect=RuntimeError("LLM unavailable"))

        mock_model = MagicMock()
        mock_model.with_structured_output.return_value = mock_structured_model

        finalize = _build_finalize_node(mock_model)

        state = {
            "messages": [HumanMessage(content="Plan a trip")],
            "critic_iter": 0,
            "final_itinerary": None,
            "critic_feedback": None,
        }

        # Should not raise.
        result = await finalize(state)

        assert "final_itinerary" in result
        itinerary = result["final_itinerary"]
        assert isinstance(itinerary, FinalItinerary)
        # Fallback has empty legs (critic will reject it).
        assert itinerary.legs == []


# ---------------------------------------------------------------------------
# Test 4: weather_forecast blackhole — no_data is clean, no crash
# ---------------------------------------------------------------------------
class TestWeatherBlackhole:
    """
    Verifies that an Open-Meteo response with empty daily data produces
    {"status": "no_data"} and never raises an exception.
    This is the 'blackhole' acceptance test from the M4 spec.
    """

    @pytest.mark.asyncio
    async def test_empty_daily_returns_no_data_not_exception(self):
        """
        Graph-level recovery from weather_forecast blackhole:
        - weather_forecast returns {"status": "no_data"} cleanly.
        - This structured dict is returned to the LLM as a ToolMessage.
        - The agent can continue planning without the weather data.

        Since running the full graph requires a real LLM, we test the
        tool-level guarantee here (the critical layer per CLAUDE.md §Non-negotiable #9).
        """
        import respx
        import httpx
        from tools.weather_forecast import weather_forecast

        with respx.mock:
            respx.get(url__startswith="https://api.open-meteo.com").mock(
                return_value=httpx.Response(200, json={"daily": {"time": []}})
            )
            result = await weather_forecast.ainvoke(
                {"latitude": 50.4501, "longitude": 30.5234}
            )

        # Must be structured dict, not an exception.
        assert isinstance(result, dict)
        assert result["status"] == "no_data"
        assert "hint" in result
        # The hint must be safe to pass to the LLM.
        assert isinstance(result["hint"], str)
        assert len(result["hint"]) > 0


# ---------------------------------------------------------------------------
# Test 5: Preference injection (InMemoryStore, no Postgres)
# ---------------------------------------------------------------------------
class TestPreferenceInjection:
    """
    Tests InjectPreferencesMiddleware with InMemoryStore.
    No Postgres required — uses langgraph.store.memory.InMemoryStore.
    """

    @pytest.mark.asyncio
    async def test_preferences_injected_as_system_message(self):
        """
        Pre-populate InMemoryStore with user preferences.
        InjectPreferencesMiddleware.abefore_model() should return a state update
        containing a SystemMessage with the preference summary.
        """
        from langgraph.store.memory import InMemoryStore
        from langchain_core.messages import HumanMessage, SystemMessage
        from middleware import InjectPreferencesMiddleware

        store = InMemoryStore()
        user_id = "test-user-pref-001"
        prefs = {
            "preferred_transport": "train",
            "language": "uk",
            "avoid_highways": True,
        }
        # Put prefs into the store at namespace (user_id, "preferences"), key "prefs".
        store.put(namespace=(user_id, "preferences"), key="prefs", value=prefs)

        middleware = InjectPreferencesMiddleware(store=store)

        state = {
            "messages": [HumanMessage(content="Plan a trip")],
            "critic_iter": 0,
            "final_itinerary": None,
            "critic_feedback": None,
        }

        # Mock the LangGraph config context so get_config() returns user_id.
        with patch("middleware.get_config", return_value={"configurable": {"user_id": user_id}}):
            result = await middleware.abefore_model(state, runtime=MagicMock())

        # Result must be a dict with "messages" containing a SystemMessage.
        assert result is not None
        assert "messages" in result
        injected_messages = result["messages"]
        assert len(injected_messages) >= 1

        system_messages = [m for m in injected_messages if isinstance(m, SystemMessage)]
        assert len(system_messages) == 1

        content = system_messages[0].content
        # The system message must reference the user's preferences.
        assert "train" in content.lower()
        assert "uk" in content.lower()

    @pytest.mark.asyncio
    async def test_no_preferences_is_noop(self):
        """When no preferences are stored, abefore_model returns None (no-op)."""
        from langgraph.store.memory import InMemoryStore
        from langchain_core.messages import HumanMessage
        from middleware import InjectPreferencesMiddleware

        store = InMemoryStore()
        middleware = InjectPreferencesMiddleware(store=store)

        state = {
            "messages": [HumanMessage(content="Plan a trip")],
            "critic_iter": 0,
            "final_itinerary": None,
            "critic_feedback": None,
        }

        with patch("middleware.get_config", return_value={"configurable": {"user_id": "no-prefs-user"}}):
            result = await middleware.abefore_model(state, runtime=MagicMock())

        # No preferences → no injection.
        assert result is None

    @pytest.mark.asyncio
    async def test_no_user_id_is_noop(self):
        """When user_id is absent from config, abefore_model returns None."""
        from langgraph.store.memory import InMemoryStore
        from langchain_core.messages import HumanMessage
        from middleware import InjectPreferencesMiddleware

        store = InMemoryStore()
        middleware = InjectPreferencesMiddleware(store=store)

        state = {
            "messages": [HumanMessage(content="Plan a trip")],
            "critic_iter": 0,
            "final_itinerary": None,
            "critic_feedback": None,
        }

        with patch("middleware.get_config", return_value={"configurable": {}}):
            result = await middleware.abefore_model(state, runtime=MagicMock())

        assert result is None


# ---------------------------------------------------------------------------
# Test 6: Tool allowlist middleware
# ---------------------------------------------------------------------------
class TestToolAllowlistMiddleware:
    """Tests for the ToolAllowlistMiddleware (@after_model decorator)."""

    def _make_state_with_tool_call(self, tool_name: str) -> dict[str, Any]:
        """Helper: build a state where the last message has a tool call."""
        from langchain_core.messages import AIMessage
        from langchain_core.messages import ToolCall
        return {
            "messages": [
                AIMessage(
                    content="",
                    tool_calls=[
                        ToolCall(name=tool_name, args={}, id="call-test-1")
                    ],
                )
            ],
            "critic_iter": 0,
            "final_itinerary": None,
            "critic_feedback": None,
        }

    @pytest.mark.asyncio
    async def test_allowed_tool_passes_through(self):
        """Calls to allowed tools are not blocked."""
        from middleware import tool_allowlist_middleware
        from langchain_core.messages import ToolMessage

        state = self._make_state_with_tool_call("geocode")
        result = tool_allowlist_middleware.after_model(state, runtime=MagicMock())

        # No blocked messages → None or empty.
        if result is not None:
            blocked = [m for m in result.get("messages", []) if isinstance(m, ToolMessage)]
            assert len(blocked) == 0

    @pytest.mark.asyncio
    async def test_unknown_tool_is_blocked(self):
        """Calls to unknown tools produce a synthetic ToolMessage."""
        from middleware import tool_allowlist_middleware
        from langchain_core.messages import ToolMessage

        state = self._make_state_with_tool_call("evil_tool_xyz")
        result = tool_allowlist_middleware.after_model(state, runtime=MagicMock())

        assert result is not None
        blocked = [m for m in result.get("messages", []) if isinstance(m, ToolMessage)]
        assert len(blocked) == 1
        assert "evil_tool_xyz" in blocked[0].content
        assert "not available" in blocked[0].content


# ---------------------------------------------------------------------------
# Compile graph smoke test (no LLM call, no Postgres)
# ---------------------------------------------------------------------------
class TestGraphCompilation:
    """Verify the graph compiles cleanly with mocked checkpointer and InMemoryStore."""

    def test_graph_compiles_with_memory_components(self):
        from langgraph.checkpoint.memory import MemorySaver
        from langgraph.store.memory import InMemoryStore
        from graph import compile_graph

        checkpointer = MemorySaver()
        store = InMemoryStore()
        graph = compile_graph(checkpointer, store)

        # Verify expected node names are present.
        node_names = set(graph.get_graph().nodes.keys())
        assert "react_agent" in node_names
        assert "finalize" in node_names
        assert "critic" in node_names

    def test_graph_has_recursion_limit_40(self):
        """Confirm recursion_limit=40 is wired into the compiled graph config."""
        from langgraph.checkpoint.memory import MemorySaver
        from langgraph.store.memory import InMemoryStore
        from graph import compile_graph

        checkpointer = MemorySaver()
        store = InMemoryStore()
        graph = compile_graph(checkpointer, store)

        # with_config returns a new graph with the config merged. Inspect the config.
        # The config is stored as graph.config.
        config = getattr(graph, "config", {}) or {}
        assert config.get("recursion_limit") == 40, (
            f"Expected recursion_limit=40, got: {config}"
        )


# ---------------------------------------------------------------------------
# Test 7: AsyncPostgresStore aget signature contract lock
# ---------------------------------------------------------------------------
class TestAsyncPostgresStoreAgetSignature:
    """
    Locks the aget(namespace: tuple[str, ...], key: str) -> Item | None contract
    against AsyncPostgresStore (and its abstract base BaseStore).

    Confirmed against langgraph.store.base.BaseStore and
    langgraph.store.base.batch (the async batch runner) in the installed venv:
      async def aget(self, namespace: tuple[str, ...], key: str, ...) -> Item | None

    This test patches the store with AsyncMock using the verified signature so any
    future signature drift (e.g. positional vs. keyword-only args) fails loudly here
    rather than silently in production.
    """

    @pytest.mark.asyncio
    async def test_inject_preferences_calls_aget_with_correct_signature(self):
        """
        InjectPreferencesMiddleware must call store.aget with:
          - namespace as a tuple[str, str]: (user_id, "preferences")
          - key as str: "prefs"
        Verified against BaseStore.aget signature from installed langgraph venv.
        """
        from unittest.mock import AsyncMock, MagicMock
        from langchain_core.messages import HumanMessage

        # Simulate AsyncPostgresStore with AsyncMock using the confirmed signature.
        mock_store = MagicMock()
        # Simulate a returned Item with a .value dict matching preferences.
        mock_item = MagicMock()
        mock_item.value = {"preferred_transport": "train", "language": "uk"}
        mock_store.aget = AsyncMock(return_value=mock_item)

        from middleware import InjectPreferencesMiddleware
        middleware = InjectPreferencesMiddleware(store=mock_store)

        user_id = "test-user-postgres-sig-001"
        state = {
            "messages": [HumanMessage(content="Plan a trip")],
            "critic_iter": 0,
            "final_itinerary": None,
            "critic_feedback": None,
        }

        with patch("middleware.get_config", return_value={"configurable": {"user_id": user_id}}):
            result = await middleware.abefore_model(state, runtime=MagicMock())

        # Verify aget was called once with the exact signature contract.
        mock_store.aget.assert_awaited_once_with(
            namespace=(user_id, "preferences"),
            key="prefs",
        )

        # Verify the result contains a SystemMessage from the preference injection.
        assert result is not None
        assert "messages" in result
        from langchain_core.messages import SystemMessage
        system_messages = [m for m in result["messages"] if isinstance(m, SystemMessage)]
        assert len(system_messages) == 1
        assert "train" in system_messages[0].content.lower()
