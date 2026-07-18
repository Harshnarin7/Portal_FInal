"""
PORTAL Trial — Remove/Deactivate generic role-based accounts
==============================================================
Run once, after confirming the named individual accounts
(from user_seed.py) are working, to retire the generic
shared accounts created by seed_all_users.py.

    docker compose exec backend python deactivate_generic_users.py

DELETE THIS FILE after running.

Default behavior: DEACTIVATE (is_active=False) — accounts can no longer
log in, but stay in the database so historical records created under
these usernames still show who did what.

To hard-delete instead (irreversible — only do this if you're sure no
records were ever created under these accounts, e.g. they were only
ever used for testing), set HARD_DELETE = True below.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from db import SessionLocal
from models import User

HARD_DELETE = False  # set True only if you're sure — see docstring above

# Usernames created by seed_all_users.py
GENERIC_USERNAMES = [
    "portal_admin",
    "pi_pgimer", "scientist_pgimer", "nurse_pgimer", "monitor_pgimer",
    "pi_gmch", "scientist_gmch", "nurse_gmch", "monitor_gmch",
    "pi_gmcha", "scientist_gmcha", "nurse_gmcha", "monitor_gmcha",
    "pi_amc", "scientist_amc", "nurse_amc", "monitor_amc",
    "pi_iog", "scientist_iog", "nurse_iog", "monitor_iog",
    # "deo_*" usernames were never created (dropped from the fixed seed
    # script since "deo" isn't a recognized role) — nothing to remove there.
]


def run():
    db = SessionLocal()
    affected = 0

    print("\n" + "="*60)
    print(f"  PORTAL Trial — {'Deleting' if HARD_DELETE else 'Deactivating'} generic accounts")
    print("="*60)

    for username in GENERIC_USERNAMES:
        user = db.query(User).filter(User.username == username).first()
        if not user:
            print(f"  —  NOT FOUND  {username}")
            continue

        if HARD_DELETE:
            db.delete(user)
            print(f"  🗑️  DELETED     {username}")
        else:
            user.is_active = False
            print(f"  🔒  DEACTIVATED {username}")
        affected += 1

    db.commit()
    db.close()

    print("="*60)
    print(f"  Done. {affected} account(s) {'deleted' if HARD_DELETE else 'deactivated'}.")
    print("="*60)
    print("\n⚠️  DELETE this file now: rm deactivate_generic_users.py\n")


if __name__ == "__main__":
    run()
