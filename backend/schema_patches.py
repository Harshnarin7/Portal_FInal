"""Idempotent PostgreSQL schema patches for existing deployments."""

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)


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
    # gestation_known/ga_source: previously the "Yes/No" answer to
    # "Gestation in weeks clearly mentioned?" was never persisted at all —
    # the frontend guessed it back from gestation_weeks on reload, which is
    # populated on BOTH the known and auto-calculated (EDD/LMP) paths, so a
    # saved "No" silently reappeared as "Yes". These two columns store the
    # actual answer and the actual GA-derivation method so reload no longer
    # has to guess.
    "ALTER TABLE screenings ADD COLUMN IF NOT EXISTS gestation_known VARCHAR",
    "ALTER TABLE screenings ADD COLUMN IF NOT EXISTS ga_source VARCHAR",
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
    "ALTER TABLE resp_cv_neuro_day_logs ADD COLUMN IF NOT EXISTS map_cpap_status VARCHAR",
    "ALTER TABLE resp_cv_neuro_day_logs ADD COLUMN IF NOT EXISTS map_cpap_secondary DOUBLE PRECISION",
    "ALTER TABLE resp_cv_neuro_day_logs ADD COLUMN IF NOT EXISTS map_cpap_secondary_status VARCHAR",
    "ALTER TABLE resp_cv_neuro_day_logs ADD COLUMN IF NOT EXISTS max_fio2_status VARCHAR",
    "ALTER TABLE resp_cv_neuro_day_logs ADD COLUMN IF NOT EXISTS max_flow_status VARCHAR",
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
    # Multi-entry reading JSON + creatinine string + urine windows (CRF redesign)
    "ALTER TABLE metab_renal_vasc_eye_day_logs ADD COLUMN IF NOT EXISTS ph_readings_json TEXT",
    "ALTER TABLE metab_renal_vasc_eye_day_logs ADD COLUMN IF NOT EXISTS sodium_readings_json TEXT",
    "ALTER TABLE metab_renal_vasc_eye_day_logs ADD COLUMN IF NOT EXISTS potassium_readings_json TEXT",
    "ALTER TABLE metab_renal_vasc_eye_day_logs ADD COLUMN IF NOT EXISTS calcium_readings_json TEXT",
    "ALTER TABLE metab_renal_vasc_eye_day_logs ADD COLUMN IF NOT EXISTS creatinine_value VARCHAR",
    "ALTER TABLE metab_renal_vasc_eye_day_logs ADD COLUMN IF NOT EXISTS urine_output_8am_2pm DOUBLE PRECISION",
    "ALTER TABLE metab_renal_vasc_eye_day_logs ADD COLUMN IF NOT EXISTS urine_output_2pm_8pm DOUBLE PRECISION",
    "ALTER TABLE metab_renal_vasc_eye_day_logs ADD COLUMN IF NOT EXISTS urine_output_8pm_8am DOUBLE PRECISION",
    # "Result Awaited" / "Not Recorded / Not Done" status sidecars for the
    # urine output windows (2026-08-24, helper-form missing-value options)
    "ALTER TABLE metab_renal_vasc_eye_day_logs ADD COLUMN IF NOT EXISTS urine_output_8am_2pm_status VARCHAR",
    "ALTER TABLE metab_renal_vasc_eye_day_logs ADD COLUMN IF NOT EXISTS urine_output_2pm_8pm_status VARCHAR",
    "ALTER TABLE metab_renal_vasc_eye_day_logs ADD COLUMN IF NOT EXISTS urine_output_8pm_8am_status VARCHAR",
    # Superadmin override: temporarily reopens a locked (past/submitted) day
    # for correction — same columns as resp_cv_neuro_day_logs, added here
    # 2026-08-23 alongside the matching backend endpoint (this form never
    # had one despite the frontend already calling it).
    "ALTER TABLE metab_renal_vasc_eye_day_logs ADD COLUMN IF NOT EXISTS override_unlocked_until TIMESTAMP",
    "ALTER TABLE metab_renal_vasc_eye_day_logs ADD COLUMN IF NOT EXISTS override_reason TEXT",
    "ALTER TABLE metab_renal_vasc_eye_day_logs ADD COLUMN IF NOT EXISTS override_by VARCHAR",
]

MINIMAL_MONITORING_TABLE_PATCHES = [
    """
    CREATE TABLE IF NOT EXISTS minimal_monitoring_day_logs (
        id SERIAL PRIMARY KEY,
        enrollment_id VARCHAR NOT NULL,
        nicu_day INTEGER,
        record_date VARCHAR,
        shift VARCHAR,
        axillary_temp DOUBLE PRECISION,
        sbp DOUBLE PRECISION,
        dbp DOUBLE PRECISION,
        map_value DOUBLE PRECISION,
        fluid_bolus_given VARCHAR,
        vasoactive_drugs VARCHAR,
        vasoactive_dose VARCHAR,
        vasoactive_unit VARCHAR,
        pda_agent VARCHAR,
        pda_dose VARCHAR,
        respiratory_time VARCHAR,
        respiratory_modes VARCHAR,
        max_map_cpap DOUBLE PRECISION,
        max_fio2 DOUBLE PRECISION,
        ph DOUBLE PRECISION,
        pao2 DOUBLE PRECISION,
        paco2 DOUBLE PRECISION,
        apnea_episodes INTEGER,
        desaturation_episodes INTEGER,
        severe_desaturation_episodes INTEGER,
        postnatal_steroids VARCHAR,
        steroid_dose VARCHAR,
        glucose DOUBLE PRECISION,
        alp DOUBLE PRECISION,
        total_calcium DOUBLE PRECISION,
        phosphorus DOUBLE PRECISION,
        electrolyte_abnormality BOOLEAN,
        electrolytes VARCHAR,
        hypo_hyper VARCHAR,
        symptomatic_status VARCHAR,
        symptomatic_detail VARCHAR,
        cumulative_feed_volume DOUBLE PRECISION,
        direct_bilirubin DOUBLE PRECISION,
        imaging_date VARCHAR,
        ventriculomegaly_severity VARCHAR,
        vi DOUBLE PRECISION,
        ahw DOUBLE PRECISION,
        tod DOUBLE PRECISION,
        aca_ri DOUBLE PRECISION,
        mca_ri DOUBLE PRECISION,
        transfusion_products VARCHAR,
        transfusion_count INTEGER,
        prbc_volume DOUBLE PRECISION,
        submission_status VARCHAR DEFAULT 'empty',
        saved_at TIMESTAMP,
        saved_by VARCHAR,
        submitted_at TIMESTAMP,
        submitted_by VARCHAR,
        created_at TIMESTAMP,
        updated_at TIMESTAMP
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_minimal_monitoring_day_logs_enrollment_id ON minimal_monitoring_day_logs (enrollment_id)",
    "CREATE INDEX IF NOT EXISTS ix_minimal_monitoring_day_logs_nicu_day ON minimal_monitoring_day_logs (nicu_day)",
    "ALTER TABLE minimal_monitoring_day_logs ADD COLUMN IF NOT EXISTS entries_json TEXT",
    "ALTER TABLE minimal_monitoring_day_logs ADD COLUMN IF NOT EXISTS steroid_other VARCHAR",
    "ALTER TABLE minimal_monitoring_day_logs ADD COLUMN IF NOT EXISTS apnea_shift VARCHAR",
    "ALTER TABLE minimal_monitoring_day_logs ADD COLUMN IF NOT EXISTS feed_shift VARCHAR",
    # Same-day scratchpad keying: (enrollment_id, record_date). Keep nicu_day for
    # backward compatibility but stop requiring it; never submit/lock this form.
    "ALTER TABLE minimal_monitoring_day_logs ALTER COLUMN nicu_day DROP NOT NULL",
    """
    CREATE UNIQUE INDEX IF NOT EXISTS uq_minimal_monitoring_enrollment_date
    ON minimal_monitoring_day_logs (enrollment_id, record_date)
    WHERE record_date IS NOT NULL
    """,
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
    """Applies every `*_PATCHES` list defined at module level.

    Patch groups are auto-discovered (via globals(), at call time — so
    definition order in the file doesn't matter) rather than called out
    individually here. This is deliberate: with two people (admin + Harsh)
    both adding patch lists to this file independently, a hand-maintained
    call list means every addition edits the *same* lines, guaranteeing a
    merge conflict on every sync. To add a new patch: just define a new
    `SOMETHING_PATCHES = [...]` list anywhere in this file — nothing else
    needs to change. Groups run in alphabetical-by-name order and cross-group
    ordering is not relied on (no group depends on a column/table added by
    another group in the same run).

    Each group runs in its own transaction, not one transaction for the
    whole function. Most statements here are self-guarding (ADD COLUMN IF
    NOT EXISTS / CREATE TABLE IF NOT EXISTS) and can't fail under normal
    conditions, but not all of them can be written that way — Postgres has
    no IF EXISTS form for ALTER COLUMN ... TYPE, for instance. A single
    shared transaction means one such statement failing (e.g. against a
    table that doesn't exist yet on a fresh/rebuilt DB) would silently roll
    back every other group's already-applied patches too, and main.py's
    caller only logs a warning on failure — the backend would then start
    with a mostly unpatched schema instead of just missing the one group
    that actually failed. Isolating transactions per group means a bad
    group only costs that group; everything else still applies.
    """
    if engine.dialect.name != "postgresql":
        return
    patch_groups = {
        name: value
        for name, value in globals().items()
        if name.endswith("_PATCHES") and isinstance(value, list)
    }
    for name in sorted(patch_groups):
        try:
            with engine.begin() as conn:
                for stmt in patch_groups[name]:
                    conn.execute(text(stmt))
        except Exception:
            logger.exception("Schema patch group %s failed; other groups still applied", name)

# New fields added post-July-15 deploy — found missing in production 2026-07-19
# (caused 500 errors on Form D load, Form B NICU fields, Helper 3 day logs)
MATERNAL_DETAILS_COLUMN_PATCHES = [
    "ALTER TABLE maternal_details ADD COLUMN IF NOT EXISTS artificial_other VARCHAR",
    "ALTER TABLE maternal_details ADD COLUMN IF NOT EXISTS steroid_courses VARCHAR",
    "ALTER TABLE maternal_details ADD COLUMN IF NOT EXISTS steroid_courses_status VARCHAR",
    "ALTER TABLE maternal_details ADD COLUMN IF NOT EXISTS multiple_other VARCHAR",
    "ALTER TABLE maternal_details ADD COLUMN IF NOT EXISTS lddi_known VARCHAR",
    "ALTER TABLE maternal_details ADD COLUMN IF NOT EXISTS maternal_tachycardia VARCHAR",
    "ALTER TABLE maternal_details ADD COLUMN IF NOT EXISTS maternal_abdominal_tenderness VARCHAR",
    "ALTER TABLE maternal_details ADD COLUMN IF NOT EXISTS hypothyroidism BOOLEAN DEFAULT FALSE",
    "ALTER TABLE maternal_details ADD COLUMN IF NOT EXISTS hyperthyroidism BOOLEAN DEFAULT FALSE",
    "ALTER TABLE maternal_details ADD COLUMN IF NOT EXISTS explicitly_saved BOOLEAN DEFAULT FALSE",
    # Form C antenatal steroids — per-drug dose / completed-course tracking
    "ALTER TABLE maternal_details ADD COLUMN IF NOT EXISTS steroid_beta_doses INTEGER",
    "ALTER TABLE maternal_details ADD COLUMN IF NOT EXISTS steroid_dexa_doses INTEGER",
    "ALTER TABLE maternal_details ADD COLUMN IF NOT EXISTS steroid_beta_courses INTEGER",
    "ALTER TABLE maternal_details ADD COLUMN IF NOT EXISTS steroid_dexa_courses INTEGER",
    # Form C — per-drug LDDI (last dose to delivery interval), used when both
    # Betamethasone and Dexamethasone were given, since combined LDDI is
    # ambiguous once the two drugs' last doses can fall on different days
    "ALTER TABLE maternal_details ADD COLUMN IF NOT EXISTS steroid_beta_lddi_known VARCHAR",
    "ALTER TABLE maternal_details ADD COLUMN IF NOT EXISTS steroid_beta_lddi_hours VARCHAR",
    "ALTER TABLE maternal_details ADD COLUMN IF NOT EXISTS steroid_dexa_lddi_known VARCHAR",
    "ALTER TABLE maternal_details ADD COLUMN IF NOT EXISTS steroid_dexa_lddi_hours VARCHAR",
]

SCREENING_SAVE_STATE_PATCHES = [
    "ALTER TABLE screenings ADD COLUMN IF NOT EXISTS explicitly_saved BOOLEAN DEFAULT FALSE",
]

POSTNATAL_DAY1_V2_COLUMN_PATCHES = [
    "ALTER TABLE postnatal_day1 ADD COLUMN IF NOT EXISTS lisa_catheter_type VARCHAR",
    "ALTER TABLE postnatal_day1 ADD COLUMN IF NOT EXISTS lisa_catheter_other VARCHAR",
    "ALTER TABLE postnatal_day1 ADD COLUMN IF NOT EXISTS device_type_other VARCHAR",
    "ALTER TABLE postnatal_day1 ADD COLUMN IF NOT EXISTS surfactant_brand_other VARCHAR",
    "ALTER TABLE postnatal_day1 ADD COLUMN IF NOT EXISTS adverse_type_other VARCHAR",
    "ALTER TABLE postnatal_day1 ADD COLUMN IF NOT EXISTS caffeine_loading BOOLEAN",
    "ALTER TABLE postnatal_day1 ADD COLUMN IF NOT EXISTS caffeine_loading_abs DOUBLE PRECISION",
    "ALTER TABLE postnatal_day1 ADD COLUMN IF NOT EXISTS caffeine_maint_abs DOUBLE PRECISION",
    "ALTER TABLE postnatal_day1 ADD COLUMN IF NOT EXISTS caffeine_date DATE",
    "ALTER TABLE postnatal_day1 ADD COLUMN IF NOT EXISTS caffeine_time VARCHAR",
]

NICU_ADMISSION_V2_COLUMN_PATCHES = [
    "ALTER TABLE nicu_admission ADD COLUMN IF NOT EXISTS temp_dr DOUBLE PRECISION",
    "ALTER TABLE nicu_admission ADD COLUMN IF NOT EXISTS transport_cpap DOUBLE PRECISION",
    "ALTER TABLE nicu_admission ADD COLUMN IF NOT EXISTS transport_pip DOUBLE PRECISION",
    "ALTER TABLE nicu_admission ADD COLUMN IF NOT EXISTS transport_peep DOUBLE PRECISION",
    "ALTER TABLE nicu_admission ADD COLUMN IF NOT EXISTS transport_map DOUBLE PRECISION",
    "ALTER TABLE nicu_admission ADD COLUMN IF NOT EXISTS nicu_cpap DOUBLE PRECISION",
    "ALTER TABLE nicu_admission ADD COLUMN IF NOT EXISTS nicu_pip DOUBLE PRECISION",
    "ALTER TABLE nicu_admission ADD COLUMN IF NOT EXISTS nicu_peep DOUBLE PRECISION",
    "ALTER TABLE nicu_admission ADD COLUMN IF NOT EXISTS nicu_map DOUBLE PRECISION",
    # Distinguishes an explicitly-completed record (Save clicked, full
    # validation passed) from one that only exists because the 10s
    # background autosave silently persisted an in-progress draft —
    # reopening the latter should stay editable, not lock until Edit.
    "ALTER TABLE nicu_admission ADD COLUMN IF NOT EXISTS finalized BOOLEAN DEFAULT FALSE",
]

BIRTH_RESUSCITATION_SAVE_STATE_PATCHES = [
    "ALTER TABLE birth_resuscitation ADD COLUMN IF NOT EXISTS explicitly_saved BOOLEAN DEFAULT FALSE",
]

INFECT_GI_HEMA_COLUMN_PATCHES = [
    "ALTER TABLE infect_gi_hema_day_logs ADD COLUMN IF NOT EXISTS meningitis BOOLEAN",
    "ALTER TABLE infect_gi_hema_day_logs ADD COLUMN IF NOT EXISTS meningitis_type VARCHAR",
    "ALTER TABLE infect_gi_hema_day_logs ADD COLUMN IF NOT EXISTS blood_culture_status VARCHAR",
    "ALTER TABLE infect_gi_hema_day_logs ADD COLUMN IF NOT EXISTS men BOOLEAN",
    "ALTER TABLE infect_gi_hema_day_logs ADD COLUMN IF NOT EXISTS enteral_feeds_received BOOLEAN",
    "ALTER TABLE infect_gi_hema_day_logs ADD COLUMN IF NOT EXISTS feed_type VARCHAR",
    "ALTER TABLE infect_gi_hema_day_logs ADD COLUMN IF NOT EXISTS cumulative_feed_volume DOUBLE PRECISION",
    "ALTER TABLE infect_gi_hema_day_logs ADD COLUMN IF NOT EXISTS cumulative_feed_volume_status VARCHAR",
    "ALTER TABLE infect_gi_hema_day_logs ADD COLUMN IF NOT EXISTS feed_volume_status VARCHAR",
    "ALTER TABLE infect_gi_hema_day_logs ADD COLUMN IF NOT EXISTS iv_fluids BOOLEAN",
    "ALTER TABLE infect_gi_hema_day_logs ADD COLUMN IF NOT EXISTS cholestasis BOOLEAN",
    "ALTER TABLE infect_gi_hema_day_logs ADD COLUMN IF NOT EXISTS hb_value DOUBLE PRECISION",
    "ALTER TABLE infect_gi_hema_day_logs ADD COLUMN IF NOT EXISTS hb_value_status VARCHAR",
    "ALTER TABLE infect_gi_hema_day_logs ADD COLUMN IF NOT EXISTS peak_tsb_status VARCHAR",
    # Superadmin override: temporarily reopens a locked (past/submitted) day
    # for correction — same columns as resp_cv_neuro_day_logs, added here
    # 2026-08-23 alongside the matching backend endpoint (this form never
    # had one despite the frontend already calling it).
    "ALTER TABLE infect_gi_hema_day_logs ADD COLUMN IF NOT EXISTS override_unlocked_until TIMESTAMP",
    "ALTER TABLE infect_gi_hema_day_logs ADD COLUMN IF NOT EXISTS override_reason TEXT",
    "ALTER TABLE infect_gi_hema_day_logs ADD COLUMN IF NOT EXISTS override_by VARCHAR",
    # Sepsis screen capture — added 2026-08-23 to support Form H's Infection
    # auto-fill distinguishing clinical vs. screen-positive vs.
    # culture-positive sepsis (PI-specified rule, no fixed antibiotic-duration
    # proxy for screen result — needs the actual screen entered).
    "ALTER TABLE infect_gi_hema_day_logs ADD COLUMN IF NOT EXISTS sepsis_screen_sent BOOLEAN",
    "ALTER TABLE infect_gi_hema_day_logs ADD COLUMN IF NOT EXISTS sepsis_screens_json TEXT",
]
# Form H (Neonatal Morbidities) — full CRF field set, applied 2026-07-28
# via migrate_neonatal_morbidities.sql; mirrored here so future fresh/stale
# deployments (new site DB, disaster recovery, etc.) pick these up automatically.
NEONATAL_MORBIDITIES_COLUMN_PATCHES = [
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS ivh BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS ivh_side VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS ivh_grade VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS ivh_date DATE",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS ivh_age_days INTEGER",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pvhi BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS phh BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS vp_shunt BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pvl BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pvl_side VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pvl_grade VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pvl_date DATE",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS ventriculomegaly BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS ventriculomegaly_severity VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS max_vi_mm DOUBLE PRECISION",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS ahw_mm DOUBLE PRECISION",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS tod_mm DOUBLE PRECISION",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS aca_ri DOUBLE PRECISION",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS mca_ri DOUBLE PRECISION",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS seizures BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS seizure_date DATE",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS seizure_type VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS status_epilepticus BOOLEAN",  # CRF #31
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS eeg VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS aeds_required BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS aed_name VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS seizure_etiology VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS non_ivh_ich BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS non_ivh_ich_type VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS meningitis BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS meningitis_type VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS meningitis_date DATE",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS csf_culture VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS csf_organism VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS bpd BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS bpd_grade VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS oxygen_days INTEGER",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS vent_days INTEGER",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS cpap_days INTEGER",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pulmonary_hemorrhage BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pneumothorax BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pneumothorax_side VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS chest_drain BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pulmonary_htn BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS apnea BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS apnea_onset_days INTEGER",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS caffeine BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS caffeine_duration_days INTEGER",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS postnatal_steroids BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS steroid_drug VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS steroid_age_days INTEGER",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS steroid_dose_mgkg DOUBLE PRECISION",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS steroid_indication VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS feed_intolerance BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS nec BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS nec_stage VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS nec_date DATE",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS nec_surgery BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pn BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pn_days INTEGER",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS cholestasis BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS max_direct_bilirubin DOUBLE PRECISION",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hs_pda BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pda_diagnosed_by VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pda_treatment VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pda_ligation BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS shock BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hypotension BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS inotropes BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS sepsis BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS sepsis_type VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS sepsis_episodes INTEGER",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS total_los_days INTEGER",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS nicu_days INTEGER",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS discharge_weight DOUBLE PRECISION",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS discharge_date DATE",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS outcome VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS back_referred_hospital VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS completed_by VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS signature VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS completion_date DATE",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS aed_number VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS aed_other VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS aed_type JSON",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS ahw DOUBLE PRECISION",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS eeg_result VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS etiology VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS etiology_other VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS ich_type VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS ivh_date_left DATE",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS ivh_date_right DATE",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS ivh_age_days_left INTEGER",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS ivh_age_days_right INTEGER",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS ivh_description VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS ivh_description_left VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS ivh_description_right VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS ivh_grade_left VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS ivh_grade_right VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS ivh_present VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pvl_date_left DATE",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pvl_date_right DATE",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pvl_grade_left VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pvl_grade_right VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pvl_present VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pvl_age_days_left INTEGER",   # CRF #20
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pvl_age_days_right INTEGER",  # CRF #17
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS tod_max DOUBLE PRECISION",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS ventriculomegaly_present VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS vi_max DOUBLE PRECISION",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS age_steroid INTEGER",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS apnea_onset_age INTEGER",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS bpd_support_36w VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS caffeine_duration INTEGER",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS caffeine_used VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS cpap VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS cpap_used VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS extubation_episodes INTEGER",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS extubation_failure VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hc_after_first BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hc_after_second BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hc_first_drug BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hfnc VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hfnc_days INTEGER",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hfnc_used VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hydrocortisone_bp VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS imv_days INTEGER",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS imv_used VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS invasive_ventilation VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS nasal_cannula VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS nasal_cannula_days INTEGER",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS nasal_cannula_used VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS nippv VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS nippv_days INTEGER",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS nippv_used VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS o2_days INTEGER",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS oxygen_exposure DOUBLE PRECISION",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pulmonary_hypertension VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS rx_ino BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS rx_miliri BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS rx_other BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS rx_other_text VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS rx_sildenafil BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS rx_vaso BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS steroid_dose DOUBLE PRECISION",
    # New field 54: cumulative dose (mg/kg) for a second steroid drug.
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS steroid_dose_2 DOUBLE PRECISION",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS steroid_drug_other VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS steroid_indication_other VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS age_first_feed INTEGER",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS age_full_feeds INTEGER",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS age_full_feeds_summary INTEGER",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS bifidobacterium VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS ebm_days INTEGER",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS fi_abdominal_distension BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS fi_altered_aspirates BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS fi_prefeed_aspirates BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS fi_sluggish_bowel BOOLEAN",
    # New (item 69): the "Others" option was missing entirely from Feed
    # Intolerance's checkbox group.
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS fi_others BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS fi_others_text VARCHAR",
    # New (item 89): the "Others" option was missing from Probiotic Strains.
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS strain_others BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS fm_days INTEGER",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS lactobacillus VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS nec_age_days INTEGER",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS nec_resection VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS nec_resection_length DOUBLE PRECISION",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS nec_stoma VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS nec_surgery_type VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pdhm_days INTEGER",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pn_acidosis BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pn_adverse VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pn_cholestasis BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pn_days_summary INTEGER",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pn_electrolyte BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pn_hypercapnia BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pn_other BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pn_other_text VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS probiotic VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS strain_bi BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS strain_mono BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS strain_multi BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS tpn_associated VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS alp_peak DOUBLE PRECISION",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS dyselectro_ca BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS dyselectro_k BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS dyselectro_na BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS dyselectrolytemia VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hyperglycemia VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hyperglycemia_highest DOUBLE PRECISION",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hyperglycemia_rx VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hypoglycemia VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hypoglycemia_episodes INTEGER",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hypoglycemia_lowest DOUBLE PRECISION",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hypoglycemia_rx VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hypoglycemia_rx_duration INTEGER",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS lowest_calcium DOUBLE PRECISION",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS lowest_phosphorus DOUBLE PRECISION",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS metabolic_acidosis VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS osteopenia VARCHAR",
    # H4.1 fields 106-111
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hyponatremia BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hyponatremia_status VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hyponatremia_symptoms VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hypernatremia BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hypernatremia_status VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hypernatremia_symptoms VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hypokalemia BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hypokalemia_status VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hypokalemia_symptoms VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hyperkalemia BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hyperkalemia_status VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hyperkalemia_symptoms VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hypocalcemia BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hypocalcemia_status VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hypocalcemia_symptoms VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hypercalcemia BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hypercalcemia_status VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hypercalcemia_symptoms VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS dbp DOUBLE PRECISION",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS fluid_bolus VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS fluid_bolus_number INTEGER",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hypotension_both BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hypotension_diastolic BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hypotension_systolic BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS inotrope_adr BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS inotrope_dobu BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS inotrope_dopa BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS inotrope_duration INTEGER",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS inotrope_milri BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS inotrope_nadr BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS inotrope_vaso BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pda_both BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pda_bounding_pulse BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pda_clinical BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pda_courses INTEGER",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pda_cumulative_dose DOUBLE PRECISION",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pda_echo BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pda_hyperactive_precordium BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pda_ibu BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pda_indo BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pda_intervention_rx VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pda_device_closure_age INTEGER",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pda_la_ao DOUBLE PRECISION",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pda_ligation_age INTEGER",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pda_lpa_velocity DOUBLE PRECISION",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pda_medical_rx VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pda_murmur BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pda_other_feature BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pda_other_feature_text VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pda_pattern_growing BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pda_pattern_none BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pda_pattern_pulsatile BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pda_pcm BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pda_peak_velocity DOUBLE PRECISION",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pda_shunt VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pda_systemic_steal VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pda_tdd DOUBLE PRECISION",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS pda_wide_pp BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS sbp DOUBLE PRECISION",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS structural_heart_disease VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS structural_heart_disease_detail VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS vis_score DOUBLE PRECISION",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS anemia VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS anemia_chf VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS anemia_etiology VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS anemia_etiology_other VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS anemia_onset DOUBLE PRECISION",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS anemia_symptoms VARCHAR",       # CRF #163
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS anemia_symptoms_other VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS bind VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS cmv_screened VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS dvet VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS dvet_number INTEGER",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS ffp_cryo VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS ffp_number INTEGER",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS irradiated VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS ivig VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS jaundice_etiology VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS jaundice_etiology_other VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS jaundice_intervention VARCHAR",  # CRF #147
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS jaundice_onset DATE",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS jaundice_passive DATE",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS jaundice_type VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS leukoreduced VARCHAR",           # CRF #171
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS lowest_hb DOUBLE PRECISION",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS peak_tsb DOUBLE PRECISION",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS phototherapy VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS platelet_number INTEGER",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS platelets VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS prbc VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS prbc_number INTEGER",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS prbc_volume DOUBLE PRECISION",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS aki VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS aki_date DATE",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS aki_dialysis VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS aki_oliguria VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS aki_peak_creatinine DOUBLE PRECISION",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS aki_stage1 BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS aki_stage2 BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS aki_stage3 BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS rop VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS rop_anti_vegf BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS rop_arop VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS rop_bilateral VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS rop_comment VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS rop_diagnosis_date DATE",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS rop_first_screen_date DATE",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS rop_laser BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS rop_method VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS rop_method_ido BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS rop_method_retcam BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS rop_other BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS rop_other_text VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS rop_plus VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS rop_screened VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS rop_side VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS rop_stage1 BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS rop_stage2 BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS rop_stage3 BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS rop_stage4 BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS rop_stage5 BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS rop_treatment VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS rop_vitrectomy BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS rop_zone1 BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS rop_zone2 BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS rop_zone3 BOOLEAN",
    # H8.1 fields 185-190 (Right eye)
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS rop_stage_right VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS rop_plus_right VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS rop_zone_right VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS rop_arop_right VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS rop_treatment_right VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS rop_laser_right BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS rop_anti_vegf_right BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS rop_vitrectomy_right BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS rop_other_right BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS rop_other_text_right VARCHAR",
    # H8.1 fields 191-196 (Left eye)
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS rop_stage_left VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS rop_plus_left VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS rop_zone_left VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS rop_arop_left VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS rop_treatment_left VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS rop_laser_left BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS rop_anti_vegf_left BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS rop_vitrectomy_left BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS rop_other_left BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS rop_other_text_left VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hyperthermia VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hyperthermia_clothing BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hyperthermia_equipment BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hyperthermia_environment BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hyperthermia_location_dr BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hyperthermia_location_nicu BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hyperthermia_location_transport BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hyperthermia_other BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hyperthermia_other_text VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hyperthermia_probe BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hyperthermia_sepsis BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hyperthermia_temp DOUBLE PRECISION",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hyperthermia_wrap BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hypothermia VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hypothermia_environment BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hypothermia_immaturity BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hypothermia_ivh BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hypothermia_location_dr BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hypothermia_location_nicu BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hypothermia_location_transport BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hypothermia_lowest_temp DOUBLE PRECISION",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hypothermia_mild BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hypothermia_moderate BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hypothermia_other BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hypothermia_other_text VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hypothermia_sepsis BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS hypothermia_severe BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS arterial_posterior_tibial BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS arterial_radial BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS extravasation VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS line_comp_infection BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS line_comp_none BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS line_comp_thrombosis BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS line_comp_phlebitis BOOLEAN",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS peripheral_arterial VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS peripheral_venous VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS picc VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS picc_days INTEGER",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS uac VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS uac_days INTEGER",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS uvc VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS uvc_days INTEGER",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS vap_episodes INTEGER",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS back_referral_hospital VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS back_referral_other VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS designation VARCHAR",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS discharge_hc DOUBLE PRECISION",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS total_los INTEGER",
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS infections JSON",
    # Infection-flag review acknowledgment — added 2026-08-23 alongside the
    # Infection auto-fill's detection-only advisory system.
    "ALTER TABLE neonatal_morbidities ADD COLUMN IF NOT EXISTS infection_flags_reviewed JSON",
]
# Form I (Study Outcome Assessment) full CRF — sections I.1-I.6, added 2026-07-28
STUDY_OUTCOMES_COLUMN_PATCHES = [
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS resus_chest_compressions BOOLEAN",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS sepsis_eos BOOLEAN",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS sepsis_los BOOLEAN",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS culture_positive_sepsis BOOLEAN",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS culture_positive_body_fluid VARCHAR",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS mortality_7d_cause TEXT",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS mortality_7d_date DATE",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS mortality_7d_time VARCHAR",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS mortality_7d_age_hrs DOUBLE PRECISION",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS mortality_28d_cause TEXT",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS mortality_28d_date DATE",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS mortality_28d_time VARCHAR",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS mortality_28d_age_days DOUBLE PRECISION",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS encounter36_method VARCHAR",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS encounter36_other VARCHAR",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS encounter36_other_text VARCHAR",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS death36 BOOLEAN",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS death36_cause TEXT",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS death36_date DATE",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS death36_time VARCHAR",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS death36_age_days DOUBLE PRECISION",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS bpd36_jensen_grade VARCHAR",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS bpd36_jensen_date DATE",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS bpd36_nichd_radiographic BOOLEAN",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS bpd36_nichd_fio2 DOUBLE PRECISION",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS bpd36_nichd_flow DOUBLE PRECISION",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS bpd36_nichd_grade VARCHAR",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS bpd36_nichd_date DATE",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS nec36_stage BOOLEAN",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS nec36_surgery BOOLEAN",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS nec36_date DATE",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS ivh36_grade3 BOOLEAN",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS ivh36_date DATE",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS cpvl36_grade2 BOOLEAN",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS cpvl36_date DATE",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS rop36 BOOLEAN",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS rop36_treated BOOLEAN",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS rop36_date DATE",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS encounter40_method VARCHAR",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS encounter40_other VARCHAR",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS encounter40_other_text VARCHAR",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS death40 BOOLEAN",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS death40_cause TEXT",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS death40_date DATE",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS death40_time VARCHAR",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS death40_age_days DOUBLE PRECISION",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS nec40_stage BOOLEAN",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS nec40_surgery BOOLEAN",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS nec40_date DATE",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS ivh40_grade3 BOOLEAN",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS ivh40_date DATE",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS cpvl40_grade2 BOOLEAN",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS cpvl40_date DATE",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS rop40 BOOLEAN",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS rop40_treated BOOLEAN",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS rop40_date DATE",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS abnormal_mri_tea VARCHAR",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS encounter44_method VARCHAR",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS encounter44_other VARCHAR",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS encounter44_other_text VARCHAR",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS death44 BOOLEAN",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS death44_cause TEXT",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS death44_date DATE",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS death44_time VARCHAR",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS death44_age_days DOUBLE PRECISION",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS nec44_stage BOOLEAN",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS nec44_surgery BOOLEAN",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS nec44_date DATE",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS ivh44_grade3 BOOLEAN",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS ivh44_date DATE",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS cpvl44_grade2 BOOLEAN",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS cpvl44_date DATE",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS rop44_assessed BOOLEAN",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS rop44_treated BOOLEAN",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS rop44_date DATE",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS nippv_days INTEGER",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS sepsis_overall_episodes INTEGER",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS mortality_hospital_cause TEXT",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS mortality_hospital_date DATE",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS mortality_hospital_time VARCHAR",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS mortality_hospital_age_days DOUBLE PRECISION",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS mortality_after_discharge_cause TEXT",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS mortality_after_discharge_date DATE",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS mortality_after_discharge_time VARCHAR",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS mortality_after_discharge_age_days DOUBLE PRECISION",
    "ALTER TABLE study_outcomes ADD COLUMN IF NOT EXISTS crf_additional_notes JSON",
]
# total new columns: 82

# 2026-08-09: participant_pii fields are now Fernet-encrypted at rest
# (see backend/crypto.py). Ciphertext is longer than plaintext, so the
# 4 columns that were capped at VARCHAR(15) for phone numbers need
# widening. Postgres has no "IF EXISTS" form for ALTER COLUMN ... TYPE, so
# unlike every other patch group in this file this can't be written as a
# plain unconditional statement — guarded via a DO block that checks
# information_schema first, so it's a genuine no-op (not just harmless
# to re-run, but literally does nothing) if participant_pii or the
# specific column doesn't exist yet, or if the column is already
# unbounded. Kept as one DO block per column set rather than 4 separate
# statements so a single ACCESS EXCLUSIVE-lock pass covers all 4.
PARTICIPANT_PII_WIDEN_PATCHES = [
    """
    DO $$
    DECLARE col text;
    BEGIN
        FOREACH col IN ARRAY ARRAY[
            'mother_contact', 'husband_contact',
            'contact_mother', 'contact_husband'
        ] LOOP
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'participant_pii'
                  AND column_name = col
                  AND character_maximum_length IS NOT NULL
            ) THEN
                EXECUTE format(
                    'ALTER TABLE participant_pii ALTER COLUMN %I TYPE VARCHAR', col
                );
            END IF;
        END LOOP;
    END $$;
    """,
]

# Form F / H (Cranial USG) — completion footer fields, added for CRF alignment
CRANIAL_USG_COLUMN_PATCHES = [
    "ALTER TABLE cranial_usg_records ADD COLUMN IF NOT EXISTS completed_by VARCHAR",
    "ALTER TABLE cranial_usg_records ADD COLUMN IF NOT EXISTS designation VARCHAR",
    "ALTER TABLE cranial_usg_records ADD COLUMN IF NOT EXISTS completion_date VARCHAR",
]

# Form G (ROP Screening) — LEFT eye mirror of the RIGHT eye summary/treatment
# fields (previously only RIGHT was persisted), per-eye Anti-VEGF agent and
# PMA-at-treatment, and the outcome "Other" free-text — added for CRF v3
# (RBSK/NNF India & ICROP 3rd Edition) alignment. `pma_at_treatment` (singular)
# is superseded by the per-eye `pma_at_treatment_re` / `pma_at_treatment_le`,
# and the orphan `bilateral_treatment` column (not on the CRF) is left as-is
# in the DB (unused) rather than dropped, so no historical data is lost.
ROP_SCREENING_COLUMN_PATCHES = [
    "ALTER TABLE rop_screening ADD COLUMN IF NOT EXISTS pma_at_treatment_re VARCHAR",
    "ALTER TABLE rop_screening ADD COLUMN IF NOT EXISTS pma_at_treatment_le VARCHAR",
    "ALTER TABLE rop_screening ADD COLUMN IF NOT EXISTS worst_stage_le VARCHAR",
    "ALTER TABLE rop_screening ADD COLUMN IF NOT EXISTS worst_zone_le VARCHAR",
    "ALTER TABLE rop_screening ADD COLUMN IF NOT EXISTS plus_disease_le BOOLEAN",
    "ALTER TABLE rop_screening ADD COLUMN IF NOT EXISTS a_rop_le BOOLEAN",
    "ALTER TABLE rop_screening ADD COLUMN IF NOT EXISTS treatment_required_le BOOLEAN",
    "ALTER TABLE rop_screening ADD COLUMN IF NOT EXISTS treatment_type_le JSON",
    "ALTER TABLE rop_screening ADD COLUMN IF NOT EXISTS anti_vegf_agent_le VARCHAR",
    "ALTER TABLE rop_screening ADD COLUMN IF NOT EXISTS outcome_other_text VARCHAR",
]

# Form J — External Hospital Assessment (create table if missing on older deploys)
EXTERNAL_HOSPITAL_TABLE_PATCHES = [
    """
    CREATE TABLE IF NOT EXISTS external_hospital_assessments (
        id SERIAL PRIMARY KEY,
        enrollment_id VARCHAR NOT NULL,
        assessment_weeks INTEGER NOT NULL,
        mother_name VARCHAR,
        dob DATE,
        death BOOLEAN,
        death_cause VARCHAR,
        death_date DATE,
        death_time VARCHAR,
        death_age_days INTEGER,
        resp_support BOOLEAN,
        resp_support_date DATE,
        resp_mode VARCHAR,
        flow_rate DOUBLE PRECISION,
        fio2 DOUBLE PRECISION,
        radiographic_lung BOOLEAN,
        nec BOOLEAN,
        nec_stage VARCHAR,
        nec_date DATE,
        nec_surgery BOOLEAN,
        ivh_right VARCHAR,
        ivh_right_date DATE,
        ivh_left VARCHAR,
        ivh_left_date DATE,
        cpvl_right VARCHAR,
        cpvl_right_date DATE,
        cpvl_left VARCHAR,
        cpvl_left_date DATE,
        rop_right VARCHAR,
        plus_right BOOLEAN,
        arop_right BOOLEAN,
        zone_right VARCHAR,
        treat_right BOOLEAN,
        treat_date_right DATE,
        rop_left VARCHAR,
        plus_left BOOLEAN,
        arop_left BOOLEAN,
        zone_left VARCHAR,
        treat_left BOOLEAN,
        treat_date_left DATE,
        sepsis BOOLEAN,
        sepsis_episodes INTEGER,
        mri_done BOOLEAN,
        completed_by VARCHAR,
        designation VARCHAR,
        hospital VARCHAR,
        completion_date DATE,
        created_at TIMESTAMP,
        updated_at TIMESTAMP,
        CONSTRAINT uq_external_hospital_enrollment_week UNIQUE (enrollment_id, assessment_weeks)
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_external_hospital_assessments_enrollment_id ON external_hospital_assessments (enrollment_id)",
    "CREATE INDEX IF NOT EXISTS ix_external_hospital_assessments_id ON external_hospital_assessments (id)",
]

# Form Y — SAE reports (create table + relax NOT NULL for draft saves on older deploys)
SAE_REPORT_TABLE_PATCHES = [
    """
    CREATE TABLE IF NOT EXISTS sae_reports (
        id SERIAL PRIMARY KEY,
        study_id VARCHAR,
        enrollment_id VARCHAR NOT NULL,
        report_type VARCHAR,
        report_date VARCHAR,
        diagnosis VARCHAR,
        onset_datetime VARCHAR,
        end_datetime VARCHAR,
        ongoing BOOLEAN DEFAULT FALSE,
        seriousness JSON,
        severity VARCHAR,
        causality VARCHAR,
        action_taken VARCHAR,
        outcome VARCHAR,
        date_of_death VARCHAR,
        narrative VARCHAR,
        reporter_name VARCHAR,
        reporter_designation VARCHAR,
        reporter_contact VARCHAR,
        reporter_date VARCHAR,
        reporter_signature VARCHAR,
        investigator_name VARCHAR,
        investigator_signature VARCHAR,
        investigator_date VARCHAR,
        site VARCHAR,
        created_at TIMESTAMP,
        updated_at TIMESTAMP
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_sae_reports_enrollment_id ON sae_reports (enrollment_id)",
    "CREATE INDEX IF NOT EXISTS ix_sae_reports_id ON sae_reports (id)",
    "ALTER TABLE sae_reports ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP",
    "ALTER TABLE sae_reports ALTER COLUMN report_type DROP NOT NULL",
    "ALTER TABLE sae_reports ALTER COLUMN report_date DROP NOT NULL",
    "ALTER TABLE sae_reports ALTER COLUMN diagnosis DROP NOT NULL",
    "ALTER TABLE sae_reports ALTER COLUMN onset_datetime DROP NOT NULL",
    "ALTER TABLE sae_reports ALTER COLUMN seriousness DROP NOT NULL",
    "ALTER TABLE sae_reports ALTER COLUMN severity DROP NOT NULL",
    "ALTER TABLE sae_reports ALTER COLUMN causality DROP NOT NULL",
    "ALTER TABLE sae_reports ALTER COLUMN action_taken DROP NOT NULL",
    "ALTER TABLE sae_reports ALTER COLUMN outcome DROP NOT NULL",
    "ALTER TABLE sae_reports ALTER COLUMN narrative DROP NOT NULL",
    "ALTER TABLE sae_reports ALTER COLUMN reporter_name DROP NOT NULL",
    "ALTER TABLE sae_reports ALTER COLUMN reporter_designation DROP NOT NULL",
    "ALTER TABLE sae_reports ALTER COLUMN reporter_date DROP NOT NULL",
]

# Helper Form — Adverse Events
ADVERSE_EVENTS_TABLE_PATCHES = [
    """
    CREATE TABLE IF NOT EXISTS adverse_events (
        id SERIAL PRIMARY KEY,
        enrollment_id VARCHAR NOT NULL,
        mother_name VARCHAR,
        baby_uid VARCHAR,
        maternal_uid VARCHAR,
        has_adverse_event BOOLEAN,
        events JSON,
        completed_by VARCHAR,
        designation VARCHAR,
        completion_date VARCHAR,
        created_at TIMESTAMP,
        updated_at TIMESTAMP
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_adverse_events_enrollment_id ON adverse_events (enrollment_id)",
    "CREATE INDEX IF NOT EXISTS ix_adverse_events_id ON adverse_events (id)",
    "ALTER TABLE adverse_events ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP",
    "ALTER TABLE adverse_events ALTER COLUMN has_adverse_event DROP NOT NULL",
]

# Helper Form — SAE Listing
SAE_LIST_TABLE_PATCHES = [
    """
    CREATE TABLE IF NOT EXISTS sae_list (
        id SERIAL PRIMARY KEY,
        enrollment_id VARCHAR NOT NULL,
        rows JSON,
        completed_by VARCHAR,
        designation VARCHAR,
        completion_date VARCHAR,
        created_at TIMESTAMP,
        updated_at TIMESTAMP
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_sae_list_enrollment_id ON sae_list (enrollment_id)",
    "CREATE INDEX IF NOT EXISTS ix_sae_list_id ON sae_list (id)",
    "ALTER TABLE sae_list ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP",
    "ALTER TABLE sae_list ALTER COLUMN rows DROP NOT NULL",
]

# total new columns: 92

# 2026-08-12: which physical blender (A/B/C/D) was used for a birth — needed
# to identify the stratum for per-blender allocation-sequence monitoring
# (see models.py comment on BirthResuscitation.blender_letter for why this
# isn't an unblinding risk). No manual call needed here — apply_schema_patches()
# auto-discovers this list by its _PATCHES suffix.
BIRTH_RESUSCITATION_BLENDER_LETTER_PATCHES = [
    "ALTER TABLE birth_resuscitation ADD COLUMN IF NOT EXISTS blender_letter VARCHAR",
]

# Field 57 Total resus time: was Integer minutes; now VARCHAR "MM:SS".
# Convert existing minute integers to "MM:00" once (idempotent via data_type check).
# NOTE: do NOT write the literal ':00' inside sqlalchemy.text() — it is parsed as
# a bind parameter named "00" and the whole patch group silently fails on startup.
BIRTH_RESUSCITATION_TOTAL_RESUS_TIME_MMSS_PATCHES = [
    """
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'birth_resuscitation'
          AND column_name = 'total_resus_time'
          AND data_type IN ('integer', 'bigint', 'smallint', 'numeric')
      ) THEN
        ALTER TABLE birth_resuscitation
          ALTER COLUMN total_resus_time TYPE VARCHAR
          USING CASE
            WHEN total_resus_time IS NULL THEN NULL
            ELSE (total_resus_time::text || chr(58) || '00')
          END;
      END IF;
    END $$;
    """,
]
