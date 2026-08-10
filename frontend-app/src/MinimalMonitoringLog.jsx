import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, AlertTriangle, ChevronDown, Edit, Lock, Plus, Save, Send, Trash2,
  Heart, Wind, Beaker, Utensils, Brain, Droplet,
} from "lucide-react";
import api from "./api/axios";
import { useAuth } from "./context/AuthContext";
import { useFormProgress } from "./context/FormProgressContext";
import { toDateOnlyValue } from "./utils/datetime";
import "./styles/RespCVNeuro.css";
import "./styles/MinimalMonitoring.css";

const STATUS = {
  EMPTY: "empty",
  DRAFT: "draft",
  COMPLETE: "complete",
  SUBMITTED: "submitted",
};

const SECTION_META = {
  cardiovascular: { code: "5.1", title: "Cardiovascular", icon: Heart },
  respiratory: { code: "5.2", title: "Respiratory", icon: Wind },
  metabolic: { code: "5.3", title: "Metabolic", icon: Beaker },
  gastrointestinal: { code: "5.4", title: "Gastrointestinal", icon: Utensils },
  neurological: { code: "5.5", title: "Neurological", icon: Brain },
  hematology: { code: "5.6", title: "Hematology", icon: Droplet },
};

const BLOCK_TO_SECTION = {
  cv_a: "cardiovascular", cv_b: "cardiovascular", cv_c: "cardiovascular", cv_d: "cardiovascular",
  resp_a: "respiratory", resp_b: "respiratory", resp_c: "respiratory", resp_d: "respiratory",
  met_a: "metabolic", met_b: "metabolic", met_c: "metabolic",
  gi_a: "gastrointestinal", gi_b: "gastrointestinal",
  neuro_a: "neurological", neuro_b: "neurological",
  heme_a: "hematology",
};

const pad2 = n => String(n).padStart(2, "0");
const nowTime = (d = new Date()) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const ans = v => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0);
const listToString = v => Array.isArray(v) ? v.join(",") : (v || "");
const stringToList = v => Array.isArray(v) ? v : String(v || "").split(",").map(s => s.trim()).filter(Boolean);
const asNumber = v => v === "" || v === null || v === undefined ? null : Number(v);
const asInteger = v => v === "" || v === null || v === undefined ? null : parseInt(v, 10);

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

  const bump = (section, ok) => {
    total += 1;
    bySection[section].total += 1;
    if (ok) { done += 1; bySection[section].done += 1; }
  };

  Object.entries(entries).forEach(([block, list]) => {
    const section = BLOCK_TO_SECTION[block];
    (list || []).forEach(entry => {
      Object.entries(entry).forEach(([k, v]) => {
        if (k === "id") return;
        // Conditional slots
        if (k === "steroid_other" && !(entry.postnatal_steroids || []).includes("Other")) return;
        if (k === "symptomatic_detail" && entry.symptomatic_status !== "symptomatic") return;
        if (k === "electrolytes" && entry.electrolyte_abnormality !== true) return;
        if ((k === "vasoactive_dose" || k === "vasoactive_unit") && !(entry.vasoactive_drugs || []).length) return;
        if (k === "prbc_volume" && !(entry.transfusion_products || []).includes("PRBC")) return;
        bump(section, ans(v));
      });
    });
  });

  return {
    done,
    total,
    pct: total ? Math.round((done / total) * 100) : 0,
    bySection,
    canSubmit: ans(entries.cv_a?.[0]?.date) && ans(entries.cv_a?.[0]?.shift),
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

function ProgressRing({ percent }) {
  const r = 24;
  const circ = 2 * Math.PI * r;
  const offset = circ - (percent / 100) * circ;
  return (
    <div className="rcn-ring">
      <svg width="58" height="58" viewBox="0 0 58 58">
        <circle className="rcn-ring-bg" cx="29" cy="29" r={r} />
        <circle className="rcn-ring-fill" cx="29" cy="29" r={r}
          strokeDasharray={circ} strokeDashoffset={offset}
          style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%" }} />
      </svg>
      <span className="rcn-ring-text">{percent}%</span>
    </div>
  );
}

function SectionCard({ icon: Icon, code, title, answered, total, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  const pct = total > 0 ? Math.round((answered / total) * 100) : 0;
  return (
    <section className="rcn-card">
      <div className="rcn-card-header" onClick={() => setOpen(o => !o)}>
        <div className="rcn-card-header-left">
          <div className="rcn-card-icon-wrap"><Icon size={20} className="rcn-card-icon" /></div>
          <div><h3 className="rcn-card-title">{code} {title}</h3></div>
        </div>
        <div className="rcn-card-header-right">
          <div className="rcn-card-prog-bar"><div className="rcn-card-prog-fill" style={{ width: `${pct}%` }} /></div>
          <span className="rcn-card-prog-text">{answered}/{total}</span>
          <div className={`rcn-chevron${open ? " rcn-chevron-open" : ""}`}><ChevronDown size={16} /></div>
        </div>
      </div>
      {open && (<><div className="rcn-card-divider" /><div className="rcn-card-body">{children}</div></>)}
    </section>
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

/** One lettered CRF block (5.x.Y) with date/time header and + Add support. */
function EntryBlock({
  code, entries, onChangeEntry, onAdd, onRemove, disabled, blankFactory, children,
}) {
  return (
    <div className="rcn-subsection mml-subblock">
      <div className="mml-subblock-head">
        <span className="mml-subblock-code">{code}</span>
      </div>
      {entries.map((entry, idx) => (
        <div className="mml-entry" key={entry.id || idx}>
          <div className="mml-entry-head">
            <div className="mml-entry-meta">
              {entries.length > 1 && <span className="mml-entry-badge">#{idx + 1}</span>}
              <label className="mml-meta-field">
                <span>Date</span>
                <input type="date" className="rcn-text-input mml-date-input" value={entry.date || ""}
                  disabled={disabled} onChange={e => onChangeEntry(idx, "date", e.target.value)} />
              </label>
              <label className="mml-meta-field">
                <span>Time</span>
                <input type="time" className="rcn-text-input mml-time-input" value={entry.time || ""}
                  disabled={disabled} onChange={e => onChangeEntry(idx, "time", e.target.value)} />
              </label>
            </div>
            {entries.length > 1 && !disabled && (
              <button type="button" className="mml-remove-btn" title="Remove this reading"
                onClick={() => onRemove(idx)}><Trash2 size={14} /></button>
            )}
          </div>
          <div className="rcn-grid-3">{children(entry, idx)}</div>
        </div>
      ))}
      {!disabled && (
        <button type="button" className="mml-add-btn"
          onClick={() => onAdd(blankFactory ? blankFactory() : freshEntry())}>
          <Plus size={14} /> Add values
        </button>
      )}
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
  const { markFormCompleted } = useFormProgress();
  const enrollmentId = params.enrollmentId || localStorage.getItem("current_enrollment_id") || "";

  const [activeDay, setActiveDay] = useState(1);
  const [totalDays, setTotalDays] = useState(14);
  const [entries, setEntries] = useState(emptyEntries);
  const [dayStatuses, setDayStatuses] = useState({});
  const [dayMeta, setDayMeta] = useState({});
  const [patientInfo, setPatientInfo] = useState({ enrollmentId, motherName: "", babyUid: "", gestation: "" });
  const [isSaved, setIsSaved] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState({});

  const isSubmitted = (dayStatuses[activeDay] || STATUS.EMPTY) === STATUS.SUBMITTED;
  const isEditable = !isSubmitted && (!isSaved || isEditing);
  const counts = useMemo(() => countProgress(entries), [entries]);

  const setEntryField = (block, idx, key, value) => {
    if (!isEditable) return;
    setEntries(prev => {
      const list = [...(prev[block] || [])];
      list[idx] = { ...list[idx], [key]: value };
      return { ...prev, [block]: list };
    });
    setErrors(prev => ({ ...prev, [`${block}.${idx}.${key}`]: null }));
  };

  const addEntry = (block, blank) => {
    if (!isEditable) return;
    setEntries(prev => ({ ...prev, [block]: [...(prev[block] || []), blank] }));
  };

  const removeEntry = (block, idx) => {
    if (!isEditable) return;
    setEntries(prev => {
      const list = [...(prev[block] || [])];
      if (list.length <= 1) return prev;
      list.splice(idx, 1);
      return { ...prev, [block]: list };
    });
  };

  useEffect(() => {
    if (!enrollmentId) return;
    const load = async () => {
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
      try {
        const summary = await api.get(`/minimal-monitoring/${enrollmentId}/summary`);
        const statuses = {};
        const meta = {};
        (summary?.data || []).forEach(s => {
          statuses[s.nicu_day] = s.submission_status || STATUS.DRAFT;
          meta[s.nicu_day] = { pct: s.completion_pct || 0 };
        });
        setDayStatuses(statuses);
        setDayMeta(meta);
      } catch (_) {}
    };
    load();
  }, [enrollmentId]);

  useEffect(() => {
    if (!enrollmentId) return;
    const loadDay = async () => {
      setLoading(true);
      setErrors({});
      try {
        const res = await api.get(`/minimal-monitoring/${enrollmentId}/${activeDay}`);
        setEntries(hydrateEntries(res?.data || {}));
        setIsSaved(true);
        setIsEditing(false);
        setDayStatuses(prev => ({ ...prev, [activeDay]: res?.data?.submission_status || STATUS.DRAFT }));
      } catch (err) {
        if (err?.response?.status === 404) {
          setEntries(emptyEntries());
          setIsSaved(false);
          setIsEditing(false);
          setDayStatuses(prev => ({ ...prev, [activeDay]: STATUS.EMPTY }));
        } else {
          setMessage("Could not load this day. Please try again.");
        }
      } finally {
        setLoading(false);
      }
    };
    loadDay();
  }, [enrollmentId, activeDay]);

  const validate = () => {
    const next = {};
    const cvA = entries.cv_a?.[0];
    if (!cvA?.date) next["cv_a.0.date"] = "Date is required";
    if (!cvA?.shift) next["cv_a.0.shift"] = "Shift is required";

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

  const payload = () => ({
    enrollment_id: enrollmentId,
    nicu_day: activeDay,
    ...flattenEntries(entries),
    submission_status: STATUS.DRAFT,
    saved_at: new Date().toISOString(),
    saved_by: user?.name || user?.username || "Site User",
  });

  const handleSave = async () => {
    if (!validate() || !isEditable) return false;
    setSaving(true);
    try {
      const body = payload();
      isSaved
        ? await api.put(`/minimal-monitoring/${enrollmentId}/${activeDay}`, body)
        : await api.post("/minimal-monitoring/", body);
      markFormCompleted("minimal_monitoring");
      setIsSaved(true);
      setIsEditing(false);
      const status = counts.canSubmit ? STATUS.COMPLETE : STATUS.DRAFT;
      setDayStatuses(prev => ({ ...prev, [activeDay]: status }));
      setDayMeta(prev => ({ ...prev, [activeDay]: { pct: counts.pct } }));
      setMessage(`Day ${activeDay} saved successfully`);
      setTimeout(() => setMessage(""), 3000);
      return true;
    } catch (err) {
      setMessage(err?.response?.data?.detail || "Error saving. Please try again.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!counts.canSubmit) {
      setMessage("Enter Date and Shift in 5.1.A before submitting this day.");
      return;
    }
    setSubmitting(true);
    try {
      const saved = isEditable ? await handleSave() : true;
      if (!saved) return;
      const now = new Date().toISOString();
      await api.patch(`/minimal-monitoring/${enrollmentId}/${activeDay}/submit`, {
        submission_status: STATUS.SUBMITTED,
        submitted_at: now,
        submitted_by: user?.name || user?.username || "Site User",
      });
      setDayStatuses(prev => ({ ...prev, [activeDay]: STATUS.SUBMITTED }));
      setIsEditing(false);
      setMessage(`Day ${activeDay} submitted and locked`);
      setTimeout(() => setMessage(""), 4000);
    } catch (err) {
      setMessage(err?.response?.data?.detail || "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const days = Array.from({ length: totalDays }, (_, i) => i + 1);
  const err = (block, idx, key) => errors[`${block}.${idx}.${key}`];

  return (
    <>
      <div className="rcn-page">
        <div className="rcn-patient-header">
          <div className="rcn-patient-header-title">
            <div className="rcn-patient-header-badge">HELPER FORM 5</div>
            <h2 className="rcn-patient-header-form-name">Minimal Monitoring</h2>
            <p className="rcn-patient-header-subtitle">
              Fill for each shift or when values are available — Date/Time default to now
            </p>
          </div>
          <div className="rcn-patient-cards">
            <MetricCard label="Enrolment ID" value={patientInfo.enrollmentId} tone="blue" />
            <MetricCard label="Gestation" value={patientInfo.gestation} tone="teal" />
            <MetricCard label="Mother's Name" value={patientInfo.motherName} tone="violet" />
            <MetricCard label="Baby UID" value={patientInfo.babyUid} tone="amber" />
          </div>
        </div>

        <div className="rcn-timeline-wrap">
          <div className="rcn-timeline-header">
            <span className="rcn-timeline-label">Days</span>
            <button type="button" className="rcn-day-add"
              onClick={() => { setTotalDays(totalDays + 1); setActiveDay(totalDays + 1); }}>
              <span className="rcn-day-add-plus">+</span><span className="rcn-day-add-label">Day</span>
            </button>
          </div>
          <div className="rcn-timeline">
            {days.map(day => {
              const st = dayStatuses[day] || STATUS.EMPTY;
              return (
                <button key={day} type="button"
                  className={`rcn-day ${day === activeDay ? "rcn-day--active" : ""} rcn-day--${st}`}
                  onClick={() => setActiveDay(day)}>
                  <span className="rcn-day-d">D</span>
                  <span className="rcn-day-num">{day}</span>
                  {st === STATUS.SUBMITTED
                    ? <Lock size={10} className="rcn-day-dot" />
                    : <span className="rcn-day-dot" />}
                  <span className="rcn-day-date">{dayMeta[day]?.pct ? `${dayMeta[day].pct}%` : ""}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rcn-summary">
          <div className="rcn-summary-left">
            <h2 className="rcn-summary-title">Day {activeDay}</h2>
            <div className="rcn-summary-meta">
              {isSubmitted ? <Lock size={13} /> : <AlertTriangle size={13} />}
              <span>
                {isSubmitted
                  ? "Submitted and locked"
                  : counts.canSubmit
                    ? `${counts.done} values entered — ready to submit`
                    : "Enter Date + Shift in 5.1.A to enable submit"}
              </span>
            </div>
          </div>
          <div className="rcn-summary-right">
            <div className="rcn-summary-sections">
              {Object.entries(counts.bySection).map(([key, value]) => (
                <div className="rcn-summary-section" key={key}>
                  <span className="rcn-summary-section-name">{SECTION_META[key]?.code || key}</span>
                  <span className="rcn-summary-section-count">
                    {value.done}<span className="rcn-summary-section-total">/{value.total}</span>
                  </span>
                  <div className="rcn-summary-section-bar">
                    <div className="rcn-summary-section-bar-fill"
                      style={{ width: `${value.total ? (value.done / value.total) * 100 : 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="rcn-summary-ring-wrap">
              <ProgressRing percent={counts.pct} />
              <span className="rcn-summary-ring-label">Filled</span>
            </div>
          </div>
        </div>

        {isSubmitted && (
          <div className="rcn-status-banner rcn-status-banner--submitted" style={{ margin: "16px 24px 0" }}>
            <Lock size={15} />
            <div className="rcn-status-banner-text">
              <strong>Day {activeDay} submitted</strong>
              <span>This day is locked from further edits.</span>
            </div>
          </div>
        )}

        {loading ? <div className="rcn-loading">Loading day {activeDay} data...</div> : (
          <div className="rcn-sections">

            {/* ════════════════ 5.1 CARDIOVASCULAR ════════════════ */}
            <SectionCard icon={SECTION_META.cardiovascular.icon} code={SECTION_META.cardiovascular.code}
              title={SECTION_META.cardiovascular.title}
              answered={counts.bySection.cardiovascular.done} total={counts.bySection.cardiovascular.total}>

              <EntryBlock code="5.1.A" entries={entries.cv_a} disabled={!isEditable}
                onChangeEntry={(i, k, v) => setEntryField("cv_a", i, k, v)}
                onAdd={blank => addEntry("cv_a", blank)}
                onRemove={i => removeEntry("cv_a", i)}
                blankFactory={() => freshEntry({ shift: "", axillary_temp: "", sbp: "", dbp: "", map_value: "" })}>
                {(e, i) => (
                  <>
                    <Item n={1} label="Select Shift" error={err("cv_a", i, "shift")}>
                      <PillSingle options={["Morning", "Evening", "Night"]} value={e.shift}
                        onChange={v => setEntryField("cv_a", i, "shift", v)} disabled={!isEditable} />
                    </Item>
                    <Item n={2} label="Axillary Temp">
                      <Num value={e.axillary_temp} onChange={v => setEntryField("cv_a", i, "axillary_temp", v)}
                        disabled={!isEditable} unit="°C" />
                    </Item>
                    <Item n={3} label="SBP">
                      <Num value={e.sbp} onChange={v => setEntryField("cv_a", i, "sbp", v)}
                        disabled={!isEditable} unit="mm Hg" />
                    </Item>
                    <Item n={4} label="DBP">
                      <Num value={e.dbp} onChange={v => setEntryField("cv_a", i, "dbp", v)}
                        disabled={!isEditable} unit="mm Hg" />
                    </Item>
                    <Item n={5} label="MAP">
                      <Num value={e.map_value} onChange={v => setEntryField("cv_a", i, "map_value", v)}
                        disabled={!isEditable} unit="mm Hg" />
                    </Item>
                  </>
                )}
              </EntryBlock>

              <EntryBlock code="5.1.B" entries={entries.cv_b} disabled={!isEditable}
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

              <EntryBlock code="5.1.C" entries={entries.cv_c} disabled={!isEditable}
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

              <EntryBlock code="5.1.D" entries={entries.cv_d} disabled={!isEditable}
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
            </SectionCard>

            {/* ════════════════ 5.2 RESPIRATORY ════════════════ */}
            <SectionCard icon={SECTION_META.respiratory.icon} code={SECTION_META.respiratory.code}
              title={SECTION_META.respiratory.title}
              answered={counts.bySection.respiratory.done} total={counts.bySection.respiratory.total}>

              <EntryBlock code="5.2.A" entries={entries.resp_a} disabled={!isEditable}
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

              <EntryBlock code="5.2.B" entries={entries.resp_b} disabled={!isEditable}
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
                        disabled={!isEditable} unit="mmHg" />
                    </Item>
                    <Item n={3} label="PaCO₂">
                      <Num value={e.paco2} onChange={v => setEntryField("resp_b", i, "paco2", v)}
                        disabled={!isEditable} unit="mmHg" />
                    </Item>
                  </>
                )}
              </EntryBlock>

              <EntryBlock code="5.2.C" entries={entries.resp_c} disabled={!isEditable}
                onChangeEntry={(i, k, v) => setEntryField("resp_c", i, k, v)}
                onAdd={blank => addEntry("resp_c", blank)} onRemove={i => removeEntry("resp_c", i)}
                blankFactory={() => freshEntry({ shift: "", apnea_episodes: "", desaturation_episodes: "", severe_desaturation_episodes: "" })}>
                {(e, i) => (
                  <>
                    <Item n={1} label="Select Shift">
                      <PillSingle options={["Morning", "Evening", "Night"]} value={e.shift}
                        onChange={v => setEntryField("resp_c", i, "shift", v)} disabled={!isEditable} />
                    </Item>
                    <Item n={2} label="Apnea Episodes" error={err("resp_c", i, "apnea_episodes")}>
                      <Num value={e.apnea_episodes} onChange={v => setEntryField("resp_c", i, "apnea_episodes", v)}
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

              <EntryBlock code="5.2.D" entries={entries.resp_d} disabled={!isEditable}
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
            </SectionCard>

            {/* ════════════════ 5.3 METABOLIC ════════════════ */}
            <SectionCard icon={SECTION_META.metabolic.icon} code={SECTION_META.metabolic.code}
              title={SECTION_META.metabolic.title}
              answered={counts.bySection.metabolic.done} total={counts.bySection.metabolic.total}>

              <EntryBlock code="5.3.A" entries={entries.met_a} disabled={!isEditable}
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

              <EntryBlock code="5.3.B" entries={entries.met_b} disabled={!isEditable}
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

              <EntryBlock code="5.3.C" entries={entries.met_c} disabled={!isEditable}
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
            </SectionCard>

            {/* ════════════════ 5.4 GASTROINTESTINAL ════════════════ */}
            <SectionCard icon={SECTION_META.gastrointestinal.icon} code={SECTION_META.gastrointestinal.code}
              title={SECTION_META.gastrointestinal.title}
              answered={counts.bySection.gastrointestinal.done} total={counts.bySection.gastrointestinal.total}>

              <EntryBlock code="5.4.A" entries={entries.gi_a} disabled={!isEditable}
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

              <EntryBlock code="5.4.B" entries={entries.gi_b} disabled={!isEditable}
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
            </SectionCard>

            {/* ════════════════ 5.5 NEUROLOGICAL ════════════════ */}
            <SectionCard icon={SECTION_META.neurological.icon} code={SECTION_META.neurological.code}
              title={SECTION_META.neurological.title}
              answered={counts.bySection.neurological.done} total={counts.bySection.neurological.total}>

              <EntryBlock code="5.5.A" entries={entries.neuro_a} disabled={!isEditable}
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

              <EntryBlock code="5.5.B" entries={entries.neuro_b} disabled={!isEditable}
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
            </SectionCard>

            {/* ════════════════ 5.6 HEMATOLOGY ════════════════ */}
            <SectionCard icon={SECTION_META.hematology.icon} code={SECTION_META.hematology.code}
              title={SECTION_META.hematology.title}
              answered={counts.bySection.hematology.done} total={counts.bySection.hematology.total}>

              <EntryBlock code="5.6.A" entries={entries.heme_a} disabled={!isEditable}
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
            </SectionCard>
          </div>
        )}

        {message && (
          <div className={`form-message${message.includes("saved") || message.includes("submitted") ? " form-message--success" : " form-message--error"}`}>
            {message}
          </div>
        )}
      </div>

      <div className="form-navigation">
        <button type="button" className="btn btn-secondary btn-outline"
          onClick={() => navigate(`/metab-renal-vasc-eye-log/${enrollmentId}`)}>
          <ArrowLeft size={15} /> Metab Helper Form
        </button>
        {isEditable && (
          <button type="button" className="btn btn-save btn-outline-blue" onClick={handleSave} disabled={saving}>
            <Save size={15} /> {saving ? "Saving..." : "Save"}
          </button>
        )}
        {isSaved && !isEditing && !isSubmitted && (
          <button type="button" className="btn btn-edit btn-outline-blue" onClick={() => setIsEditing(true)}>
            <Edit size={13} /> Edit Day {activeDay}
          </button>
        )}
        {isSubmitted ? (
          <div className="rcn-locked-badge"><Lock size={13} /> Day {activeDay} Locked</div>
        ) : (
          <button type="button" className="btn btn-submit-day" onClick={handleSubmit}
            disabled={submitting || !counts.canSubmit}>
            <Send size={15} /> {submitting ? "Submitting..." : `Submit Day ${activeDay}`}
          </button>
        )}
      </div>
    </>
  );
}
