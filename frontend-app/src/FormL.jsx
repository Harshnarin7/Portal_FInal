import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "./api/axios";
import "./styles/global.css";
import "./styles/FormComponents.css";
import { usePatient } from "./context/PatientContext";
import { useFormProgress } from "./context/FormProgressContext";
import {
  Home, Save, ArrowLeft, BarChart2,
  CheckCircle, Wind, AlertCircle,
} from "lucide-react";

/* ─── helpers ─────────────────────────────────── */
const Field = ({ label, children, hint }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
    <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
      {label}
      {hint && <span style={{ fontWeight: 400, color: "#94a3b8", marginLeft: 6 }}>{hint}</span>}
    </label>
    {children}
  </div>
);

const TextInput = ({ value, onChange, placeholder, disabled, type = "text" }) => (
  <input type={type} value={value}
    onChange={e => onChange && onChange(e.target.value)}
    placeholder={placeholder} disabled={disabled}
    style={{
      padding: "9px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8,
      fontSize: 14, background: disabled ? "#f8fafc" : "#fff",
      color: "#0f172a", outline: "none", width: "100%",
    }}
  />
);

const SectionHeader = ({ icon: Icon, title, color = "#0284c7" }) => (
  <div style={{
    display: "flex", alignItems: "center", gap: 10,
    padding: "12px 18px", background: "#f8fafc",
    borderLeft: `4px solid ${color}`,
    borderRadius: "8px 8px 0 0", marginBottom: 0,
    borderBottom: "1px solid #e2e8f0",
  }}>
    {Icon && <Icon size={18} style={{ color }} />}
    <span style={{ fontWeight: 700, fontSize: 15, color: "#0f172a" }}>{title}</span>
  </div>
);

const Card = ({ children, style }) => (
  <div className="portal-card" style={{ marginBottom: 24, overflow: "hidden", ...style }}>
    {children}
  </div>
);

const CardBody = ({ children }) => (
  <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
    {children}
  </div>
);

const CompositeOutcome = ({ label, value, onChange, disabled }) => (
  <div style={{
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "14px 20px", borderRadius: 10,
    border: "1.5px solid",
    borderColor: value === true ? "#0284c7" : value === false ? "#e2e8f0" : "#e2e8f0",
    background: value === true ? "#e0f2fe" : "#f8fafc",
    marginBottom: 10,
  }}>
    <span style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", flex: 1, paddingRight: 20 }}>{label}</span>
    <div style={{ display: "flex", gap: 8 }}>
      {["Yes", "No", "N/A"].map(opt => {
        const val = opt === "Yes" ? true : opt === "No" ? false : "na";
        const active = value === val;
        return (
          <button key={opt} type="button" disabled={disabled}
            onClick={() => !disabled && onChange(val)}
            style={{
              padding: "5px 16px", borderRadius: 7, border: "1.5px solid",
              borderColor: active
                ? (opt === "Yes" ? "#0284c7" : opt === "No" ? "#dc2626" : "#64748b")
                : "#e2e8f0",
              background: active
                ? (opt === "Yes" ? "#e0f2fe" : opt === "No" ? "#fee2e2" : "#f1f5f9")
                : "#fff",
              color: active
                ? (opt === "Yes" ? "#0284c7" : opt === "No" ? "#dc2626" : "#374151")
                : "#64748b",
              fontWeight: 600, fontSize: 13, cursor: disabled ? "default" : "pointer",
            }}
          >{opt}</button>
        );
      })}
    </div>
  </div>
);

/* FiO2 minute-by-minute grid */
const FiO2MinuteGrid = ({ values, onChange, disabled }) => {
  const minutes = Array.from({ length: 11 }, (_, i) => i);
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(11, 1fr)", gap: 8, marginTop: 8,
    }}>
      {minutes.map(m => (
        <div key={m} style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>{m}′</span>
          <input
            type="number" min={21} max={100}
            value={values[m] || ""}
            onChange={e => {
              const next = [...(values || Array(11).fill(""))];
              next[m] = e.target.value;
              onChange(next);
            }}
            disabled={disabled}
            placeholder="—"
            style={{
              width: "100%", padding: "6px 4px", borderRadius: 6,
              border: "1.5px solid #e2e8f0", textAlign: "center",
              fontSize: 13, background: disabled ? "#f8fafc" : "#fff",
            }}
          />
          <span style={{ fontSize: 10, color: "#94a3b8" }}>%</span>
        </div>
      ))}
    </div>
  );
};

/* ════════════════════════════════════════════════
   FORM L
════════════════════════════════════════════════ */
export default function FormL() {
  const location = useLocation();
  const navigate = useNavigate();
  const { markFormCompleted } = useFormProgress();
  const { patientData } = usePatient();

  const BLANK = {
    enrollment_id: "",
    dob: "",
    gestation_weeks: "",
    gestation_days: "",
    pma_weeks: "",
    pma_days: "",
    mother_name: "",
    baby_name: "",
    /* L.2 Blender */
    initial_fio2: "",
    exit_fio2: "",
    max_fio2_first_hour: "",
    fio2_per_minute: Array(11).fill(""),
    /* L.3 Composite Outcomes */
    composite_outcome_1: null,   // Death or BPD at 36w PMA
    composite_outcome_2: null,   // Death or BPD or ROP-Rx or NEC or Brain Injury at 44w
    mri_abnormality: null,       // true / false / "na"
    /* footer */
    completed_by: "",
    designation: "",
    completion_date: "",
  };

  const [formData, setFormData] = useState(BLANK);
  const [isSaved, setIsSaved] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const editable = !isSaved || isEditing;

  useEffect(() => {
    const id =
      patientData?.enrollment_id ||
      location.state?.enrollmentId ||
      localStorage.getItem("enrollment_id") || "";
    setFormData(p => ({
      ...p,
      enrollment_id: id,
      dob: patientData?.dob || "",
      gestation_weeks: patientData?.gestation_weeks || "",
      gestation_days: patientData?.gestation_days || "",
      mother_name: patientData?.mother_first_name || "",
    }));
  }, [patientData, location.state]);

  const set = (field, value) =>
    setFormData(p => ({ ...p, [field]: value }));

  const handleSave = async () => {
    if (!formData.enrollment_id) {
      setMessage("❌ Enrollment ID is required.");
      return;
    }
    setSaving(true);
    try {
      await api.post("/form-l", formData);
      setIsSaved(true);
      setIsEditing(false);
      setMessage("✅ Form L saved successfully.");
      markFormCompleted("form_l");
    } catch (err) {
      setMessage("❌ Save failed: " + (err.response?.data?.detail || err.message));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="form-wrapper">
      {/* ── header ── */}
      <div className="form-header-action-row">
        <div className="form-header-title-area">
          <div className="form-breadcrumb">
            <Home size={12} /> FORM L
          </div>
          <h2 className="form-main-title">Blender Data & Study Summary</h2>
          <p className="form-main-subtitle">
            Trial blender FiO₂ data and final composite outcome summary
          </p>
        </div>
        <div className="form-header-meta-area">
          {isSaved && !isEditing && (
            <button className="btn-edit-form-header" onClick={() => setIsEditing(true)}>
              Edit Form
            </button>
          )}
          {formData.enrollment_id && (
            <span className="screening-id-badge">{formData.enrollment_id}</span>
          )}
        </div>
      </div>

      {isEditing && (
        <div className="editing-mode-banner">
          <span className="editing-mode-dot" />
          Editing Mode — unsaved changes will be lost if you navigate away
        </div>
      )}

      {message && (
        <div style={{
          padding: "10px 16px", borderRadius: 8, marginBottom: 16,
          background: message.startsWith("✅") ? "#dcfce7" : "#fee2e2",
          color: message.startsWith("✅") ? "#166534" : "#991b1b",
          fontWeight: 500, fontSize: 14,
        }}>
          {message}
        </div>
      )}

      {/* ══ L.1 Identification ══ */}
      <Card>
        <SectionHeader icon={Home} title="L.1  Identification" />
        <CardBody>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            <Field label="Enrollment ID">
              <TextInput value={formData.enrollment_id}
                onChange={v => set("enrollment_id", v)} disabled />
            </Field>
            <Field label="Date of Birth">
              <TextInput value={formData.dob}
                onChange={v => set("dob", v)} disabled placeholder="DD/MM/YY" />
            </Field>
            <Field label="Gestation">
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <TextInput value={formData.gestation_weeks} disabled placeholder="wks"
                  onChange={() => {}} />
                <span style={{ color: "#94a3b8" }}>wks</span>
                <TextInput value={formData.gestation_days} disabled placeholder="days"
                  onChange={() => {}} />
                <span style={{ color: "#94a3b8" }}>days</span>
              </div>
            </Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            <Field label="PMA">
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <TextInput value={formData.pma_weeks}
                  onChange={v => set("pma_weeks", v)}
                  disabled={!editable} placeholder="wks" />
                <span style={{ color: "#94a3b8" }}>wks</span>
                <TextInput value={formData.pma_days}
                  onChange={v => set("pma_days", v)}
                  disabled={!editable} placeholder="days" />
                <span style={{ color: "#94a3b8" }}>days</span>
              </div>
            </Field>
            <Field label="Mother's Name">
              <TextInput value={formData.mother_name}
                onChange={v => set("mother_name", v)}
                disabled={!editable} placeholder="First name" />
            </Field>
            <Field label="Baby's Name" hint="(if available)">
              <TextInput value={formData.baby_name}
                onChange={v => set("baby_name", v)}
                disabled={!editable} placeholder="Name if available" />
            </Field>
          </div>
        </CardBody>
      </Card>

      {/* ══ L.2 Blender Details ══ */}
      <Card>
        <SectionHeader icon={Wind} title="L.2  Blender Details" color="#0891b2" />
        <CardBody>
          <div style={{
            background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 8,
            padding: "10px 16px", fontSize: 13, color: "#0369a1",
          }}>
            ℹ️ Values to be filled from the <strong>decrypted Trial Blender data</strong>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            <Field label="Initial FiO₂ of Trial Gas" hint="(%)">
              <TextInput value={formData.initial_fio2}
                onChange={v => set("initial_fio2", v)}
                disabled={!editable} placeholder="e.g. 21" type="number" />
            </Field>
            <Field label="FiO₂ at Exit from Trial Gas" hint="(%)">
              <TextInput value={formData.exit_fio2}
                onChange={v => set("exit_fio2", v)}
                disabled={!editable} placeholder="e.g. 30" type="number" />
            </Field>
            <Field label="Max FiO₂ in First Hour" hint="(%)">
              <TextInput value={formData.max_fio2_first_hour}
                onChange={v => set("max_fio2_first_hour", v)}
                disabled={!editable} placeholder="e.g. 40" type="number" />
            </Field>
          </div>

          <Field label="FiO₂ per Minute (0–10 min)" hint="from decrypted blender data">
            <FiO2MinuteGrid
              values={formData.fio2_per_minute}
              onChange={v => set("fio2_per_minute", v)}
              disabled={!editable} />
          </Field>
        </CardBody>
      </Card>

      {/* ══ L.3 Final Composite Outcome Summary ══ */}
      <Card>
        <SectionHeader icon={BarChart2} title="L.3  Final Composite Outcome Summary" color="#7c3aed" />
        <CardBody>
          <div style={{
            background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 8,
            padding: "10px 16px", fontSize: 13, color: "#6b21a8", marginBottom: 8,
          }}>
            ⚡ Primary and secondary composite outcomes — select Yes / No for each
          </div>

          <CompositeOutcome
            label="COMPOSITE OUTCOME 1: Death or BPD (Jensen 2019) at 36 weeks PMA"
            value={formData.composite_outcome_1}
            onChange={v => set("composite_outcome_1", v)}
            disabled={!editable} />

          <CompositeOutcome
            label="COMPOSITE OUTCOME 2: Death or BPD or ROP-Rx or NEC or Brain Injury (IVH or cPVL) at 44 weeks"
            value={formData.composite_outcome_2}
            onChange={v => set("composite_outcome_2", v)}
            disabled={!editable} />

          <CompositeOutcome
            label="MRI BRAIN ABNORMALITY (25% subset)"
            value={formData.mri_abnormality}
            onChange={v => set("mri_abnormality", v)}
            disabled={!editable} />
        </CardBody>
      </Card>

      {/* ══ Footer ══ */}
      <Card>
        <SectionHeader icon={AlertCircle} title="Form Completion" color="#64748b" />
        <CardBody>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            <Field label="Completed By">
              <TextInput value={formData.completed_by}
                onChange={v => set("completed_by", v)}
                disabled={!editable} placeholder="First name" />
            </Field>
            <Field label="Designation">
              <TextInput value={formData.designation}
                onChange={v => set("designation", v)}
                disabled={!editable} placeholder="Designation" />
            </Field>
            <Field label="Date" hint="(DD/MM/YY)">
              <TextInput value={formData.completion_date}
                onChange={v => set("completion_date", v)}
                disabled={!editable} placeholder="DD/MM/YY" />
            </Field>
          </div>
        </CardBody>
      </Card>

      {/* ── action buttons ── */}
      <div className="form-action-bar">
        <button className="btn-secondary" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} /> Back
        </button>
        <div style={{ display: "flex", gap: 12 }}>
          {(!isSaved || isEditing) && (
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              <Save size={16} /> {saving ? "Saving…" : "Save Form L"}
            </button>
          )}
          <button className="btn-secondary" onClick={() => navigate("/dashboard")}>
            <CheckCircle size={16} /> Done
          </button>
        </div>
      </div>
    </div>
  );
}
