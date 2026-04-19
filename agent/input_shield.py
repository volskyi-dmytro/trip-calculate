"""
Input shield — second-line prompt injection defense (M5).

The first line is Spring's PromptInjectionFilter (called in AgentController).
This module is the second line: it inspects the most recent HumanMessage in
the LangGraph state immediately before each model call and replaces matching
content with a fixed safe string. It NEVER raises — the agent continues with
the sanitized message so the user gets a graceful response rather than a 500.

Pattern source: mirror of Spring's PromptInjectionFilter.DENY_PATTERNS.
We replicate (not import) because Java and Python regex engines differ slightly
in syntax. If new patterns are added on the Spring side, mirror them here too.
The Spring file is the authoritative source.

CLAUDE.md §Critical Security Features:
  - Length cap: 4096 chars (matches AgentChatRequest.message Pydantic max_length).
  - Control-char strip: [U+0000–U+001F] except \n and \t.
  - Deny-list of jailbreak patterns.
"""

from __future__ import annotations

import re

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
MAX_LENGTH = 4096
SAFE_REPLACEMENT = "[input rejected by safety filter]"

# Control chars except \n (0x0A) and \t (0x09) — mirrors Spring's CONTROL_CHARS.
_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]")

# Long consecutive non-whitespace blob (possible base64 / encoded payload).
_LONG_BLOB = re.compile(r"\S{512,}")

# Deny patterns — mirror of PromptInjectionFilter.DENY_PATTERNS.
# Compiled with re.IGNORECASE | re.UNICODE.
_DENY_PATTERNS: list[re.Pattern[str]] = [
    re.compile(
        r"ignore\s+(?:everything|all\s+prior\s+context|all\s+previous|all\s+instructions|all|previous|prior|above)\s*(?:context|instructions?|prompts?|rules?|directives?|system)?",
        re.IGNORECASE | re.UNICODE,
    ),
    re.compile(
        r"ignore\s+(?:[\w]+\s+){0,3}(?:previous|all|prior|above|preceding|earlier)\s+(?:[\w]+\s+){0,3}(?:instructions?|prompts?|context|rules?|directives?|system)",
        re.IGNORECASE | re.UNICODE,
    ),
    re.compile(
        r"disregard\s+(?:[\w]+\s+){0,3}(?:previous|all|prior|above)\s+(?:instructions?|prompts?|context)",
        re.IGNORECASE | re.UNICODE,
    ),
    re.compile(r"forget\s+(?:everything|all|previous|prior|your|the)", re.IGNORECASE | re.UNICODE),
    re.compile(r"you\s+are\s+now\s+", re.IGNORECASE | re.UNICODE),
    re.compile(
        r"act\s+as\s+(a\s+)?(different|new|unrestricted|unconstrained|evil|hacked|jailbreak)",
        re.IGNORECASE | re.UNICODE,
    ),
    re.compile(r"pretend\s+(?:you\s+are|to\s+be)", re.IGNORECASE | re.UNICODE),
    re.compile(r"roleplay\s+as\s+", re.IGNORECASE | re.UNICODE),
    re.compile(
        r"(reveal|show|print|output|repeat|tell\s+me)\s+(your\s+)?(system\s+prompt|instructions|initial\s+prompt|prompt\s+template)",
        re.IGNORECASE | re.UNICODE,
    ),
    re.compile(
        r"what\s+(are|were|is)\s+your\s+(original\s+)?(instructions?|system\s+prompt)",
        re.IGNORECASE | re.UNICODE,
    ),
    re.compile(r"\bDAN\b", re.IGNORECASE | re.UNICODE),
    re.compile(r"developer\s+mode", re.IGNORECASE | re.UNICODE),
    re.compile(r"jailbreak", re.IGNORECASE | re.UNICODE),
    re.compile(r"</?(system|user|assistant|human)>", re.IGNORECASE | re.UNICODE),
    re.compile(
        r"\[\s*INST\s*\]|\[/?\s*SYS\s*\]|<\|im_start\|>|<\|im_end\|>",
        re.IGNORECASE | re.UNICODE,
    ),
    re.compile(r"ignore\s+token\s+limit", re.IGNORECASE | re.UNICODE),
    re.compile(
        r"bypass\s+(content\s+)?(filter|moderation|safety|policy|restriction)",
        re.IGNORECASE | re.UNICODE,
    ),
    re.compile(
        r"(disable|turn\s+off|override)\s+(safety|filter|content\s+policy|moderation)",
        re.IGNORECASE | re.UNICODE,
    ),
    re.compile(
        r"(send|leak|exfil(trate)?|transmit)\s+(the\s+)?(training|private|confidential|secret|internal)\s+data",
        re.IGNORECASE | re.UNICODE,
    ),
    re.compile(r"repeat\s+(the\s+)?(text|words|content|message)\s+above", re.IGNORECASE | re.UNICODE),
]


def shield(content: str) -> tuple[str, str | None]:
    """
    Apply the input shield to a single message string.

    Returns (sanitized_content, reason).
      - reason is None if the input passed through unchanged.
      - reason is one of {"length", "blob", "deny_list_match"} if the content
        was replaced with SAFE_REPLACEMENT.

    Control-character stripping is silent (no reason returned for that alone) —
    it matches Spring's behavior.
    """
    if not isinstance(content, str) or not content:
        return content, None

    # Length cap.
    if len(content) > MAX_LENGTH:
        return SAFE_REPLACEMENT, "length"

    # Strip control characters silently.
    cleaned = _CONTROL_CHARS.sub("", content)

    # Long blob check.
    if _LONG_BLOB.search(cleaned):
        return SAFE_REPLACEMENT, "blob"

    # Deny-list patterns (case-insensitive).
    lower = cleaned.lower()
    for pattern in _DENY_PATTERNS:
        if pattern.search(lower):
            return SAFE_REPLACEMENT, "deny_list_match"

    return cleaned, None
