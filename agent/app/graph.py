from langgraph.graph import StateGraph, END
from .schema import GraphState
from .nodes import parse_locations, geocode_locations, format_response, format_error, check_viable


def build_graph():
    graph = StateGraph(GraphState)

    graph.add_node("parse_locations", parse_locations)
    graph.add_node("geocode_locations", geocode_locations)
    graph.add_node("format_response", format_response)
    graph.add_node("format_error", format_error)

    graph.set_entry_point("parse_locations")

    graph.add_conditional_edges(
        "parse_locations",
        lambda state: "format_error" if state.get("error") else "geocode_locations",
        {"format_error": "format_error", "geocode_locations": "geocode_locations"},
    )
    graph.add_conditional_edges(
        "geocode_locations",
        check_viable,
        {"format_response": "format_response", "format_error": "format_error"},
    )
    graph.add_edge("format_response", END)
    graph.add_edge("format_error", END)

    return graph.compile()
