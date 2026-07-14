from jose import jwt, JWTError
from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session
from config import SECRET_KEY, ALGORITHM
from models import User
from db import get_db
from fastapi.security import OAuth2PasswordBearer

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


# ============================================================================
# ROLE HIERARCHY
# Superadmin -> Project Scientist (head, all sites) -> Site PI -> Site
# Scientist -> Nurse. Stored lowercase/snake_case in User.role.
# ============================================================================
ROLE_SUPERADMIN = "superadmin"
ROLE_PROJECT_SCIENTIST = "project_scientist"   # head of all sites, global read
ROLE_SITE_PI = "site_pi"
ROLE_SITE_SCIENTIST = "site_scientist"
ROLE_NURSE = "nurse"
ROLE_PII_OFFICER = "pii_officer"               # existing, unrelated to site hierarchy

ALL_ROLES = frozenset({
    ROLE_SUPERADMIN, ROLE_PROJECT_SCIENTIST, ROLE_SITE_PI,
    ROLE_SITE_SCIENTIST, ROLE_NURSE, ROLE_PII_OFFICER,
})

# Roles that can see/act across every site, not just their own site_name.
GLOBAL_ROLES = frozenset({ROLE_SUPERADMIN, ROLE_PROJECT_SCIENTIST})

# Mobile app (Flutter UserRole enum) only knows ADMIN/PI/SCIENTIST/NURSE/DEO/MONITOR.
# Both project_scientist (global) and site_scientist map to SCIENTIST; the mobile
# client tells them apart by whether site_name is null.
MOBILE_ROLE_MAP = {
    ROLE_SUPERADMIN: "ADMIN",
    ROLE_PROJECT_SCIENTIST: "SCIENTIST",
    ROLE_SITE_PI: "PI",
    ROLE_SITE_SCIENTIST: "SCIENTIST",
    ROLE_NURSE: "NURSE",
    ROLE_PII_OFFICER: "MONITOR",
}


def _role(user: User) -> str:
    return (user.role or "").lower()


def is_superadmin(user: User) -> bool:
    return _role(user) == ROLE_SUPERADMIN


def is_global(user: User) -> bool:
    """True for roles that should see data across all sites (superadmin + the
    head project scientist), regardless of their own site_name."""
    return _role(user) in GLOBAL_ROLES


def require_superadmin(user: User):
    if not is_superadmin(user):
        raise HTTPException(status_code=403, detail="Superadmin access required")


def ensure_same_site(site_name: str | None, user: User):
    if is_global(user):
        return
    if not user.site_name or site_name != user.site_name:
        raise HTTPException(status_code=403, detail="Access denied for this site")


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") == "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Use access token, not refresh token",
            )
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        )

    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=401)

    return user
