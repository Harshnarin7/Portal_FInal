import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, ChevronDown, ChevronRight, Plus, Save, Trash2, CheckCircle2,
  Heart, Wind, Beaker, Utensils, Brain, Droplet,
} from "lucide-react";
import api from "./api/axios";
import { useAuth } from "./context/AuthContext";
import { useFormProgress } from "./context/FormProgressContext";
import { useRegisterActiveFormSession } from "./context/ActiveFormSessionContext";
import { toDateOnlyValue, formatDateToDDMMYYYY } from "./utils/datetime";
import "./styles/RespCVNeuro.css";
import "./styles/MinimalMonitoring.css";

/** Before this local hour, "today" still means the previous calendar date (server + client). */
const MML_BOUNDARY_HOUR = 8;

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
  met_a: "metabolic", met_b: "metabolic", met_c: "metabolic",
  gi_a: "gastrointestinal", gi_b: "gastrointestinal",
  neuro_a: "neurological", neuro_b: "neurological",
  heme_a: "hematology",
};

/** Ordered list of variable/field blocks under each heading — drives the
 *  second-level "choose a field" list (e.g. Metabolic → Glucose / Lab
 *  Reports / Electrolyte abnormality). */
const BLOCKS_BY_SECTION = {
  cardiovascular: ["cv_a", "cv_b", "cv_c", "cv_d"],
  respiratory: ["resp_a", "resp_b", "resp_c", "resp_d"],
  metabolic: ["met_a", "met_b", "met_c"],
  gastrointestinal: ["gi_a", "gi_b"],
  neurological: ["neuro_a", "neuro_b"],
  hematology: ["heme_a"],
};

/** Friendly label + one-line description shown in the field-picker list. */
const BLOCK_META = {
  cv_a: { code: "5.1.A", label: "Vitals", desc: "Skin/Axillary temp, SBP, DBP, MAP" },
  cv_b: { code: "5.1.B", label: "Fluid Bolus", desc: "Fluid bolus given" },
  cv_c: { code: "5.1.C", label: "Vasoactive Drugs", desc: "Agent, dose & unit" },
  cv_d: { code: "5.1.D", label: "PDA Medical Rx", desc: "Agent for medical Rx of PDA & dose" },
  resp_a: { code: "5.2.A", label: "Respiratory Support", desc: "Time, mode, max MAP/CPAP, max FiO₂" },
  resp_b: { code: "5.2.B", label: "Blood Gas", desc: "pH, PaO₂, PaCO₂" },
  resp_c: { code: "5.2.C", label: "Apnea / Desaturation", desc: "Episode counts per shift" },
  resp_d: { code: "5.2.D", label: "Postnatal Steroids", desc: "Agent & dose" },
  met_a: { code: "5.3.A", label: "Glucose", desc: "Spot glucose reading" },
  met_b: { code: "5.3.B", label: "Lab Reports — ALP, Total Ca, P", desc: "ALP, total calcium & phosphorus" },
  met_c: { code: "5.3.C", label: "Electrolyte Abnormality", desc: "Yes/No, Hypo/Hyper, symptomatic status" },
  gi_a: { code: "5.4.A", label: "Feed Volume", desc: "Shift & cumulative feed volume" },
  gi_b: { code: "5.4.B", label: "Direct Bilirubin", desc: "Direct bilirubin value" },
  neuro_a: { code: "5.5.A", label: "Ventriculomegaly", desc: "Severity, VI, AHW" },
  neuro_b: { code: "5.5.B", label: "Doppler", desc: "TOD, ACA RI, MCA RI" },
  heme_a: { code: "5.6.A", label: "Transfusion", desc: "Products, count, PRBC volume" },
};

const pad2 = n => String(n).padStart(2, "0");
const nowTime = (d = new Date()) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const ans = v => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0);
const listToString = v => Array.isArray(v) ? v.join(",") : (v || "");
const stringToList = v => Array.isArray(v) ? v : String(v || "").split(",").map(s => s.trim()).filter(Boolean);
const asNumber = v => v === "" || v === null || v === undefined ? null : Number(v);
const asInteger = v => v === "" || v === null || v === undefined ? null : parseInt(v, 10);

/** New entries always get today's date + the current clock time — this is
 *  what makes the date/time on a freshly-opened field "autofill". */
function freshEntry(fields = {}) {
  const d = new Date();
  return { id: uid(), date: toDateOnlyValue(d), time: nowTime(d), ...fields };
}

function emptyEntries() {
  return {
    cv_a: [freshEntry({ shift: "", axillary_temp: "", sbp: "", dbp: "", map_value: "" })],
    cv_b: [freshEntry({ fluid_bolus_given: "" })],
    cv_c: [freshEntry({ vasoactive_drugs: [], vasoactive_dose: "", vasoactive_unit: "" })],
    cv_d: [freshEntry({ pda_agent: [], pda_dose: "" })],
    resp_a: [freshEntry({ time_range: "", respiratory_modes: [], max_map_cpap: "", max_fio2: "" })],
    resp_b: [freshEntry({ ph: "", pao2: "", paco2: "" })],
    resp_c: [freshEntry({ shift: "", apnea_episodes: "", desaturation_episodes: "", severe_desaturation_episodes: "" })],
    resp_d: [freshEntry({ postnatal_steroids: [], steroid_dose: "", steroid_other: "" })],
    met_a: [freshEntry({ glucose: "" })],
    met_b: [freshEntry({ alp: "", total_calcium: "", phosphorus: "" })],
    met_c: [freshEntry({ electrolyte_abnormality: null, electrolytes: [], hypo_hyper: "", symptomatic_status: "", symptomatic_detail: "" })],
    gi_a: [freshEntry({ shift: "", cumulative_feed_volume: "" })],
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
        return base;
      }
    } catch (_) { /* fall through */ }
  }
  // Legacy flat-row → single entry per block
  const e = emptyEntries();
  e.cv_a[0] = { ...e.cv_a[0], date: d.record_date || e.cv_a[0].date, shift: d.shift || "", axillary_temp: d.axillary_temp ?? "", sbp: d.sbp ?? "", dbp: d.dbp ?? "", map_value: d.map_value ?? "" };
  e.cv_b[0] = { ...e.cv_b[0], fluid_bolus_given: d.fluid_bolus_given || "" };
  e.cv_c[0] = { ...e.cv_c[0], vasoactive_drugs: stringToList(d.vasoactive_drugs), vasoactive_dose: d.vasoactive_dose || "", vasoactive_unit: d.vasoactive_unit || "" };
  e.cv_d[0] = { ...e.cv_d[0], pda_agent: stringToList(d.pda_agent), pda_dose: d.pda_dose ?? "" };
  e.resp_a[0] = { ...e.resp_a[0], time_range: d.respiratory_time || "", respiratory_modes: stringToList(d.respiratory_modes), max_map_cpap: d.max_map_cpap ?? "", max_fio2: d.max_fio2 ?? "" };
  e.resp_b[0] = { ...e.resp_b[0], ph: d.ph ?? "", pao2: d.pao2 ?? "", paco2: d.paco2 ?? "" };
  e.resp_c[0] = { ...e.resp_c[0], shift: d.apnea_shift || "", apnea_episodes: d.apnea_episodes ?? "", desaturation_episodes: d.desaturation_episodes ?? "", severe_desaturation_episodes: d.severe_desaturation_episodes ?? "" };
  e.resp_d[0] = { ...e.resp_d[0], postnatal_steroids: stringToList(d.postnatal_steroids), steroid_dose: d.steroid_dose ?? "", steroid_other: d.steroid_other || "" };
  e.met_a[0] = { ...e.met_a[0], glucose: d.glucose ?? "" };
  e.met_b[0] = { ...e.met_b[0], alp: d.alp ?? "", total_calcium: d.total_calcium ?? "", phosphorus: d.phosphorus ?? "" };
  e.met_c[0] = { ...e.met_c[0], electrolyte_abnormality: d.electrolyte_abnormality ?? null, electrolytes: stringToList(d.electrolytes), hypo_hyper: d.hypo_hyper || "", symptomatic_status: d.symptomatic_status || "", symptomatic_detail: d.symptomatic_detail || "" };
  e.gi_a[0] = { ...e.gi_a[0], shift: d.feed_shift || "", cumulative_feed_volume: d.cumulative_feed_volume ?? "" };
  e.gi_b[0] = { ...e.gi_b[0], direct_bilirubin: d.direct_bilirubin ?? "" };
  e.neuro_a[0] = { ...e.neuro_a[0], date: d.imaging_date || e.neuro_a[0].date, ventriculomegaly_severity: d.ventriculomegaly_severity || "", vi: d.vi ?? "", ahw: d.ahw ?? "" };
  e.neuro_b[0] = { ...e.neuro_b[0], tod: d.tod ?? "", aca_ri: d.aca_ri ?? "", mca_ri: d.mca_ri ?? "" };
  e.heme_a[0] = { ...e.heme_a[0], transfusion_products: stringToList(d.transfusion_products), transfusion_count: d.transfusion_count ?? "", prbc_volume: d.prbc_volume ?? "" };
  return e;
}

function flattenEntries(entries) {
  const g = (key, i = 0) => (entries[key] && entries[key][i]) || {};
  const cvA = g("cv_a"); const cvB = g("cv_b"); const cvC = g("cv_c"); const cvD = g("cv_d");
  const rA = g("resp_a"); const rB = g("resp_b"); const rC = g("resp_c"); const rD = g("resp_d");
  const mA = g("met_a"); const mB = g("met_b"); const mC = g("met_c");
  const giA = g("gi_a"); const giB = g("gi_b");
  const nA = g("neuro_a"); const nB = g("neuro_b"); const hA = g("heme_a");
  return {
    record_date: cvA.date || "",
    shift: cvA.shift || "",
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
    max_fio2: asNumber(rA.max_fio2),
    ph: asNumber(rB.ph),
    pao2: asNumber(rB.pao2),
    paco2: asNumber(rB.paco2),
    apnea_shift: rC.shift || "",
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
    electrolyte_abnormality: mC.electrolyte_abnormality,
    electrolytes: listToString(mC.electrolytes),
    hypo_hyper: mC.hypo_hyper || "",
    symptomatic_status: mC.symptomatic_status || "",
    symptomatic_detail: mC.symptomatic_detail || "",
    feed_shift: giA.shift || "",
    cumulative_feed_volume: asNumber(giA.cumulative_feed_volume),
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
    entries_json: JSON.stringify(entries),
  };
}

/** True if an entry has at least one real clinical value filled in — the
 *  auto-stamped id/date/time on a freshly-opened blank row don't count. This
 *  is what distinguishes a "previously added" reading (shown in the history
 *  table) from the still-blank draft row waiting for new input. */
function hasEntryData(entry) {
  if (!entry) return false;
  return Object.entries(entry).some(([k, v]) => {
    if (k === "id" || k === "date" || k === "time") return false;
    return ans(v);
  });
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
        // Conditional slots
        if (k === "steroid_other" && !(entry.postnatal_steroids || []).includes("Other")) return;
        if (k === "symptomatic_detail" && entry.symptomatic_status !== "symptomatic") return;
        if (k === "electrolytes" && entry.electrolyte_abnormality !== true) return;
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

function Item({ n, label, sub, error, children }) {
  return (
    <div className="rcn-field-group">
      <label className="rcn-field-label rcn-field-label--exact-case">
        {n != null && <span className="mml-item-num">{n}.</span>} {label}
        {sub && <span className="rcn-field-sub">{sub}</span>}
      </label>
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

function YNToggle({ value, onChange, disabled }) {
  return (
    <div className="rcn-yn">
      <button type="button" className={`rcn-yn-btn${value === true ? " rcn-yn-active-yes" : ""}`}
        disabled={disabled} onClick={() => onChange(value === true ? null : true)}>Yes</button>
      <button type="button" className={`rcn-yn-btn${value === false ? " rcn-yn-active-no" : ""}`}
        disabled={disabled} onClick={() => onChange(value === false ? null : false)}>No</button>
    </div>
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
    { key: "shift", label: "Shift" },
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
  met_c: [
    { key: "electrolyte_abnormality", label: "Electrolyte abn.", bool: true },
    { key: "electrolytes", label: "Electrolytes", list: true },
    { key: "hypo_hyper", label: "Hypo/Hyper" },
    { key: "symptomatic_status", label: "Symptomatic" },
    { key: "symptomatic_detail", label: "Details" },
  ],
  gi_a: [
    { key: "shift", label: "Shift" },
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

/** Renders one summary-table cell for a field, using its column metadata. */
function formatCell(field, entry) {
  const v = entry ? entry[field.key] : undefined;
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
function EntryBlock({
  blockKey, code, entries, onChangeEntry, onAdd, onRemove, disabled, blankFactory, children,
}) {
  const draftIdx = entries.length - 1;
  const draft = entries[draftIdx] || {};
  const history = entries
    .map((entry, idx) => ({ entry, idx }))
    .filter(({ entry, idx }) => idx !== draftIdx && hasEntryData(entry));
  const fieldsMeta = BLOCK_FIELDS[blockKey] || [];

  return (
    <div className="rcn-subsection mml-subblock">
      <div className="mml-subblock-head">
        <span className="mml-subblock-code">{code}</span>
      </div>

      <div className="mml-entry mml-entry--draft">
        <div className="mml-entry-head">
          <div className="mml-entry-meta">
            <span className="mml-draft-badge">New reading</span>
            <label className="mml-meta-field">
              <span>Date</span>
              <input type="date" className="rcn-text-input mml-date-input" value={draft.date || ""}
                disabled={disabled} onChange={e => onChangeEntry(draftIdx, "date", e.target.value)} />
            </label>
            <label className="mml-meta-field">
              <span>Time</span>
              <input type="time" className="rcn-text-input mml-time-input" value={draft.time || ""}
                disabled={disabled} onChange={e => onChangeEntry(draftIdx, "time", e.target.value)} />
            </label>
          </div>
          {!disabled && hasEntryData(draft) && (
            <button type="button" className="mml-add-btn"
              onClick={() => onAdd(blankFactory ? blankFactory() : freshEntry())}>
              <Plus size={14} /> Log another reading
            </button>
          )}
        </div>
        <div className="rcn-grid-3">{children(draft, draftIdx)}</div>
      </div>

      <div className="mml-history">
        <h4 className="mml-history-title">Previously added ({history.length})</h4>
        {history.length === 0 ? (
          <p className="mml-history-empty">No entries yet for this field today.</p>
        ) : (
          <div className="mml-history-table-wrap">
            <table className="mml-history-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Time</th>
                  {fieldsMeta.map(f => <th key={f.key}>{f.label}</th>)}
                  {!disabled && <th className="mml-history-th-action" aria-hidden="true" />}
                </tr>
              </thead>
              <tbody>
                {history.slice().reverse().map(({ entry, idx }) => (
                  <tr key={entry.id || idx}>
                    <td>{entry.date ? formatDateToDDMMYYYY(entry.date) : "—"}</td>
                    <td>{entry.time || "—"}</td>
                    {fieldsMeta.map(f => <td key={f.key}>{formatCell(f, entry)}</td>)}
                    {!disabled && (
                      <td className="mml-history-td-action">
                        <button type="button" className="mml-history-remove-btn" title="Remove this reading"
                          onClick={() => onRemove(idx)}>
                          <Trash2 size={13} />
                        </button>
                      </td>
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
          const prog = counts.byBlock[blockKey] || { done: 0, total: 0 };
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
        const blank = emptyEntries()[key][0];
        return { ...prev, [key]: [...list, blank] };
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

  const setEntryField = (block, idx, key, value) => {
    setEntries(prev => {
      const list = [...(prev[block] || [])];
      list[idx] = { ...list[idx], [key]: value };
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

  useEffect(() => {
    if (!enrollmentId) return;
    let cancelled = false;
    const loadToday = async () => {
      setLoading(true);
      setErrors({});
      hydratedRef.current = false;
      try {
        const res = await api.get(
          `/minimal-monitoring/${enrollmentId}/today`,
          { params: { boundary_hour: MML_BOUNDARY_HOUR } }
        );
        if (cancelled) return;
        const data = res?.data || {};
        setSheetDate(data.record_date || "");
        setEntries(hydrateEntries(data));
      } catch (_) {
        if (!cancelled) {
          setEntries(emptyEntries());
          setMessage("Could not load today's sheet. Please try again.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          // Defer so the hydrate setEntries doesn't trigger autosave
          requestAnimationFrame(() => { hydratedRef.current = true; });
        }
      }
    };
    loadToday();
    return () => { cancelled = true; };
  }, [enrollmentId]);

  const validate = () => {
    const next = {};
    (entries.resp_a || []).forEach((e, i) => {
      if (e.max_fio2 !== "" && e.max_fio2 != null && (Number(e.max_fio2) < 21 || Number(e.max_fio2) > 100)) {
        next[`resp_a.${i}.max_fio2`] = "Enter 21 to 100";
      }
    });
    (entries.resp_b || []).forEach((e, i) => {
      if (e.ph !== "" && e.ph != null && (Number(e.ph) < 6.6 || Number(e.ph) > 7.8)) {
        next[`resp_b.${i}.ph`] = "Check pH range";
      }
    });
    (entries.resp_c || []).forEach((e, i) => {
      ["apnea_episodes", "desaturation_episodes", "severe_desaturation_episodes"].forEach(k => {
        if (e[k] !== "" && e[k] != null && (!Number.isInteger(Number(e[k])) || Number(e[k]) < 0)) {
          next[`resp_c.${i}.${k}`] = "Enter a non-negative whole number";
        }
      });
    });
    (entries.resp_d || []).forEach((e, i) => {
      if ((e.postnatal_steroids || []).includes("Other") && !e.steroid_other) {
        next[`resp_d.${i}.steroid_other`] = "Specify other steroid";
      }
    });
    (entries.met_c || []).forEach((e, i) => {
      if (e.symptomatic_status === "symptomatic" && !e.symptomatic_detail) {
        next[`met_c.${i}.symptomatic_detail`] = "Describe symptoms";
      }
    });
    (entries.heme_a || []).forEach((e, i) => {
      if (e.transfusion_count !== "" && e.transfusion_count != null
        && (!Number.isInteger(Number(e.transfusion_count)) || Number(e.transfusion_count) < 0)) {
        next[`heme_a.${i}.transfusion_count`] = "Enter a non-negative whole number";
      }
    });

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const buildPayload = () => ({
    enrollment_id: enrollmentId,
    ...flattenEntries(entries),
    saved_at: new Date().toISOString(),
    saved_by: user?.name || user?.username || "Site User",
  });

  const persist = async ({ silent = false, runValidate = false } = {}) => {
    if (!enrollmentId) return false;
    if (runValidate && !validate()) return false;
    setSaving(true);
    try {
      const res = await api.put(
        `/minimal-monitoring/${enrollmentId}/today`,
        buildPayload(),
        { params: { boundary_hour: MML_BOUNDARY_HOUR } }
      );
      if (res?.data?.record_date) setSheetDate(res.data.record_date);
      dirtyRef.current = false;
      // Keep the sidebar tick in sync with the *current* state, not just
      // whether it was ever true — a reading added then deleted before the
      // next save must un-tick the helper, not leave it stuck complete.
      if (counts.done > 0) markFormCompleted("minimal_monitoring");
      else unmarkFormCompleted("minimal_monitoring");
      if (!silent) {
        setMessage("Today's sheet saved");
        setTimeout(() => setMessage(""), 3000);
      }
      return true;
    } catch (err) {
      setMessage(err?.response?.data?.detail || "Error saving. Please try again.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => persist({ silent: false, runValidate: true });

  const handlePrevious = async () => {
    try { await persist({ silent: true, runValidate: false }); } catch (err) {
      console.error("Save before back failed:", err);
    }
    navigate(`/metab-renal-vasc-eye-log/${enrollmentId}`);
  };

  useRegisterActiveFormSession(() => dirtyRef.current, () => persist({ silent: true, runValidate: false }));

  /* Debounced autosave (~1.5s) after hydrate */
  useEffect(() => {
    if (!hydratedRef.current || !enrollmentId || saveTick === 0) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      persist({ silent: true, runValidate: false });
    }, 1500);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveTick, enrollmentId]);

  const err = (block, idx, key) => errors[`${block}.${idx}.${key}`];

  /** Renders the fields (Item/Num/PillSingle/etc.) for a single lettered
   *  block — this is what shows up once the user drills into one variable,
   *  e.g. Metabolic → Electrolyte abnormality. */
  const renderBlockBody = (blockKey) => {
    switch (blockKey) {
      case "cv_a":
        return (
          <EntryBlock blockKey="cv_a" code="5.1.A" entries={entries.cv_a} disabled={!isEditable}
            onChangeEntry={(i, k, v) => setEntryField("cv_a", i, k, v)}
            onAdd={blank => addEntry("cv_a", blank)}
            onRemove={i => removeEntry("cv_a", i)}
            blankFactory={() => freshEntry({ axillary_temp: "", sbp: "", dbp: "", map_value: "" })}>
            {(e, i) => (
              <>
                <Item n={1} label="Skin/Axillary Temp">
                  <Num value={e.axillary_temp} onChange={v => setEntryField("cv_a", i, "axillary_temp", v)}
                    disabled={!isEditable} unit="°C" />
                </Item>
                <Item n={2} label="SBP">
                  <Num value={e.sbp} onChange={v => setEntryField("cv_a", i, "sbp", v)}
                    disabled={!isEditable} unit="mm Hg" />
                </Item>
                <Item n={3} label="DBP">
                  <Num value={e.dbp} onChange={v => setEntryField("cv_a", i, "dbp", v)}
                    disabled={!isEditable} unit="mm Hg" />
                </Item>
                <Item n={4} label="MAP">
                  <Num value={e.map_value} onChange={v => setEntryField("cv_a", i, "map_value", v)}
                    disabled={!isEditable} unit="mm Hg" />
                </Item>
              </>
            )}
          </EntryBlock>
        );
      case "cv_b":
        return (
          <EntryBlock blockKey="cv_b" code="5.1.B" entries={entries.cv_b} disabled={!isEditable}
            onChangeEntry={(i, k, v) => setEntryField("cv_b", i, k, v)}
            onAdd={blank => addEntry("cv_b", blank)} onRemove={i => removeEntry("cv_b", i)}
            blankFactory={() => freshEntry({ fluid_bolus_given: "" })}>
            {(e, i) => (
              <Item n={1} label="Fluid Bolus given">
                <Txt value={e.fluid_bolus_given} onChange={v => setEntryField("cv_b", i, "fluid_bolus_given", v)}
                  disabled={!isEditable} placeholder="e.g. 10ml/kg NS" />
              </Item>
            )}
          </EntryBlock>
        );
      case "cv_c":
        return (
          <EntryBlock blockKey="cv_c" code="5.1.C" entries={entries.cv_c} disabled={!isEditable}
            onChangeEntry={(i, k, v) => setEntryField("cv_c", i, k, v)}
            onAdd={blank => addEntry("cv_c", blank)} onRemove={i => removeEntry("cv_c", i)}
            blankFactory={() => freshEntry({ vasoactive_drugs: [], vasoactive_dose: "", vasoactive_unit: "" })}>
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
          <EntryBlock blockKey="cv_d" code="5.1.D" entries={entries.cv_d} disabled={!isEditable}
            onChangeEntry={(i, k, v) => setEntryField("cv_d", i, k, v)}
            onAdd={blank => addEntry("cv_d", blank)} onRemove={i => removeEntry("cv_d", i)}
            blankFactory={() => freshEntry({ pda_agent: [], pda_dose: "" })}>
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
          <EntryBlock blockKey="resp_a" code="5.2.A" entries={entries.resp_a} disabled={!isEditable}
            onChangeEntry={(i, k, v) => setEntryField("resp_a", i, k, v)}
            onAdd={blank => addEntry("resp_a", blank)} onRemove={i => removeEntry("resp_a", i)}
            blankFactory={() => freshEntry({ time_range: "", respiratory_modes: [], max_map_cpap: "", max_fio2: "" })}>
            {(e, i) => (
              <>
                <Item n={1} label="Time: Btw" sub="AM/PM range">
                  <Txt value={e.time_range} onChange={v => setEntryField("resp_a", i, "time_range", v)}
                    disabled={!isEditable} placeholder="e.g. 08:00–14:00" />
                </Item>
                <Item n={2} label="Mode">
                  <PillMulti options={["NC", "HFNC", "CPAP", "NIPPV", "SIMV", "A/C", "PSV", "HFOV"]}
                    value={e.respiratory_modes || []} onChange={v => setEntryField("resp_a", i, "respiratory_modes", v)}
                    disabled={!isEditable} />
                </Item>
                <Item n={3} label="Max MAP/CPAP of the hour">
                  <Num value={e.max_map_cpap} onChange={v => setEntryField("resp_a", i, "max_map_cpap", v)}
                    disabled={!isEditable} unit="cm H₂O" />
                </Item>
                <Item n={4} label="Max FiO₂ of the hour" error={err("resp_a", i, "max_fio2")}>
                  <Num value={e.max_fio2} onChange={v => setEntryField("resp_a", i, "max_fio2", v)}
                    disabled={!isEditable} unit="%" error={err("resp_a", i, "max_fio2")} />
                </Item>
              </>
            )}
          </EntryBlock>
        );
      case "resp_b":
        return (
          <EntryBlock blockKey="resp_b" code="5.2.B" entries={entries.resp_b} disabled={!isEditable}
            onChangeEntry={(i, k, v) => setEntryField("resp_b", i, k, v)}
            onAdd={blank => addEntry("resp_b", blank)} onRemove={i => removeEntry("resp_b", i)}
            blankFactory={() => freshEntry({ ph: "", pao2: "", paco2: "" })}>
            {(e, i) => (
              <>
                <Item n={1} label="pH" error={err("resp_b", i, "ph")}>
                  <Num value={e.ph} onChange={v => setEntryField("resp_b", i, "ph", v)}
                    disabled={!isEditable} step="0.01" error={err("resp_b", i, "ph")} />
                </Item>
                <Item n={2} label="PaO₂">
                  <Num value={e.pao2} onChange={v => setEntryField("resp_b", i, "pao2", v)}
                    disabled={!isEditable} unit="mm Hg" />
                </Item>
                <Item n={3} label="PaCO₂">
                  <Num value={e.paco2} onChange={v => setEntryField("resp_b", i, "paco2", v)}
                    disabled={!isEditable} unit="mm Hg" />
                </Item>
              </>
            )}
          </EntryBlock>
        );
      case "resp_c":
        return (
          <EntryBlock blockKey="resp_c" code="5.2.C" entries={entries.resp_c} disabled={!isEditable}
            onChangeEntry={(i, k, v) => setEntryField("resp_c", i, k, v)}
            onAdd={blank => addEntry("resp_c", blank)} onRemove={i => removeEntry("resp_c", i)}
            blankFactory={() => freshEntry({ shift: "", apnea_episodes: "", desaturation_episodes: "", severe_desaturation_episodes: "" })}>
            {(e, i) => (
              <>
                <Item n={1} label="Select Shift">
                  <PillSingle options={["Morning", "Evening", "Night"]} value={e.shift}
                    onChange={v => setEntryField("resp_c", i, "shift", v)} disabled={!isEditable} />
                </Item>
                <Item n={2} label="Apnea episodes" error={err("resp_c", i, "apnea_episodes")}>
                  <Num value={e.apnea_episodes}
                    onChange={v => setEntryField("resp_c", i, "apnea_episodes", v)}
                    disabled={!isEditable} error={err("resp_c", i, "apnea_episodes")} />
                </Item>
                <Item n={3} label="Desaturation episodes" error={err("resp_c", i, "desaturation_episodes")}>
                  <Num value={e.desaturation_episodes}
                    onChange={v => setEntryField("resp_c", i, "desaturation_episodes", v)}
                    disabled={!isEditable} error={err("resp_c", i, "desaturation_episodes")} />
                </Item>
                <Item n={4} label="Sev. desaturation episodes" error={err("resp_c", i, "severe_desaturation_episodes")}>
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
          <EntryBlock blockKey="resp_d" code="5.2.D" entries={entries.resp_d} disabled={!isEditable}
            onChangeEntry={(i, k, v) => setEntryField("resp_d", i, k, v)}
            onAdd={blank => addEntry("resp_d", blank)} onRemove={i => removeEntry("resp_d", i)}
            blankFactory={() => freshEntry({ postnatal_steroids: [], steroid_dose: "", steroid_other: "" })}>
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
                  <Item n={3} label="If Other, specify" error={err("resp_d", i, "steroid_other")}>
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
          <EntryBlock blockKey="met_a" code="5.3.A" entries={entries.met_a} disabled={!isEditable}
            onChangeEntry={(i, k, v) => setEntryField("met_a", i, k, v)}
            onAdd={blank => addEntry("met_a", blank)} onRemove={i => removeEntry("met_a", i)}
            blankFactory={() => freshEntry({ glucose: "" })}>
            {(e, i) => (
              <Item n={1} label="Glucose">
                <Num value={e.glucose} onChange={v => setEntryField("met_a", i, "glucose", v)}
                  disabled={!isEditable} unit="mg/dL" />
              </Item>
            )}
          </EntryBlock>
        );
      case "met_b":
        return (
          <EntryBlock blockKey="met_b" code="5.3.B" entries={entries.met_b} disabled={!isEditable}
            onChangeEntry={(i, k, v) => setEntryField("met_b", i, k, v)}
            onAdd={blank => addEntry("met_b", blank)} onRemove={i => removeEntry("met_b", i)}
            blankFactory={() => freshEntry({ alp: "", total_calcium: "", phosphorus: "" })}>
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
      case "met_c":
        return (
          <EntryBlock blockKey="met_c" code="5.3.C" entries={entries.met_c} disabled={!isEditable}
            onChangeEntry={(i, k, v) => setEntryField("met_c", i, k, v)}
            onAdd={blank => addEntry("met_c", blank)} onRemove={i => removeEntry("met_c", i)}
            blankFactory={() => freshEntry({
              electrolyte_abnormality: null, electrolytes: [], hypo_hyper: "",
              symptomatic_status: "", symptomatic_detail: "",
            })}>
            {(e, i) => (
              <>
                <Item n={1} label="Electrolyte abnormality">
                  <YNToggle value={e.electrolyte_abnormality}
                    onChange={v => setEntryField("met_c", i, "electrolyte_abnormality", v)}
                    disabled={!isEditable} />
                  {e.electrolyte_abnormality === true && (
                    <div style={{ marginTop: 8 }}>
                      <PillMulti options={["Na", "K", "Ionized Ca"]} value={e.electrolytes || []}
                        onChange={v => setEntryField("met_c", i, "electrolytes", v)}
                        disabled={!isEditable} />
                    </div>
                  )}
                </Item>
                <Item n={2} label="Hypo/Hyper">
                  <PillSingle options={["Hypo", "Hyper"]} value={e.hypo_hyper}
                    onChange={v => setEntryField("met_c", i, "hypo_hyper", v)} disabled={!isEditable} />
                </Item>
                <Item n={3} label="Symptomatic/asymptomatic">
                  <PillSingle options={["symptomatic", "asymptomatic"]} value={e.symptomatic_status}
                    onChange={v => setEntryField("met_c", i, "symptomatic_status", v)} disabled={!isEditable} />
                </Item>
                {e.symptomatic_status === "symptomatic" && (
                  <Item n={4} label="If symptomatic" error={err("met_c", i, "symptomatic_detail")}>
                    <Txt value={e.symptomatic_detail}
                      onChange={v => setEntryField("met_c", i, "symptomatic_detail", v)}
                      disabled={!isEditable} error={err("met_c", i, "symptomatic_detail")} />
                  </Item>
                )}
              </>
            )}
          </EntryBlock>
        );
      case "gi_a":
        return (
          <EntryBlock blockKey="gi_a" code="5.4.A" entries={entries.gi_a} disabled={!isEditable}
            onChangeEntry={(i, k, v) => setEntryField("gi_a", i, k, v)}
            onAdd={blank => addEntry("gi_a", blank)} onRemove={i => removeEntry("gi_a", i)}
            blankFactory={() => freshEntry({ shift: "", cumulative_feed_volume: "" })}>
            {(e, i) => (
              <>
                <Item n={1} label="Select Shift">
                  <PillSingle options={["Morning", "Evening", "Night"]} value={e.shift}
                    onChange={v => setEntryField("gi_a", i, "shift", v)} disabled={!isEditable} />
                </Item>
                <Item n={2} label="Cumulative feed volume">
                  <Num value={e.cumulative_feed_volume}
                    onChange={v => setEntryField("gi_a", i, "cumulative_feed_volume", v)}
                    disabled={!isEditable} unit="ml" />
                </Item>
              </>
            )}
          </EntryBlock>
        );
      case "gi_b":
        return (
          <EntryBlock blockKey="gi_b" code="5.4.B" entries={entries.gi_b} disabled={!isEditable}
            onChangeEntry={(i, k, v) => setEntryField("gi_b", i, k, v)}
            onAdd={blank => addEntry("gi_b", blank)} onRemove={i => removeEntry("gi_b", i)}
            blankFactory={() => freshEntry({ direct_bilirubin: "" })}>
            {(e, i) => (
              <Item n={1} label="Direct Bilirubin">
                <Num value={e.direct_bilirubin}
                  onChange={v => setEntryField("gi_b", i, "direct_bilirubin", v)}
                  disabled={!isEditable} unit="mg/dL" />
              </Item>
            )}
          </EntryBlock>
        );
      case "neuro_a":
        return (
          <EntryBlock blockKey="neuro_a" code="5.5.A" entries={entries.neuro_a} disabled={!isEditable}
            onChangeEntry={(i, k, v) => setEntryField("neuro_a", i, k, v)}
            onAdd={blank => addEntry("neuro_a", blank)} onRemove={i => removeEntry("neuro_a", i)}
            blankFactory={() => freshEntry({ ventriculomegaly_severity: "", vi: "", ahw: "" })}>
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
        );
      case "neuro_b":
        return (
          <EntryBlock blockKey="neuro_b" code="5.5.B" entries={entries.neuro_b} disabled={!isEditable}
            onChangeEntry={(i, k, v) => setEntryField("neuro_b", i, k, v)}
            onAdd={blank => addEntry("neuro_b", blank)} onRemove={i => removeEntry("neuro_b", i)}
            blankFactory={() => freshEntry({ tod: "", aca_ri: "", mca_ri: "" })}>
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
        );
      case "heme_a":
        return (
          <EntryBlock blockKey="heme_a" code="5.6.A" entries={entries.heme_a} disabled={!isEditable}
            onChangeEntry={(i, k, v) => setEntryField("heme_a", i, k, v)}
            onAdd={blank => addEntry("heme_a", blank)} onRemove={i => removeEntry("heme_a", i)}
            blankFactory={() => freshEntry({ transfusion_products: [], transfusion_count: "", prbc_volume: "" })}>
            {(e, i) => (
              <>
                <Item n={1} label="Transfusion">
                  <PillMulti options={["PRBC", "Platelets", "FFP/Cryo"]} value={e.transfusion_products || []}
                    onChange={v => setEntryField("heme_a", i, "transfusion_products", v)}
                    disabled={!isEditable} />
                </Item>
                <Item n={2} label="No. of transfusions" error={err("heme_a", i, "transfusion_count")}>
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
            <div className="rcn-patient-header-badge">HELPER FORM 5</div>
            <h2 className="rcn-patient-header-form-name">Minimal Monitoring</h2>
            <p className="rcn-patient-header-subtitle">
              Same-day scratchpad — jot spot values as they occur, then copy into the CRF helpers
            </p>
            <p className="mml-sheet-note">
              Today's sheet{sheetDate ? ` (${formatDateToDDMMYYYY(sheetDate)})` : ""} — clears automatically after 8:00 AM
            </p>
          </div>
          <div className="rcn-patient-cards">
            <MetricCard label="Enrolment ID" value={patientInfo.enrollmentId} tone="blue" />
            <MetricCard label="Gestation" value={patientInfo.gestation} tone="teal" />
            <MetricCard label="Mother's Name" value={patientInfo.motherName} tone="violet" />
            <MetricCard label="Baby UID" value={patientInfo.babyUid} tone="amber" />
          </div>
        </div>

        {loading ? <div className="rcn-loading">Loading today's sheet...</div> : (
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
                <p className="mml-fields-list-hint">Date and time are auto-filled to now — adjust if needed.</p>
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
