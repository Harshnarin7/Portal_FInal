"""Unit tests for JWT helpers in backend/core/security.py and backend/security.py.

Both modules previously had low/zero coverage. These tests verify token
creation, claim preservation, expiry handling, and refresh-token validation.
"""

from datetime import timedelta

import pytest
from jose import jwt

from config import ALGORITHM, SECRET_KEY
import core.security as core_security
import security as legacy_security


# ---------------------------------------------------------------------------
# core.security.create_access_token
# ---------------------------------------------------------------------------


def test_create_access_token_roundtrip_and_type():
    token = core_security.create_access_token({"sub": "alice", "role": "superadmin"})
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    assert payload["sub"] == "alice"
    assert payload["role"] == "superadmin"
    assert payload["type"] == "access"
    assert "exp" in payload


def test_create_access_token_does_not_mutate_input():
    data = {"sub": "alice"}
    core_security.create_access_token(data)
    assert data == {"sub": "alice"}  # no "type"/"exp" leaked into caller dict


def test_create_access_token_custom_expiry():
    token = core_security.create_access_token(
        {"sub": "alice"}, expires_delta=timedelta(minutes=1)
    )
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    assert payload["sub"] == "alice"


# ---------------------------------------------------------------------------
# core.security.create_refresh_token
# ---------------------------------------------------------------------------


def test_create_refresh_token_has_refresh_type():
    token = core_security.create_refresh_token({"sub": "alice"})
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    assert payload["type"] == "refresh"
    assert payload["sub"] == "alice"


# ---------------------------------------------------------------------------
# core.security.decode_token
# ---------------------------------------------------------------------------


def test_decode_token_returns_claims():
    token = core_security.create_access_token({"sub": "bob"})
    assert core_security.decode_token(token)["sub"] == "bob"


def test_decode_token_rejects_expired():
    token = core_security.create_access_token(
        {"sub": "bob"}, expires_delta=timedelta(seconds=-1)
    )
    with pytest.raises(Exception):
        core_security.decode_token(token)


# ---------------------------------------------------------------------------
# core.security.verify_refresh_token
# ---------------------------------------------------------------------------


def test_verify_refresh_token_accepts_valid_refresh():
    token = core_security.create_refresh_token({"sub": "alice"})
    payload = core_security.verify_refresh_token(token)
    assert payload["sub"] == "alice"
    assert payload["type"] == "refresh"


def test_verify_refresh_token_rejects_access_token():
    token = core_security.create_access_token({"sub": "alice"})
    with pytest.raises(ValueError, match="Not a refresh token"):
        core_security.verify_refresh_token(token)


def test_verify_refresh_token_rejects_missing_subject():
    token = core_security.create_refresh_token({"role": "superadmin"})
    with pytest.raises(ValueError, match="subject"):
        core_security.verify_refresh_token(token)


def test_verify_refresh_token_rejects_garbage():
    with pytest.raises(ValueError, match="Invalid refresh token"):
        core_security.verify_refresh_token("not-a-jwt")


# ---------------------------------------------------------------------------
# legacy security.create_access_token
# ---------------------------------------------------------------------------


def test_legacy_create_access_token_roundtrip():
    token = legacy_security.create_access_token({"sub": "carol", "role": "pii_officer"})
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    assert payload["sub"] == "carol"
    assert payload["role"] == "pii_officer"
    assert "exp" in payload


def test_legacy_create_access_token_custom_expiry_does_not_mutate():
    data = {"sub": "carol"}
    legacy_security.create_access_token(data, expires_delta=timedelta(minutes=5))
    assert data == {"sub": "carol"}
