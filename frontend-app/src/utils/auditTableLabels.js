/** Human-readable labels for audit_log.table_name (DB __tablename__). */
export const AUDIT_TABLE_LABELS = {
  screenings: "Form A — Screening",
  birth_resuscitation: "Form B — Birth & Resuscitation",
  maternal_details: "Form C — Maternal Details",
  postnatal_day1: "Form D — Postnatal Day 1",
  nicu_admission: "Form E — NICU Admission",
  cranial_ultrasound: "Form F — Cranial USG",
  rop_screening: "Form G — ROP Screening",
  neonatal_morbidities: "Form H — Neonatal Morbidities",
  study_outcomes: "Form I — Study Outcomes",
  external_hospital_assessments: "Form J — External Hospital",
  mri_brain_assessments: "Form K — MRI Brain",
  blender_study_summaries: "Form L — Blender Summary",
  minimal_monitoring_day_logs: "Daily Monitoring Sheet (DMS)",
  resp_cv_neuro_day_logs: "Helper 2 — Resp/CV/Neuro (daily)",
  fio2_auc_logs: "Helper 3 — FiO₂ Logging",
  infect_gi_hema_day_logs: "Helper 4 — Infect/GI/Hema (daily)",
  metab_renal_vasc_eye_day_logs: "Helper 5 — Metab/Renal/Eye (daily)",
  cranial_usg_records: "Form F — Cranial USG (record)",
  sae_reports: "Form Y — SAE Report",
  adverse_events: "Adverse Events",
  sae_list: "SAE Listing",
  participant_pii: "Participant PII",
};

export function auditTableLabel(tableName) {
  if (!tableName) return "—";
  return AUDIT_TABLE_LABELS[tableName] || tableName.replace(/_/g, " ");
}

export const AUDIT_ACTIONS = ["INSERT", "UPDATE", "SOFT_DELETE", "OVERRIDE_UNLOCK"];
