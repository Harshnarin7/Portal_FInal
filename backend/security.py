# from datetime import datetime, timedelta
# from jose import jwt
# from config import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES

# def create_access_token(data: dict, expires_delta: timedelta | None = None):
#     to_encode = data.copy()
#     expire = datetime.utcnow() + (
#         expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
#     )
#     to_encode.update({"exp": expire})
#     return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
# backend/core/security.py
from datetime import datetime, timedelta, timezone
from jose import jwt
from backend.config import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES


def create_access_token(data: dict, expires_delta: timedelta | None = None):
    """
    Create a JWT access token for authentication.
    
    Args:
        data: Dictionary containing token claims (e.g., {"sub": username, "role": role})
        expires_delta: Optional custom expiration time. If None, uses ACCESS_TOKEN_EXPIRE_MINUTES
    
    Returns:
        Encoded JWT token as string
    """
    to_encode = data.copy()
    
    # Use timezone-aware datetime (Python 3.12+ compatibility)
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    
    to_encode.update({"exp": expire})
    
    # Encode and sign the token
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt
