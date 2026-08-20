// src/utils/siteNames.js
// Maps the site_name codes stored on User/Screening rows (PGIMER, GMCH,
// GMCH-A, AMC, AFMC, IOG — see ScreeningForm.jsx SITE_ID_MAP and
// dashboard.py ALL_SITES for the canonical code list) to the
// human-readable label shown in UI badges like the Header component.

export const SITE_DISPLAY_NAMES = {
  "PGIMER":  "PGIMER CHANDIGARH",
  "GMCH":    "GMCH CHANDIGARH",
  "GMCH-A":  "GMCH AURANGABAD",
  "AMC":     "AMC DIBRUGARH",
  "AFMC":    "AFMC PUNE",
  "IOG":     "IOG CHENNAI",
};

/**
 * Returns the display label for a site code, or a sensible fallback
 * (the raw code, or "PORTAL TRIAL" if no site at all — e.g. superadmin /
 * project_scientist accounts with no assigned site_name).
 */
export function siteDisplayName(siteCode) {
  if (!siteCode) return "PORTAL TRIAL";
  return SITE_DISPLAY_NAMES[siteCode] || siteCode;
}

// Short dashboard-table column codes — disambiguates GMCH (Chandigarh) from
// GMCH-A (Aurangabad), and AMC (Dibrugarh) from any other "AMC"-prefixed
// site, per PI naming (2026-08-20).
export const SITE_SHORT_CODES = {
  "GMCH": "GMCH-C",
  "AMC":  "AMC-D",
};

export function siteShortCode(siteCode) {
  return SITE_SHORT_CODES[siteCode] || siteCode;
}

// Canonical site order — mirrors backend/routers/dashboard.py ALL_SITES,
// which in turn mirrors CANONICAL_SITE_ID_MAP in main.py (the 01-06 codes
// used to generate screening/enrollment IDs). Dashboard tables that build
// their own site list (rather than taking the backend's ordered "sites"
// array) should sort against this so column order stays consistent across
// all sections.
export const SITE_ORDER = ["PGIMER", "GMCH", "IOG", "AFMC", "GMCH-A", "AMC"];

export function sortSitesCanonically(siteCodes) {
  return [...siteCodes].sort(
    (a, b) => SITE_ORDER.indexOf(a) - SITE_ORDER.indexOf(b)
  );
}