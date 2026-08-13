/**
 * Shared date/time helpers used across PORTAL Trial forms.
 *
 * These were previously duplicated inline in several form components
 * (ScreeningForm, FormD, BirthResuscitationForm, useFormSession, …).
 */

const pad2 = (n) => String(n).padStart(2, "0");

/**
 * Human-friendly "time since" string for auto-save timestamps.
 * @param {Date|null|undefined} date
 * @returns {string|null} e.g. "just now", "12s ago", "3m ago", "2h ago"
 */
export function relativeTime(date) {
  if (!date) return null;
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 10) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

/**
 * Format a Date into the value expected by <input type="datetime-local">
 * i.e. "YYYY-MM-DDTHH:mm" in local time.
 * @param {Date} d
 */
export function toDateTimeLocalValue(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * Format a Date into "YYYY-MM-DD" using LOCAL date components.
 *
 * IMPORTANT: never use `date.toISOString().split("T")[0]` for this.
 * toISOString() always converts to UTC first, so for any timezone ahead
 * of UTC (e.g. IST, UTC+5:30) a locally-selected midnight can roll back
 * to the previous day once converted — picking "9 Dec" ends up saved as
 * "8 Dec". This function reads the Date's local getters instead, so the
 * calendar day you clicked is the calendar day that gets saved.
 * @param {Date|null|undefined} d
 */
export function toDateOnlyValue(d) {
  if (!d) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Parse a "YYYY-MM-DD" string into a local Date at local midnight.
 *
 * IMPORTANT: never pass a bare "YYYY-MM-DD" string straight to `new Date()`
 * for use as a DatePicker `selected` value — the JS spec parses date-only
 * ISO strings as UTC midnight, which then renders one day earlier in any
 * timezone behind UTC once the picker converts it back to local time.
 * This function builds the Date from the individual numbers instead, so
 * it always lands on the intended calendar day regardless of timezone.
 * @param {string|null|undefined} value
 * @returns {Date|null}
 */
export function parseDateOnly(value) {
  if (!value) return null;
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/**
 * Format a date-like value into "DD-MM-YYYY". Returns "" for empty input.
 * Prefer parseDateOnly for "YYYY-MM-DD" so IST/other TZ never shifts the day.
 * @param {Date|string|number|null|undefined} date
 */
export function formatDateToDDMMYYYY(date) {
  if (!date) return "";
  if (typeof date === "string") {
    const parsed = parseDateOnly(String(date).slice(0, 10));
    if (parsed) {
      return `${pad2(parsed.getDate())}-${pad2(parsed.getMonth() + 1)}-${parsed.getFullYear()}`;
    }
  }
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`;
}

/**
 * Whole calendar-day difference (b − a), DST-safe via UTC date components.
 * @param {Date} a
 * @param {Date} b
 */
export function calendarDaysBetween(a, b) {
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcB - utcA) / 86400000);
}

/**
 * Naegele: EDD = LMP + 280 days. Returns "YYYY-MM-DD" or "".
 * @param {string|null|undefined} lmpDateStr
 */
export function eddFromLmp(lmpDateStr) {
  const lmp = parseDateOnly(String(lmpDateStr || "").slice(0, 10));
  if (!lmp) return "";
  const edd = new Date(lmp.getFullYear(), lmp.getMonth(), lmp.getDate());
  edd.setDate(edd.getDate() + 280);
  return toDateOnlyValue(edd);
}

/**
 * Gestational age from LMP: completed weeks/days since LMP (local calendar).
 * @param {string|null|undefined} lmpDateStr
 * @param {Date} [asOf]
 */
export function gestAgeFromLmp(lmpDateStr, asOf = new Date()) {
  const lmp = parseDateOnly(String(lmpDateStr || "").slice(0, 10));
  if (!lmp) return null;
  const today = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
  const gestDays = calendarDaysBetween(lmp, today);
  if (Number.isNaN(gestDays)) return null;
  if (gestDays < 0) return { weeks: 0, days: 0 };
  return { weeks: Math.floor(gestDays / 7), days: gestDays % 7 };
}

/**
 * Gestational age from EDD: GA = 280 − (EDD − today).
 * @param {string|null|undefined} eddDateStr
 * @param {Date} [asOf]
 */
export function gestAgeFromEdd(eddDateStr, asOf = new Date()) {
  const edd = parseDateOnly(String(eddDateStr || "").slice(0, 10));
  if (!edd) return null;
  const today = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
  const daysUntilEdd = calendarDaysBetween(today, edd);
  const gestDays = 280 - daysUntilEdd;
  if (Number.isNaN(gestDays)) return null;
  if (gestDays < 0) return { weeks: 0, days: 0 };
  return { weeks: Math.floor(gestDays / 7), days: gestDays % 7 };
}
