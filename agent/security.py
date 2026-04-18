"""
JWT verification for inter-service requests.

Spring Boot issues HS256 JWTs with claims {sub, exp} and a 30-second lifetime.
Every request to the agent service must carry one in the Authorization header.

CLAUDE.md §Non-negotiable #8: HS256 only, exp required, ≤60s lifetime,
options={"require": ["exp", "sub"]}.
"""

import os
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import APIKeyHeader

# Fail fast on startup if the secret is missing — never silently accept all tokens.
_SECRET = os.environ.get("INTERNAL_JWT_SECRET")
if not _SECRET:
    raise RuntimeError(
        "INTERNAL_JWT_SECRET env var is required but not set. "
        "Set it to the same 32-byte hex value used by Spring Boot."
    )

_ALGORITHM = "HS256"
INTERNAL_TOKEN_HEADER = "X-Internal-Token"

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

    return claims
