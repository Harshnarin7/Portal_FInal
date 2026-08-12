/**
 * Effective gestational age for forms AFTER Form D.
 *
 * Rules:
 * - Form B stores the screening/birth GA (also returned as original_gestation_*).
 * - If Form D NBS differs from that by more than 2 weeks (>14 days),
 *   downstream forms must use the NBS GA.
 * - Form B itself must keep showing/saving original Form B GA.
 *
 * @param {object} birth  GET /birth-resuscitation/{id} payload
 * @param {object|null} formD  GET /postnatal-day1/{id} payload, or null
 */
export function totalGestationDays(weeks, days) {
  if (weeks === null || weeks === undefined || weeks === "") return null;
  const w = Number(weeks);
  const d = Number(days ?? 0);
  if (Number.isNaN(w) || Number.isNaN(d)) return null;
  return w * 7 + d;
}

export function resolveEffectiveGestation(birth = {}, formD = null) {
  const originalWeeks =
    birth?.original_gestation_weeks != null
      ? birth.original_gestation_weeks
      : (birth?.gestation_weeks ?? null);
  const originalDays =
    birth?.original_gestation_weeks != null
      ? (birth.original_gestation_days ?? 0)
      : (birth?.gestation_days ?? 0);

  if (formD?.ga_method === "NBS") {
    const originalTotal = totalGestationDays(originalWeeks, originalDays);
    const nbsTotal = totalGestationDays(formD.gestation_weeks, formD.gestation_days);
    if (nbsTotal !== null && (originalTotal === null || Math.abs(nbsTotal - originalTotal) > 14)) {
      return {
        weeks: formD.gestation_weeks,
        days: formD.gestation_days ?? 0,
        source: "Form D NBS",
        usedNbs: true,
      };
    }
  }

  // Birth endpoint may already overlay NBS onto gestation_weeks when Form D
  // was not fetched by the caller.
  if (!formD && birth?.gestation_source === "Form D NBS") {
    return {
      weeks: birth.gestation_weeks ?? null,
      days: birth.gestation_days ?? 0,
      source: "Form D NBS",
      usedNbs: true,
    };
  }

  return {
    weeks: originalWeeks,
    days: originalDays,
    source: "Form B",
    usedNbs: false,
  };
}
