"""Idempotent PostgreSQL schema patches for existing deployments."""

from sqlalchemy import text
from sqlalchemy.engine import Engine


SCREENING_COLUMN_PATCHES = [
    "ALTER TABLE screenings ADD COLUMN IF NOT EXISTS created_by VARCHAR",
    "ALTER TABLE screenings ADD COLUMN IF NOT EXISTS updated_by VARCHAR",
    "ALTER TABLE screenings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP",
    "ALTER TABLE screenings ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE",
    "ALTER TABLE screenings ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP",
    "ALTER TABLE screenings ADD COLUMN IF NOT EXISTS deleted_by VARCHAR",
    "ALTER TABLE screenings ADD COLUMN IF NOT EXISTS consent_datetime TIMESTAMP",
    "ALTER TABLE screenings ADD COLUMN IF NOT EXISTS consent_form_version VARCHAR",
    "ALTER TABLE screenings ADD COLUMN IF NOT EXISTS consent_language VARCHAR",
    "ALTER TABLE screenings ADD COLUMN IF NOT EXISTS consent_obtained_by_signature VARCHAR",
    "ALTER TABLE screenings ADD COLUMN IF NOT EXISTS reconsent_obtained BOOLEAN DEFAULT FALSE",
    "ALTER TABLE screenings ADD COLUMN IF NOT EXISTS reconsent_datetime TIMESTAMP",
    "ALTER TABLE screenings ADD COLUMN IF NOT EXISTS reconsent_form_version VARCHAR",
    # Issue #1 Fix 1
    "ALTER TABLE screenings ADD COLUMN IF NOT EXISTS reason_for_consent_refusal TEXT",
    "ALTER TABLE screenings ADD COLUMN IF NOT EXISTS reason_for_consent_refusal_other TEXT",
]

COMPOSITE_OUTCOME_COLUMN_PATCHES = [
    # Issue #1 Fix 3
    "ALTER TABLE composite_outcomes ADD COLUMN IF NOT EXISTS ltfu_reason_36 TEXT",
    "ALTER TABLE composite_outcomes ADD COLUMN IF NOT EXISTS ltfu_reason_40 TEXT",
    "ALTER TABLE composite_outcomes ADD COLUMN IF NOT EXISTS ltfu_reason_44 TEXT",
]


def apply_schema_patches(engine: Engine) -> None:
    if engine.dialect.name != "postgresql":
        return
    with engine.begin() as conn:
        for stmt in SCREENING_COLUMN_PATCHES:
            conn.execute(text(stmt))
        for stmt in COMPOSITE_OUTCOME_COLUMN_PATCHES:
            conn.execute(text(stmt))
