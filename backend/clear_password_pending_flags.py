"""
One-off: clear must_change_password for staff who already use their own password.

The Manage Staff UI only clears this flag automatically when someone completes
/auth/change-password after login. If passwords were distributed manually (mass
reset script, shared temp passwords in use without the change-password screen),
the directory will still show "Password change pending" until you fix the flags.

Usage (from backend/):
  python clear_password_pending_flags.py --username deo_pgimer
  python clear_password_pending_flags.py --site PGIMER
  python clear_password_pending_flags.py --all-active   # requires --yes
"""
from __future__ import annotations

import argparse

from db import SessionLocal
from models import User


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--username", action="append", default=[], help="Clear for username(s)")
    p.add_argument("--site", help="Clear for all active users at this site_name")
    p.add_argument("--all-active", action="store_true", help="Clear for every active account")
    p.add_argument("--yes", action="store_true", help="Required with --all-active")
    args = p.parse_args()

    if not args.username and not args.site and not args.all_active:
        p.error("Specify --username, --site, or --all-active")

    if args.all_active and not args.yes:
        p.error("Pass --yes to confirm --all-active")

    db = SessionLocal()
    try:
        q = db.query(User).filter(User.is_active.is_(True))
        if args.username:
            q = q.filter(User.username.in_(args.username))
        elif args.site:
            q = q.filter(User.site_name == args.site)
        users = q.all()
        n = 0
        for u in users:
            if u.must_change_password:
                u.must_change_password = False
                n += 1
        db.commit()
        print(f"Cleared must_change_password on {n} account(s) (of {len(users)} matched).")
    finally:
        db.close()


if __name__ == "__main__":
    main()
