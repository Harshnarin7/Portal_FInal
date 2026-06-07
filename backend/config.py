# SECRET_KEY = "PORTAL_TRIAL_SUPER_SECRET_2026"
# ALGORITHM = "HS256"
# ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24
import os
from datetime import timedelta

# ============================================================================
# SECURITY CONFIGURATION
# ============================================================================

# Read SECRET_KEY from environment variable (critical for token generation)
# Must be set in .env file with a strong, randomly generated string
SECRET_KEY = os.getenv(
    "SECRET_KEY",
    "dev-only-insecure-key-change-in-production"  # Fallback for development only
)

if SECRET_KEY == "dev-only-insecure-key-change-in-production":
    import warnings
    warnings.warn(
        "⚠️  WARNING: Using default SECRET_KEY. In production, set SECRET_KEY in .env file.",
        RuntimeWarning
    )

ALGORITHM = "HS256"

# ============================================================================
# TOKEN EXPIRY CONFIGURATION
# ============================================================================
# Reduced from 24 hours to 8 hours for better security
# Idle sessions will expire faster, reducing risk of unauthorized access
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 8  # 8 hours (was 24)

# For token refresh mechanism (optional, future implementation)
REFRESH_TOKEN_EXPIRE_DAYS = 7
