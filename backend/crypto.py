"""Field-level encryption for participant_pii, via AWS KMS envelope encryption.

Production: a Data Encryption Key (DEK) is generated once via KMS and stored,
KMS-encrypted, as PII_ENCRYPTED_DEK in .env. On first use the backend calls
kms:Decrypt (via the EC2 instance role) to recover the plaintext DEK into
memory only — it is never written to disk. That DEK drives Fernet
(AES-128-CBC + HMAC) encryption for individual column values.

Local development: set PII_LOCAL_FERNET_KEY to a Fernet key
(`python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`)
OR leave it unset in ENVIRONMENT=development and a stable key is derived
from SECRET_KEY (dev only — never use that path in production).

EncryptedString is a SQLAlchemy TypeDecorator: any Column(EncryptedString)
is transparently encrypted on write and decrypted on read for every ORM
access, with no changes needed at call sites. Raw SQL (db.execute(text(...)))
bypasses this — see decrypt_value() for that path (used once, in main.py's
address rejoin query).
"""

import base64
import hashlib
import logging
import os
from pathlib import Path as _Path

# Ensure backend/.env is loaded even if this module is imported before db.py.
try:
    from dotenv import load_dotenv
    load_dotenv(_Path(__file__).resolve().parent / ".env")
except ImportError:
    pass


from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy.types import String, TypeDecorator

logger = logging.getLogger(__name__)

_fernet = None

# Fernet keys are exactly 32 raw bytes (AES-128 + HMAC-SHA256 halves) — not
# a range, an exact requirement. The DEK comes from `aws kms generate-data-key
# --key-spec AES_256`; if that's ever re-run with a different --key-spec by
# mistake, fail with a clear message here rather than a confusing low-level
# error the first time a PII field is touched.
_FERNET_KEY_LEN = 32

# Fernet's minimum token length for ANY plaintext (even "") is 100 base64
# chars: 1 version byte + 8 timestamp + 16 IV + 16 ciphertext (min one
# PKCS7-padded AES block) + 32 HMAC = 73 raw bytes, base64-encoded.
_FERNET_MIN_TOKEN_LEN = 100


def _is_plausible_fernet_token(value: str) -> bool:
    """Best-effort shape check: could `value` possibly be a Fernet token?

    Fernet.decrypt() raises the same InvalidToken for "not a token at all"
    and "structurally a token but fails HMAC/version verification" --
    deliberately, so a decrypt failure never leaks *why* it failed (avoids
    a padding-oracle-style attack). That means the exception type alone
    can't tell legacy plaintext apart from genuinely corrupted ciphertext.
    This shape check is the next-best signal: real PII values (names,
    phone numbers, addresses) essentially never happen to be >=100 chars
    of pure base64 with no spaces/punctuation, so a value that passes this
    check but still fails decrypt() is a real corruption signal, not an
    expected legacy-plaintext row.
    """
    if len(value) < _FERNET_MIN_TOKEN_LEN:
        return False
    try:
        base64.urlsafe_b64decode(value.encode("ascii"))
        return True
    except Exception:
        return False


def _is_local_dev() -> bool:
    env = (os.environ.get("ENVIRONMENT") or os.environ.get("ENV") or "development").strip().lower()
    return env in {"development", "dev", "local", "test"}


def _fernet_from_local_key(key_b64: str) -> Fernet:
    """Accept a url-safe base64 Fernet key (output of Fernet.generate_key())."""
    key = key_b64.strip().encode("ascii")
    raw = base64.urlsafe_b64decode(key)
    if len(raw) != _FERNET_KEY_LEN:
        raise RuntimeError(
            f"PII_LOCAL_FERNET_KEY decodes to {len(raw)} bytes, expected {_FERNET_KEY_LEN}. "
            "Generate with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )
    return Fernet(key)


def _fernet_from_kms(encrypted_dek_b64: str) -> Fernet:
    import boto3
    from botocore.config import Config

    # Bound KMS so a slow/unresponsive service fails fast instead of hanging
    # the first PII read after a worker restart.
    kms_config = Config(
        connect_timeout=5,
        read_timeout=10,
        retries={"mode": "standard", "total_max_attempts": 3},
    )
    ciphertext_blob = base64.b64decode(encrypted_dek_b64)
    kms = boto3.client(
        "kms",
        region_name=os.environ.get("AWS_REGION", "ap-south-1"),
        config=kms_config,
    )
    dek = kms.decrypt(CiphertextBlob=ciphertext_blob)["Plaintext"]
    if len(dek) != _FERNET_KEY_LEN:
        raise RuntimeError(
            f"Decrypted PII data-encryption-key is {len(dek)} bytes, "
            f"expected exactly {_FERNET_KEY_LEN} (Fernet/AES-256 requires "
            "this exactly, not a range). Regenerate PII_ENCRYPTED_DEK via "
            "`aws kms generate-data-key --key-spec AES_256`."
        )
    return Fernet(base64.urlsafe_b64encode(dek))


def _fernet_from_secret_key() -> Fernet:
    """Stable local-only Fernet key derived from SECRET_KEY."""
    secret = os.environ.get("SECRET_KEY") or "dev-only-insecure-key-change-in-production"
    dek = hashlib.sha256(f"portal-pii-local::{secret}".encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(dek))


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        encrypted_dek_b64 = (os.environ.get("PII_ENCRYPTED_DEK") or "").strip()
        local_key = (os.environ.get("PII_LOCAL_FERNET_KEY") or "").strip()

        if encrypted_dek_b64:
            _fernet = _fernet_from_kms(encrypted_dek_b64)
        elif local_key:
            logger.warning(
                "Using PII_LOCAL_FERNET_KEY for participant PII encryption "
                "(local/dev). Do not use this in production."
            )
            _fernet = _fernet_from_local_key(local_key)
        else:
            # No KMS DEK configured — always allow a local key so Form A can
            # save on developer machines. Production must set PII_ENCRYPTED_DEK.
            env = (os.environ.get("ENVIRONMENT") or "development").strip().lower()
            if env in {"production", "prod", "staging"}:
                logger.error(
                    "PII_ENCRYPTED_DEK is not set while ENVIRONMENT=%s — "
                    "falling back to a SECRET_KEY-derived local key. "
                    "Configure PII_ENCRYPTED_DEK (KMS) before real patient data.",
                    env,
                )
            else:
                logger.warning(
                    "PII_ENCRYPTED_DEK / PII_LOCAL_FERNET_KEY not set — "
                    "deriving a local PII key from SECRET_KEY (ENVIRONMENT=%s).",
                    env,
                )
            _fernet = _fernet_from_secret_key()
    return _fernet


def decrypt_value(value: str | None) -> str | None:
    """Decrypt a single value fetched via raw SQL (bypasses the ORM type system)."""
    if value is None or value == "":
        return value
    try:
        return _get_fernet().decrypt(value.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError):
        # Fernet can't tell us *why* decryption failed (see
        # _is_plausible_fernet_token docstring) — most failures here are the
        # expected case, a legacy plaintext row not yet covered by
        # migrate_pii_encryption.py. But a value that's shaped like a real
        # token and still fails is a corruption signal worth surfacing: if
        # this row is ever written back unchanged (e.g. a migration re-run),
        # the corrupted value gets re-encrypted and permanently obscured.
        if _is_plausible_fernet_token(value):
            logger.error(
                "PII decrypt: value is shaped like a Fernet token (len=%d) "
                "but failed decryption — likely corrupted ciphertext, a "
                "tampered value, or a KMS DEK mismatch. Returning as-is; "
                "investigate before this row is next written, since a "
                "write would re-encrypt the corrupted value.",
                len(value),
            )
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
