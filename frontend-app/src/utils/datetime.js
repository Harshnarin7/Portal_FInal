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
 * Format a date-like value into "DD-MM-YYYY". Returns "" for empty input.
 * @param {Date|string|number|null|undefined} date
 */
export function formatDateToDDMMYYYY(date) {
  if (!date) return "";
  const d = new Date(date);
  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`;
}
