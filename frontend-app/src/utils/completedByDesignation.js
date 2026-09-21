/** Completed-by designation autofill (Form D/E/H and later CRF footers).

PGIMER named titles stay as they were. Other-site scientists are
Project Research Scientist II (Medical). Nurses match Tanvi Saini /
Yashvi Jolly: Project Nurse III.
*/

export const DESIGNATION_NURSE = "Project Nurse III";
export const DESIGNATION_SITE_SCIENTIST =
  "Project Research Scientist II (Medical)";
export const DESIGNATION_PROJECT_SCIENTIST =
  "Project Research Scientist III (Medical)";
export const DESIGNATION_SHALINI =
  "Project Research Scientist III (Non-Medical)";

/** Site scientists whose seeded full_name has no "Dr." prefix. */
const SITE_SCIENTISTS_WITHOUT_DR = new Set(["Nafifa Tasmeen Rahman"]);

function nameKey(name) {
  return String(name || "")
    .replace(/^Dr\.\s*/i, "")
    .trim();
}

export function fallbackCompletedByDesignation(name) {
  if (!name) return "";
  const n = nameKey(name);
  if (n === "Mannat Guliani") return DESIGNATION_PROJECT_SCIENTIST;
  if (n === "Shalini Dhiman") return DESIGNATION_SHALINI;
  if (/^Dr\.\s*/i.test(String(name).trim())) return DESIGNATION_SITE_SCIENTIST;
  if (SITE_SCIENTISTS_WITHOUT_DR.has(n)) return DESIGNATION_SITE_SCIENTIST;
  return DESIGNATION_NURSE;
}

export function designationForCompletedBy(name, roster = []) {
  if (!name) return "";
  const hit = (roster || []).find((r) => r && r.full_name === name);
  if (hit?.designation) return hit.designation;
  return fallbackCompletedByDesignation(name);
}
