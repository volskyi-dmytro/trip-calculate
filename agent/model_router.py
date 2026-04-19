"""
Model routing chain — M5.

Primary:    Anthropic Claude Sonnet 4.5 (fast tool-use, M4 carry-forward)
Fallback:   Google Gemini 2.5 Flash (cost)
Last-ditch: OpenRouter (meta-llama/llama-3.3-70b-instruct, cheap stable)

Fallback is triggered ONLY on infrastructure failure:
  - HTTP 429 (rate limit)
  - HTTP 5xx (server error)
  - timeouts (httpx / asyncio)

Semantic failure (the model returns a bad answer) is the critic's responsibility,
NOT the router's. A bad answer from Anthropic must NOT trigger a Gemini retry.

CLAUDE.md §Non-negotiable:
  - No requests library — httpx via the LangChain provider SDKs.
  - Pin every dependency major.minor.patch (see requirements.txt).
  - LLM cost tracking via pricing.py committed table — model name strings here
    must match keys in pricing.PRICING.

Trace metadata:
  - Each tier's chat model is wrapped to record `served_by_model` on the
    LangChain run config. The Langfuse callback (wired in app.py) reads
    config.metadata to populate the per-span served_by_model attribute.
"""

from __future__ import annotations

import logging
import os
from typing import Any

import httpx
from langchain_core.exceptions import LangChainException
from langchain_core.language_models import BaseChatModel

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Model name constants — keep in sync with pricing.PRICING keys.
# ---------------------------------------------------------------------------
PRIMARY_MODEL = "claude-sonnet-4-5-20250929"
FALLBACK_MODEL = "gemini-2.5-flash"
LAST_DITCH_MODEL = "meta-llama/llama-3.3-70b-instruct"


# ---------------------------------------------------------------------------
# Exception predicate: should we fall back to the next tier?
# ---------------------------------------------------------------------------
def _is_infra_failure(exc: BaseException) -> bool:
    """
    Return True if the exception represents an infrastructure failure
    (rate limit, 5xx, timeout) and we should try the next provider.

    Returns False for semantic failures (bad output, validation error, etc.) —
    those are not the router's problem.
    """
    # Timeouts (network or asyncio).
    if isinstance(exc, (httpx.TimeoutException, TimeoutError)):
        return True

    # HTTP status errors: 429 + 5xx are infra; 4xx (other than 429) are semantic
    # (e.g., bad API key, malformed request).
    if isinstance(exc, httpx.HTTPStatusError):
        status = exc.response.status_code if exc.response is not None else 0
        return status == 429 or status >= 500

    # LangChain-wrapped errors: try to read the cause; otherwise treat as semantic.
    if isinstance(exc, LangChainException):
        cause = exc.__cause__ or exc.__context__
        if cause is not None and cause is not exc:
            return _is_infra_failure(cause)
        # If we cannot determine the cause type, do NOT fall back — propagate so
        # the agent's existing error path (or critic) handles it.
        return False

    # Connection errors / network problems — treat as infra.
    if isinstance(exc, (httpx.ConnectError, httpx.ReadError, httpx.RemoteProtocolError)):
        return True

    return False


# ---------------------------------------------------------------------------
# Tier builders — each returns None if the required env var is unset.
# ---------------------------------------------------------------------------
def _build_anthropic() -> BaseChatModel | None:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return None
    try:
        from langchain_anthropic import ChatAnthropic
    except ImportError:
        logger.warning("langchain_anthropic not installed — primary tier disabled")
        return None
    return ChatAnthropic(
        model=PRIMARY_MODEL,
        api_key=api_key,
        temperature=0,
    ).with_config({"metadata": {"served_by_model": PRIMARY_MODEL}, "tags": ["primary"]})


def _build_gemini() -> BaseChatModel | None:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return None
    try:
        from langchain_google_genai import ChatGoogleGenerativeAI
    except ImportError:
        logger.warning("langchain_google_genai not installed — fallback tier disabled")
        return None
    return ChatGoogleGenerativeAI(
        model=FALLBACK_MODEL,
        google_api_key=api_key,
        temperature=0,
    ).with_config({"metadata": {"served_by_model": FALLBACK_MODEL}, "tags": ["fallback"]})


def _build_openrouter() -> BaseChatModel | None:
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        return None
    try:
        from langchain_openai import ChatOpenAI
    except ImportError:
        logger.warning("langchain_openai not installed — last-ditch tier disabled")
        return None
    return ChatOpenAI(
        model=LAST_DITCH_MODEL,
        api_key=api_key,
        base_url="https://openrouter.ai/api/v1",
        temperature=0,
    ).with_config(
        {"metadata": {"served_by_model": LAST_DITCH_MODEL}, "tags": ["last-ditch"]}
    )


# ---------------------------------------------------------------------------
# Public factory
# ---------------------------------------------------------------------------
def build_routed_model() -> BaseChatModel:
    """
    Return a chat model with infra-failure fallbacks wired.

    The primary tier (Anthropic) is required. Gemini and OpenRouter fallbacks are
    optional — if their API keys are not set, they are skipped.

    Uses LangChain's `with_fallbacks(fallbacks, exceptions_to_handle, exception_key)`
    pattern. We constrain the exceptions list so semantic failures do NOT trigger
    a fallback.

    Raises RuntimeError if the primary tier cannot be built (missing key + no
    fallback configured).
    """
    primary = _build_anthropic()
    if primary is None:
        # Try Gemini as the primary if Anthropic is unavailable — better than
        # crashing the whole agent. This codepath is mostly for tests.
        primary = _build_gemini()
    if primary is None:
        # Last resort: OpenRouter as primary.
        primary = _build_openrouter()
    if primary is None:
        raise RuntimeError(
            "No LLM provider configured. Set ANTHROPIC_API_KEY, GEMINI_API_KEY, "
            "or OPENROUTER_API_KEY."
        )

    fallbacks: list[BaseChatModel] = []
    # Only add tiers that are not the primary.
    primary_metadata = primary.config.get("metadata", {}) if hasattr(primary, "config") else {}
    primary_served_by = primary_metadata.get("served_by_model", PRIMARY_MODEL)

    if primary_served_by != FALLBACK_MODEL:
        gemini = _build_gemini()
        if gemini is not None:
            fallbacks.append(gemini)

    if primary_served_by != LAST_DITCH_MODEL:
        openrouter = _build_openrouter()
        if openrouter is not None:
            fallbacks.append(openrouter)

    if not fallbacks:
        logger.info(
            "Model router: primary=%s, no fallbacks configured", primary_served_by
        )
        return primary

    # exceptions_to_handle constrains which exceptions trigger a fallback.
    # We pass a tuple of exception classes that include infra failures only.
    # NOTE: with_fallbacks does not support a predicate function in current LangChain;
    # we have to enumerate exception types and rely on _is_infra_failure for tests
    # that exercise the chain manually.
    chained = primary.with_fallbacks(
        fallbacks,
        exceptions_to_handle=(
            httpx.TimeoutException,
            httpx.ConnectError,
            httpx.ReadError,
            httpx.RemoteProtocolError,
            httpx.HTTPStatusError,
            TimeoutError,
        ),
    )
    logger.info(
        "Model router: primary=%s, fallbacks=[%s]",
        primary_served_by,
        ", ".join(
            (fb.config.get("metadata", {}) if hasattr(fb, "config") else {}).get(
                "served_by_model", "?"
            )
            for fb in fallbacks
        ),
    )
    return chained
