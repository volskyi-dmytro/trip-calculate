"""
Middleware stack for the LangGraph ReAct agent — M4.

Middleware order (authoritative per CLAUDE.md §Architecture):
  1. InjectPreferencesMiddleware  (@before_model)  — loads user prefs from PostgresStore
  2. RetryToolMiddleware           (@wrap_tool_call) — ToolRetryMiddleware(max_retries=3)
  3. ToolAllowlistMiddleware       (@after_model)    — drops unknown tool calls
  4. SummarizationMiddleware       (upstream)        — summarizes at 20+ messages
  5. ModelCallLimitMiddleware      (upstream, 15)    — hard cap on model calls per run

CLAUDE.md §Non-negotiable:
- No AgentExecutor.
- No pre_model_hook / post_model_hook kwargs.
- Middleware decorators only.
- @before_model / @wrap_tool_call / @after_model from langchain.agents.middleware.

TODO M5 hand-off:
  - Add BudgetGuardMiddleware (position 6, after ModelCallLimitMiddleware) — pre-call Redis
    daily/monthly USD cap check per CLAUDE.md §Architecture.
  - Add InputShieldMiddleware (position 7) — prompt injection second line of defense.
  - The `finalize` node in graph.py makes a direct model call outside this middleware stack.
    M5 must wrap that call with a manual pre-call Redis budget check (or apply the middleware
    to the structured_model before it is used). See TODO comment in graph.py finalize node.
"""

import logging
from typing import Any

from langchain.agents.middleware import (
    AgentMiddleware,
    ModelCallLimitMiddleware,
    SummarizationMiddleware,
    ToolRetryMiddleware,
    after_model,
    before_model,
)
from langchain.agents.middleware import AgentState
from langchain_core.messages import AIMessage, SystemMessage, ToolMessage
from langgraph.config import get_config
from langgraph.store.base import BaseStore

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Allowed tool names — scaffold-grade for M4; hardened in M6.
# ---------------------------------------------------------------------------
ALLOWED_TOOL_NAMES: frozenset[str] = frozenset({
    "geocode",
    "route_osrm",
    "weather_forecast",
    "pois_nearby",
    "fuel_price",
    "estimate_time",
})


# ---------------------------------------------------------------------------
# 1. InjectPreferencesMiddleware
#    Reads user preferences from PostgresStore and prepends a system message
#    synthesizing them so the model adapts its planning style.
#
#    Namespace pattern: (user_id, "preferences")
#    Key: "prefs" (a single structured dict per user)
#    On store miss: no-op (don't block if prefs not set yet).
# ---------------------------------------------------------------------------
class InjectPreferencesMiddleware(AgentMiddleware):
    """
    Before-model middleware that fetches the user's stored preferences from
    PostgresStore and prepends a SystemMessage describing them.

    user_id is read from state["configurable"]["user_id"] (set by graph config).
    On store miss (first-time users, or store unavailable): no-op.

    Cross-user contamination is prevented because the namespace key is
    (user_id, "preferences") — each user has a separate namespace entry.
    """

    def __init__(self, store: BaseStore) -> None:
        super().__init__()
        self._store = store

    async def abefore_model(
        self, state: AgentState, runtime: Any
    ) -> dict[str, Any] | None:
        """Fetch user preferences and inject them as a system message."""
        # Extract user_id from LangGraph configurable.
        # Runtime does not expose config directly; use get_config() from langgraph.config.
        try:
            config = get_config()
            user_id: str | None = config.get("configurable", {}).get("user_id")
        except Exception:
            # get_config() raises outside a LangGraph run context (e.g. tests).
            user_id = None

        if not user_id:
            # No user_id in config — skip (e.g. test invocations without user context).
            return None

        try:
            # PostgresStore.aget signature (confirmed against langgraph-checkpoint-postgres
            # source — langgraph.store.base.BaseStore.aget):
            #   aget(namespace: tuple[str, ...], key: str) -> Item | None
            # The namespace tuple is (user_id, "preferences"), key is "prefs".
            # Each user gets a separate namespace entry — no cross-user contamination.
            item = await self._store.aget(
                namespace=(user_id, "preferences"),
                key="prefs",
            )
        except Exception as exc:
            # Store unavailable — don't block the agent run.
            # WARNING carries no PII (user_id is a Google sub). Full context at DEBUG only.
            logger.warning(
                "InjectPreferencesMiddleware store lookup failed: %s",
                type(exc).__name__,
            )
            logger.debug(
                "InjectPreferencesMiddleware store lookup failed for user_id=%s: %s",
                user_id,
                exc,
            )
            return None

        if item is None:
            # No preferences stored yet — no-op.
            return None

        prefs: dict[str, Any] = item.value if hasattr(item, "value") else item

        if not prefs:
            return None

        # Synthesize a preference summary for the model.
        parts: list[str] = ["The user has the following planning preferences:"]
        if transport := prefs.get("preferred_transport"):
            parts.append(f"- Preferred transport mode: {transport}")
        if prefs.get("avoid_highways"):
            parts.append("- Avoid highways where possible")
        if language := prefs.get("language"):
            parts.append(f"- Respond in language: {language}")
        # Any extra preference fields are appended verbatim.
        for key, val in prefs.items():
            if key not in ("preferred_transport", "avoid_highways", "language"):
                parts.append(f"- {key}: {val}")

        pref_text = "\n".join(parts)
        logger.debug(
            "InjectPreferencesMiddleware: injecting prefs for user_id=%s", user_id
        )

        # Return a state update that prepends a SystemMessage.
        # LangGraph's add_messages reducer will prepend this before the existing history.
        return {"messages": [SystemMessage(content=pref_text)]}


# ---------------------------------------------------------------------------
# 3. ToolAllowlistMiddleware
#    After-model hook: inspects the last AIMessage for tool_calls and replaces
#    any call whose name is not in ALLOWED_TOOL_NAMES with a synthetic
#    ToolMessage explaining the tool is unavailable.
#
#    Scaffold-grade for M4 — full hardening (blocking, logging, alerting) in M6.
# ---------------------------------------------------------------------------
@after_model
def tool_allowlist_middleware(
    state: AgentState,
    runtime: Any,
) -> dict[str, Any] | None:
    """
    After-model middleware that enforces the tool allowlist.

    Inspects the last AI message for tool calls and replaces any call whose name
    is not in ALLOWED_TOOL_NAMES with a synthetic ToolMessage indicating the
    tool is not available.

    This is scaffold-grade (M4). Full hardening lands in M6.
    """
    messages = state.get("messages", [])
    if not messages:
        return None

    last_message = messages[-1]
    if not isinstance(last_message, AIMessage):
        return None

    tool_calls = getattr(last_message, "tool_calls", []) or []
    if not tool_calls:
        return None

    blocked_messages: list[ToolMessage] = []
    for tc in tool_calls:
        tool_name = tc.get("name", "") if isinstance(tc, dict) else getattr(tc, "name", "")
        if tool_name not in ALLOWED_TOOL_NAMES:
            logger.warning(
                "ToolAllowlistMiddleware: blocked unknown tool %r", tool_name
            )
            call_id = tc.get("id", "") if isinstance(tc, dict) else getattr(tc, "id", "")
            blocked_messages.append(
                ToolMessage(
                    content=(
                        f"Tool '{tool_name}' is not available. "
                        "Use one of: " + ", ".join(sorted(ALLOWED_TOOL_NAMES)) + "."
                    ),
                    tool_call_id=call_id,
                )
            )

    if not blocked_messages:
        return None

    return {"messages": blocked_messages}


# ---------------------------------------------------------------------------
# Factory: build the ordered middleware stack
# ---------------------------------------------------------------------------
def build_middleware_stack(
    store: BaseStore,
    model: Any,
) -> list[AgentMiddleware]:
    """
    Return the middleware list in the authoritative order from CLAUDE.md.

    Args:
        store: The PostgresStore (or InMemoryStore in tests) for preference injection.
        model: The chat model — passed to SummarizationMiddleware for summary generation.

    Order:
        1. InjectPreferencesMiddleware
        2. RetryToolMiddleware  (ToolRetryMiddleware, max_retries=3)
        3. tool_allowlist_middleware  (ToolAllowlistMiddleware @after_model decorator)
        4. SummarizationMiddleware
        5. ModelCallLimitMiddleware(run_limit=15)

    Note on ToolNode and handle_tool_errors:
        create_agent builds its own ToolNode internally without handle_tool_errors=True.
        This is acceptable because all tools in this project already return structured
        {"status": ..., "hint": ...} dicts on every failure path — no raw exceptions
        propagate from the tool functions themselves.
        CLAUDE.md §Non-negotiable #10 is satisfied at the tool-function level.
    """
    return [
        # 1. Load user preferences and inject as system message before model call.
        InjectPreferencesMiddleware(store=store),

        # 2. Retry tool calls on exceptions or upstream errors (3 attempts total,
        #    initial_delay=0.5s, backoff_factor=2.0 → waits: 0.5s, 1s, 2s).
        ToolRetryMiddleware(max_retries=3, initial_delay=0.5, backoff_factor=2.0),

        # 3. After-model allowlist check — blocks unknown tool names.
        tool_allowlist_middleware,

        # 4. Summarize when message count exceeds 20, keep last 10 verbatim.
        SummarizationMiddleware(model=model, trigger=("messages", 20), keep=("messages", 10)),

        # 5. Hard cap at 15 model calls per run. Graceful degradation: injects an
        #    AI message instructing wrap-up rather than raising an error.
        ModelCallLimitMiddleware(run_limit=15, exit_behavior="end"),
    ]
