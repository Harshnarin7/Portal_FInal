import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "./api/axios";
import "./styles/global.css";
import "./styles/FormComponents.css";
import { usePatient } from "./context/PatientContext";
import { useFormProgress } from "./context/FormProgressContext";
import {
  Home, Brain, Save, ArrowLeft, ArrowRight,
  CheckCircle, AlertCircle, FlaskConical,
} from "lucide-react";

/* ─── helpers ─────────────────────────────────── */
const YN = ({ value, onChange, disabled }) => (
  <div className="emr-toggle-group" style={{ display: "flex", gap: 8 }}>
    {["Yes", "No"].map((opt) => (
      <button
        key={opt}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && onChange(opt === "Yes" ? true : false)}
        className={`emr-toggle-btn${value === (opt === "Yes" ? true : false) ? " active" : ""}`}
        style={{
          padding: "6px 18px", borderRadius: 7, border: "1.5px solid",
          borderColor: value === (opt === "Yes" ? true : false) ? (opt === "Yes" ? "#0284c7" : "#64748b") : "#e2e8f0",
          background: value === (opt === "Yes" ? true : false) ? (opt === "Yes" ? "#e0f2fe" : "#f1f5f9") : "#fff",
          fontWeight: 600, fontSize: 13, cursor: disabled ? "default" : "pointer",
          color: value === (opt === "Yes" ? true : false) ? (opt === "Yes" ? "#0284c7" : "#334155") : "#64748b",
        }}
      >{opt}</button>
    ))}
  </div>
);

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
  <input
    type={type}
    value={value}
    onChange={e => onChange(e.target.value)}
    placeholder={placeholder}
    disabled={disabled}
    className="emr-input"
    style={{
      padding: "9px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8,
      fontSize: 14, background: disabled ? "#f8fafc" : "#fff",
      color: "#0f172a", outline: "none", width: "100%",
    }}
  />
);

const SelectInput = ({ value, onChange, options, disabled }) => (
  <select
    value={value}
    onChange={e => onChange(e.target.value)}
    disabled={disabled}
    style={{
      padding: "9px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8,
      fontSize: 14, background: disabled ? "#f8fafc" : "#fff",
      color: "#0f172a", width: "100%",
    }}
  >
    <option value="">— Select —</option>
    {options.map(o => <option key={o} value={o}>{o}</option>)}
  </select>
);

const SectionHeader = ({ icon: Icon, title, color = "#0284c7" }) => (
  <div className="form-section-header" style={{
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

/* ─── Checkbox pill group ─────────────────────── */
const PillGroup = ({ options, selected, onChange, disabled }) => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
    {options.map(o => {
      const active = selected.includes(o);
      return (
        <button key={o} type="button" disabled={disabled}
          onClick={() => {
            if (disabled) return;
            onChange(active ? selected.filter(x => x !== o) : [...selected, o]);
          }}
          style={{
            padding: "5px 14px", borderRadius: 20, border: "1.5px solid",
            borderColor: active ? "#0284c7" : "#e2e8f0",
            background: active ? "#e0f2fe" : "#fff",
            color: active ? "#0284c7" : "#64748b",
            fontWeight: 600, fontSize: 13, cursor: disabled ? "default" : "pointer",
          }}
        >{o}</button>
      );
    })}
  </div>
);

/* ─── Finding row ─────────────────────────────── */
const FindingRow = ({ label, value, onChange, disabled }) => {
  const v = value || { present: null, details: "" };
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "1fr auto 1fr",
      gap: 12, alignItems: "center",
      padding: "12px 16px", borderBottom: "1px solid #f1f5f9",
    }}>
      <span style={{ fontSize: 14, fontWeight: 500, color: "#374151" }}>{label}</span>
      <YN value={v.present} onChange={val => onChange({ ...v, present: val })} disabled={disabled} />
      {v.present === true
        ? <TextInput value={v.details} onChange={val => onChange({ ...v, details: val })}
            placeholder="Specify type / location…" disabled={disabled} />
        : <span style={{ fontSize: 13, color: "#cbd5e1" }}>—</span>
      }
    </div>
  );
};

/* ════════════════════════════════════════════════
   FORM K
════════════════════════════════════════════════ */
export default function FormK() {
  const location = useLocation();
  const navigate = useNavigate();
  const { markFormCompleted } = useFormProgress();
  const { patientData } = usePatient();

  const BLANK = {
    enrollment_id: "",
    dob: "",
    gestation_weeks: "",
    gestation_days: "",
    mri_date: "",
    pma_weeks: "",
    pma_days: "",
    /* K.1 */
    selected_for_mri: null,
    scanner: "",
    sedation: null,
    sedation_agent: "",
    sequences: [],
    /* K.3 findings */
    myelination: "",
    bg_thalamus: { present: null, type: [], site: [], details: "" },
    plic: { present: null, type: [], details: "" },
    white_matter: { present: null, location: [], type: [], details: "" },
    corpus_callosum: { present: null, type: [], details: "" },
    cerebellum: { present: null, type: [], details: "" },
    atrophy: { present: null, type: [], details: "" },
    hemorrhage_swi: { present: null, location: "", details: "" },
    /* K.4 */
    overall_mri: "",
    mri_summary: "",
    radiologist_name: "",
    radiologist_date: "",
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

  /* load patient context */
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
      await api.post("/form-k", formData);
      setIsSaved(true);
      setIsEditing(false);
      setMessage("✅ Form K saved successfully.");
      markFormCompleted("form_k");
    } catch (err) {
      setMessage("❌ Save failed: " + (err.response?.data?.detail || err.message));
    } finally {
      setSaving(false);
    }
  };

  const SEQ_OPTIONS = ["DWI", "3D T1", "T2", "SWI", "DTI"];
  const SCANNER_OPTIONS = ["3T Philips", "Equivalent 3T"];

  return (
    <div className="form-wrapper">
      {/* ── header ── */}
      <div className="form-header-action-row">
        <div className="form-header-title-area">
          <div className="form-breadcrumb">
            <Home size={12} /> FORM K
          </div>
          <h2 className="form-main-title">MRI Brain Assessment</h2>
          <p className="form-main-subtitle">
            MRI Brain at 40 ± 2 weeks PMA — 25% Subset
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

      {/* ── editing banner ── */}
      {isEditing && (
        <div className="editing-mode-banner">
          <span className="editing-mode-dot" />
          Editing Mode — unsaved changes will be lost if you navigate away
        </div>
      )}

      {/* ── message ── */}
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

      {/* ══ K.1 Subset Selection & Identification ══ */}
      <Card>
        <SectionHeader icon={Brain} title="K.1  Identification & MRI Subset" />
        <CardBody>
          <Field label="Selected for MRI Subset">
            <YN value={formData.selected_for_mri}
              onChange={v => set("selected_for_mri", v)} disabled={!editable} />
          </Field>

          {formData.selected_for_mri === false && (
            <div style={{
              padding: "12px 16px", background: "#fef3c7", borderRadius: 8,
              color: "#92400e", fontWeight: 500, fontSize: 14,
              border: "1px solid #fde68a",
            }}>
              ℹ️ Patient not selected for MRI subset — Form K not applicable.
            </div>
          )}

          {formData.selected_for_mri !== false && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                <Field label="Enrollment ID">
                  <TextInput value={formData.enrollment_id}
                    onChange={v => set("enrollment_id", v)} disabled />
                </Field>
                <Field label="Date of Birth">
                  <TextInput value={formData.dob}
                    onChange={v => set("dob", v)} disabled placeholder="DD/MM/YY" />
                </Field>
                <Field label="Gestation at Birth">
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <TextInput value={formData.gestation_weeks}
                      onChange={v => set("gestation_weeks", v)} disabled placeholder="wks" />
                    <span style={{ color: "#94a3b8" }}>wks</span>
                    <TextInput value={formData.gestation_days}
                      onChange={v => set("gestation_days", v)} disabled placeholder="days" />
                    <span style={{ color: "#94a3b8" }}>days</span>
                  </div>
                </Field>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                <Field label="Date of MRI" hint="(DD/MM/YY)">
                  <TextInput value={formData.mri_date}
                    onChange={v => set("mri_date", v)}
                    disabled={!editable} placeholder="DD/MM/YY" />
                </Field>
                <Field label="PMA at MRI">
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
              </div>
            </>
          )}
        </CardBody>
      </Card>

      {/* ══ K.2 MRI Details ══ */}
      {formData.selected_for_mri !== false && (
        <Card>
          <SectionHeader icon={FlaskConical} title="K.2  MRI Details" color="#7c3aed" />
          <CardBody>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <Field label="Scanner">
                <SelectInput value={formData.scanner}
                  onChange={v => set("scanner", v)}
                  options={SCANNER_OPTIONS} disabled={!editable} />
              </Field>
              <Field label="Sedation">
                <YN value={formData.sedation}
                  onChange={v => set("sedation", v)} disabled={!editable} />
              </Field>
            </div>

            {formData.sedation === true && (
              <Field label="Sedation Agent">
                <TextInput value={formData.sedation_agent}
                  onChange={v => set("sedation_agent", v)}
                  disabled={!editable} placeholder="Agent name…" />
              </Field>
            )}

            <Field label="Sequences Performed">
              <PillGroup options={SEQ_OPTIONS}
                selected={formData.sequences}
                onChange={v => set("sequences", v)}
                disabled={!editable} />
            </Field>
          </CardBody>
        </Card>
      )}

      {/* ══ K.3 MRI Findings ══ */}
      {formData.selected_for_mri !== false && (
        <Card>
          <SectionHeader icon={Brain} title="K.3  MRI Findings" color="#0891b2" />

          {/* Myelination */}
          <div style={{ padding: "14px 24px", borderBottom: "1px solid #f1f5f9" }}>
            <Field label="Myelination">
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {["Appropriate for age", "Delayed"].map(opt => (
                  <button key={opt} type="button" disabled={!editable}
                    onClick={() => editable && set("myelination", opt)}
                    style={{
                      padding: "6px 18px", borderRadius: 7, border: "1.5px solid",
                      borderColor: formData.myelination === opt ? "#0891b2" : "#e2e8f0",
                      background: formData.myelination === opt ? "#ecfeff" : "#fff",
                      color: formData.myelination === opt ? "#0891b2" : "#64748b",
                      fontWeight: 600, fontSize: 13, cursor: !editable ? "default" : "pointer",
                    }}
                  >{opt}</button>
                ))}
              </div>
            </Field>
          </div>

          {/* Finding rows */}
          {[
            {
              key: "bg_thalamus", label: "Basal Ganglia & Thalamus",
              typeOpts: ["T1 hyper", "T2 hyper", "DWI restriction"],
              siteOpts: ["Caudate", "Putamen", "GP", "Thalamus"],
            },
            {
              key: "plic", label: "PLIC (Post Limb Internal Capsule)",
              typeOpts: ["T2 hyperintensity", "Signal reversal"],
            },
            {
              key: "white_matter", label: "White Matter",
              locationOpts: ["Periventricular", "Deep WM"],
              typeOpts: ["Hyperintensity", "Volume loss"],
            },
            {
              key: "corpus_callosum", label: "Corpus Callosum",
              typeOpts: ["Thinning", "Signal abnormality"],
            },
            {
              key: "cerebellum", label: "Cerebellum",
              typeOpts: ["Signal changes", "Atrophy"],
            },
            {
              key: "atrophy", label: "Atrophy",
              typeOpts: ["Cortical", "Sulcal widening", "Ventriculomegaly"],
            },
          ].map(({ key, label, typeOpts, siteOpts, locationOpts }) => {
            const v = formData[key] || { present: null, type: [], site: [], location: [], details: "" };
            return (
              <div key={key} style={{ padding: "16px 24px", borderBottom: "1px solid #f1f5f9" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>{label}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, color: "#94a3b8" }}>Abnormality:</span>
                    <YN value={v.present}
                      onChange={val => set(key, { ...v, present: val })}
                      disabled={!editable} />
                  </div>
                </div>
                {v.present === true && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingLeft: 12 }}>
                    {typeOpts && (
                      <Field label="Type">
                        <PillGroup options={typeOpts}
                          selected={v.type || []}
                          onChange={val => set(key, { ...v, type: val })}
                          disabled={!editable} />
                      </Field>
                    )}
                    {siteOpts && (
                      <Field label="Site">
                        <PillGroup options={siteOpts}
                          selected={v.site || []}
                          onChange={val => set(key, { ...v, site: val })}
                          disabled={!editable} />
                      </Field>
                    )}
                    {locationOpts && (
                      <Field label="Location">
                        <PillGroup options={locationOpts}
                          selected={v.location || []}
                          onChange={val => set(key, { ...v, location: val })}
                          disabled={!editable} />
                      </Field>
                    )}
                    <Field label="Additional details">
                      <TextInput value={v.details}
                        onChange={val => set(key, { ...v, details: val })}
                        disabled={!editable} placeholder="Describe…" />
                    </Field>
                  </div>
                )}
              </div>
            );
          })}

          {/* Hemorrhage SWI */}
          <div style={{ padding: "16px 24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>Hemorrhage (SWI)</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: "#94a3b8" }}>Hemorrhagic changes:</span>
                <YN value={formData.hemorrhage_swi?.present}
                  onChange={val => set("hemorrhage_swi", { ...formData.hemorrhage_swi, present: val })}
                  disabled={!editable} />
              </div>
            </div>
            {formData.hemorrhage_swi?.present === true && (
              <Field label="Location">
                <TextInput value={formData.hemorrhage_swi?.location || ""}
                  onChange={val => set("hemorrhage_swi", { ...formData.hemorrhage_swi, location: val })}
                  disabled={!editable} placeholder="Describe location…" />
              </Field>
            )}
          </div>
        </Card>
      )}

      {/* ══ K.4 Overall MRI ══ */}
      {formData.selected_for_mri !== false && (
        <Card>
          <SectionHeader icon={CheckCircle} title="K.4  Overall MRI Result" color="#16a34a" />
          <CardBody>
            <Field label="Overall MRI">
              <div style={{ display: "flex", gap: 10 }}>
                {["Normal", "Abnormal"].map(opt => (
                  <button key={opt} type="button" disabled={!editable}
                    onClick={() => editable && set("overall_mri", opt)}
                    style={{
                      padding: "8px 28px", borderRadius: 8, border: "2px solid",
                      borderColor: formData.overall_mri === opt
                        ? (opt === "Normal" ? "#16a34a" : "#dc2626")
                        : "#e2e8f0",
                      background: formData.overall_mri === opt
                        ? (opt === "Normal" ? "#dcfce7" : "#fee2e2")
                        : "#fff",
                      color: formData.overall_mri === opt
                        ? (opt === "Normal" ? "#15803d" : "#991b1b")
                        : "#64748b",
                      fontWeight: 700, fontSize: 14, cursor: !editable ? "default" : "pointer",
                    }}
                  >{opt}</button>
                ))}
              </div>
            </Field>

            <Field label="Summary">
              <textarea
                value={formData.mri_summary}
                onChange={e => set("mri_summary", e.target.value)}
                disabled={!editable}
                rows={3}
                placeholder="Brief summary of MRI findings…"
                style={{
                  width: "100%", padding: "10px 12px",
                  border: "1.5px solid #e2e8f0", borderRadius: 8,
                  fontSize: 14, resize: "vertical", fontFamily: "inherit",
                  background: !editable ? "#f8fafc" : "#fff",
                }}
              />
            </Field>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
              <Field label="Site Radiologist">
                <TextInput value={formData.radiologist_name}
                  onChange={v => set("radiologist_name", v)}
                  disabled={!editable} placeholder="Full name" />
              </Field>
              <Field label="Date" hint="(DD/MM/YY)">
                <TextInput value={formData.radiologist_date}
                  onChange={v => set("radiologist_date", v)}
                  disabled={!editable} placeholder="DD/MM/YY" />
              </Field>
            </div>
          </CardBody>
        </Card>
      )}

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
              <Save size={16} /> {saving ? "Saving…" : "Save Form K"}
            </button>
          )}
          <button className="btn-secondary" onClick={() => navigate("/dashboard")}>
            <ArrowRight size={16} /> Next Form
          </button>
        </div>
      </div>
    </div>
  );
}
