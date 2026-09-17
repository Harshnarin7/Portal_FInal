/** Per-enrollment UI session (survives helper form unmount / sidebar navigation). */

/** Stable form keys for readRememberedActiveDay / rememberActiveDay (keep in sync with backend form ids). */
export const HELPER_SESSION_KEY_VS6_1 = "vs6_1";
export const HELPER_SESSION_KEY_INFECT_GI_HEMA = "infect_gi_hema";
export const HELPER_SESSION_KEY_METAB_RENAL_VASC_EYE = "metab_renal_vasc_eye";

function safeGet(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key, value) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* ignore quota / private mode */
  }
}

export function helperActiveDayKey(formKey, enrollmentId) {
  return `portal-helper-day-${formKey}-${String(enrollmentId || "").trim()}`;
}

export function readRememberedActiveDay(formKey, enrollmentId) {
  const raw = safeGet(helperActiveDayKey(formKey, enrollmentId));
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

export function rememberActiveDay(formKey, enrollmentId, day) {
  const n = parseInt(day, 10);
  if (!Number.isFinite(n) || n < 1) return;
  safeSet(helperActiveDayKey(formKey, enrollmentId), String(n));
}

export function mmlSheetDateKey(enrollmentId) {
  return `portal-mml-sheet-${String(enrollmentId || "").trim()}`;
}

export function readRememberedMmlSheetDate(enrollmentId) {
  const v = safeGet(mmlSheetDateKey(enrollmentId));
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

export function rememberMmlSheetDate(enrollmentId, ymd) {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return;
  safeSet(mmlSheetDateKey(enrollmentId), ymd);
}
