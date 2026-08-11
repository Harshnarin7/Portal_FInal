import React, { useState, useEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import api from "./api/axios";
import "./styles/global.css";
import "./styles/FormComponents.css";
import "./styles/FormSAEList.css";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { toDateOnlyValue, parseDateOnly } from "./utils/datetime";
import FormNavBar from "./components/FormNavBar";
import { usePatient } from "./context/PatientContext";
import { useFormProgress } from "./context/FormProgressContext";
import {
  Home,
  ListChecks,
  UserRound,
  Plus,
  Trash2,
  Maximize2,
  X,
} from "lucide-react";

function emptyToNull(v) {
  if (v === "" || v === undefined || v === null) return null;
  return v;
}

function dateOnly(v) {
  if (!v) return "";
  const m = String(v).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : String(v);
}

function blankRow() {
  return {
    sae: "",
    definition_no: "",
    start_date: "",
    notification_24h: "",
    end_date: "",
    notify_initial: "",
    notify_10d: "",
    notify_resolution: "",
  };
}

function BLANK(enrollmentId = "") {
  return {
    enrollment_id: enrollmentId,
    rows: [blankRow()],
    completed_by: "",
    designation: "",
    completion_date: "",
  };
}

function mapApiToForm(row) {
  const rows = Array.isArray(row.rows)
    ? row.rows.map((r) => ({
        sae: r?.sae || "",
        definition_no: r?.definition_no || "",
        start_date: dateOnly(r?.start_date),
        notification_24h: dateOnly(r?.notification_24h),
        end_date: dateOnly(r?.end_date),
        notify_initial: dateOnly(r?.notify_initial),
        notify_10d: dateOnly(r?.notify_10d),
        notify_resolution: dateOnly(r?.notify_resolution),
      }))
    : [];
  return {
    ...BLANK(row.enrollment_id || ""),
    enrollment_id: row.enrollment_id || "",
    rows: rows.length ? rows : [blankRow()],
    completed_by: row.completed_by || "",
    designation: row.designation || "",
    completion_date: dateOnly(row.completion_date),
  };
}

function buildPayload(data) {
  return {
    enrollment_id: data.enrollment_id,
    rows: (data.rows || []).map((r) => ({
      sae: emptyToNull(r.sae),
      definition_no: emptyToNull(r.definition_no),
      start_date: emptyToNull(r.start_date),
      notification_24h: emptyToNull(r.notification_24h),
      end_date: emptyToNull(r.end_date),
      notify_initial: emptyToNull(r.notify_initial),
      notify_10d: emptyToNull(r.notify_10d),
      notify_resolution: emptyToNull(r.notify_resolution),
    })),
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

function DateField({ value, onChange, disabled = false }) {
  return (
    <div className="sl-date-wrap">
      <DatePicker
        selected={value ? parseDateOnly(value) : null}
        onChange={(date) => onChange(date ? toDateOnlyValue(date) : "")}
        dateFormat="dd/MM/yyyy"
        placeholderText="dd/mm/yyyy"
        className="sl-input"
        disabled={disabled}
        portalId="root"
        popperPlacement="bottom-start"
        popperClassName="sl-datepicker-popper"
      />
    </div>
  );
}

function ExpandableText({ value, onChange, placeholder, title = "Full text" }) {
  const [open, setOpen] = useState(false);
  const long = (value || "").length > 80 || (value || "").includes("\n");

  return (
    <div className="sl-expand-cell">
      <textarea
        className="sl-cell-ta"
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        title={value || placeholder}
      />
      <button
        type="button"
        className={`sl-expand-btn${long ? " hot" : ""}`}
        title="View / edit full text"
        onClick={() => setOpen(true)}
      >
        <Maximize2 size={13} />
      </button>
      {open && (
        <div className="sl-modal-backdrop" onClick={() => setOpen(false)}>
          <div className="sl-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="sl-modal-head">
              <h4>{title}</h4>
              <button type="button" className="sl-modal-close" onClick={() => setOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <textarea
              className="sl-modal-ta"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              autoFocus
            />
            <div className="sl-modal-foot">
              <span className="sl-modal-hint">{(value || "").length} characters</span>
              <button type="button" className="sl-modal-done" onClick={() => setOpen(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionCard({ icon: Icon, title, children }) {
  return (
    <section className="sl-card">
      <div className="sl-card-header">
        {Icon && <Icon size={18} className="sl-sec-icon" />}
        <h3>{title}</h3>
      </div>
      <div className="sl-card-body">{children}</div>
    </section>
  );
}

export default function SeriousAdverseEventsList() {
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

  const updateRow = (index, field, value) => {
    setIsSaved(false);
    setFormData((p) => {
      const rows = [...(p.rows || [])];
      rows[index] = { ...rows[index], [field]: value };
      return { ...p, rows };
    });
  };

  const addRow = () => {
    setIsSaved(false);
    setFormData((p) => ({ ...p, rows: [...(p.rows || []), blankRow()] }));
  };

  const removeRow = (index) => {
    setIsSaved(false);
    setFormData((p) => {
      const next = (p.rows || []).filter((_, i) => i !== index);
      return { ...p, rows: next.length ? next : [blankRow()] };
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

    api
      .get(`/birth-resuscitation/${id}`)
      .then(async (res) => {
        const b = Array.isArray(res.data) ? res.data[0] : res.data;
        if (!b) return;
        let resolvedSite = b.site_name || patientData?.site_name || patientData?.site || "";
        if (b.screening_id) {
          try {
            const screening = (await api.get(`/screenings/by-screening-id/${b.screening_id}`)).data;
            if (screening?.site_name) resolvedSite = screening.site_name;
          } catch {
            /* optional */
          }
        }
        if (resolvedSite) setSiteName(resolvedSite);
      })
      .catch(() => {});

    api
      .get(`/sae-list/${encodeURIComponent(id)}`)
      .then((res) => {
        if (!res.data || !res.data.enrollment_id) return;
        setFormData(mapApiToForm(res.data));
        setIsSaved(true);
      })
      .catch((err) => {
        if (err?.response?.status === 404) return;
        console.error("Failed to load SAE list", err);
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
      const res = await api.post("/sae-list/", buildPayload(formData));
      setFormData(mapApiToForm(res.data));
      markFormCompleted("sae_list");
      setIsSaved(true);
      setSaveMessage("✅ SAE list saved");
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

  return (
    <form
      className="screening-form form-sael-page"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await saveForm();
        if (ok) navigate("/dashboard");
      }}
    >
      <div className="form-header-action-row">
        <div className="form-header-title-area">
          <div className="form-breadcrumb">
            <Home size={12} /> HELPER · SAE LISTING
          </div>
          <h1 className="form-main-title">Serious Adverse Events</h1>
          <p className="form-main-subtitle">
            List of serious adverse events with 24-hour and detailed notification dates
          </p>
        </div>
        <div className="form-header-meta-area">
          <div className="screening-id-badge">
            <span className="id-label">Enrollment ID</span>
            <span className="id-val">{formData.enrollment_id || "—"}</span>
          </div>
        </div>
      </div>

      <SectionCard icon={ListChecks} title="List of serious adverse events">
        <p className="sl-note" style={{ marginTop: 0 }}>
          Add one card per SAE. Fill dates for start, 24-hour notification, end, then the three
          detailed notification dates.
        </p>

        {(formData.rows || []).length === 0 ? (
          <div className="sl-empty">No SAEs yet — click Add SAE</div>
        ) : (
          <div className="sl-event-list">
            {formData.rows.map((row, i) => (
              <article key={i} className="sl-event-card">
                <div className="sl-event-head">
                  <span className="sl-event-num">SAE {i + 1}</span>
                  <button
                    type="button"
                    className="sl-del"
                    title="Remove this SAE"
                    onClick={() => removeRow(i)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <div className="sl-event-grid">
                  <div className="form-group sl-span-2">
                    <label>SAE</label>
                    <ExpandableText
                      value={row.sae}
                      onChange={(v) => updateRow(i, "sae", v)}
                      placeholder="SAE description / term"
                      title={`SAE #${i + 1}`}
                    />
                  </div>
                  <div className="form-group">
                    <label>Definition number</label>
                    <input
                      className="sl-input"
                      value={row.definition_no}
                      onChange={(e) => updateRow(i, "definition_no", e.target.value)}
                      placeholder="No."
                    />
                  </div>
                </div>

                <div className="sl-event-block">
                  <div className="sl-event-block-title">Key dates</div>
                  <div className="sl-event-grid">
                    <div className="form-group">
                      <label>Start date</label>
                      <DateField
                        value={row.start_date}
                        onChange={(v) => updateRow(i, "start_date", v)}
                      />
                    </div>
                    <div className="form-group">
                      <label>Date of 24-h notification</label>
                      <DateField
                        value={row.notification_24h}
                        onChange={(v) => updateRow(i, "notification_24h", v)}
                      />
                    </div>
                    <div className="form-group">
                      <label>End date</label>
                      <DateField
                        value={row.end_date}
                        onChange={(v) => updateRow(i, "end_date", v)}
                      />
                    </div>
                  </div>
                </div>

                <div className="sl-event-block">
                  <div className="sl-event-block-title">Dates of detailed notification</div>
                  <div className="sl-event-grid">
                    <div className="form-group">
                      <label>1. Initial</label>
                      <DateField
                        value={row.notify_initial}
                        onChange={(v) => updateRow(i, "notify_initial", v)}
                      />
                    </div>
                    <div className="form-group">
                      <label>2. 10 days</label>
                      <DateField
                        value={row.notify_10d}
                        onChange={(v) => updateRow(i, "notify_10d", v)}
                      />
                    </div>
                    <div className="form-group">
                      <label>3. Resolution</label>
                      <DateField
                        value={row.notify_resolution}
                        onChange={(v) => updateRow(i, "notify_resolution", v)}
                      />
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="sl-toolbar">
          <button type="button" className="sl-add" onClick={addRow}>
            <Plus size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
            Add SAE
          </button>
        </div>
      </SectionCard>

      <SectionCard icon={UserRound} title="Form completed by">
        <div className="sl-grid-3">
          <div className="form-group">
            <label>Name of person filling this form</label>
            <select
              className="sl-input"
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
              className="sl-input"
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
        <p className={`sl-save-msg${saveMessage.startsWith("❌") ? " err" : " ok"}`}>
          {saveMessage}
        </p>
      )}

      <FormNavBar
        backLabel="AE Form"
        nextLabel="Done"
        step={3}
        totalSteps={3}
        isSaved={isSaved}
        onBack={() =>
          navigate(`/adverse-events/${formData.enrollment_id || ""}`, {
            state: { enrollmentId: formData.enrollment_id },
          })
        }
        onSave={saveForm}
        onNext={async () => {
          if (!isSaved) {
            const ok = await saveForm();
            if (!ok) return;
          }
          navigate("/dashboard");
        }}
      />
    </form>
  );
}
