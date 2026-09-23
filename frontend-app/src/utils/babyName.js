/**
 * NICU shorthand for the baby, e.g. "B/o Seema".
 * Prefers an explicit baby_name; otherwise uses the mother's first name.
 */
function usableName(value) {
  const s = String(value || "").trim();
  if (!s) return "";
  const upper = s.toUpperCase();
  if (upper === "DRAFT" || upper === "NAME PENDING") return "";
  return s;
}

export function formatBabyOfLabel(pii) {
  if (!pii) return "";
  const baby = usableName(pii.baby_name);
  if (baby) {
    const m = baby.match(/^(?:baby\s+of|b\/o)\s+(.+)$/i);
    if (m) {
      const rest = usableName(m[1]);
      return rest ? `B/o ${rest}` : "";
    }
    return baby;
  }
  const first = usableName(pii.mother_first_name);
  if (first) return `B/o ${first}`;
  return "";
}

/** Mother's first name only (no B/o). */
export function formatMotherFirstName(pii) {
  return usableName(pii?.mother_first_name);
}

/**
 * View Entries name column:
 * Form A only → mother's first name
 * Form B started (draft or saved) → "B/o {mother first name}"
 */
export function formatParticipantListName(pii, { formBStarted } = {}) {
  const mother = formatMotherFirstName(pii);
  if (!mother) return "";
  if (formBStarted) return `B/o ${mother}`;
  return mother;
}
