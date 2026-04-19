"""
LLM pricing table — M5.

Per CLAUDE.md §Non-negotiable: LLM cost tracking uses this committed pricing table.
Do NOT hardcode pricing in middleware or callbacks — always import from here.

All prices in USD per 1,000 tokens.

Source dates are noted per row. Update with a new date-stamped row when pricing changes
rather than editing in-place, so history is auditable.

Model name note: The running primary model in M4/M5 is "claude-sonnet-4-5-20250929"
(Sonnet 4.5), NOT "claude-sonnet-4-7-20260201" as mentioned in the M5 brief aspirationally.
The pricing keys here match the actual model names instantiated by model_router.py.
If the model is upgraded, add a new row with the new model name string.
"""

import logging

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Pricing table
# Keys must match the model name strings used in model_router.py exactly.
# ---------------------------------------------------------------------------

# Source: anthropic.com/pricing — checked 2026-04-19
# claude-sonnet-4-5: $3/MTok input, $15/MTok output
# (M5 brief mentions 4-7 aspirationally; actual running model is 4-5)
_ANTHROPIC_SONNET_45 = {
    "input_per_1k": 0.003,
    "output_per_1k": 0.015,
}

# Source: ai.google.dev/pricing — checked 2026-04-19
# gemini-2.5-flash: $0.075/MTok input, $0.30/MTok output (sub-200k ctx)
_GEMINI_25_FLASH = {
    "input_per_1k": 0.000075,
    "output_per_1k": 0.0003,
}

# Source: openrouter.ai/models — checked 2026-04-19
# meta-llama/llama-3.3-70b-instruct: ~$0.12/MTok input, ~$0.30/MTok output (via OpenRouter)
# Pinned to this specific routing for reproducibility.
_OPENROUTER_LLAMA_33_70B = {
    "input_per_1k": 0.00012,
    "output_per_1k": 0.0003,
}

PRICING: dict[str, dict[str, float]] = {
    # Primary: Anthropic Claude Sonnet 4.5
    # (actual model used by model_router.py; M5 brief mentions 4-7 aspirationally)
    "claude-sonnet-4-5-20250929": _ANTHROPIC_SONNET_45,

    # Aspirational upgrade target (add pricing entry now for forward-compatibility)
    # Source: anthropic.com/pricing — checked 2026-04-19 (same tier as Sonnet 4.5)
    "claude-sonnet-4-7-20260201": {
        "input_per_1k": 0.003,
        "output_per_1k": 0.015,
    },

    # Fallback: Google Gemini 2.5 Flash
    "gemini-2.5-flash": _GEMINI_25_FLASH,

    # Last-ditch: OpenRouter Llama 3.3 70B Instruct
    # Pin: meta-llama/llama-3.3-70b-instruct via OpenRouter
    "meta-llama/llama-3.3-70b-instruct": _OPENROUTER_LLAMA_33_70B,
}


def cost_usd_for(model: str, input_tokens: int, output_tokens: int) -> float:
    """
    Calculate the USD cost for a single LLM call.

    Args:
        model:         The model name string (must match a key in PRICING).
        input_tokens:  Number of input/prompt tokens.
        output_tokens: Number of output/completion tokens.

    Returns:
        Estimated cost in USD as a float. Returns 0.0 for unknown models (with WARNING).

    Never raises — unknown model is a warning, not an error, to avoid crashing
    the callback during a live session.
    """
    tier = PRICING.get(model)
    if tier is None:
        logger.warning(
            "pricing.cost_usd_for: unknown model %r — returning 0.0. "
            "Add a row to agent/pricing.py to track this model's cost.",
            model,
        )
        return 0.0

    cost = (input_tokens / 1000.0) * tier["input_per_1k"] + (
        output_tokens / 1000.0
    ) * tier["output_per_1k"]
    return cost
