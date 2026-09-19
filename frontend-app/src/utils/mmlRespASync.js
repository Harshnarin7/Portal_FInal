import { getMapCpapMode } from "./mapCpapMode";

export function normalizeYmd(raw) {
  if (raw == null || raw === "") return null;
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const dmy = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function sheetMatchesHelperDay(payload, recordDate) {
  if (!recordDate || !payload?.record_date) return false;
  return normalizeYmd(payload.record_date) === normalizeYmd(recordDate);
}

function rowOnHelperDay(row, recordDate, sheetDate, sheetIsHelperDay) {
  if (sheetIsHelperDay) return true;
  if (!recordDate) return true;
  const raw = row?.date;
  const ds = raw == null || raw === ""
    ? normalizeYmd(sheetDate)
    : normalizeYmd(raw);
  if (!ds) return true;
  return ds === normalizeYmd(recordDate);
}

function modesList(row) {
  const v = row?.respiratory_modes;
  if (Array.isArray(v)) return v.filter(Boolean);
  return String(v || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Helper 1 pills use `AC`; MML 5.2.A uses `A/C`. */
export function normalizeHelperSupportModes(modes) {
  const out = new Set();
  for (const m of modes || []) {
    if (!m) continue;
    out.add(m === "A/C" ? "AC" : m);
  }
  return [...out];
}

function pushNum(arr, raw) {
  if (raw === null || raw === undefined || raw === "") return;
  const n = Number(raw);
  if (Number.isFinite(n)) arr.push(n);
}

function appendFlatRespA(payload, rows, recordDate, sheetDate) {
  if (!payload) return;
  const sheetYmd = normalizeYmd(sheetDate);
  const helperYmd = normalizeYmd(recordDate);
  if (helperYmd && sheetYmd && sheetYmd !== helperYmd) return;
  const flatModes = modesList({ respiratory_modes: payload.respiratory_modes });
  const hasFlat =
    flatModes.length > 0
    || (payload.max_fio2 != null && payload.max_fio2 !== "")
    || (payload.max_map_cpap != null && payload.max_map_cpap !== "")
    || (payload.max_map_cpap_secondary != null && payload.max_map_cpap_secondary !== "");
  if (!hasFlat) return;
  rows.push({
    date: sheetDate,
    respiratory_modes: flatModes,
    max_map_cpap: payload.max_map_cpap ?? "",
    max_map_cpap_secondary: payload.max_map_cpap_secondary ?? "",
    max_fio2: payload.max_fio2 ?? "",
  });
}

/** All 5.2.A rows on the helper NICU calendar day (non-empty). */
export function parseRespAEntries(payload, recordDate = null) {
  const rows = [];
  const sheetDate = payload?.record_date
    ? normalizeYmd(payload.record_date)
    : normalizeYmd(recordDate);
  const effectiveDate = normalizeYmd(recordDate) || sheetDate;
  const sheetIsHelperDay = sheetMatchesHelperDay(payload, effectiveDate);

  let entries = payload?.entries_json;
  if (typeof entries === "string") {
    try { entries = JSON.parse(entries); } catch (_) { entries = null; }
  }
  const list = entries?.resp_a;
  if (Array.isArray(list) && list.length) {
    for (const row of list) {
      if (!rowOnHelperDay(row, effectiveDate, sheetDate, sheetIsHelperDay)) continue;
      const hasModes = modesList(row).length > 0;
      const hasNums =
        row?.max_fio2 !== "" && row?.max_fio2 != null
        || row?.max_map_cpap !== "" && row?.max_map_cpap != null
        || row?.max_map_cpap_secondary !== "" && row?.max_map_cpap_secondary != null;
      if (!hasModes && !hasNums) continue;
      rows.push(row);
    }
  }

  // Flat columns mirror first resp_a entry on save; also used when entries_json
  // exists but row dates failed to match the helper calendar day.
  appendFlatRespA(payload, rows, effectiveDate, sheetDate);

  if (rows.length === 0 && entries == null && payload) {
    appendFlatRespA(payload, rows, null, sheetDate);
  }

  return rows;
}

/**
 * Daily maxima for Helper 1 #3–#5 from hourly 5.2.A readings.
 * CPAP/MAP field mapping matches Helper 1 (primary = MAP or single value).
 */
export function computeRespAAutofillFromMml(rows, fmtNum) {
  const cpapVals = [];
  const mapVals = [];
  const fio2Vals = [];
  const modeSet = new Set();

  for (const row of rows) {
    const modes = modesList(row);
    modes.forEach((m) => modeSet.add(m));
    const mode = getMapCpapMode(modes);
    if (mode === "BOTH") {
      pushNum(cpapVals, row.max_map_cpap_secondary);
      pushNum(mapVals, row.max_map_cpap);
    } else if (mode === "CPAP") {
      pushNum(cpapVals, row.max_map_cpap);
    } else if (mode === "MAP") {
      pushNum(mapVals, row.max_map_cpap);
    }
    pushNum(fio2Vals, row.max_fio2);
  }

  const modesUnion = normalizeHelperSupportModes([...modeSet]);
  const aggregateMode = getMapCpapMode(modesUnion);
  const maxCpap = cpapVals.length ? Math.max(...cpapVals) : null;
  const maxMap = mapVals.length ? Math.max(...mapVals) : null;
  const maxFio2 = fio2Vals.length ? Math.max(...fio2Vals) : null;

  let mapCpap = null;
  let mapCpapSecondary = null;
  if (aggregateMode === "BOTH") {
    mapCpap = maxMap;
    mapCpapSecondary = maxCpap;
  } else if (aggregateMode === "CPAP") {
    mapCpap = maxCpap;
  } else if (aggregateMode === "MAP") {
    mapCpap = maxMap;
  }

  const fmt = (n) => (n == null ? null : fmtNum(n));

  return {
    modesUnion,
    aggregateMode,
    cpapVals,
    mapVals,
    fio2Vals,
    max_fio2: fmt(maxFio2),
    map_cpap: fmt(mapCpap),
    map_cpap_secondary: fmt(mapCpapSecondary),
    hasRows: rows.length > 0,
  };
}

export function respNumericLooksMmlSourced(current, values) {
  const t = current == null ? "" : String(current).trim();
  if (t === "") return true;
  const n = Number(t);
  if (!Number.isFinite(n) || !values.length) return false;
  const maxV = Math.max(...values);
  return Math.abs(n - maxV) < 1e-6;
}

export function respModesUnionLooksSourced(currentModes, union) {
  if (!currentModes?.length) return true;
  if (!union?.length) return true;
  const a = new Set(normalizeHelperSupportModes(currentModes));
  const b = new Set(normalizeHelperSupportModes(union));
  if (a.size !== b.size) return false;
  for (const m of a) if (!b.has(m)) return false;
  return true;
}

export function modesArraysEqual(a, b) {
  const na = normalizeHelperSupportModes(a || []);
  const nb = normalizeHelperSupportModes(b || []);
  if (!na.length && !nb.length) return true;
  return respModesUnionLooksSourced(na, nb) && respModesUnionLooksSourced(nb, na);
}

/** Parse "08:00–14:00" / "8:00 AM - 2:00 PM" / a single time into {from, to} 24h HH:MM. */
function parseTimeRangeStr(value) {
  const s = String(value || "").trim();
  if (!s) return { from: "", to: "" };
  const parts = s.split(/\s*[–—−-]\s*|\s+to\s+/i).map((p) => p.trim()).filter(Boolean);
  const toHHmm = (raw) => {
    const t = String(raw || "").trim();
    const m = t.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
    if (!m) return "";
    let h = Number(m[1]);
    const min = m[2];
    const ap = (m[3] || "").toUpperCase();
    if (ap === "PM" && h < 12) h += 12;
    if (ap === "AM" && h === 12) h = 0;
    if (!Number.isFinite(h) || h < 0 || h > 23) return "";
    return `${String(h).padStart(2, "0")}:${min}`;
  };
  if (parts.length === 1) return { from: toHHmm(parts[0]), to: "" };
  return { from: toHHmm(parts[0]), to: toHHmm(parts[1]) };
}

function hhmmToMinutes(hhmm) {
  const m = String(hhmm || "").match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const mins = Number(m[1]) * 60 + Number(m[2]);
  return Number.isFinite(mins) ? mins : null;
}

/**
 * Convert DMS 5.2.A entries (each a {time_range, max_fio2, ...}) into FiO2
 * AUC rectangle rows for the two 12h windows, splitting any entry that spans
 * the 12h boundary. Entries with no usable time range or no max_fio2 are
 * skipped outright — a real clinical gap stays a gap here, it is never
 * papered over with an invented value (e.g. assumed room air).
 */
export function buildFio2AucRowsFromRespA(respARows) {
  const spans = [];
  for (const row of respARows || []) {
    const { from, to } = parseTimeRangeStr(row?.time_range);
    const fromMin = hhmmToMinutes(from);
    const toMin = hhmmToMinutes(to);
    const fio2 = row?.max_fio2;
    if (fromMin == null || toMin == null || toMin <= fromMin) continue;
    if (fio2 === "" || fio2 == null || !Number.isFinite(Number(fio2))) continue;
    spans.push({ from: fromMin, to: toMin, fio2: Number(fio2) });
  }
  spans.sort((a, b) => a.from - b.from);

  const BOUNDARY = 12 * 60;
  const w1 = [];
  const w2 = [];
  for (const s of spans) {
    if (s.to <= BOUNDARY) {
      w1.push(s);
    } else if (s.from >= BOUNDARY) {
      w2.push({ from: s.from - BOUNDARY, to: s.to - BOUNDARY, fio2: s.fio2 });
    } else {
      w1.push({ from: s.from, to: BOUNDARY, fio2: s.fio2 });
      w2.push({ from: 0, to: s.to - BOUNDARY, fio2: s.fio2 });
    }
  }

  const toRows = (list) =>
    list.map(({ from, to, fio2 }) => ({
      fio2: String(fio2),
      dur: String(Math.round(((to - from) / 60) * 100) / 100),
    }));

  return { w1: toRows(w1), w2: toRows(w2) };
}
