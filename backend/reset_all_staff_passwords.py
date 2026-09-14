"""
PORTAL Trial — Reset passwords for all active staff (database-driven)
=====================================================================
Queries every active row in `users` (no hardcoded username list), assigns a
new random temp password, sets must_change_password=True, and writes a
timestamped CSV under backend/credentials/ for secure distribution.

By default, superadmin and project_scientist accounts are skipped. Pass
--include-admin to reset those as well.

Usage (from repo root, with backend DB env loaded):

    cd backend
    python reset_all_staff_passwords.py

    python reset_all_staff_passwords.py --role nurse
    python reset_all_staff_passwords.py --role site_scientist --role nurse
    python reset_all_staff_passwords.py --include-admin

In Docker:

    docker compose exec backend python reset_all_staff_passwords.py

Output CSVs live in backend/credentials/ (gitignored). Delete them after
distributing passwords. This script file is safe to commit; it never embeds
plaintext passwords.
"""

import argparse
import csv
import os
import sys
from collections import Counter
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(__file__))

from auth import hash_password
from db import SessionLocal
from models import User
from user_service import CREDENTIALS_DIR, _generate_temp_password

# Global / privileged roles — excluded unless --include-admin
_PRIVILEGED_ROLES = frozenset({"superadmin", "project_scientist"})


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Reset passwords for all active users (optional role filter)."
    )
    parser.add_argument(
        "--role",
        action="append",
        dest="roles",
        metavar="ROLE",
        help="Only reset users with this role (repeat flag for multiple roles).",
    )
    parser.add_argument(
        "--include-admin",
        action="store_true",
        help="Also reset superadmin and project_scientist accounts.",
    )
    return parser.parse_args()


def _site_label(site_name: str | None) -> str:
    if site_name is None or str(site_name).strip() == "":
        return "(no site)"
    return str(site_name).strip()


def run() -> None:
    args = _parse_args()
    db = SessionLocal()
    rotated: list[tuple[str, str, str, str]] = []

    print("\n" + "=" * 60)
    print("  PORTAL Trial — Reset all active staff passwords")
    print("=" * 60)
    if args.roles:
        print(f"  Role filter: {', '.join(args.roles)}")
    print(
        "  Privileged roles: "
        + ("INCLUDED (--include-admin)" if args.include_admin else "excluded (superadmin, project_scientist)")
    )

    try:
        query = db.query(User).filter(User.is_active.is_(True))
        if not args.include_admin:
            query = query.filter(~User.role.in_(list(_PRIVILEGED_ROLES)))
        if args.roles:
            query = query.filter(User.role.in_(args.roles))

        users = query.order_by(User.site_name.nullsfirst(), User.username).all()

        if not users:
            print("\n  No matching active accounts — nothing to reset.")
            return

        for user in users:
            new_password = _generate_temp_password()
            user.hashed_password = hash_password(new_password)
            user.must_change_password = True
            rotated.append(
                (
                    user.username,
                    user.full_name or "",
                    _site_label(user.site_name),
                    new_password,
                )
            )
            print(f"  🔄  {user.username}  ({user.role}, {_site_label(user.site_name)})")

        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    os.makedirs(CREDENTIALS_DIR, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_path = os.path.join(CREDENTIALS_DIR, f"reset_staff_passwords_{ts}.csv")
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["username", "full_name", "site_name", "new_password"])
        writer.writerows(rotated)

    by_site = Counter(site for _, _, site, _ in rotated)

    print("=" * 60)
    print(f"  Done. {len(rotated)} password(s) reset.")
    print(f"  CSV: {out_path}")
    print("  Accounts must change password on next login.")
    print("=" * 60)
    print("\n  By site:")
    for site, count in sorted(by_site.items(), key=lambda x: (-x[1], x[0])):
        print(f"    {count:4d}  {site}")
    print(f"\n  Total: {len(rotated)}")
    print("\n⚠️  Distribute the CSV securely, then delete it from credentials/.\n")


if __name__ == "__main__":
    run()
