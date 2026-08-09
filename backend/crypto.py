"""Field-level encryption for participant_pii, via AWS KMS envelope encryption.

A single Data Encryption Key (DEK) is generated once via KMS and stored,
KMS-encrypted, as PII_ENCRYPTED_DEK in .env. On first use the backend calls
kms:Decrypt (via the EC2 instance role) to recover the plaintext DEK into
memory only — it is never written to disk. That DEK drives Fernet
(AES-128-CBC + HMAC) encryption for individual column values.

EncryptedString is a SQLAlchemy TypeDecorator: any Column(EncryptedString)
is transparently encrypted on write and decrypted on read for every ORM
access, with no changes needed at call sites. Raw SQL (db.execute(text(...)))
bypasses this — see decrypt_value() for that path (used once, in main.py's
address rejoin query).
"""

import base64
import os

import boto3
from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy.types import String, TypeDecorator

_fernet = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        encrypted_dek_b64 = os.environ.get("PII_ENCRYPTED_DEK")
        if not encrypted_dek_b64:
            raise RuntimeError(
                "PII_ENCRYPTED_DEK not set in the environment — cannot "
                "encrypt/decrypt participant PII. Generate one via "
                "`aws kms generate-data-key` and store the ciphertext blob."
            )
        ciphertext_blob = base64.b64decode(encrypted_dek_b64)
        kms = boto3.client("kms", region_name=os.environ.get("AWS_REGION", "ap-south-1"))
        dek = kms.decrypt(CiphertextBlob=ciphertext_blob)["Plaintext"]
        _fernet = Fernet(base64.urlsafe_b64encode(dek))
    return _fernet


def decrypt_value(value: str | None) -> str | None:
    """Decrypt a single value fetched via raw SQL (bypasses the ORM type system)."""
    if value is None or value == "":
        return value
    try:
        return _get_fernet().decrypt(value.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError):
        # Not a Fernet token — a legacy plaintext value not yet migrated.
        return value


class EncryptedString(TypeDecorator):
    """String column that is Fernet-encrypted at rest.

    Falls back to returning legacy plaintext unchanged on decrypt failure,
    so any row not yet covered by the one-time migration keeps working
    instead of 500ing.
    """

    impl = String
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None or value == "":
            return value
        return _get_fernet().encrypt(value.encode("utf-8")).decode("ascii")

    def process_result_value(self, value, dialect):
        return decrypt_value(value)
