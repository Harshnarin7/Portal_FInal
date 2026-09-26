// formCompletion.js — PORTAL Trial
// When a downstream form (F–L) earns its green sidebar tick.
//
// A save — including the silent saves on Back / Next / sidebar navigation
// that protect partly-filled data — is NOT completion. A form is complete
// only when its key clinical items are answered AND it has been signed off
// (Completed By + Date), with no validation errors showing. PI decision
// 2026-09-26. Forms still autosave exactly as before; only the tick changes.
//
// Each rule takes plain form data so it can run both after a save and when
// a saved record is loaded (so the tick reflects the record, not the session).

const answered = (v) => {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (Array.isArray(v)) return v.length > 0;
  return true; // booleans (incl. false) and numbers count as answered
};

const signedOff = (completedBy, completionDate) =>
  answered(completedBy) && answered(completionDate);

/** Form F — Cranial USG. Key items: ≥1 scan recorded; items 5–6 (PHVD,
 *  VP shunt) answered, with their dates when Yes; no unresolved Helper 2
 *  IVH/cPVL gate. Item 8 is auto-calculated, so it isn't a key item. */
export function isFormFComplete({ scans, complications, completion, gateBlocking }) {
  if (gateBlocking) return false;
  if (!Array.isArray(scans) || !scans.some((s) => answered(s?.scanDate))) return false;
  const c = complications || {};
  if (!answered(c.phvd) || !answered(c.vpShunt)) return false;
  if (c.phvd === true && !answered(c.phvdDate)) return false;
  if (c.vpShunt === true && !answered(c.vpShuntDate)) return false;
  return signedOff(completion?.completedBy, completion?.completionDate);
}

// Mirrors backend rop_form_g_linkage.SCREENING_DETAIL_FIELDS: a visit row
// auto-suggested from Helper 5 carries only a date until someone fills it.
const ROP_VISIT_DETAIL_FIELDS = ["method", "re_stage", "re_zone", "le_stage", "le_zone", "plus_status"];

/** Form G — ROP. Key items: ≥1 real screening visit (dated, with clinical
 *  detail); item 17 Outcome (+ text when Other); item 18 ROP requiring
 *  treatment; item 19 final screening date; no pending auto-suggested
 *  visits awaiting review. */
export function isFormGComplete(data, { compositeValue, reviewAlerts } = {}) {
  const d = data || {};
  const realVisit = (d.screenings || []).some((s) =>
    answered(s?.date) && (answered(s?.signature) || ROP_VISIT_DETAIL_FIELDS.some((f) => answered(s?.[f]))));
  if (!realVisit) return false;
  if (Array.isArray(reviewAlerts) && reviewAlerts.length > 0) return false;
  if (!answered(d.outcome)) return false;
  if (d.outcome === "Other" && !answered(d.outcome_other_text)) return false;
  if (!answered(compositeValue ?? d.rop_treatment_composite)) return false;
  if (!answered(d.final_screening_date)) return false;
  return signedOff(d.completed_by, d.completion_date);
}

/** Form H — Morbidities. Key items: summary Outcome + Discharge date (the
 *  form's own "Required" items); all detected infection windows reviewed;
 *  no field-validation error currently showing. */
export function isFormHComplete(data, { errors, infectionReviewed } = {}) {
  const d = data || {};
  if (!infectionReviewed) return false;
  if (errors && Object.values(errors).some(Boolean)) return false;
  if (!answered(d.outcome) || !answered(d.discharge_date)) return false;
  return signedOff(d.completed_by, d.completion_date);
}

// Form I items already marked * on the form.
const FORM_I_REQUIRED = [
  "ventilation_required", "switched_100_o2", "resus_chest_compressions",
  "intubation_during_resus", "resp_support_72h", "sepsis_eos", "sepsis_los",
];

/** Form I — Study outcomes. Key items: the 7 starred items. */
export function isFormIComplete(data) {
  const d = data || {};
  if (!FORM_I_REQUIRED.every((k) => answered(d[k]))) return false;
  return signedOff(d.completed_by, d.completion_date);
}

/** Form J — External hospital. Complete when ≥1 saved assessment is
 *  signed off (each assessment row carries its own sign-off). */
export function isFormJComplete(savedRows) {
  return Array.isArray(savedRows)
    && savedRows.some((r) => signedOff(r?.completed_by, r?.completion_date));
}

/** Form K — MRI. Key items: item 1 "Selected for MRI subset"; when Yes,
 *  MRI date + K.4 Overall MRI. */
export function isFormKComplete(data) {
  const d = data || {};
  if (d.selected_for_mri === null || d.selected_for_mri === undefined) return false;
  if (d.selected_for_mri === true && (!answered(d.mri_date) || !answered(d.overall_mri))) return false;
  return signedOff(d.completed_by, d.completion_date);
}

/** Form L — Blender & summary. Key items: L.2 initial / exit / max-first-hour
 *  FiO₂; L.3 both composite outcomes + MRI abnormality. */
export function isFormLComplete(data) {
  const d = data || {};
  const keys = ["initial_fio2", "exit_fio2", "max_fio2_first_hour",
    "composite_outcome_1", "composite_outcome_2", "mri_abnormality"];
  if (!keys.every((k) => answered(d[k]))) return false;
  return signedOff(d.completed_by, d.completion_date);
}
