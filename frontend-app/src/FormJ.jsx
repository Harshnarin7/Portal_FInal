import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import api from "./api/axios";
import "./styles/global.css";
import "./styles/FormComponents.css";
import "./styles/FormJ.css";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { toDateOnlyValue, parseDateOnly } from "./utils/datetime";
import FormNavBar from "./components/FormNavBar";
import { usePatient } from "./context/PatientContext";
import { useFormProgress } from "./context/FormProgressContext";
import {
  Home, Clock, Building2, Skull, Wind, Activity, Brain, Eye, ShieldAlert, Scan,
} from "lucide-react";

const IVH_GRADES = ["None", "Grade I", "Grade II", "Grade III", "Grade IV"];
const CPVL_GRADES = ["None", "Grade I", "Grade II", "Grade III", "Grade IV"];
const NEC_STAGES = ["IA", "IB", "IIA", "IIB", "IIIA", "IIIB"];
const ROP_STAGES = ["None", "1", "2", "3", "4A", "4B", "5"];
const ZONES = ["Zone I", "Zone II", "Zone III"];
const PROTOCOL_WEEKS = [36, 40, 44];
const RESP_MODES = [
  { value: "nasal_cannula", label: "Nasal canula" },
  { value: "cpap_nippv", label: "CPAP/NIPPV" },
  { value: "imv", label: "IMV (invasive)" },
];

const emptyForm = () => ({
  assessment_weeks: "",
  death: "",
  death_cause: "",
  death_date: "",
  death_time: "",
  death_age_days: "",
  resp_support: "",
  resp_support_date: "",
  resp_mode: "",
  flow_rate: "",
  fio2: "",
  radiographic_lung: "",
  nec: "",
  nec_stage: "",
  nec_date: "",
  nec_surgery: "",
  ivh_right: "",
  ivh_right_date: "",
  ivh_left: "",
  ivh_left_date: "",
  cpvl_right: "",
  cpvl_right_date: "",
  cpvl_left: "",
  cpvl_left_date: "",
  rop_right: "",
  plus_right: "",
  arop_right: "",
  zone_right: "",
  treat_right: "",
  treat_date_right: "",
  rop_left: "",
  plus_left: "",
  arop_left: "",
  zone_left: "",
  treat_left: "",
  treat_date_left: "",
  sepsis: "",
  sepsis_episodes: "",
  mri_done: "",
  completed_by: "",
  designation: "",
  hospital: "",
  completion_date: "",
  _record_id: null,
});

function yesNoToBool(v) {
  if (v === "Yes" || v === true) return true;
  if (v === "No" || v === false) return false;
  return null;
}
function boolToYesNo(v) {
  if (v === true) return "Yes";
  if (v === false) return "No";
  return "";
}
function emptyToNull(v) {
  if (v === "" || v === undefined || v === null) return null;
  return v;
}
function numOrNull(v) {
  if (v === "" || v === undefined || v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
/** Normalize API date values to YYYY-MM-DD for DatePicker round-trip. */
function dateOnly(v) {
  if (!v) return "";
  const m = String(v).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : String(v);
}

function YesNo({ value, onChange }) {
  return (
    <div className="fj-yn">
      <button type="button" className={`yes${value === "Yes" ? " active" : ""}`} onClick={() => onChange("Yes")}>YES</button>
      <button type="button" className={`no${value === "No" ? " active" : ""}`} onClick={() => onChange("No")}>NO</button>
    </div>
  );
}

function ChipGroup({ options, value, onChange }) {
  return (
    <div className="fj-choice-row">
      {options.map((opt) => {
        const v = typeof opt === "string" ? opt : opt.value;
        const label = typeof opt === "string" ? opt : opt.label;
        return (
          <button
            key={v}
            type="button"
            className={`fj-chip${value === v ? " active" : ""}`}
            onClick={() => onChange(v)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function DateField({ value, onChange, placeholder = "dd/mm/yyyy" }) {
  return (
    <DatePicker
      selected={value ? parseDateOnly(value) : null}
      onChange={(date) => onChange(date ? toDateOnlyValue(date) : "")}
      dateFormat="dd/MM/yyyy"
      placeholderText={placeholder}
      className="fj-input"
    />
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
  const display = (h || m) ? `${h || "00"}:${m || "00"}` : "";

  const calcCoords = () => {
    const el = wrapRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const popH = 200;
    const spaceBelow = window.innerHeight - rect.bottom;
    const placeAbove = spaceBelow < popH && rect.top > spaceBelow;
    return {
      top: placeAbove ? rect.top - 6 : rect.bottom + 6,
      left: Math.min(Math.max(8, rect.left), window.innerWidth - 120),
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
    if (!open || !popoverRef.current) return;
    popoverRef.current.querySelectorAll(".mt-popover-item-active").forEach((node) => {
      node.scrollIntoView({ block: "center" });
    });
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

  const popover = open && !disabled && coords && createPortal(
    <div
      ref={popoverRef}
      className="mt-popover mt-popover-portal"
      style={{
        position: "fixed",
        top: coords.placeAbove ? undefined : coords.top,
        bottom: coords.placeAbove ? window.innerHeight - coords.top : undefined,
        left: coords.left,
        minWidth: coords.width,
        zIndex: 10050,
      }}
    >
      <div className="mt-popover-col">
        <div className="mt-popover-label">HH</div>
        <div className="mt-popover-list">
          {hourOptions.map((v) => (
            <div key={v} className={`mt-popover-item${h === v ? " mt-popover-item-active" : ""}`} onClick={() => pick("h", v)}>{v}</div>
          ))}
        </div>
      </div>
      <div className="mt-popover-col">
        <div className="mt-popover-label">MM</div>
        <div className="mt-popover-list">
          {minOptions.map((v) => (
            <div key={v} className={`mt-popover-item${m === v ? " mt-popover-item-active" : ""}`} onClick={() => pick("m", v)}>{v}</div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );

  return (
    <div className="mt-wrap" ref={wrapRef}>
      <div
        className={`mt-display${disabled ? " mt-disabled" : ""}`}
        onClick={toggleOpen}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (!disabled && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            toggleOpen();
          }
        }}
      >
        <span className={`mt-display-value${display ? "" : " mt-display-placeholder"}`}>
          {display || "HH:MM (24h)"}
        </span>
        <Clock size={16} className="mt-clock-btn" />
      </div>
      {popover}
    </div>
  );
}

function mapApiToForm(row) {
  return {
    ...emptyForm(),
    assessment_weeks: row.assessment_weeks ?? "",
    death: boolToYesNo(row.death),
    death_cause: row.death_cause || "",
    death_date: dateOnly(row.death_date),
    death_time: row.death_time || "",
    death_age_days: row.death_age_days ?? "",
    resp_support: boolToYesNo(row.resp_support),
    resp_support_date: dateOnly(row.resp_support_date),
    resp_mode: row.resp_mode || "",
    flow_rate: row.flow_rate ?? "",
    fio2: row.fio2 ?? "",
    radiographic_lung: boolToYesNo(row.radiographic_lung),
    nec: boolToYesNo(row.nec),
    nec_stage: row.nec_stage || "",
    nec_date: dateOnly(row.nec_date),
    nec_surgery: boolToYesNo(row.nec_surgery),
    ivh_right: row.ivh_right || "",
    ivh_right_date: dateOnly(row.ivh_right_date),
    ivh_left: row.ivh_left || "",
    ivh_left_date: dateOnly(row.ivh_left_date),
    cpvl_right: row.cpvl_right || "",
    cpvl_right_date: dateOnly(row.cpvl_right_date),
    cpvl_left: row.cpvl_left || "",
    cpvl_left_date: dateOnly(row.cpvl_left_date),
    rop_right: row.rop_right || "",
    plus_right: boolToYesNo(row.plus_right),
    arop_right: boolToYesNo(row.arop_right),
    zone_right: row.zone_right || "",
    treat_right: boolToYesNo(row.treat_right),
    treat_date_right: dateOnly(row.treat_date_right),
    rop_left: row.rop_left || "",
    plus_left: boolToYesNo(row.plus_left),
    arop_left: boolToYesNo(row.arop_left),
    zone_left: row.zone_left || "",
    treat_left: boolToYesNo(row.treat_left),
    treat_date_left: dateOnly(row.treat_date_left),
    sepsis: boolToYesNo(row.sepsis),
    sepsis_episodes: row.sepsis_episodes ?? "",
    mri_done: boolToYesNo(row.mri_done),
    completed_by: row.completed_by || "",
    designation: row.designation || (row.completed_by ? getDesignation(row.completed_by) : ""),
    hospital: row.hospital || "",
    completion_date: dateOnly(row.completion_date),
    _record_id: row.id ?? null,
  };
}

function buildPayload(enrollmentId, motherName, dob, data) {
  return {
    enrollment_id: enrollmentId,
    assessment_weeks: Number(data.assessment_weeks),
    mother_name: emptyToNull(motherName),
    dob: emptyToNull(dob),
    death: yesNoToBool(data.death),
    death_cause: emptyToNull(data.death_cause),
    death_date: emptyToNull(data.death_date),
    death_time: emptyToNull(data.death_time),
    death_age_days: numOrNull(data.death_age_days),
    resp_support: yesNoToBool(data.resp_support),
    resp_support_date: emptyToNull(data.resp_support_date),
    resp_mode: emptyToNull(data.resp_mode),
    flow_rate: numOrNull(data.flow_rate),
    fio2: numOrNull(data.fio2),
    radiographic_lung: yesNoToBool(data.radiographic_lung),
    nec: yesNoToBool(data.nec),
    nec_stage: emptyToNull(data.nec_stage),
    nec_date: emptyToNull(data.nec_date),
    nec_surgery: yesNoToBool(data.nec_surgery),
    ivh_right: emptyToNull(data.ivh_right),
    ivh_right_date: emptyToNull(data.ivh_right_date),
    ivh_left: emptyToNull(data.ivh_left),
    ivh_left_date: emptyToNull(data.ivh_left_date),
    cpvl_right: emptyToNull(data.cpvl_right),
    cpvl_right_date: emptyToNull(data.cpvl_right_date),
    cpvl_left: emptyToNull(data.cpvl_left),
    cpvl_left_date: emptyToNull(data.cpvl_left_date),
    rop_right: emptyToNull(data.rop_right),
    plus_right: yesNoToBool(data.plus_right),
    arop_right: yesNoToBool(data.arop_right),
    zone_right: emptyToNull(data.zone_right),
    treat_right: yesNoToBool(data.treat_right),
    treat_date_right: emptyToNull(data.treat_date_right),
    rop_left: emptyToNull(data.rop_left),
    plus_left: yesNoToBool(data.plus_left),
    arop_left: yesNoToBool(data.arop_left),
    zone_left: emptyToNull(data.zone_left),
    treat_left: yesNoToBool(data.treat_left),
    treat_date_left: emptyToNull(data.treat_date_left),
    sepsis: yesNoToBool(data.sepsis),
    sepsis_episodes: numOrNull(data.sepsis_episodes),
    mri_done: yesNoToBool(data.mri_done),
    completed_by: emptyToNull(data.completed_by),
    designation: emptyToNull(data.designation),
    hospital: emptyToNull(data.hospital),
    completion_date: emptyToNull(data.completion_date),
  };
}

function SideGradePanel({
  title,
  ivhLabel,
  ivhValue,
  onIvh,
  ivhDate,
  onIvhDate,
  cpvlLabel,
  cpvlValue,
  onCpvl,
  cpvlDate,
  onCpvlDate,
}) {
  return (
    <div className="fj-panel">
      <h4 className="fj-side-title">{title}</h4>

      <div className="fj-grade-block">
        <div className="fj-field-label">{ivhLabel}</div>
        <ChipGroup options={IVH_GRADES} value={ivhValue} onChange={onIvh} />
        <div className="form-group fj-date-sm">
          <label>Date</label>
          <DateField value={ivhDate} onChange={onIvhDate} />
        </div>
      </div>

      <div className="fj-grade-divider" />

      <div className="fj-grade-block">
        <div className="fj-field-label">{cpvlLabel}</div>
        <ChipGroup options={CPVL_GRADES} value={cpvlValue} onChange={onCpvl} />
        <div className="form-group fj-date-sm">
          <label>Date</label>
          <DateField value={cpvlDate} onChange={onCpvlDate} />
        </div>
      </div>
    </div>
  );
}

function EyeBlock({ side, data, set }) {
  const stageKey = side === "right" ? "rop_right" : "rop_left";
  const plusKey = side === "right" ? "plus_right" : "plus_left";
  const aropKey = side === "right" ? "arop_right" : "arop_left";
  const zoneKey = side === "right" ? "zone_right" : "zone_left";
  const treatKey = side === "right" ? "treat_right" : "treat_left";
  const dateKey = side === "right" ? "treat_date_right" : "treat_date_left";

  return (
    <div className="fj-panel">
      <h4 className="fj-side-title">{side === "right" ? "7.1 Right eye" : "7.2 Left eye"}</h4>
      <div className="fj-block">
        <div className="fj-field-label">ROP stage</div>
        <ChipGroup options={ROP_STAGES} value={data[stageKey]} onChange={(v) => set(stageKey, v)} />
      </div>
      <div className="fj-qa">
        <span className="fj-q">Plus disease</span>
        <YesNo value={data[plusKey]} onChange={(v) => set(plusKey, v)} />
      </div>
      <div className="fj-qa">
        <span className="fj-q">A-ROP</span>
        <YesNo value={data[aropKey]} onChange={(v) => set(aropKey, v)} />
      </div>
      <div className="fj-block">
        <div className="fj-field-label">Zone</div>
        <ChipGroup options={ZONES} value={data[zoneKey]} onChange={(v) => set(zoneKey, v)} />
      </div>
      <div className="fj-qa">
        <span className="fj-q">Treatment required</span>
        <YesNo value={data[treatKey]} onChange={(v) => set(treatKey, v)} />
      </div>
      {data[treatKey] === "Yes" && (
        <div className="form-group fj-date-sm" style={{ marginTop: 8 }}>
          <label>Treatment date</label>
          <DateField value={data[dateKey]} onChange={(v) => set(dateKey, v)} />
        </div>
      )}
    </div>
  );
}

function SectionCard({ icon: Icon, num, title, children }) {
  return (
    <section className="fj-card">
      <div className="fj-card-header">
        {Icon && <Icon size={18} className="sec-icon" />}
        {num != null && num !== "" && <span className="sec-num">{num}</span>}
        <h3>{title}</h3>
      </div>
      <div className="fj-card-body">{children}</div>
    </section>
  );
}

function getDesignation(name) {
  if (!name) return "";
  const n = name.replace(/^Dr\.\s*/i, "").trim();
  if (n === "Mannat Guliani") return "Project Research Scientist III (Medical)";
  if (n === "Shalini Dhiman") return "Project Research Scientist III (Non-Medical)";
  if (/^Dr\.\s*/i.test(name)) return "Site Research Scientist";
  return "Project Nurse III";
}

export default function FormJ() {
  const location = useLocation();
  const navigate = useNavigate();
  const { enrollmentId: routeId } = useParams();
  const { patientData } = usePatient();
  const { markFormCompleted } = useFormProgress();

  const [enrollmentId, setEnrollmentId] = useState("");
  const [motherName, setMotherName] = useState("");
  const [dob, setDob] = useState("");
  const [formData, setFormData] = useState(emptyForm);
  const [savedRows, setSavedRows] = useState([]);
  const [isSaved, setIsSaved] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [assessors, setAssessors] = useState([]);
  const [siteName, setSiteName] = useState("");

  const set = (key, value) => {
    setIsSaved(false);
    setFormData((p) => ({ ...p, [key]: value }));
  };

  const handleCompletedByChange = (e) => {
    const name = e.target.value;
    setIsSaved(false);
    setFormData((p) => ({
      ...p,
      completed_by: name,
      designation: getDesignation(name),
    }));
  };

  useEffect(() => {
    const id =
      routeId ||
      patientData?.enrollment_id ||
      location.state?.enrollmentId ||
      localStorage.getItem("current_enrollment_id") ||
      "";
    setEnrollmentId(id);
  }, [routeId, patientData, location.state]);

  useEffect(() => {
    if (!enrollmentId) return;

    api.get(`/birth-resuscitation/${enrollmentId}`)
      .then(async (res) => {
        const b = Array.isArray(res.data) ? res.data[0] : res.data;
        if (!b) return;
        if (b.date_of_birth) setDob((prev) => prev || b.date_of_birth);
        let name = `${b.mother_name_first || ""} ${b.mother_name_surname || ""}`.trim();
        let resolvedSite = b.site_name || patientData?.site_name || patientData?.site || "";
        if (b.screening_id) {
          try {
            const screening = (await api.get(`/screenings/by-screening-id/${b.screening_id}`)).data;
            if (screening?.site_name) resolvedSite = screening.site_name;
          } catch { /* optional */ }
          if (!name) {
            try {
              const pii = (await api.get(`/pii/screening/${b.screening_id}`)).data || {};
              name = `${pii.mother_first_name || pii.mother_name_first || ""} ${pii.mother_surname || pii.mother_name_surname || ""}`.trim();
            } catch { /* optional */ }
          }
        }
        if (name) setMotherName((prev) => prev || name);
        if (resolvedSite) setSiteName(resolvedSite);
      })
      .catch(() => {});

    api.get(`/external-hospital-assessment/${enrollmentId}`)
      .then((res) => {
        const rows = Array.isArray(res.data) ? res.data : [];
        setSavedRows(rows);
        if (!rows.length) return;
        const latest = rows[rows.length - 1];
        setFormData(mapApiToForm(latest));
        if (latest.mother_name) setMotherName(latest.mother_name);
        if (latest.dob) setDob(latest.dob);
        setIsSaved(true);
      })
      .catch((err) => {
        if (err?.response?.status !== 404) console.error("Failed to load Form J", err);
      });
  }, [enrollmentId]);

  // Site staff roster for Completed by
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

  useEffect(() => {
    if (!dob || !formData.death_date || formData.death !== "Yes") return;
    const birth = parseDateOnly(dob);
    const death = parseDateOnly(formData.death_date);
    if (!birth || !death) return;
    const days = Math.floor((death.getTime() - birth.getTime()) / 86400000);
    if (days < 0) return;
    if (String(formData.death_age_days) === String(days)) return;
    setFormData((p) => ({ ...p, death_age_days: days }));
  }, [dob, formData.death_date, formData.death]);

  const savedWeekSet = new Set(savedRows.map((r) => Number(r.assessment_weeks)));
  const rowForWeek = (w) => savedRows.find((r) => Number(r.assessment_weeks) === Number(w));
  const nextMissingWeek = PROTOCOL_WEEKS.find((w) => !savedWeekSet.has(w));

  const loadSaved = (row) => {
    setFormData(mapApiToForm(row));
    if (row.mother_name) setMotherName(row.mother_name);
    if (row.dob) setDob(row.dob);
    setIsSaved(true);
    setSaveMessage("");
  };

  /** Start a fresh assessment (keeps mother / DOB / enrollment). Optional week prefill. */
  const startNew = (prefillWeeks = "") => {
    setFormData({
      ...emptyForm(),
      assessment_weeks: prefillWeeks === "" || prefillWeeks == null ? "" : String(prefillWeeks),
      hospital: formData.hospital || "",
    });
    setIsSaved(false);
    setSaveMessage("");
    // scroll to the weeks field
    requestAnimationFrame(() => {
      document.querySelector(".fj-weeks-input")?.focus?.();
      document.querySelector(".fj-visit-card")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    });
  };

  const openWeek = (w) => {
    const existing = rowForWeek(w);
    if (existing) loadSaved(existing);
    else startNew(w);
  };

  const saveForm = async ({ silent = false } = {}) => {
    if (!enrollmentId) {
      alert("Missing enrollment ID");
      return null;
    }
    const weeks = Number(formData.assessment_weeks);
    if (!weeks || weeks < 1) {
      alert("Please enter assessment weeks (e.g. 36, 40, 44)");
      return null;
    }
    const already = rowForWeek(weeks);
    if (already && formData._record_id && already.id !== formData._record_id) {
      const ok = window.confirm(
        `An assessment at ${weeks} weeks already exists. Save will update that visit. Continue?`,
      );
      if (!ok) return null;
    } else if (already && !formData._record_id) {
      const ok = window.confirm(
        `An assessment at ${weeks} weeks already exists. Save will update that visit (not create a duplicate). Continue?`,
      );
      if (!ok) return null;
    }
    try {
      const payload = buildPayload(enrollmentId, motherName, dob, formData);
      const res = await api.post("/external-hospital-assessment/", payload);
      const mapped = mapApiToForm(res.data);
      setFormData(mapped);
      setSavedRows((prev) => {
        const others = prev.filter((r) => Number(r.assessment_weeks) !== Number(res.data.assessment_weeks));
        return [...others, res.data].sort((a, b) => a.assessment_weeks - b.assessment_weeks);
      });
      markFormCompleted("form_j");
      setIsSaved(true);
      if (!silent) {
        setSaveMessage(`✅ ${weeks}-week assessment saved — you can fill again for another week anytime`);
        setTimeout(() => setSaveMessage(""), 5000);
      }
      return res.data;
    } catch (err) {
      console.error(err?.response?.data || err);
      setSaveMessage("❌ Save failed — see console");
      setTimeout(() => setSaveMessage(""), 3000);
      return null;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const saved = await saveForm();
    if (!saved) return;
    const done = new Set([
      ...savedRows.map((r) => Number(r.assessment_weeks)),
      Number(saved.assessment_weeks),
    ]);
    const remaining = PROTOCOL_WEEKS.filter((w) => !done.has(w));
    if (remaining.length > 0) {
      const goNextVisit = window.confirm(
        `Saved ${saved.assessment_weeks}-week assessment.\n\nStill remaining: ${remaining.join(", ")} weeks.\n\nOK = start next visit (${remaining[0]} weeks)\nCancel = stay on this form`,
      );
      if (goNextVisit) startNew(remaining[0]);
      return;
    }
    alert("✅ All protocol visits (36 / 40 / 44) have a saved assessment.");
  };

  const weeksLabel = formData.assessment_weeks || "____";

  return (
    <form className="screening-form form-j-page" onSubmit={handleSubmit}>
      <div className="form-header-action-row">
        <div className="form-header-title-area">
          <div className="form-breadcrumb"><Home size={12} /> FORM J</div>
          <h2 className="form-main-title">Study Outcomes Assessment – External Hospital</h2>
          <p className="form-main-subtitle">
            To be filled by the healthcare team at the treating hospital · Share at follow-up and complete Form I accordingly
          </p>
        </div>
        <div className="form-header-meta-area">
          <div className="screening-id-badge">
            <span className="id-label">Enrollment ID</span>
            <span className="id-val">{enrollmentId || "—"}</span>
          </div>
        </div>
      </div>

      <div className="fj-note">
        This form is filled <strong>separately at each visit</strong> (typically 36, 40 and 44 weeks).
        Each week is saved as its own record — saving 40 weeks does not overwrite 36 weeks.
        Use the visit tracker below or <strong>+ New assessment</strong> when it is time for the next visit.
      </div>

      <SectionCard icon={Building2} title="Identification">
        <div className="fj-id-row">
          <div className="form-group">
            <label>1. Mother&apos;s name</label>
            <input value={motherName} onChange={(e) => { setMotherName(e.target.value); setIsSaved(false); }} />
          </div>
          <div className="form-group">
            <label>2. DOB of baby</label>
            <DateField value={dob} onChange={(v) => { setDob(v); setIsSaved(false); }} />
          </div>
          <div className="form-group">
            <label>Enrollment ID</label>
            <input value={enrollmentId} readOnly />
          </div>
        </div>
      </SectionCard>

      <SectionCard num="J.1" title="Assessment at ____ weeks">
        <div className="fj-visit-card">
          <div className="fj-visit-label">Protocol visits</div>
          <div className="fj-visit-track" role="list">
            {PROTOCOL_WEEKS.map((w) => {
              const done = savedWeekSet.has(w);
              const active = Number(formData.assessment_weeks) === w;
              return (
                <button
                  key={w}
                  type="button"
                  role="listitem"
                  className={`fj-visit-chip${done ? " done" : ""}${active ? " active" : ""}`}
                  onClick={() => openWeek(w)}
                  title={done ? `Open saved ${w}-week assessment` : `Start ${w}-week assessment`}
                >
                  <span className="fj-visit-week">{w}w</span>
                  <span className="fj-visit-status">{done ? "Saved" : "Not filled"}</span>
                </button>
              );
            })}
            <button type="button" className="fj-visit-chip new" onClick={() => startNew("")}>
              <span className="fj-visit-week">+ New</span>
              <span className="fj-visit-status">Blank weeks</span>
            </button>
          </div>
          <p className="fj-hint" style={{ marginTop: 12 }}>
            Click a week to open or start that visit. Weeks field below stays blank for manual entry if needed.
          </p>
        </div>

        <div className="fj-assess-blank" style={{ marginTop: 16 }}>
          <span>Assessment at</span>
          <input
            className="fj-weeks-input"
            type="number"
            min="1"
            step="1"
            placeholder="—"
            value={formData.assessment_weeks}
            onChange={(e) => set("assessment_weeks", e.target.value)}
          />
          <span>weeks</span>
          {formData._record_id ? (
            <span className="fj-editing-badge">Editing saved visit</span>
          ) : (
            <span className="fj-editing-badge new">New visit</span>
          )}
        </div>

        {savedRows.length > 0 && (
          <div className="fj-saved-list" aria-label="All saved assessments">
            {savedRows.map((row) => (
              <button
                key={row.id}
                type="button"
                className={`fj-saved-pill${formData._record_id === row.id ? " active" : ""}`}
                onClick={() => loadSaved(row)}
              >
                {row.assessment_weeks} weeks
              </button>
            ))}
          </div>
        )}

        {isSaved && nextMissingWeek && (
          <div className="fj-next-visit">
            <button type="button" className="fj-next-visit-btn" onClick={() => startNew(nextMissingWeek)}>
              Start {nextMissingWeek}-week assessment →
            </button>
          </div>
        )}
      </SectionCard>

      <SectionCard icon={Skull} num="3" title="Death">
        <div className="fj-qa">
          <span className="fj-q">Death due to any cause by {weeksLabel} weeks</span>
          <YesNo value={formData.death} onChange={(v) => set("death", v)} />
        </div>
        {formData.death === "Yes" && (
          <div className="fj-sub">
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label>a) Cause of death</label>
              <input value={formData.death_cause} onChange={(e) => set("death_cause", e.target.value)} placeholder="Enter cause of death" />
            </div>
            <div className="fj-grid-3">
              <div className="form-group">
                <label>b) Date of death</label>
                <DateField value={formData.death_date} onChange={(v) => set("death_date", v)} />
              </div>
              <div className="form-group">
                <label>c) Time of death (HH:MM)</label>
                <Time24Input value={formData.death_time} onChange={(v) => set("death_time", v)} />
              </div>
              <div className="form-group">
                <label>d) Age at death (days)</label>
                <input type="number" min="0" value={formData.death_age_days} onChange={(e) => set("death_age_days", e.target.value)} />
              </div>
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard icon={Wind} num="4" title="Respiratory support at 36 weeks PMA">
        <div className="fj-qa">
          <span className="fj-q">On respiratory support at 36 weeks PMA</span>
          <YesNo value={formData.resp_support} onChange={(v) => set("resp_support", v)} />
        </div>
        <div className="form-group" style={{ maxWidth: 240, marginTop: 10 }}>
          <label>Date</label>
          <DateField value={formData.resp_support_date} onChange={(v) => set("resp_support_date", v)} />
        </div>
        {formData.resp_support === "Yes" && (
          <div className="fj-sub">
            <div className="fj-block">
              <div className="fj-field-label">A · Mode</div>
              <ChipGroup options={RESP_MODES} value={formData.resp_mode} onChange={(v) => set("resp_mode", v)} />
            </div>
            <div className="fj-grid-2">
              <div className="form-group">
                <label>b) Flow rate (L/min)</label>
                <input type="number" step="any" value={formData.flow_rate} onChange={(e) => set("flow_rate", e.target.value)} />
              </div>
              <div className="form-group">
                <label>c) FiO₂ (%)</label>
                <input type="number" step="any" value={formData.fio2} onChange={(e) => set("fio2", e.target.value)} />
              </div>
            </div>
            <div className="fj-qa" style={{ marginTop: 8 }}>
              <span className="fj-q">d) Radiographic parenchymal lung disease</span>
              <YesNo value={formData.radiographic_lung} onChange={(v) => set("radiographic_lung", v)} />
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard icon={Activity} num="5" title="Necrotizing enterocolitis">
        <div className="fj-qa">
          <span className="fj-q">NEC diagnosed</span>
          <YesNo value={formData.nec} onChange={(v) => set("nec", v)} />
        </div>
        {formData.nec === "Yes" && (
          <div className="fj-sub">
            <div className="fj-block">
              <div className="fj-field-label">A · Stage</div>
              <ChipGroup options={NEC_STAGES} value={formData.nec_stage} onChange={(v) => set("nec_stage", v)} />
            </div>
            <div className="form-group" style={{ maxWidth: 240, marginBottom: 10 }}>
              <label>Date</label>
              <DateField value={formData.nec_date} onChange={(v) => set("nec_date", v)} />
            </div>
            <div className="fj-qa">
              <span className="fj-q">b) Surgical intervention done</span>
              <YesNo value={formData.nec_surgery} onChange={(v) => set("nec_surgery", v)} />
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard icon={Brain} num="6" title="Brain injury">
        <div className="fj-grid-2">
          <SideGradePanel
            title="6.1 Right"
            ivhLabel="A · IVH grade"
            ivhValue={formData.ivh_right}
            onIvh={(v) => set("ivh_right", v)}
            ivhDate={formData.ivh_right_date}
            onIvhDate={(v) => set("ivh_right_date", v)}
            cpvlLabel="C · cPVL grade"
            cpvlValue={formData.cpvl_right}
            onCpvl={(v) => set("cpvl_right", v)}
            cpvlDate={formData.cpvl_right_date}
            onCpvlDate={(v) => set("cpvl_right_date", v)}
          />
          <SideGradePanel
            title="6.2 Left"
            ivhLabel="B · IVH grade"
            ivhValue={formData.ivh_left}
            onIvh={(v) => set("ivh_left", v)}
            ivhDate={formData.ivh_left_date}
            onIvhDate={(v) => set("ivh_left_date", v)}
            cpvlLabel="D · cPVL grade"
            cpvlValue={formData.cpvl_left}
            onCpvl={(v) => set("cpvl_left", v)}
            cpvlDate={formData.cpvl_left_date}
            onCpvlDate={(v) => set("cpvl_left_date", v)}
          />
        </div>
      </SectionCard>

      <SectionCard icon={Eye} num="7" title="Retinopathy of prematurity">
        <div className="fj-grid-2">
          <EyeBlock side="right" data={formData} set={set} />
          <EyeBlock side="left" data={formData} set={set} />
        </div>
      </SectionCard>

      <SectionCard icon={ShieldAlert} num="8" title="Sepsis">
        <div className="fj-qa">
          <span className="fj-q">Sepsis</span>
          <YesNo value={formData.sepsis} onChange={(v) => set("sepsis", v)} />
        </div>
        {formData.sepsis === "Yes" && (
          <div className="form-group" style={{ maxWidth: 220, marginTop: 10 }}>
            <label>No. of episodes</label>
            <input type="number" min="0" value={formData.sepsis_episodes} onChange={(e) => set("sepsis_episodes", e.target.value)} />
          </div>
        )}
      </SectionCard>

      <SectionCard icon={Scan} num="9" title="MRI">
        <div className="fj-qa">
          <span className="fj-q">MRI done</span>
          <YesNo value={formData.mri_done} onChange={(v) => set("mri_done", v)} />
        </div>
        {formData.mri_done === "Yes" && (
          <p className="fj-hint">If yes, please attach report (paper CRF / site file).</p>
        )}
      </SectionCard>

      <SectionCard title="Form completed by">
        <div className="fj-grid-2">
          <div className="form-group">
            <label>Completed by</label>
            <select value={formData.completed_by || ""} onChange={handleCompletedByChange}>
              <option value="">-- Select --</option>
              {assessors.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
              {formData.completed_by && !assessors.includes(formData.completed_by) && (
                <option value={formData.completed_by}>{formData.completed_by}</option>
              )}
            </select>
            {!siteName && !patientData?.site_name && !patientData?.site && (
              <div className="fj-field-note">Site not loaded yet — staff list will appear when site is known.</div>
            )}
          </div>
          <div className="form-group">
            <label>Designation</label>
            <input
              value={formData.designation || ""}
              readOnly
              placeholder="Auto-filled from Completed by"
            />
          </div>
          <div className="form-group">
            <label>Hospital</label>
            <input value={formData.hospital} onChange={(e) => set("hospital", e.target.value)} />
          </div>
          <div className="form-group">
            <label>Date</label>
            <DateField value={formData.completion_date} onChange={(v) => set("completion_date", v)} />
          </div>
        </div>
      </SectionCard>

      {saveMessage && <p className="fj-save-msg">{saveMessage}</p>}

      <FormNavBar
        onBack={() => navigate(`/form-i/${enrollmentId}`, { state: { enrollmentId } })}
        onSave={async () => { await saveForm(); }}
        onNext={async () => {
          const saved = await saveForm({ silent: true });
          if (!saved) return;
          const done = new Set([
            ...savedRows.map((r) => Number(r.assessment_weeks)),
            Number(saved.assessment_weeks),
          ]);
          const remaining = PROTOCOL_WEEKS.filter((w) => !done.has(w));
          if (remaining.length > 0) {
            const goK = window.confirm(
              `Saved ${saved.assessment_weeks}-week assessment.\nRemaining visits: ${remaining.join(", ")} weeks.\n\nOK = go to Form K\nCancel = stay and fill another visit`,
            );
            if (!goK) {
              startNew(remaining[0]);
              return;
            }
          }
          navigate(`/form-k/${enrollmentId}`, { state: { enrollmentId } });
        }}
        backLabel="Form I"
        nextLabel="Form K"
        step={10}
        totalSteps={12}
        isSaved={isSaved}
      />
    </form>
  );
}
