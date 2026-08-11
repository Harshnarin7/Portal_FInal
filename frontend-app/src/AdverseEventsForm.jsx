import React, { useState, useEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import api from "./api/axios";
import "./styles/global.css";
import "./styles/FormComponents.css";
import "./styles/FormAE.css";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { toDateOnlyValue, parseDateOnly } from "./utils/datetime";
import FormNavBar from "./components/FormNavBar";
import { usePatient } from "./context/PatientContext";
import { useFormProgress } from "./context/FormProgressContext";
import {
  Home,
  ClipboardList,
  AlertCircle,
  ListChecks,
  UserRound,
  Plus,
  Trash2,
  Maximize2,
  X,
} from "lucide-react";

const GRADES = ["1", "2", "3", "4", "5"];

function emptyToNull(v) {
  if (v === "" || v === undefined || v === null) return null;
  return v;
}

function dateOnly(v) {
  if (!v) return "";
  const m = String(v).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : String(v);
}

function blankEvent() {
  return {
    description: "",
    definition_no: "",
    start_date: "",
    end_date: "",
    severity_desc: "",
    grade: "",
    converted_to_sae: "",
  };
}

function BLANK(enrollmentId = "") {
  return {
    enrollment_id: enrollmentId,
    mother_name: "",
    baby_uid: "",
    maternal_uid: "",
    has_adverse_event: "",
    events: [],
    completed_by: "",
    designation: "",
    completion_date: "",
  };
}

function mapApiToForm(row) {
  const has =
    row.has_adverse_event === true || row.has_adverse_event === "yes" || row.has_adverse_event === "Yes"
      ? "Yes"
      : row.has_adverse_event === false || row.has_adverse_event === "no" || row.has_adverse_event === "No"
        ? "No"
        : "";
  const events = Array.isArray(row.events)
    ? row.events.map((e) => ({
        description: e?.description || "",
        definition_no: e?.definition_no || "",
        start_date: dateOnly(e?.start_date),
        end_date: dateOnly(e?.end_date),
        severity_desc: e?.severity_desc || "",
        grade: e?.grade != null && e?.grade !== "" ? String(e.grade) : "",
        converted_to_sae: e?.converted_to_sae || "",
      }))
    : [];
  return {
    ...BLANK(row.enrollment_id || ""),
    enrollment_id: row.enrollment_id || "",
    mother_name: row.mother_name || "",
    baby_uid: row.baby_uid || "",
    maternal_uid: row.maternal_uid || "",
    has_adverse_event: has,
    events,
    completed_by: row.completed_by || "",
    designation: row.designation || "",
    completion_date: dateOnly(row.completion_date),
  };
}

function buildPayload(data) {
  const hasYes = data.has_adverse_event === "Yes";
  const events = hasYes
    ? (data.events || []).map((e) => ({
        description: emptyToNull(e.description),
        definition_no: emptyToNull(e.definition_no),
        start_date: emptyToNull(e.start_date),
        end_date: emptyToNull(e.end_date),
        severity_desc: emptyToNull(e.severity_desc),
        grade: emptyToNull(e.grade),
        converted_to_sae: emptyToNull(e.converted_to_sae),
      }))
    : [];
  return {
    enrollment_id: data.enrollment_id,
    mother_name: emptyToNull(data.mother_name),
    baby_uid: emptyToNull(data.baby_uid),
    maternal_uid: emptyToNull(data.maternal_uid),
    has_adverse_event:
      data.has_adverse_event === "Yes"
        ? true
        : data.has_adverse_event === "No"
          ? false
          : null,
    events,
    completed_by: emptyToNull(data.completed_by),
    designation: emptyToNull(data.designation),
    completion_date: emptyToNull(data.completion_date),
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

function DateField({ value, onChange, disabled = false, className = "ae-input" }) {
  return (
    <div className="ae-date-wrap">
      <DatePicker
        selected={value ? parseDateOnly(value) : null}
        onChange={(date) => onChange(date ? toDateOnlyValue(date) : "")}
        dateFormat="dd/MM/yyyy"
        placeholderText="dd/mm/yyyy"
        className={className}
        disabled={disabled}
        portalId="root"
        popperPlacement="bottom-start"
        popperClassName="ae-datepicker-popper"
      />
    </div>
  );
}

function YesNo({ value, onChange, small = false }) {
  return (
    <div className={`ae-yn${small ? " sm" : ""}`}>
      {["Yes", "No"].map((opt) => (
        <button
          key={opt}
          type="button"
          className={`${opt === "Yes" ? "yes" : "no"}${value === opt ? " active" : ""}`}
          onClick={() => onChange(opt)}
        >
          {opt.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

/** Compact cell editor + “View full” modal for long text. */
function ExpandableText({
  value,
  onChange,
  placeholder,
  title = "Full text",
  rows = 2,
}) {
  const [open, setOpen] = useState(false);
  const long = (value || "").length > 80 || (value || "").includes("\n");

  return (
    <div className="ae-expand-cell">
      <textarea
        className="ae-cell-ta"
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        title={value || placeholder}
      />
      <button
        type="button"
        className={`ae-expand-btn${long ? " hot" : ""}`}
        title="View / edit full text"
        onClick={() => setOpen(true)}
      >
        <Maximize2 size={13} />
      </button>

      {open && (
        <div className="ae-modal-backdrop" onClick={() => setOpen(false)}>
          <div
            className="ae-modal"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ae-modal-head">
              <h4>{title}</h4>
              <button type="button" className="ae-modal-close" onClick={() => setOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <textarea
              className="ae-modal-ta"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              autoFocus
            />
            <div className="ae-modal-foot">
              <span className="ae-modal-hint">{(value || "").length} characters</span>
              <button type="button" className="ae-modal-done" onClick={() => setOpen(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionCard({ icon: Icon, num, title, children }) {
  return (
    <section className="ae-card">
      <div className="ae-card-header">
        {Icon && <Icon size={18} className="ae-sec-icon" />}
        {num != null && <span className="ae-sec-num">{num}</span>}
        <h3>{title}</h3>
      </div>
      <div className="ae-card-body">{children}</div>
    </section>
  );
}

export default function AdverseEventsForm() {
  const location = useLocation();
  const navigate = useNavigate();
  const { enrollmentId: routeId } = useParams();
  const { patientData } = usePatient();
  const { markFormCompleted } = useFormProgress();

  const [formData, setFormData] = useState(() => BLANK());
  const [isSaved, setIsSaved] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [assessors, setAssessors] = useState([]);
  const [siteName, setSiteName] = useState("");

  const set = (field, value) => {
    setIsSaved(false);
    setFormData((p) => ({ ...p, [field]: value }));
  };

  const setHasAE = (v) => {
    setIsSaved(false);
    setFormData((p) => ({
      ...p,
      has_adverse_event: v,
      events: v === "Yes" ? (p.events?.length ? p.events : [blankEvent()]) : [],
    }));
  };

  const updateRow = (index, field, value) => {
    setIsSaved(false);
    setFormData((p) => {
      const events = [...(p.events || [])];
      events[index] = { ...events[index], [field]: value };
      return { ...p, events };
    });
  };

  const addRow = () => {
    setIsSaved(false);
    setFormData((p) => ({ ...p, events: [...(p.events || []), blankEvent()] }));
  };

  const removeRow = (index) => {
    setIsSaved(false);
    setFormData((p) => ({
      ...p,
      events: (p.events || []).filter((_, i) => i !== index),
    }));
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

    api
      .get(`/birth-resuscitation/${id}`)
      .then(async (res) => {
        const b = Array.isArray(res.data) ? res.data[0] : res.data;
        if (!b) return;
        let resolvedSite = b.site_name || patientData?.site_name || patientData?.site || "";
        let mother = "";
        let maternalUid = "";
        let babyUid = b.baby_uid || b.baby_annual_no || "";
        if (b.screening_id) {
          try {
            const screening = (await api.get(`/screenings/by-screening-id/${b.screening_id}`)).data;
            if (screening?.site_name) resolvedSite = screening.site_name;
          } catch {
            /* optional */
          }
          try {
            const pii = (await api.get(`/pii/screening/${b.screening_id}`)).data || {};
            mother = `${pii.mother_first_name || pii.mother_name_first || ""} ${pii.mother_surname || pii.mother_name_surname || ""}`.trim();
            maternalUid = pii.maternal_uid || "";
          } catch {
            /* optional */
          }
        }
        if (!mother) {
          mother = `${b.mother_name_first || ""} ${b.mother_name_surname || ""}`.trim();
        }
        if (resolvedSite) setSiteName(resolvedSite);
        setFormData((p) => ({
          ...p,
          enrollment_id: id,
          mother_name: p.mother_name || mother || patientData?.mother_name || "",
          maternal_uid: p.maternal_uid || maternalUid || patientData?.maternal_uid || "",
          baby_uid: p.baby_uid || babyUid || patientData?.baby_uid || "",
        }));
      })
      .catch(() => {});

    try {
      api.get(`/pii/enrollment/${id}`).then((res) => {
        const pii = res.data || {};
        const mother = `${pii.mother_first_name || ""} ${pii.mother_surname || ""}`.trim();
        setFormData((p) => ({
          ...p,
          mother_name: p.mother_name || mother || "",
          maternal_uid: p.maternal_uid || pii.maternal_uid || "",
        }));
      }).catch(() => {});
    } catch {
      /* optional */
    }

    api
      .get(`/adverse-events/${encodeURIComponent(id)}`)
      .then((res) => {
        // Backend returns null when no AE form has been saved yet
        if (!res.data || !res.data.enrollment_id) return;
        const mapped = mapApiToForm(res.data);
        setFormData((p) => ({
          ...mapped,
          enrollment_id: id,
          mother_name: mapped.mother_name || p.mother_name,
          maternal_uid: mapped.maternal_uid || p.maternal_uid,
          baby_uid: mapped.baby_uid || p.baby_uid,
        }));
        setIsSaved(true);
      })
      .catch((err) => {
        // 404 = never saved (older servers); treat as empty form
        if (err?.response?.status === 404) return;
        console.error("Failed to load AE form", err);
      });
  }, [routeId, patientData, location.state]);

  useEffect(() => {
    const site = siteName || patientData?.site_name || patientData?.site || "";
    if (!site) {
      setAssessors([]);
      return;
    }
    api
      .get(`/sites/${encodeURIComponent(site)}/screeners`)
      .then((r) => setAssessors(Array.isArray(r.data) ? r.data : []))
      .catch(() => setAssessors([]));
  }, [siteName, patientData?.site_name, patientData?.site]);

  const saveForm = async () => {
    if (!formData.enrollment_id) {
      setSaveMessage("❌ Enrollment ID is required");
      return false;
    }
    try {
      const res = await api.post("/adverse-events/", buildPayload(formData));
      const mapped = mapApiToForm(res.data);
      setFormData((p) => ({
        ...mapped,
        mother_name: mapped.mother_name || p.mother_name,
        maternal_uid: mapped.maternal_uid || p.maternal_uid,
        baby_uid: mapped.baby_uid || p.baby_uid,
      }));
      markFormCompleted("adverse_events");
      setIsSaved(true);
      setSaveMessage("✅ Adverse Events form saved");
      setTimeout(() => setSaveMessage(""), 3000);
      return true;
    } catch (err) {
      console.error(err?.response?.data || err);
      const detail = err?.response?.data?.detail;
      setSaveMessage(
        `❌ Save failed${detail ? `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`,
      );
      setTimeout(() => setSaveMessage(""), 5000);
      return false;
    }
  };

  const showEvents = formData.has_adverse_event === "Yes";

  return (
    <form
      className="screening-form form-ae-page"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await saveForm();
        if (ok) {
          navigate(`/sae-list/${formData.enrollment_id}`, {
            state: { enrollmentId: formData.enrollment_id },
          });
        }
      }}
    >
      <div className="form-header-action-row">
        <div className="form-header-title-area">
          <div className="form-breadcrumb">
            <Home size={12} /> HELPER · ADVERSE EVENTS
          </div>
          <h1 className="form-main-title">Adverse Events</h1>
          <p className="form-main-subtitle">
            Report any adverse event as per INC Adverse Event scale v1.0
          </p>
        </div>
        <div className="form-header-meta-area">
          <div className="screening-id-badge">
            <span className="id-label">Enrollment ID</span>
            <span className="id-val">{formData.enrollment_id || "—"}</span>
          </div>
        </div>
      </div>

      <SectionCard icon={ClipboardList} title="Identification">
        <div className="ae-grid-4">
          <div className="form-group">
            <label>Enrollment ID</label>
            <input className="ae-input" value={formData.enrollment_id} readOnly />
          </div>
          <div className="form-group">
            <label>Mother&apos;s name</label>
            <input
              className="ae-input"
              value={formData.mother_name}
              onChange={(e) => set("mother_name", e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Baby&apos;s UID</label>
            <input
              className="ae-input"
              value={formData.baby_uid}
              onChange={(e) => set("baby_uid", e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Maternal UID</label>
            <input
              className="ae-input"
              value={formData.maternal_uid}
              onChange={(e) => set("maternal_uid", e.target.value)}
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard icon={AlertCircle} title="Adverse event reported">
        <p className="ae-note" style={{ marginTop: 0 }}>
          Was any adverse event reported? If Yes, fill the details below.
        </p>
        <div className="ae-qa">
          <span className="ae-q">Any adverse event reported?</span>
          <YesNo value={formData.has_adverse_event} onChange={setHasAE} />
        </div>
      </SectionCard>

      {showEvents && (
        <SectionCard icon={ListChecks} title="List of adverse events">
          <div className="ae-table-wrap">
            <table className="ae-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Description of adverse event</th>
                  <th>Definition number</th>
                  <th>Start date</th>
                  <th>End date</th>
                  <th>Severity grade (full description)</th>
                  <th>Grade (1–5)</th>
                  <th>Converted to SAE</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(formData.events || []).length === 0 ? (
                  <tr>
                    <td colSpan={9}>
                      <div className="ae-empty">No events yet — click Add event</div>
                    </td>
                  </tr>
                ) : (
                  formData.events.map((row, idx) => (
                    <tr key={idx}>
                      <td className="ae-num">{idx + 1}</td>
                      <td className="ae-desc-col">
                        <ExpandableText
                          value={row.description}
                          onChange={(v) => updateRow(idx, "description", v)}
                          placeholder="Event description"
                          title={`Event #${idx + 1} — Description`}
                        />
                      </td>
                      <td style={{ minWidth: 90 }}>
                        <input
                          value={row.definition_no}
                          onChange={(e) => updateRow(idx, "definition_no", e.target.value)}
                          placeholder="No."
                        />
                      </td>
                      <td style={{ minWidth: 130 }}>
                        <DateField
                          value={row.start_date}
                          onChange={(v) => updateRow(idx, "start_date", v)}
                        />
                      </td>
                      <td style={{ minWidth: 130 }}>
                        <DateField
                          value={row.end_date}
                          onChange={(v) => updateRow(idx, "end_date", v)}
                        />
                      </td>
                      <td className="ae-desc-col">
                        <ExpandableText
                          value={row.severity_desc}
                          onChange={(v) => updateRow(idx, "severity_desc", v)}
                          placeholder="Full severity description"
                          title={`Event #${idx + 1} — Severity description`}
                        />
                      </td>
                      <td style={{ minWidth: 80 }}>
                        <select
                          value={row.grade}
                          onChange={(e) => updateRow(idx, "grade", e.target.value)}
                        >
                          <option value="">—</option>
                          {GRADES.map((g) => (
                            <option key={g} value={g}>
                              {g}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <YesNo
                          small
                          value={row.converted_to_sae}
                          onChange={(v) => updateRow(idx, "converted_to_sae", v)}
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="ae-del"
                          title="Remove row"
                          onClick={() => removeRow(idx)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="ae-toolbar">
            <button type="button" className="ae-add" onClick={addRow}>
              <Plus size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
              Add event
            </button>
          </div>
        </SectionCard>
      )}

      <SectionCard icon={UserRound} title="Form completed by">
        <div className="ae-grid-3">
          <div className="form-group">
            <label>Name of person filling this form</label>
            <select
              className="ae-input"
              value={formData.completed_by || ""}
              onChange={(e) => {
                const name = e.target.value;
                setIsSaved(false);
                setFormData((p) => ({
                  ...p,
                  completed_by: name,
                  designation: getDesignation(name) || p.designation,
                }));
              }}
            >
              <option value="">Select…</option>
              {assessors.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
              {formData.completed_by && !assessors.includes(formData.completed_by) && (
                <option value={formData.completed_by}>{formData.completed_by}</option>
              )}
            </select>
          </div>
          <div className="form-group">
            <label>Designation</label>
            <input
              className="ae-input"
              value={formData.designation}
              onChange={(e) => set("designation", e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Date</label>
            <DateField
              value={formData.completion_date}
              onChange={(v) => set("completion_date", v)}
            />
          </div>
        </div>
      </SectionCard>

      {saveMessage && (
        <p className={`ae-save-msg${saveMessage.startsWith("❌") ? " err" : ""}`}>
          {saveMessage}
        </p>
      )}

      <FormNavBar
        backLabel="Form Y"
        nextLabel="SAE List"
        step={2}
        totalSteps={3}
        isSaved={isSaved}
        onBack={() =>
          navigate(`/form-y-sae/${formData.enrollment_id || ""}`, {
            state: { enrollmentId: formData.enrollment_id },
          })
        }
        onSave={saveForm}
        onNext={async () => {
          if (!isSaved) {
            const ok = await saveForm();
            if (!ok) return;
          }
          navigate(`/sae-list/${formData.enrollment_id}`, {
            state: { enrollmentId: formData.enrollment_id },
          });
        }}
      />
    </form>
  );
}
