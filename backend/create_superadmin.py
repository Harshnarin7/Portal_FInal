"""
One-off bootstrap script — run this ONCE on the server after deploying the
auth update, to create your own superadmin login. Nothing else can create
a superadmin (the /users/ API requires an existing superadmin token), so
this has to be a direct DB insert.

Usage (from the backend/ folder, with your normal env vars/venv active):
    python create_superadmin.py <username> <password> [full_name]

Example:
    python create_superadmin.py harsh "S0meStr0ngPassword!" "Harsh"
"""
import sys

from db import SessionLocal, Base, engine
import models  # noqa: F401  (registers all tables on Base.metadata)
from models import User
from auth import hash_password


def main():
    if len(sys.argv) < 3:
        print("Usage: python create_superadmin.py <username> <password> [full_name]")
        sys.exit(1)

    username = sys.argv[1]
    password = sys.argv[2]
    full_name = sys.argv[3] if len(sys.argv) > 3 else username

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.username == username).first()
        if existing:
            print(f"User '{username}' already exists (id={existing.id}, role={existing.role}).")
            return

        user = User(
            username=username,
            email=None,
            hashed_password=hash_password(password),
            role="superadmin",
            site_name=None,
            full_name=full_name,
            must_change_password=False,
            is_active=True,
        )
        db.add(user)
        db.commit()
        print(f"Created superadmin '{username}'. Log in with this username/password on web or mobile.")
    finally:
        db.close()


if __name__ == "__main__":
    main()