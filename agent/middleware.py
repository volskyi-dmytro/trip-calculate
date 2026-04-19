"""
Middleware stack for the LangGraph ReAct agent — M4 + M5.

Middleware order (authoritative per CLAUDE.md §Architecture):
  1. InjectPreferencesMiddleware  (@before_model)  — loads user prefs from PostgresStore
  2. RetryToolMiddleware           (@wrap_tool_call) — ToolRetryMiddleware(max_retries=3)
  3. ToolAllowlistMiddleware       (@after_model)    — drops unknown tool calls
  4. SummarizationMiddleware       (upstream)        — summarizes at 20+ messages
  5. ModelCallLimitMiddleware      (upstream, 15)    — hard cap on model calls per run
  6. BudgetGuardMiddleware         (@before_model)   — Redis pre-call USD cap check (M5)
  7. InputShieldMiddleware         (@before_model)   — prompt injection 2nd line (M5)

Plus a `tool_call_counter_middleware` (@wrap_tool_call, M5) that emits the
`agent_tool_calls_total{tool_name, status}` Prometheus counter. Inserted between
RetryToolMiddleware and tool_allowlist_middleware so it observes the final
attempt only.

CLAUDE.md §Non-negotiable:
- No AgentExecutor.
- No pre_model_hook / post_model_hook kwargs.
- Middleware decorators only.
- @before_model / @wrap_tool_call / @after_model from langchain.agents.middleware.
- BudgetGuardMiddleware fires BEFORE the model call (one-call slip semantic acceptable).
- No external moderation SaaS; v1 defenses = regex + tool allowlist + structured
  output + budget caps.

The `finalize` node in graph.py makes a direct model call outside this middleware
stack — graph.py performs a manual Redis budget check at that call site so the
budget gate has no per-session hole.
"""

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable

from langchain.agents.middleware import (
    AgentMiddleware,
    ModelCallLimitMiddleware,
    SummarizationMiddleware,
    ToolRetryMiddleware,
    after_model,
    before_model,
    wrap_tool_call,
)
from langchain.agents.middleware import AgentState
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langgraph.config import get_config, get_stream_writer
from langgraph.store.base import BaseStore

import metrics
from input_shield import SAFE_REPLACEMENT, shield

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

        # M5: emit cache-hit metric for the postgres-store layer.
        try:
            metrics.agent_cache_hits_total.add(1, {"layer": "postgres-store"})
        except Exception as exc:
            logger.debug("metrics.agent_cache_hits_total.add failed: %s", type(exc).__name__)

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
# M5: Tool-call counter wrap
# Emits agent_tool_calls_total{tool_name, status} for every tool call.
# Status is read from the tool's structured-dict result {"status": ...} when
# the result is a dict; otherwise treated as "ok".
# ---------------------------------------------------------------------------
@wrap_tool_call
async def tool_call_counter_middleware(
    request: Any,
    handler: Callable[[Any], Awaitable[Any]],
) -> Any:
    """
    Wraps every tool invocation, increments agent_tool_calls_total{tool_name, status}.
    Runs after RetryToolMiddleware so retries are not double-counted.
    """
    tool_name = (
        request.tool_call.get("name", "unknown")
        if isinstance(request.tool_call, dict)
        else getattr(request.tool_call, "name", "unknown")
    )
    try:
        result = await handler(request)
    except Exception as exc:
        try:
            metrics.agent_tool_calls_total.add(
                1, {"tool_name": tool_name, "status": "exception"}
            )
        except Exception:
            pass
        raise

    # Inspect the result for a structured-dict status field.
    status = "ok"
    payload = result
    # ToolMessage / ToolNode wraps the result in a message; read .content if so.
    content = getattr(result, "content", result)
    if isinstance(content, str):
        # Tool returned a JSON string — parse it for status (best-effort).
        try:
            parsed = json.loads(content)
            if isinstance(parsed, dict) and "status" in parsed:
                status = str(parsed["status"])
        except Exception:
            pass
    elif isinstance(content, dict) and "status" in content:
        status = str(content["status"])

    try:
        metrics.agent_tool_calls_total.add(
            1, {"tool_name": tool_name, "status": status}
        )
    except Exception as exc:
        logger.debug("metrics.agent_tool_calls_total.add failed: %s", type(exc).__name__)

    return result


# ---------------------------------------------------------------------------
# M5: BudgetGuardMiddleware (@before_model)
# Pre-call Redis check of daily + monthly USD caps. Caps are pulled from
# JWT custom claims (daily_cap_usd, monthly_cap_usd) via get_config(); current
# spend is read from Spring's RedisUsageCounters key shape:
#   ai:usage:{userId}:day:{YYYY-MM-DD}:usd
#   ai:usage:{userId}:month:{YYYY-MM}:usd
#
# One-call slip semantic (CLAUDE.md §Critical Security Features item 11):
# the check is "current_spend < cap"; the call goes through; the post-call
# cost may push over by one call. This is documented spec — do NOT try
# to be cleverer.
#
# On block: emits a custom SSE frame {"type":"budget_exhausted","scope":...,
# "retry_after_seconds":...} via get_stream_writer() and short-circuits the
# model call by injecting a synthetic AIMessage that ends the loop.
# Never raises. Never returns a 500.
#
# On Redis failure: fail OPEN (call goes through, WARN logged). Better to slip
# a few cents over budget than block paying users on a Redis blip.
# ---------------------------------------------------------------------------
class BudgetGuardMiddleware(AgentMiddleware):
    """Pre-call Redis daily/monthly USD cap check."""

    def __init__(self) -> None:
        super().__init__()
        # Lazily initialized on first use; reused across requests.
        self._redis = None

    async def _get_redis(self):
        if self._redis is not None:
            return self._redis
        try:
            import redis.asyncio as redis_async  # noqa: PLC0415
        except ImportError:
            logger.warning("redis package not installed — BudgetGuardMiddleware disabled")
            return None
        url = os.environ.get("REDIS_URL", "redis://redis:6379/0")
        self._redis = redis_async.from_url(url, decode_responses=True)
        return self._redis

    @staticmethod
    def _today_key(user_id: str) -> str:
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        return f"ai:usage:{user_id}:day:{today}:usd"

    @staticmethod
    def _month_key(user_id: str) -> str:
        month = datetime.now(timezone.utc).strftime("%Y-%m")
        return f"ai:usage:{user_id}:month:{month}:usd"

    @staticmethod
    async def _read_float(client, key: str) -> float:
        try:
            val = await client.get(key)
        except Exception as exc:
            logger.warning("BudgetGuard: Redis GET %s failed: %s", key, type(exc).__name__)
            raise
        if val is None:
            return 0.0
        try:
            return float(val)
        except (TypeError, ValueError):
            return 0.0

    @staticmethod
    def _seconds_until_midnight_utc() -> int:
        now = datetime.now(timezone.utc)
        tomorrow = now.replace(hour=0, minute=0, second=0, microsecond=0)
        # midnight tomorrow:
        from datetime import timedelta
        midnight = tomorrow + timedelta(days=1)
        return max(60, int((midnight - now).total_seconds()))

    @staticmethod
    def _seconds_until_month_end_utc() -> int:
        from calendar import monthrange
        from datetime import timedelta
        now = datetime.now(timezone.utc)
        last_day = monthrange(now.year, now.month)[1]
        end = now.replace(day=last_day, hour=23, minute=59, second=59, microsecond=0)
        delta = end - now
        return max(60, int(delta.total_seconds()))

    async def abefore_model(
        self, state: AgentState, runtime: Any
    ) -> dict[str, Any] | None:
        """Pre-call budget gate. Returns a state update that ends the loop on block."""
        try:
            config = get_config()
            configurable = config.get("configurable", {})
            user_id: str | None = configurable.get("user_id")
            daily_cap_usd = float(configurable.get("daily_cap_usd", 0))
            monthly_cap_usd = float(configurable.get("monthly_cap_usd", 0))
        except Exception:
            # Outside a LangGraph runtime (tests) — allow through.
            return None

        if not user_id:
            # No user_id configured (e.g., test harness) — skip the gate.
            return None

        if daily_cap_usd <= 0 and monthly_cap_usd <= 0:
            # No caps configured — nothing to enforce.
            return None

        client = await self._get_redis()
        if client is None:
            # Redis client unavailable — fail open.
            return None

        try:
            daily_spend = await self._read_float(client, self._today_key(user_id))
            monthly_spend = await self._read_float(client, self._month_key(user_id))
        except Exception:
            # Redis read failed — fail open per CLAUDE.md guidance.
            return None

        blocked_scope: str | None = None
        retry_after = 0
        if daily_cap_usd > 0 and daily_spend >= daily_cap_usd:
            blocked_scope = "daily"
            retry_after = self._seconds_until_midnight_utc()
        elif monthly_cap_usd > 0 and monthly_spend >= monthly_cap_usd:
            blocked_scope = "monthly"
            retry_after = self._seconds_until_month_end_utc()

        if blocked_scope is None:
            return None

        # Block: emit custom SSE frame + synthetic AIMessage that ends the loop.
        try:
            metrics.agent_budget_blocks_total.add(1, {"scope": blocked_scope})
        except Exception as exc:
            logger.debug("metrics.agent_budget_blocks_total.add failed: %s", type(exc).__name__)

        try:
            writer = get_stream_writer()
            writer(
                {
                    "type": "budget_exhausted",
                    "scope": blocked_scope,
                    "retry_after_seconds": retry_after,
                }
            )
        except Exception as exc:
            # Outside an astream() context (rare in practice) — log and continue.
            logger.debug("get_stream_writer unavailable: %s", type(exc).__name__)

        logger.info(
            "BudgetGuard: blocked user_id=%s scope=%s daily_spend=%.4f daily_cap=%.4f "
            "monthly_spend=%.4f monthly_cap=%.4f",
            user_id,
            blocked_scope,
            daily_spend,
            daily_cap_usd,
            monthly_spend,
            monthly_cap_usd,
        )

        # Inject a synthetic AIMessage that ends the loop gracefully.
        ending_message = AIMessage(
            content=(
                f"Your {blocked_scope} usage budget for AI assistance has been reached. "
                "Please try again later."
            )
        )
        # The "jump_to": "__end__" hint instructs LangGraph to terminate the run
        # rather than recurse back into the model call.
        return {
            "messages": [ending_message],
            "jump_to": "__end__",
        }


# ---------------------------------------------------------------------------
# M5: InputShieldMiddleware (@before_model)
# Second-line prompt-injection defense (first line is Spring PromptInjectionFilter).
# Inspects the most recent HumanMessage; replaces matching content with a
# fixed safe string. Never raises.
# ---------------------------------------------------------------------------
class InputShieldMiddleware(AgentMiddleware):
    """Sanitizes the most recent HumanMessage if it matches a deny pattern."""

    async def abefore_model(
        self, state: AgentState, runtime: Any
    ) -> dict[str, Any] | None:
        messages = state.get("messages", [])
        if not messages:
            return None

        # Find the most recent HumanMessage (scanning from the end).
        idx_to_replace: int | None = None
        for i in range(len(messages) - 1, -1, -1):
            if isinstance(messages[i], HumanMessage):
                idx_to_replace = i
                break
        if idx_to_replace is None:
            return None

        original = messages[idx_to_replace]
        original_content = original.content if isinstance(original.content, str) else ""
        if not original_content:
            return None

        sanitized, reason = shield(original_content)
        if reason is None:
            # Either passed through, or only had silent control-char strip applied.
            if sanitized == original_content:
                return None
            # Silent strip: update the message but emit no custom event.

        # Emit custom event so the trace shows it.
        if reason is not None:
            try:
                writer = get_stream_writer()
                writer({"type": "input_shielded", "reason": reason})
            except Exception as exc:
                logger.debug("get_stream_writer unavailable: %s", type(exc).__name__)
            logger.info("InputShield: replaced message — reason=%s", reason)

        # Returning a state update that includes the sanitized message will be
        # appended (add_messages reducer), not in-place replace. We mutate the
        # original message's content directly — LangChain messages are pydantic
        # objects and content is mutable. This is the cleanest way to do an
        # in-place edit before model call.
        try:
            original.content = sanitized
        except Exception:
            # If the message is frozen / immutable, fall back to appending a
            # corrective message and rely on the model to honor it.
            return {
                "messages": [HumanMessage(content=sanitized)],
            }

        return None


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

        # 2b. M5: Tool-call counter wrap. Sits after retry so retries are not
        #     double-counted; before allowlist so blocked calls do not bump the metric.
        tool_call_counter_middleware,

        # 3. After-model allowlist check — blocks unknown tool names.
        tool_allowlist_middleware,

        # 4. Summarize when message count exceeds 20, keep last 10 verbatim.
        SummarizationMiddleware(model=model, trigger=("messages", 20), keep=("messages", 10)),

        # 5. Hard cap at 15 model calls per run. Graceful degradation: injects an
        #    AI message instructing wrap-up rather than raising an error.
        ModelCallLimitMiddleware(run_limit=15, exit_behavior="end"),

        # 6. M5: Pre-call Redis USD cap check. One-call slip semantic is intentional.
        BudgetGuardMiddleware(),

        # 7. M5: Second-line prompt-injection defense (first line is Spring's filter).
        InputShieldMiddleware(),
    ]
