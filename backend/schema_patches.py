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

RESP_CV_NEURO_DAY_COLUMN_PATCHES = [
    "ALTER TABLE resp_cv_neuro_day_logs ADD COLUMN IF NOT EXISTS weight_kg VARCHAR",
    "ALTER TABLE resp_cv_neuro_day_logs ADD COLUMN IF NOT EXISTS respiratory_support BOOLEAN",
    "ALTER TABLE resp_cv_neuro_day_logs ADD COLUMN IF NOT EXISTS endotracheal_intubation BOOLEAN",
    "ALTER TABLE resp_cv_neuro_day_logs ADD COLUMN IF NOT EXISTS map_cpap DOUBLE PRECISION",
    "ALTER TABLE resp_cv_neuro_day_logs ADD COLUMN IF NOT EXISTS lowest_ph VARCHAR",
    "ALTER TABLE resp_cv_neuro_day_logs ADD COLUMN IF NOT EXISTS pao2_range VARCHAR",
    "ALTER TABLE resp_cv_neuro_day_logs ADD COLUMN IF NOT EXISTS paco2_range VARCHAR",
    "ALTER TABLE resp_cv_neuro_day_logs ADD COLUMN IF NOT EXISTS apnea_count VARCHAR",
    "ALTER TABLE resp_cv_neuro_day_logs ADD COLUMN IF NOT EXISTS desaturation_count VARCHAR",
    "ALTER TABLE resp_cv_neuro_day_logs ADD COLUMN IF NOT EXISTS severe_desaturation_count VARCHAR",
    "ALTER TABLE resp_cv_neuro_day_logs ADD COLUMN IF NOT EXISTS fluid_bolus VARCHAR",
    # Site-monitor override: temporarily reopens a locked (past/submitted) day for correction
    "ALTER TABLE resp_cv_neuro_day_logs ADD COLUMN IF NOT EXISTS override_unlocked_until TIMESTAMP",
    "ALTER TABLE resp_cv_neuro_day_logs ADD COLUMN IF NOT EXISTS override_reason TEXT",
    "ALTER TABLE resp_cv_neuro_day_logs ADD COLUMN IF NOT EXISTS override_by VARCHAR",
]

# Day 1 date is the shared anchor for every daily/NICU-day form (currently used
# by the Resp/CV/Neuro helper log) — stored once per enrollment on nicu_admission
# instead of per-browser localStorage, and locked once any daily data exists.
NICU_ADMISSION_DAY1_PATCHES = [
    "ALTER TABLE nicu_admission ADD COLUMN IF NOT EXISTS day1_date DATE",
    "ALTER TABLE nicu_admission ADD COLUMN IF NOT EXISTS day1_date_set_by VARCHAR",
    "ALTER TABLE nicu_admission ADD COLUMN IF NOT EXISTS day1_date_set_at TIMESTAMP",
]

# Helper Form 4 (Metab-Renal-Vasc-Eye) renumbered to match the paper CRF exactly
# (items 1-25, plus 4.6 Location and 4.7 Survived the day). Old columns are kept
# so existing rows/data aren't lost — they're just no longer part of the numbered
# sequence.
METAB_RENAL_VASC_EYE_COLUMN_PATCHES = [
    "ALTER TABLE metab_renal_vasc_eye_day_logs ADD COLUMN IF NOT EXISTS lowest_glucose VARCHAR",
    "ALTER TABLE metab_renal_vasc_eye_day_logs ADD COLUMN IF NOT EXISTS hypoglycemia_episodes VARCHAR",
    "ALTER TABLE metab_renal_vasc_eye_day_logs ADD COLUMN IF NOT EXISTS highest_glucose VARCHAR",
    "ALTER TABLE metab_renal_vasc_eye_day_logs ADD COLUMN IF NOT EXISTS sodium_value VARCHAR",
    "ALTER TABLE metab_renal_vasc_eye_day_logs ADD COLUMN IF NOT EXISTS potassium_value VARCHAR",
    "ALTER TABLE metab_renal_vasc_eye_day_logs ADD COLUMN IF NOT EXISTS ionized_calcium_value VARCHAR",
    "ALTER TABLE metab_renal_vasc_eye_day_logs ADD COLUMN IF NOT EXISTS aki_stage VARCHAR",
    "ALTER TABLE metab_renal_vasc_eye_day_logs ADD COLUMN IF NOT EXISTS urine_output_total VARCHAR",
    "ALTER TABLE metab_renal_vasc_eye_day_logs ADD COLUMN IF NOT EXISTS axillary_temperature VARCHAR",
    "ALTER TABLE metab_renal_vasc_eye_day_logs ADD COLUMN IF NOT EXISTS location VARCHAR",
    "ALTER TABLE metab_renal_vasc_eye_day_logs ADD COLUMN IF NOT EXISTS survived_the_day BOOLEAN",
]


USERS_COLUMN_PATCHES = [
    # Auth/role-hierarchy rollout: username-only login, temp-password flow,
    # and the fields the Flutter app's UserProfile model already expects.
    "ALTER TABLE users ALTER COLUMN email DROP NOT NULL",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile VARCHAR",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT TRUE",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP",
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
        for stmt in RESP_CV_NEURO_DAY_COLUMN_PATCHES:
            conn.execute(text(stmt))
        for stmt in NICU_ADMISSION_DAY1_PATCHES:
            conn.execute(text(stmt))
        for stmt in NICU_ADMISSION_UNIQUE_PATCHES:
            conn.execute(text(stmt))
        for stmt in METAB_RENAL_VASC_EYE_COLUMN_PATCHES:
            conn.execute(text(stmt))
        for stmt in USERS_COLUMN_PATCHES:
            conn.execute(text(stmt))
        for stmt in MATERNAL_DETAILS_COLUMN_PATCHES:
            conn.execute(text(stmt))
        for stmt in POSTNATAL_DAY1_COLUMN_PATCHES_V2:
            conn.execute(text(stmt))
        for stmt in NICU_ADMISSION_COLUMN_PATCHES_V2:
            conn.execute(text(stmt))
        for stmt in INFECT_GI_HEMA_COLUMN_PATCHES:
            conn.execute(text(stmt))

# New fields added post-July-15 deploy — found missing in production 2026-07-19
# (caused 500 errors on Form D load, Form B NICU fields, Helper 3 day logs)
MATERNAL_DETAILS_COLUMN_PATCHES = [
    "ALTER TABLE maternal_details ADD COLUMN IF NOT EXISTS artificial_other VARCHAR",
    "ALTER TABLE maternal_details ADD COLUMN IF NOT EXISTS steroid_courses VARCHAR",
    "ALTER TABLE maternal_details ADD COLUMN IF NOT EXISTS lddi_known VARCHAR",
    "ALTER TABLE maternal_details ADD COLUMN IF NOT EXISTS maternal_tachycardia VARCHAR",
    "ALTER TABLE maternal_details ADD COLUMN IF NOT EXISTS maternal_abdominal_tenderness VARCHAR",
]

POSTNATAL_DAY1_COLUMN_PATCHES_V2 = [
    "ALTER TABLE postnatal_day1 ADD COLUMN IF NOT EXISTS lisa_catheter_type VARCHAR",
    "ALTER TABLE postnatal_day1 ADD COLUMN IF NOT EXISTS device_type_other VARCHAR",
    "ALTER TABLE postnatal_day1 ADD COLUMN IF NOT EXISTS surfactant_brand_other VARCHAR",
    "ALTER TABLE postnatal_day1 ADD COLUMN IF NOT EXISTS adverse_type_other VARCHAR",
    "ALTER TABLE postnatal_day1 ADD COLUMN IF NOT EXISTS caffeine_loading BOOLEAN",
    "ALTER TABLE postnatal_day1 ADD COLUMN IF NOT EXISTS caffeine_loading_abs DOUBLE PRECISION",
    "ALTER TABLE postnatal_day1 ADD COLUMN IF NOT EXISTS caffeine_maint_abs DOUBLE PRECISION",
    "ALTER TABLE postnatal_day1 ADD COLUMN IF NOT EXISTS caffeine_date DATE",
    "ALTER TABLE postnatal_day1 ADD COLUMN IF NOT EXISTS caffeine_time VARCHAR",
]

NICU_ADMISSION_COLUMN_PATCHES_V2 = [
    "ALTER TABLE nicu_admission ADD COLUMN IF NOT EXISTS temp_dr DOUBLE PRECISION",
    "ALTER TABLE nicu_admission ADD COLUMN IF NOT EXISTS transport_cpap DOUBLE PRECISION",
    "ALTER TABLE nicu_admission ADD COLUMN IF NOT EXISTS transport_pip DOUBLE PRECISION",
    "ALTER TABLE nicu_admission ADD COLUMN IF NOT EXISTS transport_peep DOUBLE PRECISION",
    "ALTER TABLE nicu_admission ADD COLUMN IF NOT EXISTS transport_map DOUBLE PRECISION",
    "ALTER TABLE nicu_admission ADD COLUMN IF NOT EXISTS nicu_cpap DOUBLE PRECISION",
    "ALTER TABLE nicu_admission ADD COLUMN IF NOT EXISTS nicu_pip DOUBLE PRECISION",
    "ALTER TABLE nicu_admission ADD COLUMN IF NOT EXISTS nicu_peep DOUBLE PRECISION",
    "ALTER TABLE nicu_admission ADD COLUMN IF NOT EXISTS nicu_map DOUBLE PRECISION",
]

INFECT_GI_HEMA_COLUMN_PATCHES = [
    "ALTER TABLE infect_gi_hema_day_logs ADD COLUMN IF NOT EXISTS meningitis BOOLEAN",
    "ALTER TABLE infect_gi_hema_day_logs ADD COLUMN IF NOT EXISTS meningitis_type VARCHAR",
    "ALTER TABLE infect_gi_hema_day_logs ADD COLUMN IF NOT EXISTS men BOOLEAN",
    "ALTER TABLE infect_gi_hema_day_logs ADD COLUMN IF NOT EXISTS enteral_feeds_received BOOLEAN",
    "ALTER TABLE infect_gi_hema_day_logs ADD COLUMN IF NOT EXISTS feed_type VARCHAR",
    "ALTER TABLE infect_gi_hema_day_logs ADD COLUMN IF NOT EXISTS cumulative_feed_volume DOUBLE PRECISION",
    "ALTER TABLE infect_gi_hema_day_logs ADD COLUMN IF NOT EXISTS iv_fluids BOOLEAN",
    "ALTER TABLE infect_gi_hema_day_logs ADD COLUMN IF NOT EXISTS cholestasis BOOLEAN",
    "ALTER TABLE infect_gi_hema_day_logs ADD COLUMN IF NOT EXISTS hb_value DOUBLE PRECISION",
]
