"""Unit tests for backend/rate_limit.py.

Verifies the limiter configuration constants and the custom error handler
response shape. The handler is exercised with a lightweight fake request.
"""

from types import SimpleNamespace

from slowapi import Limiter
from slowapi.errors import RateLimitExceeded

import rate_limit


def test_limiter_is_configured():
    assert isinstance(rate_limit.limiter, Limiter)


def test_rate_limit_constants():
    assert rate_limit.LOGIN_RATE_LIMIT == "5/15 minutes"
    assert rate_limit.USER_CREATION_RATE_LIMIT == "10/hour"
    assert rate_limit.GENERAL_RATE_LIMIT == "100/minute"


class _FakeLimit:
    """Minimal stand-in for slowapi's Limit object (has an error_message)."""

    error_message = "5 per 15 minutes"


def _make_request():
    # get_remote_address reads request.client.host
    return SimpleNamespace(
        client=SimpleNamespace(host="203.0.113.9"),
        url=SimpleNamespace(path="/login"),
    )


def test_rate_limit_error_handler_response_shape():
    exc = RateLimitExceeded(_FakeLimit())
    request = _make_request()

    response = rate_limit.rate_limit_error_handler(request, exc)

    assert response["error"] == "Too many requests"
    assert "maximum number of requests" in response["message"]
    assert response["detail"] == str(exc.detail)
