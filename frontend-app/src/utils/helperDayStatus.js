/**
 * Helper-form day-strip status.
 *
 * Backend save stores `draft` until Submit, even at 100%. The day chip
 * must still show Complete (green) when every field is answered, and
 * keep Partial (orange) only for started-but-incomplete days.
 */
export function helperDayDisplayStatus(submissionStatus, completionPct = 0) {
  const st = String(submissionStatus || "").trim().toLowerCase();
  const pct = Number(completionPct);
  const n = Number.isFinite(pct) ? pct : 0;
  if (st === "submitted") return "submitted";
  if (n >= 100 || st === "complete") return "complete";
  if (st === "late") return "late";
  if (st === "draft" || st === "partial") return "draft";
  if (n > 0) return "draft";
  return st || "empty";
}

/** Status to persist on Save (Submit still writes `submitted` separately). */
export function helperDaySaveStatus(completionPct) {
  return Number(completionPct) >= 100 ? "complete" : "draft";
}
