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
