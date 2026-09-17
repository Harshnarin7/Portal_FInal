#!/usr/bin/env python3
"""One-off: grant global_scientist to mannat.guliani (cross-site trial monitoring).

Run from repo root with the app venv active:
  python -m scripts.grant_global_scientist

Or create the account via POST /users/ (superadmin) with:
  role=global_scientist, site_name=null
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from db import SessionLocal
from deps import ROLE_GLOBAL_SCIENTIST
from models import User

TARGET_USERNAME = "mannat.guliani"


def main() -> int:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == TARGET_USERNAME).first()
        if not user:
            print(
                f"User '{TARGET_USERNAME}' not found. "
                "Create via POST /users/ with role=global_scientist, site_name omitted."
            )
            return 1
        user.role = ROLE_GLOBAL_SCIENTIST
        user.site_name = None
        db.commit()
        print(f"Updated {TARGET_USERNAME}: role={ROLE_GLOBAL_SCIENTIST}, site_name=NULL")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
