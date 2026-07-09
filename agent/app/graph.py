from langgraph.graph import StateGraph, END
from .schema import GraphState
from .nodes import (
    supervise,
    parse_locations,
    geocode_locations,
    retry_failed_locations,
    fuel_enrichment,
    format_response,
    format_error,
    route_after_supervisor,
    route_after_geocode,
)


def build_graph():
    graph = StateGraph(GraphState)

    graph.add_node("supervise", supervise)
    graph.add_node("parse_locations", parse_locations)
    graph.add_node("geocode_locations", geocode_locations)
    graph.add_node("retry_failed_locations", retry_failed_locations)
    graph.add_node("fuel_enrichment", fuel_enrichment)
    graph.add_node("format_response", format_response)
    graph.add_node("format_error", format_error)

    graph.set_entry_point("supervise")
    graph.add_conditional_edges(
        "supervise",
        route_after_supervisor,
        {"format_error": "format_error",
         "geocode_locations": "geocode_locations",
         "parse_locations": "parse_locations"},
    )

    graph.add_conditional_edges(
        "parse_locations",
        lambda state: "format_error" if state.get("error") else "geocode_locations",
        {"format_error": "format_error", "geocode_locations": "geocode_locations"},
    )
    # Both geocoding and the retry pass funnel through the same router:
    # retry_count bounds the loop, so "retry_failed" cannot fire indefinitely.
    # Success path detours through the fuel agent; it never errors, so the
    # composer always runs next.
    _route_targets = {
        "format_response": "fuel_enrichment",
        "format_error": "format_error",
        "retry_failed": "retry_failed_locations",
    }
    graph.add_conditional_edges("geocode_locations", route_after_geocode, _route_targets)
    graph.add_conditional_edges("retry_failed_locations", route_after_geocode, _route_targets)
    graph.add_edge("fuel_enrichment", "format_response")
    graph.add_edge("format_response", END)
    graph.add_edge("format_error", END)

    return graph.compile()
