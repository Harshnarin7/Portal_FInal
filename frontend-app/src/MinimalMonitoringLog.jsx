import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, ChevronDown, ChevronRight, Plus, Save, Trash2, CheckCircle2,
  Heart, Wind, Beaker, Utensils, Brain, Droplet, Clock, Info,
} from "lucide-react";
import api from "./api/axios";
import { useAuth } from "./context/AuthContext";
import { useFormProgress } from "./context/FormProgressContext";
import { useRegisterActiveFormSession } from "./context/ActiveFormSessionContext";
import {
  toDateOnlyValue,
  formatDateToDDMMYYYY,
  formatTimeAmPm,
  openNativeDatePicker,
  realCalendarDateYmd,
  MML_DROPDOWN_CUTOFF_HOUR,
  mmlDropdownDateOptions,
  mmlDefaultSheetDate,
  mmlMaxAllowedTimeForSheetDate,
  mmlClampTimeForSheetDate,
  isDateTimeInFuture,
} from "./utils/datetime";
import {
  readRememberedMmlSheetDate,
  rememberMmlSheetDate,
  markMmlRespDirtyForHelper,
} from "./utils/helperSession";
import { getMapCpapMode, validateMapCpap } from "./utils/mapCpapMode";
import "./styles/RespCVNeuro.css";
import "./styles/MinimalMonitoring.css";

/** Server still uses NICU_DAY_GRACE_HOUR for legacy GET/PUT .../today only. */

const SECTION_META = {
  cardiovascular: { code: "5.1", title: "Cardiovascular", icon: Heart },
  respiratory: { code: "5.2", title: "Respiratory", icon: Wind },
  metabolic: { code: "5.3", title: "Metabolic", icon: Beaker },
  gastrointestinal: { code: "5.4", title: "Gastrointestinal", icon: Utensils },
  neurological: { code: "5.5", title: "Neurological", icon: Brain },
  hematology: { code: "5.6", title: "Hematology", icon: Droplet },
};

const SECTION_KEYS = Object.keys(SECTION_META);

const BLOCK_TO_SECTION = {
  cv_a: "cardiovascular", cv_b: "cardiovascular", cv_c: "cardiovascular", cv_d: "cardiovascular",
  resp_a: "respiratory", resp_b: "respiratory", resp_c: "respiratory", resp_d: "respiratory",
  met_a: "metabolic", met_b: "metabolic",
  gi_a: "gastrointestinal", gi_b: "gastrointestinal",
  neuro_a: "neurological", neuro_b: "neurological",
  neuro_combined: "neurological",
  heme_a: "hematology",
};

/** Ordered list of variable/field blocks under each heading — drives the
 *  second-level "choose a field" list (e.g. Metabolic → Glucose / Lab
 *  Reports / Electrolyte abnormality). */
const BLOCKS_BY_SECTION = {
  cardiovascular: ["cv_a", "cv_b", "cv_c", "cv_d"],
  respiratory: ["resp_a", "resp_b", "resp_c", "resp_d"],
  metabolic: ["met_a", "met_b"],
  gastrointestinal: ["gi_a", "gi_b"],
  neurological: ["neuro_combined"],
  hematology: ["heme_a"],
};

/** Friendly label + one-line description shown in the field-picker list. */
const BLOCK_META = {
  cv_a: { code: "5.1.A", label: "Vitals", desc: "Skin/Axillary temp, SBP, DBP, MAP" },
  cv_b: { code: "5.1.B", label: "Fluid Bolus", desc: "Fluid bolus volume given" },
  cv_c: { code: "5.1.C", label: "Vasoactive Drugs", desc: "Agent, dose & unit" },
  cv_d: { code: "5.1.D", label: "PDA Medical Rx", desc: "Agent for medical Rx of PDA & dose" },
  resp_a: { code: "5.2.A", label: "Respiratory Support", desc: "Time, mode, max MAP/CPAP, max FiO₂" },
  resp_b: { code: "5.2.B", label: "Blood Gas", desc: "pH, PaO₂, PaCO₂" },
  resp_c: { code: "5.2.C", label: "Apnea / Desaturation", desc: "Apnea and desaturation episodes" },
  resp_d: { code: "5.2.D", label: "Postnatal Steroids", desc: "Agent & dose" },
  met_a: { code: "5.3.A", label: "Glucose", desc: "Spot glucose reading" },
  met_b: { code: "5.3.B", label: "Lab Reports — ALP, Total Ca, P", desc: "ALP, total calcium & phosphorus" },
  gi_a: { code: "5.4.A", label: "Feed Volume", desc: "EF/NPO, milk type, and volume — logged on a chosen hourly cadence" },
  gi_b: { code: "5.4.B", label: "Direct Bilirubin", desc: "Direct bilirubin value" },
  neuro_combined: {
    code: "5.5",
    label: "Neurological",
    desc: "Ventriculomegaly (severity, VI, AHW) and Doppler (TOD, ACA RI, MCA RI)",
  },
  heme_a: { code: "5.6.A", label: "Transfusion", desc: "Products, count, PRBC volume" },
};

const LEGACY_FLUID_BOLUS_NOT_INDICATED = /^should\s+not\s+have\s+been\s+done$/i;

function normalizeFluidBolusValue(value) {
  if (value == null || value === "") return "";
  if (typeof value === "string" && LEGACY_FLUID_BOLUS_NOT_INDICATED.test(value.trim())) return "";
  return value;
}

function sanitizeFluidBolusInEntries(entries) {
  (entries.cv_b || []).forEach((entry) => {
    if (entry && "fluid_bolus_given" in entry) {
      entry.fluid_bolus_given = normalizeFluidBolusValue(entry.fluid_bolus_given);
    }
  });
  return entries;
}

const pad2 = n => String(n).padStart(2, "0");
const nowTime = (d = new Date()) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** Parse stored respiratory time range ("08:00–14:00", "8:00 AM - 2:00 PM", or a single time). */
function parseTimeRange(value) {
  const s = String(value || "").trim();
  if (!s) return { from: "", to: "" };
  const parts = s.split(/\s*[–—−-]\s*|\s+to\s+/i).map(p => p.trim()).filter(Boolean);
  const toHHmm = raw => {
    const t = String(raw || "").trim();
    const ampm = t.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
    if (!ampm) return "";
    let h = Number(ampm[1]);
    const min = ampm[2];
    const ap = (ampm[3] || "").toUpperCase();
    if (ap === "PM" && h < 12) h += 12;
    if (ap === "AM" && h === 12) h = 0;
    if (!Number.isFinite(h) || h < 0 || h > 23) return "";
    return `${pad2(h)}:${min}`;
  };
  if (parts.length === 1) return { from: toHHmm(parts[0]), to: "" };
  return { from: toHHmm(parts[0]), to: toHHmm(parts[1]) };
}

function joinTimeRange(from, to) {
  if (from && to) return `${from}–${to}`;
  return from || to || "";
}

function formatTimeRangeAmPm(value) {
  const { from, to } = parseTimeRange(value);
  if (!from && !to) return "";
  const a = from ? formatTimeAmPm(from) : "—";
  const b = to ? formatTimeAmPm(to) : "";
  return b ? `${a} – ${b}` : a;
}

const ans = v => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0);
const listToString = v => Array.isArray(v) ? v.join(",") : (v || "");
const stringToList = v => Array.isArray(v) ? v : String(v || "").split(",").map(s => s.trim()).filter(Boolean);
const asNumber = v => v === "" || v === null || v === undefined ? null : Number(v);
const asInteger = v => v === "" || v === null || v === undefined ? null : parseInt(v, 10);

const SEVERE_DESAT_EXCEEDS_MSG = "Severe desaturations can't exceed total desaturation episodes";

/** Same soft ranges as Helper 1 (RespCVNeuroLog) blood gas fields #8–#10. */
function mmlValidatePh(value) {
  if (value === "" || value == null) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return "Enter a valid number";
  if (num < 6.6 || num > 7.8) return "pH is usually 6.6–7.8 — please double-check this value";
  return null;
}

function mmlValidateBloodGasMmHg(value, { min, max, label }) {
  if (value === "" || value == null) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return "Enter a valid number";
  if (num < min || num > max) {
    return `${label} is usually ${min}–${max} mmHg — please double-check`;
  }
  return null;
}

/** Live soft warnings for 5.2.B (draft row + saved readings table). */
function buildRespBBloodGasWarnings(entries) {
  const next = {};
  const list = entries.resp_b || [];
  list.forEach((e, i) => {
    const isOpenDraft = i === list.length - 1 && !hasEntryData(e);
    if (isOpenDraft) return;
    const phErr = mmlValidatePh(e.ph);
    if (phErr) next[`resp_b.${i}.ph`] = phErr;
    const pao2Err = mmlValidateBloodGasMmHg(e.pao2, {
      min: 20, max: 600, label: "PaO₂",
    });
    if (pao2Err) next[`resp_b.${i}.pao2`] = pao2Err;
    const paco2Err = mmlValidateBloodGasMmHg(e.paco2, {
      min: 15, max: 150, label: "PaCO₂",
    });
    if (paco2Err) next[`resp_b.${i}.paco2`] = paco2Err;
  });
  return next;
}

/** Keep severe_desaturation_episodes ≤ desaturation_episodes when both are set. */
function applyRespCEpisodeConstraints(entry) {
  const next = { ...entry };
  const desatRaw = next.desaturation_episodes;
  const severeRaw = next.severe_desaturation_episodes;
  if (desatRaw === "" || desatRaw == null || severeRaw === "" || severeRaw == null) return next;
  const desat = Number(desatRaw);
  const severe = Number(severeRaw);
  if (!Number.isFinite(desat) || !Number.isFinite(severe) || severe <= desat) return next;
  next.severe_desaturation_episodes = String(desat);
  return next;
}

/** New entries always get today's date + the current clock time — this is
 *  what makes the date/time on a freshly-opened field "autofill". */
function freshEntry(fields = {}, sheetDateYmd = null) {
  const d = new Date();
  const dateStr = sheetDateYmd || toDateOnlyValue(d);
  return { id: uid(), date: dateStr, time: nowTime(d), ...fields };
}

function emptyEntries() {
  return {
    // cv_a, met_a and gi_a are Scheduled Flowsheet blocks: no seed draft
    // row — rows are generated from the chosen frequency + whatever real
    // entries already exist (see buildFlowsheetRows), not the generic
    // "always ends with a blank draft" pattern every other block uses.
    cv_a: [],
    cv_b: [freshEntry({ fluid_bolus_given: "" })],
    cv_c: [freshEntry({ vasoactive_drugs: [], vasoactive_dose: "", vasoactive_unit: "" })],
    cv_d: [freshEntry({ pda_agent: [], pda_dose: "" })],
    resp_a: [freshEntry({ time_range: "", respiratory_modes: [], max_map_cpap: "", max_map_cpap_secondary: "", max_fio2: "" })],
    resp_b: [freshEntry({ ph: "", pao2: "", paco2: "" })],
    resp_c: [freshEntry({ apnea_episodes: "", desaturation_episodes: "", severe_desaturation_episodes: "" })],
    resp_d: [freshEntry({ postnatal_steroids: [], steroid_dose: "", steroid_other: "" })],
    met_a: [],
    met_b: [freshEntry({ alp: "", total_calcium: "", phosphorus: "" })],
    gi_a: [],
    gi_b: [freshEntry({ direct_bilirubin: "" })],
    neuro_a: [freshEntry({ ventriculomegaly_severity: "", vi: "", ahw: "" })],
    neuro_b: [freshEntry({ tod: "", aca_ri: "", mca_ri: "" })],
    heme_a: [freshEntry({ transfusion_products: [], transfusion_count: "", prbc_volume: "" })],
  };
}

function formatGestation(weeks, days) {
  if (weeks === null || weeks === undefined || weeks === "") return "";
  return `${weeks} wks ${days || 0} days`;
}

function hydrateEntries(d) {
  if (d?.entries_json) {
    try {
      const parsed = typeof d.entries_json === "string" ? JSON.parse(d.entries_json) : d.entries_json;
      if (parsed && typeof parsed === "object") {
        const base = emptyEntries();
        Object.keys(base).forEach(k => {
          if (Array.isArray(parsed[k]) && parsed[k].length) base[k] = parsed[k];
        });
        return sanitizeFluidBolusInEntries(base);
      }
    } catch (_) { /* fall through */ }
  }
  // Legacy flat-row → single entry per block
  const e = emptyEntries();
  // Legacy cv_a/met_a had one flat reading per day (no multi-entry
  // slot/flowsheet structure at all) — migrate a real value into one
  // synthetic slot-00:00 entry rather than silently dropping it, same
  // pattern as gi_a's legacy migration below. A row where every one of
  // these fields is blank needs no synthetic entry (the new default is
  // simply empty, matching gi_a).
  if (d.axillary_temp != null || d.sbp != null || d.dbp != null || d.map_value != null) {
    e.cv_a = [freshEntry({
      slot_time: "00:00", axillary_temp: d.axillary_temp ?? "", sbp: d.sbp ?? "",
      dbp: d.dbp ?? "", map_value: d.map_value ?? "",
    }, d.record_date)];
  }
  e.cv_b[0] = {
    ...e.cv_b[0],
    fluid_bolus_given: normalizeFluidBolusValue(d.fluid_bolus_given),
  };
  e.cv_c[0] = { ...e.cv_c[0], vasoactive_drugs: stringToList(d.vasoactive_drugs), vasoactive_dose: d.vasoactive_dose || "", vasoactive_unit: d.vasoactive_unit || "" };
  e.cv_d[0] = { ...e.cv_d[0], pda_agent: stringToList(d.pda_agent), pda_dose: d.pda_dose ?? "" };
  e.resp_a[0] = {
    ...e.resp_a[0],
    time_range: d.respiratory_time || "",
    respiratory_modes: stringToList(d.respiratory_modes),
    max_map_cpap: d.max_map_cpap ?? "",
    max_map_cpap_secondary: d.max_map_cpap_secondary ?? "",
    max_fio2: d.max_fio2 ?? "",
  };
  e.resp_b[0] = { ...e.resp_b[0], ph: d.ph ?? "", pao2: d.pao2 ?? "", paco2: d.paco2 ?? "" };
  e.resp_c[0] = { ...e.resp_c[0], apnea_episodes: d.apnea_episodes ?? "", desaturation_episodes: d.desaturation_episodes ?? "", severe_desaturation_episodes: d.severe_desaturation_episodes ?? "" };
  e.resp_d[0] = { ...e.resp_d[0], postnatal_steroids: stringToList(d.postnatal_steroids), steroid_dose: d.steroid_dose ?? "", steroid_other: d.steroid_other || "" };
  if (d.glucose != null && d.glucose !== "") {
    e.met_a = [freshEntry({ slot_time: "00:00", glucose: String(d.glucose) }, d.record_date)];
  }
  e.met_b[0] = { ...e.met_b[0], alp: d.alp ?? "", total_calcium: d.total_calcium ?? "", phosphorus: d.phosphorus ?? "" };
  // Legacy gi_a had one flat cumulative_feed_volume number, no status/type/
  // slot structure at all — migrate a real value into one EF entry (type
  // unknown) rather than silently dropping it. A blank/zero legacy value
  // needs no synthetic entry (gi_a's new default is simply empty).
  if (d.cumulative_feed_volume != null && d.cumulative_feed_volume !== "") {
    e.gi_a = [freshEntry({
      slot_time: "00:00", status: "EF", milk_type: "",
      volume_ml: String(d.cumulative_feed_volume),
    }, d.record_date)];
  }
  e.gi_b[0] = { ...e.gi_b[0], direct_bilirubin: d.direct_bilirubin ?? "" };
  e.neuro_a[0] = { ...e.neuro_a[0], date: d.imaging_date || e.neuro_a[0].date, ventriculomegaly_severity: d.ventriculomegaly_severity || "", vi: d.vi ?? "", ahw: d.ahw ?? "" };
  e.neuro_b[0] = { ...e.neuro_b[0], tod: d.tod ?? "", aca_ri: d.aca_ri ?? "", mca_ri: d.mca_ri ?? "" };
  e.heme_a[0] = { ...e.heme_a[0], transfusion_products: stringToList(d.transfusion_products), transfusion_count: d.transfusion_count ?? "", prbc_volume: d.prbc_volume ?? "" };
  return sanitizeFluidBolusInEntries(e);
}

function flattenEntries(entries) {
  const g = (key, i = 0) => (entries[key] && entries[key][i]) || {};
  const cvA = g("cv_a"); const cvB = g("cv_b"); const cvC = g("cv_c"); const cvD = g("cv_d");
  const rA = g("resp_a"); const rB = g("resp_b"); const rC = g("resp_c"); const rD = g("resp_d");
  const mA = g("met_a"); const mB = g("met_b");
  const giB = g("gi_b");
  // gi_a is now a per-slot flowsheet (many real entries, not just the
  // first) — the flat mirror column is the day's total EF volume.
  const giAEfVolumeMl = (entries.gi_a || [])
    .filter(e => hasEntryData(e) && e.status === "EF")
    .reduce((sum, e) => sum + (Number(e.volume_ml) || 0), 0);
  const nA = g("neuro_a"); const nB = g("neuro_b"); const hA = g("heme_a");
  return {
    record_date: cvA.date || "",
    shift: "",
    axillary_temp: asNumber(cvA.axillary_temp),
    sbp: asNumber(cvA.sbp),
    dbp: asNumber(cvA.dbp),
    map_value: asNumber(cvA.map_value),
    fluid_bolus_given: cvB.fluid_bolus_given || "",
    vasoactive_drugs: listToString(cvC.vasoactive_drugs),
    vasoactive_dose: cvC.vasoactive_dose || "",
    vasoactive_unit: cvC.vasoactive_unit || "",
    pda_agent: listToString(cvD.pda_agent),
    pda_dose: cvD.pda_dose === "" || cvD.pda_dose == null ? null : String(cvD.pda_dose),
    respiratory_time: rA.time_range || (rA.time ? rA.time : ""),
    respiratory_modes: listToString(rA.respiratory_modes),
    max_map_cpap: asNumber(rA.max_map_cpap),
    max_map_cpap_secondary: asNumber(rA.max_map_cpap_secondary),
    max_fio2: asNumber(rA.max_fio2),
    ph: asNumber(rB.ph),
    pao2: asNumber(rB.pao2),
    paco2: asNumber(rB.paco2),
    apnea_shift: "",
    apnea_episodes: asInteger(rC.apnea_episodes),
    desaturation_episodes: asInteger(rC.desaturation_episodes),
    severe_desaturation_episodes: asInteger(rC.severe_desaturation_episodes),
    postnatal_steroids: listToString(rD.postnatal_steroids),
    steroid_dose: rD.steroid_dose === "" || rD.steroid_dose == null ? null : String(rD.steroid_dose),
    steroid_other: rD.steroid_other || "",
    glucose: asNumber(mA.glucose),
    alp: asNumber(mB.alp),
    total_calcium: asNumber(mB.total_calcium),
    phosphorus: asNumber(mB.phosphorus),
    feed_shift: "",
    cumulative_feed_volume: giAEfVolumeMl > 0 ? giAEfVolumeMl : null,
    direct_bilirubin: asNumber(giB.direct_bilirubin),
    imaging_date: nA.date || "",
    ventriculomegaly_severity: nA.ventriculomegaly_severity || "",
    vi: asNumber(nA.vi),
    ahw: asNumber(nA.ahw),
    tod: asNumber(nB.tod),
    aca_ri: asNumber(nB.aca_ri),
    mca_ri: asNumber(nB.mca_ri),
    transfusion_products: listToString(hA.transfusion_products),
    transfusion_count: asInteger(hA.transfusion_count),
    prbc_volume: asNumber(hA.prbc_volume),
    entries_json: JSON.stringify(entriesForPersist(entries)),
  };
}

/** True if an entry has at least one real clinical value filled in — the
 *  auto-stamped id/date/time on a freshly-opened blank row don't count. This
 *  is what distinguishes a "previously added" reading (shown in the history
 *  table) from the still-blank draft row waiting for new input. */
function hasEntryData(entry) {
  if (!entry) return false;
  return Object.entries(entry).some(([k, v]) => {
    // slot_time is a Scheduled Flowsheet's slot bookkeeping tag (which
    // scheduled row this entry belongs to) — like id/date/time, it's
    // metadata stamped automatically, never itself a clinical answer.
    if (k === "id" || k === "date" || k === "time" || k === "slot_time") return false;
    return ans(v);
  });
}

function entriesForPersist(entries) {
  const out = {};
  Object.keys(entries || {}).forEach((blockKey) => {
    out[blockKey] = (entries[blockKey] || []).filter(hasEntryData);
  });
  return out;
}

/** On explicit Save: turn filled draft rows into saved readings (new blank draft appended). */
function commitFilledDraftRows(entries, sheetDateYmd) {
  const next = { ...entries };
  let changed = false;
  Object.keys(next).forEach(blockKey => {
    const list = [...(next[blockKey] || [])];
    if (list.length === 0) return;
    const draftIdx = list.length - 1;
    if (!hasEntryData(list[draftIdx])) return;
    const template = emptyEntries()[blockKey]?.[0];
    if (!template) return;
    const fieldDefaults = { ...template };
    delete fieldDefaults.id;
    delete fieldDefaults.date;
    delete fieldDefaults.time;
    list.push(freshEntry(fieldDefaults, sheetDateYmd));
    next[blockKey] = list;
    changed = true;
  });
  return changed ? next : entries;
}

/** After load: every block ends with an empty draft row for new readings. */
function ensureTrailingDraftRows(entries, sheetDateYmd) {
  const next = { ...entries };
  let changed = false;
  Object.keys(emptyEntries()).forEach(blockKey => {
    let list = [...(next[blockKey] || [])];
    if (list.length === 0) {
      next[blockKey] = [...emptyEntries()[blockKey]];
      changed = true;
      return;
    }
    const last = list[list.length - 1];
    if (!hasEntryData(last)) return;
    const template = emptyEntries()[blockKey]?.[0];
    if (!template) return;
    const fieldDefaults = { ...template };
    delete fieldDefaults.id;
    delete fieldDefaults.date;
    delete fieldDefaults.time;
    list.push(freshEntry(fieldDefaults, sheetDateYmd));
    next[blockKey] = list;
    changed = true;
  });
  return changed ? next : entries;
}

function countProgress(entries) {
  let total = 0;
  let done = 0;
  const bySection = {
    cardiovascular: { done: 0, total: 0 },
    respiratory: { done: 0, total: 0 },
    metabolic: { done: 0, total: 0 },
    gastrointestinal: { done: 0, total: 0 },
    neurological: { done: 0, total: 0 },
    hematology: { done: 0, total: 0 },
  };
  const byBlock = {};
  Object.keys(BLOCK_TO_SECTION).forEach(b => { byBlock[b] = { done: 0, total: 0 }; });

  const bump = (section, block, ok) => {
    total += 1;
    bySection[section].total += 1;
    byBlock[block].total += 1;
    if (ok) { done += 1; bySection[section].done += 1; byBlock[block].done += 1; }
  };

  Object.entries(entries).forEach(([block, list]) => {
    const section = BLOCK_TO_SECTION[block];
    const arr = list || [];
    arr.forEach((entry, idx) => {
      // The last entry in a block is always kept as an open "new reading"
      // placeholder (see openBlock/emptyEntries) — while it's still blank it
      // isn't a pending field to fill, it's just waiting room, so it must not
      // drag the completion badge down.
      if (idx === arr.length - 1 && !hasEntryData(entry)) return;
      Object.entries(entry).forEach(([k, v]) => {
        if (k === "id") return;
        // date/time are auto-stamped to "now" on every new entry (see freshEntry) —
        // they are bookkeeping metadata, not a clinical answer, so they must not
        // count toward "filled" progress.
        if (k === "date" || k === "time") return;
        // slot_time is a Scheduled Flowsheet's slot bookkeeping tag (which
        // scheduled slot this real entry was recorded against) — not a
        // clinical answer.
        if (k === "slot_time") return;
        // Conditional slots
        if (block === "gi_a" && (k === "milk_type" || k === "volume_ml") && entry.status !== "EF") return;
        if (k === "steroid_other" && !(entry.postnatal_steroids || []).includes("Other")) return;
        if ((k === "vasoactive_dose" || k === "vasoactive_unit") && !(entry.vasoactive_drugs || []).length) return;
        if (k === "prbc_volume" && !(entry.transfusion_products || []).includes("PRBC")) return;
        bump(section, block, ans(v));
      });
    });
  });

  return {
    done,
    total,
    pct: total ? Math.round((done / total) * 100) : 0,
    bySection,
    byBlock,
    canSubmit: ans(entries.cv_a?.[0]?.date),
  };
}

/* ── Presentational primitives ── */

function MetricCard({ label, value, tone = "blue" }) {
  return (
    <div className={`rcn-pcard rcn-pcard--${tone}`}>
      <span className="rcn-pcard-icon"><Heart size={16} /></span>
      <div className="rcn-pcard-body">
        <span className="rcn-pcard-label">{label}</span>
        <span className="rcn-pcard-value">{value || "-"}</span>
      </div>
    </div>
  );
}

const MML_DATE_STAMP_HINT =
  "Must be on or before the active sheet date — cannot be in the future";
const MML_TIME_STAMP_HINT =
  "Cannot be later than the current time on the selected date";

/** Info icon + popover for field validation rules (hover, tap, keyboard). */
function FieldValidationInfo({ hint }) {
  const [open, setOpen] = useState(false);
  const pinnedRef = useRef(false);
  const rootRef = useRef(null);
  const tooltipId = useId();

  const close = useCallback(() => {
    pinnedRef.current = false;
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        close();
      }
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown, { passive: true });
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  if (!hint) return null;

  return (
    <span className="mml-field-info" ref={rootRef}>
      <button
        type="button"
        className="mml-field-info-btn"
        aria-label="Field validation info"
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (open) {
            close();
          } else {
            pinnedRef.current = true;
            setOpen(true);
          }
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => {
          if (!pinnedRef.current) setOpen(false);
        }}
        onFocus={() => setOpen(true)}
        onBlur={(e) => {
          if (!rootRef.current?.contains(e.relatedTarget)) {
            close();
          }
        }}
      >
        <Info size={13} strokeWidth={2.25} aria-hidden="true" />
      </button>
      {open && (
        <div className="mml-field-info-popover" role="tooltip" id={tooltipId}>
          {hint}
        </div>
      )}
    </span>
  );
}

function Item({ n, label, sub, error, children, wide, hint }) {
  return (
    <div className={`rcn-field-group${wide ? " mml-item-wide" : ""}`}>
      <div className="rcn-field-label-row mml-field-label-row">
        <span className="rcn-field-label rcn-field-label--exact-case mml-field-label-text">
          {n != null && <span className="mml-item-num">{n}.</span>} {label}
          {sub && <span className="rcn-field-sub">{sub}</span>}
        </span>
        <FieldValidationInfo hint={hint} />
      </div>
      {children}
      {error && <span className="rcn-field-error">{error}</span>}
    </div>
  );
}

function Num({ value, onChange, disabled, unit, placeholder = "0", step, error }) {
  return (
    <div className={`rcn-num-input${error ? " rcn-num-input--error" : ""}`}>
      <input type="number" value={value ?? ""} placeholder={placeholder} step={step}
        disabled={disabled} onChange={e => onChange(e.target.value)} />
      {unit && <span className="rcn-num-unit">{unit}</span>}
    </div>
  );
}

function Txt({ value, onChange, disabled, placeholder, type = "text", error }) {
  return (
    <input type={type} className={`rcn-text-input${error ? " rcn-text-input--error" : ""}`}
      value={value ?? ""} placeholder={placeholder} disabled={disabled}
      onChange={e => onChange(e.target.value)} />
  );
}

function AmPmTimeInput({ value, onChange, disabled, ariaLabel, placeholder = "— : —", max }) {
  const ref = useRef(null);
  const label = value ? formatTimeAmPm(value) : "";
  const open = () => { if (!disabled) openNativeDatePicker(ref.current); };
  return (
    <div
      className={`mml-ampm-time${value ? "" : " mml-ampm-time--empty"}${disabled ? " mml-ampm-time--disabled" : ""}`}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      onClick={open}
      onKeyDown={e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
    >
      <Clock size={14} strokeWidth={2.2} />
      <span>{label || placeholder}</span>
      <input
        ref={ref}
        type="time"
        value={value || ""}
        max={max || undefined}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        className="mml-ampm-time-native"
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}

function TimeRangePicker({ value, onChange, disabled, dateYmd }) {
  const { from, to } = parseTimeRange(value);
  const timeMax = mmlMaxAllowedTimeForSheetDate(dateYmd);
  const setPart = (which, next) => {
    const clamped = mmlClampTimeForSheetDate(dateYmd, next);
    onChange(which === "from" ? joinTimeRange(clamped, to) : joinTimeRange(from, clamped));
  };
  return (
    <div className="mml-time-range">
      <div className="mml-time-range-slot">
        <span className="mml-time-range-label">From</span>
        <AmPmTimeInput
          value={from}
          onChange={v => setPart("from", v)}
          disabled={disabled}
          ariaLabel="From time"
          placeholder="From"
          max={timeMax}
        />
      </div>
      <span className="mml-time-range-sep" aria-hidden="true">to</span>
      <div className="mml-time-range-slot">
        <span className="mml-time-range-label">To</span>
        <AmPmTimeInput
          value={to}
          onChange={v => setPart("to", v)}
          disabled={disabled}
          ariaLabel="To time"
          placeholder="To"
          max={timeMax}
        />
      </div>
    </div>
  );
}

function PillMulti({ options, value = [], onChange, disabled }) {
  const toggle = opt => {
    if (disabled) return;
    onChange(value.includes(opt) ? value.filter(v => v !== opt) : [...value, opt]);
  };
  return (
    <div className="rcn-pills">
      {options.map(opt => (
        <button key={opt} type="button" className={`rcn-pill${value.includes(opt) ? " rcn-pill--on" : ""}`}
          onClick={() => toggle(opt)} disabled={disabled}>{opt}</button>
      ))}
    </div>
  );
}

function PillSingle({ options, value, onChange, disabled }) {
  return (
    <div className="rcn-pills mml-pills-compact">
      {options.map(opt => (
        <button key={opt} type="button" className={`rcn-pill${value === opt ? " rcn-pill--on" : ""}`}
          onClick={() => !disabled && onChange(value === opt ? "" : opt)} disabled={disabled}>{opt}</button>
      ))}
    </div>
  );
}

function respAMapCpapCellValue(entry, which) {
  const modes = Array.isArray(entry?.respiratory_modes)
    ? entry.respiratory_modes
    : stringToList(entry?.respiratory_modes);
  const mode = getMapCpapMode(modes);
  if (which === "cpap") {
    if (mode === "BOTH") return entry?.max_map_cpap_secondary;
    if (mode === "CPAP") return entry?.max_map_cpap;
    return null;
  }
  if (mode === "BOTH" || mode === "MAP") return entry?.max_map_cpap;
  return null;
}

function RespAMapCpapFields({ entry, disabled, fieldErr, onChangeField }) {
  const modes = entry.respiratory_modes || [];
  const mapCpapMode = getMapCpapMode(modes);
  const isNA = mapCpapMode === "NA";
  const isBoth = mapCpapMode === "BOTH";
  const singleLabel = mapCpapMode === "CPAP"
    ? "Max CPAP of the hour"
    : mapCpapMode === "MAP"
      ? "Max MAP of the hour"
      : "Max MAP/CPAP of the hour";
  const primaryValidateMode = isBoth ? "MAP" : (mapCpapMode || "MAP");
  const mapErr = fieldErr("max_map_cpap") || validateMapCpap(entry.max_map_cpap, primaryValidateMode);
  const cpapErr = isBoth
    ? (fieldErr("max_map_cpap_secondary") || validateMapCpap(entry.max_map_cpap_secondary, "CPAP"))
    : null;

  if (isNA) {
    return (
      <Item n={3} label="Max MAP/CPAP of the hour">
        <div className="rcn-num-input rcn-num-input--na">
          <span className="rcn-na-value">NA</span>
          <span className="rcn-num-unit">mode doesn&apos;t generate pressure</span>
        </div>
      </Item>
    );
  }

  if (isBoth) {
    return (
      <>
        <Item n={3} label="Max CPAP of the hour" error={cpapErr}>
          <Num
            value={entry.max_map_cpap_secondary}
            onChange={v => onChangeField("max_map_cpap_secondary", v)}
            disabled={disabled}
            unit="cm H₂O"
            error={cpapErr}
          />
        </Item>
        <Item n="3b" label="Max MAP of the hour" error={mapErr}>
          <Num
            value={entry.max_map_cpap}
            onChange={v => onChangeField("max_map_cpap", v)}
            disabled={disabled}
            unit="cm H₂O"
            error={mapErr}
          />
        </Item>
      </>
    );
  }

  return (
    <Item n={3} label={singleLabel} error={mapErr}>
      <Num
        value={entry.max_map_cpap}
        onChange={v => onChangeField("max_map_cpap", v)}
        disabled={disabled}
        unit="cm H₂O"
        error={mapErr}
      />
    </Item>
  );
}

/** Column metadata for every lettered field block — drives the read-only
 *  "previously added" summary table under each field's blank entry form.
 *  Keys match the entry object keys used throughout renderBlockBody. */
const BLOCK_FIELDS = {
  cv_a: [
    { key: "axillary_temp", label: "Skin/Axillary Temp", unit: "°C" },
    { key: "sbp", label: "SBP", unit: "mm Hg" },
    { key: "dbp", label: "DBP", unit: "mm Hg" },
    { key: "map_value", label: "MAP", unit: "mm Hg" },
  ],
  cv_b: [
    { key: "fluid_bolus_given", label: "Fluid Bolus" },
  ],
  cv_c: [
    { key: "vasoactive_drugs", label: "Vasoactive", list: true },
    { key: "vasoactive_dose", label: "Dose" },
    { key: "vasoactive_unit", label: "Unit" },
  ],
  cv_d: [
    { key: "pda_agent", label: "PDA Agent", list: true },
    { key: "pda_dose", label: "Dose", unit: "mg/kg" },
  ],
  resp_a: [
    { key: "time_range", label: "Time" },
    { key: "respiratory_modes", label: "Mode", list: true },
    { key: "max_map_cpap", label: "Max MAP/CPAP", unit: "cm H₂O" },
    { key: "max_fio2", label: "Max FiO₂", unit: "%" },
  ],
  resp_b: [
    { key: "ph", label: "pH" },
    { key: "pao2", label: "PaO₂", unit: "mm Hg" },
    { key: "paco2", label: "PaCO₂", unit: "mm Hg" },
  ],
  resp_c: [
    { key: "apnea_episodes", label: "Apnea eps." },
    { key: "desaturation_episodes", label: "Desat eps." },
    { key: "severe_desaturation_episodes", label: "Sev. desat eps." },
  ],
  resp_d: [
    { key: "postnatal_steroids", label: "Steroids", list: true },
    { key: "steroid_dose", label: "Dose", unit: "mg/kg" },
    { key: "steroid_other", label: "Other" },
  ],
  met_a: [
    { key: "glucose", label: "Glucose", unit: "mg/dL" },
  ],
  met_b: [
    { key: "alp", label: "ALP", unit: "IU/L" },
    { key: "total_calcium", label: "Total Ca", unit: "mg/dL" },
    { key: "phosphorus", label: "Phosphorus", unit: "mg/dL" },
  ],
  gi_a: [
    { key: "cumulative_feed_volume", label: "Cum. Feed Vol.", unit: "ml" },
  ],
  gi_b: [
    { key: "direct_bilirubin", label: "Direct Bilirubin", unit: "mg/dL" },
  ],
  neuro_a: [
    { key: "ventriculomegaly_severity", label: "Severity" },
    { key: "vi", label: "VI", unit: "mm" },
    { key: "ahw", label: "AHW", unit: "mm" },
  ],
  neuro_b: [
    { key: "tod", label: "TOD", unit: "mm" },
    { key: "aca_ri", label: "ACA RI" },
    { key: "mca_ri", label: "MCA RI" },
  ],
  heme_a: [
    { key: "transfusion_products", label: "Products", list: true },
    { key: "transfusion_count", label: "No. of Transfusions" },
    { key: "prbc_volume", label: "PRBC Volume", unit: "ml/kg" },
  ],
};

/** Columns shown in the live summary table (form may have more fields). */
function tableFieldsForBlock(blockKey) {
  if (blockKey === "resp_a") {
    return [
      { key: "time_range", label: "Time" },
      { key: "respiratory_modes", label: "Respiratory support", list: true },
      { key: "max_cpap_display", label: "Max CPAP", unit: "cm H₂O", respPressure: "cpap" },
      { key: "max_map_display", label: "Max MAP", unit: "cm H₂O", respPressure: "map" },
      { key: "max_fio2", label: "Max FiO₂", unit: "%" },
    ];
  }
  return BLOCK_FIELDS[blockKey] || [];
}

/** Renders one summary-table cell for a field, using its column metadata. */
function formatCell(field, entry) {
  if (field.respPressure) {
    const v = respAMapCpapCellValue(entry, field.respPressure);
    if (!ans(v)) return "—";
    return field.unit ? `${v} ${field.unit}` : String(v);
  }
  const v = entry ? entry[field.key] : undefined;
  if (field.key === "time_range") {
    return formatTimeRangeAmPm(v) || "—";
  }
  if (field.bool) {
    if (v === true) return "Yes";
    if (v === false) return "No";
    return "—";
  }
  if (field.list) {
    const arr = Array.isArray(v) ? v : stringToList(v);
    return arr.length ? arr.join(", ") : "—";
  }
  if (!ans(v)) return "—";
  return field.unit ? `${v} ${field.unit}` : String(v);
}

/** One lettered CRF block (5.x.Y): a single blank "new reading" form (date/time
 *  auto-filled to now) on top, and a read-only summary table of every reading
 *  already added for this field underneath. Used inside the single-field
 *  detail screen (e.g. Metabolic → Glucose). */
function blockProgressForPicker(blockKey, counts) {
  if (blockKey === "neuro_combined") {
    const a = counts.byBlock.neuro_a || { done: 0, total: 0 };
    const b = counts.byBlock.neuro_b || { done: 0, total: 0 };
    return { done: a.done + b.done, total: a.total + b.total };
  }
  return counts.byBlock[blockKey] || { done: 0, total: 0 };
}

function hhmmToMinutes(hhmm) {
  const m = String(hhmm || "").match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const mins = Number(m[1]) * 60 + Number(m[2]);
  return Number.isFinite(mins) ? mins : null;
}

function minutesToHHmm(mins) {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return formatTimeAmPm(`${pad2(h)}:${pad2(m)}`);
}

/** A reading's position on the 24h coverage strip — a single point for most
 *  blocks (stamped `time`), or a span for resp_a's "From–To" time range. */
function coverageSpanForEntry(entry, blockKey) {
  if (blockKey === "resp_a") {
    const { from, to } = parseTimeRange(entry.time_range);
    const fromMin = hhmmToMinutes(from);
    if (fromMin == null) return null;
    return { from: fromMin, to: hhmmToMinutes(to) };
  }
  const t = hhmmToMinutes(entry.time);
  if (t == null) return null;
  return { from: t, to: null };
}

const COVERAGE_HOUR_MARKS = [0, 4, 8, 12, 16, 20, 24];

/** Horizontal 24h strip marking WHEN today's saved readings landed, so a gap
 *  is obvious at a glance without implying every hour needs an entry — DMS
 *  is event-driven ("jot spot values as they occur"), not a fixed schedule,
 *  so this is a coverage reference, not a must-fill grid. */
function CoverageTimeline({ tableRows, blockKey }) {
  const spans = tableRows
    .map(({ entry, idx }) => ({ idx, ...coverageSpanForEntry(entry, blockKey) }))
    .filter(s => s.from != null);

  if (!spans.length) {
    return (
      <div className="mml-coverage">
        <div className="mml-coverage-empty">No readings logged yet today</div>
      </div>
    );
  }

  return (
    <div className="mml-coverage">
      <div className="mml-coverage-track">
        {spans.map(s => {
          const leftPct = (s.from / 1440) * 100;
          if (s.to != null && s.to > s.from) {
            const widthPct = ((s.to - s.from) / 1440) * 100;
            return (
              <div key={s.idx} className="mml-coverage-range"
                style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                title={`${minutesToHHmm(s.from)} – ${minutesToHHmm(s.to)}`} />
            );
          }
          return (
            <div key={s.idx} className="mml-coverage-dot"
              style={{ left: `${leftPct}%` }}
              title={minutesToHHmm(s.from)} />
          );
        })}
      </div>
      <div className="mml-coverage-hours">
        {COVERAGE_HOUR_MARKS.map(h => (
          <span key={h} className="mml-coverage-hour-label" style={{ left: `${(h / 24) * 100}%` }}>
            {pad2(h % 24)}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Scheduled Flowsheet infrastructure (5.1.A Vitals, 5.3.A Glucose,
   5.4.A GI Feed Volume) ──────────────────────────────────────────────────
   Unlike an event-driven DMS block (log a reading whenever one occurs,
   visualized with CoverageTimeline above), these three are SCHEDULED,
   recurring activities — reconstructing a 12x-a-day record via "log
   another reading" with no sense of the day's coverage is genuinely
   painful. Each instead generates rows from a chosen cadence (1/2/3-
   hourly) and only asks the nurse to fill in that slot's value(s). Real
   entries are still a plain array like every other block — a frequency
   change never touches or merges stored entries, it only changes which
   "expected slot" placeholders get generated/flagged around them, so
   nothing already logged can be lost or silently reassigned by toggling
   the cadence. GI Feed Volume needs EF/NPO status + milk type branching
   (GiFeedFlowsheet, below); Glucose/Vitals are plain numeric-column
   readings (the generic ScheduledFlowsheet, further below) — both share
   the same expectedSlots/buildFlowsheetRows row-building. */

const GI_MILK_TYPES = ["FM", "EBM", "PDHM"];

function minutesTo24h(mins) {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${pad2(h)}:${pad2(m)}`;
}

/** 24h "HH:MM" slot start times for a given hourly cadence. */
function expectedSlots(frequencyHours) {
  const stepMin = Math.max(1, Number(frequencyHours) || 2) * 60;
  const slots = [];
  for (let m = 0; m < 24 * 60; m += stepMin) slots.push(minutesTo24h(m));
  return slots;
}

/** Full displayed row list: every entry currently in state (including one
 *  just added blank via "tap to add" — it must render as an editable row
 *  immediately, not disappear until filled; hasEntryData only matters for
 *  what counts as "real" for progress/summary/persistence, never for
 *  whether a row is shown) matched to its scheduled slot, blank "missing"
 *  placeholders for past/current slots with nothing logged yet, greyed
 *  "upcoming" placeholders for future slots on today's sheet (never
 *  flagged as missing — it hasn't happened yet), and any entry whose
 *  slot_time doesn't match the current frequency's own boundaries (e.g. left
 *  over from a since-changed cadence) shown as its own row rather than
 *  dropped. */
function buildFlowsheetRows(entries, frequencyHours, isToday, nowMinutes) {
  const real = entries || [];
  const slots = expectedSlots(frequencyHours);
  const bySlot = new Map();
  const orphans = [];
  for (const e of real) {
    if (slots.includes(e.slot_time)) {
      if (!bySlot.has(e.slot_time)) bySlot.set(e.slot_time, []);
      bySlot.get(e.slot_time).push(e);
    } else {
      orphans.push(e);
    }
  }
  const rows = [];
  for (const slot of slots) {
    const matched = bySlot.get(slot);
    if (matched && matched.length) {
      matched.forEach(e => rows.push({ kind: "filled", slot, entry: e }));
    } else {
      const slotMin = hhmmToMinutes(slot);
      const isFuture = isToday && slotMin != null && slotMin > nowMinutes;
      rows.push({ kind: isFuture ? "upcoming" : "missing", slot });
    }
  }
  orphans.forEach(e => rows.push({ kind: "filled", slot: e.slot_time || "", entry: e, orphan: true }));
  rows.sort((a, b) => {
    const am = hhmmToMinutes(a.entry ? a.entry.time : a.slot) ?? 0;
    const bm = hhmmToMinutes(b.entry ? b.entry.time : b.slot) ?? 0;
    return am - bm;
  });
  return rows;
}

/** Day totals — NPO/EF hours only ever come from EXPLICITLY marked rows.
 *  A blank/missing slot contributes to neither pool: unlogged is not
 *  evidence of fasting, matching the same never-invent-data-for-gaps rule
 *  used for the FiO2 AUC prefill. */
function computeGiSummary(entries, frequencyHours) {
  const real = (entries || []).filter(hasEntryData);
  const byType = { FM: 0, EBM: 0, PDHM: 0 };
  let totalVolume = 0;
  let efCount = 0;
  let npoCount = 0;
  for (const e of real) {
    if (e.status === "EF") {
      efCount += 1;
      const v = Number(e.volume_ml) || 0;
      totalVolume += v;
      if (e.milk_type && byType[e.milk_type] != null) byType[e.milk_type] += v;
    } else if (e.status === "NPO") {
      npoCount += 1;
    }
  }
  const freq = Math.max(1, Number(frequencyHours) || 2);
  return {
    totalVolume,
    byType,
    efHours: efCount * freq,
    npoHours: npoCount * freq,
  };
}

function GiFeedFlowsheet({
  entries, frequencyHours, onChangeFrequency, onChangeField, onAdd, onRemove,
  disabled, sheetDate, errors,
}) {
  const isToday = sheetDate === realCalendarDateYmd();
  const nowMinutes = (() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  })();
  const rows = buildFlowsheetRows(entries, frequencyHours, isToday, nowMinutes);
  const summary = computeGiSummary(entries, frequencyHours);
  const timeMax = mmlMaxAllowedTimeForSheetDate(sheetDate);

  return (
    <div className="mml-flowsheet">
      <div className="mml-flowsheet-freq-row">
        <span className="mml-flowsheet-freq-label">Log every</span>
        <div className="mml-flowsheet-freq-pills">
          {[1, 2, 3].map(h => (
            <button key={h} type="button"
              className={`mml-flowsheet-freq-btn${Number(frequencyHours) === h ? " mml-flowsheet-freq-btn--on" : ""}`}
              onClick={() => !disabled && onChangeFrequency(h)}
              disabled={disabled}>{h}h</button>
          ))}
        </div>
        <span className="mml-flowsheet-freq-note">{expectedSlots(frequencyHours).length} rows / 24h</span>
      </div>

      <div className="mml-flowsheet-table-wrap">
        <table className="mml-flowsheet-table">
          <thead>
            <tr>
              <th>Sched.</th>
              <th>Actual</th>
              <th>Status</th>
              <th>Type</th>
              <th>Vol&nbsp;(ml)</th>
              <th aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              if (row.kind === "upcoming") {
                return (
                  <tr key={`up-${row.slot}-${i}`} className="mml-flowsheet-row mml-flowsheet-row--upcoming">
                    <td className="mml-flowsheet-slot">{formatTimeAmPm(row.slot)}</td>
                    <td colSpan={4} className="mml-flowsheet-placeholder-label">Upcoming</td>
                    <td />
                  </tr>
                );
              }
              if (row.kind === "missing") {
                return (
                  <tr key={`miss-${row.slot}-${i}`}
                    className={`mml-flowsheet-row mml-flowsheet-row--missing${disabled ? "" : " mml-flowsheet-row--clickable"}`}
                    onClick={() => !disabled && onAdd(row.slot)}>
                    <td className="mml-flowsheet-slot">{formatTimeAmPm(row.slot)}</td>
                    <td colSpan={4} className="mml-flowsheet-placeholder-label">
                      {disabled ? "Not logged" : "Not logged — tap to add"}
                    </td>
                    <td />
                  </tr>
                );
              }
              const e = row.entry;
              const isEF = e.status === "EF";
              const err = errors[`gi_a.${e.id}.volume_ml`] || errors[`gi_a.${e.id}.milk_type`];
              return (
                <tr key={e.id}
                  className={`mml-flowsheet-row${err ? " mml-flowsheet-row--error" : ""}`}
                  title={row.orphan ? "Doesn't match the current frequency's slots — kept as its own reading" : undefined}>
                  <td className="mml-flowsheet-slot">{row.slot ? formatTimeAmPm(row.slot) : "—"}</td>
                  <td>
                    <input type="time" className="mml-flowsheet-time-input" value={e.time || ""}
                      max={timeMax} disabled={disabled}
                      onChange={ev => onChangeField(e.id, "time", mmlClampTimeForSheetDate(sheetDate, ev.target.value))} />
                  </td>
                  <td>
                    <div className="mml-gi-status-toggle">
                      <button type="button"
                        className={`mml-gi-status-btn${e.status === "EF" ? " mml-gi-status-btn--ef" : ""}`}
                        onClick={() => !disabled && onChangeField(e.id, "status", "EF")}
                        disabled={disabled}>EF</button>
                      <button type="button"
                        className={`mml-gi-status-btn${e.status === "NPO" ? " mml-gi-status-btn--npo" : ""}`}
                        onClick={() => !disabled && onChangeField(e.id, "status", "NPO")}
                        disabled={disabled}>NPO</button>
                    </div>
                  </td>
                  <td>
                    {isEF ? (
                      <select className="mml-gi-select" value={e.milk_type || ""} disabled={disabled}
                        onChange={ev => onChangeField(e.id, "milk_type", ev.target.value)}>
                        <option value="">—</option>
                        {GI_MILK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    ) : <span className="mml-flowsheet-dash">—</span>}
                  </td>
                  <td>
                    {isEF ? (
                      <input type="number" min="0" className="mml-flowsheet-num-input" value={e.volume_ml || ""}
                        disabled={disabled}
                        onChange={ev => onChangeField(e.id, "volume_ml", ev.target.value)} />
                    ) : <span className="mml-flowsheet-dash">—</span>}
                  </td>
                  <td className="mml-flowsheet-row-action">
                    {!disabled && (
                      <button type="button" className="mml-flowsheet-remove-btn" title="Remove this reading"
                        onClick={() => onRemove(e.id)}>
                        <Trash2 size={11} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mml-flowsheet-summary">
        <div className="mml-flowsheet-summary-item">
          <span className="mml-flowsheet-summary-label">Total EF Vol.</span>
          <span className="mml-flowsheet-summary-value">{summary.totalVolume || 0} ml</span>
        </div>
        {GI_MILK_TYPES.filter(t => summary.byType[t] > 0).map(t => (
          <div className="mml-flowsheet-summary-item" key={t}>
            <span className="mml-flowsheet-summary-label">{t}</span>
            <span className="mml-flowsheet-summary-value">{summary.byType[t]} ml</span>
          </div>
        ))}
        <div className="mml-flowsheet-summary-item">
          <span className="mml-flowsheet-summary-label">EF Hours</span>
          <span className="mml-flowsheet-summary-value">{summary.efHours}h</span>
        </div>
        <div className="mml-flowsheet-summary-item">
          <span className="mml-flowsheet-summary-label">NPO Hours</span>
          <span className="mml-flowsheet-summary-value">{summary.npoHours}h</span>
        </div>
      </div>
      <p className="mml-flowsheet-legend">FM = Formula Milk · EBM = Expressed Breast Milk · PDHM = Pasteurized Donor Human Milk</p>
    </div>
  );
}

/* ── Generic numeric-column Scheduled Flowsheet (Glucose 5.3.A, Vitals
   5.1.A) — the same cadence-driven row/slot infrastructure as the GI Feed
   Flowsheet above, but for blocks that are plain repeated-measurement
   readings with no EF/NPO-style branching: just one or more numeric
   columns filled in per scheduled slot. */

const MET_A_COLUMNS = [
  { key: "glucose", label: "Glucose", unit: "mg/dL" },
];

const CV_A_COLUMNS = [
  { key: "axillary_temp", label: "Skin/Axillary Temp", unit: "°C" },
  { key: "sbp", label: "SBP", unit: "mm Hg" },
  { key: "dbp", label: "DBP", unit: "mm Hg" },
  { key: "map_value", label: "MAP", unit: "mm Hg" },
];

/** Min/max per numeric column across the day's real entries — a blank slot
 *  contributes to neither bound, same never-invent-data-for-gaps rule as
 *  every other DMS aggregate this session. */
function computeMinMaxSummary(entries, columns) {
  const real = (entries || []).filter(hasEntryData);
  const out = {};
  columns.forEach(col => {
    // A vitals-style row can fill only SOME of its columns — must check
    // ans() first, since Number("") is 0 (finite), which would otherwise
    // count an unfilled column as a genuine "0" reading.
    const vals = real
      .filter(e => ans(e[col.key]))
      .map(e => Number(e[col.key]))
      .filter(v => Number.isFinite(v));
    out[col.key] = {
      min: vals.length ? Math.min(...vals) : null,
      max: vals.length ? Math.max(...vals) : null,
      count: vals.length,
    };
  });
  return out;
}

function ScheduledFlowsheet({
  blockKey, columns, entries, frequencyHours, onChangeFrequency, onChangeField, onAdd, onRemove,
  disabled, sheetDate, errors,
}) {
  const isToday = sheetDate === realCalendarDateYmd();
  const nowMinutes = (() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  })();
  const rows = buildFlowsheetRows(entries, frequencyHours, isToday, nowMinutes);
  const summary = computeMinMaxSummary(entries, columns);
  const timeMax = mmlMaxAllowedTimeForSheetDate(sheetDate);

  return (
    <div className="mml-flowsheet">
      <div className="mml-flowsheet-freq-row">
        <span className="mml-flowsheet-freq-label">Log every</span>
        <div className="mml-flowsheet-freq-pills">
          {[1, 2, 3].map(h => (
            <button key={h} type="button"
              className={`mml-flowsheet-freq-btn${Number(frequencyHours) === h ? " mml-flowsheet-freq-btn--on" : ""}`}
              onClick={() => !disabled && onChangeFrequency(h)}
              disabled={disabled}>{h}h</button>
          ))}
        </div>
        <span className="mml-flowsheet-freq-note">{expectedSlots(frequencyHours).length} rows / 24h</span>
      </div>

      <div className="mml-flowsheet-table-wrap">
        <table className="mml-flowsheet-table">
          <thead>
            <tr>
              <th>Sched.</th>
              <th>Actual</th>
              {columns.map(col => (
                <th key={col.key}>{col.label}{col.unit ? ` (${col.unit})` : ""}</th>
              ))}
              <th aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              if (row.kind === "upcoming") {
                return (
                  <tr key={`up-${row.slot}-${i}`} className="mml-flowsheet-row mml-flowsheet-row--upcoming">
                    <td className="mml-flowsheet-slot">{formatTimeAmPm(row.slot)}</td>
                    <td colSpan={columns.length + 1} className="mml-flowsheet-placeholder-label">Upcoming</td>
                    <td />
                  </tr>
                );
              }
              if (row.kind === "missing") {
                return (
                  <tr key={`miss-${row.slot}-${i}`}
                    className={`mml-flowsheet-row mml-flowsheet-row--missing${disabled ? "" : " mml-flowsheet-row--clickable"}`}
                    onClick={() => !disabled && onAdd(row.slot)}>
                    <td className="mml-flowsheet-slot">{formatTimeAmPm(row.slot)}</td>
                    <td colSpan={columns.length + 1} className="mml-flowsheet-placeholder-label">
                      {disabled ? "Not logged" : "Not logged — tap to add"}
                    </td>
                    <td />
                  </tr>
                );
              }
              const e = row.entry;
              const err = columns.some(col => errors[`${blockKey}.${e.id}.${col.key}`]);
              return (
                <tr key={e.id}
                  className={`mml-flowsheet-row${err ? " mml-flowsheet-row--error" : ""}`}
                  title={row.orphan ? "Doesn't match the current frequency's slots — kept as its own reading" : undefined}>
                  <td className="mml-flowsheet-slot">{row.slot ? formatTimeAmPm(row.slot) : "—"}</td>
                  <td>
                    <input type="time" className="mml-flowsheet-time-input" value={e.time || ""}
                      max={timeMax} disabled={disabled}
                      onChange={ev => onChangeField(e.id, "time", mmlClampTimeForSheetDate(sheetDate, ev.target.value))} />
                  </td>
                  {columns.map(col => (
                    <td key={col.key}>
                      <input type="number" step="any" className="mml-flowsheet-num-input"
                        value={e[col.key] ?? ""} disabled={disabled}
                        onChange={ev => onChangeField(e.id, col.key, ev.target.value)} />
                    </td>
                  ))}
                  <td className="mml-flowsheet-row-action">
                    {!disabled && (
                      <button type="button" className="mml-flowsheet-remove-btn" title="Remove this reading"
                        onClick={() => onRemove(e.id)}>
                        <Trash2 size={11} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mml-flowsheet-summary">
        {columns.map(col => {
          const s = summary[col.key];
          if (!s.count) return null;
          return (
            <React.Fragment key={col.key}>
              <div className="mml-flowsheet-summary-item">
                <span className="mml-flowsheet-summary-label">{col.label} Min</span>
                <span className="mml-flowsheet-summary-value">{s.min}{col.unit ? ` ${col.unit}` : ""}</span>
              </div>
              <div className="mml-flowsheet-summary-item">
                <span className="mml-flowsheet-summary-label">{col.label} Max</span>
                <span className="mml-flowsheet-summary-value">{s.max}{col.unit ? ` ${col.unit}` : ""}</span>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

function EntryBlock({
  blockKey, code, subsectionTitle, entries, onChangeEntry, onAdd, onRemove, disabled, blankFactory, children, fixedDate,
  errors = {},
}) {
  const fieldErr = (idx, key) => errors[`${blockKey}.${idx}.${key}`];
  const rowHasErr = (idx) =>
    fieldErr(idx, "date")
    || fieldErr(idx, "time")
    || fieldErr(idx, "time_range")
    || tableFieldsForBlock(blockKey).some(f => fieldErr(idx, f.key));
  const draftIdx = entries.length - 1;
  const draft = entries[draftIdx] || {};
  /** Saved readings only — the open draft appears after Save or "Log another reading". */
  const tableRows = entries
    .map((entry, idx) => ({ entry, idx, isDraft: false }))
    .filter(({ entry, idx }) => hasEntryData(entry) && idx !== draftIdx);
  const fieldsMeta = tableFieldsForBlock(blockKey);
  /** 5.2.A uses time range in the form; other blocks use stamp time here + in the table. */
  const hideStampTime = blockKey === "resp_a";
  const entryDate = fixedDate || draft.date || "";
  const maxSheetDate = realCalendarDateYmd();
  const stampTimeMax = mmlMaxAllowedTimeForSheetDate(entryDate);

  return (
    <div className="rcn-subsection mml-subblock">
      {(subsectionTitle || code) && (
        <div className="mml-subblock-head">
          {subsectionTitle ? (
            <span className="mml-subblock-subtitle">{subsectionTitle}</span>
          ) : (
            <span className="mml-subblock-code">{code}</span>
          )}
        </div>
      )}

      <div className="mml-entry mml-entry--draft">
        <div className="mml-entry-head">
          <div className="mml-entry-meta">
            <span className="mml-draft-badge">New reading</span>
            <label className="mml-meta-field">
              <span className="mml-meta-label">
                <span>Date</span>
                <FieldValidationInfo hint={MML_DATE_STAMP_HINT} />
              </span>
              <input
                type="date"
                className={`rcn-text-input mml-date-input${fieldErr(draftIdx, "date") ? " rcn-text-input--error" : ""}`}
                value={fixedDate || draft.date || ""}
                max={maxSheetDate}
                readOnly={!!fixedDate}
                disabled={disabled || !!fixedDate}
                aria-invalid={fieldErr(draftIdx, "date") ? "true" : undefined}
                onChange={e => {
                  if (fixedDate) return;
                  const v = e.target.value;
                  if (v && v > maxSheetDate) return;
                  onChangeEntry(draftIdx, "date", v);
                }}
                />
              {fieldErr(draftIdx, "date") && (
                <span className="rcn-field-error">{fieldErr(draftIdx, "date")}</span>
              )}
            </label>
            {!hideStampTime && (
              <label className="mml-meta-field">
                <span className="mml-meta-label">
                  <span>Time</span>
                  <FieldValidationInfo hint={MML_TIME_STAMP_HINT} />
                </span>
                <input
                  type="time"
                  className={`rcn-text-input mml-time-input${fieldErr(draftIdx, "time") ? " rcn-text-input--error" : ""}`}
                  value={draft.time || ""}
                  max={stampTimeMax}
                  disabled={disabled}
                  aria-invalid={fieldErr(draftIdx, "time") ? "true" : undefined}
                  onChange={e => {
                    const v = mmlClampTimeForSheetDate(
                      entryDate,
                      e.target.value,
                    );
                    onChangeEntry(draftIdx, "time", v);
                  }}
                />
                {fieldErr(draftIdx, "time") && (
                  <span className="rcn-field-error">{fieldErr(draftIdx, "time")}</span>
                )}
              </label>
            )}
          </div>
          {!disabled && hasEntryData(draft) && (
            <button type="button" className="mml-add-btn"
              onClick={() => onAdd(blankFactory ? blankFactory() : freshEntry({}, fixedDate))}>
              <Plus size={14} /> Log another reading
            </button>
          )}
        </div>
        <div className="rcn-grid-3">{children(draft, draftIdx)}</div>
      </div>

      <div className="mml-coverage-section">
        <h4 className="mml-history-title">Coverage today</h4>
        <CoverageTimeline tableRows={tableRows} blockKey={blockKey} />
      </div>

      <div className="mml-history">
        <h4 className="mml-history-title">Readings ({tableRows.length})</h4>
        {tableRows.length === 0 ? (
          <p className="mml-history-empty">No entries yet for this field today.</p>
        ) : (
          <div className="mml-history-table-wrap">
            <table className="mml-history-table">
              <thead>
                <tr>
                  <th>Date</th>
                  {!hideStampTime && <th>Time</th>}
                  {fieldsMeta.map(f => <th key={f.key}>{f.label}</th>)}
                  {!disabled && <th className="mml-history-th-action" aria-hidden="true" />}
                </tr>
              </thead>
              <tbody>
                {tableRows.slice().reverse().map(({ entry, idx, isDraft }) => (
                  <tr
                    key={entry.id || idx}
                    className={[
                      isDraft ? "mml-history-row--draft" : "",
                      rowHasErr(idx) ? "mml-history-row--error" : "",
                    ].filter(Boolean).join(" ") || undefined}
                  >
                    <td>{entry.date ? formatDateToDDMMYYYY(entry.date) : "—"}</td>
                    {!hideStampTime && <td>{entry.time || "—"}</td>}
                    {fieldsMeta.map(f => {
                      const cellErr = fieldErr(idx, f.key);
                      return (
                        <td
                          key={f.key}
                          className={cellErr ? "mml-history-cell--warn" : undefined}
                          title={cellErr || undefined}
                        >
                          {formatCell(f, entry)}
                        </td>
                      );
                    })}
                    {!disabled && !isDraft && (
                      <td className="mml-history-td-action">
                        <button type="button" className="mml-history-remove-btn" title="Remove this reading"
                          onClick={() => onRemove(idx)}>
                          <Trash2 size={13} />
                        </button>
                      </td>
                    )}
                    {!disabled && isDraft && (
                      <td className="mml-history-td-action" aria-hidden="true" />
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Level 1: heading tiles (CVS, Respiratory, Metabolic, ...) ── */
function SectionsGrid({ counts, onOpen }) {
  return (
    <div className="mml-sections-grid">
      {SECTION_KEYS.map(key => {
        const meta = SECTION_META[key];
        const Icon = meta.icon;
        const prog = counts.bySection[key] || { done: 0, total: 0 };
        const pct = prog.total ? Math.round((prog.done / prog.total) * 100) : 0;
        const complete = prog.total > 0 && prog.done >= prog.total;
        return (
          <button type="button" key={key}
            className={`mml-section-tile${complete ? " mml-section-tile--done" : ""}`}
            onClick={() => onOpen(key)}>
            <div className="mml-section-tile-icon"><Icon size={22} /></div>
            <div className="mml-section-tile-body">
              <span className="mml-subblock-code mml-section-tile-code">{meta.code}</span>
              <h3 className="mml-section-tile-title">{meta.title}</h3>
              <div className="rcn-card-prog-bar mml-section-tile-bar">
                <div className="rcn-card-prog-fill" style={{ width: `${pct}%` }} />
              </div>
              <span className="mml-section-tile-count">{prog.done}/{prog.total} filled</span>
            </div>
            {complete ? <CheckCircle2 size={18} className="mml-section-tile-check" /> : <ChevronRight size={18} className="mml-section-tile-arrow" />}
          </button>
        );
      })}
    </div>
  );
}

/* ── Level 2: field/variable list within a chosen heading ── */
function FieldsList({ sectionKey, counts, onOpen, onBack }) {
  const meta = SECTION_META[sectionKey];
  const Icon = meta.icon;
  return (
    <div className="mml-fields-list">
      <button type="button" className="mml-back-btn" onClick={onBack}>
        <ArrowLeft size={14} /> All sections
      </button>
      <div className="mml-fields-list-title">
        <div className="mml-card-icon-wrap"><Icon size={18} /></div>
        <h2>{meta.code} {meta.title}</h2>
      </div>
      <p className="mml-fields-list-hint">Choose what you want to fill in right now.</p>
      <div className="mml-field-rows">
        {BLOCKS_BY_SECTION[sectionKey].map(blockKey => {
          const bMeta = BLOCK_META[blockKey];
          const prog = blockProgressForPicker(blockKey, counts);
          const complete = prog.total > 0 && prog.done >= prog.total;
          return (
            <button type="button" key={blockKey}
              className={`mml-field-row${complete ? " mml-field-row--done" : ""}`}
              onClick={() => onOpen(blockKey)}>
              <span className="mml-subblock-code">{bMeta.code}</span>
              <span className="mml-field-row-text">
                <span className="mml-field-row-label">{bMeta.label}</span>
                <span className="mml-field-row-desc">{bMeta.desc}</span>
              </span>
              <span className="mml-field-row-right">
                <span className="mml-quicknav-badge">{prog.done}/{prog.total}</span>
                <ChevronRight size={16} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════ */

export default function MinimalMonitoringLog() {
  const params = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { markFormCompleted, unmarkFormCompleted } = useFormProgress();
  const enrollmentId = params.enrollmentId || localStorage.getItem("current_enrollment_id") || "";

  const [entries, setEntries] = useState(emptyEntries);
  const [sheetDate, setSheetDate] = useState("");
  const [giFeedFrequencyHours, setGiFeedFrequencyHours] = useState(2);
  const [glucoseFrequencyHours, setGlucoseFrequencyHours] = useState(2);
  const [vitalsFrequencyHours, setVitalsFrequencyHours] = useState(2);
  const [patientInfo, setPatientInfo] = useState({ enrollmentId, motherName: "", babyUid: "", gestation: "" });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState({});
  const [saveTick, setSaveTick] = useState(0);
  const hydratedRef = useRef(false);
  const autosaveTimer = useRef(null);
  // Tracks whether the user has made a real edit since the last successful
  // save — used so navigating away or an incidental background save does not
  // get treated as "the user changed something".
  const dirtyRef = useRef(false);
  const entriesRef = useRef(entries);
  const sheetDateRef = useRef(sheetDate);
  entriesRef.current = entries;
  sheetDateRef.current = sheetDate;

  /* Drill-down navigation: sections → fields (within a section) → detail (a single field) */
  const [view, setView] = useState("sections"); // "sections" | "fields" | "detail"
  const [activeSection, setActiveSection] = useState(null);
  const [activeBlock, setActiveBlock] = useState(null);

  const openSection = (key) => { setActiveSection(key); setActiveBlock(null); setView("fields"); };
  const openBlock = (key) => {
    // Guarantee a blank "new reading" row is waiting at the end of this
    // field's array before showing it — if the last reading already has data
    // (e.g. it was filled in a previous visit today), start a fresh one so
    // the field always opens on a blank form with history below it.
    setEntries(prev => {
      const list = prev[key] || [];
      const last = list[list.length - 1];
      if (last && hasEntryData(last)) {
        const base = emptyEntries()[key][0];
        return {
          ...prev,
          [key]: [...list, { ...base, id: uid(), date: sheetDate, time: nowTime(new Date()) }],
        };
      }
      return prev;
    });
    setActiveBlock(key);
    setView("detail");
  };
  const backToSections = () => { setView("sections"); setActiveSection(null); setActiveBlock(null); };
  const backToFields = () => { setView("fields"); setActiveBlock(null); };

  const isEditable = true;
  const counts = useMemo(() => countProgress(entries), [entries]);
  const liveFieldWarnings = useMemo(
    () => buildRespBBloodGasWarnings(entries),
    [entries],
  );

  const setEntryField = (block, idx, key, value) => {
    setEntries(prev => {
      const list = [...(prev[block] || [])];
      let row = { ...list[idx], [key]: value };
      if (block === "resp_c") row = applyRespCEpisodeConstraints(row);
      list[idx] = row;
      return { ...prev, [block]: list };
    });
    setErrors(prev => ({ ...prev, [`${block}.${idx}.${key}`]: null }));
    setSaveTick((t) => t + 1);
    dirtyRef.current = true;
  };

  const addEntry = (block, blank) => {
    setEntries(prev => ({ ...prev, [block]: [...(prev[block] || []), blank] }));
    setSaveTick((t) => t + 1);
    dirtyRef.current = true;
  };

  const removeEntry = (block, idx) => {
    setEntries(prev => {
      const list = [...(prev[block] || [])];
      if (list.length <= 1) return prev;
      list.splice(idx, 1);
      return { ...prev, [block]: list };
    });
    setSaveTick((t) => t + 1);
    dirtyRef.current = true;
  };

  /* ── Scheduled-flowsheet mutation (gi_a, met_a, cv_a) — keyed by id, not
     index, since a flowsheet's row order is slot-computed (slot-sorted +
     placeholders), not raw array order. */
  const setFlowsheetEntryField = (block, id, key, value) => {
    setEntries(prev => ({
      ...prev,
      [block]: (prev[block] || []).map(e => {
        if (e.id !== id) return e;
        // gi_a-only: clearing to NPO also clears the now-hidden milk-type/
        // volume fields, so a stale value can't silently resurface if the
        // nurse flips back to EF later.
        if (block === "gi_a" && key === "status" && value !== "EF") {
          return { ...e, status: value, milk_type: "", volume_ml: "" };
        }
        return { ...e, [key]: value };
      }),
    }));
    setErrors(prev => ({ ...prev, [`${block}.${id}.${key}`]: null }));
    setSaveTick(t => t + 1);
    dirtyRef.current = true;
  };

  const addFlowsheetEntry = (block, slotTime, extraFields = {}) => {
    setEntries(prev => ({
      ...prev,
      [block]: [
        ...(prev[block] || []),
        freshEntry({ slot_time: slotTime, time: slotTime, ...extraFields }, sheetDate),
      ],
    }));
    setSaveTick(t => t + 1);
    dirtyRef.current = true;
  };

  const removeFlowsheetEntry = (block, id) => {
    setEntries(prev => ({ ...prev, [block]: (prev[block] || []).filter(e => e.id !== id) }));
    setSaveTick(t => t + 1);
    dirtyRef.current = true;
  };

  const changeGiFrequency = (hours) => {
    setGiFeedFrequencyHours(hours);
    setSaveTick(t => t + 1);
    dirtyRef.current = true;
  };

  const changeGlucoseFrequency = (hours) => {
    setGlucoseFrequencyHours(hours);
    setSaveTick(t => t + 1);
    dirtyRef.current = true;
  };

  const changeVitalsFrequency = (hours) => {
    setVitalsFrequencyHours(hours);
    setSaveTick(t => t + 1);
    dirtyRef.current = true;
  };

  useEffect(() => {
    if (!enrollmentId) return;
    const loadPatient = async () => {
      try {
        const birth = await api.get(`/birth-resuscitation/${enrollmentId}`);
        const b = birth?.data || {};
        setPatientInfo(prev => ({
          ...prev, enrollmentId,
          babyUid: b.baby_uid || "",
          gestation: formatGestation(b.gestation_weeks, b.gestation_days),
        }));
      } catch (_) {}
      try {
        const pii = await api.get(`/pii/enrollment/${enrollmentId}`);
        const p = pii?.data || {};
        setPatientInfo(prev => ({
          ...prev,
          motherName: `${p.mother_first_name || ""} ${p.mother_surname || ""}`.trim(),
        }));
      } catch (_) {}
    };
    loadPatient();
  }, [enrollmentId]);

  const sheetDateOptions = useMemo(() => mmlDropdownDateOptions(), []);

  const loadSheetForDate = async (ymd) => {
    if (!enrollmentId || !ymd) return;
    setLoading(true);
    setErrors({});
    hydratedRef.current = false;
    setSaveTick(0);
    try {
      const res = await api.get(`/minimal-monitoring/${enrollmentId}/on/${ymd}`);
      const data = res?.data || {};
      const recordDate = data.record_date || ymd;
      setSheetDate(recordDate);
      setEntries(ensureTrailingDraftRows(hydrateEntries(data), recordDate));
      setGiFeedFrequencyHours(data.gi_feed_frequency_hours || 2);
      setGlucoseFrequencyHours(data.glucose_frequency_hours || 2);
      setVitalsFrequencyHours(data.vitals_frequency_hours || 2);
      rememberMmlSheetDate(enrollmentId, recordDate);
      dirtyRef.current = false;
    } catch (_) {
      setSheetDate(ymd);
      setEntries(emptyEntries());
      setGiFeedFrequencyHours(2);
      setGlucoseFrequencyHours(2);
      setVitalsFrequencyHours(2);
      setMessage("Could not load sheet for this date. Please try again.");
    } finally {
      setLoading(false);
      requestAnimationFrame(() => { hydratedRef.current = true; });
    }
  };

  const requestSheetDateChange = async (nextYmd) => {
    if (!nextYmd || nextYmd === sheetDate) return;
    if (dirtyRef.current) {
      const ok = window.confirm(
        "You have unsaved changes on this date. Switch anyway? Unsaved edits will be lost.",
      );
      if (!ok) return;
    }
    setMessage("");
    rememberMmlSheetDate(enrollmentId, nextYmd);
    await loadSheetForDate(nextYmd);
  };

  useEffect(() => {
    if (!enrollmentId) return;
    const opts = mmlDropdownDateOptions();
    let ymd = readRememberedMmlSheetDate(enrollmentId);
    if (!ymd || !opts.some(o => o.value === ymd)) {
      ymd = mmlDefaultSheetDate();
    }
    loadSheetForDate(ymd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enrollmentId]);

  const buildValidationErrors = () => {
    const next = {};
    const maxEntryDate = toDateOnlyValue(new Date());
    (entries.resp_a || []).forEach((e, i) => {
      const isOpenDraft = i === entries.resp_a.length - 1 && !hasEntryData(e);
      if (isOpenDraft) return;
      const modes = e.respiratory_modes || [];
      const mode = getMapCpapMode(modes);
      if (mode === "BOTH") {
        const cpapErr = validateMapCpap(e.max_map_cpap_secondary, "CPAP");
        if (cpapErr) next[`resp_a.${i}.max_map_cpap_secondary`] = cpapErr;
        const mapErr = validateMapCpap(e.max_map_cpap, "MAP");
        if (mapErr) next[`resp_a.${i}.max_map_cpap`] = mapErr;
      } else if (mode && mode !== "NA") {
        const err = validateMapCpap(e.max_map_cpap, mode);
        if (err) next[`resp_a.${i}.max_map_cpap`] = err;
      }
      if (e.max_fio2 !== "" && e.max_fio2 != null && (Number(e.max_fio2) < 21 || Number(e.max_fio2) > 100)) {
        next[`resp_a.${i}.max_fio2`] = "Enter 21 to 100";
      }
    });
    (entries.resp_b || []).forEach((e, i) => {
      const isOpenDraft = i === entries.resp_b.length - 1 && !hasEntryData(e);
      if (isOpenDraft) return;
      const phErr = mmlValidatePh(e.ph);
      if (phErr) next[`resp_b.${i}.ph`] = phErr;
      const pao2Err = mmlValidateBloodGasMmHg(e.pao2, {
        min: 20, max: 600, label: "PaO₂",
      });
      if (pao2Err) next[`resp_b.${i}.pao2`] = pao2Err;
      const paco2Err = mmlValidateBloodGasMmHg(e.paco2, {
        min: 15, max: 150, label: "PaCO₂",
      });
      if (paco2Err) next[`resp_b.${i}.paco2`] = paco2Err;
    });
    (entries.resp_c || []).forEach((e, i) => {
      ["apnea_episodes", "desaturation_episodes", "severe_desaturation_episodes"].forEach(k => {
        if (e[k] !== "" && e[k] != null && (!Number.isInteger(Number(e[k])) || Number(e[k]) < 0)) {
          next[`resp_c.${i}.${k}`] = "Enter a non-negative whole number";
        }
      });
      const desat = e.desaturation_episodes;
      const severe = e.severe_desaturation_episodes;
      if (
        desat !== "" && desat != null && severe !== "" && severe != null
        && Number.isInteger(Number(desat)) && Number.isInteger(Number(severe))
        && Number(severe) > Number(desat)
      ) {
        next[`resp_c.${i}.severe_desaturation_episodes`] = SEVERE_DESAT_EXCEEDS_MSG;
      }
    });
    (entries.resp_d || []).forEach((e, i) => {
      if ((e.postnatal_steroids || []).includes("Other") && !e.steroid_other) {
        next[`resp_d.${i}.steroid_other`] = "Specify other steroid";
      }
    });
    (entries.heme_a || []).forEach((e, i) => {
      if (e.transfusion_count !== "" && e.transfusion_count != null
        && (!Number.isInteger(Number(e.transfusion_count)) || Number(e.transfusion_count) < 0)) {
        next[`heme_a.${i}.transfusion_count`] = "Enter a non-negative whole number";
      }
    });
    (entries.gi_a || []).filter(hasEntryData).forEach((e) => {
      if (e.status === "EF") {
        if (!ans(e.volume_ml)) next[`gi_a.${e.id}.volume_ml`] = "Enter feed volume";
        if (!ans(e.milk_type)) next[`gi_a.${e.id}.milk_type`] = "Select milk type";
      }
    });

    Object.keys(entries).forEach(blockKey => {
      const list = entries[blockKey] || [];
      list.forEach((e, i) => {
        const isOpenDraft = i === list.length - 1 && !hasEntryData(e);
        if (isOpenDraft) return;
        if (e.date && e.date > maxEntryDate) {
          next[`${blockKey}.${i}.date`] = "Date cannot be in the future";
        }
        if (blockKey === "resp_a") {
          const { from, to } = parseTimeRange(e.time_range || "");
          const d = e.date || sheetDate || maxEntryDate;
          if (from && isDateTimeInFuture(d, from)) {
            next[`${blockKey}.${i}.time_range`] = "Time cannot be in the future";
          } else if (to && isDateTimeInFuture(d, to)) {
            next[`${blockKey}.${i}.time_range`] = "Time cannot be in the future";
          }
        } else if (e.time && isDateTimeInFuture(e.date || sheetDate, e.time)) {
          next[`${blockKey}.${i}.time`] = "Time cannot be in the future";
        }
      });
    });

    return next;
  };

  const validate = () => {
    const next = buildValidationErrors();
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const buildPayload = (entriesSnapshot = entries) => ({
    enrollment_id: enrollmentId,
    ...flattenEntries(entriesSnapshot),
    record_date: sheetDate,
    gi_feed_frequency_hours: giFeedFrequencyHours,
    glucose_frequency_hours: glucoseFrequencyHours,
    vitals_frequency_hours: vitalsFrequencyHours,
    saved_at: new Date().toISOString(),
    saved_by: user?.name || user?.username || "Site User",
  });

  const persist = async ({
    silent = false,
    runValidate = false,
    entriesSnapshot = null,
    commitDrafts = false,
  } = {}) => {
    const dateYmd = sheetDateRef.current;
    if (!enrollmentId || !dateYmd) return false;
    if (runValidate && !validate()) return false;
    let snapshot = entriesSnapshot ?? entriesRef.current;
    if (commitDrafts && dirtyRef.current) {
      snapshot = commitFilledDraftRows(snapshot, dateYmd);
      entriesRef.current = snapshot;
      setEntries(snapshot);
    }
    setSaving(true);
    try {
      const res = await api.put(
        `/minimal-monitoring/${enrollmentId}/on/${dateYmd}`,
        buildPayload(snapshot),
      );
      const savedDate = res?.data?.record_date || dateYmd;
      setSheetDate(savedDate);
      sheetDateRef.current = savedDate;
      rememberMmlSheetDate(enrollmentId, savedDate);
      dirtyRef.current = false;
      // Keep the sidebar tick in sync with the *current* state, not just
      // whether it was ever true — a reading added then deleted before the
      // next save must un-tick the helper, not leave it stuck complete.
      const progress = countProgress(snapshot);
      if (progress.done > 0) markFormCompleted("minimal_monitoring");
      else unmarkFormCompleted("minimal_monitoring");
      if (!silent) {
        setMessage(`Sheet saved (${formatDateToDDMMYYYY(sheetDate)})`);
        setTimeout(() => setMessage(""), 3000);
      }
      markMmlRespDirtyForHelper(enrollmentId, savedDate);
      window.dispatchEvent(
        new CustomEvent("portal-mml-saved", {
          detail: { enrollmentId, sheetDate: savedDate },
        }),
      );
      return true;
    } catch (err) {
      setMessage(err?.response?.data?.detail || "Error saving. Please try again.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    const next = buildValidationErrors();
    setErrors(next);
    if (Object.keys(next).length > 0) {
      const detail = Object.values(next)[0];
      setMessage(detail
        ? `${detail} — check highlighted fields in this block or the readings table`
        : "Fix the highlighted fields before saving");
      setTimeout(() => setMessage(""), 5000);
      return;
    }
    const committed = commitFilledDraftRows(entries, sheetDate);
    setEntries(committed);
    await persist({ silent: false, runValidate: false, entriesSnapshot: committed });
  };

  const flushPersist = (opts = {}) =>
    persist({ silent: true, runValidate: false, commitDrafts: true, ...opts });

  const handlePrevious = async () => {
    try {
      if (dirtyRef.current) await flushPersist();
    } catch (err) {
      console.error("Save before back failed:", err);
    }
    navigate(`/metab-renal-vasc-eye-log/${enrollmentId}`);
  };

  useRegisterActiveFormSession(
    () => dirtyRef.current,
    () => (dirtyRef.current ? flushPersist() : Promise.resolve()),
  );

  /* Debounced autosave (~1.5s) after hydrate */
  useEffect(() => {
    if (!hydratedRef.current || !enrollmentId || saveTick === 0) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(async () => {
      const ok = await persist({
        silent: true,
        runValidate: false,
        entriesSnapshot: entriesRef.current,
      });
      if (ok) {
        setMessage(`Sheet saved (${formatDateToDDMMYYYY(sheetDate)})`);
        setTimeout(() => setMessage(""), 2500);
      }
    }, 1500);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveTick, enrollmentId]);

  const err = (block, idx, key) =>
    errors[`${block}.${idx}.${key}`] || liveFieldWarnings[`${block}.${idx}.${key}`];

  /** Renders the fields (Item/Num/PillSingle/etc.) for a single lettered
   *  block — this is what shows up once the user drills into one variable,
   *  e.g. Metabolic → Electrolyte abnormality. */
  const renderBlockBody = (blockKey) => {
    switch (blockKey) {
      case "cv_a":
        return (
          <ScheduledFlowsheet
            blockKey="cv_a"
            columns={CV_A_COLUMNS}
            entries={entries.cv_a}
            frequencyHours={vitalsFrequencyHours}
            onChangeFrequency={changeVitalsFrequency}
            onChangeField={(id, k, v) => setFlowsheetEntryField("cv_a", id, k, v)}
            onAdd={slot => addFlowsheetEntry("cv_a", slot, { axillary_temp: "", sbp: "", dbp: "", map_value: "" })}
            onRemove={id => removeFlowsheetEntry("cv_a", id)}
            disabled={!isEditable}
            sheetDate={sheetDate}
            errors={errors}
          />
        );
      case "cv_b":
        return (
          <EntryBlock fixedDate={sheetDate || ""} blockKey="cv_b" code="5.1.B" entries={entries.cv_b} disabled={!isEditable}
            errors={errors}
            onChangeEntry={(i, k, v) => setEntryField("cv_b", i, k, v)}
            onAdd={blank => addEntry("cv_b", blank)} onRemove={i => removeEntry("cv_b", i)}
            blankFactory={() => freshEntry({ fluid_bolus_given: "" }, sheetDate)}>
            {(e, i) => (
              <Item n={1} label="Fluid Bolus given">
                <Num
                  value={e.fluid_bolus_given}
                  onChange={v => setEntryField("cv_b", i, "fluid_bolus_given", v)}
                  disabled={!isEditable}
                  placeholder="e.g. 10"
                />
              </Item>
            )}
          </EntryBlock>
        );
      case "cv_c":
        return (
          <EntryBlock fixedDate={sheetDate || ""} blockKey="cv_c" code="5.1.C" entries={entries.cv_c} disabled={!isEditable}
            errors={errors}
            onChangeEntry={(i, k, v) => setEntryField("cv_c", i, k, v)}
            onAdd={blank => addEntry("cv_c", blank)} onRemove={i => removeEntry("cv_c", i)}
            blankFactory={() => freshEntry({ vasoactive_drugs: [], vasoactive_dose: "", vasoactive_unit: "" }, sheetDate)}>
            {(e, i) => (
              <>
                <Item n={1} label="Vasoactive given">
                  <PillMulti options={["Dopamine", "Dobutamine", "Epinephrine", "Milrinone", "Vasopressin", "Norepinephrine"]}
                    value={e.vasoactive_drugs || []} onChange={v => setEntryField("cv_c", i, "vasoactive_drugs", v)}
                    disabled={!isEditable} />
                </Item>
                <Item n={2} label="Dose administered">
                  <Txt value={e.vasoactive_dose} onChange={v => setEntryField("cv_c", i, "vasoactive_dose", v)}
                    disabled={!isEditable} />
                </Item>
                <Item n={3} label="Unit">
                  <PillSingle options={["mg/kg/min", "mcg/kg/min", "U/kg/min"]} value={e.vasoactive_unit}
                    onChange={v => setEntryField("cv_c", i, "vasoactive_unit", v)} disabled={!isEditable} />
                </Item>
              </>
            )}
          </EntryBlock>
        );
      case "cv_d":
        return (
          <EntryBlock fixedDate={sheetDate || ""} blockKey="cv_d" code="5.1.D" entries={entries.cv_d} disabled={!isEditable}
            errors={errors}
            onChangeEntry={(i, k, v) => setEntryField("cv_d", i, k, v)}
            onAdd={blank => addEntry("cv_d", blank)} onRemove={i => removeEntry("cv_d", i)}
            blankFactory={() => freshEntry({ pda_agent: [], pda_dose: "" }, sheetDate)}>
            {(e, i) => (
              <>
                <Item n={1} label="Agent for Medical Rx of PDA">
                  <PillMulti options={["Indo", "Ibu", "PCM"]} value={e.pda_agent || []}
                    onChange={v => setEntryField("cv_d", i, "pda_agent", v)} disabled={!isEditable} />
                </Item>
                <Item n={2} label="Dose administered">
                  <Num value={e.pda_dose} onChange={v => setEntryField("cv_d", i, "pda_dose", v)}
                    disabled={!isEditable} unit="mg/kg" />
                </Item>
              </>
            )}
          </EntryBlock>
        );
      case "resp_a":
        return (
          <EntryBlock fixedDate={sheetDate || ""} blockKey="resp_a" code="5.2.A" entries={entries.resp_a} disabled={!isEditable}
            errors={errors}
            onChangeEntry={(i, k, v) => setEntryField("resp_a", i, k, v)}
            onAdd={blank => addEntry("resp_a", blank)} onRemove={i => removeEntry("resp_a", i)}
            blankFactory={() => freshEntry({
              time_range: "", respiratory_modes: [], max_map_cpap: "", max_map_cpap_secondary: "", max_fio2: "",
            }, sheetDate)}>
            {(e, i) => (
              <>
                <Item n={1} label="Time: Btw" sub="AM/PM range" wide>
                  <TimeRangePicker
                    value={e.time_range}
                    dateYmd={e.date || sheetDate || ""}
                    onChange={v => setEntryField("resp_a", i, "time_range", v)}
                    disabled={!isEditable} />
                </Item>
                <Item n={2} label="Mode">
                  <PillMulti options={["NC", "HFNC", "CPAP", "NIPPV", "SIMV", "A/C", "PSV", "HFOV"]}
                    value={e.respiratory_modes || []}
                    onChange={(v) => {
                      setEntryField("resp_a", i, "respiratory_modes", v);
                      const mode = getMapCpapMode(v);
                      if (mode === "NA") {
                        setEntryField("resp_a", i, "max_map_cpap", "");
                        setEntryField("resp_a", i, "max_map_cpap_secondary", "");
                      } else if (mode !== "BOTH") {
                        setEntryField("resp_a", i, "max_map_cpap_secondary", "");
                      }
                    }}
                    disabled={!isEditable} />
                </Item>
                <RespAMapCpapFields
                  entry={e}
                  disabled={!isEditable}
                  fieldErr={(key) => err("resp_a", i, key)}
                  onChangeField={(key, v) => setEntryField("resp_a", i, key, v)}
                />
                <Item n={4} label="Max FiO₂ of the hour" hint="Must be between 21 and 100 (%)" error={err("resp_a", i, "max_fio2")}>
                  <Num value={e.max_fio2} onChange={v => setEntryField("resp_a", i, "max_fio2", v)}
                    disabled={!isEditable} unit="%" error={err("resp_a", i, "max_fio2")} />
                </Item>
              </>
            )}
          </EntryBlock>
        );
      case "resp_b":
        return (
          <EntryBlock fixedDate={sheetDate || ""} blockKey="resp_b" code="5.2.B" entries={entries.resp_b} disabled={!isEditable}
            errors={errors}
            onChangeEntry={(i, k, v) => setEntryField("resp_b", i, k, v)}
            onAdd={blank => addEntry("resp_b", blank)} onRemove={i => removeEntry("resp_b", i)}
            blankFactory={() => freshEntry({ ph: "", pao2: "", paco2: "" }, sheetDate)}>
            {(e, i) => (
              <>
                <Item n={1} label="pH" hint="Usually 6.6–7.8" error={err("resp_b", i, "ph")}>
                  <Num value={e.ph} onChange={v => setEntryField("resp_b", i, "ph", v)}
                    disabled={!isEditable} step="0.01" error={err("resp_b", i, "ph")} />
                </Item>
                <Item n={2} label="PaO₂" hint="Usually 20–600 mmHg" error={err("resp_b", i, "pao2")}>
                  <Num value={e.pao2} onChange={v => setEntryField("resp_b", i, "pao2", v)}
                    disabled={!isEditable} unit="mm Hg" error={err("resp_b", i, "pao2")} />
                </Item>
                <Item n={3} label="PaCO₂" hint="Usually 15–150 mmHg" error={err("resp_b", i, "paco2")}>
                  <Num value={e.paco2} onChange={v => setEntryField("resp_b", i, "paco2", v)}
                    disabled={!isEditable} unit="mm Hg" error={err("resp_b", i, "paco2")} />
                </Item>
              </>
            )}
          </EntryBlock>
        );
      case "resp_c":
        return (
          <EntryBlock fixedDate={sheetDate || ""} blockKey="resp_c" code="5.2.C" entries={entries.resp_c} disabled={!isEditable}
            errors={errors}
            onChangeEntry={(i, k, v) => setEntryField("resp_c", i, k, v)}
            onAdd={blank => addEntry("resp_c", blank)} onRemove={i => removeEntry("resp_c", i)}
            blankFactory={() => freshEntry({ apnea_episodes: "", desaturation_episodes: "", severe_desaturation_episodes: "" }, sheetDate)}>
            {(e, i) => (
              <>
                <Item n={1} label="Apnea episodes" hint="Whole number, 0 or more" error={err("resp_c", i, "apnea_episodes")}>
                  <Num value={e.apnea_episodes}
                    onChange={v => setEntryField("resp_c", i, "apnea_episodes", v)}
                    disabled={!isEditable} error={err("resp_c", i, "apnea_episodes")} />
                </Item>
                <Item n={2} label="Desaturation episodes" hint="Whole number, 0 or more" error={err("resp_c", i, "desaturation_episodes")}>
                  <Num value={e.desaturation_episodes}
                    onChange={v => setEntryField("resp_c", i, "desaturation_episodes", v)}
                    disabled={!isEditable} error={err("resp_c", i, "desaturation_episodes")} />
                </Item>
                <Item n={3} label="Sev. desaturation episodes" hint="Whole number, 0 or more — cannot exceed the desaturation episodes count above" error={err("resp_c", i, "severe_desaturation_episodes")}>
                  <Num value={e.severe_desaturation_episodes}
                    onChange={v => setEntryField("resp_c", i, "severe_desaturation_episodes", v)}
                    disabled={!isEditable} error={err("resp_c", i, "severe_desaturation_episodes")} />
                </Item>
              </>
            )}
          </EntryBlock>
        );
      case "resp_d":
        return (
          <EntryBlock fixedDate={sheetDate || ""} blockKey="resp_d" code="5.2.D" entries={entries.resp_d} disabled={!isEditable}
            errors={errors}
            onChangeEntry={(i, k, v) => setEntryField("resp_d", i, k, v)}
            onAdd={blank => addEntry("resp_d", blank)} onRemove={i => removeEntry("resp_d", i)}
            blankFactory={() => freshEntry({ postnatal_steroids: [], steroid_dose: "", steroid_other: "" }, sheetDate)}>
            {(e, i) => (
              <>
                <Item n={1} label="Postnatal steroids">
                  <PillMulti options={["Hydrocortisone", "Dexamethasone", "Budesonide", "Other"]}
                    value={e.postnatal_steroids || []}
                    onChange={v => setEntryField("resp_d", i, "postnatal_steroids", v)}
                    disabled={!isEditable} />
                </Item>
                <Item n={2} label="Dose administered">
                  <Num value={e.steroid_dose} onChange={v => setEntryField("resp_d", i, "steroid_dose", v)}
                    disabled={!isEditable} unit="mg/kg" />
                </Item>
                {(e.postnatal_steroids || []).includes("Other") && (
                  <Item n={3} label="If Other, specify" hint="Required when 'Other' is selected above" error={err("resp_d", i, "steroid_other")}>
                    <Txt value={e.steroid_other}
                      onChange={v => setEntryField("resp_d", i, "steroid_other", v)}
                      disabled={!isEditable} error={err("resp_d", i, "steroid_other")}
                      placeholder="Other steroid name" />
                  </Item>
                )}
              </>
            )}
          </EntryBlock>
        );
      case "met_a":
        return (
          <ScheduledFlowsheet
            blockKey="met_a"
            columns={MET_A_COLUMNS}
            entries={entries.met_a}
            frequencyHours={glucoseFrequencyHours}
            onChangeFrequency={changeGlucoseFrequency}
            onChangeField={(id, k, v) => setFlowsheetEntryField("met_a", id, k, v)}
            onAdd={slot => addFlowsheetEntry("met_a", slot, { glucose: "" })}
            onRemove={id => removeFlowsheetEntry("met_a", id)}
            disabled={!isEditable}
            sheetDate={sheetDate}
            errors={errors}
          />
        );
      case "met_b":
        return (
          <EntryBlock fixedDate={sheetDate || ""} blockKey="met_b" code="5.3.B" entries={entries.met_b} disabled={!isEditable}
            errors={errors}
            onChangeEntry={(i, k, v) => setEntryField("met_b", i, k, v)}
            onAdd={blank => addEntry("met_b", blank)} onRemove={i => removeEntry("met_b", i)}
            blankFactory={() => freshEntry({ alp: "", total_calcium: "", phosphorus: "" }, sheetDate)}>
            {(e, i) => (
              <>
                <Item n={1} label="ALP">
                  <Num value={e.alp} onChange={v => setEntryField("met_b", i, "alp", v)}
                    disabled={!isEditable} unit="IU/L" />
                </Item>
                <Item n={2} label="Total Ca">
                  <Num value={e.total_calcium} onChange={v => setEntryField("met_b", i, "total_calcium", v)}
                    disabled={!isEditable} unit="mg/dL" />
                </Item>
                <Item n={3} label="Phosphorus P">
                  <Num value={e.phosphorus} onChange={v => setEntryField("met_b", i, "phosphorus", v)}
                    disabled={!isEditable} unit="mg/dL" />
                </Item>
              </>
            )}
          </EntryBlock>
        );
      case "gi_a":
        return (
          <GiFeedFlowsheet
            entries={entries.gi_a}
            frequencyHours={giFeedFrequencyHours}
            onChangeFrequency={changeGiFrequency}
            onChangeField={(id, k, v) => setFlowsheetEntryField("gi_a", id, k, v)}
            onAdd={slot => addFlowsheetEntry("gi_a", slot, { status: "", milk_type: "", volume_ml: "" })}
            onRemove={id => removeFlowsheetEntry("gi_a", id)}
            disabled={!isEditable}
            sheetDate={sheetDate}
            errors={errors}
          />
        );
      case "gi_b":
        return (
          <EntryBlock fixedDate={sheetDate || ""} blockKey="gi_b" code="5.4.B" entries={entries.gi_b} disabled={!isEditable}
            errors={errors}
            onChangeEntry={(i, k, v) => setEntryField("gi_b", i, k, v)}
            onAdd={blank => addEntry("gi_b", blank)} onRemove={i => removeEntry("gi_b", i)}
            blankFactory={() => freshEntry({ direct_bilirubin: "" }, sheetDate)}>
            {(e, i) => (
              <Item n={1} label="Direct Bilirubin">
                <Num value={e.direct_bilirubin}
                  onChange={v => setEntryField("gi_b", i, "direct_bilirubin", v)}
                  disabled={!isEditable} unit="mg/dL" />
              </Item>
            )}
          </EntryBlock>
        );
      case "neuro_combined":
        return (
          <>
            <EntryBlock
              fixedDate={sheetDate || ""}
              blockKey="neuro_a"
              subsectionTitle="Ventriculomegaly"
              entries={entries.neuro_a}
              disabled={!isEditable}
              errors={errors}
              onChangeEntry={(i, k, v) => setEntryField("neuro_a", i, k, v)}
              onAdd={blank => addEntry("neuro_a", blank)}
              onRemove={i => removeEntry("neuro_a", i)}
              blankFactory={() => freshEntry({ ventriculomegaly_severity: "", vi: "", ahw: "" }, sheetDate)}
            >
              {(e, i) => (
                <>
                  <Item n={1} label="Severity of Ventriculomegaly">
                    <PillSingle options={["Mild", "Moderate", "Severe"]} value={e.ventriculomegaly_severity}
                      onChange={v => setEntryField("neuro_a", i, "ventriculomegaly_severity", v)}
                      disabled={!isEditable} />
                  </Item>
                  <Item n={2} label="VI">
                    <Num value={e.vi} onChange={v => setEntryField("neuro_a", i, "vi", v)}
                      disabled={!isEditable} unit="mm" />
                  </Item>
                  <Item n={3} label="AHW">
                    <Num value={e.ahw} onChange={v => setEntryField("neuro_a", i, "ahw", v)}
                      disabled={!isEditable} unit="mm" />
                  </Item>
                </>
              )}
            </EntryBlock>
            <EntryBlock
              fixedDate={sheetDate || ""}
              blockKey="neuro_b"
              subsectionTitle="Doppler"
              entries={entries.neuro_b}
              disabled={!isEditable}
              errors={errors}
              onChangeEntry={(i, k, v) => setEntryField("neuro_b", i, k, v)}
              onAdd={blank => addEntry("neuro_b", blank)}
              onRemove={i => removeEntry("neuro_b", i)}
              blankFactory={() => freshEntry({ tod: "", aca_ri: "", mca_ri: "" }, sheetDate)}
            >
              {(e, i) => (
                <>
                  <Item n={1} label="TOD">
                    <Num value={e.tod} onChange={v => setEntryField("neuro_b", i, "tod", v)}
                      disabled={!isEditable} unit="mm" />
                  </Item>
                  <Item n={2} label="ACA RI">
                    <Num value={e.aca_ri} onChange={v => setEntryField("neuro_b", i, "aca_ri", v)}
                      disabled={!isEditable} step="0.01" />
                  </Item>
                  <Item n={3} label="MCA RI">
                    <Num value={e.mca_ri} onChange={v => setEntryField("neuro_b", i, "mca_ri", v)}
                      disabled={!isEditable} step="0.01" />
                  </Item>
                </>
              )}
            </EntryBlock>
          </>
        );
      case "heme_a":
        return (
          <EntryBlock fixedDate={sheetDate || ""} blockKey="heme_a" code="5.6.A" entries={entries.heme_a} disabled={!isEditable}
            errors={errors}
            onChangeEntry={(i, k, v) => setEntryField("heme_a", i, k, v)}
            onAdd={blank => addEntry("heme_a", blank)} onRemove={i => removeEntry("heme_a", i)}
            blankFactory={() => freshEntry({ transfusion_products: [], transfusion_count: "", prbc_volume: "" }, sheetDate)}>
            {(e, i) => (
              <>
                <Item n={1} label="Transfusion">
                  <PillMulti options={["PRBC", "Platelets", "FFP/Cryo"]} value={e.transfusion_products || []}
                    onChange={v => setEntryField("heme_a", i, "transfusion_products", v)}
                    disabled={!isEditable} />
                </Item>
                <Item n={2} label="No. of transfusions" hint="Whole number, 0 or more" error={err("heme_a", i, "transfusion_count")}>
                  <Num value={e.transfusion_count}
                    onChange={v => setEntryField("heme_a", i, "transfusion_count", v)}
                    disabled={!isEditable} error={err("heme_a", i, "transfusion_count")} />
                </Item>
                {(e.transfusion_products || []).includes("PRBC") && (
                  <Item n={3} label="If PRBC, volume">
                    <Num value={e.prbc_volume} onChange={v => setEntryField("heme_a", i, "prbc_volume", v)}
                      disabled={!isEditable} unit="ml/kg" />
                  </Item>
                )}
              </>
            )}
          </EntryBlock>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <div className="rcn-page">
        <div className="rcn-patient-header">
          <div className="rcn-patient-header-title">
            <div className="rcn-patient-header-badge">DAILY MONITORING SHEET (DMS)</div>
            <h2 className="rcn-patient-header-form-name">Minimal Monitoring</h2>
            <p className="rcn-patient-header-subtitle">
              Same-day scratchpad — jot spot values as they occur, then copy into the CRF helpers
            </p>
            <div className="mml-sheet-header-row">
              <p className="mml-sheet-note">
                Sheet date — before {MML_DROPDOWN_CUTOFF_HOUR}:00 you can choose yesterday or today;
                from {MML_DROPDOWN_CUTOFF_HOUR}:00 onward only today. Every section uses this date.
              </p>
              {sheetDateOptions.length > 1 ? (
                <label className="mml-sheet-date-label">
                  <span className="mml-sheet-date-label-text">Date</span>
                  <select
                    className="rcn-text-input mml-sheet-date-select"
                    value={sheetDate}
                    disabled={loading || !sheetDate}
                    onChange={e => requestSheetDateChange(e.target.value)}
                  >
                    {sheetDateOptions.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="mml-sheet-date-fixed">
                  {sheetDate ? formatDateToDDMMYYYY(sheetDate) : "—"}
                </p>
              )}
            </div>
          </div>
          <div className="rcn-patient-cards">
            <MetricCard label="Enrolment ID" value={patientInfo.enrollmentId} tone="blue" />
            <MetricCard label="Gestation" value={patientInfo.gestation} tone="teal" />
            <MetricCard label="Mother's Name" value={patientInfo.motherName} tone="violet" />
            <MetricCard label="Baby UID" value={patientInfo.babyUid} tone="amber" />
          </div>
        </div>

        {loading ? <div className="rcn-loading">Loading sheet…</div> : (
          <div className="rcn-sections">

            {view === "sections" && (
              <>
                <p className="mml-step-hint">Pick a heading to fill in its values.</p>
                <SectionsGrid counts={counts} onOpen={openSection} />
              </>
            )}

            {view === "fields" && activeSection && (
              <FieldsList
                sectionKey={activeSection}
                counts={counts}
                onOpen={openBlock}
                onBack={backToSections}
              />
            )}

            {view === "detail" && activeSection && activeBlock && (
              <div className="mml-detail">
                <button type="button" className="mml-back-btn" onClick={backToFields}>
                  <ArrowLeft size={14} /> {SECTION_META[activeSection].title}
                </button>
                <div className="mml-detail-title">
                  <span className="mml-subblock-code">{BLOCK_META[activeBlock].code}</span>
                  <h2>{BLOCK_META[activeBlock].label}</h2>
                </div>
                <p className="mml-fields-list-hint">
                  {activeBlock === "resp_a"
                    ? "Date is fixed to the sheet date above. Use the time range for respiratory support — click Save to add readings to the table below."
                    : "Date is fixed to the sheet date above; time follows the sheet rules. Click Save to add readings to the table below."}
                </p>
                {renderBlockBody(activeBlock)}
              </div>
            )}
          </div>
        )}

        {message && (
          <div className={`form-message${message.includes("saved") || message.includes("submitted") ? " form-message--success" : " form-message--error"}`}>
            {message}
          </div>
        )}
      </div>

      <div className="form-navigation">
        {view === "sections" && (
          <button type="button" className="btn btn-secondary btn-outline" onClick={handlePrevious}>
            <ArrowLeft size={15} /> Metab Helper Form
          </button>
        )}
        {view === "fields" && (
          <button type="button" className="btn btn-secondary btn-outline" onClick={backToSections}>
            <ArrowLeft size={15} /> All sections
          </button>
        )}
        {view === "detail" && (
          <button type="button" className="btn btn-secondary btn-outline" onClick={backToFields}>
            <ArrowLeft size={15} /> {activeSection ? SECTION_META[activeSection].title : "Back"}
          </button>
        )}
        <button type="button" className="btn btn-save btn-outline-blue" onClick={handleSave} disabled={saving}>
          <Save size={15} /> {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </>
  );
}
