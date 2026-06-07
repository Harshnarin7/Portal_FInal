from jose import jwt, JWTError
from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session
from config import SECRET_KEY, ALGORITHM
from models import User
from db import get_db
from fastapi.security import OAuth2PasswordBearer

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def is_superadmin(user: User) -> bool:
    return (user.role or "").lower() == "superadmin"


def require_superadmin(user: User):
    if not is_superadmin(user):
        raise HTTPException(status_code=403, detail="Superadmin access required")


def ensure_same_site(site_name: str | None, user: User):
    if is_superadmin(user):
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
