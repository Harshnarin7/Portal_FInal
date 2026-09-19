import React, { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useParams, useNavigate } from "react-router-dom";
import api from "./api/axios";
import { toDateOnlyValue, formatIsoDateMedium, formatStampShort, nicuDayNumberFromDay1, calendarDateForNicuDay, NICU_DAY_GRACE_HOUR, helperDayStripLength } from "./utils/datetime";
// ✅ Reuses RespCVNeuro.css — same design system, same class names
import "./styles/RespCVNeuro.css";
// Repeatable-entry list styling (mml-*) — same component the Metabolic
// helper form (Helper 4) uses for its pH/sodium/potassium/calcium
// readings lists, reused here for sepsis screens.
import "./styles/MinimalMonitoring.css";
import { usePatient } from "./context/PatientContext";
import { useFormProgress } from "./context/FormProgressContext";
import { useAuth } from "./context/AuthContext";
import SaveSuccessModal from "./components/SaveSuccessModal";
import AuditChangeList from "./components/AuditChangeList";
import { auditActionLabel } from "./utils/auditDiff";
import { useRegisterActiveFormSession } from "./context/ActiveFormSessionContext";
import { normalizeHelperDob } from "./hooks/useHelperDobSyncDay1";
import { mmlSyncAggregateFieldFromMml } from "./utils/mmlHelperSync";
import { rememberActiveDay, HELPER_SESSION_KEY_INFECT_GI_HEMA } from "./utils/helperSession";
import { useDefaultToWorkingNicuDay, useNicuWorkingDay } from "./hooks/useNicuWorkingDay";
import {
  ArrowLeft, ArrowRight, Save, ChevronDown,
  CheckCircle, AlertTriangle, X, Clock, Check,
  Lock, Edit,
  AlertOctagon, History, Unlock, Plus, Trash2, ListChecks, Calendar,
} from "lucide-react";

const pad2ig = n => String(n).padStart(2, "0");
const uidIg = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const nowTimeIg = (d = new Date()) => `${pad2ig(d.getHours())}:${pad2ig(d.getMinutes())}`;

function sepsisScreenHasData(entry) {
  if (!entry) return false;
  return Object.entries(entry).some(([k, v]) => {
    if (k === "id" || k === "date" || k === "time" || k === "type") return false;
    return mmlGiAEntryAnswered(v);
  });
}

function blankSepsisScreen() {
  const d = new Date();
  return { id: uidIg(), date: toDateOnlyValue(d), time: nowTimeIg(d), type: "CRP", value: "", result: "" };
}

function mmlGiAEntryAnswered(v) {
  if (v === null || v === undefined) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "boolean") return true;
  return String(v).trim() !== "";
}

function mmlGiAEntryHasData(entry) {
  if (!entry) return false;
  return Object.entries(entry).some(([k, v]) => {
    if (k === "id" || k === "date" || k === "time") return false;
    return mmlGiAEntryAnswered(v);
  });
}

/** Per-reading 5.4.A volumes for a Helper NICU calendar day (ml). */
function parseGiAFeedVolumeValues(payload, recordDate = null) {
  if (!payload) return [];
  const rowOnHelperDay = (row) => {
    if (!recordDate) return true;
    const d = row?.date;
    if (d == null || d === "") return true;
    return String(d).slice(0, 10) === recordDate;
  };
  const values = [];
  let entries = payload.entries_json;
  if (typeof entries === "string") {
    try { entries = JSON.parse(entries); } catch (_) { entries = null; }
  }
  const giA = entries?.gi_a;
  if (Array.isArray(giA) && giA.length > 0) {
    for (const e of giA) {
      if (!rowOnHelperDay(e)) continue;
      if (!mmlGiAEntryHasData(e)) continue;
      // New flowsheet shape (5.4.A redesign): each row is a discrete EF/NPO
      // reading, "status"/"volume_ml" replace the old single flat
      // cumulative_feed_volume field — only EF rows carry a real volume.
      // Legacy rows (saved before the redesign) have no "status" key at all
      // and still carry the old field directly.
      const isNewShape = e?.status !== undefined;
      if (isNewShape && e.status !== "EF") continue;
      const n = Number(isNewShape ? e.volume_ml : e?.cumulative_feed_volume);
      if (!Number.isFinite(n)) continue;
      values.push(n);
    }
    return values;
  }
  if (entries == null) {
    const n = Number(payload.cumulative_feed_volume);
    if (Number.isFinite(n)) values.push(n);
  }
  return values;
}

function mergeGiAFeedValueLists(a, b) {
  return [...a, ...b];
}

/** Distinct milk types used across a day's EF readings (5.4.A flowsheet
 *  redesign) — legacy-shape entries have no milk_type field at all, so
 *  they simply never contribute here (nothing to backward-compat for). */
function parseGiAMilkTypes(payload, recordDate = null) {
  if (!payload) return [];
  const rowOnHelperDay = (row) => {
    if (!recordDate) return true;
    const d = row?.date;
    if (d == null || d === "") return true;
    return String(d).slice(0, 10) === recordDate;
  };
  let entries = payload.entries_json;
  if (typeof entries === "string") {
    try { entries = JSON.parse(entries); } catch (_) { entries = null; }
  }
  const giA = entries?.gi_a;
  if (!Array.isArray(giA)) return [];
  const seen = [];
  for (const e of giA) {
    if (!rowOnHelperDay(e)) continue;
    if (e?.status !== "EF" || !e?.milk_type) continue;
    if (!seen.includes(e.milk_type)) seen.push(e.milk_type);
  }
  return seen;
}

function mergeGiAMilkTypeLists(a, b) {
  const out = [...a];
  for (const t of b) if (!out.includes(t)) out.push(t);
  return out;
}

async function loadMmlGiAMilkTypesForHelperDay(enrollmentId, recordDate) {
  let merged = [];
  const ingest = (payload) => {
    if (!payload) return;
    merged = mergeGiAMilkTypeLists(merged, parseGiAMilkTypes(payload, recordDate));
  };
  try {
    const res = await api.get(`/minimal-monitoring/${enrollmentId}/on/${recordDate}`);
    ingest(res?.data);
  } catch (_) { /* optional */ }
  if (merged.length > 0) return merged;
  try {
    const res = await api.get(
      `/minimal-monitoring/${enrollmentId}/today`,
      { params: { boundary_hour: NICU_DAY_GRACE_HOUR } },
    );
    const today = res?.data || {};
    if (today.record_date && today.record_date !== recordDate) ingest(today);
    else if (today.record_date && today.record_date === recordDate) {
      merged = parseGiAMilkTypes(today, recordDate);
    }
  } catch (_) { /* optional */ }
  return merged;
}

async function loadMmlGiAFeedValuesForHelperDay(enrollmentId, recordDate) {
  let merged = [];
  const ingest = (payload) => {
    if (!payload) return;
    merged = mergeGiAFeedValueLists(
      merged,
      parseGiAFeedVolumeValues(payload, recordDate),
    );
  };
  try {
    const res = await api.get(`/minimal-monitoring/${enrollmentId}/on/${recordDate}`);
    ingest(res?.data);
  } catch (_) { /* optional */ }
  if (merged.length > 0) return merged;
  try {
    const res = await api.get(
      `/minimal-monitoring/${enrollmentId}/today`,
      { params: { boundary_hour: NICU_DAY_GRACE_HOUR } },
    );
    const today = res?.data || {};
    if (today.record_date && today.record_date !== recordDate) ingest(today);
    else if (today.record_date && today.record_date === recordDate) {
      merged = parseGiAFeedVolumeValues(today, recordDate);
    }
  } catch (_) { /* optional */ }
  return merged;
}

function sumGiAFeedVolumeValues(values) {
  if (!values.length) return null;
  return values.reduce((sum, n) => sum + n, 0);
}

/** Sum of numeric 5.4.A cumulative feed volume from a Minimal Monitoring sheet. */
function mmlSumCumulativeFeedVolume(data, recordDate = null) {
  const values = parseGiAFeedVolumeValues(data, recordDate);
  return sumGiAFeedVolumeValues(values);
}

/** 5.6.A → Helper 3 #28–#30: any product logged that NICU day → Yes. */
function parseHemeATransfusionFlags(payload, recordDate = null) {
  const rowOnHelperDay = (row) => {
    if (!recordDate) return true;
    const d = row?.date;
    if (d == null || d === "") return true;
    return String(d).slice(0, 10) === recordDate;
  };
  const parseProducts = (raw) => {
    if (Array.isArray(raw)) return raw.map(String);
    if (typeof raw === "string" && raw.trim()) {
      return raw.split(",").map(s => s.trim()).filter(Boolean);
    }
    return [];
  };
  const out = { prbc: false, platelet: false, ffpCryo: false };
  const absorb = (products) => {
    if (products.includes("PRBC")) out.prbc = true;
    if (products.includes("Platelets")) out.platelet = true;
    if (products.includes("FFP/Cryo")) out.ffpCryo = true;
  };
  if (!payload) return out;
  let entries = payload.entries_json;
  if (typeof entries === "string") {
    try { entries = JSON.parse(entries); } catch (_) { entries = null; }
  }
  const list = entries?.heme_a;
  if (Array.isArray(list) && list.length) {
    for (const row of list) {
      if (!rowOnHelperDay(row)) continue;
      if (!mmlGiAEntryHasData(row)) continue;
      absorb(parseProducts(row?.transfusion_products));
    }
    return out;
  }
  if (entries == null) absorb(parseProducts(payload.transfusion_products));
  return out;
}

function mergeHemeTransfusionFlags(a, b) {
  return {
    prbc: a.prbc || b.prbc,
    platelet: a.platelet || b.platelet,
    ffpCryo: a.ffpCryo || b.ffpCryo,
  };
}

async function loadMmlHemeTransfusionFlagsForHelperDay(enrollmentId, recordDate) {
  let merged = { prbc: false, platelet: false, ffpCryo: false };
  const ingest = (payload) => {
    if (!payload) return;
    merged = mergeHemeTransfusionFlags(merged, parseHemeATransfusionFlags(payload, recordDate));
  };
  try {
    const res = await api.get(`/minimal-monitoring/${enrollmentId}/on/${recordDate}`);
    ingest(res?.data);
  } catch (_) { /* optional */ }
  const hasAny = merged.prbc || merged.platelet || merged.ffpCryo;
  if (hasAny) return merged;
  try {
    const res = await api.get(
      `/minimal-monitoring/${enrollmentId}/today`,
      { params: { boundary_hour: NICU_DAY_GRACE_HOUR } },
    );
    const today = res?.data || {};
    if (today.record_date && today.record_date !== recordDate) ingest(today);
    else if (today.record_date && today.record_date === recordDate) {
      merged = parseHemeATransfusionFlags(today, recordDate);
    }
  } catch (_) { /* optional */ }
  return merged;
}

/** MML may set Yes only; never auto-No. */
function mmlYnLooksMmlSourced(current, mmlYes) {
  if (!mmlYes) return false;
  return current == null || current === true;
}

/** Mirror 5.6.A products onto Helper #28–#30; respect nurse explicit No (false). */
function mmlSyncTransfusionYnFromMml(current, mmlHas, wasAutofilled) {
  if (current === false) {
    return { next: current, autofilled: wasAutofilled, changed: false };
  }
  if (mmlHas) {
    if (mmlYnLooksMmlSourced(current, true) || wasAutofilled) {
      const changed = current !== true;
      return { next: true, autofilled: true, changed };
    }
    return { next: current, autofilled: wasAutofilled, changed: false };
  }
  if (current === true) {
    return { next: null, autofilled: false, changed: true };
  }
  return { next: current, autofilled: wasAutofilled, changed: false };
}

function feedVolumeLooksMmlSourced(current, entryValues) {
  if (current == null || current === "") return true;
  const n = Number(current);
  if (!Number.isFinite(n) || !entryValues.length) return false;
  const ints = entryValues.map((v) => Math.round(v)).filter((v) => v >= 0);
  if (!ints.length) return false;
  const total = ints.reduce((sum, v) => sum + v, 0);
  if (n === total) return true;
  const sums = new Set([0]);
  for (const v of ints) {
    const next = new Set(sums);
    for (const s of sums) next.add(s + v);
    sums.clear();
    next.forEach((x) => sums.add(x));
  }
  return sums.has(Math.round(n));
}

function parseJsonArrayIg(raw) {
  if (!raw) return null;
  try {
    const p = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(p) && p.length ? p : null;
  } catch (_) {
    return null;
  }
}

/* ══════════════════════════════════════════════════════
   CONSTANTS — identical to Helper Form 1
══════════════════════════════════════════════════════ */

const STATUS = {
  EMPTY:     "empty",
  DRAFT:     "draft",
  PARTIAL:   "partial",
  COMPLETE:  "complete",
  SUBMITTED: "submitted",
  LATE:      "late",
};

const DAY_STATUS_CONFIG = {
  [STATUS.EMPTY]:    { label: "Not started", color: "#CBD5E1", dot: "#CBD5E1" },
  [STATUS.DRAFT]:    { label: "Partial",     color: "#F59E0B", dot: "#F59E0B" },
  [STATUS.PARTIAL]:  { label: "Partial",     color: "#F59E0B", dot: "#F59E0B" },
  [STATUS.COMPLETE]: { label: "Complete",    color: "#10B981", dot: "#10B981" },
  [STATUS.SUBMITTED]:{ label: "Submitted",   color: "#0F4C81", dot: "#0F4C81" },
  [STATUS.LATE]:     { label: "Late",        color: "#EF4444", dot: "#EF4444" },
};

const LEGEND_ITEMS = [
  { label: "Not started", dot: "#CBD5E1" },
  { label: "Partial",     dot: "#F59E0B" },
  { label: "Complete",    dot: "#10B981" },
  { label: "Submitted",   dot: "#0F4C81" },
  { label: "Late",        dot: "#EF4444" },
  { label: "Locked",      dot: "#94A3B8", lock: true },
];

/* Every field captured for a day, grouped by section, for the
   "All Days — Table View" modal (fields run down the rows, days
   run across the columns). Same pattern as Helper Form 1. */
const TABLE_VIEW_FIELD_GROUPS = [
  {
    section: "Infection",
    rows: [
      { key: "sepsis_suspected",        label: "Sepsis Suspected", bool: true },
      { key: "blood_culture_sent",      label: "Blood Culture Sent", bool: true },
      { key: "blood_culture_positive",  label: "Blood Culture Positive", bool: true, statusKey: "blood_culture_status" },
      { key: "antibiotics",             label: "Antibiotics", bool: true },
      { key: "lp_done",                 label: "LP Done", bool: true },
      { key: "meningitis",              label: "Meningitis", bool: true },
      { key: "meningitis_type",         label: "Meningitis Type" },
      { key: "clabsi",                  label: "CLABSI", bool: true },
      { key: "vap",                     label: "VAP", bool: true },
    ],
  },
  {
    section: "Gastrointestinal",
    rows: [
      { key: "npo",                     label: "NPO", bool: true },
      { key: "men",                     label: "MEN (Minimal Enteral Nutrition)", bool: true },
      { key: "enteral_feeds_received",  label: "Enteral Feeds Received", bool: true },
      { key: "feed_type",               label: "Feed Type", list: true },
      { key: "cumulative_feed_volume",  label: "Cumulative Feed Volume", suffix: "ml", statusKey: "cumulative_feed_volume_status" },
      { key: "feed_volume",             label: "Feed Volume", suffix: "ml/kg/d", statusKey: "feed_volume_status" },
      { key: "iv_fluids",               label: "IV Fluids", bool: true },
      { key: "parenteral_nutrition",    label: "Parenteral Nutrition", bool: true },
      { key: "probiotic",               label: "Probiotic", bool: true },
      { key: "feed_intolerance",        label: "Feed Intolerance", bool: true },
      { key: "nec_suspected",           label: "NEC Suspected", bool: true },
      { key: "nec_confirmed_stage",     label: "NEC Confirmed Stage" },
      { key: "cholestasis",             label: "Cholestasis", bool: true },
    ],
  },
  {
    section: "Hematology",
    rows: [
      { key: "hb_value",                label: "Hb Value", suffix: "g/dL", statusKey: "hb_value_status" },
      { key: "jaundice",                label: "Jaundice", bool: true },
      { key: "phototherapy",            label: "Phototherapy", bool: true },
      { key: "peak_tsb",                label: "Peak TSB", suffix: "mg/dL", statusKey: "peak_tsb_status" },
      { key: "exchange_transfusion",    label: "Exchange Transfusion", bool: true },
      { key: "prbc_transfusion",        label: "PRBC Transfusion", bool: true },
      { key: "platelet_transfusion",    label: "Platelet Transfusion", bool: true },
      { key: "ffp_cryo",                label: "FFP / Cryo Transfusion", bool: true },
    ],
  },
  {
    section: "Record",
    rows: [
      { key: "saved_by", label: "Saved By" },
    ],
  },
];

/* Formats a single field's value for one day's data object `d`. */
function formatTableViewValue(d, row) {
  // "Result Awaited" / "Not Recorded / Not Done" lives in a sibling
  // *_status column, not in the field itself — check that first, since
  // the underlying value is null whenever a status is set.
  if (row.statusKey && d[row.statusKey]) return d[row.statusKey];
  const v = d[row.key];
  if (row.bool) return v === true ? "Yes" : v === false ? "No" : "—";
  if (row.list) return Array.isArray(v) && v.length > 0 ? v.join(", ") : "—";
  if (v === null || v === undefined || v === "") return "—";
  return row.suffix ? `${v}${row.suffix}` : String(v);
}

/* Given one day's saved record `d`, returns the fields that are still
   blank, grouped by section — reuses the same TABLE_VIEW_FIELD_GROUPS
   key/label map the "All Days" table view already relies on, so the two
   views can never disagree about what counts as "answered". The "Record"
   section is metadata (saved_by), not something a nurse fills in, so it's
   excluded from the missing-fields count. Same pattern as Helper Form 1. */
function computeMissingFields(d) {
  if (!d) return [];
  return TABLE_VIEW_FIELD_GROUPS
    .filter(group => group.section !== "Record")
    .map(group => ({
      section: group.section,
      labels: group.rows
        .filter(row => formatTableViewValue(d, row) === "—")
        .map(row => row.label),
    }))
    .filter(group => group.labels.length > 0);
}

/* Validates Cumulative Feed Volume (#14, ml). Flags negative values
   and values well outside what's typically given in a day. */
function validateCumulativeFeedVolume(value) {
  if (value === "" || value === null || value === undefined) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return "Enter a valid number";
  if (num < 0) return "Value can't be negative";
  if (num > 1000) return "Cumulative Feed Volume seems unusually high — please double-check";
  return null;
}

/* Validates Feed Volume (#15, ml/kg/d). Standard feeding targets
   top out around 180-200ml/kg/d, so flag anything well beyond that. */
function validateFeedVolume(value) {
  if (value === "" || value === null || value === undefined) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return "Enter a valid number";
  if (num < 0) return "Value can't be negative";
  if (num > 220) return "Feed Volume is usually up to ~200ml/kg/d — please double-check this value";
  return null;
}

/* Validates Hb Value (#23, g/dL). Flags negative/implausible values. */
function validateHbValue(value) {
  if (value === "" || value === null || value === undefined) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return "Enter a valid number";
  if (num < 0) return "Value can't be negative";
  if (num > 30) return "Hb Value above 30g/dL is implausible — please double-check";
  if (num < 3) return "Hb Value below 3g/dL is extremely rare — please double-check";
  return null;
}

/* Validates Peak TSB (#26, mg/dL). Flags negative/implausible values. */
function validatePeakTsb(value) {
  if (value === "" || value === null || value === undefined) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return "Enter a valid number";
  if (num < 0) return "Value can't be negative";
  if (num > 35) return "Peak TSB above 35mg/dL is extremely rare — please double-check";
  return null;
}

/* ══════════════════════════════════════════════════════
   SHARED SUB-COMPONENTS (identical to Helper Form 1)
══════════════════════════════════════════════════════ */

function ProgressRing({ percent }) {
  const r = 24, circ = 2 * Math.PI * r;
  return (
    <div className="rcn-ring">
      <svg width="58" height="58" viewBox="0 0 58 58">
        <circle className="rcn-ring-bg" cx="29" cy="29" r={r} />
        <circle className="rcn-ring-fill" cx="29" cy="29" r={r}
          strokeDasharray={circ}
          strokeDashoffset={circ - (percent / 100) * circ}
          style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%" }}
        />
      </svg>
      <span className="rcn-ring-text">{percent}%</span>
    </div>
  );
}

function YNRow({ label, value, onChange, disabled, hidden, status = null, onStatusChange = null, allowAwaited = false }) {
  if (hidden) return null;
  const isAwaited  = status === STATUS_AWAITED;
  const isSentinel = isAwaited;
  const toggleStatus = (s) => {
    if (disabled || !onStatusChange) return;
    if (status === s) { onStatusChange(null); return; }
    onStatusChange(s);
    if (value !== null && value !== undefined) onChange(null);
  };
  return (
    <div className="rcn-yn-row">
      <div className="rcn-field-label-row">
        <span className="rcn-yn-label">{label}</span>
        {onStatusChange && allowAwaited && (
          <div className="rcn-status-toggle-group">
            <button type="button"
              className={`rcn-notdone-toggle rcn-awaited-toggle${isAwaited ? " rcn-awaited-toggle--on" : ""}`}
              onClick={() => toggleStatus(STATUS_AWAITED)}
              disabled={disabled}
            >{isAwaited ? "Undo" : "Result Awaited"}</button>
          </div>
        )}
      </div>
      <div className="rcn-yn">
        <button type="button"
          className={`rcn-yn-btn rcn-yn-yes${value === true ? " rcn-yn-active-yes" : ""}`}
          onClick={() => !disabled && !isSentinel && onChange(value === true ? null : true)}
          disabled={disabled || isSentinel}
        >Yes</button>
        <button type="button"
          className={`rcn-yn-btn rcn-yn-no${value === false ? " rcn-yn-active-no" : ""}`}
          onClick={() => !disabled && !isSentinel && onChange(value === false ? null : false)}
          disabled={disabled || isSentinel}
        >No</button>
      </div>
    </div>
  );
}

const STATUS_AWAITED  = "Result Awaited";
const STATUS_NOT_DONE = "Not Recorded / Not Done";

/** Numeric row. Pass `status` + `onStatusChange` to enable the
 *  "Result Awaited" (if allowAwaited) / "Not Recorded / Not Done" toggles.
 *  When a status is active, the numeric input is cleared/disabled and the
 *  status string — not a number — is what gets treated as the answer. */
function NumRow({ label, value, onChange, disabled, unit, placeholder = "0", error, width = 140,
  status = null, onStatusChange = null, allowAwaited = false, autofilled = false }) {
  const isAwaited  = status === STATUS_AWAITED;
  const isNotDone  = status === STATUS_NOT_DONE;
  const isSentinel = isAwaited || isNotDone;
  const toggleStatus = (s) => {
    if (disabled || !onStatusChange) return;
    if (status === s) { onStatusChange(null); return; }
    onStatusChange(s);
    if (value !== null && value !== undefined && value !== "") onChange(null);
  };
  return (
    <>
      <div className="rcn-yn-row">
        <div className="rcn-field-label-row">
          <span className="rcn-yn-label">{label}</span>
          {autofilled && <span className="rcn-autofill-tag">from Minimal Monitoring</span>}
          {onStatusChange && (
            <div className="rcn-status-toggle-group">
              {allowAwaited && (
                <button type="button"
                  className={`rcn-notdone-toggle rcn-awaited-toggle${isAwaited ? " rcn-awaited-toggle--on" : ""}`}
                  onClick={() => toggleStatus(STATUS_AWAITED)}
                  disabled={disabled}
                >{isAwaited ? "Undo" : "Result Awaited"}</button>
              )}
              <button type="button"
                className={`rcn-notdone-toggle${isNotDone ? " rcn-notdone-toggle--on" : ""}`}
                onClick={() => toggleStatus(STATUS_NOT_DONE)}
                disabled={disabled}
              >{isNotDone ? "Undo" : "Not Recorded / Not Done"}</button>
            </div>
          )}
        </div>
        <div className={`rcn-num-input${error ? " rcn-num-input--error" : ""}${isSentinel ? ` rcn-num-input--sentinel ${isAwaited ? "rcn-num-input--awaited" : "rcn-num-input--notdone"}` : ""}`} style={{ width }}>
          {isSentinel ? (
            <span className="rcn-num-sentinel-text">{status}</span>
          ) : (
            <>
              <input
                type="number" min="0" step="0.1"
                placeholder={placeholder}
                value={value ?? ""}
                onChange={e => !disabled && onChange(e.target.value === "" ? null : Number(e.target.value))}
                readOnly={disabled}
              />
              {unit && <span className="rcn-num-unit">{unit}</span>}
            </>
          )}
        </div>
      </div>
      {!isSentinel && error && (
        <span className="rcn-field-error" style={{ display: "block", textAlign: "right", marginTop: -8, marginBottom: 8 }}>
          {error}
        </span>
      )}
    </>
  );
}

function CultureStatusRow({ sent, positive, onChange, disabled }) {
  const value = sent !== true ? "" : positive === true ? "Positive" : positive === false ? "Negative" : "Awaited";
  return (
    <div className="rcn-yn-row">
      <label className="rcn-yn-label" htmlFor="blood-culture-status">Blood Culture Result</label>
      <select id="blood-culture-status" className="rcn-status-select" value={value}
        disabled={disabled}
        onChange={e => {
          const next = e.target.value;
          onChange({
            sent: next !== "",
            positive: next === "Positive" ? true : next === "Negative" ? false : null,
          });
        }}>
        <option value="">Select result</option>
        <option value="Positive">Positive</option>
        <option value="Negative">Negative</option>
        <option value="Awaited">Awaited</option>
      </select>
      <span className="rcn-field-sub">Awaited results remain editable on the original NICU day.</span>
    </div>
  );
}

function TextRow({ label, value, onChange, disabled, placeholder = "Enter value" }) {
  return (
    <div className="rcn-yn-row">
      <span className="rcn-yn-label">{label}</span>
      <input
        type="text"
        className="rcn-num-input"
        style={{ width: 140, fontSize: 14, padding: "8px 12px", fontWeight: 600 }}
        placeholder={placeholder}
        value={value ?? ""}
        onChange={e => !disabled && onChange(e.target.value)}
        readOnly={disabled}
      />
    </div>
  );
}

/* Multi-select pills (for feed type: PDHM, EBM, FM) */
function PillMulti({ options, value=[], onChange, disabled }) {
  const toggle = (opt) => {
    if (disabled) return;
    const next = value.includes(opt) ? value.filter(v => v !== opt) : [...value, opt];
    onChange(next);
  };
  return (
    <div className="rcn-pills">
      {options.map(opt => (
        <button key={opt} type="button"
          className={`rcn-pill${value.includes(opt) ? " rcn-pill--on" : ""}`}
          onClick={() => toggle(opt)} disabled={disabled}>
          {opt}
        </button>
      ))}
    </div>
  );
}

/* Single-select pills (for NEC Confirmed Stage — Bell's staging IA/IB/IIA/IIB/IIIA/IIIB;
   only one stage applies at a time, same pattern as ROP Stage / AKI Stage elsewhere). */
function PillSingle({ options, value, onChange, disabled }) {
  return (
    <div className="rcn-pills">
      {options.map(opt => (
        <button key={opt} type="button"
          className={`rcn-pill${value === opt ? " rcn-pill--on" : ""}`}
          onClick={() => !disabled && onChange(value === opt ? null : opt)}
          disabled={disabled}>
          {opt}
        </button>
      ))}
    </div>
  );
}

function SectionCard({ iconEmoji, title, answered, total, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  const pct = total > 0 ? Math.round((answered / total) * 100) : 0;
  return (
    <div className="rcn-card">
      <div className="rcn-card-header" onClick={() => setOpen(o => !o)}>
        <div className="rcn-card-header-left">
          <div className="rcn-card-icon-wrap">
            <span className="rcn-card-emoji">{iconEmoji}</span>
          </div>
          <h3 className="rcn-card-title">{title}</h3>
        </div>
        <div className="rcn-card-header-right">
          <div className="rcn-card-prog-bar">
            <div className="rcn-card-prog-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="rcn-card-prog-text">{answered}/{total}</span>
          <div className={`rcn-chevron${open ? " rcn-chevron-open" : ""}`}>
            <ChevronDown size={16} />
          </div>
        </div>
      </div>
      {open && (
        <>
          <div className="rcn-card-divider" />
          <div className="rcn-card-body">{children}</div>
        </>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   HELPER FUNCTIONS FOR GESTATION
══════════════════════════════════════════════════════ */
const totalGestationDays = (weeks, days) => {
  if (weeks === null || weeks === undefined || weeks === "") return null;
  if (days === null || days === undefined || days === "") return null;
  const w = Number(weeks);
  const d = Number(days);
  return Number.isNaN(w) || Number.isNaN(d) ? null : w * 7 + d;
};

const formatGestation = (weeks, days) =>
  weeks !== null && weeks !== undefined && weeks !== "" ? `${weeks}+${days ?? 0} wks` : "";

function SubmitModal({ day, completionPct, onConfirm, onCancel, submitting }) {
  return (
    <div className="rcn-modal-overlay">
      <div className="rcn-modal">
        <div className="rcn-modal-header">
          <div className="rcn-modal-icon rcn-modal-icon--lock"><Lock size={22} /></div>
          <div>
            <h3 className="rcn-modal-title">Lock Day {day} Data</h3>
            <p className="rcn-modal-subtitle">This record will become read-only</p>
          </div>
          <button className="rcn-modal-close" onClick={onCancel} type="button">
            <X size={18} />
          </button>
        </div>
        <div className="rcn-modal-body">
          <div className="rcn-modal-checklist">
            <div className={`rcn-modal-check ${completionPct === 100 ? "rcn-modal-check--ok" : "rcn-modal-check--warn"}`}>
              {completionPct === 100 ? <CheckCircle size={15} /> : <AlertTriangle size={15} />}
              <span>{completionPct === 100 ? "All fields completed (100%)" : `${completionPct}% complete — some fields unanswered`}</span>
            </div>
            <div className="rcn-modal-check rcn-modal-check--ok">
              <CheckCircle size={15} /><span>Nurse data entry saved</span>
            </div>
          </div>
          <div className="rcn-modal-warning rcn-modal-warning--lock">
            <Lock size={14} />
            <span>
              After locking, you will not be able to edit this data.
              Are you sure you want to lock Day {day}?
            </span>
          </div>
          {completionPct < 100 && (
            <div className="rcn-modal-warning">
              <AlertTriangle size={14} />
              <span>Locking with incomplete data. Ensure missing fields are clinically not applicable before proceeding.</span>
            </div>
          )}
        </div>
        <div className="rcn-modal-footer">
          <button className="rcn-modal-btn rcn-modal-btn--cancel" onClick={onCancel} type="button" disabled={submitting}>Cancel</button>
          <button className="rcn-modal-btn rcn-modal-btn--lock" onClick={onConfirm} type="button" disabled={submitting}>
            {submitting ? "Locking…" : <><Lock size={14} /> Yes, Lock It</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════ */
// Postgres TIMESTAMP (no time zone) columns — e.g. override_unlocked_until —
// serialize to JSON with no 'Z'/offset suffix even though the value is UTC
// (set via datetime.utcnow() on the backend). `new Date("...no suffix...")`
// parses that as LOCAL browser time per the JS spec, not UTC — in IST
// (UTC+5:30) that made a just-created 2-hour override compare as already
// expired. Treat any timestamp with no explicit offset as UTC.
function parseUtcTimestamp(value) {
  if (!value) return null;
  return /[Zz]|[+-]\d{2}:?\d{2}$/.test(value) ? new Date(value) : new Date(value + "Z");
}

export default function InfectGIHemaLog() {
  const { enrollmentId } = useParams();
  const navigate         = useNavigate();
  const { markFormCompleted, unmarkFormCompleted } = useFormProgress();
  const { patientData }  = usePatient();
  const { user }         = useAuth();
  const userRole         = user?.role || "site_user";
  const isSuperadmin     = (userRole || "").toLowerCase() === "superadmin";
  const isPI             = (userRole || "").toLowerCase() === "site_pi";
  // Audit trail ("History") is superadmin + site PI only — matches the
  // backend's /audit/ role check in routers/audit.py.
  const canViewAudit     = isSuperadmin || isPI;

  /* ── UI state ── */
  const [activeDay, setActiveDay]         = useState(1);
  const [totalDays, setTotalDays]         = useState(14);
  // Day 1 date — Form B date_of_birth only (read-only in UI).
  const [day1Date, setDay1Date] = useState("");
  const [completedDays, setCompletedDays] = useState([]);
  const [dayStatuses, setDayStatuses]     = useState({});
  const [dayMeta, setDayMeta]             = useState({});
  const [dischargeDay, setDischargeDay]   = useState(null);
  const [isSaved, setIsSaved]             = useState(false);
  const [isEditing, setIsEditing]         = useState(false);
  const [message, setMessage]             = useState("");
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [loading, setLoading]             = useState(false);
  const [showModal, setShowModal]         = useState(false);
  const [submitting, setSubmitting]       = useState(false);
  const [savedAt, setSavedAt]             = useState(null);
  const [savedBy, setSavedBy]             = useState("");
  const [submittedAt, setSubmittedAt]     = useState(null);
  const [submittedBy, setSubmittedBy]     = useState("");

  /* ── All-days table view ── */
  const [showTableView, setShowTableView]   = useState(false);
  const [tableViewRows, setTableViewRows]   = useState([]);
  const [tableViewLoading, setTableViewLoading] = useState(false);

  /* ── Per-day "what's missing" popover (shown on partial/late day pills) ──
     Rendered via a portal at fixed viewport coordinates (not nested inside
     the day strip) because .rcn-timeline scrolls horizontally — any
     non-"visible" overflow-x forces overflow-y to compute as "auto" too
     (per the CSS overflow spec), which would silently clip a popover
     taller than the pill row. Portaling to <body> sidesteps that. */
  const [missingPopoverDay, setMissingPopoverDay] = useState(null); // day number or null
  const [missingPopoverPos, setMissingPopoverPos] = useState(null); // { top, left }
  const [missingFieldsCache, setMissingFieldsCache] = useState({}); // { [day]: [{section, labels:[]}] }
  const [missingLoading, setMissingLoading] = useState(false);
  const missingPopoverRef = useRef(null);
  const missingAnchorRef  = useRef(null); // the badge <button> currently open, so scroll/resize can re-measure it

  /* ── Audit trail ── */
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [auditEntries, setAuditEntries]     = useState([]);
  const [auditLoading, setAuditLoading]     = useState(false);

  /* ── Site-monitor override ── */
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overrideReason, setOverrideReason]       = useState("");
  const [overrideSubmitting, setOverrideSubmitting] = useState(false);
  const [overrideUntil, setOverrideUntil]          = useState(null); // active day's override expiry

  /* ── Patient info ── */
  const [patientInfo, setPatientInfo] = useState({
    enrollmentId: enrollmentId || "",
    babyUid: "",
    babyName: "",
    motherName: "",
    gestationalAge: "",
    gestationSource: "",
    admissionDate: "",
    dischargeDate: "",
    status: "In NICU",
  });

  /* ════════════════════════════════════════════════
     SECTION 1 — INFECTION (Fields 1-9)
  ════════════════════════════════════════════════ */
  const [infData, setInfData] = useState({
    sepsis_suspected:        null,  // 1
    blood_culture_sent:      null,  // 2
    blood_culture_positive:  null,  // 3 (Blood culture result)
    blood_culture_status:    null,  // 3 status: "Result Awaited"
    antibiotics:             null,  // 4
    lp_done:                 null,  // 5
    meningitis:              null,  // 6 (Y/N)
    meningitis_type:         null,  // 7 (Probable/Proven - conditional on meningitis=Yes)
    clabsi:                  null,  // 8
    vap:                     null,  // 9
    // Not part of the original numbered CRF sequence — added 2026-08-23 to
    // feed Form H's Infection auto-fill (see sepsis_screens comment below).
    sepsis_screen_sent:      null,
    sepsis_screens:          [blankSepsisScreen()],
  });

  /* ════════════════════════════════════════════════
     SECTION 2 — GASTROINTESTINAL (Fields 10-22)
  ════════════════════════════════════════════════ */
  const [giData, setGiData] = useState({
    npo:                     null,  // 10
    men:                     null,  // 11 (Minimal Enteral Nutrition)
    enteral_feeds_received:  null,  // 12 (renamed from enteral_feeds_started)
    feed_type:               [],    // 13 (PDHM, EBM, FM - multi-select)
    cumulative_feed_volume:  null,  // 14 (ml - numeric)
    cumulative_feed_volume_status: null, // 14 status: "Not Recorded / Not Done"
    feed_volume:             null,  // 15 (ml/kg/d - auto calculated)
    feed_volume_status:      null,  // 15 status: "Not Recorded / Not Done"
    iv_fluids:               null,  // 16
    parenteral_nutrition:    null,  // 17
    probiotic:               null,  // 18
    feed_intolerance:        null,  // 19
    nec_suspected:           null,  // 20
    nec_confirmed_stage:     null,  // 21 (text — conditional on nec_suspected=Yes)
    cholestasis:             null,  // 22
  });

  /* ════════════════════════════════════════════════
     SECTION 3 — HEMATOLOGY (Fields 23-30)
  ════════════════════════════════════════════════ */
  const [hemaData, setHemaData] = useState({
    hb_value:                null,  // 23 (Hb value - numeric)
    hb_value_status:         null,  // 23 status: "Result Awaited" | "Not Recorded / Not Done"
    jaundice:                null,  // 24
    phototherapy:            null,  // 25 (conditional on jaundice=Yes)
    peak_tsb:                null,  // 26 (mg/dL - numeric)
    peak_tsb_status:         null,  // 26 status: "Result Awaited" | "Not Recorded / Not Done"
    exchange_transfusion:    null,  // 27
    prbc_transfusion:        null,  // 28
    platelet_transfusion:    null,  // 29
    ffp_cryo:                null,  // 30 (FFP/Cryo transfusion)
  });

  /* ── Derived visibility flags ── */
  const sepsisYes    = infData.sepsis_suspected === true;
  const bloodCultureSentYes = infData.blood_culture_sent === true;
  const meningitisYes = infData.meningitis === true;
  const sepsisScreenSentYes = infData.sepsis_screen_sent === true;
  const npoNo        = giData.npo === false;
  const enteralYes   = giData.enteral_feeds_received === true;
  const necYes       = giData.nec_suspected === true;
  const jaundiceYes  = hemaData.jaundice === true;

  /* ── Live field validation ── */
  const cumulativeFeedVolumeError = validateCumulativeFeedVolume(giData.cumulative_feed_volume);
  const feedVolumeError           = validateFeedVolume(giData.feed_volume);
  const hbValueError              = validateHbValue(hemaData.hb_value);
  const peakTsbError               = validatePeakTsb(hemaData.peak_tsb);

  /* ── Calendar-based day locking ──
     todayNicuDay = which NICU day is the current *working* day given
     Day 1 Date, using NICU_DAY_GRACE_HOUR so overnight staff still count
     as "today" until that hour. Badges, future-locking, and the default
     tab all use this same number. */
  const todayNicuDay = useNicuWorkingDay(day1Date);

  const isFutureActiveDay = todayNicuDay != null && activeDay > todayNicuDay;
  // Informational only now — locking is manual (see the Lock button below),
  // so a past calendar date no longer forces a day read-only by itself.
  const isPastActiveDay   = todayNicuDay != null && activeDay < todayNicuDay;
  const activeDayDate = useMemo(
    () => calendarDateForNicuDay(day1Date, activeDay),
    [day1Date, activeDay],
  );
  const activeDayDateRef = useRef(activeDayDate);
  activeDayDateRef.current = activeDayDate;
  // Last sum this helper itself applied for a given calendar date.
  // Used so ticks can re-sync while the field still holds that auto
  // value, but never overwrite a nurse's typed correction.
  const lastFeedVolumeAutoRef = useRef({ date: null, value: undefined });
  const [feedVolumeAutofilled, setFeedVolumeAutofilled] = useState(false);
  const feedVolumeAutofilledRef = useRef(false);
  feedVolumeAutofilledRef.current = feedVolumeAutofilled;
  const [feedTypeAutofilled, setFeedTypeAutofilled] = useState(false);
  const [hemaTransfusionAutofilled, setHemaTransfusionAutofilled] = useState({
    prbc: false, platelet: false, ffpCryo: false,
  });
  const hemaStateRef = useRef({});
  hemaStateRef.current = hemaData;
  const hemaTransfusionAutofilledRef = useRef(hemaTransfusionAutofilled);
  hemaTransfusionAutofilledRef.current = hemaTransfusionAutofilled;
  // Site-monitor override reopens an otherwise-locked day for a limited window.
  const isOverrideActiveDay =
    overrideUntil != null && new Date() < parseUtcTimestamp(overrideUntil);

  useDefaultToWorkingNicuDay(todayNicuDay, enrollmentId, activeDay, setActiveDay);

  useEffect(() => {
    if (!enrollmentId || activeDay == null) return;
    rememberActiveDay(HELPER_SESSION_KEY_INFECT_GI_HEMA, enrollmentId, activeDay);
  }, [enrollmentId, activeDay]);

  const isSubmitted     = (dayStatuses[activeDay] || STATUS.EMPTY) === STATUS.SUBMITTED;
  const isFieldEditable =
    // Day 1 Date is mandatory — nurses must set it before any daily field
    // can be filled in, so it's no longer possible to save Day 1 (or any
    // day) data and forget the date. See handleSave for the same guard on
    // the actual save call (independent of `force`).
    !!day1Date &&
    (!isSubmitted || isOverrideActiveDay) &&
    (!isSaved || isEditing) &&
    !isFutureActiveDay;
    // NOTE: locking is now manual only (via the explicit "Lock" button +
    // confirmation modal below), so a past day's calendar date passing no
    // longer forces the record read-only on its own — only isSubmitted
    // (i.e. a nurse/site user explicitly clicked Lock and confirmed) does.

  const applyFeedVolumeFromMml = async (recordDate = activeDayDate) => {
    if (!enrollmentId || !recordDate) return;
    if (isFutureActiveDay) return;
    if (isSubmitted && !isOverrideActiveDay) return;
    try {
      const entryValues = await loadMmlGiAFeedValuesForHelperDay(enrollmentId, recordDate);
      if (activeDayDateRef.current !== recordDate) return;
      const vol = sumGiAFeedVolumeValues(entryValues);
      setGiData((p) => {
        if (p.npo === true) return p;
        const last = lastFeedVolumeAutoRef.current;
        const stillMatchesLastAutoFill =
          last.date === recordDate &&
          last.value !== undefined &&
          String(p.cumulative_feed_volume) === String(last.value);
        const sync = mmlSyncAggregateFieldFromMml({
          current: p.cumulative_feed_volume,
          blockedByNotDone: !!p.cumulative_feed_volume_status,
          wasAutofilled: feedVolumeAutofilledRef.current,
          stillMatchesLastAuto: stillMatchesLastAutoFill,
          looksSourced: (c) => feedVolumeLooksMmlSourced(c, entryValues),
          entryValuesForSourced: entryValues,
          mmlValue: vol == null ? null : String(vol),
        });
        if (!sync.changed) {
          if (sync.autofilled && !feedVolumeAutofilledRef.current) {
            setFeedVolumeAutofilled(true);
          }
          return p;
        }
        if (vol != null) {
          lastFeedVolumeAutoRef.current = { date: recordDate, value: vol };
        } else {
          lastFeedVolumeAutoRef.current = { date: recordDate, value: undefined };
        }
        setFeedVolumeAutofilled(sync.autofilled);
        setIsEditing(true);
        return { ...p, cumulative_feed_volume: sync.nextValue === "" ? null : sync.nextValue };
      });
    } catch (_) { /* Helper 5 optional */ }
  };

  /** Fill-if-blank only (no *_status sidecar exists for feed_type, and
   *  unlike cumulative_feed_volume this is a nurse-editable multi-select
   *  with no single "the" MML value to keep re-syncing against) — once the
   *  nurse has picked anything here, or picked nothing on purpose, DMS
   *  never touches it again. */
  const applyFeedTypeFromMml = async (recordDate = activeDayDate) => {
    if (!enrollmentId || !recordDate) return;
    if (isFutureActiveDay) return;
    if (isSubmitted && !isOverrideActiveDay) return;
    try {
      const types = await loadMmlGiAMilkTypesForHelperDay(enrollmentId, recordDate);
      if (activeDayDateRef.current !== recordDate) return;
      if (!types.length) return;
      setGiData((p) => {
        if (p.npo === true) return p;
        if ((p.feed_type || []).length) return p;
        setFeedTypeAutofilled(true);
        setIsEditing(true);
        return { ...p, feed_type: types };
      });
    } catch (_) { /* Helper 5 optional */ }
  };

  const applyTransfusionFlagsFromMml = async (recordDate = activeDayDate) => {
    if (!enrollmentId || !recordDate) return;
    if (isFutureActiveDay) return;
    if (isSubmitted && !isOverrideActiveDay) return;
    try {
      const flags = await loadMmlHemeTransfusionFlagsForHelperDay(enrollmentId, recordDate);
      if (activeDayDateRef.current !== recordDate) return;
      const hema = hemaStateRef.current;
      const af = hemaTransfusionAutofilledRef.current;
      const updates = {};
      const afNext = { ...af };
      let anyChanged = false;

      const sync = (field, mmlHas, afKey) => {
        const r = mmlSyncTransfusionYnFromMml(hema[field], mmlHas, af[afKey]);
        if (r.changed) {
          updates[field] = r.next;
          anyChanged = true;
        }
        if (r.autofilled !== af[afKey]) {
          afNext[afKey] = r.autofilled;
          anyChanged = true;
        }
      };

      sync("prbc_transfusion", flags.prbc, "prbc");
      sync("platelet_transfusion", flags.platelet, "platelet");
      sync("ffp_cryo", flags.ffpCryo, "ffpCryo");

      if (anyChanged) {
        if (Object.keys(updates).length) {
          setHemaData(p => ({ ...p, ...updates }));
        }
        setHemaTransfusionAutofilled(afNext);
        setIsEditing(true);
      }
    } catch (_) { /* Helper 5 optional */ }
  };

  const applyMmlAutofillFromHelper5 = async (recordDate = activeDayDate) => {
    await applyFeedVolumeFromMml(recordDate);
    await applyFeedTypeFromMml(recordDate);
    await applyTransfusionFlagsFromMml(recordDate);
  };

  /* ══════════════════════════════════════════════
     PROGRESS CALCULATION
     Hidden/conditional fields excluded from total
  ══════════════════════════════════════════════ */

  // Helper to check if value is answered
  const ans = v => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0);

  // Infection: 6 base + 1 conditional (sepsis: blood_culture_sent) +
  //   1 further-conditional (blood_culture_sent=Yes: blood_culture_positive) +
  //   1 conditional (meningitis)
  // Fields 1-9: sepsis_suspected, blood_culture_sent, blood_culture_positive, antibiotics, lp_done, meningitis, meningitis_type, clabsi, vap
  const INF_BASE      = ["sepsis_suspected","antibiotics","lp_done","meningitis","clabsi","vap"];
  const INF_SEPSIS    = ["blood_culture_sent"];
  const INF_CULTURE   = ["blood_culture_positive"];
  const INF_MENING    = ["meningitis_type"];

  const infTotal    = INF_BASE.length
    + (sepsisYes ? INF_SEPSIS.length : 0)
    + (sepsisYes && bloodCultureSentYes ? INF_CULTURE.length : 0)
    + (meningitisYes ? INF_MENING.length : 0);
  const infAnswered = Math.min(
    INF_BASE.filter(k => ans(infData[k])).length
    + (sepsisYes ? INF_SEPSIS.filter(k => ans(infData[k])).length : 0)
    + (sepsisYes && bloodCultureSentYes
        ? (ans(infData.blood_culture_positive) || ans(infData.blood_culture_status) ? 1 : 0)
        : 0)
    + (meningitisYes ? INF_MENING.filter(k => ans(infData[k])).length : 0),
    infTotal
  );

  // GI: 7 always-visible + 4 conditional (NPO=No) + 1 further-conditional
  //   (NPO=No & Enteral Feeds Received=Yes: feed_type) + 1 conditional (NEC)
  // Fields 10-22: npo, men, enteral_feeds_received, feed_type, cumulative_feed_volume, feed_volume, iv_fluids, parenteral_nutrition, probiotic, feed_intolerance, nec_suspected, nec_confirmed_stage, cholestasis
  const GI_ALWAYS    = ["npo","iv_fluids","parenteral_nutrition","probiotic","feed_intolerance","nec_suspected","cholestasis"];
  const GI_NPO_NO    = ["men","enteral_feeds_received","cumulative_feed_volume","feed_volume"];
  const GI_FEED_TYPE = ["feed_type"];
  const GI_NEC       = ["nec_confirmed_stage"];

  const giTotal    = GI_ALWAYS.length
    + (npoNo ? GI_NPO_NO.length : 0)
    + (npoNo && enteralYes ? GI_FEED_TYPE.length : 0)
    + (necYes ? GI_NEC.length : 0);
  const giAnswered = Math.min(
    GI_ALWAYS.filter(k => ans(giData[k])).length
    + (npoNo ? GI_NPO_NO.filter(k => {
        if (k === "cumulative_feed_volume") return ans(giData.cumulative_feed_volume) || ans(giData.cumulative_feed_volume_status);
        if (k === "feed_volume") return ans(giData.feed_volume) || ans(giData.feed_volume_status);
        return ans(giData[k]);
      }).length : 0)
    + (npoNo && enteralYes ? GI_FEED_TYPE.filter(k => ans(giData[k])).length : 0)
    + (necYes ? GI_NEC.filter(k => ans(giData[k])).length : 0),
    giTotal
  );

  // Hematology: 7 base + 1 conditional (jaundice)
  // Fields 23-30: hb_value, jaundice, phototherapy, peak_tsb, exchange_transfusion, prbc_transfusion, platelet_transfusion, ffp_cryo
  const HEMA_BASE    = ["hb_value","jaundice","peak_tsb","exchange_transfusion","prbc_transfusion","platelet_transfusion","ffp_cryo"];
  const HEMA_JAUNDICE= ["phototherapy"];

  const hemaTotal    = HEMA_BASE.length + (jaundiceYes ? HEMA_JAUNDICE.length : 0);
  const hemaAnswered = Math.min(
    HEMA_BASE.filter(k => {
      if (k === "hb_value") return ans(hemaData.hb_value) || ans(hemaData.hb_value_status);
      if (k === "peak_tsb") return ans(hemaData.peak_tsb) || ans(hemaData.peak_tsb_status);
      return ans(hemaData[k]);
    }).length
    + (jaundiceYes ? HEMA_JAUNDICE.filter(k => ans(hemaData[k])).length : 0),
    hemaTotal
  );

  const totalAnswered = infAnswered + giAnswered + hemaAnswered;
  const totalFields   = infTotal + giTotal + hemaTotal;
  const completionPct = totalFields > 0
    ? Math.min(100, Math.round((totalAnswered / totalFields) * 100))
    : 0;
  // completionPct===100 alone isn't enough once a day has been overridden:
  // isSubmitted stays true for the whole override window (the backend only
  // clears it on an actual re-lock), so without the isOverrideActiveDay
  // check here canSubmit was permanently false during any override —
  // the footer always fell to "Save Correction" and the day could never
  // be re-locked. Allow re-locking while the override window is open.
  const canSubmit = completionPct === 100 && (!isSubmitted || isOverrideActiveDay);

  /* ── Setters ── */
  const setInf  = (k, v) => isFieldEditable && setInfData(p => ({ ...p, [k]: v }));
  const setGi   = (k, v) => {
    if (!isFieldEditable) return;
    if (k === "cumulative_feed_volume") setFeedVolumeAutofilled(false);
    setGiData(p => ({ ...p, [k]: v }));
  };
  const setHema = (k, v) => isFieldEditable && setHemaData(p => ({ ...p, [k]: v }));

  /* ── Sepsis screen list (repeatable, same shape as Helper 4's readings lists) ── */
  const setSepsisScreenField = (idx, key, value) => {
    if (!isFieldEditable) return;
    setInfData(p => {
      const list = [...(p.sepsis_screens || [])];
      list[idx] = { ...list[idx], [key]: value };
      return { ...p, sepsis_screens: list };
    });
  };
  const addSepsisScreen = () => {
    if (!isFieldEditable) return;
    setInfData(p => ({ ...p, sepsis_screens: [...(p.sepsis_screens || []), blankSepsisScreen()] }));
  };
  const removeSepsisScreen = (idx) => {
    if (!isFieldEditable) return;
    setInfData(p => {
      const list = p.sepsis_screens || [];
      if (list.length <= 1) return p;
      const next = [...list];
      next.splice(idx, 1);
      return { ...p, sepsis_screens: next };
    });
  };

  /* ── Load patient info ── */
  useEffect(() => {
    if (!enrollmentId) return;
    const load = async () => {
      let timelineDisch = null;
      let timelineDob = "";
      try {
        const res = await api.get(`/birth-resuscitation/${enrollmentId}`);
        const b = res?.data || {};
        if (b.date_of_birth) {
          setDay1Date(normalizeHelperDob(b.date_of_birth));
        }

        // Load gestation with NBS correction check (same logic as FiO2 form)
        let gestWeeks = b?.gestation_weeks;
        let gestDays = b?.gestation_days ?? 0;
        let gestSource = b?.gestation_source || "Form B";

        try {
          const dRes = await api.get(`/postnatal-day1/${enrollmentId}`);
          const d = dRes?.data || {};
          const originalWeeks = b?.original_gestation_weeks ?? b?.gestation_weeks;
          const originalDays = b?.original_gestation_days ?? b?.gestation_days ?? 0;
          const originalTotal = totalGestationDays(originalWeeks, originalDays);
          const nbsTotal = totalGestationDays(d?.gestation_weeks, d?.gestation_days);
          const useNbs = d?.ga_method === "NBS" && nbsTotal !== null && (
            originalTotal === null || Math.abs(nbsTotal - originalTotal) > 14
          );
          if (useNbs) {
            gestWeeks = d.gestation_weeks;
            gestDays = d.gestation_days ?? 0;
            gestSource = "Form D NBS";
          }
        } catch (_) {
          // Form D not available or no NBS correction — use Form B values
        }

        const ga = formatGestation(gestWeeks, gestDays);

        // Calculate discharge day if discharged (only for discharge cutoff)
        let dischDay = null;
        if (b.discharge_date && b.date_of_birth) {
          const admitDate = new Date(b.date_of_birth);
          const dd = new Date(b.discharge_date);
          dischDay = Math.max(1, Math.floor((dd - admitDate) / 86400000) + 1);
          setDischargeDay(dischDay);
        }
        timelineDisch = dischDay;

        const dob = normalizeHelperDob(b.date_of_birth);
        timelineDob = dob;

        setPatientInfo(prev => ({
          ...prev, enrollmentId,
          babyUid: b.baby_uid || "", 
          gestationalAge: ga,
          gestationSource: gestSource,
          admissionDate: dob,
          dischargeDate: b.discharge_date || "",
          status: b.discharge_date ? "Discharged" : "In NICU",
        }));
        setTotalDays(helperDayStripLength({
          dischargeDay: timelineDisch,
          todayNicuDay: nicuDayNumberFromDay1(timelineDob),
        }));
      } catch (_) {}

      // Load PII — mother_first_name, mother_surname, baby_name
      // (PII fields are NOT available on birth-resuscitation response
      //  since they are stored encrypted; the /pii endpoint decrypts them)
      try {
        const piiRes = await api.get(`/pii/enrollment/${enrollmentId}`);
        const p = piiRes?.data || {};
        const motherName = `${p.mother_first_name || ""} ${p.mother_surname || ""}`.trim();
        setPatientInfo(prev => ({
          ...prev,
          motherName: motherName || "",
          babyName:   p.baby_name || "",
        }));
      } catch (_) {}

      // Load summary
      try {
        const summRes = await api.get(`/infect-gi-hema/${enrollmentId}/summary`);
        const sums = summRes?.data || [];
        const newSt = {}, newMeta = {};
        sums.forEach(s => {
          newSt[s.nicu_day]   = s.submission_status || STATUS.DRAFT;
          newMeta[s.nicu_day] = { pct: s.completion_pct || 0, savedAt: s.saved_at };
        });
        setDayStatuses(newSt); setDayMeta(newMeta);
        const savedMax = sums.reduce((m, s) => Math.max(m, s.nicu_day || 0), 0);
        setTotalDays((prev) => Math.max(
          prev,
          helperDayStripLength({
            dischargeDay: timelineDisch,
            todayNicuDay: nicuDayNumberFromDay1(timelineDob),
            savedMaxDay: savedMax,
          }),
        ));
      } catch (_) {}
    };
    load();
  }, [enrollmentId]);

  useEffect(() => {
    if (!day1Date) return;
    setTotalDays((prev) => Math.max(
      prev,
      helperDayStripLength({ dischargeDay, todayNicuDay }),
    ));
  }, [day1Date, dischargeDay, todayNicuDay]);

  /* ── Load saved day data ── */
  useEffect(() => {
    if (!enrollmentId) return;
    let cancelled = false;
    const loadDay = async () => {
      setLoading(true);
      lastFeedVolumeAutoRef.current = { date: null, value: undefined };
      setFeedVolumeAutofilled(false);
      setFeedTypeAutofilled(false);
      setHemaTransfusionAutofilled({ prbc: false, platelet: false, ffpCryo: false });
      try {
        const res = await api.get(`/infect-gi-hema/${enrollmentId}/${activeDay}`);
        if (cancelled) return;
        const d = res?.data || {};
        if (d && Object.keys(d).length > 0) {
          setInfData({
            sepsis_suspected:        d.sepsis_suspected        ?? null,
            blood_culture_sent:      d.blood_culture_sent      ?? null,
            blood_culture_positive:  d.blood_culture_positive  ?? null,
            blood_culture_status:    d.blood_culture_status    ?? null,
            antibiotics:             d.antibiotics             ?? null,
            lp_done:                 d.lp_done                 ?? null,
            meningitis:              d.meningitis              ?? null,
            meningitis_type:         d.meningitis_type         ?? null,
            clabsi:                  d.clabsi                  ?? null,
            vap:                     d.vap                     ?? null,
            sepsis_screen_sent:      d.sepsis_screen_sent      ?? null,
            sepsis_screens:          parseJsonArrayIg(d.sepsis_screens_json) || [blankSepsisScreen()],
          });
          setGiData({
            npo:                     d.npo                     ?? null,
            men:                     d.men                     ?? null,
            enteral_feeds_received:  d.enteral_feeds_received  ?? null,
            feed_type:               d.feed_type
              ? (Array.isArray(d.feed_type) ? d.feed_type
                : d.feed_type.split(",").map(s=>s.trim()).filter(Boolean))
              : [],
            cumulative_feed_volume:  d.cumulative_feed_volume  ?? null,
            cumulative_feed_volume_status: d.cumulative_feed_volume_status ?? null,
            feed_volume:             d.feed_volume             ?? null,
            feed_volume_status:      d.feed_volume_status      ?? null,
            iv_fluids:               d.iv_fluids               ?? null,
            parenteral_nutrition:    d.parenteral_nutrition    ?? null,
            probiotic:               d.probiotic               ?? null,
            feed_intolerance:        d.feed_intolerance        ?? null,
            nec_suspected:           d.nec_suspected           ?? null,
            nec_confirmed_stage:     d.nec_confirmed_stage     ?? null,
            cholestasis:             d.cholestasis             ?? null,
          });
          setHemaData({
            hb_value:             d.hb_value             ?? null,
            hb_value_status:      d.hb_value_status      ?? null,
            jaundice:             d.jaundice             ?? null,
            phototherapy:         d.phototherapy         ?? null,
            peak_tsb:             d.peak_tsb             ?? null,
            peak_tsb_status:      d.peak_tsb_status      ?? null,
            exchange_transfusion: d.exchange_transfusion ?? null,
            prbc_transfusion:     d.prbc_transfusion     ?? null,
            platelet_transfusion: d.platelet_transfusion ?? null,
            ffp_cryo:             d.ffp_cryo             ?? null,
          });
          const st = d.submission_status || STATUS.DRAFT;
          setDayStatuses(prev => ({ ...prev, [activeDay]: st }));
          setSavedAt(d.saved_at || null);
          setSavedBy(d.saved_by || "");
          setSubmittedAt(d.submitted_at || null);
          setSubmittedBy(d.submitted_by || "");
          setOverrideUntil(d.override_unlocked_until || null);
          setIsSaved(true);
          const overrideStillActive =
            !!d.override_unlocked_until && parseUtcTimestamp(d.override_unlocked_until) > new Date();
          setIsEditing(st !== STATUS.SUBMITTED || overrideStillActive);
          if (!completedDays.includes(activeDay))
            setCompletedDays(prev => [...prev, activeDay]);
        } else {
          resetFormState();
        }
      } catch (err) {
        if (cancelled) return;
        // Always clear — never leave previous day's values in the form.
        resetFormState();
        if (err?.response?.status !== 404) {
          setMessage("❌ Could not load Day " + activeDay + " — save disabled until reload");
          setTimeout(() => setMessage(""), 5000);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
      if (!cancelled) await applyMmlAutofillFromHelper5(calendarDateForNicuDay(day1Date, activeDay));
    };
    loadDay();
    return () => { cancelled = true; };
  }, [enrollmentId, activeDay, day1Date]);

  useEffect(() => {
    if (!enrollmentId || !activeDayDate || loading) return;
    if (isFutureActiveDay) return;
    if (isSubmitted && !isOverrideActiveDay) return;
    const tick = () => applyMmlAutofillFromHelper5(activeDayDate);
    tick();
    const interval = setInterval(tick, 60000);
    const onFocus = () => tick();
    const onVisibility = () => {
      if (document.visibilityState === "visible") tick();
    };
    const onMmlSaved = (e) => {
      const eid = e?.detail?.enrollmentId;
      if (!eid || eid !== enrollmentId) return;
      tick();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("portal-mml-saved", onMmlSaved);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("portal-mml-saved", onMmlSaved);
    };
  }, [enrollmentId, activeDay, activeDayDate, loading, isSubmitted, isOverrideActiveDay, isFutureActiveDay]);

  const resetFormState = () => {
    setInfData({ sepsis_suspected: null, blood_culture_sent: null, blood_culture_positive: null,
      blood_culture_status: null,
      antibiotics: null, lp_done: null, meningitis: null, meningitis_type: null,
      clabsi: null, vap: null,
      sepsis_screen_sent: null, sepsis_screens: [blankSepsisScreen()] });
    setGiData({ npo: null, men: null, enteral_feeds_received: null, feed_type: [],
      cumulative_feed_volume: null, cumulative_feed_volume_status: null,
      feed_volume: null, feed_volume_status: null, iv_fluids: null,
      parenteral_nutrition: null, probiotic: null, feed_intolerance: null,
      nec_suspected: null, nec_confirmed_stage: null, cholestasis: null });
    setHemaData({ hb_value: null, hb_value_status: null, jaundice: null, phototherapy: null,
      peak_tsb: null, peak_tsb_status: null,
      exchange_transfusion: null, prbc_transfusion: null,
      platelet_transfusion: null, ffp_cryo: null });
    setIsSaved(false); setIsEditing(false);
    setSavedAt(null); setSavedBy(""); setSubmittedAt(null); setSubmittedBy("");
    setOverrideUntil(null);
    setDayStatuses(prev => ({ ...prev, [activeDay]: STATUS.EMPTY }));
  };

  const getPayload = () => {
    const { sepsis_screens, ...infDataFlat } = infData;
    const screensForSave = (sepsis_screens || []).filter(sepsisScreenHasData);
    return {
      enrollment_id: enrollmentId, nicu_day: activeDay,
      ...infDataFlat,
      sepsis_screens_json: JSON.stringify(screensForSave),
      ...giData,
      feed_type: giData.feed_type.join(","), // Convert array to comma-separated string
      ...hemaData,
      submission_status: STATUS.DRAFT,
      saved_at: new Date().toISOString(),
      saved_by: user?.name || user?.username || "Nurse",
    };
  };

  /* ── Save ── */
  const handleSave = async ({ force = false } = {}) => {
    if (!enrollmentId) return;
    if (!day1Date) {
      setMessage("⚠️ Day 1 Date is missing — record Date of Birth in Form B first");
      return;
    }
    // force: re-save while viewing a saved draft (Submit path) without
    // requiring Edit — same pattern as Helper Form 1 (RespCVNeuroLog).
    if (!force && !isFieldEditable) return; // future / locked-past / submitted (without override) — nothing to save
    if (!force && completionPct === 0 && !isSaved) {
      setMessage("⚠️ Nothing entered for this day yet — add data before saving.");
      setTimeout(() => setMessage(""), 3000);
      return;
    }
    const now = new Date().toISOString();
    const payload = { ...getPayload(), saved_at: now };
    try {
      isSaved
        ? await api.put(`/infect-gi-hema/${enrollmentId}/${activeDay}`, payload)
        : await api.post("/infect-gi-hema/", payload);
      // Keep the sidebar tick in sync with the *current* state, not just
      // whether it was ever true — data added then deleted before the
      // next save must un-tick the helper, not leave it stuck complete.
      if (completionPct > 0) markFormCompleted("infect_gi_hema");
      else unmarkFormCompleted("infect_gi_hema");
      setIsSaved(true);
      setIsEditing(true);
      setSavedAt(now); setSavedBy(user?.name || user?.username || "Nurse");
      const newSt = completionPct === 100 ? STATUS.COMPLETE : STATUS.DRAFT;
      setDayStatuses(prev => ({ ...prev, [activeDay]: newSt }));
      setDayMeta(prev => ({ ...prev, [activeDay]: { pct: completionPct, savedAt: now } }));
      if (!completedDays.includes(activeDay))
        setCompletedDays(prev => [...prev, activeDay]);
      setMessage("✅ Day " + activeDay + " saved successfully");
      setShowSaveSuccess(true);
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      setMessage("❌ Error saving — please try again");
    }
  };

  const switchActiveDay = async (d) => {
    if (d === activeDay) return;
    if (isFieldEditable && completionPct > 0) {
      try {
        await handleSave();
      } catch (err) {
        console.error("Save before day change failed:", err);
        return;
      }
    }
    setActiveDay(d);
  };

  const handlePrevious = async () => {
    if (isFieldEditable && completionPct > 0) {
      try { await handleSave(); } catch (err) { console.error("Save before back failed:", err); }
    }
    navigate(`/vs6-1/${enrollmentId}`);
  };

  useRegisterActiveFormSession(() => isFieldEditable, () => {
    // A navigation-triggered flush must not create a phantom blank draft —
    // that silently marks the day non-empty and locks Day 1 Date before the
    // user has entered anything. Only auto-save when something real exists.
    if (completionPct === 0) return Promise.resolve(true);
    return handleSave();
  });

  /* ── Submit ── */
  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      // Always save fresh state before locking — `isSaved` only means "this
      // record has been saved at least once," not "nothing has changed
      // since." Skipping the save here silently discarded edits made after
      // a prior save whenever the day reached 100% (same bug found and
      // fixed in Helper Form 4 / MetabRenalVascEyeLog.jsx, 2026-08-23 — the
      // UI shows only a Submit button at 100% completion, no separate Save,
      // so the stale isSaved=true from an earlier save skipped saving the
      // clinician's latest edits before the day locked).
      await handleSave({ force: true });
      const now = new Date().toISOString();
      await api.patch(`/infect-gi-hema/${enrollmentId}/${activeDay}/submit`, {
        submission_status: STATUS.SUBMITTED,
        submitted_at: now,
        submitted_by: user?.name || user?.username || "Site User",
      });
      setDayStatuses(prev => ({ ...prev, [activeDay]: STATUS.SUBMITTED }));
      setSubmittedAt(now); setSubmittedBy(user?.name || user?.username || "Site User");
      // Locking now (even mid-override) ends the override immediately on
      // the backend — mirror that here so the badge/buttons update without
      // needing a refresh.
      setOverrideUntil(null);
      setShowModal(false);
      setMessage("🔒 Day " + activeDay + " submitted and locked");
      setTimeout(() => setMessage(""), 5000);
    } catch (err) {
      setMessage("❌ Submission failed — please try again");
      setShowModal(false);
    } finally { setSubmitting(false); }
  };

  /* ── Next Form (save before navigate) ── */
  const handleNext = async () => {
    // Same phantom-blank-draft guard as handlePrevious — clicking Next on
    // an untouched day must not silently POST an empty record.
    if (isFieldEditable && completionPct > 0) {
      try { await handleSave(); } catch (err) { console.error("Save before next failed:", err); }
    }
    navigate(`/metab-renal-vasc-eye-log/${enrollmentId}`);
  };

  /* ── Audit trail — superadmin + site PI only, scoped to the active day ── */
  const fetchAuditHistory = async () => {
    setShowAuditModal(true);
    setAuditLoading(true);
    try {
      const res = await api.get("/audit/", {
        params: {
          table_name: "infect_gi_hema_day_logs",
          enrollment_id: enrollmentId,
          limit: 200,
        },
      });
      const entries = (res?.data || []).filter(e => {
        const day = e.new_values?.nicu_day ?? e.old_values?.nicu_day;
        return day === activeDay;
      });
      setAuditEntries(entries);
    } catch (_) {
      setAuditEntries([]);
    } finally {
      setAuditLoading(false);
    }
  };

  const days = Array.from({ length: totalDays }, (_, i) => i + 1);
  // Past days with genuinely no data at all — surfaced as a "missed" warning.
  const missedDays = days.filter(d =>
    todayNicuDay != null && d < todayNicuDay &&
    (dayStatuses[d] || STATUS.EMPTY) === STATUS.EMPTY
  );

  // Fetches full clinical data for every day that has something saved
  // (status != EMPTY), for the "Table View" overview. Reuses the same
  // per-day endpoint the form itself already uses to load a single day —
  // no new backend endpoint needed, just fetched in parallel for every
  // filled day instead of one at a time. Same pattern as Helper Form 1.
  const loadTableViewData = async () => {
    setShowTableView(true);
    setTableViewLoading(true);
    try {
      const filledDays = days.filter(d => (dayStatuses[d] || STATUS.EMPTY) !== STATUS.EMPTY);
      const results = await Promise.all(
        filledDays.map(d =>
          api.get(`/infect-gi-hema/${enrollmentId}/${d}`)
            .then(res => ({ day: d, data: res?.data || null }))
            .catch(() => ({ day: d, data: null }))
        )
      );
      results.sort((a, b) => a.day - b.day);
      setTableViewRows(results.filter(r => r.data));
    } catch (err) {
      console.error("Table view load failed:", err);
    } finally {
      setTableViewLoading(false);
    }
  };

  // Computes a popover position anchored under a badge button, clamped so
  // it never runs off the left/right edges, and flipped above the badge
  // when there isn't enough room below (e.g. a day near the bottom of the
  // screen). POPOVER_MAX_H is a conservative estimate — good enough for
  // flip decisions since a slight misjudgement just means less padding.
  const POPOVER_MAX_H = 260;
  const computeMissingPopoverPos = (anchorEl) => {
    const rect = anchorEl.getBoundingClientRect();
    const left = Math.min(Math.max(rect.left + rect.width / 2, 118), window.innerWidth - 118);
    const roomBelow = window.innerHeight - rect.bottom;
    const top = roomBelow < POPOVER_MAX_H && rect.top > POPOVER_MAX_H
      ? Math.max(8, rect.top - POPOVER_MAX_H - 8)
      : rect.bottom + 8;
    return { top, left };
  };

  // Opens/closes the "what's missing" popover for a day pill. Fetches and
  // caches that day's saved record on first open — cheap, since it only
  // runs for the day the user actually clicks into, not all of them.
  const handleToggleMissing = async (day, e) => {
    e.stopPropagation();
    if (missingPopoverDay === day) { setMissingPopoverDay(null); return; }
    missingAnchorRef.current = e.currentTarget;
    setMissingPopoverPos(computeMissingPopoverPos(e.currentTarget));
    setMissingPopoverDay(day);
    if (missingFieldsCache[day]) return;
    setMissingLoading(true);
    try {
      const res = await api.get(`/infect-gi-hema/${enrollmentId}/${day}`);
      setMissingFieldsCache(prev => ({ ...prev, [day]: computeMissingFields(res?.data) }));
    } catch {
      setMissingFieldsCache(prev => ({ ...prev, [day]: [] }));
    } finally {
      setMissingLoading(false);
    }
  };

  // Keep the popover glued to its badge while the page (or the day strip)
  // scrolls, instead of just closing it — re-measures the anchor button's
  // live position on every scroll/resize tick. Still closes on an outside
  // click, and on scroll if the anchor has been scrolled out of view
  // entirely (nothing sensible to point at anymore).
  useEffect(() => {
    if (missingPopoverDay === null) return;
    const handlePointerDown = (e) => {
      if (
        missingPopoverRef.current && !missingPopoverRef.current.contains(e.target) &&
        missingAnchorRef.current && !missingAnchorRef.current.contains(e.target)
      ) {
        setMissingPopoverDay(null);
      }
    };
    const reposition = () => {
      const anchor = missingAnchorRef.current;
      if (!anchor || !anchor.isConnected) { setMissingPopoverDay(null); return; }
      const rect = anchor.getBoundingClientRect();
      const offscreen = rect.bottom < 0 || rect.top > window.innerHeight ||
        rect.right < 0 || rect.left > window.innerWidth;
      if (offscreen) { setMissingPopoverDay(null); return; }
      setMissingPopoverPos(computeMissingPopoverPos(anchor));
    };
    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [missingPopoverDay]);

  /* ════════════════════ RENDER ════════════════════ */
  return (
    <>
      {isSaved && isEditing && (
        <div className="editing-mode-banner">
          <span className="editing-mode-dot" />
          Editing Mode Active — changes will be saved when you click Save
        </div>
      )}

      <div className={`rcn-page${isSaved && !isEditing ? " rcn-readonly" : ""}`}>

        {/* ══ PATIENT INFO HEADER ══ */}
        <div className="rcn-patient-header">
          <div className="rcn-patient-header-title">
            <div className="rcn-patient-header-badge">HELPER FORM 4</div>
            <h2 className="rcn-patient-header-form-name">Infection / GI / Hematology Daily Log</h2>
            <p className="rcn-patient-header-subtitle">NICU Day-by-Day Structured Assessment</p>
          </div>
          <div className="rcn-patient-cards">
            <div className="rcn-pcard rcn-pcard--blue">
              <span className="rcn-pcard-icon">🪪</span>
              <div className="rcn-pcard-body">
                <span className="rcn-pcard-label">Enrolment ID</span>
                <span className="rcn-pcard-value" title={patientInfo.enrollmentId || ""}>
                  {patientInfo.enrollmentId || "—"}
                </span>
              </div>
            </div>
            <div className="rcn-pcard rcn-pcard--teal">
              <span className="rcn-pcard-icon">🧬</span>
              <div className="rcn-pcard-body">
                <span className="rcn-pcard-label">
                  Gestation{patientInfo.gestationSource === "Form D NBS" ? " (NBS)" : ""}
                </span>
                <span className="rcn-pcard-value" title={patientInfo.gestationalAge || ""}>
                  {patientInfo.gestationalAge || "—"}
                </span>
              </div>
            </div>
            <div className="rcn-pcard rcn-pcard--amber">
              <span className="rcn-pcard-icon">🏷️</span>
              <div className="rcn-pcard-body">
                <span className="rcn-pcard-label">Baby UID</span>
                <span className="rcn-pcard-value" title={patientInfo.babyUid || ""}>
                  {patientInfo.babyUid || "—"}
                </span>
              </div>
            </div>
            <div className="rcn-pcard rcn-pcard--rose">
              <span className="rcn-pcard-icon">👶</span>
              <div className="rcn-pcard-body">
                <span className="rcn-pcard-label">B/O</span>
                <span className="rcn-pcard-value rcn-pcard-value--cap" title={String(patientInfo.babyName || "").replace(/^baby of\s+/i, "").replace(/^b\/o\s+/i, "").trim()}>
                  {String(patientInfo.babyName || "").replace(/^baby of\s+/i, "").replace(/^b\/o\s+/i, "").trim()
                    || <span className="rcn-pcard-empty">if available</span>}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ══ DAY TIMELINE ══ */}
        <div className="rcn-timeline-wrap">
          <div className="rcn-timeline-header">
            <span className="rcn-timeline-label">Days</span>
            <button
              type="button"
              className="rcn-table-view-btn"
              onClick={loadTableViewData}
              title="View all filled days in a single table"
            >
              <History size={13} /> Table View
            </button>
            <div className="rcn-day1-picker rcn-day1-picker--readonly">
              <span className="rcn-day1-picker-icon" aria-hidden="true">
                <Calendar size={16} strokeWidth={1.75} />
              </span>
              <div className="rcn-day1-picker-body">
                <span className="rcn-day1-picker-label">Day 1 Date</span>
                <span className="rcn-day1-picker-value">
                  {day1Date ? formatIsoDateMedium(day1Date) : "Awaiting Form B (Date of Birth not yet recorded)"}
                </span>
              </div>
            </div>
          </div>

          <div className="rcn-timeline">
            {days.map(d => {
              const isActive    = d === activeDay;
              const isDischarge = dischargeDay && d > dischargeDay;
              const isFuture    = todayNicuDay != null && d > todayNicuDay;
              const isLocked    = isDischarge || isFuture;
              const st          = dayStatuses[d] || STATUS.EMPTY;
              const isMissed    = !isDischarge && missedDays.includes(d);
              const cfg         = DAY_STATUS_CONFIG[st] || DAY_STATUS_CONFIG[STATUS.EMPTY];
              const meta        = dayMeta[d] || {};
              // Only days that are genuinely started-but-incomplete get the
              // "what's missing" badge — a day nobody has touched yet, or one
              // that's already complete/submitted/locked, has nothing to list.
              const showMissingBadge = !isLocked && (st === STATUS.DRAFT || st === STATUS.PARTIAL || st === STATUS.LATE);
              return (
                <div key={d} className="rcn-day-wrap">
                  <button
                    type="button"
                    className={[
                      "rcn-day",
                      isActive    ? "rcn-day--active"    : "",
                      isDischarge ? "rcn-day--discharged": "",
                      isFuture    ? "rcn-day--future"    : "",
                      isMissed    ? "rcn-day--missed"    : "",
                      `rcn-day--${st}`,
                    ].filter(Boolean).join(" ")}
                    onClick={() => !isLocked && switchActiveDay(d)}
                    disabled={isFuture}
                    title={
                      isDischarge ? `Day ${d} — Patient discharged`
                      : isFuture   ? `Day ${d} — not available yet (unlocks on its calendar date)`
                      : isMissed   ? `Day ${d} — no data was ever entered (missed)`
                      : `Day ${d} · ${cfg.label}${meta.pct ? ` · ${meta.pct}%` : ""}`
                    }
                  >
                    <span className="rcn-day-label">Day {d}</span>
                    <span className="rcn-day-date">
                      {isDischarge ? "🏠" : (() => {
                        if (!day1Date) return "";
                        const base = new Date(day1Date);
                        base.setDate(base.getDate() + d - 1);
                        return base.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
                      })()}
                    </span>
                  </button>
                  {!isActive && !isFuture && !isDischarge && (isMissed || st === STATUS.LATE) && (
                    <span className="rcn-day-badge rcn-day-badge--alert" aria-hidden="true">!</span>
                  )}
                  {!isActive && !isFuture && !isDischarge && !(isMissed || st === STATUS.LATE) && (
                    st === STATUS.COMPLETE || st === STATUS.SUBMITTED || st === STATUS.DRAFT || st === STATUS.PARTIAL
                  ) && (
                    showMissingBadge ? (
                      <button
                        type="button"
                        className="rcn-day-badge rcn-day-badge--list"
                        onClick={(e) => handleToggleMissing(d, e)}
                        title={`Day ${d} — see what's still missing`}
                        aria-label={`See missing fields for Day ${d}`}
                      >
                        <ListChecks size={10} strokeWidth={2.5} />
                      </button>
                    ) : (
                      <span className="rcn-day-badge rcn-day-badge--list" aria-hidden="true">
                        <ListChecks size={10} strokeWidth={2.5} />
                      </span>
                    )
                  )}
                </div>
              );
            })}

            {/* ── Add next day ── */}
            {!dischargeDay && (
              <button
                type="button"
                className="rcn-day-add"
                onClick={async () => {
                  const next = totalDays + 1;
                  if (isFieldEditable && completionPct > 0) {
                    try {
                      await handleSave();
                    } catch (err) {
                      console.error("Save before add day failed:", err);
                      return;
                    }
                  }
                  setTotalDays(next);
                  switchActiveDay(next);
                }}
                title={`Add Day ${totalDays + 1}`}
              >
                <span className="rcn-day-add-plus">+</span>
                <span className="rcn-day-add-label">Day</span>
              </button>
            )}
          </div>

          {missingPopoverDay !== null && missingPopoverPos && createPortal(
            <div
              ref={missingPopoverRef}
              className="rcn-day-missing-pop"
              style={{ top: missingPopoverPos.top, left: missingPopoverPos.left }}
            >
              <div className="rcn-day-missing-pop-head">
                <span>Day {missingPopoverDay} — missing fields</span>
                <button
                  type="button"
                  className="rcn-day-missing-pop-close"
                  onClick={() => setMissingPopoverDay(null)}
                  aria-label="Close"
                >
                  <X size={12} />
                </button>
              </div>
              {missingLoading && !missingFieldsCache[missingPopoverDay] ? (
                <p className="rcn-day-missing-pop-empty">Checking day {missingPopoverDay}&hellip;</p>
              ) : !missingFieldsCache[missingPopoverDay] || missingFieldsCache[missingPopoverDay].length === 0 ? (
                <p className="rcn-day-missing-pop-empty">Nothing missing — every field on this day is filled in.</p>
              ) : (
                <div className="rcn-day-missing-pop-body">
                  {missingFieldsCache[missingPopoverDay].map(g => (
                    <div key={g.section} className="rcn-day-missing-pop-group">
                      <p className="rcn-day-missing-pop-section">{g.section}</p>
                      <ul className="rcn-day-missing-pop-list">
                        {g.labels.map(label => <li key={label}>{label}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                className="rcn-day-missing-pop-goto"
                onClick={() => { switchActiveDay(missingPopoverDay); setMissingPopoverDay(null); }}
              >
                Go to Day {missingPopoverDay} <ArrowRight size={12} />
              </button>
            </div>,
            document.body
          )}

          {/* ── Status legend ── */}
          <div className="rcn-timeline-legend">
            <div className="rcn-legend-items">
              {LEGEND_ITEMS.map(item => (
                <span
                  key={item.label}
                  className={`rcn-legend-item rcn-legend-item--${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  {item.lock
                    ? <Lock size={11} className="rcn-legend-lock" />
                    : <span className="rcn-legend-dot" style={{ background: item.dot }} />}
                  {item.label}
                </span>
              ))}
            </div>
            <span className="rcn-legend-hint">
              <ListChecks size={12} /> Tap a partial day's badge to see what's missing
            </span>
          </div>

          {/* ── Missed-day alert ── */}
          {missedDays.length > 0 && (
            <div className="rcn-missed-banner">
              <AlertOctagon size={13} />
              <span>
                {missedDays.length} day{missedDays.length > 1 ? "s" : ""} with no data entered
                (Day {missedDays.join(", Day ")}) — still open for entry; lock them manually once reviewed.
              </span>
            </div>
          )}

          {/* ── Day 1 Date required alert — data entry is blocked below until this is set ── */}
          {!day1Date && (
            <div className="rcn-missed-banner">
              <AlertOctagon size={13} />
              <span>
                Record <strong>Date of Birth</strong> in Form B first — Day 1 Date is taken from
                that field and is required before you can enter daily helper data.
              </span>
            </div>
          )}
        </div>

        {/* ── Daily Summary Card ── */}
        <div className="rcn-summary">
          <div className="rcn-summary-left">
            <h2 className="rcn-summary-title">
              Day {activeDay}
              {isPastActiveDay && !isSubmitted && (
                <span className="rcn-past-day-tag" title="This day's calendar date has passed, but it stays editable until you manually lock it">
                  Past day — still editable
                </span>
              )}
            </h2>
            <div className="rcn-summary-meta">
              <Clock size={13} />
              <span>{isSaved ? "Completed" : "Not yet started"}</span>
            </div>
            {isSaved && (savedBy || savedAt || submittedBy || submittedAt) && (
              <p className="rcn-summary-provenance">
                {isSubmitted ? (
                  <>
                    Locked by {submittedBy || "Site User"}
                    {submittedAt ? ` · ${formatStampShort(submittedAt)}` : ""}
                    {(savedBy || savedAt) ? (
                      <>
                        {" · "}last saved by {savedBy || "Unknown"}
                        {savedAt ? ` · ${formatStampShort(savedAt)}` : ""}
                      </>
                    ) : null}
                  </>
                ) : (
                  <>
                    Saved by {savedBy || "Unknown"}
                    {savedAt ? ` · ${formatStampShort(savedAt)}` : ""}
                  </>
                )}
              </p>
            )}
          </div>
          <div className="rcn-summary-right">
            <div className="rcn-summary-sections">
              {[
                { emoji: "🦠", label: "Infection",        done: infAnswered,  total: infTotal  },
                { emoji: "🍽️", label: "Gastrointestinal", done: giAnswered,   total: giTotal   },
                { emoji: "🩸", label: "Hematology",       done: hemaAnswered, total: hemaTotal },
              ].map(s => (
                <div className="rcn-summary-section" key={s.label}>
                  <span className="rcn-summary-section-emoji">{s.emoji}</span>
                  <span className="rcn-summary-section-name">{s.label}</span>
                  <span className="rcn-summary-section-count">
                    {s.done}<span className="rcn-summary-section-total">/{s.total}</span>
                  </span>
                  <div className="rcn-summary-section-bar">
                    <div className="rcn-summary-section-bar-fill"
                      style={{ width: `${s.total > 0 ? (s.done / s.total) * 100 : 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="rcn-summary-ring-wrap">
              <ProgressRing percent={completionPct} />
              <span className="rcn-summary-ring-label">Complete</span>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rcn-loading">Loading day {activeDay} data…</div>
        ) : (
          <div className="rcn-sections">

            {/* Discharge banner */}
            {dischargeDay && activeDay > dischargeDay && (
              <div className="rcn-status-banner rcn-status-banner--discharged">
                <span style={{ fontSize: 18 }}>🏠</span>
                <div className="rcn-status-banner-text">
                  <strong>Patient Discharged</strong>
                  <span>Day {dischargeDay} was the last NICU day. Data entry beyond this point is locked.</span>
                </div>
              </div>
            )}

            {/* Submitted banner */}
            {currentDayStatusSubmitted(dayStatuses, activeDay) && (
              <div className="rcn-status-banner rcn-status-banner--submitted">
                <Lock size={15} />
                <div className="rcn-status-banner-text">
                  <strong>Day {activeDay} Submitted &amp; Locked</strong>
                  <span>Submitted by {submittedBy || "Site User"}{submittedAt ? ` · ${new Date(submittedAt).toLocaleString("en-GB", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" })}` : ""}</span>
                </div>
              </div>
            )}

            {/* Incomplete prompt */}
            {isSaved && !isSubmitted && completionPct < 100 && (
              <div className="rcn-status-banner rcn-status-banner--pending">
                <AlertTriangle size={15} />
                <div className="rcn-status-banner-text">
                  <strong>{completionPct}% complete</strong>
                  <span>Fill all fields to unlock the Submit button and lock this day's data</span>
                </div>
                <span className="rcn-status-banner-badge">{totalFields - totalAnswered} remaining</span>
              </div>
            )}

            {/* ════ INFECTION (Fields 1-9) ════ */}
            <SectionCard iconEmoji="🦠" title="Infection Assessment"
              answered={infAnswered} total={infTotal} defaultOpen={true}>

              <div className="rcn-yn-list">
                <YNRow label="1. Sepsis Suspected" value={infData.sepsis_suspected}
                  onChange={v => {
                    setInf("sepsis_suspected", v);
                    if (v !== true) {
                      setInfData(p => ({ ...p, blood_culture_sent: null,
                        blood_culture_positive: null }));
                    }
                  }} disabled={!isFieldEditable} />
              </div>

              {sepsisYes && (
                <div className="rcn-subsection">
                  <div className="rcn-subsection-title">2-3. If Sepsis Suspected</div>
                  <div className="rcn-yn-list">
                    <YNRow label="2. Blood Culture Sent" value={infData.blood_culture_sent}
                      onChange={v => {
                        setInf("blood_culture_sent", v);
                        if (v !== true) setInfData(p => ({ ...p, blood_culture_positive: null }));
                      }} disabled={!isFieldEditable} />
                  </div>

                  {bloodCultureSentYes && (
                    <div className="rcn-subsection">
                      <div className="rcn-yn-list">
                        <YNRow label="3. Blood Culture Positive" value={infData.blood_culture_positive}
                          onChange={v => setInf("blood_culture_positive", v)} disabled={!isFieldEditable}
                          status={infData.blood_culture_status}
                          onStatusChange={v => setInf("blood_culture_status", v)}
                          allowAwaited={true} />
                      </div>
                    </div>
                  )}

                  {/* Not part of the original numbered CRF sequence — added
                      2026-08-23 so Form H's Infection auto-fill can
                      distinguish clinical vs. screen-positive vs.
                      culture-positive sepsis (PI-specified rule) without a
                      fixed antibiotic-duration proxy for screen result. */}
                  <div className="rcn-subsection">
                    <div className="rcn-yn-list">
                      <YNRow label="Sepsis Screen Sent" value={infData.sepsis_screen_sent}
                        onChange={v => {
                          setInf("sepsis_screen_sent", v);
                          if (v !== true) setInfData(p => ({ ...p, sepsis_screens: [blankSepsisScreen()] }));
                        }} disabled={!isFieldEditable} />
                    </div>

                    {sepsisScreenSentYes && (
                      <div className="mml-subblock">
                        <div className="mml-subblock-head">
                          <span className="mml-subblock-code">Sepsis Screens</span>
                        </div>
                        {(infData.sepsis_screens?.length ? infData.sepsis_screens : [blankSepsisScreen()]).map((entry, idx) => (
                          <div className="mml-entry" key={entry.id || idx}>
                            <div className="mml-entry-head">
                              <div className="mml-entry-meta">
                                {infData.sepsis_screens.length > 1 && <span className="mml-entry-badge">#{idx + 1}</span>}
                                <label className="mml-meta-field">
                                  <span>Date</span>
                                  <input type="date" className="rcn-text-input mml-date-input" value={entry.date || ""}
                                    disabled={!isFieldEditable} onChange={e => setSepsisScreenField(idx, "date", e.target.value)} />
                                </label>
                                <label className="mml-meta-field">
                                  <span>Time</span>
                                  <input type="time" className="rcn-text-input mml-time-input" value={entry.time || ""}
                                    disabled={!isFieldEditable} onChange={e => setSepsisScreenField(idx, "time", e.target.value)} />
                                </label>
                              </div>
                              {infData.sepsis_screens.length > 1 && isFieldEditable && (
                                <button type="button" className="mml-remove-btn" title="Remove this screen"
                                  onClick={() => removeSepsisScreen(idx)}><Trash2 size={14} /></button>
                              )}
                            </div>
                            <div className="rcn-grid-3">
                              <div className="rcn-yn-row" style={{ border: "none", padding: "4px 0" }}>
                                <span className="rcn-yn-label">Type</span>
                                <select className="rcn-status-select" value={entry.type || "CRP"}
                                  disabled={!isFieldEditable}
                                  onChange={e => setSepsisScreenField(idx, "type", e.target.value)}>
                                  <option value="CRP">CRP</option>
                                  <option value="PCT">PCT</option>
                                  <option value="Hematological">Hematological</option>
                                </select>
                              </div>
                              <div className="rcn-yn-row" style={{ border: "none", padding: "4px 0" }}>
                                <span className="rcn-yn-label">Value</span>
                                <div className="rcn-num-input" style={{ width: 140 }}>
                                  <input type="number" step="0.01" value={entry.value ?? ""}
                                    disabled={!isFieldEditable}
                                    onChange={e => setSepsisScreenField(idx, "value", e.target.value === "" ? "" : Number(e.target.value))} />
                                </div>
                              </div>
                              <div className="rcn-yn-row" style={{ border: "none", padding: "4px 0" }}>
                                <span className="rcn-yn-label">Result</span>
                                <select className="rcn-status-select" value={entry.result || ""}
                                  disabled={!isFieldEditable}
                                  onChange={e => setSepsisScreenField(idx, "result", e.target.value)}>
                                  <option value="">Select</option>
                                  <option value="Positive">Positive</option>
                                  <option value="Negative">Negative</option>
                                </select>
                              </div>
                            </div>
                          </div>
                        ))}
                        {isFieldEditable && (
                          <button type="button" className="mml-add-btn" onClick={addSepsisScreen}>
                            <Plus size={14} /> Add screen
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="rcn-yn-list">
                <YNRow label="4. Antibiotics"          value={infData.antibiotics}    onChange={v => setInf("antibiotics", v)}    disabled={!isFieldEditable} />
                <YNRow label="5. LP Done"              value={infData.lp_done}        onChange={v => setInf("lp_done", v)}        disabled={!isFieldEditable} />
                <YNRow label="6. Meningitis (Y/N)"     value={infData.meningitis}
                  onChange={v => {
                    setInf("meningitis", v);
                    if (v !== true) {
                      setInfData(p => ({ ...p, meningitis_type: null }));
                    }
                  }} disabled={!isFieldEditable} />
              </div>

              {meningitisYes && (
                <div className="rcn-subsection">
                  <div className="rcn-subsection-title">7. If Meningitis</div>
                  <div className="rcn-yn-list">
                    <div className="rcn-yn-row">
                      <span className="rcn-yn-label">Meningitis Type</span>
                      <select
                        className="rcn-status-select"
                        value={infData.meningitis_type || ""}
                        disabled={!isFieldEditable}
                        onChange={e => setInf("meningitis_type", e.target.value || null)}
                      >
                        <option value="">Select type</option>
                        <option value="Probable">Probable</option>
                        <option value="Proven">Proven</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              <div className="rcn-yn-list">
                <YNRow label="8. CLABSI"                value={infData.clabsi}               onChange={v => setInf("clabsi", v)}               disabled={!isFieldEditable} />
                <YNRow label="9. VAP"                   value={infData.vap}                  onChange={v => setInf("vap", v)}                  disabled={!isFieldEditable} />
              </div>
            </SectionCard>

            {/* ════ GASTROINTESTINAL (Fields 10-22) ════ */}
            <SectionCard iconEmoji="🍽️" title="Gastrointestinal Assessment"
              answered={giAnswered} total={giTotal} defaultOpen={true}>

              <div className="rcn-yn-list">
                <YNRow label="10. NPO" value={giData.npo}
                  onChange={v => {
                    setGi("npo", v);
                    if (v !== false) {
                      lastFeedVolumeAutoRef.current = { date: null, value: undefined };
                      setFeedVolumeAutofilled(false);
                      setFeedTypeAutofilled(false);
      setHemaTransfusionAutofilled({ prbc: false, platelet: false, ffpCryo: false });
                      setGiData(p => ({ ...p, men: null, enteral_feeds_received: null,
                        feed_type: [], cumulative_feed_volume: null, feed_volume: null }));
                    }
                  }} disabled={!isFieldEditable} />
              </div>

              {npoNo && (
                <div className="rcn-subsection">
                  <div className="rcn-subsection-title">11-15. If NPO = No</div>
                  <div className="rcn-yn-list">
                    <YNRow label="11. MEN (Minimal Enteral Nutrition)" value={giData.men} onChange={v => setGi("men", v)} disabled={!isFieldEditable} />
                    <YNRow label="12. Enteral Feeds Received" value={giData.enteral_feeds_received}
                      onChange={v => {
                        setGi("enteral_feeds_received", v);
                        if (v !== true) setGiData(p => ({ ...p, feed_type: [] }));
                      }} disabled={!isFieldEditable} />
                  </div>

                  {enteralYes && (
                    <div className="rcn-subsection">
                      <div className="rcn-subsection-title">
                        13. Feed Type <span style={{fontSize:11,fontWeight:500,color:"#94A3B8"}}>(select all that apply)</span>
                        {feedTypeAutofilled && <span className="rcn-autofill-tag">from Minimal Monitoring</span>}
                      </div>
                      <PillMulti
                        options={["PDHM","EBM","FM"]}
                        value={giData.feed_type}
                        onChange={v => {
                          if (!isFieldEditable) return;
                          setFeedTypeAutofilled(false);
                          setGiData(p => ({ ...p, feed_type: v }));
                        }}
                        disabled={!isFieldEditable}
                      />
                    </div>
                  )}

                  <div className="rcn-yn-list" style={{marginTop:16}}>
                    <NumRow label="14. Cumulative Feed Volume (ml)" value={giData.cumulative_feed_volume} onChange={v => setGi("cumulative_feed_volume", v)} disabled={!isFieldEditable} unit="ml" placeholder="0" error={cumulativeFeedVolumeError} width={220}
                      status={giData.cumulative_feed_volume_status} onStatusChange={v => setGi("cumulative_feed_volume_status", v)}
                      autofilled={!!feedVolumeAutofilled} />
                    <NumRow label="15. Feed Volume (ml/kg/d)" value={giData.feed_volume} onChange={v => setGi("feed_volume", v)} disabled={!isFieldEditable} unit="ml/kg/d" placeholder="0" error={feedVolumeError} width={220}
                      status={giData.feed_volume_status} onStatusChange={v => setGi("feed_volume_status", v)} />
                  </div>
                </div>
              )}

              <div className="rcn-yn-list" style={{marginTop:16}}>
                <YNRow label="16. IV Fluids" value={giData.iv_fluids} onChange={v => setGi("iv_fluids", v)} disabled={!isFieldEditable} />
                <YNRow label="17. Parenteral Nutrition" value={giData.parenteral_nutrition} onChange={v => setGi("parenteral_nutrition", v)} disabled={!isFieldEditable} />
                <YNRow label="18. Probiotic" value={giData.probiotic} onChange={v => setGi("probiotic", v)} disabled={!isFieldEditable} />
                <YNRow label="19. Feed Intolerance" value={giData.feed_intolerance} onChange={v => setGi("feed_intolerance", v)} disabled={!isFieldEditable} />
                <YNRow label="20. NEC Suspected" value={giData.nec_suspected}
                  onChange={v => {
                    setGi("nec_suspected", v);
                    if (v !== true)
                      setGiData(p => ({ ...p, nec_confirmed_stage: null }));
                  }} disabled={!isFieldEditable} />
              </div>

              {necYes && (
                <div className="rcn-subsection">
                  <div className="rcn-subsection-title">21. If NEC Suspected</div>
                  <div className="rcn-yn-list">
                    <div className="rcn-yn-row">
                      <span className="rcn-yn-label">NEC Confirmed Stage</span>
                      <PillSingle
                        options={["IA", "IB", "IIA", "IIB", "IIIA", "IIIB"]}
                        value={giData.nec_confirmed_stage}
                        onChange={v => setGi("nec_confirmed_stage", v)}
                        disabled={!isFieldEditable}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="rcn-yn-list">
                <YNRow label="22. Cholestasis" value={giData.cholestasis} onChange={v => setGi("cholestasis", v)} disabled={!isFieldEditable} />
              </div>
            </SectionCard>

            {/* ════ HEMATOLOGY (Fields 23-30) ════ */}
            <SectionCard iconEmoji="🩸" title="Hematology Assessment"
              answered={hemaAnswered} total={hemaTotal} defaultOpen={true}>

              <div className="rcn-yn-list">
                <NumRow label="23. Hb Value (g/dL)" value={hemaData.hb_value} onChange={v => setHema("hb_value", v)} disabled={!isFieldEditable} unit="g/dL" placeholder="0.0" error={hbValueError}
                  status={hemaData.hb_value_status} onStatusChange={v => setHema("hb_value_status", v)} allowAwaited={true} />
                <YNRow label="24. Jaundice" value={hemaData.jaundice}
                  onChange={v => {
                    setHema("jaundice", v);
                    if (v !== true) setHemaData(p => ({ ...p, phototherapy: null }));
                  }} disabled={!isFieldEditable} />
              </div>

              {jaundiceYes && (
                <div className="rcn-subsection">
                  <div className="rcn-subsection-title">25. If Jaundice</div>
                  <div className="rcn-yn-list">
                    <YNRow label="Phototherapy" value={hemaData.phototherapy}
                      onChange={v => setHema("phototherapy", v)} disabled={!isFieldEditable} />
                  </div>
                </div>
              )}

              <div className="rcn-yn-list">
                <NumRow label="26. Peak TSB (mg/dL)" value={hemaData.peak_tsb} onChange={v => setHema("peak_tsb", v)} disabled={!isFieldEditable} unit="mg/dL" placeholder="0.0" error={peakTsbError}
                  status={hemaData.peak_tsb_status} onStatusChange={v => setHema("peak_tsb_status", v)} allowAwaited={true} />
                <YNRow label="27. Exchange Transfusion" value={hemaData.exchange_transfusion} onChange={v => setHema("exchange_transfusion", v)} disabled={!isFieldEditable} />
                <YNRow label="28. PRBC Transfusion" value={hemaData.prbc_transfusion}
                  onChange={v => { setHemaTransfusionAutofilled(p => ({ ...p, prbc: false })); setHema("prbc_transfusion", v); }}
                  disabled={!isFieldEditable} />
                <YNRow label="29. Platelet Transfusion" value={hemaData.platelet_transfusion}
                  onChange={v => { setHemaTransfusionAutofilled(p => ({ ...p, platelet: false })); setHema("platelet_transfusion", v); }}
                  disabled={!isFieldEditable} />
                <YNRow label="30. FFP / Cryo Transfusion" value={hemaData.ffp_cryo}
                  onChange={v => { setHemaTransfusionAutofilled(p => ({ ...p, ffpCryo: false })); setHema("ffp_cryo", v); }}
                  disabled={!isFieldEditable} />
              </div>
            </SectionCard>

          </div>
        )}

        {message && (
          <div className={`form-message${message.startsWith("✅") || message.startsWith("🔒") ? " form-message--success" : " form-message--error"}`}>
            {message}
          </div>
        )}

      </div>{/* end rcn-page */}

      {/* Modals */}
      {showModal && (
        <SubmitModal day={activeDay} completionPct={completionPct}
          onConfirm={handleSubmit} onCancel={() => setShowModal(false)} submitting={submitting} />
      )}

      {/* ══ TABLE VIEW MODAL ══ */}
      {showTableView && (
        <div className="rcn-modal-overlay" onClick={() => setShowTableView(false)}>
          <div className="rcn-modal rcn-modal--wide" onClick={e => e.stopPropagation()}>
            <div className="rcn-modal-header">
              <div className="rcn-modal-icon"><History size={18} /></div>
              <div>
                <h3 className="rcn-modal-title">All Days — Table View</h3>
                <p className="rcn-modal-subtitle">Every day filled in so far for this baby, side by side</p>
              </div>
              <button className="rcn-modal-close" type="button" onClick={() => setShowTableView(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="rcn-modal-body rcn-table-view-body">
              {tableViewLoading ? (
                <p className="rcn-table-view-empty">Loading all days&hellip;</p>
              ) : tableViewRows.length === 0 ? (
                <p className="rcn-table-view-empty">No days have been filled in yet.</p>
              ) : (
                <div className="rcn-table-view-scroll">
                  <table className="rcn-table-view rcn-table-view--vertical">
                    <thead>
                      <tr>
                        <th className="rcn-table-view-field-header">Field</th>
                        {tableViewRows.map(({ day }) => {
                          const st  = dayStatuses[day] || STATUS.EMPTY;
                          const cfg = DAY_STATUS_CONFIG[st] || DAY_STATUS_CONFIG[STATUS.EMPTY];
                          return (
                            <th key={day} className="rcn-table-view-day-header">
                              <button
                                type="button"
                                className="rcn-table-view-goto-btn"
                                onClick={() => { switchActiveDay(day); setShowTableView(false); }}
                                title="Go to this day"
                              >
                                Day {day}
                              </button>
                              <span className="rcn-table-view-day-status">
                                <span className="rcn-table-view-status-dot" style={{ background: cfg.dot }} />
                                {cfg.label}
                              </span>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {TABLE_VIEW_FIELD_GROUPS.map(group => (
                        <React.Fragment key={group.section}>
                          <tr className="rcn-table-view-section-row">
                            <td colSpan={tableViewRows.length + 1}>{group.section}</td>
                          </tr>
                          {group.rows.map(row => (
                            <tr key={row.key}>
                              <td className="rcn-table-view-field-cell">{row.label}</td>
                              {tableViewRows.map(({ day, data: d }) => (
                                <td key={day}>{formatTableViewValue(d, row)}</td>
                              ))}
                            </tr>
                          ))}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ AUDIT TRAIL MODAL ══ */}
      {showAuditModal && (
        <div className="rcn-modal-overlay" onClick={() => setShowAuditModal(false)}>
          <div className="rcn-modal" onClick={e => e.stopPropagation()}>
            <div className="rcn-modal-header">
              <div className="rcn-modal-icon"><History size={18} /></div>
              <div>
                <h3 className="rcn-modal-title">Day {activeDay} History</h3>
                <p className="rcn-modal-subtitle">Every save, submit, and override for this day</p>
              </div>
              <button className="rcn-modal-close" type="button" onClick={() => setShowAuditModal(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="rcn-modal-body">
              {auditLoading ? (
                <div className="rcn-audit-empty">Loading…</div>
              ) : auditEntries.length === 0 ? (
                <div className="rcn-audit-empty">No history recorded for this day yet.</div>
              ) : (
                <div className="rcn-audit-list">
                  {auditEntries.map(e => (
                    <div key={e.id} className="rcn-audit-entry">
                      <div className="rcn-audit-entry-top">
                        <span className="rcn-audit-action">{auditActionLabel(e.action)}</span>
                        <span className="rcn-audit-time">
                          {e.created_at ? new Date(e.created_at).toLocaleString("en-GB") : ""}
                        </span>
                      </div>
                      <span className="rcn-audit-user">by {e.username || "unknown"}</span>
                      {e.new_values?.reason && (
                        <p className="rcn-audit-reason">"{e.new_values.reason}"</p>
                      )}
                      <AuditChangeList
                        oldValues={e.old_values}
                        newValues={e.new_values}
                        compact
                        hideKeys={["reason", "nicu_day"]}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ SITE-MONITOR OVERRIDE MODAL ══ */}
      {showOverrideModal && (
        <div className="rcn-modal-overlay" onClick={() => !overrideSubmitting && setShowOverrideModal(false)}>
          <div className="rcn-modal" onClick={e => e.stopPropagation()}>
            <div className="rcn-modal-header">
              <div className="rcn-modal-icon"><Unlock size={18} /></div>
              <div>
                <h3 className="rcn-modal-title">Override &amp; Unlock Day {activeDay}</h3>
                <p className="rcn-modal-subtitle">Temporarily reopens this locked day for a correction</p>
              </div>
              <button className="rcn-modal-close" type="button" onClick={() => setShowOverrideModal(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="rcn-modal-body">
              <p style={{ fontSize: 12.5, color: "#475569", marginTop: 0 }}>
                This reopens Day {activeDay} for 2 hours so it can be corrected. The reason below
                is saved to the audit trail.
              </p>
              <textarea
                className="rcn-override-textarea"
                placeholder="Reason for correction (required)…"
                value={overrideReason}
                onChange={e => setOverrideReason(e.target.value)}
              />
            </div>
            <div className="rcn-modal-footer">
              <button className="rcn-modal-btn rcn-modal-btn--cancel" type="button"
                onClick={() => setShowOverrideModal(false)} disabled={overrideSubmitting}>
                Cancel
              </button>
              <button
                className="rcn-modal-btn rcn-modal-btn--confirm"
                type="button"
                disabled={!overrideReason.trim() || overrideSubmitting}
                onClick={async () => {
                  setOverrideSubmitting(true);
                  try {
                    const res = await api.patch(
                      `/infect-gi-hema/${enrollmentId}/${activeDay}/override-unlock`,
                      { reason: overrideReason.trim(), hours: 2 }
                    );
                    setOverrideUntil(res?.data?.override_unlocked_until || null);
                    // isFieldEditable also requires isEditing when isSaved is
                    // true (always true for a submitted day) — without this,
                    // the override succeeds server-side but fields still
                    // render read-only and every setter silently no-ops.
                    setIsEditing(true);
                    setOverrideReason("");
                    setShowOverrideModal(false);
                    setMessage(`🔓 Day ${activeDay} reopened for 2 hours`);
                  } catch (err) {
                    setMessage("⚠️ Could not unlock — " + (err?.response?.data?.detail || "try again"));
                  } finally {
                    setOverrideSubmitting(false);
                  }
                }}
              >
                {overrideSubmitting ? "Unlocking…" : "Unlock Day"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ STICKY FOOTER ══ */}
      <div className="form-navigation">
        <button type="button" className="btn btn-secondary btn-outline"
          onClick={handlePrevious}>
          <ArrowLeft size={15} /> Resp-CV-Neuro
        </button>

        {/* History — superadmin + site PI only, any day/lock state */}
        {canViewAudit && (
          <button
            type="button"
            className="btn rcn-history-btn"
            onClick={fetchAuditHistory}
            title={`View correction history for Day ${activeDay}`}
          >
            <History size={15}/> History
          </button>
        )}

        {/* Save — always visible when editing */}
        {isFieldEditable && (
          <button type="button" className="btn btn-save btn-outline-blue" onClick={handleSave}>
            <Save size={15} /> Save
          </button>
        )}

        {/* Edit button — enable editing of saved draft */}
        {isSaved && !isEditing && !isSubmitted && (
          <button
            type="button"
            className="btn btn-edit btn-outline-blue"
            onClick={() => setIsEditing(true)}
            title="Enable editing of saved data"
          >
            <Edit size={13} /> Edit Day {activeDay}
          </button>
        )}

        {/* Save / manual Lock button / Locked badge — locking is explicit
            and manual only: nothing here auto-locks a day just because its
            calendar date has passed. A day stays editable until a user
            clicks "Lock" and confirms in the modal. */}
        {isOverrideActiveDay ? (
          <>
            <div className="rcn-locked-badge rcn-locked-badge--override" title="Temporarily reopened by a site monitor">
              <Unlock size={13} /> Day {activeDay} Reopened (Override)
            </div>
            {canSubmit ? (
              <button type="button" className="btn btn-lock-day" onClick={() => setShowModal(true)}
                title="Lock this day — you won't be able to edit it after confirming">
                <Lock size={15} /> Lock Day {activeDay}
              </button>
            ) : (
              <button type="button" className="btn btn-draft" onClick={handleSave}>
                <Save size={15} /> Save Correction
              </button>
            )}
          </>
        ) : isSubmitted ? (
          <>
            <div className="rcn-locked-badge">
              <Lock size={13} /> Day {activeDay} Locked
            </div>
            {isSuperadmin && (
              <button
                type="button"
                className="rcn-override-btn"
                onClick={() => setShowOverrideModal(true)}
                title="Reopen this locked day temporarily for a correction"
              >
                <Unlock size={13}/> Override &amp; Unlock
              </button>
            )}
          </>
        ) : isFutureActiveDay ? (
          <div className="rcn-locked-badge" title="Data can only be entered on the day's own calendar date">
            <Lock size={13} /> Day {activeDay} Not Available Yet
          </div>
        ) : canSubmit ? (
          <button
            type="button"
            className="btn btn-lock-day"
            onClick={() => setShowModal(true)}
            title="Lock this day — you won't be able to edit it after confirming"
          >
            <Lock size={15} /> Lock Day {activeDay}
          </button>
        ) : (
          <button type="button" className="btn btn-draft"
            onClick={handleSave}>
            <Save size={15} /> Save for Later
          </button>
        )}

        <div className="footer-step-indicator">
          <span className="step-text">HELPER 3 OF 4</span>
          <div className="step-progress-line">
            <div className="progress-segment active" />
            <div className="progress-segment active" />
            <div className="progress-segment active" />
            <div className="progress-segment" />
          </div>
        </div>
        <button type="button" className="btn btn-primary"
          onClick={handleNext} disabled={!isSaved}>
          Next Form <ArrowRight size={15} />
        </button>
      </div>
      <SaveSuccessModal
        open={showSaveSuccess}
        onClose={() => setShowSaveSuccess(false)}
        message={`Day ${activeDay} has been saved successfully.`}
      />
    </>
  );
}

// small helper kept local so the "Submitted" banner logic matches Form 2's currentDayStatus check
function currentDayStatusSubmitted(dayStatuses, activeDay) {
  return (dayStatuses[activeDay] || "empty") === "submitted";
}
