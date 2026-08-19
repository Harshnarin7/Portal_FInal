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