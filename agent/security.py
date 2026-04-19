"""
JWT verification for inter-service requests.

Spring Boot issues HS256 JWTs with claims {sub, exp} and a 30-second lifetime.
Every request to the agent service must carry one in the Authorization header.

CLAUDE.md §Non-negotiable #8: HS256 only, exp required, ≤60s lifetime,
options={"require": ["exp", "sub"]}.

M5: surfaces optional `daily_cap_usd` and `monthly_cap_usd` claims so
BudgetGuardMiddleware can read them via get_config() without round-tripping
to Supabase. Older tokens that pre-date M5 do not include these claims; we
default them to a high fallback (DEFAULT_CAP_USD) and log WARNING so a
partial-deploy window is observable but does not break paying users.
"""

import logging
import os
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import APIKeyHeader

logger = logging.getLogger(__name__)

# Fail fast on startup if the secret is missing — never silently accept all tokens.
_SECRET = os.environ.get("INTERNAL_JWT_SECRET")
if not _SECRET:
    raise RuntimeError(
        "INTERNAL_JWT_SECRET env var is required but not set. "
        "Set it to the same 32-byte hex value used by Spring Boot."
    )

_ALGORITHM = "HS256"
INTERNAL_TOKEN_HEADER = "X-Internal-Token"

# Fallback when JWT does not carry cap claims (e.g., partial-deploy window where
# Spring is still on the M4 InternalTokenIssuer). Effectively "uncapped" — caps
# at this level imply BudgetGuard never fires from a missing-claim path.
DEFAULT_CAP_USD = 1000.0

# auto_error=False so we return our own 401 (not FastAPI's default 403) on missing header.
_token_header = APIKeyHeader(name=INTERNAL_TOKEN_HEADER, auto_error=False)


def verify_internal_jwt(
    token: Annotated[str | None, Depends(_token_header)],
) -> dict:
    """
    FastAPI dependency: validate the X-Internal-Token JWT and return decoded claims.

    Per docs/agent-sse-contract.md and CLAUDE.md §Architecture, Spring Boot sends the
    HS256 JWT in the `X-Internal-Token` header (not `Authorization: Bearer`).

    Raises HTTP 401 on any validation failure (missing header, bad signature,
    expired token, missing required claims).
    """
    if not token:
        raise HTTPException(
            status_code=401,
            detail=f"Missing {INTERNAL_TOKEN_HEADER} header",
        )

    try:
        claims = jwt.decode(
            token,
            _SECRET,
            algorithms=[_ALGORITHM],
            options={"require": ["exp", "sub"]},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.MissingRequiredClaimError as exc:
        raise HTTPException(status_code=401, detail=f"Missing required claim: {exc}")
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=401, detail=f"Invalid token: {exc}")

    # M5: surface daily/monthly USD caps from JWT custom claims so BudgetGuard
    # can read them via get_config() without a Supabase round-trip. Older tokens
    # (M4 InternalTokenIssuer) do not include these claims — default to a
    # large value and log WARNING. This keeps a partial-deploy window observable.
    if "daily_cap_usd" not in claims or "monthly_cap_usd" not in claims:
        logger.warning(
            "JWT missing cap claims (daily_cap_usd/monthly_cap_usd) — "
            "defaulting to %.2f USD. This is expected during M4→M5 deploy; "
            "should not persist after both services are on M5.",
            DEFAULT_CAP_USD,
        )
    claims.setdefault("daily_cap_usd", DEFAULT_CAP_USD)
    claims.setdefault("monthly_cap_usd", DEFAULT_CAP_USD)

    return claims
