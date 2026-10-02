/**
 * Maternal UID / CR number rules — same as ScreeningForm.jsx idFieldRule
 * for maternal_uid (confirmed with the study team 2026-08-01).
 * Other sites have no strict pattern.
 */

function siteCode(site) {
  const raw = String(site || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw.startsWith("pgimer")) return "PGIMER";
  if (raw === "amc" || raw.startsWith("amc ")) return "AMC";
  if (raw.startsWith("gmch-a") || raw.includes("aurangabad")) return "GMCH-A";
  if (raw === "gmch" || raw.startsWith("gmch ")) return "GMCH";
  if (raw.startsWith("iog")) return "IOG";
  if (raw.startsWith("afmc") || raw.includes("armed forces")) return "AFMC";
  return String(site || "").trim();
}

export function sanitizeMaternalUid(site, raw) {
  const s = String(raw || "");
  const code = siteCode(site);
  if (code === "PGIMER") return s.replace(/\D/g, "").slice(0, 12);
  if (code === "AMC") return s.replace(/[^0-9/]/g, "");
  return s;
}

export function maternalUidPlaceholder(site) {
  const code = siteCode(site);
  if (code === "PGIMER") return "12-digit CR number";
  if (code === "AMC") return "e.g. 123/2026";
  return "e.g. 20260495-4829";
}

/** Pattern error while typing. Empty is allowed here; save checks required. */
export function maternalUidLiveError(site, value) {
  const v = String(value || "").trim();
  if (!v) return "";
  const code = siteCode(site);
  if (!code) return "Select a site — the CR number format depends on the site.";
  if (code === "PGIMER" && !/^\d{12}$/.test(v)) {
    return v.length > 12 ? "Cannot be more than 12 digits" : "Must be exactly 12 digits";
  }
  if (code === "AMC" && !/^\d+\/\d{4}$/.test(v)) {
    return "Must be in serial/year format, e.g. 123/2026";
  }
  return "";
}

/** Blocks save only for a CR number in the wrong format. The CR number is
 *  NOT mandatory in the Gestation Log / Log of All Births (PI 2026-09-28):
 *  an entry without one is saved and shown as "CR pending". */
export function maternalUidSaveError(site, value) {
  const v = String(value || "").trim();
  if (!v) return "";
  return maternalUidLiveError(site, v);
}

export function normalizeCr(value) {
  return String(value || "").trim().toUpperCase().replace(/[\s-]+/g, "");
}

/** An entry at the same site with the same CR number (and, for births, the
 *  same date of birth), other than the one being edited.
 *
 *  birthOrder (PI 2026-10-01): a twin/triplet genuinely shares the mother's
 *  CR number and date of birth with its sibling(s) -- not a duplicate once
 *  both sides state which baby they are. A row with no birth order recorded
 *  (saved before this field existed, or still unclassified) keeps the old
 *  behaviour and is still flagged -- only a stated disagreement in order
 *  clears the match, mirroring backend cr_duplicates.find_duplicate. */
export function findDuplicateCr(entries, {
  site, uid, excludeId = null, dateOfBirth = null, matchDob = false, birthOrder = null,
}) {
  const cr = normalizeCr(uid);
  if (!cr || !site) return null;
  return (entries || []).find((e) => {
    if (e.id === excludeId) return false;
    if (e.site_name !== site) return false;
    if (normalizeCr(e.mother_uid) !== cr) return false;
    if (matchDob && (e.date_of_birth || "") !== (dateOfBirth || "")) return false;
    if (birthOrder != null && e.birth_order != null && birthOrder !== e.birth_order) return false;
    return true;
  }) || null;
}
