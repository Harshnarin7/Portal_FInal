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

/** Blocks save. PGIMER and AMC require a CR number, matching Form A. */
export function maternalUidSaveError(site, value) {
  const v = String(value || "").trim();
  const code = siteCode(site);
  if (code === "PGIMER") {
    if (!v) return "CR number is required — exactly 12 digits.";
    if (!/^\d{12}$/.test(v)) {
      return v.length > 12 ? "Cannot be more than 12 digits" : "Must be exactly 12 digits";
    }
  }
  if (code === "AMC") {
    if (!v) return "CR number is required — e.g. 123/2026.";
    if (!/^\d+\/\d{4}$/.test(v)) return "Must be in serial/year format, e.g. 123/2026";
  }
  return "";
}
