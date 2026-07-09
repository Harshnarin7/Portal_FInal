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
    "ALTER TABLE screenings ADD COLUMN IF NOT EXISTS reason_not_approached_other TEXT",
    "ALTER TABLE screenings ADD COLUMN IF NOT EXISTS decision_forego_resuscitation_reason_other TEXT",
    "ALTER TABLE screenings ADD COLUMN IF NOT EXISTS video_pis_shown VARCHAR",
]

COMPOSITE_OUTCOME_COLUMN_PATCHES = [
    # Issue #1 Fix 3
    "ALTER TABLE composite_outcomes ADD COLUMN IF NOT EXISTS ltfu_reason_36 TEXT",
    "ALTER TABLE composite_outcomes ADD COLUMN IF NOT EXISTS ltfu_reason_40 TEXT",
    "ALTER TABLE composite_outcomes ADD COLUMN IF NOT EXISTS ltfu_reason_44 TEXT",
]

BIRTH_RESUSCITATION_COLUMN_PATCHES = [
    "ALTER TABLE birth_resuscitation ADD COLUMN IF NOT EXISTS baby_annual_no VARCHAR",
    "ALTER TABLE birth_resuscitation ADD COLUMN IF NOT EXISTS gestation_rand_weeks INTEGER",
    "ALTER TABLE birth_resuscitation ADD COLUMN IF NOT EXISTS gestation_rand_days INTEGER",
    "ALTER TABLE birth_resuscitation ADD COLUMN IF NOT EXISTS intrauterine_centile VARCHAR",
    "ALTER TABLE birth_resuscitation ADD COLUMN IF NOT EXISTS vaginal_delivery_type VARCHAR",
    "ALTER TABLE birth_resuscitation ADD COLUMN IF NOT EXISTS lscs_type VARCHAR",
    "ALTER TABLE birth_resuscitation ADD COLUMN IF NOT EXISTS hr_above_100 BOOLEAN",
    "ALTER TABLE birth_resuscitation ADD COLUMN IF NOT EXISTS strata VARCHAR",
    "ALTER TABLE birth_resuscitation ADD COLUMN IF NOT EXISTS enrollment_reason_not_randomized TEXT",
    "ALTER TABLE birth_resuscitation ADD COLUMN IF NOT EXISTS sib_peep_with VARCHAR",
    "ALTER TABLE birth_resuscitation ADD COLUMN IF NOT EXISTS sib_peep_cmh2o DOUBLE PRECISION",
    "ALTER TABLE birth_resuscitation ADD COLUMN IF NOT EXISTS tpiece_pip DOUBLE PRECISION",
    "ALTER TABLE birth_resuscitation ADD COLUMN IF NOT EXISTS tpiece_peep DOUBLE PRECISION",
    "ALTER TABLE birth_resuscitation ADD COLUMN IF NOT EXISTS tpiece_flow DOUBLE PRECISION",
    "ALTER TABLE birth_resuscitation ADD COLUMN IF NOT EXISTS interface_used VARCHAR",
    "ALTER TABLE birth_resuscitation ADD COLUMN IF NOT EXISTS adrenaline_dilution VARCHAR",
    "ALTER TABLE birth_resuscitation ADD COLUMN IF NOT EXISTS adrenaline_route VARCHAR",
    "ALTER TABLE birth_resuscitation ADD COLUMN IF NOT EXISTS adrenaline_cumulative DOUBLE PRECISION",
    "ALTER TABLE birth_resuscitation ADD COLUMN IF NOT EXISTS cord_clamp_timestamp TIME",
    "ALTER TABLE birth_resuscitation ADD COLUMN IF NOT EXISTS cord_blood_done BOOLEAN",
    "ALTER TABLE birth_resuscitation ADD COLUMN IF NOT EXISTS cord_blood_within_1hr BOOLEAN",
    "ALTER TABLE birth_resuscitation ADD COLUMN IF NOT EXISTS cord_blood_source VARCHAR",
    "ALTER TABLE birth_resuscitation ADD COLUMN IF NOT EXISTS cord_ph DOUBLE PRECISION",
    "ALTER TABLE birth_resuscitation ADD COLUMN IF NOT EXISTS cord_sbe DOUBLE PRECISION",
    "ALTER TABLE birth_resuscitation ADD COLUMN IF NOT EXISTS cord_pco2 DOUBLE PRECISION",
    "ALTER TABLE birth_resuscitation ADD COLUMN IF NOT EXISTS interventions JSON",
    "ALTER TABLE birth_resuscitation ADD COLUMN IF NOT EXISTS fluid_bolus_doses INTEGER",
    "ALTER TABLE birth_resuscitation ADD COLUMN IF NOT EXISTS fluid_bolus_cumulative DOUBLE PRECISION",
    "ALTER TABLE birth_resuscitation ADD COLUMN IF NOT EXISTS respiration_days INTEGER",
    "ALTER TABLE birth_resuscitation ADD COLUMN IF NOT EXISTS respiration_hours INTEGER",
    "ALTER TABLE birth_resuscitation ADD COLUMN IF NOT EXISTS blender_stopped BOOLEAN",
    "ALTER TABLE birth_resuscitation ADD COLUMN IF NOT EXISTS blender_stopped_description TEXT",
    "ALTER TABLE birth_resuscitation ADD COLUMN IF NOT EXISTS indication_edf_detail TEXT",
    "ALTER TABLE birth_resuscitation ADD COLUMN IF NOT EXISTS fetal_indication_detail TEXT",
    "ALTER TABLE birth_resuscitation ADD COLUMN IF NOT EXISTS obstetric_indication_detail TEXT",
    "ALTER TABLE birth_resuscitation ADD COLUMN IF NOT EXISTS enrollment_reason_not_randomized_other TEXT",
    "ALTER TABLE birth_resuscitation ADD COLUMN IF NOT EXISTS indication_for_delivery_other TEXT",
]

NICU_ADMISSION_UNIQUE_PATCHES = [
    # FormE enrollment_id uniqueness constraint (prevent duplicate Form E submissions)
    # First, deduplicate: keep newest row per enrollment_id, delete older duplicates
    """
    WITH ranked_rows AS (
      SELECT id,
             ROW_NUMBER() OVER (PARTITION BY enrollment_id ORDER BY id DESC) as rn
      FROM nicu_admission
      WHERE enrollment_id IS NOT NULL
    )
    DELETE FROM nicu_admission
    WHERE id IN (
      SELECT id FROM ranked_rows WHERE rn > 1
    )
    """,
    # Drop constraint if it exists (idempotent)
    "ALTER TABLE nicu_admission DROP CONSTRAINT IF EXISTS nicu_admission_enrollment_id_key",
    # Add the unique constraint
    "ALTER TABLE nicu_admission ADD CONSTRAINT nicu_admission_enrollment_id_key UNIQUE (enrollment_id)",
]

POSTNATAL_DAY1_COLUMN_PATCHES = [
    "ALTER TABLE postnatal_day1 ADD COLUMN IF NOT EXISTS ga_method VARCHAR",
    "ALTER TABLE postnatal_day1 ADD COLUMN IF NOT EXISTS gender VARCHAR",
    "ALTER TABLE postnatal_day1 ADD COLUMN IF NOT EXISTS growth_status VARCHAR",
    "ALTER TABLE postnatal_day1 ADD COLUMN IF NOT EXISTS sga_centile VARCHAR",
    "ALTER TABLE postnatal_day1 ADD COLUMN IF NOT EXISTS premedication_given BOOLEAN",
    "ALTER TABLE postnatal_day1 ADD COLUMN IF NOT EXISTS premedication_drugs VARCHAR",
    "ALTER TABLE postnatal_day1 ADD COLUMN IF NOT EXISTS premedication_other VARCHAR",
]


def apply_schema_patches(engine: Engine) -> None:
    if engine.dialect.name != "postgresql":
        return
    with engine.begin() as conn:
        for stmt in SCREENING_COLUMN_PATCHES:
            conn.execute(text(stmt))
        for stmt in COMPOSITE_OUTCOME_COLUMN_PATCHES:
            conn.execute(text(stmt))
        for stmt in BIRTH_RESUSCITATION_COLUMN_PATCHES:
            conn.execute(text(stmt))
        for stmt in POSTNATAL_DAY1_COLUMN_PATCHES:
            conn.execute(text(stmt))
        for stmt in NICU_ADMISSION_UNIQUE_PATCHES:
            conn.execute(text(stmt))
