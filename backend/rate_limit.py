# backend/rate_limit.py
"""
Rate limiting configuration for API endpoints.
Prevents brute force attacks on authentication endpoints.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi import Request
import logging

# Configure logger
logger = logging.getLogger(__name__)

# ============================================================================
# RATE LIMITER SETUP
# ============================================================================
# Using IP address as the key for rate limiting
limiter = Limiter(
    key_func=get_remote_address,
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
    client_ip = get_remote_address(request)
    logger.warning(f"⚠️ Rate limit exceeded for IP: {client_ip}, path: {request.url.path}")
    
    return {
        "error": "Too many requests",
        "message": "You have exceeded the maximum number of requests. Please try again later.",
        "detail": str(exc.detail)
    }
