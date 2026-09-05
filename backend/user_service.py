"""Seed login accounts for site staff (nurses + site scientists) into the
`users` table so they can log into both the web portal and the mobile app
with the same username/password.

Idempotent: existing usernames are left untouched. Newly created accounts
get a random temp password (must_change_password=True) written to a
credentials file on local disk — NOT logged, NOT committed — for the
superadmin to hand out securely and delete afterwards.
"""
import os
import secrets
import string
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from auth import hash_password
from models import User
from user_seed import DEFAULT_LOGIN_USERS, KNOWN_STAFF_EMAILS, PILOT_COMPLETED_BY_DESIGNATIONS

CREDENTIALS_DIR = os.path.join(os.path.dirname(__file__), "credentials")


def _generate_temp_password(length: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits
    while True:
        pwd = "".join(secrets.choice(alphabet) for _ in range(length - 2))
        pwd += secrets.choice(string.digits) + secrets.choice("!@#$%&*")
        if any(c.islower() for c in pwd) and any(c.isupper() for c in pwd):
            return pwd


def seed_login_users(db: Session) -> int:
    created_rows = []

    for username, full_name, role, site_name in DEFAULT_LOGIN_USERS:
        exists = db.query(User).filter(User.username == username).first()
        if exists:
            continue

        temp_password = _generate_temp_password()
        db.add(User(
            username=username,
            email=None,
            hashed_password=hash_password(temp_password),
            role=role,
            site_name=site_name,
            full_name=full_name,
            designation=PILOT_COMPLETED_BY_DESIGNATIONS.get(full_name),
            must_change_password=True,
            is_active=True,
        ))
        created_rows.append((username, full_name, role, site_name, temp_password))

    if not created_rows:
        return 0

    db.commit()

    os.makedirs(CREDENTIALS_DIR, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_path = os.path.join(CREDENTIALS_DIR, f"new_accounts_{ts}.csv")
    with open(out_path, "w") as f:
        f.write("username,full_name,role,site_name,temp_password\n")
        for row in created_rows:
            f.write(",".join(field if field is not None else "" for field in row) + "\n")

    return len(created_rows)


def backfill_pilot_designations(db: Session) -> int:
    """Set designation on the 8 hardcoded Form D/E/H names if still null.

    Schema patches run before login-user seeding on a fresh DB, so new
    accounts would otherwise come up without a designation. Idempotent.
    """
    updated = 0
    for full_name, designation in PILOT_COMPLETED_BY_DESIGNATIONS.items():
        rows = (
            db.query(User)
            .filter(User.full_name == full_name, User.designation.is_(None))
            .all()
        )
        for row in rows:
            row.designation = designation
            updated += 1
    if updated:
        db.commit()
    return updated


def backfill_staff_emails(db: Session) -> int:
    """Set known contact emails when users.email is still empty.

    Idempotent and will not overwrite an address already saved via
    Manage Staff / PUT /users/{id}. Skips if another account already
    holds that address (unique constraint).
    """
    updated = 0
    for username, email in KNOWN_STAFF_EMAILS.items():
        row = db.query(User).filter(User.username == username).first()
        if not row or row.email:
            continue
        dupe = (
            db.query(User)
            .filter(User.email == email, User.id != row.id)
            .first()
        )
        if dupe:
            continue
        row.email = email
        updated += 1
    if updated:
        db.commit()
    return updated
