"""
LangGraph agent graph — M2 skeleton.

Outer graph shape for M2:
  START → react_agent (ReAct loop with tools) → END

M4 will extend this to:
  START → react_agent → finalize (with_structured_output) → critic → (loop or END)

CLAUDE.md §Non-negotiable:
- LangChain 1.0 create_agent (langchain.agents.create_agent) for M4+ middleware.
  For M2 we use create_react_agent from langgraph.prebuilt to pass a pre-built
  ToolNode — the two are equivalent internals; create_agent wraps create_react_agent
  and its middleware system will slot in during M4 without graph structural changes.
- ToolNode(handle_tool_errors=True) MUST be explicit. create_react_agent accepts a
  ToolNode directly as its `tools` argument; passing one we built ourselves is the
  only way to guarantee handle_tool_errors=True (create_agent builds its own
  ToolNode internally without that flag set).
- No pre_model_hook / post_model_hook kwargs. They are deprecated; @before_model /
  @after_model middleware decorators arrive in M4.
"""

import logging
import os
from typing import Any

from langchain_anthropic import ChatAnthropic
from langgraph.checkpoint.postgres import PostgresSaver
from langgraph.prebuilt import ToolNode, create_react_agent
from langgraph.store.postgres import PostgresStore

from tools import geocode, route_osrm

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Model
# TODO M5: replace with full routing chain ChatAnthropic → ChatGemini → OpenRouter fallback.
# ---------------------------------------------------------------------------
def _build_model() -> ChatAnthropic:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY env var is required but not set."
        )
    # claude-sonnet-4-5-20250929 is a validated model ID for the installed langchain-anthropic.
    # M5 model routing will make this configurable and add the fallback chain.
    return ChatAnthropic(
        model="claude-sonnet-4-5-20250929",
        api_key=api_key,
        temperature=0,
    )


# ---------------------------------------------------------------------------
# Tools + ToolNode
#
# We build the ToolNode here at module level so we own handle_tool_errors=True.
# This is passed directly as the `tools` argument to create_react_agent —
# the LangGraph prebuilt API accepts a ToolNode in that position.
#
# CLAUDE.md §Non-negotiable #10: ToolNode(handle_tool_errors=True) must be
# explicit. The langgraph-prebuilt default flipped to False; do not rely on it.
# ---------------------------------------------------------------------------
_TOOLS = [geocode, route_osrm]

_TOOL_NODE = ToolNode(_TOOLS, handle_tool_errors=True)


# ---------------------------------------------------------------------------
# Graph compilation
# ---------------------------------------------------------------------------
def compile_graph(
    checkpointer: PostgresSaver,
    store: PostgresStore,
) -> Any:
    """
    Compile and return the outer LangGraph StateGraph.

    For M2 the graph is:
      START → react_agent (ReAct loop with tools) → END

    The react_agent is built with create_react_agent from langgraph.prebuilt.
    We pass the pre-built _TOOL_NODE as `tools` to guarantee handle_tool_errors=True.

    Middleware (@before_model, @wrap_tool_call, @after_model) will be added in M4
    via create_agent from langchain.agents — no structural changes needed then.

    Args:
        checkpointer: PostgresSaver for per-thread persistence.
        store: PostgresStore for cross-thread memory (wired but not read in M2).

    Returns:
        Compiled graph ready for .astream() calls.
    """
    model = _build_model()

    # Pass _TOOL_NODE (not the raw list) so handle_tool_errors=True is guaranteed.
    # Do NOT pass pre_model_hook or post_model_hook — those kwargs are forbidden
    # by CLAUDE.md §Forbidden (they are deprecated; use middleware decorators in M4).
    react_agent = create_react_agent(
        model=model,
        tools=_TOOL_NODE,
        checkpointer=checkpointer,
        store=store,
    )

    logger.info(
        "Graph compiled: react_agent with tools=[%s]",
        ", ".join(t.name for t in _TOOLS),
    )

    # M2: outer graph is trivially just the react_agent sub-graph.
    # M4 will wrap it with finalize + critic nodes.
    return react_agent
