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
]


def apply_schema_patches(engine: Engine) -> None:
    if engine.dialect.name != "postgresql":
        return
    with engine.begin() as conn:
        for stmt in SCREENING_COLUMN_PATCHES:
            conn.execute(text(stmt))
