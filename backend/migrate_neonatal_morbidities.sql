-- Migration: extend neonatal_morbidities (Form H) with the full CRF field set
-- Generated for the Form H redesign — see FormH_redesign_notes.md
-- Safe to re-run: every column uses IF NOT EXISTS.

-- ---------------- NEUROLOGICAL (H1) ----------------
ALTER TABLE neonatal_morbidities
    ADD COLUMN IF NOT EXISTS aed_number VARCHAR,
    ADD COLUMN IF NOT EXISTS aed_other VARCHAR,
    ADD COLUMN IF NOT EXISTS aed_type JSON,
    ADD COLUMN IF NOT EXISTS ahw FLOAT,
    ADD COLUMN IF NOT EXISTS eeg_result VARCHAR,
    ADD COLUMN IF NOT EXISTS etiology VARCHAR,
    ADD COLUMN IF NOT EXISTS etiology_other VARCHAR,
    ADD COLUMN IF NOT EXISTS ich_type VARCHAR,
    ADD COLUMN IF NOT EXISTS ivh_date_left DATE,
    ADD COLUMN IF NOT EXISTS ivh_date_right DATE,
    ADD COLUMN IF NOT EXISTS ivh_description VARCHAR,
    ADD COLUMN IF NOT EXISTS ivh_description_left VARCHAR,
    ADD COLUMN IF NOT EXISTS ivh_description_right VARCHAR,
    ADD COLUMN IF NOT EXISTS ivh_grade_left VARCHAR,
    ADD COLUMN IF NOT EXISTS ivh_grade_right VARCHAR,
    ADD COLUMN IF NOT EXISTS ivh_present VARCHAR,
    ADD COLUMN IF NOT EXISTS pvl_date_left DATE,
    ADD COLUMN IF NOT EXISTS pvl_date_right DATE,
    ADD COLUMN IF NOT EXISTS pvl_grade_left VARCHAR,
    ADD COLUMN IF NOT EXISTS pvl_grade_right VARCHAR,
    ADD COLUMN IF NOT EXISTS pvl_present VARCHAR,
    ADD COLUMN IF NOT EXISTS tod_max FLOAT,
    ADD COLUMN IF NOT EXISTS ventriculomegaly_present VARCHAR,
    ADD COLUMN IF NOT EXISTS vi_max FLOAT;

-- ---------------- RESPIRATORY (H2) ----------------
ALTER TABLE neonatal_morbidities
    ADD COLUMN IF NOT EXISTS age_steroid INTEGER,
    ADD COLUMN IF NOT EXISTS apnea_onset_age INTEGER,
    ADD COLUMN IF NOT EXISTS bpd_support_36w VARCHAR,
    ADD COLUMN IF NOT EXISTS caffeine_duration INTEGER,
    ADD COLUMN IF NOT EXISTS caffeine_used VARCHAR,
    ADD COLUMN IF NOT EXISTS cpap VARCHAR,
    ADD COLUMN IF NOT EXISTS cpap_used VARCHAR,
    ADD COLUMN IF NOT EXISTS extubation_episodes INTEGER,
    ADD COLUMN IF NOT EXISTS extubation_failure VARCHAR,
    ADD COLUMN IF NOT EXISTS hc_after_first BOOLEAN,
    ADD COLUMN IF NOT EXISTS hc_after_second BOOLEAN,
    ADD COLUMN IF NOT EXISTS hc_first_drug BOOLEAN,
    ADD COLUMN IF NOT EXISTS hfnc VARCHAR,
    ADD COLUMN IF NOT EXISTS hfnc_days INTEGER,
    ADD COLUMN IF NOT EXISTS hfnc_used VARCHAR,
    ADD COLUMN IF NOT EXISTS hydrocortisone_bp VARCHAR,
    ADD COLUMN IF NOT EXISTS imv_days INTEGER,
    ADD COLUMN IF NOT EXISTS imv_used VARCHAR,
    ADD COLUMN IF NOT EXISTS invasive_ventilation VARCHAR,
    ADD COLUMN IF NOT EXISTS nasal_cannula VARCHAR,
    ADD COLUMN IF NOT EXISTS nasal_cannula_days INTEGER,
    ADD COLUMN IF NOT EXISTS nasal_cannula_used VARCHAR,
    ADD COLUMN IF NOT EXISTS nippv VARCHAR,
    ADD COLUMN IF NOT EXISTS nippv_days INTEGER,
    ADD COLUMN IF NOT EXISTS nippv_used VARCHAR,
    ADD COLUMN IF NOT EXISTS o2_days INTEGER,
    ADD COLUMN IF NOT EXISTS oxygen_exposure FLOAT,
    ADD COLUMN IF NOT EXISTS pulmonary_hypertension VARCHAR,
    ADD COLUMN IF NOT EXISTS rx_ino BOOLEAN,
    ADD COLUMN IF NOT EXISTS rx_miliri BOOLEAN,
    ADD COLUMN IF NOT EXISTS rx_other BOOLEAN,
    ADD COLUMN IF NOT EXISTS rx_other_text VARCHAR,
    ADD COLUMN IF NOT EXISTS rx_sildenafil BOOLEAN,
    ADD COLUMN IF NOT EXISTS rx_vaso BOOLEAN,
    ADD COLUMN IF NOT EXISTS steroid_dose FLOAT,
    ADD COLUMN IF NOT EXISTS steroid_drug_other VARCHAR,
    ADD COLUMN IF NOT EXISTS steroid_indication_other VARCHAR;

-- ---------------- GASTROINTESTINAL (H3) ----------------
ALTER TABLE neonatal_morbidities
    ADD COLUMN IF NOT EXISTS age_first_feed INTEGER,
    ADD COLUMN IF NOT EXISTS age_full_feeds INTEGER,
    ADD COLUMN IF NOT EXISTS age_full_feeds_summary INTEGER,
    ADD COLUMN IF NOT EXISTS bifidobacterium VARCHAR,
    ADD COLUMN IF NOT EXISTS ebm_days INTEGER,
    ADD COLUMN IF NOT EXISTS fi_abdominal_distension BOOLEAN,
    ADD COLUMN IF NOT EXISTS fi_altered_aspirates BOOLEAN,
    ADD COLUMN IF NOT EXISTS fi_prefeed_aspirates BOOLEAN,
    ADD COLUMN IF NOT EXISTS fi_sluggish_bowel BOOLEAN,
    ADD COLUMN IF NOT EXISTS fm_days INTEGER,
    ADD COLUMN IF NOT EXISTS lactobacillus VARCHAR,
    ADD COLUMN IF NOT EXISTS nec_age_days INTEGER,
    ADD COLUMN IF NOT EXISTS nec_resection VARCHAR,
    ADD COLUMN IF NOT EXISTS nec_resection_length FLOAT,
    ADD COLUMN IF NOT EXISTS nec_stoma VARCHAR,
    ADD COLUMN IF NOT EXISTS nec_surgery_type VARCHAR,
    ADD COLUMN IF NOT EXISTS pdhm_days INTEGER,
    ADD COLUMN IF NOT EXISTS pn_acidosis BOOLEAN,
    ADD COLUMN IF NOT EXISTS pn_adverse VARCHAR,
    ADD COLUMN IF NOT EXISTS pn_cholestasis BOOLEAN,
    ADD COLUMN IF NOT EXISTS pn_days_summary INTEGER,
    ADD COLUMN IF NOT EXISTS pn_electrolyte BOOLEAN,
    ADD COLUMN IF NOT EXISTS pn_hypercapnia BOOLEAN,
    ADD COLUMN IF NOT EXISTS pn_other BOOLEAN,
    ADD COLUMN IF NOT EXISTS pn_other_text VARCHAR,
    ADD COLUMN IF NOT EXISTS probiotic VARCHAR,
    ADD COLUMN IF NOT EXISTS strain_bi BOOLEAN,
    ADD COLUMN IF NOT EXISTS strain_mono BOOLEAN,
    ADD COLUMN IF NOT EXISTS strain_multi BOOLEAN,
    ADD COLUMN IF NOT EXISTS tpn_associated VARCHAR;

-- ---------------- METABOLIC (H4) ----------------
ALTER TABLE neonatal_morbidities
    ADD COLUMN IF NOT EXISTS alp_peak FLOAT,
    ADD COLUMN IF NOT EXISTS dyselectro_ca BOOLEAN,
    ADD COLUMN IF NOT EXISTS dyselectro_k BOOLEAN,
    ADD COLUMN IF NOT EXISTS dyselectro_na BOOLEAN,
    ADD COLUMN IF NOT EXISTS dyselectrolytemia VARCHAR,
    ADD COLUMN IF NOT EXISTS hyperglycemia VARCHAR,
    ADD COLUMN IF NOT EXISTS hyperglycemia_highest FLOAT,
    ADD COLUMN IF NOT EXISTS hypoglycemia VARCHAR,
    ADD COLUMN IF NOT EXISTS hypoglycemia_lowest FLOAT,
    ADD COLUMN IF NOT EXISTS lowest_calcium FLOAT,
    ADD COLUMN IF NOT EXISTS lowest_phosphorus FLOAT,
    ADD COLUMN IF NOT EXISTS metabolic_acidosis VARCHAR,
    ADD COLUMN IF NOT EXISTS osteopenia VARCHAR;

-- ---------------- CARDIOVASCULAR (H5) ----------------
ALTER TABLE neonatal_morbidities
    ADD COLUMN IF NOT EXISTS dbp FLOAT,
    ADD COLUMN IF NOT EXISTS fluid_bolus VARCHAR,
    ADD COLUMN IF NOT EXISTS fluid_bolus_number INTEGER,
    ADD COLUMN IF NOT EXISTS hypotension_both BOOLEAN,
    ADD COLUMN IF NOT EXISTS hypotension_diastolic BOOLEAN,
    ADD COLUMN IF NOT EXISTS hypotension_systolic BOOLEAN,
    ADD COLUMN IF NOT EXISTS inotrope_adr BOOLEAN,
    ADD COLUMN IF NOT EXISTS inotrope_dobu BOOLEAN,
    ADD COLUMN IF NOT EXISTS inotrope_dopa BOOLEAN,
    ADD COLUMN IF NOT EXISTS inotrope_duration INTEGER,
    ADD COLUMN IF NOT EXISTS inotrope_milri BOOLEAN,
    ADD COLUMN IF NOT EXISTS inotrope_nadr BOOLEAN,
    ADD COLUMN IF NOT EXISTS inotrope_vaso BOOLEAN,
    ADD COLUMN IF NOT EXISTS pda_both BOOLEAN,
    ADD COLUMN IF NOT EXISTS pda_bounding_pulse BOOLEAN,
    ADD COLUMN IF NOT EXISTS pda_clinical BOOLEAN,
    ADD COLUMN IF NOT EXISTS pda_courses INTEGER,
    ADD COLUMN IF NOT EXISTS pda_echo BOOLEAN,
    ADD COLUMN IF NOT EXISTS pda_hyperactive_precordium BOOLEAN,
    ADD COLUMN IF NOT EXISTS pda_ibu BOOLEAN,
    ADD COLUMN IF NOT EXISTS pda_indo BOOLEAN,
    ADD COLUMN IF NOT EXISTS pda_la_ao FLOAT,
    ADD COLUMN IF NOT EXISTS pda_ligation_age INTEGER,
    ADD COLUMN IF NOT EXISTS pda_lpa_velocity FLOAT,
    ADD COLUMN IF NOT EXISTS pda_medical_rx VARCHAR,
    ADD COLUMN IF NOT EXISTS pda_murmur BOOLEAN,
    ADD COLUMN IF NOT EXISTS pda_other_feature BOOLEAN,
    ADD COLUMN IF NOT EXISTS pda_other_feature_text VARCHAR,
    ADD COLUMN IF NOT EXISTS pda_pattern_growing BOOLEAN,
    ADD COLUMN IF NOT EXISTS pda_pattern_none BOOLEAN,
    ADD COLUMN IF NOT EXISTS pda_pattern_pulsatile BOOLEAN,
    ADD COLUMN IF NOT EXISTS pda_pcm BOOLEAN,
    ADD COLUMN IF NOT EXISTS pda_peak_velocity FLOAT,
    ADD COLUMN IF NOT EXISTS pda_shunt VARCHAR,
    ADD COLUMN IF NOT EXISTS pda_systemic_steal VARCHAR,
    ADD COLUMN IF NOT EXISTS pda_tdd FLOAT,
    ADD COLUMN IF NOT EXISTS pda_wide_pp BOOLEAN,
    ADD COLUMN IF NOT EXISTS sbp FLOAT,
    ADD COLUMN IF NOT EXISTS structural_heart_disease VARCHAR,
    ADD COLUMN IF NOT EXISTS structural_heart_disease_detail VARCHAR,
    ADD COLUMN IF NOT EXISTS vis_score FLOAT;

-- ---------------- HEMATOLOGY (H6) ----------------
ALTER TABLE neonatal_morbidities
    ADD COLUMN IF NOT EXISTS anemia VARCHAR,
    ADD COLUMN IF NOT EXISTS anemia_chf VARCHAR,
    ADD COLUMN IF NOT EXISTS anemia_etiology VARCHAR,
    ADD COLUMN IF NOT EXISTS anemia_etiology_other VARCHAR,
    ADD COLUMN IF NOT EXISTS anemia_onset FLOAT,
    ADD COLUMN IF NOT EXISTS bind VARCHAR,
    ADD COLUMN IF NOT EXISTS cmv_screened VARCHAR,
    ADD COLUMN IF NOT EXISTS dvet VARCHAR,
    ADD COLUMN IF NOT EXISTS dvet_number INTEGER,
    ADD COLUMN IF NOT EXISTS ffp_cryo VARCHAR,
    ADD COLUMN IF NOT EXISTS ffp_number INTEGER,
    ADD COLUMN IF NOT EXISTS irradiated VARCHAR,
    ADD COLUMN IF NOT EXISTS ivig VARCHAR,
    ADD COLUMN IF NOT EXISTS jaundice_etiology VARCHAR,
    ADD COLUMN IF NOT EXISTS jaundice_etiology_other VARCHAR,
    ADD COLUMN IF NOT EXISTS jaundice_onset DATE,
    ADD COLUMN IF NOT EXISTS jaundice_passive DATE,
    ADD COLUMN IF NOT EXISTS jaundice_type VARCHAR,
    ADD COLUMN IF NOT EXISTS lowest_hb FLOAT,
    ADD COLUMN IF NOT EXISTS peak_tsb FLOAT,
    ADD COLUMN IF NOT EXISTS phototherapy VARCHAR,
    ADD COLUMN IF NOT EXISTS platelet_number INTEGER,
    ADD COLUMN IF NOT EXISTS platelets VARCHAR,
    ADD COLUMN IF NOT EXISTS prbc VARCHAR,
    ADD COLUMN IF NOT EXISTS prbc_number INTEGER,
    ADD COLUMN IF NOT EXISTS prbc_volume FLOAT;

-- ---------------- RENAL (H7) ----------------
ALTER TABLE neonatal_morbidities
    ADD COLUMN IF NOT EXISTS aki VARCHAR,
    ADD COLUMN IF NOT EXISTS aki_date DATE,
    ADD COLUMN IF NOT EXISTS aki_dialysis VARCHAR,
    ADD COLUMN IF NOT EXISTS aki_oliguria VARCHAR,
    ADD COLUMN IF NOT EXISTS aki_peak_creatinine FLOAT,
    ADD COLUMN IF NOT EXISTS aki_stage1 BOOLEAN,
    ADD COLUMN IF NOT EXISTS aki_stage2 BOOLEAN,
    ADD COLUMN IF NOT EXISTS aki_stage3 BOOLEAN;

-- ---------------- OPHTHALMOLOGY / ROP (H7) ----------------
ALTER TABLE neonatal_morbidities
    ADD COLUMN IF NOT EXISTS rop VARCHAR,
    ADD COLUMN IF NOT EXISTS rop_anti_vegf BOOLEAN,
    ADD COLUMN IF NOT EXISTS rop_arop VARCHAR,
    ADD COLUMN IF NOT EXISTS rop_bilateral VARCHAR,
    ADD COLUMN IF NOT EXISTS rop_comment VARCHAR,
    ADD COLUMN IF NOT EXISTS rop_diagnosis_date DATE,
    ADD COLUMN IF NOT EXISTS rop_first_screen_date DATE,
    ADD COLUMN IF NOT EXISTS rop_laser BOOLEAN,
    ADD COLUMN IF NOT EXISTS rop_method_ido BOOLEAN,
    ADD COLUMN IF NOT EXISTS rop_method_retcam BOOLEAN,
    ADD COLUMN IF NOT EXISTS rop_other BOOLEAN,
    ADD COLUMN IF NOT EXISTS rop_other_text VARCHAR,
    ADD COLUMN IF NOT EXISTS rop_plus VARCHAR,
    ADD COLUMN IF NOT EXISTS rop_screened VARCHAR,
    ADD COLUMN IF NOT EXISTS rop_stage1 BOOLEAN,
    ADD COLUMN IF NOT EXISTS rop_stage2 BOOLEAN,
    ADD COLUMN IF NOT EXISTS rop_stage3 BOOLEAN,
    ADD COLUMN IF NOT EXISTS rop_stage4 BOOLEAN,
    ADD COLUMN IF NOT EXISTS rop_stage5 BOOLEAN,
    ADD COLUMN IF NOT EXISTS rop_treatment VARCHAR,
    ADD COLUMN IF NOT EXISTS rop_vitrectomy BOOLEAN,
    ADD COLUMN IF NOT EXISTS rop_zone1 BOOLEAN,
    ADD COLUMN IF NOT EXISTS rop_zone2 BOOLEAN,
    ADD COLUMN IF NOT EXISTS rop_zone3 BOOLEAN;

-- ---------------- THERMOREGULATION (H8) ----------------
ALTER TABLE neonatal_morbidities
    ADD COLUMN IF NOT EXISTS hyperthermia VARCHAR,
    ADD COLUMN IF NOT EXISTS hyperthermia_clothing BOOLEAN,
    ADD COLUMN IF NOT EXISTS hyperthermia_equipment BOOLEAN,
    ADD COLUMN IF NOT EXISTS hyperthermia_location_dr BOOLEAN,
    ADD COLUMN IF NOT EXISTS hyperthermia_location_nicu BOOLEAN,
    ADD COLUMN IF NOT EXISTS hyperthermia_location_transport BOOLEAN,
    ADD COLUMN IF NOT EXISTS hyperthermia_other BOOLEAN,
    ADD COLUMN IF NOT EXISTS hyperthermia_other_text VARCHAR,
    ADD COLUMN IF NOT EXISTS hyperthermia_probe BOOLEAN,
    ADD COLUMN IF NOT EXISTS hyperthermia_temp FLOAT,
    ADD COLUMN IF NOT EXISTS hyperthermia_wrap BOOLEAN,
    ADD COLUMN IF NOT EXISTS hypothermia VARCHAR,
    ADD COLUMN IF NOT EXISTS hypothermia_environment BOOLEAN,
    ADD COLUMN IF NOT EXISTS hypothermia_immaturity BOOLEAN,
    ADD COLUMN IF NOT EXISTS hypothermia_ivh BOOLEAN,
    ADD COLUMN IF NOT EXISTS hypothermia_location_dr BOOLEAN,
    ADD COLUMN IF NOT EXISTS hypothermia_location_nicu BOOLEAN,
    ADD COLUMN IF NOT EXISTS hypothermia_location_transport BOOLEAN,
    ADD COLUMN IF NOT EXISTS hypothermia_lowest_temp FLOAT,
    ADD COLUMN IF NOT EXISTS hypothermia_mild BOOLEAN,
    ADD COLUMN IF NOT EXISTS hypothermia_moderate BOOLEAN,
    ADD COLUMN IF NOT EXISTS hypothermia_other BOOLEAN,
    ADD COLUMN IF NOT EXISTS hypothermia_other_text VARCHAR,
    ADD COLUMN IF NOT EXISTS hypothermia_sepsis BOOLEAN,
    ADD COLUMN IF NOT EXISTS hypothermia_severe BOOLEAN;

-- ---------------- VASCULAR ACCESS (H9) ----------------
ALTER TABLE neonatal_morbidities
    ADD COLUMN IF NOT EXISTS arterial_posterior_tibial BOOLEAN,
    ADD COLUMN IF NOT EXISTS arterial_radial BOOLEAN,
    ADD COLUMN IF NOT EXISTS extravasation VARCHAR,
    ADD COLUMN IF NOT EXISTS line_comp_infection BOOLEAN,
    ADD COLUMN IF NOT EXISTS line_comp_none BOOLEAN,
    ADD COLUMN IF NOT EXISTS line_comp_thrombosis BOOLEAN,
    ADD COLUMN IF NOT EXISTS peripheral_arterial VARCHAR,
    ADD COLUMN IF NOT EXISTS peripheral_venous VARCHAR,
    ADD COLUMN IF NOT EXISTS picc VARCHAR,
    ADD COLUMN IF NOT EXISTS picc_days INTEGER,
    ADD COLUMN IF NOT EXISTS uac VARCHAR,
    ADD COLUMN IF NOT EXISTS uac_days INTEGER,
    ADD COLUMN IF NOT EXISTS uvc VARCHAR,
    ADD COLUMN IF NOT EXISTS uvc_days INTEGER;

-- ---------------- INFECTION (H10) totals ----------------
ALTER TABLE neonatal_morbidities
    ADD COLUMN IF NOT EXISTS vap_episodes INTEGER;

-- ---------------- HOSPITAL COURSE (H12) ----------------
ALTER TABLE neonatal_morbidities
    ADD COLUMN IF NOT EXISTS back_referral_hospital VARCHAR,
    ADD COLUMN IF NOT EXISTS back_referral_other VARCHAR,
    ADD COLUMN IF NOT EXISTS designation VARCHAR,
    ADD COLUMN IF NOT EXISTS discharge_hc FLOAT,
    ADD COLUMN IF NOT EXISTS total_los INTEGER;

-- ---------------- INFECTION (H10) — dynamic, repeatable episodes ----------------
ALTER TABLE neonatal_morbidities
    ADD COLUMN IF NOT EXISTS infections JSON;

-- Backfill existing NULL infections to an empty JSON array so the frontend
-- can always safely treat it as a list.
UPDATE neonatal_morbidities SET infections = '[]'::json WHERE infections IS NULL;