import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Activity, AlertTriangle, ArrowLeft, CheckCircle, Edit, Lock, Save, Send } from "lucide-react";
import api from "./api/axios";
import { useAuth } from "./context/AuthContext";
import { useFormProgress } from "./context/FormProgressContext";
import "./styles/RespCVNeuro.css";

const STATUS = {
  EMPTY: "empty",
  DRAFT: "draft",
  COMPLETE: "complete",
  SUBMITTED: "submitted",
};

const emptyForm = {
  record_date: "",
  shift: "",
  axillary_temp: "",
  sbp: "",
  dbp: "",
  map_value: "",
  fluid_bolus_given: "",
  vasoactive_drugs: [],
  vasoactive_dose: "",
  vasoactive_unit: "",
  pda_agent: [],
  pda_dose: "",
  respiratory_time: "",
  respiratory_modes: [],
  max_map_cpap: "",
  max_fio2: "",
  ph: "",
  pao2: "",
  paco2: "",
  apnea_episodes: "",
  desaturation_episodes: "",
  severe_desaturation_episodes: "",
  postnatal_steroids: [],
  steroid_dose: "",
  glucose: "",
  alp: "",
  total_calcium: "",
  phosphorus: "",
  electrolyte_abnormality: null,
  electrolytes: [],
  hypo_hyper: "",
  symptomatic_status: "",
  symptomatic_detail: "",
  cumulative_feed_volume: "",
  direct_bilirubin: "",
  imaging_date: "",
  ventriculomegaly_severity: "",
  vi: "",
  ahw: "",
  tod: "",
  aca_ri: "",
  mca_ri: "",
  transfusion_products: [],
  transfusion_count: "",
  prbc_volume: "",
};

const sectionFields = {
  cardiovascular: ["record_date", "shift", "axillary_temp", "sbp", "dbp", "map_value", "fluid_bolus_given", "vasoactive_drugs", "vasoactive_dose", "vasoactive_unit", "pda_agent", "pda_dose"],
  respiratory: ["respiratory_time", "respiratory_modes", "max_map_cpap", "max_fio2", "ph", "pao2", "paco2", "apnea_episodes", "desaturation_episodes", "severe_desaturation_episodes", "postnatal_steroids", "steroid_dose"],
  metabolic: ["glucose", "alp", "total_calcium", "phosphorus", "electrolyte_abnormality", "electrolytes", "hypo_hyper", "symptomatic_status"],
  gastrointestinal: ["cumulative_feed_volume", "direct_bilirubin"],
  neurological: ["imaging_date", "ventriculomegaly_severity", "vi", "ahw", "tod", "aca_ri", "mca_ri"],
  hematology: ["transfusion_products", "transfusion_count", "prbc_volume"],
};

const allRequired = Object.values(sectionFields).flat();
const ans = v => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0);
const listToString = v => Array.isArray(v) ? v.join(",") : (v || "");
const stringToList = v => Array.isArray(v) ? v : String(v || "").split(",").map(s => s.trim()).filter(Boolean);
const asNumber = v => v === "" || v === null || v === undefined ? null : Number(v);
const asInteger = v => v === "" || v === null || v === undefined ? null : parseInt(v, 10);

function formatGestation(weeks, days) {
  if (weeks === null || weeks === undefined || weeks === "") return "";
  return `${weeks} wks ${days || 0} days`;
}

function MetricCard({ label, value, tone = "blue" }) {
  return (
    <div className={`rcn-pcard rcn-pcard--${tone}`}>
      <span className="rcn-pcard-icon"><Activity size={17} /></span>
      <div className="rcn-pcard-body">
        <span className="rcn-pcard-label">{label}</span>
        <span className="rcn-pcard-value">{value || "-"}</span>
      </div>
    </div>
  );
}

function SectionCard({ title, answered, total, children }) {
  return (
    <section className="rcn-section-card">
      <div className="rcn-section-header">
        <div className="rcn-section-title">
          <span className="rcn-section-emoji"><CheckCircle size={17} /></span>
          <span>{title}</span>
        </div>
        <span className="rcn-section-count">{answered}/{total}</span>
      </div>
      <div className="rcn-section-body">{children}</div>
    </section>
  );
}

function Field({ label, children, error }) {
  return (
    <div className="rcn-field">
      <label className="rcn-field-label">{label}</label>
      {children}
      {error && <div className="field-error">{error}</div>}
    </div>
  );
}

function TextInput({ value, onChange, disabled, type = "text", unit, placeholder }) {
  return (
    <div className="rcn-input-wrap">
      <input
        className="rcn-input"
        type={type}
        value={value ?? ""}
        placeholder={placeholder}
        disabled={disabled}
        onChange={e => onChange(e.target.value)}
      />
      {unit && <span className="rcn-unit">{unit}</span>}
    </div>
  );
}

function SelectInput({ value, onChange, disabled, options }) {
  return (
    <select className="rcn-input" value={value || ""} disabled={disabled} onChange={e => onChange(e.target.value)}>
      <option value="">Select</option>
      {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
    </select>
  );
}

function MultiCheck({ options, value, onChange, disabled }) {
  const selected = value || [];
  return (
    <div className="rcn-check-grid">
      {options.map(opt => (
        <label key={opt} className="rcn-check">
          <input
            type="checkbox"
            checked={selected.includes(opt)}
            disabled={disabled}
            onChange={e => {
              onChange(e.target.checked ? [...selected, opt] : selected.filter(v => v !== opt));
            }}
          />
          <span>{opt}</span>
        </label>
      ))}
    </div>
  );
}

function YesNo({ value, onChange, disabled }) {
  return (
    <div className="rcn-yn">
      <button type="button" className={`rcn-yn-btn ${value === true ? "rcn-yn-active-yes" : ""}`} disabled={disabled} onClick={() => onChange(true)}>Yes</button>
      <button type="button" className={`rcn-yn-btn ${value === false ? "rcn-yn-active-no" : ""}`} disabled={disabled} onClick={() => onChange(false)}>No</button>
    </div>
  );
}

export default function MinimalMonitoringLog() {
  const params = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { markFormCompleted } = useFormProgress();
  const enrollmentId = params.enrollmentId || localStorage.getItem("current_enrollment_id") || "";

  const [activeDay, setActiveDay] = useState(1);
  const [totalDays, setTotalDays] = useState(14);
  const [form, setForm] = useState(emptyForm);
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

  const counts = useMemo(() => {
    const extra = form.symptomatic_status === "symptomatic" ? ["symptomatic_detail"] : [];
    const required = [...allRequired, ...extra];
    const bySection = {};
    Object.entries(sectionFields).forEach(([key, fields]) => {
      const sectionExtra = key === "metabolic" && form.symptomatic_status === "symptomatic" ? ["symptomatic_detail"] : [];
      const these = [...fields, ...sectionExtra];
      bySection[key] = { done: these.filter(k => ans(form[k])).length, total: these.length };
    });
    const done = required.filter(k => ans(form[k])).length;
    return { done, total: required.length, pct: required.length ? Math.round((done / required.length) * 100) : 0, bySection };
  }, [form]);

  const setField = (key, value) => {
    if (!isEditable) return;
    setForm(prev => ({ ...prev, [key]: value }));
    setErrors(prev => ({ ...prev, [key]: null }));
  };

  useEffect(() => {
    if (!enrollmentId) return;
    const load = async () => {
      try {
        const birth = await api.get(`/birth-resuscitation/${enrollmentId}`);
        const b = birth?.data || {};
        setPatientInfo(prev => ({
          ...prev,
          enrollmentId,
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
        const d = res?.data || {};
        setForm({
          ...emptyForm,
          ...d,
          vasoactive_drugs: stringToList(d.vasoactive_drugs),
          pda_agent: stringToList(d.pda_agent),
          respiratory_modes: stringToList(d.respiratory_modes),
          postnatal_steroids: stringToList(d.postnatal_steroids),
          electrolytes: stringToList(d.electrolytes),
          transfusion_products: stringToList(d.transfusion_products),
        });
        setIsSaved(true);
        setIsEditing(false);
        setDayStatuses(prev => ({ ...prev, [activeDay]: d.submission_status || STATUS.DRAFT }));
      } catch (err) {
        if (err?.response?.status === 404) {
          setForm(emptyForm);
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
    if (!form.record_date) next.record_date = "Date is required";
    if (!form.shift) next.shift = "Shift is required";
    if (form.max_fio2 !== "" && (Number(form.max_fio2) < 21 || Number(form.max_fio2) > 100)) next.max_fio2 = "Enter 21 to 100";
    if (form.ph !== "" && (Number(form.ph) < 6.6 || Number(form.ph) > 7.8)) next.ph = "Check pH range";
    ["apnea_episodes", "desaturation_episodes", "severe_desaturation_episodes", "transfusion_count"].forEach(k => {
      if (form[k] !== "" && (!Number.isInteger(Number(form[k])) || Number(form[k]) < 0)) next[k] = "Enter a non-negative whole number";
    });
    if (form.symptomatic_status === "symptomatic" && !form.symptomatic_detail) next.symptomatic_detail = "Describe symptoms";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const payload = () => ({
    enrollment_id: enrollmentId,
    nicu_day: activeDay,
    ...form,
    vasoactive_drugs: listToString(form.vasoactive_drugs),
    pda_agent: listToString(form.pda_agent),
    respiratory_modes: listToString(form.respiratory_modes),
    postnatal_steroids: listToString(form.postnatal_steroids),
    electrolytes: listToString(form.electrolytes),
    transfusion_products: listToString(form.transfusion_products),
    axillary_temp: asNumber(form.axillary_temp),
    sbp: asNumber(form.sbp),
    dbp: asNumber(form.dbp),
    map_value: asNumber(form.map_value),
    max_map_cpap: asNumber(form.max_map_cpap),
    max_fio2: asNumber(form.max_fio2),
    ph: asNumber(form.ph),
    pao2: asNumber(form.pao2),
    paco2: asNumber(form.paco2),
    glucose: asNumber(form.glucose),
    alp: asNumber(form.alp),
    total_calcium: asNumber(form.total_calcium),
    phosphorus: asNumber(form.phosphorus),
    cumulative_feed_volume: asNumber(form.cumulative_feed_volume),
    direct_bilirubin: asNumber(form.direct_bilirubin),
    vi: asNumber(form.vi),
    ahw: asNumber(form.ahw),
    tod: asNumber(form.tod),
    aca_ri: asNumber(form.aca_ri),
    mca_ri: asNumber(form.mca_ri),
    prbc_volume: asNumber(form.prbc_volume),
    apnea_episodes: asInteger(form.apnea_episodes),
    desaturation_episodes: asInteger(form.desaturation_episodes),
    severe_desaturation_episodes: asInteger(form.severe_desaturation_episodes),
    transfusion_count: asInteger(form.transfusion_count),
    submission_status: STATUS.DRAFT,
    saved_at: new Date().toISOString(),
    saved_by: user?.name || user?.username || "Site User",
  });

  const handleSave = async () => {
    if (!validate() || !isEditable) return false;
    setSaving(true);
    try {
      const body = payload();
      isSaved ? await api.put(`/minimal-monitoring/${enrollmentId}/${activeDay}`, body) : await api.post("/minimal-monitoring/", body);
      markFormCompleted("minimal_monitoring");
      setIsSaved(true);
      setIsEditing(false);
      const status = counts.pct === 100 ? STATUS.COMPLETE : STATUS.DRAFT;
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
    if (counts.pct < 100) {
      setMessage("Complete all fields before submitting this day.");
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
  const rowError = key => errors[key];
  const FieldNumber = props => <TextInput type="number" {...props} />;

  return (
    <>
      <div className="rcn-page">
        <div className="rcn-patient-header">
          <div className="rcn-patient-header-title">
            <div className="rcn-patient-header-badge">HELPER FORM 5</div>
            <h2 className="rcn-patient-header-form-name">Minimal Monitoring</h2>
            <p className="rcn-patient-header-subtitle">Shift-based cardiovascular, respiratory, metabolic, GI, neurological, and hematology log</p>
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
            <button type="button" className="rcn-day-add" onClick={() => { setTotalDays(totalDays + 1); setActiveDay(totalDays + 1); }}>
              <span className="rcn-day-add-plus">+</span><span className="rcn-day-add-label">Day</span>
            </button>
          </div>
          <div className="rcn-timeline">
            {days.map(day => {
              const st = dayStatuses[day] || STATUS.EMPTY;
              return (
                <button key={day} type="button" className={`rcn-day ${day === activeDay ? "rcn-day--active" : ""} rcn-day--${st}`} onClick={() => setActiveDay(day)}>
                  <span className="rcn-day-d">D</span>
                  <span className="rcn-day-num">{day}</span>
                  {st === STATUS.SUBMITTED ? <Lock size={10} className="rcn-day-dot" /> : <span className="rcn-day-dot" />}
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
              <span>{isSubmitted ? "Submitted and locked" : `${counts.total - counts.done} fields remaining`}</span>
            </div>
          </div>
          <div className="rcn-summary-right">
            <div className="rcn-summary-sections">
              {Object.entries(counts.bySection).map(([key, value]) => (
                <div className="rcn-summary-section" key={key}>
                  <span className="rcn-summary-section-name">{key}</span>
                  <span className="rcn-summary-section-count">{value.done}<span className="rcn-summary-section-total">/{value.total}</span></span>
                  <div className="rcn-summary-section-bar"><div className="rcn-summary-section-bar-fill" style={{ width: `${(value.done / value.total) * 100}%` }} /></div>
                </div>
              ))}
            </div>
            <div className="rcn-summary-ring-wrap"><strong>{counts.pct}%</strong><span className="rcn-summary-ring-label">Complete</span></div>
          </div>
        </div>

        {isSubmitted && (
          <div className="rcn-status-banner rcn-status-banner--submitted">
            <Lock size={15} />
            <div className="rcn-status-banner-text"><strong>Day {activeDay} submitted</strong><span>This day is locked from further edits.</span></div>
          </div>
        )}

        {loading ? <div className="rcn-loading">Loading day {activeDay} data...</div> : (
          <div className="rcn-sections">
            <SectionCard title="5.1 Cardiovascular" answered={counts.bySection.cardiovascular.done} total={counts.bySection.cardiovascular.total}>
              <div className="rcn-grid-3">
                <Field label="Date" error={rowError("record_date")}><TextInput type="date" value={form.record_date} onChange={v => setField("record_date", v)} disabled={!isEditable} /></Field>
                <Field label="Shift" error={rowError("shift")}><SelectInput value={form.shift} onChange={v => setField("shift", v)} disabled={!isEditable} options={["Morning", "Evening", "Night"]} /></Field>
                <Field label="Axillary Temp"><FieldNumber value={form.axillary_temp} onChange={v => setField("axillary_temp", v)} disabled={!isEditable} unit="C" /></Field>
                <Field label="SBP"><FieldNumber value={form.sbp} onChange={v => setField("sbp", v)} disabled={!isEditable} unit="mm Hg" /></Field>
                <Field label="DBP"><FieldNumber value={form.dbp} onChange={v => setField("dbp", v)} disabled={!isEditable} unit="mm Hg" /></Field>
                <Field label="MAP"><FieldNumber value={form.map_value} onChange={v => setField("map_value", v)} disabled={!isEditable} unit="mm Hg" /></Field>
                <Field label="Fluid Bolus given"><TextInput value={form.fluid_bolus_given} onChange={v => setField("fluid_bolus_given", v)} disabled={!isEditable} /></Field>
                <Field label="Vasoactive given"><MultiCheck options={["Dopamine", "Dobutamine", "Epinephrine", "Milrinone", "Vasopressin", "Norepinephrine"]} value={form.vasoactive_drugs} onChange={v => setField("vasoactive_drugs", v)} disabled={!isEditable} /></Field>
                <Field label="Dose administered"><TextInput value={form.vasoactive_dose} onChange={v => setField("vasoactive_dose", v)} disabled={!isEditable} /></Field>
                <Field label="Unit"><SelectInput value={form.vasoactive_unit} onChange={v => setField("vasoactive_unit", v)} disabled={!isEditable} options={["mg/kg/min", "mcg/kg/min", "U/kg/min"]} /></Field>
                <Field label="Agent for medical Rx of PDA"><MultiCheck options={["Indo", "Ibu", "PCM"]} value={form.pda_agent} onChange={v => setField("pda_agent", v)} disabled={!isEditable} /></Field>
                <Field label="PDA dose administered"><TextInput value={form.pda_dose} onChange={v => setField("pda_dose", v)} disabled={!isEditable} unit="mg/kg" /></Field>
              </div>
            </SectionCard>

            <SectionCard title="5.2 Respiratory" answered={counts.bySection.respiratory.done} total={counts.bySection.respiratory.total}>
              <div className="rcn-grid-3">
                <Field label="Time: between"><TextInput value={form.respiratory_time} onChange={v => setField("respiratory_time", v)} disabled={!isEditable} placeholder="AM/PM range" /></Field>
                <Field label="Mode"><MultiCheck options={["NC", "HFNC", "CPAP", "NIPPV", "SIMV", "A/C", "PSV"]} value={form.respiratory_modes} onChange={v => setField("respiratory_modes", v)} disabled={!isEditable} /></Field>
                <Field label="Max MAP/CPAP of the hour"><FieldNumber value={form.max_map_cpap} onChange={v => setField("max_map_cpap", v)} disabled={!isEditable} unit="cm H2O" /></Field>
                <Field label="Max FiO2 of the hour" error={rowError("max_fio2")}><FieldNumber value={form.max_fio2} onChange={v => setField("max_fio2", v)} disabled={!isEditable} unit="%" /></Field>
                <Field label="pH" error={rowError("ph")}><FieldNumber value={form.ph} onChange={v => setField("ph", v)} disabled={!isEditable} /></Field>
                <Field label="PaO2"><FieldNumber value={form.pao2} onChange={v => setField("pao2", v)} disabled={!isEditable} /></Field>
                <Field label="PaCO2"><FieldNumber value={form.paco2} onChange={v => setField("paco2", v)} disabled={!isEditable} /></Field>
                <Field label="Apnea episodes" error={rowError("apnea_episodes")}><FieldNumber value={form.apnea_episodes} onChange={v => setField("apnea_episodes", v)} disabled={!isEditable} /></Field>
                <Field label="Desaturation episodes" error={rowError("desaturation_episodes")}><FieldNumber value={form.desaturation_episodes} onChange={v => setField("desaturation_episodes", v)} disabled={!isEditable} /></Field>
                <Field label="Severe desaturation episodes" error={rowError("severe_desaturation_episodes")}><FieldNumber value={form.severe_desaturation_episodes} onChange={v => setField("severe_desaturation_episodes", v)} disabled={!isEditable} /></Field>
                <Field label="Postnatal steroids"><MultiCheck options={["Hydrocortisone", "Dexamethasone", "Budesonide", "Other"]} value={form.postnatal_steroids} onChange={v => setField("postnatal_steroids", v)} disabled={!isEditable} /></Field>
                <Field label="Dose administered"><TextInput value={form.steroid_dose} onChange={v => setField("steroid_dose", v)} disabled={!isEditable} unit="mg/kg" /></Field>
              </div>
            </SectionCard>

            <SectionCard title="5.3 Metabolic" answered={counts.bySection.metabolic.done} total={counts.bySection.metabolic.total}>
              <div className="rcn-grid-3">
                <Field label="Glucose"><FieldNumber value={form.glucose} onChange={v => setField("glucose", v)} disabled={!isEditable} unit="mg/dL" /></Field>
                <Field label="ALP"><FieldNumber value={form.alp} onChange={v => setField("alp", v)} disabled={!isEditable} unit="IU/L" /></Field>
                <Field label="Total Calcium"><FieldNumber value={form.total_calcium} onChange={v => setField("total_calcium", v)} disabled={!isEditable} unit="mg/dL" /></Field>
                <Field label="Phosphorus P"><FieldNumber value={form.phosphorus} onChange={v => setField("phosphorus", v)} disabled={!isEditable} unit="mg/dL" /></Field>
                <Field label="Electrolyte abnormality"><YesNo value={form.electrolyte_abnormality} onChange={v => setField("electrolyte_abnormality", v)} disabled={!isEditable} /></Field>
                <Field label="Electrolytes"><MultiCheck options={["Na", "K", "Ionized Ca"]} value={form.electrolytes} onChange={v => setField("electrolytes", v)} disabled={!isEditable} /></Field>
                <Field label="Hypo/Hyper"><SelectInput value={form.hypo_hyper} onChange={v => setField("hypo_hyper", v)} disabled={!isEditable} options={["Hypo", "Hyper"]} /></Field>
                <Field label="Symptomatic/asymptomatic"><SelectInput value={form.symptomatic_status} onChange={v => setField("symptomatic_status", v)} disabled={!isEditable} options={["symptomatic", "asymptomatic"]} /></Field>
                {form.symptomatic_status === "symptomatic" && <Field label="If symptomatic" error={rowError("symptomatic_detail")}><TextInput value={form.symptomatic_detail} onChange={v => setField("symptomatic_detail", v)} disabled={!isEditable} /></Field>}
              </div>
            </SectionCard>

            <SectionCard title="5.4 Gastrointestinal" answered={counts.bySection.gastrointestinal.done} total={counts.bySection.gastrointestinal.total}>
              <div className="rcn-grid-3">
                <Field label="Cumulative feed volume"><FieldNumber value={form.cumulative_feed_volume} onChange={v => setField("cumulative_feed_volume", v)} disabled={!isEditable} unit="ml" /></Field>
                <Field label="Direct Bilirubin"><FieldNumber value={form.direct_bilirubin} onChange={v => setField("direct_bilirubin", v)} disabled={!isEditable} unit="mg/dL" /></Field>
              </div>
            </SectionCard>

            <SectionCard title="5.5 Neurological" answered={counts.bySection.neurological.done} total={counts.bySection.neurological.total}>
              <div className="rcn-grid-3">
                <Field label="Date of imaging"><TextInput type="date" value={form.imaging_date} onChange={v => setField("imaging_date", v)} disabled={!isEditable} /></Field>
                <Field label="Severity of ventriculomegaly"><SelectInput value={form.ventriculomegaly_severity} onChange={v => setField("ventriculomegaly_severity", v)} disabled={!isEditable} options={["Mild", "Moderate", "Severe"]} /></Field>
                <Field label="VI"><FieldNumber value={form.vi} onChange={v => setField("vi", v)} disabled={!isEditable} unit="mm" /></Field>
                <Field label="AHW"><FieldNumber value={form.ahw} onChange={v => setField("ahw", v)} disabled={!isEditable} unit="mm" /></Field>
                <Field label="TOD"><FieldNumber value={form.tod} onChange={v => setField("tod", v)} disabled={!isEditable} unit="mm" /></Field>
                <Field label="ACA RI"><FieldNumber value={form.aca_ri} onChange={v => setField("aca_ri", v)} disabled={!isEditable} /></Field>
                <Field label="MCA RI"><FieldNumber value={form.mca_ri} onChange={v => setField("mca_ri", v)} disabled={!isEditable} /></Field>
              </div>
            </SectionCard>

            <SectionCard title="5.6 Hematology" answered={counts.bySection.hematology.done} total={counts.bySection.hematology.total}>
              <div className="rcn-grid-3">
                <Field label="Transfusion"><MultiCheck options={["PRBC", "Platelets", "FFP/Cryo"]} value={form.transfusion_products} onChange={v => setField("transfusion_products", v)} disabled={!isEditable} /></Field>
                <Field label="No. of transfusions" error={rowError("transfusion_count")}><FieldNumber value={form.transfusion_count} onChange={v => setField("transfusion_count", v)} disabled={!isEditable} /></Field>
                <Field label="If PRBC, volume"><FieldNumber value={form.prbc_volume} onChange={v => setField("prbc_volume", v)} disabled={!isEditable} unit="ml/kg" /></Field>
              </div>
            </SectionCard>
          </div>
        )}

        {message && <div className={`form-message${message.includes("saved") || message.includes("submitted") ? " form-message--success" : " form-message--error"}`}>{message}</div>}
      </div>

      <div className="form-navigation">
        <button type="button" className="btn btn-secondary btn-outline" onClick={() => navigate(`/metab-renal-vasc-eye-log/${enrollmentId}`)}>
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
          <button type="button" className="btn btn-submit-day" onClick={handleSubmit} disabled={submitting || counts.pct < 100}>
            <Send size={15} /> {submitting ? "Submitting..." : `Submit Day ${activeDay}`}
          </button>
        )}
      </div>
    </>
  );
}
