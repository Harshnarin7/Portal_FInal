"""
One-time migration: encrypts existing plaintext participant_pii values now
that models.py uses EncryptedString (see crypto.py). Also sweeps any
straggler screenings rows that still hold legacy PII (the startup
migrate_legacy_pii() sweep hasn't caught 100% of them in practice).

Safe to re-run: already-encrypted values decrypt successfully via
crypto.decrypt_value() and are written back as themselves (re-encrypted
under the same key, not double-encrypted, since we always read the
decrypted plaintext off the ORM object before re-saving).

Run once from backend folder, after models.py + schema_patches.py changes
are deployed and the backend has restarted (so EncryptedString + the
widened columns are both live):

    python migrate_pii_encryption.py
"""

from sqlalchemy.orm.attributes import flag_modified

from db import SessionLocal
from models import ParticipantPII
from pii_service import migrate_legacy_pii

ENCRYPTED_FIELDS = [
    "mother_first_name", "mother_surname", "husband_first_name", "husband_surname",
    "maternal_uid", "hospital_admission_number", "mother_contact", "husband_contact",
    "address", "email_address", "house", "city", "district", "state",
    "pincode", "landmark", "baby_name", "contact_mother", "contact_husband",
]


def main():
    db = SessionLocal()
    try:
        swept = migrate_legacy_pii(db)
        print(f"Swept {swept} straggler screenings row(s) with legacy PII into participant_pii")

        rows = db.query(ParticipantPII).all()
        print(f"Found {len(rows)} participant_pii row(s) to check")

        touched = 0
        for row in rows:
            row_changed = False
            for field in ENCRYPTED_FIELDS:
                value = getattr(row, field)  # already decrypted by EncryptedString on read
                if value is not None and value != "":
                    setattr(row, field, value)
                    flag_modified(row, field)  # force UPDATE even though Python value is unchanged
                    row_changed = True
            if row_changed:
                touched += 1

        db.commit()
        print(f"Re-encrypted fields on {touched} row(s)")
    finally:
        db.close()


if __name__ == "__main__":
    main()
