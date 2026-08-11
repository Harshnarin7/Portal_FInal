import React, { useState, useEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import api from "./api/axios";
import "./styles/global.css";
import "./styles/FormComponents.css";
import "./styles/FormL.css";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { toDateOnlyValue, parseDateOnly } from "./utils/datetime";
import FormNavBar from "./components/FormNavBar";
import { usePatient } from "./context/PatientContext";
import { useFormProgress } from "./context/FormProgressContext";
import { Home, Building2, Wind, BarChart2 } from "lucide-react";

const MINUTE_LABELS = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k"];

const BLANK = () => ({
  enrollment_id: "",
  dob: "",
  gestation_weeks: "",
  gestation_days: "",
  pma_weeks: "",
  pma_days: "",
  mother_name: "",
  baby_name: "",
  initial_fio2: "",
  exit_fio2: "",
  max_fio2_first_hour: "",
  fio2_per_minute: Array(11).fill(""),
  // UI uses Yes/No/NA; API stores "yes" | "no" | "na"
  composite_outcome_1: "",
  composite_outcome_2: "",
  mri_abnormality: "",
  completed_by: "",
  designation: "",
  completion_date: "",
});

function emptyToNull(v) {
  if (v === "" || v === undefined || v === null) return null;
  return v;
}
function numOrNull(v) {
  if (v === "" || v === undefined || v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function dateOnly(v) {
  if (!v) return "";
  const m = String(v).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : String(v);
}

/** API "yes"/"no"/"na"/bool → UI Yes/No/NA/"" */
function apiToUiChoice(v) {
  if (v === true || v === "yes" || v === "Yes") return "Yes";
  if (v === false || v === "no" || v === "No") return "No";
  if (v === "na" || v === "N/A" || v === "NA") return "NA";
  return "";
}
/** UI Yes/No/NA → API "yes"/"no"/"na"/null */
function uiToApiChoice(v) {
  if (v === "Yes") return "yes";
  if (v === "No") return "no";
  if (v === "NA") return "na";
  return null;
}

function normalizeMinutes(arr) {
  const base = Array(11).fill("");
  if (!Array.isArray(arr)) return base;
  for (let i = 0; i < 11; i++) {
    const v = arr[i];
    base[i] = v === null || v === undefined ? "" : String(v);
  }
  return base;
}

function YesNo({ value, onChange, allowNA = false }) {
  const opts = allowNA ? ["Yes", "No", "NA"] : ["Yes", "No"];
  return (
    <div className={`fl-yn${allowNA ? " with-na" : ""}`}>
      {opts.map((opt) => (
        <button
          key={opt}
          type="button"
          className={`${opt === "Yes" ? "yes" : opt === "No" ? "no" : "na"}${value === opt ? " active" : ""}`}
          onClick={() => onChange(opt)}
        >
          {opt === "NA" ? "N/A" : opt.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function DateField({ value, onChange, disabled = false }) {
  return (
    <DatePicker
      selected={value ? parseDateOnly(value) : null}
      onChange={(date) => onChange(date ? toDateOnlyValue(date) : "")}
      dateFormat="dd/MM/yyyy"
      placeholderText="dd/mm/yyyy"
      className="fl-input"
      disabled={disabled}
    />
  );
}

function SectionCard({ icon: Icon, num, title, children }) {
  return (
    <section className="fl-card">
      <div className="fl-card-header">
        {Icon && <Icon size={18} className="fl-sec-icon" />}
        {num != null && <span className="fl-sec-num">{num}</span>}
        <h3>{title}</h3>
      </div>
      <div className="fl-card-body">{children}</div>
    </section>
  );
}

function mapApiToForm(row) {
  return {
    ...BLANK(),
    enrollment_id: row.enrollment_id || "",
    dob: dateOnly(row.dob),
    gestation_weeks: row.gestation_weeks ?? "",
    gestation_days: row.gestation_days ?? "",
    pma_weeks: row.pma_weeks ?? "",
    pma_days: row.pma_days ?? "",
    mother_name: row.mother_name || "",
    baby_name: row.baby_name || "",
    initial_fio2: row.initial_fio2 ?? "",
    exit_fio2: row.exit_fio2 ?? "",
    max_fio2_first_hour: row.max_fio2_first_hour ?? "",
    fio2_per_minute: normalizeMinutes(row.fio2_per_minute),
    composite_outcome_1: apiToUiChoice(row.composite_outcome_1),
    composite_outcome_2: apiToUiChoice(row.composite_outcome_2),
    mri_abnormality: apiToUiChoice(row.mri_abnormality),
    completed_by: row.completed_by || "",
    designation: row.designation || "",
    completion_date: dateOnly(row.completion_date),
  };
}

function buildPayload(data) {
  const minutes = normalizeMinutes(data.fio2_per_minute).map((v) => numOrNull(v));
  return {
    enrollment_id: data.enrollment_id,
    dob: emptyToNull(data.dob),
    gestation_weeks: numOrNull(data.gestation_weeks),
    gestation_days: numOrNull(data.gestation_days),
    pma_weeks: numOrNull(data.pma_weeks),
    pma_days: numOrNull(data.pma_days),
    mother_name: emptyToNull(data.mother_name),
    baby_name: emptyToNull(data.baby_name),
    initial_fio2: numOrNull(data.initial_fio2),
    exit_fio2: numOrNull(data.exit_fio2),
    max_fio2_first_hour: numOrNull(data.max_fio2_first_hour),
    fio2_per_minute: minutes,
    composite_outcome_1: uiToApiChoice(data.composite_outcome_1),
    composite_outcome_2: uiToApiChoice(data.composite_outcome_2),
    mri_abnormality: uiToApiChoice(data.mri_abnormality),
    completed_by: emptyToNull(data.completed_by),
    designation: emptyToNull(data.designation),
    completion_date: emptyToNull(data.completion_date),
    submission_status: "draft",
  };
}

function getDesignation(name) {
  if (!name) return "";
  const n = name.replace(/^Dr\.\s*/i, "").trim();
  if (n === "Mannat Guliani") return "Project Research Scientist III (Medical)";
  if (n === "Shalini Dhiman") return "Project Research Scientist III (Non-Medical)";
  if (/^Dr\.\s*/i.test(name)) return "Site Research Scientist";
  return "Project Nurse III";
}

export default function FormL() {
  const location = useLocation();
  const navigate = useNavigate();
  const { enrollmentId: routeId } = useParams();
  const { patientData } = usePatient();
  const { markFormCompleted } = useFormProgress();

  const [formData, setFormData] = useState(BLANK);
  const [isSaved, setIsSaved] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [assessors, setAssessors] = useState([]);
  const [siteName, setSiteName] = useState("");

  const set = (field, value) => {
    setIsSaved(false);
    setFormData((p) => ({ ...p, [field]: value }));
  };

  const setMinute = (idx, value) => {
    setIsSaved(false);
    setFormData((p) => {
      const next = normalizeMinutes(p.fio2_per_minute);
      next[idx] = value;
      return { ...p, fio2_per_minute: next };
    });
  };

  useEffect(() => {
    const id =
      routeId ||
      patientData?.enrollment_id ||
      location.state?.enrollmentId ||
      localStorage.getItem("current_enrollment_id") ||
      "";
    if (!id) return;

    setFormData((p) => ({ ...p, enrollment_id: id }));

    api.get(`/birth-resuscitation/${id}`)
      .then(async (res) => {
        const b = Array.isArray(res.data) ? res.data[0] : res.data;
        if (!b) return;
        let resolvedSite = b.site_name || patientData?.site_name || patientData?.site || "";
        let mother = "";
        if (b.screening_id) {
          try {
            const screening = (await api.get(`/screenings/by-screening-id/${b.screening_id}`)).data;
            if (screening?.site_name) resolvedSite = screening.site_name;
          } catch { /* optional */ }
          try {
            const pii = (await api.get(`/pii/screening/${b.screening_id}`)).data || {};
            mother = `${pii.mother_first_name || pii.mother_name_first || ""} ${pii.mother_surname || pii.mother_name_surname || ""}`.trim();
          } catch { /* optional */ }
        }
        if (!mother) {
          mother = `${b.mother_name_first || ""} ${b.mother_name_surname || ""}`.trim();
        }
        if (resolvedSite) setSiteName(resolvedSite);
        setFormData((p) => ({
          ...p,
          enrollment_id: id,
          dob: p.dob || b.date_of_birth || "",
          gestation_weeks: p.gestation_weeks !== "" && p.gestation_weeks != null ? p.gestation_weeks : (b.gestation_weeks ?? ""),
          gestation_days: p.gestation_days !== "" && p.gestation_days != null ? p.gestation_days : (b.gestation_days ?? ""),
          mother_name: p.mother_name || mother || "",
        }));
      })
      .catch(() => {});

    api.get(`/form-l/${id}`)
      .then((res) => {
        if (!res.data) return;
        const mapped = mapApiToForm(res.data);
        setFormData((p) => ({
          ...mapped,
          enrollment_id: id,
          dob: mapped.dob || p.dob,
          gestation_weeks:
            mapped.gestation_weeks !== "" && mapped.gestation_weeks != null
              ? mapped.gestation_weeks
              : p.gestation_weeks,
          gestation_days:
            mapped.gestation_days !== "" && mapped.gestation_days != null
              ? mapped.gestation_days
              : p.gestation_days,
          mother_name: mapped.mother_name || p.mother_name,
        }));
        setIsSaved(true);
      })
      .catch((err) => {
        if (err?.response?.status !== 404) console.error("Failed to load Form L", err);
      });
  }, [routeId, patientData, location.state]);

  useEffect(() => {
    const site = siteName || patientData?.site_name || patientData?.site || "";
    if (!site) {
      setAssessors([]);
      return;
    }
    api.get(`/sites/${encodeURIComponent(site)}/screeners`)
      .then((r) => setAssessors(Array.isArray(r.data) ? r.data : []))
      .catch(() => setAssessors([]));
  }, [siteName, patientData?.site_name, patientData?.site]);

  const saveForm = async () => {
    if (!formData.enrollment_id) {
      setSaveMessage("❌ Enrollment ID is required");
      return false;
    }
    try {
      const res = await api.post("/form-l", buildPayload(formData));
      setFormData(mapApiToForm(res.data));
      markFormCompleted("form_l");
      setIsSaved(true);
      setSaveMessage("✅ Form L saved");
      setTimeout(() => setSaveMessage(""), 3000);
      return true;
    } catch (err) {
      console.error(err?.response?.data || err);
      const detail = err?.response?.data?.detail;
      setSaveMessage(`❌ Save failed${detail ? `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
      setTimeout(() => setSaveMessage(""), 4000);
      return false;
    }
  };

  return (
    <form
      className="screening-form form-l-page"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await saveForm();
        if (ok) navigate("/dashboard");
      }}
    >
      <div className="form-header-action-row">
        <div className="form-header-title-area">
          <div className="form-breadcrumb"><Home size={12} /> FORM L</div>
          <h2 className="form-main-title">Blender Data and Study Summary</h2>
          <p className="form-main-subtitle">
            Trial blender FiO₂ data and final composite outcome summary
          </p>
        </div>
        <div className="form-header-meta-area">
          <div className="screening-id-badge">
            <span className="id-label">Enrollment ID</span>
            <span className="id-val">{formData.enrollment_id || "—"}</span>
          </div>
        </div>
      </div>

      <SectionCard icon={Building2} num="L.1" title="Identification">
        <div className="fl-grid-3">
          <div className="form-group">
            <label>1. Enrollment ID</label>
            <input className="fl-input" value={formData.enrollment_id} readOnly />
          </div>
          <div className="form-group">
            <label>2. DOB</label>
            <DateField value={formData.dob} onChange={(v) => set("dob", v)} />
          </div>
          <div className="form-group">
            <label>3. Gestation</label>
            <div className="fl-inline">
              <input className="fl-input fl-num" type="number" min="0" value={formData.gestation_weeks} onChange={(e) => set("gestation_weeks", e.target.value)} />
              <span>wks</span>
              <input className="fl-input fl-num" type="number" min="0" max="6" value={formData.gestation_days} onChange={(e) => set("gestation_days", e.target.value)} />
              <span>days</span>
            </div>
          </div>
          <div className="form-group">
            <label>4. PMA</label>
            <div className="fl-inline">
              <input className="fl-input fl-num" type="number" min="0" value={formData.pma_weeks} onChange={(e) => set("pma_weeks", e.target.value)} />
              <span>wks</span>
              <input className="fl-input fl-num" type="number" min="0" max="6" value={formData.pma_days} onChange={(e) => set("pma_days", e.target.value)} />
              <span>days</span>
            </div>
          </div>
          <div className="form-group">
            <label>5. Mother&apos;s name</label>
            <input className="fl-input" value={formData.mother_name} onChange={(e) => set("mother_name", e.target.value)} />
          </div>
          <div className="form-group">
            <label>6. Baby&apos;s name <span style={{ fontWeight: 500, color: "#94a3b8" }}>(if available)</span></label>
            <input className="fl-input" value={formData.baby_name} onChange={(e) => set("baby_name", e.target.value)} placeholder="Optional" />
          </div>
        </div>
      </SectionCard>

      <SectionCard icon={Wind} num="L.2" title="Blender details">
        <div className="fl-note">
          Values below are filled from the <strong>decrypted Trial Blender data</strong>.
        </div>
        <div className="fl-grid-3">
          <div className="form-group">
            <label>7. Initial FiO₂ of trial gas (%)</label>
            <input className="fl-input" type="number" step="any" min="0" max="100" value={formData.initial_fio2} onChange={(e) => set("initial_fio2", e.target.value)} placeholder="e.g. 21" />
          </div>
          <div className="form-group">
            <label>8. FiO₂ at exit from trial gas (%)</label>
            <input className="fl-input" type="number" step="any" min="0" max="100" value={formData.exit_fio2} onChange={(e) => set("exit_fio2", e.target.value)} placeholder="e.g. 30" />
          </div>
          <div className="form-group">
            <label>9. Max FiO₂ in first hour (%)</label>
            <input className="fl-input" type="number" step="any" min="0" max="100" value={formData.max_fio2_first_hour} onChange={(e) => set("max_fio2_first_hour", e.target.value)} placeholder="e.g. 40" />
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 10 }}>
            10. FiO₂ (0–10 min) — each minute
          </label>
          <div className="fl-minute-grid">
            {MINUTE_LABELS.map((letter, idx) => (
              <div key={idx} className="fl-minute-cell">
                <span className="fl-minute-label">{letter}) {idx}&apos;</span>
                <input
                  type="number"
                  step="any"
                  min="0"
                  max="100"
                  value={formData.fio2_per_minute[idx] ?? ""}
                  onChange={(e) => setMinute(idx, e.target.value)}
                  placeholder="—"
                />
                <span className="fl-minute-unit">%</span>
              </div>
            ))}
          </div>
        </div>
      </SectionCard>

      <SectionCard icon={BarChart2} num="L.3" title="Final composite outcome summary">
        <div className="fl-outcome">
          <div className="fl-outcome-label">
            <div className="fl-outcome-sub">11. Composite outcome 1</div>
            Death or BPD (Jensen 2019) at 36 weeks PMA
          </div>
          <YesNo value={formData.composite_outcome_1} onChange={(v) => set("composite_outcome_1", v)} />
        </div>

        <div className="fl-outcome">
          <div className="fl-outcome-label">
            <div className="fl-outcome-sub">12a. Composite outcome 2</div>
            Death or BPD or ROP-Rx or NEC or Brain Injury (IVH or cPVL) at 44 weeks
          </div>
          <YesNo value={formData.composite_outcome_2} onChange={(v) => set("composite_outcome_2", v)} />
        </div>

        <div className="fl-outcome">
          <div className="fl-outcome-label">
            <div className="fl-outcome-sub">12b. MRI brain abnormality</div>
            MRI brain abnormality (25% subset)
          </div>
          <YesNo value={formData.mri_abnormality} onChange={(v) => set("mri_abnormality", v)} allowNA />
        </div>
      </SectionCard>

      <SectionCard title="Form completed by">
        <div className="fl-grid-3">
          <div className="form-group">
            <label>Completed by</label>
            <select
              className="fl-input"
              value={formData.completed_by || ""}
              onChange={(e) => {
                const name = e.target.value;
                setIsSaved(false);
                setFormData((p) => ({
                  ...p,
                  completed_by: name,
                  designation: getDesignation(name),
                }));
              }}
            >
              <option value="">-- Select --</option>
              {assessors.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
              {formData.completed_by && !assessors.includes(formData.completed_by) && (
                <option value={formData.completed_by}>{formData.completed_by}</option>
              )}
            </select>
          </div>
          <div className="form-group">
            <label>Designation</label>
            <input className="fl-input" value={formData.designation || ""} readOnly placeholder="Auto-filled" />
          </div>
          <div className="form-group">
            <label>Date</label>
            <DateField value={formData.completion_date} onChange={(v) => set("completion_date", v)} />
          </div>
        </div>
      </SectionCard>

      {saveMessage && <p className="fl-save-msg">{saveMessage}</p>}

      <FormNavBar
        onBack={() => navigate(`/form-k/${formData.enrollment_id}`, { state: { enrollmentId: formData.enrollment_id } })}
        onSave={saveForm}
        onNext={async () => {
          const ok = await saveForm();
          if (ok) navigate("/dashboard");
        }}
        backLabel="Form K"
        nextLabel="Done"
        step={12}
        totalSteps={12}
        isSaved={isSaved}
      />
    </form>
  );
}
