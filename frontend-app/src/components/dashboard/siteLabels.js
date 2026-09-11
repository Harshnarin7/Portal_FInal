/** Presentation-only mapping of backend site codes to full trial names. */
const SITE_LABELS = {
  PGIMER: "PGIMER Chandigarh",
  GMCH: "GMCH Chandigarh",
  IOG: "IOG Chennai",
  AFMC: "Armed Forces Medical College (AFMC), Pune",
  "GMCH-A": "GMCH Aurangabad",
  AMC: "AMC Dibrugarh, Assam",
};

const SITE_SHORT = {
  PGIMER: "PGIMER",
  GMCH: "GMCH",
  IOG: "IOG",
  AFMC: "AFMC",
  "GMCH-A": "GMCH-A",
  AMC: "AMC",
};

const FULL_TO_SHORT = {
  "PGIMER Chandigarh": "PGIMER",
  "GMCH Chandigarh": "GMCH",
  "IOG Chennai": "IOG",
  "Armed Forces Medical College (AFMC), Pune": "AFMC",
  "GMCH Aurangabad": "GMCH-A",
  "AMC Dibrugarh, Assam": "AMC",
};

export function formatSiteName(site) {
  if (!site) return "—";
  const key = String(site).trim();
  return SITE_LABELS[key] || key;
}

export function formatSiteShort(site) {
  if (!site) return "—";
  const key = String(site).trim();
  if (SITE_SHORT[key]) return SITE_SHORT[key];
  const full = formatSiteName(key);
  return FULL_TO_SHORT[full] || key;
}

export const COORDINATING_SITE = "PGIMER Chandigarh";
export const PARTICIPATING_SITES = [
  "GMCH Chandigarh",
  "IOG Chennai",
  "Armed Forces Medical College (AFMC), Pune",
  "GMCH Aurangabad",
  "AMC Dibrugarh, Assam",
];
