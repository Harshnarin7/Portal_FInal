"""
Migration script to extend the neonatal_morbidities table (Form H) with the
full CRF field set (~248 columns) plus a JSON `infections` column for the new
dynamic, repeatable Infection (H10) section.

Context: the original NeonatalMorbidities model/schema only covered ~90
fields. FormH.jsx collects the full ~340-field Form H CRF (Neurological,
Respiratory, GI, Metabolic, Cardiovascular, Hematology, Renal, Ophthalmology,
Thermoregulation, Vascular Access, Infection, Hospital Course). Anything not
in the schema was silently dropped by Pydantic on save. This migration adds
the missing columns so the data the frontend now sends is actually persisted.

Safe to re-run: every column uses ADD COLUMN IF NOT EXISTS.

Usage:
    python migrate_neonatal_morbidities.py
"""

from sqlalchemy import create_engine, text
from db import DATABASE_URL
import sys

# (field_name, POSTGRES_TYPE) — mirrors the columns added to
# models.py::NeonatalMorbidities and schemas.py::NeonatalMorbiditiesCreate.
SECTIONS = {
    "NEUROLOGICAL (H1)": [
        ("aed_number", "VARCHAR"), ("aed_other", "VARCHAR"), ("aed_type", "JSON"),
        ("ahw", "FLOAT"), ("eeg_result", "VARCHAR"), ("etiology", "VARCHAR"),
        ("etiology_other", "VARCHAR"), ("ich_type", "VARCHAR"),
        ("ivh_date_left", "DATE"), ("ivh_date_right", "DATE"),
        ("ivh_description", "VARCHAR"), ("ivh_description_left", "VARCHAR"),
        ("ivh_description_right", "VARCHAR"), ("ivh_grade_left", "VARCHAR"),
        ("ivh_grade_right", "VARCHAR"), ("ivh_present", "VARCHAR"),
        ("pvl_date_left", "DATE"), ("pvl_date_right", "DATE"),
        ("pvl_grade_left", "VARCHAR"), ("pvl_grade_right", "VARCHAR"),
        ("pvl_present", "VARCHAR"), ("tod_max", "FLOAT"),
        ("ventriculomegaly_present", "VARCHAR"), ("vi_max", "FLOAT"),
    ],
    "RESPIRATORY (H2)": [
        ("age_steroid", "INTEGER"), ("apnea_onset_age", "INTEGER"),
        ("bpd_support_36w", "VARCHAR"), ("caffeine_duration", "INTEGER"),
        ("caffeine_used", "VARCHAR"), ("cpap", "VARCHAR"), ("cpap_used", "VARCHAR"),
        ("extubation_episodes", "INTEGER"), ("extubation_failure", "VARCHAR"),
        ("hc_after_first", "BOOLEAN"), ("hc_after_second", "BOOLEAN"),
        ("hc_first_drug", "BOOLEAN"), ("hfnc", "VARCHAR"), ("hfnc_days", "INTEGER"),
        ("hfnc_used", "VARCHAR"), ("hydrocortisone_bp", "VARCHAR"),
        ("imv_days", "INTEGER"), ("imv_used", "VARCHAR"),
        ("invasive_ventilation", "VARCHAR"), ("nasal_cannula", "VARCHAR"),
        ("nasal_cannula_days", "INTEGER"), ("nasal_cannula_used", "VARCHAR"),
        ("nippv", "VARCHAR"), ("nippv_days", "INTEGER"), ("nippv_used", "VARCHAR"),
        ("o2_days", "INTEGER"), ("oxygen_exposure", "FLOAT"),
        ("pulmonary_hypertension", "VARCHAR"), ("rx_ino", "BOOLEAN"),
        ("rx_miliri", "BOOLEAN"), ("rx_other", "BOOLEAN"), ("rx_other_text", "VARCHAR"),
        ("rx_sildenafil", "BOOLEAN"), ("rx_vaso", "BOOLEAN"),
        ("steroid_dose", "FLOAT"), ("steroid_drug_other", "VARCHAR"),
        ("steroid_indication_other", "VARCHAR"),
    ],
    "GASTROINTESTINAL (H3)": [
        ("age_first_feed", "INTEGER"), ("age_full_feeds", "INTEGER"),
        ("age_full_feeds_summary", "INTEGER"), ("bifidobacterium", "VARCHAR"),
        ("ebm_days", "INTEGER"), ("fi_abdominal_distension", "BOOLEAN"),
        ("fi_altered_aspirates", "BOOLEAN"), ("fi_prefeed_aspirates", "BOOLEAN"),
        ("fi_sluggish_bowel", "BOOLEAN"), ("fm_days", "INTEGER"),
        ("lactobacillus", "VARCHAR"), ("nec_age_days", "INTEGER"),
        ("nec_resection", "BOOLEAN"), ("nec_resection_length", "FLOAT"),
        ("nec_stoma", "BOOLEAN"), ("nec_surgery_type", "VARCHAR"),
        ("pdhm_days", "INTEGER"), ("pn_acidosis", "BOOLEAN"), ("pn_adverse", "VARCHAR"),
        ("pn_cholestasis", "BOOLEAN"), ("pn_days_summary", "INTEGER"),
        ("pn_electrolyte", "BOOLEAN"), ("pn_hypercapnia", "BOOLEAN"),
        ("pn_other", "BOOLEAN"), ("pn_other_text", "VARCHAR"), ("probiotic", "VARCHAR"),
        ("strain_bi", "BOOLEAN"), ("strain_mono", "BOOLEAN"), ("strain_multi", "BOOLEAN"),
        ("tpn_associated", "VARCHAR"),
    ],
    "METABOLIC (H4)": [
        ("alp_peak", "FLOAT"), ("dyselectro_ca", "BOOLEAN"), ("dyselectro_k", "BOOLEAN"),
        ("dyselectro_na", "BOOLEAN"), ("dyselectrolytemia", "VARCHAR"),
        ("hyperglycemia", "VARCHAR"), ("hyperglycemia_highest", "FLOAT"),
        ("hypoglycemia", "VARCHAR"), ("hypoglycemia_lowest", "FLOAT"),
        ("lowest_calcium", "FLOAT"), ("lowest_phosphorus", "FLOAT"),
        ("metabolic_acidosis", "VARCHAR"), ("osteopenia", "VARCHAR"),
    ],
    "CARDIOVASCULAR (H5)": [
        ("dbp", "FLOAT"), ("fluid_bolus", "VARCHAR"), ("fluid_bolus_number", "INTEGER"),
        ("hypotension_both", "BOOLEAN"), ("hypotension_diastolic", "BOOLEAN"),
        ("hypotension_systolic", "BOOLEAN"), ("inotrope_adr", "BOOLEAN"),
        ("inotrope_dobu", "BOOLEAN"), ("inotrope_dopa", "BOOLEAN"),
        ("inotrope_duration", "INTEGER"), ("inotrope_milri", "BOOLEAN"),
        ("inotrope_nadr", "BOOLEAN"), ("inotrope_vaso", "BOOLEAN"),
        ("pda_both", "BOOLEAN"), ("pda_bounding_pulse", "BOOLEAN"),
        ("pda_clinical", "BOOLEAN"), ("pda_courses", "INTEGER"),
        ("pda_echo", "BOOLEAN"), ("pda_hyperactive_precordium", "BOOLEAN"),
        ("pda_ibu", "BOOLEAN"), ("pda_indo", "BOOLEAN"), ("pda_la_ao", "FLOAT"),
        ("pda_ligation_age", "INTEGER"), ("pda_lpa_velocity", "FLOAT"),
        ("pda_medical_rx", "VARCHAR"), ("pda_murmur", "BOOLEAN"),
        ("pda_other_feature", "BOOLEAN"), ("pda_other_feature_text", "VARCHAR"),
        ("pda_pattern_growing", "BOOLEAN"), ("pda_pattern_none", "BOOLEAN"),
        ("pda_pattern_pulsatile", "BOOLEAN"), ("pda_pcm", "BOOLEAN"),
        ("pda_peak_velocity", "FLOAT"), ("pda_shunt", "VARCHAR"),
        ("pda_systemic_steal", "VARCHAR"), ("pda_tdd", "FLOAT"),
        ("pda_wide_pp", "BOOLEAN"), ("sbp", "FLOAT"),
        ("structural_heart_disease", "VARCHAR"),
        ("structural_heart_disease_detail", "VARCHAR"), ("vis_score", "FLOAT"),
    ],
    "HEMATOLOGY (H6)": [
        ("anemia", "VARCHAR"), ("anemia_chf", "VARCHAR"), ("anemia_etiology", "VARCHAR"),
        ("anemia_etiology_other", "VARCHAR"), ("anemia_onset", "FLOAT"),
        ("bind", "VARCHAR"), ("cmv_screened", "VARCHAR"), ("dvet", "VARCHAR"),
        ("dvet_number", "INTEGER"), ("ffp_cryo", "VARCHAR"), ("ffp_number", "INTEGER"),
        ("irradiated", "VARCHAR"), ("ivig", "VARCHAR"), ("jaundice_etiology", "VARCHAR"),
        ("jaundice_etiology_other", "VARCHAR"), ("jaundice_onset", "DATE"),
        ("jaundice_passive", "DATE"), ("jaundice_type", "VARCHAR"),
        ("lowest_hb", "FLOAT"), ("peak_tsb", "FLOAT"), ("phototherapy", "VARCHAR"),
        ("platelet_number", "INTEGER"), ("platelets", "VARCHAR"),
        ("prbc", "VARCHAR"), ("prbc_number", "INTEGER"), ("prbc_volume", "FLOAT"),
    ],
    "RENAL (H7)": [
        ("aki", "VARCHAR"), ("aki_date", "DATE"), ("aki_dialysis", "BOOLEAN"),
        ("aki_oliguria", "BOOLEAN"), ("aki_peak_creatinine", "FLOAT"),
        ("aki_stage1", "BOOLEAN"), ("aki_stage2", "BOOLEAN"), ("aki_stage3", "BOOLEAN"),
    ],
    "OPHTHALMOLOGY / ROP (H7)": [
        ("rop", "VARCHAR"), ("rop_anti_vegf", "BOOLEAN"), ("rop_arop", "VARCHAR"),
        ("rop_bilateral", "VARCHAR"), ("rop_comment", "VARCHAR"),
        ("rop_diagnosis_date", "DATE"), ("rop_first_screen_date", "DATE"),
        ("rop_laser", "BOOLEAN"), ("rop_method_ido", "BOOLEAN"),
        ("rop_method_retcam", "BOOLEAN"), ("rop_other", "BOOLEAN"),
        ("rop_other_text", "VARCHAR"), ("rop_plus", "VARCHAR"),
        ("rop_screened", "VARCHAR"), ("rop_stage1", "BOOLEAN"),
        ("rop_stage2", "BOOLEAN"), ("rop_stage3", "BOOLEAN"), ("rop_stage4", "BOOLEAN"),
        ("rop_stage5", "BOOLEAN"), ("rop_treatment", "VARCHAR"),
        ("rop_vitrectomy", "BOOLEAN"), ("rop_zone1", "BOOLEAN"),
        ("rop_zone2", "BOOLEAN"), ("rop_zone3", "BOOLEAN"),
    ],
    "THERMOREGULATION (H8)": [
        ("hyperthermia", "VARCHAR"), ("hyperthermia_clothing", "BOOLEAN"),
        ("hyperthermia_equipment", "BOOLEAN"), ("hyperthermia_location_dr", "BOOLEAN"),
        ("hyperthermia_location_nicu", "BOOLEAN"),
        ("hyperthermia_location_transport", "BOOLEAN"), ("hyperthermia_other", "BOOLEAN"),
        ("hyperthermia_other_text", "VARCHAR"), ("hyperthermia_probe", "BOOLEAN"),
        ("hyperthermia_temp", "FLOAT"), ("hyperthermia_wrap", "BOOLEAN"),
        ("hypothermia", "VARCHAR"), ("hypothermia_environment", "BOOLEAN"),
        ("hypothermia_immaturity", "BOOLEAN"), ("hypothermia_ivh", "BOOLEAN"),
        ("hypothermia_location_dr", "BOOLEAN"), ("hypothermia_location_nicu", "BOOLEAN"),
        ("hypothermia_location_transport", "BOOLEAN"), ("hypothermia_lowest_temp", "FLOAT"),
        ("hypothermia_mild", "BOOLEAN"), ("hypothermia_moderate", "BOOLEAN"),
        ("hypothermia_other", "BOOLEAN"), ("hypothermia_other_text", "VARCHAR"),
        ("hypothermia_sepsis", "BOOLEAN"),
        ("hypothermia_severe", "BOOLEAN"),
    ],
    "VASCULAR ACCESS (H9)": [
        ("arterial_posterior_tibial", "BOOLEAN"), ("arterial_radial", "BOOLEAN"),
        ("extravasation", "VARCHAR"), ("line_comp_infection", "BOOLEAN"),
        ("line_comp_none", "BOOLEAN"), ("line_comp_thrombosis", "BOOLEAN"),
        ("peripheral_arterial", "VARCHAR"), ("peripheral_venous", "VARCHAR"),
        ("picc", "VARCHAR"), ("picc_days", "INTEGER"), ("uac", "VARCHAR"),
        ("uac_days", "INTEGER"), ("uvc", "VARCHAR"), ("uvc_days", "INTEGER"),
    ],
    "INFECTION (H10) totals": [
        ("vap_episodes", "INTEGER"),
    ],
    "HOSPITAL COURSE (H12)": [
        ("back_referral_hospital", "VARCHAR"), ("back_referral_other", "VARCHAR"),
        ("designation", "VARCHAR"), ("discharge_hc", "FLOAT"), ("total_los", "INTEGER"),
    ],
}


def run_migration():
    print("🔄 Starting migration: extend neonatal_morbidities (Form H)...")

    try:
        engine = create_engine(DATABASE_URL)

        with engine.connect() as conn:
            trans = conn.begin()

            try:
                for section_name, columns in SECTIONS.items():
                    print(f"  Adding {len(columns)} columns for {section_name}...")
                    col_defs = ",\n    ".join(
                        f"ADD COLUMN IF NOT EXISTS {name} {pg_type}"
                        for name, pg_type in columns
                    )
                    conn.execute(text(f"""
                        ALTER TABLE neonatal_morbidities
                        {col_defs}
                    """))

                print("  Adding infections JSON column (dynamic Infection / H10 episodes)...")
                conn.execute(text("""
                    ALTER TABLE neonatal_morbidities
                    ADD COLUMN IF NOT EXISTS infections JSON
                """))

                print("  Backfilling NULL infections to an empty JSON array...")
                conn.execute(text("""
                    UPDATE neonatal_morbidities
                    SET infections = '[]'::json
                    WHERE infections IS NULL
                """))

                trans.commit()

                print("\n✅ Migration completed successfully!")
                print("\n📊 Verifying a sample of the new columns...")

                sample_cols = [
                    "infections", "structural_heart_disease", "rop_arop",
                    "aki_stage1", "hypothermia_sepsis", "vap_episodes",
                ]
                result = conn.execute(text(f"""
                    SELECT column_name, data_type, is_nullable
                    FROM information_schema.columns
                    WHERE table_name = 'neonatal_morbidities'
                    AND column_name = ANY(:cols)
                    ORDER BY column_name
                """), {"cols": sample_cols})

                for row in result:
                    print(f"    ✓ {row[0]:<32} {row[1]:<20} nullable={row[2]}")

                total_new = sum(len(v) for v in SECTIONS.values()) + 1  # +1 for infections
                print(f"\n🎉 neonatal_morbidities now has {total_new} additional columns.")
                print("   Form H can now persist the full CRF field set, including the")
                print("   dynamic Infection (H10) episode list.\n")

                return True

            except Exception as e:
                trans.rollback()
                raise e

    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        print("\nTroubleshooting:")
        print("  1. Check if DATABASE_URL in config.py / .env is correct")
        print("  2. Verify database is running and accessible")
        print("  3. Check if you have ALTER TABLE permissions")
        print("  4. Manual fix: run backend/migrate_neonatal_morbidities.sql in psql/pgAdmin\n")
        return False


if __name__ == "__main__":
    success = run_migration()
    sys.exit(0 if success else 1)
