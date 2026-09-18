/**
 * Shared Form A (screening) payload helpers.
 * POST/PUT /screenings/ uses ScreeningCreate — required fields must always
 * be present, and optional nulls must be omitted so exclude_unset PUTs
 * cannot wipe values saved from the mobile app (e.g. ICF signature).
 */

const REQUIRED_KEYS = [
  "site_name",
  "site_id",
  "screened_by",
  "mother_first_name",
  "husband_first_name",
  "gestation_weeks",
  "gestation_days",
  "exclusion_present",
];

const SIGNATURE_KEYS = [
  "consent_signature_image",
  "consent_signature_captured_at",
  "consent_obtained_by_signature",
  "pi_signature_image",
  "pi_signature_captured_at",
];

function isBlank(v) {
  return v == null || (typeof v === "string" && v.trim() === "");
}

/**
 * Coerce a buildPayloadFrom() object into a 422-safe ScreeningCreate body.
 * @param {Record<string, unknown>} payload
 * @returns {Record<string, unknown>}
 */
export function sanitizeScreeningCreatePayload(payload = {}) {
  const out = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) continue;
    if (SIGNATURE_KEYS.includes(key) && isBlank(value)) continue;
    if (value === null && !REQUIRED_KEYS.includes(key)) continue;
    out[key] = value;
  }

  if (out.site_name == null) out.site_name = "";
  if (out.site_id == null) out.site_id = "";
  if (out.screened_by == null) out.screened_by = "";
  if (out.mother_first_name == null) out.mother_first_name = "";
  if (out.husband_first_name == null) out.husband_first_name = "";

  const weeks = Number.parseInt(out.gestation_weeks, 10);
  out.gestation_weeks = Number.isFinite(weeks) ? weeks : 0;
  const days = Number.parseInt(out.gestation_days, 10);
  out.gestation_days = Number.isFinite(days) ? days : 0;
  out.exclusion_present = !!out.exclusion_present;

  if (isBlank(out.consent_signature_image)) {
    delete out.consent_signature_image;
    delete out.consent_signature_captured_at;
  }

  return out;
}
