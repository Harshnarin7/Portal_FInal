/**
 * Shared date/time helpers used across PORTAL Trial forms.
 *
 * These were previously duplicated inline in several form components
 * (ScreeningForm, FormD, BirthResuscitationForm, useFormSession, …).
 */

const pad2 = (n) => String(n).padStart(2, "0");

/**
 * Shared NICU "working day" boundary. Before this local hour, "today"
 * is still yesterday — overnight staff finishing a shift land on (and
 * lock against) the same day the rest of the UI considers current.
 * Must stay in lockstep with backend `NICU_DAY_GRACE_HOUR` /
 * `MML_LATE_GRACE_HOUR` / `DAY1_DATE_ENTRY_GRACE_HOUR`.
 */
export const NICU_DAY_GRACE_HOUR = 11;

/**
 * NICU day number for `day1Date` as of `asOf`, applying the grace hour
 * so badges, future-locking, and the default tab all share one "today".
 * Clamped to ≥ 1 when Day 1 Date is calendar-today but the clock is
 * still inside the overnight window.
 */
export function nicuDayNumberFromDay1(day1Date, asOf = new Date(), graceHour = NICU_DAY_GRACE_HOUR) {
  if (!day1Date) return null;
  const base = new Date(`${day1Date}T00:00:00`);
  if (Number.isNaN(base.getTime())) return null;
  const ref = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
  if (asOf.getHours() < graceHour) {
    ref.setDate(ref.getDate() - 1);
  }
  const n = Math.floor((ref - base) / 86400000) + 1;
  return n < 1 ? 1 : n;
}

/** Calendar YYYY-MM-DD for NICU day N given Day 1 Date. */
export function calendarDateForNicuDay(day1Date, nicuDay) {
  if (!day1Date || nicuDay == null || Number(nicuDay) < 1) return null;
  const base = new Date(`${day1Date}T00:00:00`);
  if (Number.isNaN(base.getTime())) return null;
  base.setDate(base.getDate() + Number(nicuDay) - 1);
  return toDateOnlyValue(base);
}

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
 * Format a "YYYY-MM-DD" value as "06 Aug 2026" (always English, never
 * locale-hyphenated). Used by the helper-form Day 1 Date control so the
 * visible label cannot be clipped by a native date widget.
 * @param {string|null|undefined} iso
 */
export function formatIsoDateMedium(iso) {
  const d = parseDateOnly(iso);
  if (!d) return "";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${pad2(d.getDate())} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Short local timestamp for "Saved by X · 02 Sep, 14:30" provenance.
 * @param {string|Date|null|undefined} value
 */
export function formatStampShort(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Open the OS date picker from a styled control. Windows Chrome's
 * <input type="date"> ignores opacity and has a large min-width, so the
 * helper forms keep the native input clipped and call this on click.
 * @param {HTMLInputElement|null|undefined} input
 */
export function openNativeDatePicker(input) {
  if (!input || input.disabled) return;
  try {
    if (typeof input.showPicker === "function") input.showPicker();
    else input.focus();
  } catch {
    try { input.focus(); } catch { /* ignore */ }
  }
}

/**
 * Parse clock time to HH:MM:SS (24-hour). Accepts 24h, ISO fragments, and 12h with AM/PM
 * (e.g. "01:00 PM" → "13:00:00", "1:00 PM" → "13:00:00").
 * @param {string|null|undefined} value
 */
export function normalizeClockTimeHms(value) {
  if (value === "" || value == null) return "";
  const s = String(value).trim();

  const ampmOnly = s.match(
    /^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(A\.?M\.?|P\.?M\.?)$/i,
  );
  if (ampmOnly) {
    let h = Number(ampmOnly[1]);
    const mm = ampmOnly[2];
    const ss = pad2(ampmOnly[3] ?? "00");
    const ap = ampmOnly[4].replace(/\./g, "").toUpperCase();
    if (ap === "PM" && h !== 12) h += 12;
    if (ap === "AM" && h === 12) h = 0;
    if (!Number.isFinite(h) || h > 23) return s;
    return `${pad2(h)}:${mm}:${ss}`;
  }

  const m = s.match(/(?:T|\s|^)(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?/);
  if (!m) return s;
  const hh = Number(m[1]);
  const mm = m[2];
  const ss = pad2(m[3] ?? "00");
  if (!Number.isFinite(hh) || hh > 23) return s;
  return `${pad2(hh)}:${mm}:${ss}`;
}

/**
 * Normalize form/API datetime to `YYYY-MM-DDTHH:mm` (local), converting 12h times when present.
 * @param {string|Date|null|undefined} value
 */
export function normalizeDateTimeLocalString(value) {
  if (value === "" || value == null) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toDateTimeLocalValue(value);
  }
  const s = String(value).trim();

  let m = s.match(
    /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(A\.?M\.?|P\.?M\.?)$/i,
  );
  if (m) {
    let h = Number(m[4]);
    const mi = Number(m[5]);
    const ap = m[7].replace(/\./g, "").toUpperCase();
    if (ap === "PM" && h !== 12) h += 12;
    if (ap === "AM" && h === 12) h = 0;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), h, mi);
    return toDateTimeLocalValue(d);
  }

  m = s.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(A\.?M\.?|P\.?M\.?)?$/i,
  );
  if (m) {
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    let h = Number(m[4]);
    const mi = Number(m[5]);
    if (m[7]) {
      const ap = m[7].replace(/\./g, "").toUpperCase();
      if (ap === "PM" && h !== 12) h += 12;
      if (ap === "AM" && h === 12) h = 0;
    }
    const d = new Date(y, Number(m[2]) - 1, Number(m[1]), h, mi);
    return toDateTimeLocalValue(d);
  }

  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return toDateTimeLocalValue(d);
  return s;
}

/**
 * Display datetime as `DD-MM-YYYY HH:mm` (24-hour, no AM/PM).
 * @param {string|Date|null|undefined} value
 */
export function formatDateTimeDisplay24(value) {
  if (!value) return "—";
  const local = normalizeDateTimeLocalString(value);
  const d = local.includes("T") ? new Date(local) : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${formatDateToDDMMYYYY(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * Format an "HH:MM" (24h) value as "hh:mm AM/PM".
 * @param {string|null|undefined} hhmm
 */
export function formatTimeAmPm(hhmm) {
  const m = String(hhmm || "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return "";
  let h = Number(m[1]);
  if (!Number.isFinite(h) || h < 0 || h > 23) return "";
  const min = m[2];
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${pad2(h)}:${min} ${ap}`;
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
