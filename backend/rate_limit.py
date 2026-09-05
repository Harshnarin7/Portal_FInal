# backend/rate_limit.py
"""
Rate limiting configuration for API endpoints.
Prevents brute force attacks on authentication endpoints.
"""

import ipaddress
import os
import logging

from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi import Request

# Configure logger
logger = logging.getLogger(__name__)


def _header(request: Request, name: str):
    """Case-insensitive header lookup (Starlette Headers or a plain dict)."""
    headers = getattr(request, "headers", None) or {}
    if hasattr(headers, "get"):
        val = headers.get(name)
        if val:
            return val
    if hasattr(headers, "items"):
        lower = name.lower()
        for key, value in headers.items():
            if str(key).lower() == lower:
                return value
    return None


def _peer_is_trusted_proxy(host: str | None) -> bool:
    """True when the TCP peer is nginx / a private LB, or TRUST_PROXY_HEADERS=1.

    Production (nginx.conf) proxies to 127.0.0.1:8000, so request.client.host
    is loopback. Direct exposure (docker-compose ports: 8000, local uvicorn)
    is a public or unspecified peer — do not trust client-supplied
    X-Forwarded-For, or anyone can spoof their rate-limit key.
    """
    if os.getenv("TRUST_PROXY_HEADERS", "").strip().lower() in ("1", "true", "yes"):
        return True
    if not host:
        return False
    if host in ("localhost", "unix"):
        return True
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return False
    return bool(ip.is_loopback or ip.is_private)


def get_real_client_ip(request: Request) -> str:
    """Client IP for rate-limiting and security_monitor logs.

    Production sits behind nginx (see nginx.conf): it sets X-Real-IP to
    $remote_addr and appends to X-Forwarded-For. Those headers are only
    trusted when the immediate peer is a loopback/private address (the
    proxy hop). Otherwise this is get_remote_address(request).

    Prefer X-Real-IP: nginx overwrites it with the TCP client, so it is
    not spoofable through the proxy. Then the first X-Forwarded-For hop,
    which is the value the user asked to key on when a trusted proxy is
    in front.
    """
    peer = None
    client = getattr(request, "client", None)
    if client is not None:
        peer = getattr(client, "host", None)

    if _peer_is_trusted_proxy(peer):
        real_ip = _header(request, "x-real-ip")
        if real_ip:
            return str(real_ip).strip()
        forwarded = _header(request, "x-forwarded-for")
        if forwarded:
            return str(forwarded).split(",")[0].strip()

    return get_remote_address(request)


# ============================================================================
# RATE LIMITER SETUP
# ============================================================================
# Using the real client IP (via trusted-proxy headers when applicable)
limiter = Limiter(
    key_func=get_real_client_ip,
    default_limits=["200 per day", "50 per hour"],  # Default limits for all endpoints
    strategy="moving-window"  # More accurate than fixed window
)

# ============================================================================
# RATE LIMIT CONFIGURATIONS
# ============================================================================

# Maximum login attempts: 5 attempts per 15 minutes per IP
LOGIN_RATE_LIMIT = "5/15 minutes"

# User creation: 10 per hour per IP (superadmin only, so stricter)
USER_CREATION_RATE_LIMIT = "10/hour"

# General API calls: 100 per minute per IP
GENERAL_RATE_LIMIT = "100/minute"

# ============================================================================
# ERROR HANDLER
# ============================================================================

def rate_limit_error_handler(request: Request, exc: RateLimitExceeded):
    """
    Custom error handler for rate limit exceeded.
    Logs the event and returns user-friendly error message.
    """
    client_ip = get_real_client_ip(request)
    logger.warning(f"⚠️ Rate limit exceeded for IP: {client_ip}, path: {request.url.path}")
    
    return {
        "error": "Too many requests",
        "message": "You have exceeded the maximum number of requests. Please try again later.",
        "detail": str(exc.detail)
    }

# ============================================================================
# RATE LIMIT CONFIGURATIONS
# ============================================================================

# Maximum login attempts: 5 attempts per 15 minutes per IP
LOGIN_RATE_LIMIT = "5/15 minutes"

# User creation: 10 per hour per IP (superadmin only, so stricter)
USER_CREATION_RATE_LIMIT = "10/hour"

# General API calls: 100 per minute per IP
GENERAL_RATE_LIMIT = "100/minute"

# ============================================================================
# ERROR HANDLER
# ============================================================================

def rate_limit_error_handler(request: Request, exc: RateLimitExceeded):
    """
    Custom error handler for rate limit exceeded.
    Logs the event and returns user-friendly error message.
    """
    client_ip = get_real_client_ip(request)
    logger.warning(f"⚠️ Rate limit exceeded for IP: {client_ip}, path: {request.url.path}")
    
    return {
        "error": "Too many requests",
        "message": "You have exceeded the maximum number of requests. Please try again later.",
        "detail": str(exc.detail)
    }
