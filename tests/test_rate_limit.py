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


def _make_request(host="203.0.113.9", headers=None):
    # get_real_client_ip reads request.client.host, then forwarded headers
    # only when the peer is a trusted proxy (loopback/private).
    return SimpleNamespace(
        client=SimpleNamespace(host=host),
        url=SimpleNamespace(path="/login"),
        headers=headers or {},
    )


def test_direct_client_ignores_spoofed_forwarded_for():
    """A public peer (API exposed directly) must not trust X-Forwarded-For."""
    request = _make_request(
        host="8.8.8.8",
        headers={"x-forwarded-for": "198.51.100.1", "x-real-ip": "198.51.100.1"},
    )
    assert rate_limit.get_real_client_ip(request) == "8.8.8.8"


def test_trusted_proxy_uses_x_real_ip():
    request = _make_request(
        host="127.0.0.1",
        headers={"x-real-ip": "198.51.100.50", "x-forwarded-for": "198.51.100.50"},
    )
    assert rate_limit.get_real_client_ip(request) == "198.51.100.50"


def test_trusted_proxy_falls_back_to_first_x_forwarded_for():
    request = _make_request(
        host="10.0.0.2",
        headers={"x-forwarded-for": "198.51.100.77, 10.0.0.2"},
    )
    assert rate_limit.get_real_client_ip(request) == "198.51.100.77"


def test_rate_limit_error_handler_response_shape():
    exc = RateLimitExceeded(_FakeLimit())
    request = _make_request()

    response = rate_limit.rate_limit_error_handler(request, exc)

    assert response["error"] == "Too many requests"
    assert "maximum number of requests" in response["message"]
    assert response["detail"] == str(exc.detail)
