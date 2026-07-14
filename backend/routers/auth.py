"""
Authentication endpoints shared by the web portal and the Flutter mobile app.

Both clients hit the same backend/users table, so one set of credentials
works everywhere. This router exists to satisfy the request/response shape
the mobile app (lib/services/auth_service.dart) already expects, while
staying backward compatible with the simpler {username, password} shape the
web login form sends.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.util import get_remote_address

from auth import hash_password, verify_password
from core.security import create_access_token, create_refresh_token, verify_refresh_token
from config import ACCESS_TOKEN_EXPIRE_MINUTES
from db import get_db
from deps import get_current_user, MOBILE_ROLE_MAP
from models import User
from schemas import (
    LoginRequest,
    LoginResponse,
    UserProfileOut,
    ChangePasswordRequest,
    RefreshTokenRequest,
    TokenRefreshResponse,
)
import security_monitor

router = APIRouter(prefix="/auth", tags=["Auth"])
limiter = Limiter(key_func=get_remote_address)


def _to_profile(user: User) -> UserProfileOut:
    return UserProfileOut(
        id=str(user.id),
        username=user.username,
        email=user.email or "",
        full_name=user.full_name or user.username,
        mobile=user.mobile,
        role=MOBILE_ROLE_MAP.get((user.role or "").lower(), "NURSE"),
        site_id=user.site_name,
        site_name=user.site_name,
        must_change_password=bool(user.must_change_password),
        last_login_at=user.last_login_at.isoformat() if user.last_login_at else None,
    )


@router.post("/login", response_model=LoginResponse)
@limiter.limit("5/15 minutes")
async def login(request: Request, data: LoginRequest, db: Session = Depends(get_db)):
    """Rate-limited login. Accepts either `username` (web) or
    `email_or_username` (+ device metadata, mobile) — same backing table
    either way, so one login works on both apps."""
    identifier = data.identifier()
    client_ip = get_remote_address(request)

    user = (
        db.query(User)
        .filter((User.username == identifier) | (User.email == identifier))
        .first()
    )

    if not user or not verify_password(data.password, user.hashed_password):
        security_monitor.record_failed_login(client_ip, identifier)
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not user.is_active:
        raise HTTPException(status_code=401, detail="Account is deactivated")

    security_monitor.record_successful_login(user.username, client_ip)
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)

    claims = {"sub": user.username, "role": user.role, "site_name": user.site_name}
    access_token = create_access_token(claims)
    refresh_token = create_refresh_token(claims)

    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        role=user.role,
        site_name=user.site_name,
        expires_in_minutes=ACCESS_TOKEN_EXPIRE_MINUTES,
        user=_to_profile(user),
    )


@router.post("/refresh", response_model=TokenRefreshResponse)
def refresh_access_token(body: RefreshTokenRequest, db: Session = Depends(get_db)):
    try:
        payload = verify_refresh_token(body.refresh_token)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    user = db.query(User).filter(User.username == payload["sub"]).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")

    claims = {"sub": user.username, "role": user.role, "site_name": user.site_name}
    return TokenRefreshResponse(access_token=create_access_token(claims))


@router.get("/me", response_model=UserProfileOut)
def get_me(current_user: User = Depends(get_current_user)):
    return _to_profile(current_user)


@router.post("/logout")
def logout(current_user: User = Depends(get_current_user)):
    # JWTs are stateless and short-lived (8h access / 7d refresh); nothing
    # server-side to revoke today. Endpoint exists so both clients can call
    # it unconditionally and clear their local tokens.
    return {"message": "Logged out"}


@router.post("/change-password")
def change_password(
    body: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    if body.new_password != body.confirm_password:
        raise HTTPException(status_code=400, detail="New passwords do not match")
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")

    current_user.hashed_password = hash_password(body.new_password)
    current_user.must_change_password = False
    db.commit()
    return {"message": "Password updated"}
