"""
PORTAL Trial — Rotate compromised passwords
==============================================
Run this after the credentials CSV leak — resets every account that was
in the leaked new_accounts_20260714T083654Z.csv to a fresh random
password and forces a change on next login, since the old passwords
must be treated as compromised (they were in a public GitHub repo).

    docker compose exec backend python rotate_leaked_passwords.py

DELETE THIS FILE after running, and DELETE/secure the output CSV it
writes once you've distributed the new passwords — don't let this one
end up committed either.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from datetime import datetime, timezone
from db import SessionLocal
from models import User
from auth import hash_password
from user_service import _generate_temp_password, CREDENTIALS_DIR

# Every username that appeared in the leaked CSV
LEAKED_USERNAMES = [
    "shalini.pgimer", "geetika.pgimer", "tanvi.pgimer", "seemran.pgimer",
    "priyanka.pgimer", "navkiran.pgimer", "yashvi.pgimer",
    "kirti.gmcha", "samiksha.gmcha", "pratiksha.gmcha", "saurabh.gmcha",
    "nandini.gmcha", "varad.gmcha", "ankita.gmcha",
    "manpreet.gmch", "anosh.gmch", "vanika.gmch", "muskan.gmch",
    "arzoo.gmch", "arushi.gmch",
    "nafifa.amc", "oli.amc", "bristina.amc", "pompy.amc",
    "rajashree.amc", "supriya.amc",
    "sobhana.iog", "immanuel.iog", "poovaran.iog", "kanmani.iog",
    "durgadevi.iog", "keerthana.iog", "durga.iog",
]


def run():
    db = SessionLocal()
    rotated = []

    print("\n" + "="*60)
    print("  PORTAL Trial — Rotating leaked passwords")
    print("="*60)

    for username in LEAKED_USERNAMES:
        user = db.query(User).filter(User.username == username).first()
        if not user:
            print(f"  —  NOT FOUND  {username}")
            continue

        new_password = _generate_temp_password()
        user.hashed_password = hash_password(new_password)
        user.must_change_password = True
        db.commit()
        rotated.append((username, user.full_name or "", new_password))
        print(f"  🔄  ROTATED  {username}")

    db.close()

    if not rotated:
        print("\nNo matching accounts found — nothing rotated.")
        return

    os.makedirs(CREDENTIALS_DIR, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_path = os.path.join(CREDENTIALS_DIR, f"rotated_passwords_{ts}.csv")
    with open(out_path, "w") as f:
        f.write("username,full_name,new_password\n")
        for row in rotated:
            f.write(",".join(row) + "\n")

    print("="*60)
    print(f"  Done. {len(rotated)} password(s) rotated.")
    print(f"  New passwords written to: {out_path}")
    print("  Every one of these accounts will be forced to set their own")
    print("  password the next time they log in.")
    print("="*60)
    print("\n⚠️  Distribute new passwords securely, then delete this CSV")
    print("⚠️  and delete this script: rm rotate_leaked_passwords.py\n")


if __name__ == "__main__":
    run()
