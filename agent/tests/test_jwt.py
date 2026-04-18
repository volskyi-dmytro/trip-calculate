"""
JWT security tests.

Covers:
- Valid token accepted
- Expired token rejected with 401
- Token missing `sub` claim rejected
- Token missing `exp` claim rejected
- Missing X-Internal-Token header rejected
- Wrong secret rejected
"""

import time

import jwt
import pytest
from fastapi import HTTPException

_TEST_SECRET = "test-secret-32-bytes-xxxxxxxxxx"


@pytest.fixture(autouse=True)
def _patch_secret(monkeypatch):
    monkeypatch.setenv("INTERNAL_JWT_SECRET", _TEST_SECRET)


def _make_token(
    secret: str = _TEST_SECRET,
    algorithm: str = "HS256",
    sub: str = "user-123",
    exp_offset: int = 30,
    include_sub: bool = True,
    include_exp: bool = True,
) -> str:
    payload: dict = {}
    if include_sub:
        payload["sub"] = sub
    if include_exp:
        payload["exp"] = int(time.time()) + exp_offset
    return jwt.encode(payload, secret, algorithm=algorithm)


class TestVerifyInternalJwt:
    def _get_verifier(self):
        import sys
        # Force reload so the module re-reads the patched env var.
        if "security" in sys.modules:
            del sys.modules["security"]
        import security
        return security.verify_internal_jwt

    def test_valid_token_accepted(self):
        verifier = self._get_verifier()
        claims = verifier(_make_token())
        assert claims["sub"] == "user-123"

    def test_expired_token_rejected(self):
        verifier = self._get_verifier()
        with pytest.raises(HTTPException) as exc_info:
            verifier(_make_token(exp_offset=-2))
        assert exc_info.value.status_code == 401
        assert "expired" in exc_info.value.detail.lower()

    def test_missing_sub_rejected(self):
        verifier = self._get_verifier()
        with pytest.raises(HTTPException) as exc_info:
            verifier(_make_token(include_sub=False))
        assert exc_info.value.status_code == 401

    def test_missing_exp_rejected(self):
        verifier = self._get_verifier()
        token = jwt.encode({"sub": "user-123"}, _TEST_SECRET, algorithm="HS256")
        with pytest.raises(HTTPException) as exc_info:
            verifier(token)
        assert exc_info.value.status_code == 401

    def test_missing_header_rejected(self):
        verifier = self._get_verifier()
        with pytest.raises(HTTPException) as exc_info:
            verifier(None)
        assert exc_info.value.status_code == 401

    def test_wrong_secret_rejected(self):
        verifier = self._get_verifier()
        token = _make_token(secret="completely-different-secret-xxx")
        with pytest.raises(HTTPException) as exc_info:
            verifier(token)
        assert exc_info.value.status_code == 401
