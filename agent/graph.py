"""
LangGraph agent graph — M4.

Outer graph shape:
  START → react_agent → finalize → critic → END (or back to react_agent if critic rejects)

Inner react_agent uses create_agent from langchain.agents (LangChain 1.0) with the full
middleware stack (InjectPreferences → RetryTool → ToolAllowlist → Summarization →
ModelCallLimit).

Outer StateGraph:
  - Manages critic_iter, final_itinerary, critic_feedback on top of messages.
  - critic_iter < 2 enforced: on the second rejection the itinerary is accepted anyway.
  - recursion_limit=40 set on compiled graph config.

CLAUDE.md §Non-negotiable:
- LangChain 1.0 create_agent + middleware decorators (@before_model, @wrap_tool_call,
  @after_model). Never AgentExecutor. Never pre_model_hook / post_model_hook.
- ToolNode(handle_tool_errors=True) note: create_agent builds its own ToolNode
  internally. All tools return structured {"status", "hint"} dicts on failure, so
  handle_tool_errors=True at the ToolNode level is not needed — the tool functions
  themselves never raise raw exceptions to the LLM.
- recursion_limit=40 enforced via compiled.with_config({"recursion_limit": 40}).
- critic_iter < 2: hard cap at 2 critic iterations before accepting the itinerary.
- ModelCallLimitMiddleware(run_limit=15): hard cap on model calls per run.
"""

import logging
import os
from typing import Annotated, Any

from langchain.agents import create_agent
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AIMessage, AnyMessage, HumanMessage, SystemMessage
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from typing_extensions import TypedDict

from middleware import build_middleware_stack
from models import FinalItinerary
from tools import (
    estimate_time,
    fuel_price,
    geocode,
    pois_nearby,
    route_osrm,
    weather_forecast,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Full tool list (M4 — all 6 tools)
# ---------------------------------------------------------------------------
_ALL_TOOLS = [
    geocode,
    route_osrm,
    weather_forecast,
    pois_nearby,
    fuel_price,
    estimate_time,
]


# ---------------------------------------------------------------------------
# Model factory
# TODO M5: replace with full routing chain ChatAnthropic → ChatGemini → OpenRouter fallback.
# ---------------------------------------------------------------------------
def _build_model() -> ChatAnthropic:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY env var is required but not set."
        )
    return ChatAnthropic(
        model="claude-sonnet-4-5-20250929",
        api_key=api_key,
        temperature=0,
    )


# ---------------------------------------------------------------------------
# Outer graph state schema
#
# Extends MessagesState with critic_iter, final_itinerary, critic_feedback.
# Uses TypedDict so LangGraph can inspect field types for schema generation.
# ---------------------------------------------------------------------------
class OuterState(TypedDict):
    # Core messages list — reducible via add_messages.
    messages: Annotated[list[AnyMessage], add_messages]
    # How many times the critic has rejected the itinerary in this run.
    # Defaults to 0. Capped at 2 (critic_iter < 2).
    critic_iter: int
    # Structured itinerary produced by finalize node.
    final_itinerary: FinalItinerary | None
    # Feedback from the critic on the last rejected itinerary.
    critic_feedback: str | None


def _initial_state() -> dict[str, Any]:
    """Default values for outer state fields not covered by add_messages."""
    return {
        "critic_iter": 0,
        "final_itinerary": None,
        "critic_feedback": None,
    }


# ---------------------------------------------------------------------------
# finalize node
# ---------------------------------------------------------------------------
def _build_finalize_node(model: Any) -> Any:
    """
    Return a finalize node function that calls model.with_structured_output(FinalItinerary)
    over the conversation history and stores the result in state.
    """
    structured_model = model.with_structured_output(FinalItinerary)

    async def finalize(state: OuterState) -> dict[str, Any]:
        """
        Finalize node: extract a structured FinalItinerary from the conversation.

        Uses model.with_structured_output(FinalItinerary) so the LLM produces a
        validated Pydantic model in one structured call. Stashes the result on
        `final_itinerary` in the outer state.
        """
        messages = state.get("messages", [])
        # Prepend a system instruction to guide extraction.
        extraction_system = SystemMessage(
            content=(
                "Based on the conversation above, produce a structured trip itinerary. "
                "Include all legs discussed, weather notes if available, POIs if available, "
                "total distance, and estimated fuel cost if calculated. "
                "The summary MUST mention the destination."
            )
        )
        prompt_messages = list(messages) + [extraction_system]

        try:
            # TODO M5: BudgetGuardMiddleware does not wrap this direct model call.
            # M5 must either wrap `structured_model` with the middleware before this point,
            # or do a manual pre-call Redis budget check here.
            itinerary: FinalItinerary = await structured_model.ainvoke(prompt_messages)
        except Exception as exc:
            # Log class name only at WARNING — tracebacks from ainvoke() can echo back
            # the messages list which may contain user-supplied PII.
            logger.error(
                "finalize: structured output extraction failed — %s",
                type(exc).__name__,
            )
            logger.debug(
                "finalize: structured output extraction exception detail",
                exc_info=True,
            )
            # Return a minimal fallback itinerary rather than crashing the graph.
            # The critic will flag it as low-quality and trigger a loop if budget allows.
            itinerary = FinalItinerary(
                summary="Trip plan could not be fully structured. Please retry.",
                legs=[],
            )

        logger.info(
            "finalize: produced itinerary with %d legs, summary=%r",
            len(itinerary.legs),
            itinerary.summary[:80],
        )
        return {"final_itinerary": itinerary}

    return finalize


# ---------------------------------------------------------------------------
# critic node
# ---------------------------------------------------------------------------
def _build_critic_node() -> Any:
    """
    Return a critic node function.

    The critic validates the FinalItinerary with simple rule-based checks:
      1. At least one leg.
      2. Non-zero total distance (or at least one leg with non-zero distance).
      3. Summary references the destination (heuristic: at least one leg's to_place
         appears somewhere in the summary).

    On rejection: increments critic_iter and appends critic_feedback.
    On approval (or critic_iter >= 2): sets critic_feedback = None (approved).

    Hard cap: if critic_iter >= 2, the critic accepts the itinerary regardless —
    this prevents infinite loops (CLAUDE.md requirement).
    """

    async def critic(state: OuterState) -> dict[str, Any]:
        """
        Critic node: validate the FinalItinerary and decide whether to loop back.
        """
        itinerary: FinalItinerary | None = state.get("final_itinerary")
        critic_iter: int = state.get("critic_iter", 0)

        # Hard cap: accept on second rejection (critic_iter already incremented to 2).
        if critic_iter >= 2:
            logger.info(
                "critic: critic_iter=%d >= 2, accepting itinerary despite issues",
                critic_iter,
            )
            return {
                "critic_feedback": None,  # None = approved
                "critic_iter": critic_iter,
            }

        if itinerary is None:
            # No itinerary produced at all — reject.
            feedback = "No itinerary was produced. Please plan the trip fully."
            logger.info("critic: rejecting — no itinerary produced")
            return {
                "critic_feedback": feedback,
                "critic_iter": critic_iter + 1,
                "messages": [HumanMessage(content=f"[Critic feedback]: {feedback}")],
            }

        issues: list[str] = []

        # Check 1: at least one leg.
        if not itinerary.legs:
            issues.append("The itinerary has no legs. Add at least one origin→destination leg.")

        # Check 2: non-zero total distance.
        total_dist = itinerary.total_distance_km or sum(
            leg.distance_km for leg in itinerary.legs
        )
        if total_dist <= 0 and itinerary.legs:
            issues.append("Total distance is zero. Provide realistic distance estimates for each leg.")

        # Check 3: summary references destination (heuristic).
        if itinerary.legs:
            final_dest = itinerary.legs[-1].to_place.lower()
            if final_dest and final_dest not in itinerary.summary.lower():
                issues.append(
                    f"The summary does not mention the destination '{itinerary.legs[-1].to_place}'. "
                    "Include the final destination in the summary."
                )

        if not issues:
            logger.info("critic: itinerary approved on iter=%d", critic_iter)
            return {
                "critic_feedback": None,  # None = approved
                "critic_iter": critic_iter,
            }

        feedback = "Please revise the itinerary. Issues found:\n" + "\n".join(
            f"  - {issue}" for issue in issues
        )
        logger.info(
            "critic: rejecting itinerary on iter=%d, issues=%s",
            critic_iter,
            issues,
        )
        return {
            "critic_feedback": feedback,
            "critic_iter": critic_iter + 1,
            # Append critic feedback as a human message so the react_agent can address it.
            "messages": [HumanMessage(content=f"[Critic feedback]: {feedback}")],
        }

    return critic


# ---------------------------------------------------------------------------
# Routing after critic
# ---------------------------------------------------------------------------
def _route_after_critic(state: OuterState) -> str:
    """
    Conditional edge after the critic node.

    - critic_feedback is None → itinerary approved → END
    - critic_feedback is set  → loop back to react_agent for revision
    """
    if state.get("critic_feedback") is None:
        return END
    return "react_agent"


# ---------------------------------------------------------------------------
# Graph compilation
# ---------------------------------------------------------------------------
def compile_graph(
    checkpointer: Any,
    store: Any,
) -> Any:
    """
    Compile and return the outer LangGraph StateGraph.

    Graph shape:
      START → react_agent → finalize → critic → END (or back to react_agent)

    The react_agent is built with create_agent (LangChain 1.0) with the full
    middleware stack. The outer StateGraph manages critic_iter, final_itinerary,
    and critic_feedback.

    Args:
        checkpointer: AsyncPostgresSaver for per-thread persistence.
        store: AsyncPostgresStore for cross-thread memory (read by InjectPreferences).

    Returns:
        Compiled graph configured with recursion_limit=40.
    """
    model = _build_model()

    # Build middleware stack in the authoritative order.
    middleware = build_middleware_stack(store=store, model=model)

    # Build the inner ReAct agent with create_agent (LangChain 1.0).
    # Pass raw tool list (not a pre-built ToolNode) — create_agent builds its own ToolNode.
    # All tools return structured dicts on failure so handle_tool_errors at ToolNode level
    # is not the primary guard here; the tool functions themselves never leak raw exceptions.
    react_agent = create_agent(
        model=model,
        tools=_ALL_TOOLS,
        middleware=middleware,
        checkpointer=checkpointer,
        store=store,
    )

    logger.info(
        "Inner react_agent compiled with tools=[%s] and %d middleware layers",
        ", ".join(t.name for t in _ALL_TOOLS),
        len(middleware),
    )

    # Build finalize and critic nodes.
    finalize_fn = _build_finalize_node(model)
    critic_fn = _build_critic_node()

    # ---------------------------------------------------------------------------
    # Outer StateGraph
    # ---------------------------------------------------------------------------
    outer = StateGraph(OuterState)

    # react_agent is a compiled CompiledStateGraph — LangGraph supports using a
    # compiled graph as a node directly in an outer StateGraph.
    outer.add_node("react_agent", react_agent)
    outer.add_node("finalize", finalize_fn)
    outer.add_node("critic", critic_fn)

    # Edges
    outer.add_edge(START, "react_agent")
    outer.add_edge("react_agent", "finalize")
    outer.add_edge("finalize", "critic")
    outer.add_conditional_edges("critic", _route_after_critic, [END, "react_agent"])

    # Compile the outer graph without a checkpointer — the inner react_agent already
    # uses the checkpointer for per-thread history. The outer graph manages the
    # critic_iter / final_itinerary lifecycle across critic loops within a single run.
    compiled = outer.compile()

    # Defense-in-depth: set recursion_limit=40 here via with_config.
    # CLAUDE.md §Non-negotiable: the canonical enforcement lives at the per-invocation
    # call site in app.py (top-level "recursion_limit" key in the config dict), because
    # LangGraph merges top-level config keys from the astream() call — not from with_config
    # — when determining the effective recursion limit for a run.
    compiled = compiled.with_config({"recursion_limit": 40})

    logger.info(
        "Outer graph compiled: react_agent → finalize → critic → (loop or END), "
        "recursion_limit=40, critic_iter cap=2"
    )

    return compiled
