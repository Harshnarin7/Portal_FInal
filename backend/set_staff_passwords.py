"""
One-off admin script: bulk-set passwords for EXISTING staff accounts from a
CSV file (username, full_name, new_password).

This does NOT create accounts — it only updates the password of a user that
already exists (matched by username). If a username in the CSV has no
matching row in the `users` table, it's reported and skipped, not created.

Run this on the same machine/container that can reach the production
database (same DATABASE_URL your backend uses).

Usage:
    cd backend
    python set_staff_passwords.py /path/to/passwords.csv

CSV format (header required):
    username,full_name,new_password
    shalini.pgimer,Dr. Shalini Dhiman,SomePassword1!
    ...

After running, delete the CSV file — don't leave plaintext passwords sitting
on disk.
"""
import csv
import sys

from auth import hash_password
from db import SessionLocal
from models import User


def main(csv_path: str):
    updated, missing = [], []
    db = SessionLocal()
    try:
        with open(csv_path, newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                username = row["username"].strip()
                new_password = row["new_password"].strip()

                user = db.query(User).filter(User.username == username).first()
                if not user:
                    missing.append(username)
                    continue

                user.hashed_password = hash_password(new_password)
                # These are deliberately chosen final passwords (not random
                # temp ones), so don't force an immediate change screen.
                user.must_change_password = False
                updated.append(username)

        db.commit()
    finally:
        db.close()

    print(f"Updated {len(updated)} account(s):")
    for u in updated:
        print(f"  - {u}")

    if missing:
        print(f"\nNOT FOUND in users table (skipped, nothing created):")
        for u in missing:
            print(f"  - {u}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python set_staff_passwords.py /path/to/passwords.csv")
        sys.exit(1)
    main(sys.argv[1])
