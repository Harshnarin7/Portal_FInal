"""
Database migration script to ensure all schema is up-to-date for Issue #1 fixes.
Run this on the PostgreSQL database:

  psql -h <host> -U <user> -d <database> -f migrations/0001_issue1_fixes.sql

This script is idempotent and safe to run multiple times.
"""

-- ============================================================================
-- Fix 1: reason_for_consent_refusal fields in screenings
-- ============================================================================
ALTER TABLE screenings 
ADD COLUMN IF NOT EXISTS reason_for_consent_refusal TEXT,
ADD COLUMN IF NOT EXISTS reason_for_consent_refusal_other TEXT;

COMMENT ON COLUMN screenings.reason_for_consent_refusal IS 
  'Reason for consent refusal (Issue #1 Fix 1)';
COMMENT ON COLUMN screenings.reason_for_consent_refusal_other IS 
  'Other reason for consent refusal (Issue #1 Fix 1)';

-- ============================================================================
-- Fix 3: ltfu_reason fields in composite_outcomes
-- ============================================================================
ALTER TABLE composite_outcomes
ADD COLUMN IF NOT EXISTS ltfu_reason_36 TEXT,
ADD COLUMN IF NOT EXISTS ltfu_reason_40 TEXT,
ADD COLUMN IF NOT EXISTS ltfu_reason_44 TEXT;

COMMENT ON COLUMN composite_outcomes.ltfu_reason_36 IS 
  'Reason for lost to follow-up at 36 weeks PMA (Issue #1 Fix 3)';
COMMENT ON COLUMN composite_outcomes.ltfu_reason_40 IS 
  'Reason for lost to follow-up at 40 weeks PMA (Issue #1 Fix 3)';
COMMENT ON COLUMN composite_outcomes.ltfu_reason_44 IS 
  'Reason for lost to follow-up at 44 weeks PMA (Issue #1 Fix 3)';

-- ============================================================================
-- Verify enrollment_id is indexed in screenings (Fix 2 support)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_screenings_enrollment_id 
  ON screenings(enrollment_id);

-- ============================================================================
-- Indexes for dashboard query performance (Issues #2, #3)
-- ============================================================================

-- CONSORT flow queries
CREATE INDEX IF NOT EXISTS idx_screenings_site_deleted 
  ON screenings(site_name, is_deleted);
CREATE INDEX IF NOT EXISTS idx_screenings_screening_status 
  ON screenings(screening_status);
CREATE INDEX IF NOT EXISTS idx_screenings_consent_given 
  ON screenings(consent_given);

-- Birth resuscitation queries
CREATE INDEX IF NOT EXISTS idx_birth_resus_randomised 
  ON birth_resuscitation(randomised);
CREATE INDEX IF NOT EXISTS idx_birth_resus_screening_id 
  ON birth_resuscitation(screening_id);

-- Composite outcomes queries
CREATE INDEX IF NOT EXISTS idx_composite_outcomes_enrollment_id 
  ON composite_outcomes(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_composite_outcomes_death_36 
  ON composite_outcomes(death_before_36);
CREATE INDEX IF NOT EXISTS idx_composite_outcomes_assess_36 
  ON composite_outcomes(assess_36_date);

-- Daily log queries
CREATE INDEX IF NOT EXISTS idx_resp_cv_neuro_day_logs_enrollment_nicu_day 
  ON resp_cv_neuro_day_logs(enrollment_id, nicu_day);
CREATE INDEX IF NOT EXISTS idx_resp_cv_neuro_day_logs_nicu_day 
  ON resp_cv_neuro_day_logs(nicu_day);

CREATE INDEX IF NOT EXISTS idx_infect_gi_hema_day_logs_enrollment_nicu_day 
  ON infect_gi_hema_day_logs(enrollment_id, nicu_day);
CREATE INDEX IF NOT EXISTS idx_infect_gi_hema_day_logs_nicu_day 
  ON infect_gi_hema_day_logs(nicu_day);

CREATE INDEX IF NOT EXISTS idx_metab_renal_vasc_eye_day_logs_enrollment_nicu_day 
  ON metab_renal_vasc_eye_day_logs(enrollment_id, nicu_day);
CREATE INDEX IF NOT EXISTS idx_metab_renal_vasc_eye_day_logs_nicu_day 
  ON metab_renal_vasc_eye_day_logs(nicu_day);

-- Form completion indexes
CREATE INDEX IF NOT EXISTS idx_maternal_details_enrollment_id 
  ON maternal_details(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_postnatal_day1_enrollment_id 
  ON postnatal_day1(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_nicu_admission_enrollment_id 
  ON nicu_admission(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_neonatal_morbidities_enrollment_id 
  ON neonatal_morbidities(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_cranial_usg_records_enrollment_id 
  ON cranial_usg_records(enrollment_id);

-- Audit log queries
CREATE INDEX IF NOT EXISTS idx_audit_log_action_created_at 
  ON audit_log(action, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at 
  ON audit_log(created_at);

-- ============================================================================
-- Verify screening_datetime is not null for timeliness queries
-- ============================================================================
-- (Already exists in model but ensure it's there)
ALTER TABLE screenings 
ALTER COLUMN screening_datetime SET NOT NULL;

-- ============================================================================
-- Grant permissions (if needed for separate analytics role)
-- ============================================================================
-- GRANT SELECT ON screenings TO analytics;
-- GRANT SELECT ON birth_resuscitation TO analytics;
-- GRANT SELECT ON composite_outcomes TO analytics;
-- GRANT SELECT ON resp_cv_neuro_day_logs TO analytics;
-- GRANT SELECT ON infect_gi_hema_day_logs TO analytics;
-- GRANT SELECT ON metab_renal_vasc_eye_day_logs TO analytics;
-- GRANT SELECT ON audit_log TO analytics;

-- ============================================================================
-- Verification queries (run after migration)
-- ============================================================================
-- Check that all new columns exist:
/*
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name IN ('screenings', 'composite_outcomes')
AND column_name IN ('reason_for_consent_refusal', 'reason_for_consent_refusal_other',
                     'ltfu_reason_36', 'ltfu_reason_40', 'ltfu_reason_44');
*/

-- Check that all indexes exist:
/*
SELECT indexname FROM pg_indexes 
WHERE schemaname = 'public' 
AND indexname LIKE 'idx_%' 
ORDER BY indexname;
*/
