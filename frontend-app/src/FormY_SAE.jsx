import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import api from "./api/axios";
import "./styles/global.css";
import "./styles/FormComponents.css";
import "./styles/FormY.css";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { toDateOnlyValue, parseDateOnly } from "./utils/datetime";
import FormNavBar from "./components/FormNavBar";
import { usePatient } from "./context/PatientContext";
import { useFormProgress } from "./context/FormProgressContext";
import {
  Home,
  AlertTriangle,
  ClipboardList,
  Activity,
  ShieldAlert,
  Link2,
  Wrench,
  HeartPulse,
  FileText,
  UserRound,
  BadgeCheck,
  Plus,
} from "lucide-react";

const REPORT_TYPES = ["Initial", "Follow-up", "Final"];

const SERIOUSNESS_OPTIONS = [
  "Death",
  "Life-threatening",
  "Inpatient hospitalization/prolongation",
  "Persistent disability",
  "Congenital anomaly",
  "Other Medically Important Event",
];

/** Map legacy stored labels → current CRF labels (no data loss on reload). */
const SERIOUSNESS_ALIASES = {
  Hospitalization: "Inpatient hospitalization/prolongation",
  "Other medically important event": "Other Medically Important Event",
};

// INC Neonatal Adverse Event Severity Scale (NAESS) — the same 5-grade
// scale the AE-detection work uses, so an SAE that links to a recorded
// AE carries the same grade end-to-end.
const SEVERITY_OPTIONS = [
  "Grade 1 — Mild",
  "Grade 2 — Moderate",
  "Grade 3 — Severe",
  "Grade 4 — Life-threatening",
  "Grade 5 — Death",
];

// Legacy 3-level values (and bare grade digits) → current label, so
// already-saved reports reload without losing their severity.
const SEVERITY_ALIASES = {
  "Mild (Transient)": "Grade 1 — Mild",
  "Moderate (Interferes with activity)": "Grade 2 — Moderate",
  "Severe (Incapacitating)": "Grade 3 — Severe",
  "1": "Grade 1 — Mild",
  "2": "Grade 2 — Moderate",
  "3": "Grade 3 — Severe",
  "4": "Grade 4 — Life-threatening",
  "5": "Grade 5 — Death",
};

function normalizeSeverity(v) {
  if (!v) return "";
  const s = String(v).trim();
  if (SEVERITY_OPTIONS.includes(s)) return s;
  if (SEVERITY_ALIASES[s]) return SEVERITY_ALIASES[s];
  const m = s.match(/grade\s*([1-5])/i);
  return m ? SEVERITY_OPTIONS[Number(m[1]) - 1] : s;
}

// AE-detection grade digit → severity label (for the "prefill from a
// recorded AE" picker).
const gradeToSeverity = (g) => SEVERITY_ALIASES[String(g || "").trim()] || "";

const CAUSALITY_OPTIONS = [
  "Not Related (Clearly extraneous)",
  "Unlikely (Doubtfully related)",
  "Possible (May be related)",
  "Probable (Likely related)",
  "Definite (Clearly related)",
];

const CAUSALITY_ALIASES = {
  "Not Related": "Not Related (Clearly extraneous)",
  Unlikely: "Unlikely (Doubtfully related)",
  Possible: "Possible (May be related)",
  Probable: "Probable (Likely related)",
  Definite: "Definite (Clearly related)",
};

const ACTION_OPTIONS = [
  "None",
  "Intervention Withdrawn",
  "Interrupted",
  "Dose Modified",
  "N/A",
];

const OUTCOME_OPTIONS = [
  "Resolved",
  "Resolving",
  "Not Resolved",
  "Resolved with Sequelae",
  "Fatal",
];

function emptyToNull(v) {
  if (v === "" || v === undefined || v === null) return null;
  return v;
}

function dateOnly(v) {
  if (!v) return "";
  const m = String(v).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : String(v);
}

function splitDateTime(v) {
  if (!v) return { date: "", time: "" };
  const s = String(v).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})(?:[T\s](\d{1,2}:\d{2}))?/);
  if (!m) return { date: "", time: "" };
  let time = m[2] || "";
  if (time) {
    const [hh, mm] = time.split(":");
    time = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }
  return { date: m[1], time };
}

function joinDateTime(date, time) {
  if (!date && !time) return null;
  if (date && time) return `${date}T${time}`;
  if (date) return date;
  return null;
}

function normalizeSeriousness(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((v) => SERIOUSNESS_ALIASES[v] || v)
    .filter((v, i, arr) => v && arr.indexOf(v) === i);
}

function normalizeCausality(v) {
  if (!v) return "";
  return CAUSALITY_ALIASES[v] || v;
}

function BLANK(enrollmentId = "") {
  return {
    _record_id: null,
    study_id: "PORTAL",
    enrollment_id: enrollmentId,
    report_type: "",
    report_date: "",
    diagnosis: "",
    onset_date: "",
    onset_time: "",
    end_date: "",
    end_time: "",
    ongoing: false,
    seriousness: [],
    severity: "",
    causality: "",
    action_taken: "",
    outcome: "",
    date_of_death: "",
    narrative: "",
    reporter_name: "",
    reporter_designation: "",
    reporter_contact: "",
    reporter_date: "",
    reporter_signature: "",
    investigator_name: "",
    investigator_date: "",
    site: "",
  };
}

function mapApiToForm(row) {
  const onset = splitDateTime(row.onset_datetime);
  const end = splitDateTime(row.end_datetime);
  return {
    ...BLANK(row.enrollment_id || ""),
    _record_id: row.id ?? null,
    study_id: row.study_id || "PORTAL",
    enrollment_id: row.enrollment_id || "",
    report_type: row.report_type || "",
    report_date: dateOnly(row.report_date),
    diagnosis: row.diagnosis || "",
    onset_date: onset.date,
    onset_time: onset.time,
    end_date: end.date,
    end_time: end.time,
    ongoing: !!row.ongoing,
    seriousness: normalizeSeriousness(row.seriousness),
    severity: normalizeSeverity(row.severity),
    causality: normalizeCausality(row.causality),
    action_taken: row.action_taken || "",
    outcome: row.outcome || "",
    date_of_death: dateOnly(row.date_of_death),
    narrative: row.narrative || "",
    reporter_name: row.reporter_name || "",
    reporter_designation: row.reporter_designation || "",
    reporter_contact: row.reporter_contact || "",
    reporter_date: dateOnly(row.reporter_date),
    reporter_signature: row.reporter_signature || "",
    investigator_name: row.investigator_name || "",
    investigator_date: dateOnly(row.investigator_date),
    site: row.site || "",
  };
}

function buildPayload(data) {
  return {
    study_id: emptyToNull(data.study_id),
    enrollment_id: data.enrollment_id,
    report_type: emptyToNull(data.report_type),
    report_date: emptyToNull(data.report_date),
    diagnosis: emptyToNull(data.diagnosis),
    onset_datetime: joinDateTime(data.onset_date, data.onset_time),
    end_datetime: data.ongoing ? null : joinDateTime(data.end_date, data.end_time),
    ongoing: !!data.ongoing,
    seriousness: Array.isArray(data.seriousness) ? data.seriousness : [],
    severity: emptyToNull(data.severity),
    causality: emptyToNull(data.causality),
    action_taken: emptyToNull(data.action_taken),
    outcome: emptyToNull(data.outcome),
    date_of_death:
      data.outcome === "Fatal" ? emptyToNull(data.date_of_death) : null,
    narrative: emptyToNull(data.narrative),
    reporter_name: emptyToNull(data.reporter_name),
    reporter_designation: emptyToNull(data.reporter_designation),
    reporter_contact: emptyToNull(data.reporter_contact),
    reporter_date: emptyToNull(data.reporter_date),
    reporter_signature: emptyToNull(data.reporter_signature),
    investigator_name: emptyToNull(data.investigator_name),
    investigator_signature: null,
    investigator_date: emptyToNull(data.investigator_date),
    site: emptyToNull(data.site),
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
    <div className="fy-date-wrap">
      <DatePicker
        selected={value ? parseDateOnly(value) : null}
        onChange={(date) => onChange(date ? toDateOnlyValue(date) : "")}
        dateFormat="dd/MM/yyyy"
        placeholderText="dd/mm/yyyy"
        className="fy-input"
        disabled={disabled}
        portalId="root"
        popperPlacement="bottom-start"
        popperClassName="fy-datepicker-popper"
      />
    </div>
  );
}

function Time24Input({ value, onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const wrapRef = useRef(null);
  const popoverRef = useRef(null);
  const parts = String(value || "").split(":");
  const hour = parts[0] || "";
  const minute = parts[1] || "";
  const h = hour === "" ? "" : String(hour).padStart(2, "0");
  const m = minute === "" ? "" : String(minute).padStart(2, "0");
  const display = h || m ? `${h || "00"}:${m || "00"}` : "";

  const calcCoords = () => {
    const el = wrapRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const popH = 200;
    const spaceBelow = window.innerHeight - rect.bottom;
    const placeAbove = spaceBelow < popH && rect.top > spaceBelow;
    return {
      top: placeAbove ? rect.top - 6 : rect.bottom + 6,
      left: Math.min(Math.max(8, rect.left), window.innerWidth - 140),
      width: Math.max(rect.width, 108),
      placeAbove,
    };
  };

  const toggleOpen = () => {
    if (disabled) return;
    if (open) {
      setOpen(false);
      setCoords(null);
      return;
    }
    setCoords(calcCoords());
    setOpen(true);
  };

  useLayoutEffect(() => {
    if (!open) return undefined;
    const onReposition = () => setCoords(calcCoords());
    window.addEventListener("scroll", onReposition, true);
    window.addEventListener("resize", onReposition);
    return () => {
      window.removeEventListener("scroll", onReposition, true);
      window.removeEventListener("resize", onReposition);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onClickOutside = (e) => {
      const inTrigger = wrapRef.current && wrapRef.current.contains(e.target);
      const inPopover = popoverRef.current && popoverRef.current.contains(e.target);
      if (!inTrigger && !inPopover) {
        setOpen(false);
        setCoords(null);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const hourOptions = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
  const minOptions = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

  const pick = (part, val) => {
    const curH = hour === "" ? 0 : Number(hour);
    const curM = minute === "" ? 0 : Number(minute);
    const nextH = part === "h" ? Number(val) : curH;
    const nextM = part === "m" ? Number(val) : curM;
    onChange(`${String(nextH).padStart(2, "0")}:${String(nextM).padStart(2, "0")}`);
  };

  const popover =
    open &&
    !disabled &&
    coords &&
    createPortal(
      <div
        ref={popoverRef}
        className="fy-time-pop"
        style={{
          position: "fixed",
          top: coords.placeAbove ? undefined : coords.top,
          bottom: coords.placeAbove ? window.innerHeight - coords.top : undefined,
          left: coords.left,
          minWidth: coords.width,
        }}
      >
        <div className="fy-time-col">
          <div className="fy-time-col-label">HH</div>
          <div className="fy-time-list">
            {hourOptions.map((v) => (
              <div
                key={v}
                className={`fy-time-item${h === v ? " active" : ""}`}
                onClick={() => pick("h", v)}
              >
                {v}
              </div>
            ))}
          </div>
        </div>
        <div className="fy-time-col">
          <div className="fy-time-col-label">MM</div>
          <div className="fy-time-list">
            {minOptions.map((v) => (
              <div
                key={v}
                className={`fy-time-item${m === v ? " active" : ""}`}
                onClick={() => pick("m", v)}
              >
                {v}
              </div>
            ))}
          </div>
        </div>
      </div>,
      document.body,
    );

  return (
    <div className="fy-time-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`fy-time-btn${display ? "" : " empty"}`}
        onClick={toggleOpen}
        disabled={disabled}
      >
        {display || "HH:MM"}
      </button>
      {popover}
    </div>
  );
}

function SectionCard({ icon: Icon, num, title, children }) {
  return (
    <section className="fy-card">
      <div className="fy-card-header">
        {Icon && <Icon size={18} className="fy-sec-icon" />}
        {num != null && <span className="fy-sec-num">{num}</span>}
        <h3>{title}</h3>
      </div>
      <div className="fy-card-body">{children}</div>
    </section>
  );
}

function Chips({ options, value, onChange, multi = false }) {
  const selected = multi
    ? Array.isArray(value)
      ? value
      : []
    : value || "";
  return (
    <div className="fy-chips">
      {options.map((opt) => {
        const active = multi ? selected.includes(opt) : selected === opt;
        return (
          <button
            key={opt}
            type="button"
            className={`fy-chip${multi ? " multi" : ""}${active ? " active" : ""}`}
            onClick={() => {
              if (multi) {
                onChange(
                  active
                    ? selected.filter((v) => v !== opt)
                    : [...selected, opt],
                );
              } else {
                onChange(active ? "" : opt);
              }
            }}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function reportLabel(row) {
  const type = row.report_type || "Report";
  const date = dateOnly(row.report_date) || dateOnly(row.created_at) || "";
  const dx = (row.diagnosis || "").trim();
  const shortDx = dx.length > 28 ? `${dx.slice(0, 28)}…` : dx;
  return [type, date, shortDx].filter(Boolean).join(" · ");
}

export default function FormY_SAE() {
  const location = useLocation();
  const navigate = useNavigate();
  const { enrollmentId: routeId } = useParams();
  const { patientData } = usePatient();
  const { markFormCompleted } = useFormProgress();

  const [formData, setFormData] = useState(() => BLANK());
  const [savedRows, setSavedRows] = useState([]);
  const [isSaved, setIsSaved] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [assessors, setAssessors] = useState([]);
  const [siteName, setSiteName] = useState("");
  const [aeRows, setAeRows] = useState([]);       // recorded AEs for this baby
  const [downloading, setDownloading] = useState("");

  const set = (field, value) => {
    setIsSaved(false);
    setFormData((p) => ({ ...p, [field]: value }));
  };

  const toggleSeriousness = (item) => {
    setIsSaved(false);
    setFormData((p) => {
      const has = p.seriousness.includes(item);
      return {
        ...p,
        seriousness: has
          ? p.seriousness.filter((v) => v !== item)
          : [...p.seriousness, item],
      };
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
        if (resolvedSite) {
          setSiteName(resolvedSite);
          setFormData((p) => ({
            ...p,
            enrollment_id: id,
            site: p.site || resolvedSite,
          }));
        }
      })
      .catch(() => {});

    api
      .get(`/sae-report/${encodeURIComponent(id)}`)
      .then((res) => {
        const rows = Array.isArray(res.data) ? res.data : res.data ? [res.data] : [];
        setSavedRows(rows);
        if (rows.length) {
          setFormData(mapApiToForm(rows[0]));
          setIsSaved(true);
        } else {
          setFormData(BLANK(id));
          setIsSaved(false);
        }
      })
      .catch((err) => {
        if (err?.response?.status !== 404) console.error("Failed to load SAE reports", err);
      });

    api
      .get(`/adverse-events/${encodeURIComponent(id)}`)
      .then((res) => {
        const evs = Array.isArray(res.data?.events) ? res.data.events : [];
        setAeRows(evs.filter((e) => e && (e.description || e.definition_no)));
      })
      .catch(() => setAeRows([]));
  }, [routeId, patientData, location.state]);

  const prefillFromAe = (idx) => {
    const e = aeRows[Number(idx)];
    if (!e) return;
    setIsSaved(false);
    setFormData((p) => ({
      ...p,
      diagnosis: p.diagnosis || e.description || "",
      severity: p.severity || gradeToSeverity(e.grade),
      onset_date: p.onset_date || dateOnly(e.start_date),
      end_date: p.end_date || dateOnly(e.end_date),
    }));
  };

  const downloadDoc = async (kind) => {
    if (!formData._record_id) return;
    setDownloading(kind);
    try {
      const res = await api.get(
        `/sae-report/${encodeURIComponent(formData.enrollment_id)}/${formData._record_id}/document`,
        { params: { kind }, responseType: "blob" },
      );
      const cd = res.headers?.["content-disposition"] || "";
      const m = cd.match(/filename="?([^"]+)"?/);
      const name =
        (m && m[1]) ||
        `${kind === "covering_letter" ? "SAE_covering_letter" : "SAE_report"}_${formData.enrollment_id}.docx`;
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("SAE document download failed", err);
      setSaveMessage("❌ Could not generate the document — try again.");
      setTimeout(() => setSaveMessage(""), 5000);
    } finally {
      setDownloading("");
    }
  };

  useEffect(() => {
    const site = siteName || formData.site || patientData?.site_name || patientData?.site || "";
    if (!site) {
      setAssessors([]);
      return;
    }
    api
      .get(`/sites/${encodeURIComponent(site)}/screeners`)
      .then((r) => setAssessors(Array.isArray(r.data) ? r.data : []))
      .catch(() => setAssessors([]));
  }, [siteName, formData.site, patientData?.site_name, patientData?.site]);

  const loadSaved = (row) => {
    setFormData(mapApiToForm(row));
    setIsSaved(true);
    setSaveMessage("");
    requestAnimationFrame(() => {
      document.querySelector(".form-y-page")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    });
  };

  const startNew = () => {
    const id = formData.enrollment_id;
    setFormData({
      ...BLANK(id),
      study_id: formData.study_id || "PORTAL",
      site: formData.site || siteName || "",
      report_date: toDateOnlyValue(new Date()),
    });
    setIsSaved(false);
    setSaveMessage("");
  };

  const saveForm = async () => {
    if (!formData.enrollment_id) {
      setSaveMessage("❌ Enrollment ID is required");
      return false;
    }
    try {
      const payload = buildPayload(formData);
      let res;
      if (formData._record_id) {
        res = await api.put(`/sae-report/${formData._record_id}`, payload);
      } else {
        res = await api.post("/sae-report/", payload);
      }
      const mapped = mapApiToForm(res.data);
      setFormData(mapped);
      setSavedRows((prev) => {
        const others = prev.filter((r) => r.id !== res.data.id);
        return [res.data, ...others];
      });
      markFormCompleted("form_y_sae");
      setIsSaved(true);
      setSaveMessage("✅ SAE report saved");
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

  const endDisabled = !!formData.ongoing;

  return (
    <form
      className="screening-form form-y-page"
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
            <Home size={12} /> FORM Y
          </div>
          <h1 className="form-main-title">Serious Adverse Event (SAE) Reporting</h1>
          <p className="form-main-subtitle">
            Report within 24 hours of awareness of the event · Initial / Follow-up / Final
          </p>
        </div>
        <div className="form-header-meta-area">
          <div className="screening-id-badge">
            <span className="id-label">Enrollment ID</span>
            <span className="id-val">{formData.enrollment_id || "—"}</span>
          </div>
        </div>
      </div>

      <div className="fy-banner">
        <AlertTriangle size={18} />
        <div>
          Complete this form within <strong>24 hours</strong> of becoming aware of an SAE.
          Use <strong>+ New report</strong> for follow-up or final submissions so prior reports remain unchanged.
        </div>
      </div>

      <div className="fy-tracker">
        {savedRows.map((row) => (
          <button
            key={row.id}
            type="button"
            className={`fy-pill${formData._record_id === row.id ? " active" : ""}`}
            onClick={() => loadSaved(row)}
            title={reportLabel(row)}
          >
            <span className="dot" />
            {reportLabel(row)}
          </button>
        ))}
        <button type="button" className="fy-new-btn" onClick={startNew}>
          <Plus size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
          New report
        </button>
      </div>

      <div className={`fy-editing${formData._record_id ? " edit" : " new"}`}>
        {formData._record_id
          ? `Editing saved report #${formData._record_id}`
          : "New SAE report (unsaved)"}
      </div>

      <SectionCard icon={ClipboardList} num="I" title="Event identification">
        <div className="fy-grid-4">
          <div className="form-group">
            <label>Study ID</label>
            <input
              className="fy-input"
              value={formData.study_id}
              readOnly
            />
          </div>
          <div className="form-group">
            <label>Enrollment ID</label>
            <input className="fy-input" value={formData.enrollment_id} readOnly />
          </div>
          <div className="form-group">
            <label>Date of report</label>
            <DateField value={formData.report_date} onChange={(v) => set("report_date", v)} />
          </div>
          <div className="form-group">
            <label>Report type</label>
            <Chips
              options={REPORT_TYPES}
              value={formData.report_type}
              onChange={(v) => set("report_type", v)}
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard icon={Activity} num="II" title="Event description">
        {aeRows.length > 0 && (
          <div className="fy-block" style={{ marginBottom: 8 }}>
            <div className="form-group">
              <label>Prefill from a recorded adverse event (optional)</label>
              <select
                className="fy-input"
                defaultValue=""
                onChange={(e) => {
                  prefillFromAe(e.target.value);
                  e.target.value = "";
                }}
              >
                <option value="">Select a recorded AE to copy its term / grade / dates…</option>
                {aeRows.map((e, i) => (
                  <option key={i} value={i}>
                    {(e.description || e.definition_no)}
                    {e.grade ? ` — Grade ${e.grade}` : ""}
                    {e.start_date ? ` (${dateOnly(e.start_date)})` : ""}
                  </option>
                ))}
              </select>
              <small className="fy-hint">
                Only fills fields that are still blank — your edits are never overwritten.
              </small>
            </div>
          </div>
        )}
        <div className="fy-block">
          <div className="form-group">
            <label>Diagnosis / Event term</label>
            <input
              className="fy-input"
              value={formData.diagnosis}
              onChange={(e) => set("diagnosis", e.target.value)}
              placeholder="Preferred medical term / diagnosis"
            />
          </div>
        </div>
        <div className="fy-grid-2">
          <div className="form-group">
            <label>Onset date &amp; time</label>
            <div className="fy-datetime">
              <DateField value={formData.onset_date} onChange={(v) => set("onset_date", v)} />
              <Time24Input value={formData.onset_time} onChange={(v) => set("onset_time", v)} />
            </div>
          </div>
          <div className="form-group">
            <label>End date &amp; time</label>
            <div className="fy-datetime">
              <DateField
                value={formData.end_date}
                onChange={(v) => set("end_date", v)}
                disabled={endDisabled}
              />
              <Time24Input
                value={formData.end_time}
                onChange={(v) => set("end_time", v)}
                disabled={endDisabled}
              />
            </div>
          </div>
        </div>
        <label className="fy-ongoing">
          <input
            type="checkbox"
            checked={!!formData.ongoing}
            onChange={(e) => {
              const on = e.target.checked;
              setIsSaved(false);
              setFormData((p) => ({
                ...p,
                ongoing: on,
                end_date: on ? "" : p.end_date,
                end_time: on ? "" : p.end_time,
              }));
            }}
          />
          Ongoing (event not yet ended)
        </label>
      </SectionCard>

      <SectionCard icon={ShieldAlert} num="III" title="Seriousness criteria">
        <p className="fy-note" style={{ marginTop: 0 }}>
          Check all that apply.
        </p>
        <div className="fy-check-grid">
          {SERIOUSNESS_OPTIONS.map((item) => {
            const on = formData.seriousness.includes(item);
            return (
              <label key={item} className={`fy-check${on ? " on" : ""}`}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggleSeriousness(item)}
                />
                {item}
              </label>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard icon={HeartPulse} num="IV" title="Severity">
        <Chips
          options={SEVERITY_OPTIONS}
          value={formData.severity}
          onChange={(v) => set("severity", v)}
        />
        <small className="fy-hint">
          INC Neonatal Adverse Event Severity Scale (NAESS) — the same grade used by
          the AE detection tool.
        </small>
      </SectionCard>

      <SectionCard icon={Link2} num="V" title="Causality (relationship to oxygen intervention)">
        <Chips
          options={CAUSALITY_OPTIONS}
          value={formData.causality}
          onChange={(v) => set("causality", v)}
        />
      </SectionCard>

      <SectionCard icon={Wrench} num="VI" title="Action taken">
        <Chips
          options={ACTION_OPTIONS}
          value={formData.action_taken}
          onChange={(v) => set("action_taken", v)}
        />
      </SectionCard>

      <SectionCard icon={Activity} num="VII" title="Outcome">
        <Chips
          options={OUTCOME_OPTIONS}
          value={formData.outcome}
          onChange={(v) => set("outcome", v)}
        />
        {formData.outcome === "Fatal" && (
          <div className="form-group" style={{ marginTop: 16, maxWidth: 280 }}>
            <label>If fatal — date of death</label>
            <DateField
              value={formData.date_of_death}
              onChange={(v) => set("date_of_death", v)}
            />
          </div>
        )}
      </SectionCard>

      <SectionCard icon={FileText} num="VIII" title="Narrative">
        <div className="form-group">
          <label>Brief description of event, treatment given, and outcome</label>
          <textarea
            value={formData.narrative}
            onChange={(e) => set("narrative", e.target.value)}
            rows={6}
            placeholder="Describe the event chronologically, interventions, and current status…"
          />
        </div>
      </SectionCard>

      <SectionCard icon={UserRound} num="IX" title="Reporter information">
        <div className="fy-grid-3">
          <div className="form-group">
            <label>Reported by</label>
            <select
              className="fy-input"
              value={formData.reporter_name || ""}
              onChange={(e) => {
                const name = e.target.value;
                setIsSaved(false);
                setFormData((p) => ({
                  ...p,
                  reporter_name: name,
                  reporter_designation: getDesignation(name) || p.reporter_designation,
                }));
              }}
            >
              <option value="">Select…</option>
              {assessors.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
              {formData.reporter_name &&
                !assessors.includes(formData.reporter_name) && (
                  <option value={formData.reporter_name}>{formData.reporter_name}</option>
                )}
            </select>
          </div>
          <div className="form-group">
            <label>Designation</label>
            <input
              className="fy-input"
              value={formData.reporter_designation}
              onChange={(e) => set("reporter_designation", e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Contact no.</label>
            <input
              className="fy-input"
              value={formData.reporter_contact}
              onChange={(e) => set("reporter_contact", e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Date</label>
            <DateField
              value={formData.reporter_date}
              onChange={(v) => set("reporter_date", v)}
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard icon={BadgeCheck} num="X" title="Investigator verification">
        <div className="fy-grid-3">
          <div className="form-group">
            <label>Investigator name</label>
            <input
              className="fy-input"
              value={formData.investigator_name}
              onChange={(e) => set("investigator_name", e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Date</label>
            <DateField
              value={formData.investigator_date}
              onChange={(v) => set("investigator_date", v)}
            />
          </div>
          <div className="form-group">
            <label>Site</label>
            <input
              className="fy-input"
              value={formData.site}
              readOnly
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard icon={FileText} num="XI" title="IEC report (PGIMER-DSMC format)">
        <p className="fy-hint" style={{ marginTop: 0 }}>
          Generates the CDSCO / NDCT Rules 2019 SAE Reporting Form and the PI 24-hour
          covering letter as editable Word files, pre-filled from this report and the
          baby&rsquo;s study data. Blinded to the randomised oxygen arm. Trial / site
          details that have not been configured yet appear as{" "}
          <strong>[TO BE PROVIDED]</strong> blanks — complete them in Word before submitting.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            className="fy-new-btn"
            disabled={!formData._record_id || !!downloading}
            onClick={() => downloadDoc("report")}
          >
            {downloading === "report" ? "Generating…" : "Download SAE Reporting Form (.docx)"}
          </button>
          <button
            type="button"
            className="fy-new-btn"
            disabled={!formData._record_id || !!downloading}
            onClick={() => downloadDoc("covering_letter")}
          >
            {downloading === "covering_letter" ? "Generating…" : "Download PI covering letter (.docx)"}
          </button>
        </div>
        {!formData._record_id && (
          <small className="fy-hint">Save this report first to enable the downloads.</small>
        )}
      </SectionCard>

      {saveMessage && (
        <p className={`fy-save-msg${saveMessage.startsWith("❌") ? " err" : ""}`}>
          {saveMessage}
        </p>
      )}

      <FormNavBar
        backLabel="AE Form"
        nextLabel="SAE List"
        step={1}
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
          navigate(`/sae-list/${formData.enrollment_id}`, {
            state: { enrollmentId: formData.enrollment_id },
          });
        }}
      />
    </form>
  );
}
