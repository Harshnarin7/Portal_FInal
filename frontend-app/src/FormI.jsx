import React, { useState, useEffect, useLayoutEffect, useRef, createContext, useContext } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useParams } from "react-router-dom";
import api from "./api/axios";
import "./styles/global.css";
import "./styles/FormComponents.css";
import "./ScreeningForm.css";
import "./styles/FormIStudyOutcomes.css";
import FormNavBar from "./components/FormNavBar";
import { usePatient } from "./context/PatientContext";
import { useFormProgress } from "./context/FormProgressContext";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { toDateOnlyValue, parseDateOnly } from "./utils/datetime";
import { resolveEffectiveGestation } from "./utils/gestation";
import {
  Wind, Skull, CalendarClock, CalendarCheck, CalendarRange, ClipboardList, Home, Clock,
} from "lucide-react";

// FIX (focus-loss bug): RYesNo/RSelect/RNum/RText/Mini*/CrfRow/CrfTable/
// DeathInfo used to be defined INSIDE the FormI() function body, closing
// over `formData`/`setFormData`/`handleChange` directly. Every keystroke
// triggers a re-render, which redefined all of them as brand-new function
// references — React treats a changed component reference as a different
// component TYPE, so it unmounted and remounted the actual <input> DOM
// node on every single keystroke, which is exactly why focus dropped after
// one character. Hoisting them to module scope (below) gives them a
// stable identity across renders. They still need read/write access to the
// current formData though, so instead of passing it down through 130+ call
// sites as props, they read it from this context — zero call sites needed
// to change.
const FormIDataContext = createContext(null);

/* ─── YesNoToggle — same animated sliding-segment component used across
       Form H / Form A / ScreeningForm.jsx, kept local for consistency ─── */
function YesNoToggle({ label, name, value, onChange, onBlur, required = false, disabled = false }) {
  const fire = (val) => {
    if (disabled) return;
    onChange({ target: { name, value: val, type: "select-one" } });
  };
  const pos = value === "Yes" ? 1 : value === "No" ? 2 : 0;
  return (
    <div className={`yes-no-toggle${disabled ? " yn-disabled" : ""}`}>
      <span className="yes-no-label">
        {label}
        {required && <span className="required">*</span>}
      </span>
      <div className={`yes-no-buttons yn-pos-${pos}`}>
        <div className="yn-thumb" aria-hidden="true" />
        <button type="button"
          className={`yn-btn yn-yes${value === "Yes" ? " yn-active" : ""}`}
          onClick={() => fire("Yes")}
          onBlur={onBlur ? () => onBlur({ target: { name, value } }) : undefined}
          disabled={disabled}>YES</button>
        <button type="button"
          className={`yn-btn yn-no${value === "No" ? " yn-active" : ""}`}
          onClick={() => fire("No")}
          onBlur={onBlur ? () => onBlur({ target: { name, value } }) : undefined}
          disabled={disabled}>NO</button>
      </div>
    </div>
  );
}

// Small "from Form B" / "from daily logs" style badge — same visual
// language as Form H's .field-hint-auto-inline (shared FormComponents.css,
// already imported here). Generic across whichever domain currently
// auto-fills Form I (only Resuscitation Outcomes/Form B so far).
function AutoFilledBadge({ name }) {
  const { autoFilledFields } = useContext(FormIDataContext);
  if (!autoFilledFields?.[name]) return null;
  return <span className="field-hint-auto-inline">auto-filled</span>;
}

// ── Hoisted field components (see comment above FormIDataContext for why
// these live here instead of inside FormI()) ──────────────────────────────
function RYesNo({ name, required }) {
  const { formData, setFormData, clearAutoFilled } = useContext(FormIDataContext);
  const value = formData[name];
  const pos = value === "Yes" ? 1 : value === "No" ? 2 : 0;
  const fire = (val) => {
    clearAutoFilled?.(name);
    setFormData((p) => ({ ...p, [name]: val }));
  };
  return (
    <>
      <div className={`yes-no-buttons yn-pos-${pos} crf-yn`} aria-required={required}>
        <div className="yn-thumb" aria-hidden="true" />
        <button type="button" className={`yn-btn yn-yes${value === "Yes" ? " yn-active" : ""}`} onClick={() => fire("Yes")}>YES</button>
        <button type="button" className={`yn-btn yn-no${value === "No" ? " yn-active" : ""}`} onClick={() => fire("No")}>NO</button>
      </div>
      <AutoFilledBadge name={name} />
    </>
  );
}

function RSelect({ name, options, placeholder = "Select" }) {
  const { formData, handleChange, clearAutoFilled } = useContext(FormIDataContext);
  return (
    <>
      <select className="crf-select" name={name} value={formData[name] || ""}
        onChange={(e) => { clearAutoFilled?.(name); handleChange(e); }}>
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <AutoFilledBadge name={name} />
    </>
  );
}

function RNum({ name, unit, placeholder }) {
  const { formData, handleChange, clearAutoFilled } = useContext(FormIDataContext);
  return (
    <div className="crf-num-wrap">
      <input className="crf-num" type="number" step="any" name={name} value={formData[name] || ""}
        onChange={(e) => { clearAutoFilled?.(name); handleChange(e); }} placeholder={placeholder} />
      {unit && <span className="crf-unit">{unit}</span>}
      <AutoFilledBadge name={name} />
    </div>
  );
}

function RText({ name, placeholder }) {
  const { formData, handleChange } = useContext(FormIDataContext);
  return (
    <input className="crf-text" type="text" name={name} value={formData[name] || ""} onChange={handleChange} placeholder={placeholder} />
  );
}

// Additional-info column: small labeled fields stacked vertically.
function Mini({ label, children }) {
  return (
    <div className="crf-mini">
      <span className="crf-mini-label">{label}</span>
      {children}
    </div>
  );
}
function MiniDate({ label, name }) {
  const { formData, setFormData, clearAutoFilled } = useContext(FormIDataContext);
  return (
    <Mini label={label}>
      <DatePicker
        selected={formData[name] ? parseDateOnly(formData[name]) : null}
        onChange={(date) => {
          clearAutoFilled?.(name);
          setFormData((p) => ({ ...p, [name]: date ? toDateOnlyValue(date) : "" }));
        }}
        dateFormat="dd/MM/yyyy"
        placeholderText="dd/mm/yyyy"
        className="crf-text"
      />
      <AutoFilledBadge name={name} />
    </Mini>
  );
}

/** 24-hour HH:MM picker — never AM/PM (native <input type="time"> follows OS locale).
 *  Popover is portaled to document.body so table overflow doesn't clip it. */
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
            <div
              key={v}
              className={`mt-popover-item${h === v ? " mt-popover-item-active" : ""}`}
              onClick={() => pick("h", v)}
            >
              {v}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-popover-col">
        <div className="mt-popover-label">MM</div>
        <div className="mt-popover-list">
          {minOptions.map((v) => (
            <div
              key={v}
              className={`mt-popover-item${m === v ? " mt-popover-item-active" : ""}`}
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

function MiniTime({ label, name }) {
  const { formData, setFormData } = useContext(FormIDataContext);
  return (
    <Mini label={label}>
      <Time24Input
        value={formData[name] || ""}
        onChange={(val) => setFormData((p) => ({ ...p, [name]: val }))}
      />
    </Mini>
  );
}
function MiniText({ label, name, placeholder }) {
  const { formData, handleChange, clearAutoFilled } = useContext(FormIDataContext);
  return (
    <Mini label={label}>
      <input className="crf-text" type="text" name={name} value={formData[name] || ""}
        onChange={(e) => { clearAutoFilled?.(name); handleChange(e); }} placeholder={placeholder} />
      <AutoFilledBadge name={name} />
    </Mini>
  );
}
function MiniReadOnly({ label, value }) {
  return (
    <Mini label={label}><input className="crf-text" type="text" value={value ?? ""} readOnly /></Mini>
  );
}

/** Free-text Additional information cell (replaces the old "—" dash). */
function AddlInfoText({ fieldNum, placeholder = "Enter additional information" }) {
  const { formData, setFormData } = useContext(FormIDataContext);
  const notes = formData.crf_additional_notes || {};
  const key = String(fieldNum);
  return (
    <input
      className="crf-text"
      type="text"
      value={notes[key] ?? ""}
      onChange={(e) =>
        setFormData((p) => ({
          ...p,
          crf_additional_notes: { ...(p.crf_additional_notes || {}), [key]: e.target.value },
        }))
      }
      placeholder={placeholder}
      aria-label={`Additional information for field ${fieldNum}`}
    />
  );
}

/* One row of the CRF table. When structured `info` is not shown, the
   Additional-info column is always an editable text box (never a dash). */
function CrfRow({ num, outcome, definition, result, info, showInfo }) {
  return (
    <tr className="fi-crf-row">
      <td className="crf-num-cell">{num}</td>
      <td className="crf-outcome-cell">{outcome}</td>
      <td className="crf-def-cell">{definition}</td>
      <td className="crf-result-cell">{result}</td>
      <td className="crf-info-cell">
        {showInfo && info ? info : <AddlInfoText fieldNum={num} />}
      </td>
    </tr>
  );
}

function CrfTable({ children }) {
  return (
    <div className="crf-table-wrap">
      <table className="crf-table">
        <thead>
          <tr>
            <th className="crf-num-cell">#</th>
            <th className="crf-outcome-cell">Outcome</th>
            <th className="crf-def-cell">Definition</th>
            <th className="crf-result-cell">Result</th>
            <th className="crf-info-cell">Additional information</th>
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/* Reusable "death at timepoint" detail — cause / date / time / age,
   shown in the Additional-info column once the toggle is Yes.
   `nums` = CRF field numbers { cause, date, time, age }. */
function DeathInfo({ fieldPrefix, ageLabel, nums }) {
  const { formData } = useContext(FormIDataContext);
  const n = nums || {};
  return (
    <>
      <MiniText label={`${n.cause ? `${n.cause}. ` : ""}Cause of death`} name={`${fieldPrefix}_cause`} placeholder="Enter cause" />
      <MiniDate label={`${n.date ? `${n.date}. ` : ""}Date of death`} name={`${fieldPrefix}_date`} />
      <MiniTime label={`${n.time ? `${n.time}. ` : ""}Time of death`} name={`${fieldPrefix}_time`} />
      <MiniReadOnly
        label={`${n.age ? `${n.age}. ` : ""}Age at death (${ageLabel})`}
        value={formData[`${fieldPrefix}_age_hrs`] ?? formData[`${fieldPrefix}_age_days`]}
      />
    </>
  );
}

const isBlank = (v) => v === "" || v === undefined || v === null;

/** Empty string → null; keep legitimate 0 / false. */
const emptyToNull = (v) => (v === "" || v === undefined || v === null ? null : v);
const numOrNull = (v) => {
  if (v === "" || v === undefined || v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const getStatusClass = (value) => {
  if (!value) return "empty";
  if (value === "Yes" || value === true) return "yes";
  if (value === "No" || value === false) return "no";
  return "empty";
};
const getStatusIcon = (value) => {
  if (!value) return "—";
  if (value === "Yes" || value === true) return "✔";
  if (value === "No" || value === false) return "✖";
  return "—";
};

const boolToYesNo = (v) => (v === true ? "Yes" : v === false ? "No" : "");
const yesNoToBool = (v) => (v === "Yes" ? true : v === "No" ? false : null);

const FIELD = { className: "field-num" };

export default function FormI() {
  const navigate = useNavigate();
  const { enrollmentId } = useParams();
  const { patientData } = usePatient() || {};
  const { markFormCompleted } = useFormProgress();

  const [assessors, setAssessors] = useState([]);
  const [siteName, setSiteName] = useState("");

  const getDesignation = (name) => {
    if (!name) return "";
    const n = name.replace(/^Dr\.\s*/i, "").trim();
    if (n === "Mannat Guliani") return "Project Research Scientist III (Medical)";
    if (n === "Shalini Dhiman") return "Project Research Scientist III (Non-Medical)";
    if (/^Dr\.\s*/i.test(name)) return "Site Research Scientist";
    return "Project Nurse III";
  };

  const handleAssessedByChange = (e) => {
    const name = e.target.value;
    setFormData((prev) => ({
      ...prev,
      completed_by: name,
      designation: getDesignation(name),
    }));
  };

  const [openSection, setOpenSection] = useState("i1");
  const [isSaved, setIsSaved] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  // Auto-fill from other forms — generic across whichever domain currently
  // does this (only I.1 Resuscitation Outcomes, from Form B, so far; keyed
  // by field name so a future domain can reuse the same state/components).
  const [autoFilledFields, setAutoFilledFields] = useState({});
  const [staleFields, setStaleFields] = useState({});
  const [resusPrefill, setResusPrefill] = useState(null);
  const [overallPrefill, setOverallPrefill] = useState(null);
  const [postResusPrefill, setPostResusPrefill] = useState(null);
  // undefined = not fetched yet, null = fetched but has_data:false, object = has data
  const [pmaPrefill, setPmaPrefill] = useState({ 36: undefined, 40: undefined, 44: undefined });
  // Set once per fetchData() run, before the PMA checkpoint fetches
  // below need it — reused by their Force Refill buttons later too,
  // since a button click has no access to fetchData's own local scope.
  const gaRef = useRef({ weeks: null, days: null });
  const clearAutoFilled = (name) => {
    setAutoFilledFields((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  // Quick-nav: one ref per top-level CRF section (I.1–I.6), used to jump +
  // open a section from the sticky rail at the top of the form.
  const sectionRefs = {
    i1: useRef(null),
    i2: useRef(null),
    i3: useRef(null),
    i4: useRef(null),
    i5: useRef(null),
    i6: useRef(null),
  };
  const goToSection = (key) => {
    setOpenSection(key);
    // wait one paint so the accordion has expanded before scrolling
    requestAnimationFrame(() => {
      sectionRefs[key]?.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const [formData, setFormData] = useState({
    enrollment_id: enrollmentId || "",
    baby_uid: "",
    gestation_weeks: "",
    birth_weight: "",
    dob: "",

    // I.1 Resuscitation Outcomes
    ventilation_required: "",
    switched_100_o2: "",
    resus_chest_compressions: "",
    intubation_during_resus: "",
    time_to_spontaneous_breathing: "",
    hie_grade: "",

    // I.2 Post-natal post-resuscitation Outcomes
    resp_support_72h: "",
    sepsis_eos: "",
    sepsis_los: "",
    culture_positive_sepsis: "",
    culture_positive_body_fluid: "",
    mortality_7_days: "",
    mortality_7d_cause: "",
    mortality_7d_date: "",
    mortality_7d_time: "",
    mortality_7d_age_hrs: "",
    mortality_28_days: "",
    mortality_28d_cause: "",
    mortality_28d_date: "",
    mortality_28d_time: "",
    mortality_28d_age_days: "",

    // I.3 Assessment at 36 weeks PMA
    encounter36_method: "",
    encounter36_other: "",
    encounter36_other_text: "",
    death36: "",
    death36_cause: "",
    death36_date: "",
    death36_time: "",
    death36_age_days: "",
    bpd36_jensen_grade: "",
    bpd36_jensen_date: "",
    bpd36_nichd_radiographic: "",
    bpd36_nichd_fio2: "",
    bpd36_nichd_flow: "",
    bpd36_nichd_grade: "",
    bpd36_nichd_date: "",
    nec36_stage: "",
    nec36_surgery: "",
    nec36_date: "",
    ivh36_grade3: "",
    ivh36_date: "",
    cpvl36_grade2: "",
    cpvl36_date: "",
    rop36: "",
    rop36_treated: "",
    rop36_date: "",

    // I.4 Assessment at 40 weeks PMA
    encounter40_method: "",
    encounter40_other: "",
    encounter40_other_text: "",
    death40: "",
    death40_cause: "",
    death40_date: "",
    death40_time: "",
    death40_age_days: "",
    nec40_stage: "",
    nec40_surgery: "",
    nec40_date: "",
    ivh40_grade3: "",
    ivh40_date: "",
    cpvl40_grade2: "",
    cpvl40_date: "",
    rop40: "",
    rop40_treated: "",
    rop40_date: "",
    abnormal_mri_tea: "",

    // I.5 Assessment at 44 weeks PMA
    encounter44_method: "",
    encounter44_other: "",
    encounter44_other_text: "",
    death44: "",
    death44_cause: "",
    death44_date: "",
    death44_time: "",
    death44_age_days: "",
    nec44_stage: "",
    nec44_surgery: "",
    nec44_date: "",
    ivh44_grade3: "",
    ivh44_date: "",
    cpvl44_grade2: "",
    cpvl44_date: "",
    rop44_assessed: "",
    rop44_treated: "",
    rop44_date: "",

    // I.6 Overall
    mv_days: "",
    niv_days: "",
    cpap_days: "",
    hfnc_days: "",
    nippv_days: "",
    sepsis_overall: "",
    sepsis_overall_episodes: "",
    mortality_in_hospital: "",
    mortality_hospital_cause: "",
    mortality_hospital_date: "",
    mortality_hospital_time: "",
    mortality_hospital_age_days: "",
    mortality_after_discharge: "",
    mortality_after_discharge_cause: "",
    mortality_after_discharge_date: "",
    mortality_after_discharge_time: "",
    mortality_after_discharge_age_days: "",

    // Free-text Additional information per CRF row number
    crf_additional_notes: {},

    // Completion
    completed_by: "",
    designation: "",
    completion_date: "",
  });

  /* ── Load context (screening / birth resuscitation) + any existing
         Form I record for this enrollment, so revisiting the form never
         loses previously entered data. ── */
  useEffect(() => {
    const fetchData = async () => {
      let screeningData = {};
      try {
        const res = await api.get(`/screenings/by-enrollment/${enrollmentId}`);
        screeningData = res.data || {};
      } catch { /* no screening found yet */ }

      const resolvedSite =
        screeningData?.site_name ||
        patientData?.site_name ||
        patientData?.site ||
        "";
      if (resolvedSite) setSiteName(resolvedSite);

      let birthData = {};
      let formD = null;
      try {
        const res = await api.get(`/birth-resuscitation/${enrollmentId}`);
        birthData = res.data || {};
      } catch { /* no birth data found yet */ }
      try {
        formD = (await api.get(`/postnatal-day1/${enrollmentId}`)).data || null;
      } catch { /* Form D optional */ }
      const effectiveGa = resolveEffectiveGestation(birthData, formD);
      gaRef.current = { weeks: effectiveGa.weeks, days: effectiveGa.days };

      let existing = {};
      try {
        const res = await api.get(`/study-outcomes/${enrollmentId}`);
        const rows = res.data || [];
        if (rows.length) existing = rows[rows.length - 1];
      } catch { /* no Form I record yet */ }

      setFormData((prev) => ({
        ...prev,
        enrollment_id: enrollmentId || "",
        baby_uid: birthData?.baby_uid || existing?.baby_uid || "",
        gestation_weeks:
          (effectiveGa.weeks != null && effectiveGa.weeks !== "")
            ? effectiveGa.weeks
            : (screeningData?.gestation_weeks || existing?.gestation_weeks || ""),
        birth_weight: birthData?.birth_weight || existing?.birth_weight || "",
        dob: birthData?.date_of_birth || "",
        ...(existing.id ? {
          ventilation_required: boolToYesNo(existing.ventilation_required),
          switched_100_o2: boolToYesNo(existing.switched_100_o2),
          resus_chest_compressions: boolToYesNo(existing.resus_chest_compressions),
          intubation_during_resus: boolToYesNo(existing.intubation_during_resus),
          time_to_spontaneous_breathing: existing.time_to_spontaneous_breathing ?? "",
          hie_grade: existing.hie_grade === "Moderate" ? "Mod" : (existing.hie_grade || ""),

          resp_support_72h: boolToYesNo(existing.resp_support_72h),
          sepsis_eos: boolToYesNo(existing.sepsis_eos),
          sepsis_los: boolToYesNo(existing.sepsis_los),
          culture_positive_sepsis: boolToYesNo(existing.culture_positive_sepsis),
          culture_positive_body_fluid: existing.culture_positive_body_fluid || "",
          mortality_7_days: boolToYesNo(existing.mortality_7_days),
          mortality_7d_cause: existing.mortality_7d_cause || "",
          mortality_7d_date: existing.mortality_7d_date || "",
          mortality_7d_time: existing.mortality_7d_time || "",
          mortality_7d_age_hrs: existing.mortality_7d_age_hrs ?? "",
          mortality_28_days: boolToYesNo(existing.mortality_28_days),
          mortality_28d_cause: existing.mortality_28d_cause || "",
          mortality_28d_date: existing.mortality_28d_date || "",
          mortality_28d_time: existing.mortality_28d_time || "",
          mortality_28d_age_days: existing.mortality_28d_age_days ?? "",

          encounter36_method: existing.encounter36_method || "",
          encounter36_other: existing.encounter36_other || "",
          encounter36_other_text: existing.encounter36_other_text || "",
          death36: boolToYesNo(existing.death36),
          death36_cause: existing.death36_cause || "",
          death36_date: existing.death36_date || "",
          death36_time: existing.death36_time || "",
          death36_age_days: existing.death36_age_days ?? "",
          bpd36_jensen_grade: existing.bpd36_jensen_grade || "",
          bpd36_jensen_date: existing.bpd36_jensen_date || "",
          bpd36_nichd_radiographic: boolToYesNo(existing.bpd36_nichd_radiographic),
          bpd36_nichd_fio2: existing.bpd36_nichd_fio2 ?? "",
          bpd36_nichd_flow: existing.bpd36_nichd_flow ?? "",
          bpd36_nichd_grade: existing.bpd36_nichd_grade || "",
          bpd36_nichd_date: existing.bpd36_nichd_date || "",
          nec36_stage: boolToYesNo(existing.nec36_stage),
          nec36_surgery: boolToYesNo(existing.nec36_surgery),
          nec36_date: existing.nec36_date || "",
          ivh36_grade3: boolToYesNo(existing.ivh36_grade3),
          ivh36_date: existing.ivh36_date || "",
          cpvl36_grade2: boolToYesNo(existing.cpvl36_grade2),
          cpvl36_date: existing.cpvl36_date || "",
          rop36: boolToYesNo(existing.rop36),
          rop36_treated: boolToYesNo(existing.rop36_treated),
          rop36_date: existing.rop36_date || "",

          encounter40_method: existing.encounter40_method || "",
          encounter40_other: existing.encounter40_other || "",
          encounter40_other_text: existing.encounter40_other_text || "",
          death40: boolToYesNo(existing.death40),
          death40_cause: existing.death40_cause || "",
          death40_date: existing.death40_date || "",
          death40_time: existing.death40_time || "",
          death40_age_days: existing.death40_age_days ?? "",
          nec40_stage: boolToYesNo(existing.nec40_stage),
          nec40_surgery: boolToYesNo(existing.nec40_surgery),
          nec40_date: existing.nec40_date || "",
          ivh40_grade3: boolToYesNo(existing.ivh40_grade3),
          ivh40_date: existing.ivh40_date || "",
          cpvl40_grade2: boolToYesNo(existing.cpvl40_grade2),
          cpvl40_date: existing.cpvl40_date || "",
          rop40: boolToYesNo(existing.rop40),
          rop40_treated: boolToYesNo(existing.rop40_treated),
          rop40_date: existing.rop40_date || "",
          abnormal_mri_tea: existing.abnormal_mri_tea || "",

          encounter44_method: existing.encounter44_method || "",
          encounter44_other: existing.encounter44_other || "",
          encounter44_other_text: existing.encounter44_other_text || "",
          death44: boolToYesNo(existing.death44),
          death44_cause: existing.death44_cause || "",
          death44_date: existing.death44_date || "",
          death44_time: existing.death44_time || "",
          death44_age_days: existing.death44_age_days ?? "",
          nec44_stage: boolToYesNo(existing.nec44_stage),
          nec44_surgery: boolToYesNo(existing.nec44_surgery),
          nec44_date: existing.nec44_date || "",
          ivh44_grade3: boolToYesNo(existing.ivh44_grade3),
          ivh44_date: existing.ivh44_date || "",
          cpvl44_grade2: boolToYesNo(existing.cpvl44_grade2),
          cpvl44_date: existing.cpvl44_date || "",
          rop44_assessed: boolToYesNo(existing.rop44_assessed),
          rop44_treated: boolToYesNo(existing.rop44_treated),
          rop44_date: existing.rop44_date || "",

          mv_days: existing.mv_days ?? "",
          niv_days: existing.niv_days ?? "",
          cpap_days: existing.cpap_days ?? "",
          hfnc_days: existing.hfnc_days ?? "",
          nippv_days: existing.nippv_days ?? "",
          sepsis_overall: boolToYesNo(existing.sepsis_overall),
          sepsis_overall_episodes: existing.sepsis_overall_episodes ?? "",
          mortality_in_hospital: boolToYesNo(existing.mortality_in_hospital),
          mortality_hospital_cause: existing.mortality_hospital_cause || "",
          mortality_hospital_date: existing.mortality_hospital_date || "",
          mortality_hospital_time: existing.mortality_hospital_time || "",
          mortality_hospital_age_days: existing.mortality_hospital_age_days ?? "",
          mortality_after_discharge: boolToYesNo(existing.mortality_after_discharge),
          mortality_after_discharge_cause: existing.mortality_after_discharge_cause || "",
          mortality_after_discharge_date: existing.mortality_after_discharge_date || "",
          mortality_after_discharge_time: existing.mortality_after_discharge_time || "",
          mortality_after_discharge_age_days: existing.mortality_after_discharge_age_days ?? "",

          crf_additional_notes:
            existing.crf_additional_notes && typeof existing.crf_additional_notes === "object"
              ? existing.crf_additional_notes
              : {},

          completed_by: existing.completed_by || "",
          designation: existing.designation || (existing.completed_by ? getDesignation(existing.completed_by) : ""),
          completion_date: existing.completion_date || "",
        } : {}),
      }));

      // Chained, not a separate effect racing this one — must run after
      // the existing-record load above has queued its setFormData, same
      // discipline Form H uses for its own prefill fetches (see
      // FormH.jsx's loadExistingFormH().then(...) comment for the bug
      // this avoids).
      fetchBirthResuscitationPrefill();
      fetchPostResusPrefill();
      fetchOverallPrefill();
      fetchPmaAssessmentPrefill(36);
      fetchPmaAssessmentPrefill(40);
      fetchPmaAssessmentPrefill(44);
    };
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enrollmentId]);

  // Load Assessed-by roster for this baby's site
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

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((p) => ({ ...p, [name]: value }));
  };

  // I.1 Resuscitation Outcomes <- Form B (Birth Resuscitation), a
  // one-time non-repeating record per enrollment (no day-log aggregation
  // needed, unlike every Form H domain). Direct field matches:
  // ppv_required->ventilation_required, chest_compression->
  // resus_chest_compressions, intubation->intubation_during_resus,
  // time_to_respiration->time_to_spontaneous_breathing (already stored in
  // seconds on both sides, confirmed via BirthResuscitationForm.jsx's
  // durationHmsToSeconds conversion - no unit conversion needed).
  //
  // Deliberately NOT filled: switched_100_o2 - Form B's only related
  // field, reason_exit_trial_gas, has a single combined option "Required
  // override to 100% O2 or CC" that can't be reliably disambiguated from
  // the separate chest_compression flag (both could independently apply
  // to the same event) - guessing would risk false positives on a
  // clinical fact, not just an incomplete one. hie_grade - genuinely
  // belongs to Form I's own schema (StudyOutcomes.hie_grade); no other
  // form in the system captures HIE grading at all.
  const RESUS_PREFILL_FIELDS = [
    "ventilation_required", "resus_chest_compressions",
    "intubation_during_resus", "time_to_spontaneous_breathing",
  ];
  // Form B is a one-time record, not a growing daily log like every Form H
  // domain's source - so unlike those, a later disagreement here is always
  // a genuine correction, never expected drift. All 4 fields (including
  // the numeric one) get staleness-checked for that reason.
  const RESUS_STALE_CHECK_FIELDS = RESUS_PREFILL_FIELDS;

  const fetchBirthResuscitationPrefill = async ({ force = false } = {}) => {
    if (!enrollmentId) return;
    try {
      const res = await api.get(`/birth-resuscitation/${enrollmentId}`);
      const d = res.data;
      if (!d || !d.id) { setResusPrefill(null); return; }
      setResusPrefill(d);

      const mapped = {
        ventilation_required: boolToYesNo(d.ppv_required),
        resus_chest_compressions: boolToYesNo(d.chest_compression),
        intubation_during_resus: boolToYesNo(d.intubation),
        time_to_spontaneous_breathing: d.time_to_respiration ?? "",
      };

      const filled = {};
      const stale = {};
      setFormData((prev) => {
        const next = { ...prev };
        RESUS_PREFILL_FIELDS.forEach((field) => {
          const value = mapped[field];
          if (isBlank(value)) return;
          const currentlyBlank = isBlank(prev[field]);
          const disagrees = !currentlyBlank
            && RESUS_STALE_CHECK_FIELDS.includes(field)
            && String(prev[field]) !== String(value);
          if (currentlyBlank || (force && disagrees)) {
            next[field] = value;
            filled[field] = true;
          } else if (disagrees) {
            stale[field] = true;
          }
        });
        return next;
      });
      if (Object.keys(filled).length) {
        setAutoFilledFields((prev) => ({ ...prev, ...filled }));
      }
      setStaleFields((prev) => {
        const next = { ...prev };
        RESUS_PREFILL_FIELDS.forEach((f) => {
          if (stale[f]) next[f] = true; else delete next[f];
        });
        return next;
      });
    } catch (err) {
      console.log("Error fetching birth resuscitation prefill", err);
    }
  };

  const confirmForceRefillResus = () => {
    if (
      window.confirm(
        "Overwrite already-answered Resuscitation Outcomes fields with the " +
        "latest Form B (Birth Resuscitation) data?\n\nThis replaces existing " +
        "answers, not just blank ones — use this only if Form B was corrected " +
        "after this form was filled in."
      )
    ) {
      fetchBirthResuscitationPrefill({ force: true });
    }
  };

  // I.2 Post-natal Post-resuscitation Outcomes <- a new, dedicated
  // endpoint (unlike I.1/I.6, this needs genuine age-window filtering —
  // EOS = onset in first 72h, LOS = onset after day 3 — not a simple
  // any-day aggregate, so no existing endpoint could be reused as-is).
  // See get_post_resus_prefill's docstring in backend/main.py for the
  // full derivation of each field, including the two PI decisions this
  // relied on (2026-08-25): plain NC counts as "respiratory support"
  // for resp_support_72h, and sepsis EOS/LOS count any infection-detect
  // trigger type, same policy as I.6's sepsis_overall.
  //
  // Deliberately NOT filled: mortality_7d_cause/_time, mortality_28d_
  // cause/_time (no day-log source, same as I.6's mortality_hospital_
  // cause/_time). mortality_7_days/mortality_28_days themselves are
  // filled with "No" only when the endpoint can actually confirm the
  // baby was tracked alive past that age (see backend docstring) —
  // otherwise left blank rather than guessed.
  const POST_RESUS_PREFILL_FIELDS = [
    "resp_support_72h", "sepsis_eos", "sepsis_los",
    "culture_positive_sepsis", "culture_positive_body_fluid",
    "mortality_7_days", "mortality_7d_date",
    "mortality_28_days", "mortality_28d_date",
  ];
  // All fields here are one-time/cumulative facts about a fixed age
  // window (not a growing day-count), so — same reasoning as I.1 — a
  // later disagreement is always worth flagging, not expected drift.
  const POST_RESUS_STALE_CHECK_FIELDS = POST_RESUS_PREFILL_FIELDS;

  const fetchPostResusPrefill = async ({ force = false } = {}) => {
    if (!enrollmentId) return;
    try {
      const res = await api.get(`/neonatal-morbidities/post-resus-prefill/${enrollmentId}`);
      const d = res.data;
      if (!d || !d.has_data) { setPostResusPrefill(null); return; }
      setPostResusPrefill(d);

      const mapped = {};
      POST_RESUS_PREFILL_FIELDS.forEach((field) => {
        if (d[field] !== null && d[field] !== undefined) mapped[field] = d[field];
      });

      const filled = {};
      const stale = {};
      setFormData((prev) => {
        const next = { ...prev };
        POST_RESUS_PREFILL_FIELDS.forEach((field) => {
          const value = mapped[field];
          if (isBlank(value)) return;
          const currentlyBlank = isBlank(prev[field]);
          const disagrees = !currentlyBlank
            && POST_RESUS_STALE_CHECK_FIELDS.includes(field)
            && String(prev[field]) !== String(value);
          if (currentlyBlank || (force && disagrees)) {
            next[field] = value;
            filled[field] = true;
          } else if (disagrees) {
            stale[field] = true;
          }
        });
        return next;
      });
      if (Object.keys(filled).length) {
        setAutoFilledFields((prev) => ({ ...prev, ...filled }));
      }
      setStaleFields((prev) => {
        const next = { ...prev };
        POST_RESUS_PREFILL_FIELDS.forEach((f) => {
          if (stale[f]) next[f] = true; else delete next[f];
        });
        return next;
      });
    } catch (err) {
      console.log("Error fetching I.2 Post-resus prefill", err);
    }
  };

  const confirmForceRefillPostResus = () => {
    if (
      window.confirm(
        "Overwrite already-answered Post-natal Post-resuscitation Outcomes " +
        "fields with the latest daily-log data?\n\nThis replaces existing " +
        "answers, not just blank ones — use this only if the daily logs " +
        "were corrected after this form was filled in."
      )
    ) {
      fetchPostResusPrefill({ force: true });
    }
  };

  // I.6 Overall <- three sources, none of them a new endpoint: Form H's
  // Respiratory day-count endpoint (mv_days<-imv_days, cpap_days,
  // hfnc_days, nippv_days), the Infection-detect endpoint (sepsis_overall
  // <- any detected trigger window, of any type), and the survival-check
  // endpoint (mortality_in_hospital + mortality_hospital_date <- the
  // earliest day any log recorded survived_the_day=False). Age at death
  // is not fetched or set here - it's already auto-computed from dob +
  // mortality_hospital_date by the existing calcAge effect below.
  //
  // Deliberately NOT filled:
  // - niv_days ("b) Non-invasive ventilation") - the day log's
  //   support_modes tokens are NC/HFNC/CPAP/NIPPV/SIMV/AC/PSV/HFOV, with
  //   no distinct "NIV" token separate from CPAP/HFNC/NIPPV (already
  //   claimed by c/d/e) - no way to tell what this 5th bucket is meant to
  //   capture without guessing.
  // - sepsis_overall_episodes - Infection-detect's own docstring is
  //   explicit that episode-boundary counting is a clinical judgment call
  //   it was never meant to answer (two windows of different trigger
  //   types might be the same episode, or not) - the simple Yes/No
  //   existence check above doesn't need that judgment, but a count does.
  // - mortality_hospital_cause/_time and the entire mortality_after_discharge
  //   group (+cause/date/time) - no source anywhere in the day logs, which
  //   only cover the NICU admission window, not cause/time of death or
  //   anything post-discharge.
  const OVERALL_PREFILL_FIELDS = [
    "mv_days", "cpap_days", "hfnc_days", "nippv_days",
    "sepsis_overall", "mortality_in_hospital", "mortality_hospital_date",
  ];
  // Day counts naturally grow as the admission continues (same convention
  // as every Form H day-count field) so they're excluded from staleness
  // checks; sepsis_overall/mortality_in_hospital/mortality_hospital_date
  // are categorical/one-time facts where a later disagreement is a real
  // correction worth flagging.
  const OVERALL_STALE_CHECK_FIELDS = [
    "sepsis_overall", "mortality_in_hospital", "mortality_hospital_date",
  ];

  const fetchOverallPrefill = async ({ force = false } = {}) => {
    if (!enrollmentId) return;
    try {
      const [respRes, infRes, survRes] = await Promise.all([
        api.get(`/neonatal-morbidities/resp-prefill/${enrollmentId}`).catch(() => null),
        api.get(`/neonatal-morbidities/infection-detect/${enrollmentId}`).catch(() => null),
        api.get(`/neonatal-morbidities/survival-check/${enrollmentId}`).catch(() => null),
      ]);
      const resp = respRes?.data;
      const inf = infRes?.data;
      const surv = survRes?.data;
      if (!resp?.has_data && !inf?.has_data && !surv) { setOverallPrefill(null); return; }
      setOverallPrefill({ resp, inf, surv });

      const mapped = {};
      if (resp?.has_data) {
        mapped.mv_days = resp.imv_days ?? "";
        mapped.cpap_days = resp.cpap_days ?? "";
        mapped.hfnc_days = resp.hfnc_days ?? "";
        mapped.nippv_days = resp.nippv_days ?? "";
      }
      if (inf?.has_data) {
        mapped.sepsis_overall = (inf.windows || []).length > 0 ? "Yes" : "No";
      }
      if (surv) {
        mapped.mortality_in_hospital = surv.did_not_survive ? "Yes" : "No";
        if (surv.did_not_survive && surv.date) {
          mapped.mortality_hospital_date = surv.date;
        }
      }

      const filled = {};
      const stale = {};
      setFormData((prev) => {
        const next = { ...prev };
        OVERALL_PREFILL_FIELDS.forEach((field) => {
          const value = mapped[field];
          if (isBlank(value)) return;
          const currentlyBlank = isBlank(prev[field]);
          const disagrees = !currentlyBlank
            && OVERALL_STALE_CHECK_FIELDS.includes(field)
            && String(prev[field]) !== String(value);
          if (currentlyBlank || (force && disagrees)) {
            next[field] = value;
            filled[field] = true;
          } else if (disagrees) {
            stale[field] = true;
          }
        });
        return next;
      });
      if (Object.keys(filled).length) {
        setAutoFilledFields((prev) => ({ ...prev, ...filled }));
      }
      setStaleFields((prev) => {
        const next = { ...prev };
        OVERALL_PREFILL_FIELDS.forEach((f) => {
          if (stale[f]) next[f] = true; else delete next[f];
        });
        return next;
      });
    } catch (err) {
      console.log("Error fetching I.6 Overall prefill", err);
    }
  };

  const confirmForceRefillOverall = () => {
    if (
      window.confirm(
        "Overwrite already-answered Overall fields (resp support days, " +
        "sepsis overall, in-hospital mortality) with the latest data from " +
        "the daily logs?\n\nThis replaces existing answers, not just blank " +
        "ones — use this only if the daily logs were corrected after this " +
        "form was filled in."
      )
    ) {
      fetchOverallPrefill({ force: true });
    }
  };

  // I.3/I.4/I.5 Assessment at 36/40/44 Weeks PMA <- a single generic
  // endpoint parameterized by checkpoint (36/40/44), since the derivation
  // is identical across all three except the PMA week target and the
  // death-window's lower bound. See get_pma_assessment_prefill's
  // docstring in backend/main.py for the full field-by-field derivation,
  // including the two design decisions made with the PI on 2026-08-25:
  // NEC/brain-injury/ROP are CUMULATIVE-to-date (not a fresh occurrence
  // since the previous checkpoint), and Form H's own already-graded
  // values (BPD Jensen, NEC, IVH/PVL, ROP) are the PRIMARY source,
  // falling back to raw day-log/cranial-USG derivation only when Form H
  // hasn't answered yet.
  //
  // The backend returns generic keys (death, nec_stage, ivh_grade3, ...)
  // since the same endpoint serves all 3 checkpoints — this map is what
  // translates those into each checkpoint's actual formData field names
  // (irregular in one place: I.5's ROP field is "rop44_assessed", not
  // "rop44", unlike I.3/I.4's "rop36"/"rop40").
  const PMA_FIELD_MAP = {
    36: {
      death: "death36", death_date: "death36_date",
      nec_stage: "nec36_stage", nec_date: "nec36_date", nec_surgery: "nec36_surgery",
      ivh_grade3: "ivh36_grade3", ivh_date: "ivh36_date",
      cpvl_grade2: "cpvl36_grade2", cpvl_date: "cpvl36_date",
      rop: "rop36", rop_date: "rop36_date", rop_treated: "rop36_treated",
      bpd_jensen_grade: "bpd36_jensen_grade", bpd_jensen_date: "bpd36_jensen_date",
      bpd36_nichd_fio2: "bpd36_nichd_fio2", bpd36_nichd_flow: "bpd36_nichd_flow",
    },
    40: {
      death: "death40", death_date: "death40_date",
      nec_stage: "nec40_stage", nec_date: "nec40_date", nec_surgery: "nec40_surgery",
      ivh_grade3: "ivh40_grade3", ivh_date: "ivh40_date",
      cpvl_grade2: "cpvl40_grade2", cpvl_date: "cpvl40_date",
      rop: "rop40", rop_date: "rop40_date", rop_treated: "rop40_treated",
      abnormal_mri_tea: "abnormal_mri_tea",
    },
    44: {
      death: "death44", death_date: "death44_date",
      nec_stage: "nec44_stage", nec_date: "nec44_date", nec_surgery: "nec44_surgery",
      ivh_grade3: "ivh44_grade3", ivh_date: "ivh44_date",
      cpvl_grade2: "cpvl44_grade2", cpvl_date: "cpvl44_date",
      rop: "rop44_assessed", rop_date: "rop44_date", rop_treated: "rop44_treated",
    },
  };

  const fetchPmaAssessmentPrefill = async (checkpoint, { force = false } = {}) => {
    if (!enrollmentId) return;
    const { weeks, days } = gaRef.current;
    if (weeks === null || weeks === undefined || weeks === "") return;
    try {
      const res = await api.get(`/neonatal-morbidities/pma-assessment-prefill/${enrollmentId}`, {
        params: { checkpoint, gestation_weeks: weeks, gestation_days: days ?? 0 },
      });
      const d = res.data;
      if (!d || !d.has_data) {
        setPmaPrefill((prev) => ({ ...prev, [checkpoint]: null }));
        return;
      }
      setPmaPrefill((prev) => ({ ...prev, [checkpoint]: d }));

      const fieldMap = PMA_FIELD_MAP[checkpoint];
      const prefillKeys = Object.keys(fieldMap);
      const mapped = {};
      prefillKeys.forEach((genericKey) => {
        const value = d[genericKey];
        if (value !== null && value !== undefined) mapped[fieldMap[genericKey]] = value;
      });

      const filled = {};
      const stale = {};
      setFormData((prev) => {
        const next = { ...prev };
        prefillKeys.forEach((genericKey) => {
          const field = fieldMap[genericKey];
          const value = mapped[field];
          if (isBlank(value)) return;
          const currentlyBlank = isBlank(prev[field]);
          const disagrees = !currentlyBlank && String(prev[field]) !== String(value);
          if (currentlyBlank || (force && disagrees)) {
            next[field] = value;
            filled[field] = true;
          } else if (disagrees) {
            stale[field] = true;
          }
        });
        return next;
      });
      if (Object.keys(filled).length) {
        setAutoFilledFields((prev) => ({ ...prev, ...filled }));
      }
      setStaleFields((prev) => {
        const next = { ...prev };
        prefillKeys.forEach((genericKey) => {
          const field = fieldMap[genericKey];
          if (stale[field]) next[field] = true; else delete next[field];
        });
        return next;
      });
    } catch (err) {
      console.log(`Error fetching PMA-${checkpoint} assessment prefill`, err);
    }
  };

  const confirmForceRefillPma = (checkpoint) => {
    if (
      window.confirm(
        "Overwrite already-answered fields at this PMA checkpoint with the " +
        "latest data (Form H where available, daily logs otherwise)?\n\n" +
        "This replaces existing answers, not just blank ones — use this " +
        "only if the source data was corrected after this form was filled in."
      )
    ) {
      fetchPmaAssessmentPrefill(checkpoint, { force: true });
    }
  };

  /* ── Age-at-death auto-calc from DOB, mirrors the pattern already used
         elsewhere in this form for each of the five death timepoints ── */
  const calcAge = (dob, when, unit) => {
    if (!dob || !when) return "";
    const birth = new Date(dob);
    const at = new Date(when);
    if (isNaN(birth) || isNaN(at)) return "";
    const diffMs = at.getTime() - birth.getTime();
    if (diffMs < 0) return "";
    return unit === "hrs"
      ? Math.round(diffMs / (1000 * 60 * 60))
      : Math.floor(diffMs / (1000 * 60 * 60 * 24));
  };

  useEffect(() => {
    if (!formData.dob || !formData.mortality_7d_date) return;
    setFormData((p) => ({ ...p, mortality_7d_age_hrs: calcAge(p.dob, p.mortality_7d_date, "hrs") }));
  }, [formData.mortality_7d_date, formData.dob]);

  useEffect(() => {
    if (!formData.dob || !formData.mortality_28d_date) return;
    setFormData((p) => ({ ...p, mortality_28d_age_days: calcAge(p.dob, p.mortality_28d_date, "days") }));
  }, [formData.mortality_28d_date, formData.dob]);

  useEffect(() => {
    if (!formData.dob || !formData.death36_date) return;
    setFormData((p) => ({ ...p, death36_age_days: calcAge(p.dob, p.death36_date, "days") }));
  }, [formData.death36_date, formData.dob]);

  useEffect(() => {
    if (!formData.dob || !formData.death40_date) return;
    setFormData((p) => ({ ...p, death40_age_days: calcAge(p.dob, p.death40_date, "days") }));
  }, [formData.death40_date, formData.dob]);

  useEffect(() => {
    if (!formData.dob || !formData.death44_date) return;
    setFormData((p) => ({ ...p, death44_age_days: calcAge(p.dob, p.death44_date, "days") }));
  }, [formData.death44_date, formData.dob]);

  useEffect(() => {
    if (!formData.dob || !formData.mortality_hospital_date) return;
    setFormData((p) => ({ ...p, mortality_hospital_age_days: calcAge(p.dob, p.mortality_hospital_date, "days") }));
  }, [formData.mortality_hospital_date, formData.dob]);

  useEffect(() => {
    if (!formData.dob || !formData.mortality_after_discharge_date) return;
    setFormData((p) => ({ ...p, mortality_after_discharge_age_days: calcAge(p.dob, p.mortality_after_discharge_date, "days") }));
  }, [formData.mortality_after_discharge_date, formData.dob]);

  /* ── Section summaries for collapsed accordion headers ── */
  const summary36 = () => {
    if (formData.death36 === "Yes") return "Death recorded";
    const parts = [];
    if (formData.bpd36_jensen_grade) parts.push(formData.bpd36_jensen_grade);
    if (formData.nec36_stage === "Yes") parts.push("NEC");
    if (formData.rop36 === "Yes") parts.push("ROP");
    return parts.length ? parts.join(" • ") : "Not filled";
  };
  const summary40 = () => {
    if (formData.death40 === "Yes") return "Death recorded";
    const parts = [];
    if (formData.nec40_stage === "Yes") parts.push("NEC");
    if (formData.rop40 === "Yes") parts.push("ROP");
    if (formData.abnormal_mri_tea) parts.push(`MRI: ${formData.abnormal_mri_tea}`);
    return parts.length ? parts.join(" • ") : "Not filled";
  };
  const summary44 = () => {
    if (formData.death44 === "Yes") return "Death recorded";
    const parts = [];
    if (formData.nec44_stage === "Yes") parts.push("NEC");
    if (formData.rop44_assessed === "Yes") parts.push("ROP");
    return parts.length ? parts.join(" • ") : "Not filled";
  };

  const buildPayload = () => ({
    enrollment_id: formData.enrollment_id,
    baby_uid: emptyToNull(formData.baby_uid),
    gestation_weeks: numOrNull(formData.gestation_weeks),
    birth_weight: numOrNull(formData.birth_weight),

    ventilation_required: yesNoToBool(formData.ventilation_required),
    switched_100_o2: yesNoToBool(formData.switched_100_o2),
    resus_chest_compressions: yesNoToBool(formData.resus_chest_compressions),
    intubation_during_resus: yesNoToBool(formData.intubation_during_resus),
    time_to_spontaneous_breathing: numOrNull(formData.time_to_spontaneous_breathing),
    hie_grade: emptyToNull(formData.hie_grade),

    resp_support_72h: yesNoToBool(formData.resp_support_72h),
    sepsis_eos: yesNoToBool(formData.sepsis_eos),
    sepsis_los: yesNoToBool(formData.sepsis_los),
    culture_positive_sepsis: yesNoToBool(formData.culture_positive_sepsis),
    culture_positive_body_fluid: emptyToNull(formData.culture_positive_body_fluid),
    mortality_7_days: yesNoToBool(formData.mortality_7_days),
    mortality_7d_cause: emptyToNull(formData.mortality_7d_cause),
    mortality_7d_date: emptyToNull(formData.mortality_7d_date),
    mortality_7d_time: emptyToNull(formData.mortality_7d_time),
    mortality_7d_age_hrs: numOrNull(formData.mortality_7d_age_hrs),
    mortality_28_days: yesNoToBool(formData.mortality_28_days),
    mortality_28d_cause: emptyToNull(formData.mortality_28d_cause),
    mortality_28d_date: emptyToNull(formData.mortality_28d_date),
    mortality_28d_time: emptyToNull(formData.mortality_28d_time),
    mortality_28d_age_days: numOrNull(formData.mortality_28d_age_days),

    encounter36_method: emptyToNull(formData.encounter36_method),
    encounter36_other: emptyToNull(formData.encounter36_other),
    encounter36_other_text: emptyToNull(formData.encounter36_other_text),
    death36: yesNoToBool(formData.death36),
    death36_cause: emptyToNull(formData.death36_cause),
    death36_date: emptyToNull(formData.death36_date),
    death36_time: emptyToNull(formData.death36_time),
    death36_age_days: numOrNull(formData.death36_age_days),
    bpd36_jensen_grade: emptyToNull(formData.bpd36_jensen_grade),
    bpd36_jensen_date: emptyToNull(formData.bpd36_jensen_date),
    bpd36_nichd_radiographic: yesNoToBool(formData.bpd36_nichd_radiographic),
    bpd36_nichd_fio2: numOrNull(formData.bpd36_nichd_fio2),
    bpd36_nichd_flow: numOrNull(formData.bpd36_nichd_flow),
    bpd36_nichd_grade: emptyToNull(formData.bpd36_nichd_grade),
    bpd36_nichd_date: emptyToNull(formData.bpd36_nichd_date),
    nec36_stage: yesNoToBool(formData.nec36_stage),
    nec36_surgery: yesNoToBool(formData.nec36_surgery),
    nec36_date: emptyToNull(formData.nec36_date),
    ivh36_grade3: yesNoToBool(formData.ivh36_grade3),
    ivh36_date: emptyToNull(formData.ivh36_date),
    cpvl36_grade2: yesNoToBool(formData.cpvl36_grade2),
    cpvl36_date: emptyToNull(formData.cpvl36_date),
    rop36: yesNoToBool(formData.rop36),
    rop36_treated: yesNoToBool(formData.rop36_treated),
    rop36_date: emptyToNull(formData.rop36_date),

    encounter40_method: emptyToNull(formData.encounter40_method),
    encounter40_other: emptyToNull(formData.encounter40_other),
    encounter40_other_text: emptyToNull(formData.encounter40_other_text),
    death40: yesNoToBool(formData.death40),
    death40_cause: emptyToNull(formData.death40_cause),
    death40_date: emptyToNull(formData.death40_date),
    death40_time: emptyToNull(formData.death40_time),
    death40_age_days: numOrNull(formData.death40_age_days),
    nec40_stage: yesNoToBool(formData.nec40_stage),
    nec40_surgery: yesNoToBool(formData.nec40_surgery),
    nec40_date: emptyToNull(formData.nec40_date),
    ivh40_grade3: yesNoToBool(formData.ivh40_grade3),
    ivh40_date: emptyToNull(formData.ivh40_date),
    cpvl40_grade2: yesNoToBool(formData.cpvl40_grade2),
    cpvl40_date: emptyToNull(formData.cpvl40_date),
    rop40: yesNoToBool(formData.rop40),
    rop40_treated: yesNoToBool(formData.rop40_treated),
    rop40_date: emptyToNull(formData.rop40_date),
    abnormal_mri_tea: emptyToNull(formData.abnormal_mri_tea),

    encounter44_method: emptyToNull(formData.encounter44_method),
    encounter44_other: emptyToNull(formData.encounter44_other),
    encounter44_other_text: emptyToNull(formData.encounter44_other_text),
    death44: yesNoToBool(formData.death44),
    death44_cause: emptyToNull(formData.death44_cause),
    death44_date: emptyToNull(formData.death44_date),
    death44_time: emptyToNull(formData.death44_time),
    death44_age_days: numOrNull(formData.death44_age_days),
    nec44_stage: yesNoToBool(formData.nec44_stage),
    nec44_surgery: yesNoToBool(formData.nec44_surgery),
    nec44_date: emptyToNull(formData.nec44_date),
    ivh44_grade3: yesNoToBool(formData.ivh44_grade3),
    ivh44_date: emptyToNull(formData.ivh44_date),
    cpvl44_grade2: yesNoToBool(formData.cpvl44_grade2),
    cpvl44_date: emptyToNull(formData.cpvl44_date),
    rop44_assessed: yesNoToBool(formData.rop44_assessed),
    rop44_treated: yesNoToBool(formData.rop44_treated),
    rop44_date: emptyToNull(formData.rop44_date),

    mv_days: numOrNull(formData.mv_days),
    niv_days: numOrNull(formData.niv_days),
    cpap_days: numOrNull(formData.cpap_days),
    hfnc_days: numOrNull(formData.hfnc_days),
    nippv_days: numOrNull(formData.nippv_days),
    sepsis_overall: yesNoToBool(formData.sepsis_overall),
    sepsis_overall_episodes: numOrNull(formData.sepsis_overall_episodes),
    mortality_in_hospital: yesNoToBool(formData.mortality_in_hospital),
    mortality_hospital_cause: emptyToNull(formData.mortality_hospital_cause),
    mortality_hospital_date: emptyToNull(formData.mortality_hospital_date),
    mortality_hospital_time: emptyToNull(formData.mortality_hospital_time),
    mortality_hospital_age_days: numOrNull(formData.mortality_hospital_age_days),
    mortality_after_discharge: yesNoToBool(formData.mortality_after_discharge),
    mortality_after_discharge_cause: emptyToNull(formData.mortality_after_discharge_cause),
    mortality_after_discharge_date: emptyToNull(formData.mortality_after_discharge_date),
    mortality_after_discharge_time: emptyToNull(formData.mortality_after_discharge_time),
    mortality_after_discharge_age_days: numOrNull(formData.mortality_after_discharge_age_days),

    crf_additional_notes: formData.crf_additional_notes && typeof formData.crf_additional_notes === "object"
      ? formData.crf_additional_notes
      : {},

    completed_by: emptyToNull(formData.completed_by),
    designation: emptyToNull(formData.designation),
    completion_date: emptyToNull(formData.completion_date),
  });

  const saveFormI = async () => {
    try {
      await api.post("/study-outcomes/", buildPayload());
      markFormCompleted("form_i");
      setIsSaved(true);
      setSaveMessage("✅ Saved");
    } catch (err) {
      console.error("❌ BACKEND ERROR:", err.response?.data);
      setSaveMessage("❌ Save failed — see console");
    } finally {
      setTimeout(() => setSaveMessage(""), 3000);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post("/study-outcomes/", buildPayload());
      markFormCompleted("form_i");
      alert("✅ Form I submitted successfully");
      navigate(`/form-j/${formData.enrollment_id}`);
    } catch (err) {
      console.error(err.response?.data || err);
      alert("❌ Error submitting Form I");
    }
  };

  const handleNavBack = async () => {
    try { await saveFormI(); } catch (err) { console.error("Save before back failed:", err); }
    navigate(`/form-h/${formData.enrollment_id}`, { state: { enrollmentId: formData.enrollment_id } });
  };
  const handleNavNext = () => {
    navigate(`/form-j/${formData.enrollment_id}`, { state: { enrollmentId: formData.enrollment_id } });
  };

  /* ── Small reusable date/time/text controls ── */
  /* ================================================================
     Table building blocks — the CRF itself is a table (Outcome |
     Definition | Result | Additional info), so the UI mirrors that
     structure directly instead of an accordion. Kept compact since
     each row already carries a lot of text.
     ================================================================ */

  const sectionMeta = [
    { key: "i1", label: "I.1 Resuscitation", icon: Wind },
    { key: "i2", label: "I.2 Post-resus", icon: ClipboardList },
    { key: "i3", label: "I.3 36 wk PMA", icon: CalendarClock },
    { key: "i4", label: "I.4 40 wk PMA", icon: CalendarCheck },
    { key: "i5", label: "I.5 44 wk PMA", icon: CalendarRange },
    { key: "i6", label: "I.6 Overall", icon: Skull },
  ];

  return (
    <FormIDataContext.Provider value={{ formData, setFormData, handleChange, autoFilledFields, clearAutoFilled }}>
    <>
      <div className="form-i-page form-i-tabular">
      <form className="screening-form" onSubmit={handleSubmit}>

        <div className="form-header-action-row">
          <div className="form-header-title-area">
            <div className="form-breadcrumb"><Home size={12}/> FORM I</div>
            <h2 className="form-main-title">Study Outcome Assessment</h2>
            <p className="form-main-subtitle">Neonatal outcomes from resuscitation through 36/40/44 weeks PMA and hospital discharge</p>
          </div>
          <div className="form-header-meta-area">
            <div className="screening-id-badge">
              <span className="id-label">Enrollment ID</span>
              <span className="id-val">{formData.enrollment_id || "—"}</span>
            </div>
          </div>
        </div>

        {/* Quick-nav rail — jumps to a section's table */}
        <nav className="form-i-quicknav" aria-label="Jump to section">
          {sectionMeta.map(({ key, label, icon: Icon }) => (
            <button type="button" key={key} onClick={() => goToSection(key)}>
              <Icon size={13} />
              {label}
            </button>
          ))}
        </nav>

        {/* ================= IDENTIFICATION ================= */}
        <div className="form-section soft-blue">
          <h3>IDENTIFICATION</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Enrollment ID</label>
              <input name="enrollment_id" value={formData.enrollment_id || ""} readOnly />
            </div>
            <div className="form-group">
              <label>Baby UID</label>
              <input name="baby_uid" value={formData.baby_uid || ""} readOnly />
            </div>
            <div className="form-group">
              <label>Gestation (weeks)</label>
              <input name="gestation_weeks" value={formData.gestation_weeks || ""} readOnly />
            </div>
          </div>
        </div>

        {/* ================= I.1 RESUSCITATION OUTCOMES ================= */}
        <div className="form-section soft-blue" ref={sectionRefs.i1}>
          <h3><Wind size={17} className="sec-icon" /> <span className="sec-num">I.1</span> Resuscitation Outcomes</h3>
          {resusPrefill && (
            <div className="field-hint field-hint-auto" style={{ margin: "0 0 10px" }}>
              Form B (Birth Resuscitation) data available. Empty fields below
              were filled from it automatically — verify before saving.
              {" "}
              <button type="button" className="link-button" onClick={() => fetchBirthResuscitationPrefill()}>
                Refill empty fields from Form B
              </button>
              {" · "}
              <button type="button" className="link-button link-button-danger" onClick={confirmForceRefillResus}>
                Force refill (overwrite existing answers)
              </button>
            </div>
          )}
          {(staleFields.ventilation_required || staleFields.resus_chest_compressions
            || staleFields.intubation_during_resus || staleFields.time_to_spontaneous_breathing) && (
            <div className="field-hint field-hint-warning" style={{ margin: "0 0 10px" }}>
              ⚠ Form B (Birth Resuscitation) now disagrees with the saved answer for:{" "}
              {[
                staleFields.ventilation_required && "Ventilation (PPV) required",
                staleFields.resus_chest_compressions && "Required chest compressions",
                staleFields.intubation_during_resus && "Intubation for resuscitation",
                staleFields.time_to_spontaneous_breathing && "Time to spontaneous respiratory efforts",
              ].filter(Boolean).join(", ")}.
              This can happen if this form was answered before Form B was
              finalized. Use "Force refill" above if Form B is correct.
            </div>
          )}
          <CrfTable>
            <CrfRow num={1} outcome="Ventilation (PPV) required" definition="Per NRP criteria"
              result={<RYesNo name="ventilation_required" required />} />
            <CrfRow num={2} outcome="Switched to 100% O2" definition="Per NRP criteria"
              result={<RYesNo name="switched_100_o2" required />} />
            <CrfRow num={3} outcome="Required chest compressions" definition="Per NRP criteria"
              result={<RYesNo name="resus_chest_compressions" required />} />
            <CrfRow num={4} outcome="Intubation for resuscitation" definition="Any reason"
              result={<RYesNo name="intubation_during_resus" required />} />
            <CrfRow num={5} outcome="Time to spontaneous respiratory efforts"
              definition="Time when baby had spontaneous respiratory efforts and PPV was discontinued"
              result={<RNum name="time_to_spontaneous_breathing" unit="sec" />} />
            <CrfRow num={6} outcome="HIE (Levene's)" definition="Mild/Moderate/Severe HIE"
              result={<RSelect name="hie_grade" options={["None", "Mild", "Mod", "Severe"]} />} />
          </CrfTable>
        </div>

        {/* ================= I.2 POST-NATAL POST-RESUSCITATION OUTCOMES ================= */}
        <div className="form-section soft-blue" ref={sectionRefs.i2}>
          <h3><ClipboardList size={17} className="sec-icon" /> <span className="sec-num">I.2</span> Post-natal Post-resuscitation Outcomes</h3>
          {postResusPrefill && (
            <div className="field-hint field-hint-auto" style={{ margin: "0 0 10px" }}>
              Data available from the daily logs (respiratory support in the first
              72h, sepsis detection, survival status). Empty fields below were
              filled from it automatically — verify before saving.
              {" "}
              <button type="button" className="link-button" onClick={() => fetchPostResusPrefill()}>
                Refill empty fields
              </button>
              {" · "}
              <button type="button" className="link-button link-button-danger" onClick={confirmForceRefillPostResus}>
                Force refill (overwrite existing answers)
              </button>
            </div>
          )}
          {(staleFields.resp_support_72h || staleFields.sepsis_eos || staleFields.sepsis_los
            || staleFields.culture_positive_sepsis || staleFields.culture_positive_body_fluid
            || staleFields.mortality_7_days || staleFields.mortality_7d_date
            || staleFields.mortality_28_days || staleFields.mortality_28d_date) && (
            <div className="field-hint field-hint-warning" style={{ margin: "0 0 10px" }}>
              ⚠ The daily logs now disagree with the saved answer for:{" "}
              {[
                staleFields.resp_support_72h && "Resp support (0.5–72h)",
                staleFields.sepsis_eos && "Sepsis (EOS)",
                staleFields.sepsis_los && "Sepsis (LOS)",
                staleFields.culture_positive_sepsis && "Culture positive sepsis",
                staleFields.culture_positive_body_fluid && "Body fluid",
                staleFields.mortality_7_days && "All-cause mortality ≤ 7 days",
                staleFields.mortality_7d_date && "Date of death (≤7d)",
                staleFields.mortality_28_days && "All-cause mortality ≤ 28 days",
                staleFields.mortality_28d_date && "Date of death (≤28d)",
              ].filter(Boolean).join(", ")}.
              This can happen if this form was answered before the daily
              logs were finalized. Use "Force refill" above if the daily
              logs are correct.
            </div>
          )}
          <CrfTable>
            <CrfRow num={7} outcome="Resp support (0.5–72h)" definition="Any respiratory support more than supplemental oxygen"
              result={<RYesNo name="resp_support_72h" required />} />
            <CrfRow num={8} outcome="Sepsis (EOS)" definition="Any type of sepsis with onset in the first 72 hours"
              result={<RYesNo name="sepsis_eos" required />} />
            <CrfRow num={9} outcome="Sepsis (LOS)" definition="Any type of sepsis with onset after Day 3 of life"
              result={<RYesNo name="sepsis_los" required />} />
            <CrfRow num={10} outcome="Culture positive sepsis" definition="Blood or body fluid positive for organism"
              result={<RYesNo name="culture_positive_sepsis" />}
              showInfo={formData.culture_positive_sepsis === "Yes"}
              info={<MiniText label="11. Body fluid" name="culture_positive_body_fluid" placeholder="e.g. Blood, CSF, Urine" />} />
            <CrfRow num={12} outcome="All-cause mortality ≤ 7 days" definition="Death due to any cause from birth till completion of D7 of age"
              result={<RYesNo name="mortality_7_days" />}
              showInfo={formData.mortality_7_days === "Yes"}
              info={<DeathInfo fieldPrefix="mortality_7d" ageLabel="hrs" nums={{ cause: 13, date: 14, time: 15, age: 16 }} />} />
            <CrfRow num={17} outcome="All-cause mortality ≤ 28 days" definition="Death due to any cause from birth till completion of D28 of age"
              result={<RYesNo name="mortality_28_days" />}
              showInfo={formData.mortality_28_days === "Yes"}
              info={<DeathInfo fieldPrefix="mortality_28d" ageLabel="days" nums={{ cause: 18, date: 19, time: 20, age: 21 }} />} />
          </CrfTable>
        </div>

        {/* ================= I.3 ASSESSMENT AT 36 WEEKS PMA ================= */}
        <div className="form-section soft-blue" ref={sectionRefs.i3}>
          <h3><CalendarClock size={17} className="sec-icon" /> <span className="sec-num">I.3</span> Assessment at 36 Weeks PMA</h3>
          {pmaPrefill[36] && (
            <div className="field-hint field-hint-auto" style={{ margin: "0 0 10px" }}>
              Data available for this checkpoint (36-week PMA date: {pmaPrefill[36].target_date}) — Form H's
              reviewed values where available, daily logs otherwise. Empty fields below were filled
              automatically — verify before saving.
              {" "}
              <button type="button" className="link-button" onClick={() => fetchPmaAssessmentPrefill(36)}>
                Refill empty fields
              </button>
              {" · "}
              <button type="button" className="link-button link-button-danger" onClick={() => confirmForceRefillPma(36)}>
                Force refill (overwrite existing answers)
              </button>
            </div>
          )}
          {pmaPrefill[36] === null && (
            <div className="field-hint" style={{ margin: "0 0 10px" }}>
              No data available for this checkpoint yet — this can mean the baby hasn't reached 36 weeks PMA,
              or was discharged before this checkpoint with no data source covering it.
            </div>
          )}
          {(staleFields.death36 || staleFields.nec36_stage || staleFields.nec36_date || staleFields.nec36_surgery
            || staleFields.ivh36_grade3 || staleFields.ivh36_date || staleFields.cpvl36_grade2 || staleFields.cpvl36_date
            || staleFields.rop36 || staleFields.rop36_date || staleFields.rop36_treated
            || staleFields.bpd36_jensen_grade) && (
            <div className="field-hint field-hint-warning" style={{ margin: "0 0 10px" }}>
              ⚠ The source data now disagrees with the saved answer for:{" "}
              {[
                staleFields.death36 && "Death by 36 weeks PMA",
                staleFields.nec36_stage && "NEC",
                staleFields.nec36_surgery && "NEC surgical intervention",
                staleFields.ivh36_grade3 && "IVH Grade ≥ III",
                staleFields.cpvl36_grade2 && "cPVL Grade ≥ II",
                staleFields.rop36 && "ROP",
                staleFields.rop36_treated && "ROP treated",
                staleFields.bpd36_jensen_grade && "BPD (Jensen)",
              ].filter(Boolean).join(", ")}.
              This can happen if this form was answered before Form H or the daily logs were finalized.
              Use "Force refill" above if the source data is correct.
            </div>
          )}
          <div className="crf-encounter-row">
            <Mini label="22. Method of Encounter">
              <RSelect name="encounter36_method" options={["Direct", "Telephonic"]} />
            </Mini>
            {formData.encounter36_method === "Telephonic" && (
              <>
                <Mini label="23. If Telephonic">
                  <RSelect name="encounter36_other" options={["Attendant", "Treating physician", "Others"]} />
                </Mini>
                {formData.encounter36_other === "Others" && (
                  <MiniText label="23. Specify others" name="encounter36_other_text" placeholder="Specify" />
                )}
              </>
            )}
          </div>
          <CrfTable>
            <CrfRow num={24} outcome="Death by 36 weeks PMA" definition="Death due to any cause from birth till completion of 36 weeks of PMA"
              result={<RYesNo name="death36" />}
              showInfo={formData.death36 === "Yes"}
              info={<DeathInfo fieldPrefix="death36" ageLabel="days" nums={{ cause: 25, date: 26, time: 27, age: 28 }} />} />
            <CrfRow num={29} outcome="BPD at 36 weeks PMA (Jensen)"
              definition="BPD is assessed based on respiratory support at 36 weeks PMA, regardless of FiO2 as per Jensen's criteria (2019) — Primary"
              result={<RSelect name="bpd36_jensen_grade" placeholder="Select grade"
                options={["Room air → No BPD", "Nasal cannula ≤ 2 L/min → Grade 1", "NC > 2 L/min or CPAP/NIPPV → Grade 2", "Invasive mechanical ventilation → Grade 3"]} />}
              showInfo={!!formData.bpd36_jensen_grade}
              info={<MiniDate label="30. Date of Diagnosis" name="bpd36_jensen_date" />} />
            <CrfRow num={31} outcome="BPD at 36 weeks PMA (NICHD)"
              definition="BPD is assessed based on radiographic confirmation + respiratory support/FiO2 for ≥ 3 consecutive days at 36 weeks PMA completion as per NICHD criteria (2018)"
              result={
                <div className="crf-stack">
                  <div className="crf-stack-item"><span>a) Radiographic disease</span><RYesNo name="bpd36_nichd_radiographic" /></div>
                  <div className="crf-stack-item"><span>b) FiO2 at 36 wks</span><RNum name="bpd36_nichd_fio2" unit="%" /></div>
                  <div className="crf-stack-item"><span>c) Flow rate</span><RNum name="bpd36_nichd_flow" unit="L/min" /></div>
                  <RSelect name="bpd36_nichd_grade" placeholder="Grade"
                    options={["Room air → No BPD", "NC < 1L + FiO2 0.22–0.29 → Grade 1", "NC 1–<3L + FiO2 0.22–0.29 or NIPPV + FiO2 0.21 → Grade 1", "NC ≥ 3L or NIPPV + FiO2 0.22–0.29 → Grade 2", "NIPPV + FiO2 ≥ 0.30 or IMV → Grade 3"]} />
                </div>
              }
              showInfo={!!formData.bpd36_nichd_grade}
              info={<MiniDate label="32. Date of Diagnosis" name="bpd36_nichd_date" />} />
            <CrfRow num={33} outcome="NEC" definition="Modified Bell's Staging"
              result={<><span className="crf-subline">Stage ≥ IIA</span><RYesNo name="nec36_stage" /></>}
              showInfo={formData.nec36_stage === "Yes"}
              info={<>
                <Mini label="34. Surgical intervention required"><RYesNo name="nec36_surgery" /></Mini>
                <MiniDate label="35. Date of Diagnosis" name="nec36_date" />
              </>} />
            <CrfRow num={36} outcome="Brain injury"
              definition="Papile Classification for IVH / De Vries Classification for cPVL"
              result={<>
                <div className="crf-stack-item"><span>a) IVH Grade ≥ III</span><RYesNo name="ivh36_grade3" /></div>
                <div className="crf-stack-item"><span>b) cPVL Grade ≥ II</span><RYesNo name="cpvl36_grade2" /></div>
              </>}
              showInfo={formData.ivh36_grade3 === "Yes" || formData.cpvl36_grade2 === "Yes"}
              info={<>
                {formData.ivh36_grade3 === "Yes" && <MiniDate label="37. Date of Diagnosis (IVH)" name="ivh36_date" />}
                {formData.cpvl36_grade2 === "Yes" && <MiniDate label="38. Date of Diagnosis (cPVL)" name="cpvl36_date" />}
              </>} />
            <CrfRow num={39} outcome="ROP" definition="ICROP 3rd Edition"
              result={<RYesNo name="rop36" />}
              showInfo={formData.rop36 === "Yes"}
              info={<>
                <Mini label="40. Treated"><RYesNo name="rop36_treated" /></Mini>
                <MiniDate label="41. Date of Diagnosis" name="rop36_date" />
              </>} />
          </CrfTable>
        </div>

        {/* ================= I.4 ASSESSMENT AT 40 WEEKS PMA ================= */}
        <div className="form-section soft-blue" ref={sectionRefs.i4}>
          <h3><CalendarCheck size={17} className="sec-icon" /> <span className="sec-num">I.4</span> Assessment at 40 Weeks PMA</h3>
          {pmaPrefill[40] && (
            <div className="field-hint field-hint-auto" style={{ margin: "0 0 10px" }}>
              Data available for this checkpoint (40-week PMA date: {pmaPrefill[40].target_date}) — Form H's
              reviewed values where available, daily logs otherwise. Empty fields below were filled
              automatically — verify before saving.
              {" "}
              <button type="button" className="link-button" onClick={() => fetchPmaAssessmentPrefill(40)}>
                Refill empty fields
              </button>
              {" · "}
              <button type="button" className="link-button link-button-danger" onClick={() => confirmForceRefillPma(40)}>
                Force refill (overwrite existing answers)
              </button>
            </div>
          )}
          {pmaPrefill[40] === null && (
            <div className="field-hint" style={{ margin: "0 0 10px" }}>
              No data available for this checkpoint yet — this can mean the baby hasn't reached 40 weeks PMA,
              or was discharged before this checkpoint with no data source covering it.
            </div>
          )}
          {(staleFields.death40 || staleFields.nec40_stage || staleFields.nec40_date || staleFields.nec40_surgery
            || staleFields.ivh40_grade3 || staleFields.ivh40_date || staleFields.cpvl40_grade2 || staleFields.cpvl40_date
            || staleFields.rop40 || staleFields.rop40_date || staleFields.rop40_treated
            || staleFields.abnormal_mri_tea) && (
            <div className="field-hint field-hint-warning" style={{ margin: "0 0 10px" }}>
              ⚠ The source data now disagrees with the saved answer for:{" "}
              {[
                staleFields.death40 && "Death between 36 and 40 weeks PMA",
                staleFields.nec40_stage && "NEC",
                staleFields.nec40_surgery && "NEC surgical intervention",
                staleFields.ivh40_grade3 && "IVH Grade ≥ III",
                staleFields.cpvl40_grade2 && "cPVL Grade ≥ II",
                staleFields.rop40 && "ROP",
                staleFields.rop40_treated && "ROP treated",
                staleFields.abnormal_mri_tea && "Abnormal MRI Brain at TEA",
              ].filter(Boolean).join(", ")}.
              This can happen if this form was answered before Form H, the daily logs, or Form K were finalized.
              Use "Force refill" above if the source data is correct.
            </div>
          )}
          <div className="crf-encounter-row">
            <Mini label="42. Method of Encounter">
              <RSelect name="encounter40_method" options={["Direct", "Telephonic"]} />
            </Mini>
            {formData.encounter40_method === "Telephonic" && (
              <>
                <Mini label="43. If Telephonic">
                  <RSelect name="encounter40_other" options={["Attendant", "Treating physician", "Others"]} />
                </Mini>
                {formData.encounter40_other === "Others" && (
                  <MiniText label="43. Specify others" name="encounter40_other_text" placeholder="Specify" />
                )}
              </>
            )}
          </div>
          <CrfTable>
            <CrfRow num={44} outcome="Death between 36 and 40 weeks PMA" definition="Death due to any cause from 36 weeks till completion of 40 weeks of PMA"
              result={<RYesNo name="death40" />}
              showInfo={formData.death40 === "Yes"}
              info={<DeathInfo fieldPrefix="death40" ageLabel="days" nums={{ cause: 45, date: 46, time: 47, age: 48 }} />} />
            <CrfRow num={49} outcome="NEC" definition="Modified Bell's Staging"
              result={<><span className="crf-subline">Stage ≥ IIA</span><RYesNo name="nec40_stage" /></>}
              showInfo={formData.nec40_stage === "Yes"}
              info={<>
                <Mini label="50. Surgical intervention required"><RYesNo name="nec40_surgery" /></Mini>
                <MiniDate label="51. Date of Diagnosis" name="nec40_date" />
              </>} />
            <CrfRow num={52} outcome="Brain injury" definition="Papile Classification for IVH / De Vries Classification for cPVL"
              result={<>
                <div className="crf-stack-item"><span>a) IVH Grade ≥ III</span><RYesNo name="ivh40_grade3" /></div>
                <div className="crf-stack-item"><span>b) cPVL Grade ≥ II</span><RYesNo name="cpvl40_grade2" /></div>
              </>}
              showInfo={formData.ivh40_grade3 === "Yes" || formData.cpvl40_grade2 === "Yes"}
              info={<>
                {formData.ivh40_grade3 === "Yes" && <MiniDate label="53. Date of Diagnosis (IVH)" name="ivh40_date" />}
                {formData.cpvl40_grade2 === "Yes" && <MiniDate label="54. Date of Diagnosis (cPVL)" name="cpvl40_date" />}
              </>} />
            <CrfRow num={55} outcome="ROP" definition="ICROP 3rd Edition"
              result={<RYesNo name="rop40" />}
              showInfo={formData.rop40 === "Yes"}
              info={<>
                <Mini label="56. Treated"><RYesNo name="rop40_treated" /></Mini>
                <MiniDate label="57. Date of Diagnosis" name="rop40_date" />
              </>} />
            <CrfRow num={58} outcome="Abnormal MRI Brain at TEA" definition="Abnormal MRI brain at 40 ± 2w PMA"
              result={<RSelect name="abnormal_mri_tea" options={["Yes", "No", "Not done"]} />}
              showInfo
              info={<>
                <span className="crf-note">Check MRI form (Form K) for more details</span>
                <AddlInfoText fieldNum={58} />
              </>} />
          </CrfTable>
        </div>

        {/* ================= I.5 ASSESSMENT AT 44 WEEKS PMA ================= */}
        <div className="form-section soft-blue" ref={sectionRefs.i5}>
          <h3><CalendarRange size={17} className="sec-icon" /> <span className="sec-num">I.5</span> Assessment at 44 Weeks PMA</h3>
          {pmaPrefill[44] && (
            <div className="field-hint field-hint-auto" style={{ margin: "0 0 10px" }}>
              Data available for this checkpoint (44-week PMA date: {pmaPrefill[44].target_date}) — Form H's
              reviewed values where available, daily logs otherwise. Empty fields below were filled
              automatically — verify before saving.
              {" "}
              <button type="button" className="link-button" onClick={() => fetchPmaAssessmentPrefill(44)}>
                Refill empty fields
              </button>
              {" · "}
              <button type="button" className="link-button link-button-danger" onClick={() => confirmForceRefillPma(44)}>
                Force refill (overwrite existing answers)
              </button>
            </div>
          )}
          {pmaPrefill[44] === null && (
            <div className="field-hint" style={{ margin: "0 0 10px" }}>
              No data available for this checkpoint yet — this can mean the baby hasn't reached 44 weeks PMA,
              or was discharged before this checkpoint with no data source covering it.
            </div>
          )}
          {(staleFields.death44 || staleFields.nec44_stage || staleFields.nec44_date || staleFields.nec44_surgery
            || staleFields.ivh44_grade3 || staleFields.ivh44_date || staleFields.cpvl44_grade2 || staleFields.cpvl44_date
            || staleFields.rop44_assessed || staleFields.rop44_date || staleFields.rop44_treated) && (
            <div className="field-hint field-hint-warning" style={{ margin: "0 0 10px" }}>
              ⚠ The source data now disagrees with the saved answer for:{" "}
              {[
                staleFields.death44 && "Death between 40 and 44 weeks PMA",
                staleFields.nec44_stage && "NEC",
                staleFields.nec44_surgery && "NEC surgical intervention",
                staleFields.ivh44_grade3 && "IVH Grade ≥ III",
                staleFields.cpvl44_grade2 && "cPVL Grade ≥ II",
                staleFields.rop44_assessed && "ROP",
                staleFields.rop44_treated && "ROP treated",
              ].filter(Boolean).join(", ")}.
              This can happen if this form was answered before Form H or the daily logs were finalized.
              Use "Force refill" above if the source data is correct.
            </div>
          )}
          <div className="crf-encounter-row">
            <Mini label="59. Method of Encounter">
              <RSelect name="encounter44_method" options={["Direct", "Telephonic"]} />
            </Mini>
            {formData.encounter44_method === "Telephonic" && (
              <>
                <Mini label="60. If Telephonic">
                  <RSelect name="encounter44_other" options={["Attendant", "Treating physician", "Others"]} />
                </Mini>
                {formData.encounter44_other === "Others" && (
                  <MiniText label="60. Specify others" name="encounter44_other_text" placeholder="Specify" />
                )}
              </>
            )}
          </div>
          <CrfTable>
            <CrfRow num={61} outcome="Death between 40 and 44 weeks PMA" definition="Death due to any cause from 40 weeks till completion of 44 weeks of PMA"
              result={<RYesNo name="death44" />}
              showInfo={formData.death44 === "Yes"}
              info={<DeathInfo fieldPrefix="death44" ageLabel="days" nums={{ cause: 62, date: 63, time: 64, age: 65 }} />} />
            <CrfRow num={66} outcome="NEC" definition="Modified Bell's Staging"
              result={<><span className="crf-subline">Stage ≥ IIA</span><RYesNo name="nec44_stage" /></>}
              showInfo={formData.nec44_stage === "Yes"}
              info={<>
                <Mini label="67. Surgical intervention required"><RYesNo name="nec44_surgery" /></Mini>
                <MiniDate label="68. Date of Diagnosis" name="nec44_date" />
              </>} />
            <CrfRow num={69} outcome="Brain injury" definition="Papile Classification for IVH / De Vries Classification for cPVL"
              result={<>
                <div className="crf-stack-item"><span>a) IVH Grade ≥ III</span><RYesNo name="ivh44_grade3" /></div>
                <div className="crf-stack-item"><span>b) cPVL Grade ≥ II</span><RYesNo name="cpvl44_grade2" /></div>
              </>}
              showInfo={formData.ivh44_grade3 === "Yes" || formData.cpvl44_grade2 === "Yes"}
              info={<>
                {formData.ivh44_grade3 === "Yes" && <MiniDate label="70. Date of Diagnosis (IVH)" name="ivh44_date" />}
                {formData.cpvl44_grade2 === "Yes" && <MiniDate label="71. Date of Diagnosis (cPVL)" name="cpvl44_date" />}
              </>} />
            <CrfRow num={72} outcome="ROP" definition="ICROP 3rd Edition"
              result={<RYesNo name="rop44_assessed" />}
              showInfo={formData.rop44_assessed === "Yes"}
              info={<>
                <Mini label="73. Treated"><RYesNo name="rop44_treated" /></Mini>
                <MiniDate label="74. Date of Diagnosis" name="rop44_date" />
              </>} />
          </CrfTable>
        </div>

        {/* ================= I.6 OVERALL ================= */}
        <div className="form-section soft-blue" ref={sectionRefs.i6}>
          <h3><Skull size={17} className="sec-icon" /> <span className="sec-num">I.6</span> Overall</h3>
          {overallPrefill && (
            <div className="field-hint field-hint-auto" style={{ margin: "0 0 10px" }}>
              Data available from the daily logs (respiratory support days,
              sepsis detection, survival status). Empty fields below were
              filled from it automatically — verify before saving.
              {" "}
              <button type="button" className="link-button" onClick={() => fetchOverallPrefill()}>
                Refill empty fields
              </button>
              {" · "}
              <button type="button" className="link-button link-button-danger" onClick={confirmForceRefillOverall}>
                Force refill (overwrite existing answers)
              </button>
            </div>
          )}
          {(staleFields.sepsis_overall || staleFields.mortality_in_hospital
            || staleFields.mortality_hospital_date) && (
            <div className="field-hint field-hint-warning" style={{ margin: "0 0 10px" }}>
              ⚠ The daily logs now disagree with the saved answer for:{" "}
              {[
                staleFields.sepsis_overall && "Sepsis (overall)",
                staleFields.mortality_in_hospital && "All-cause mortality during hospital stay",
                staleFields.mortality_hospital_date && "Date of death",
              ].filter(Boolean).join(", ")}.
              This can happen if this form was answered before the daily
              logs were finalized. Use "Force refill" above if the daily
              logs are correct.
            </div>
          )}
          <CrfTable>
            <CrfRow num={75} outcome="Duration of resp support" definition="Cumulative days of respiratory support during hospital stay"
              result={
                <div className="crf-stack">
                  <div className="crf-stack-item"><span>a) Invasive mech. ventilation</span><RNum name="mv_days" unit="d" /></div>
                  <div className="crf-stack-item"><span>b) Non-invasive ventilation</span><RNum name="niv_days" unit="d" /></div>
                  <div className="crf-stack-item"><span>c) CPAP</span><RNum name="cpap_days" unit="d" /></div>
                  <div className="crf-stack-item"><span>d) HFNC</span><RNum name="hfnc_days" unit="d" /></div>
                  <div className="crf-stack-item"><span>e) NIPPV</span><RNum name="nippv_days" unit="d" /></div>
                </div>
              } />
            <CrfRow num={76} outcome="Sepsis (overall)" definition="Any type"
              result={<RYesNo name="sepsis_overall" />}
              showInfo={formData.sepsis_overall === "Yes"}
              info={<Mini label="77. Number of episodes"><RNum name="sepsis_overall_episodes" placeholder="e.g. 2" /></Mini>} />
            <CrfRow num={78} outcome="All-cause mortality during hospital stay" definition="Death due to any cause occurring from birth and before discharge"
              result={<RYesNo name="mortality_in_hospital" />}
              showInfo={formData.mortality_in_hospital === "Yes"}
              info={<DeathInfo fieldPrefix="mortality_hospital" ageLabel="days" nums={{ cause: 79, date: 80, time: 81, age: 82 }} />} />
            <CrfRow num={83} outcome="All-cause mortality after discharge" definition="Death due to any cause occurring after discharge from hospital"
              result={<RYesNo name="mortality_after_discharge" />}
              showInfo={formData.mortality_after_discharge === "Yes"}
              info={<DeathInfo fieldPrefix="mortality_after_discharge" ageLabel="days" nums={{ cause: 84, date: 85, time: 86, age: 87 }} />} />
          </CrfTable>
        </div>

        {/* ================= COMPLETION ================= */}
        <div className="form-section soft-blue">
          <h3>COMPLETION</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Assessed by</label>
              <select
                name="completed_by"
                value={formData.completed_by || ""}
                onChange={handleAssessedByChange}
              >
                <option value="">-- Select --</option>
                {assessors.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
                {/* Keep a previously saved name visible even if not in current roster */}
                {formData.completed_by && !assessors.includes(formData.completed_by) && (
                  <option value={formData.completed_by}>{formData.completed_by}</option>
                )}
              </select>
              {!siteName && !patientData?.site_name && !patientData?.site && (
                <div className="field-note">Site not loaded yet — assessor list will appear when site is known.</div>
              )}
            </div>
            <div className="form-group">
              <label>Designation</label>
              <input
                name="designation"
                value={formData.designation || ""}
                readOnly
                placeholder="Auto-filled from Assessed by"
              />
            </div>
            <div className="form-group">
              <label>Date</label>
              <DatePicker
                selected={formData.completion_date ? parseDateOnly(formData.completion_date) : null}
                onChange={(date) => setFormData((p) => ({ ...p, completion_date: date ? toDateOnlyValue(date) : "" }))}
                dateFormat="dd/MM/yyyy"
                placeholderText="dd/mm/yyyy"
              />
            </div>
          </div>
        </div>

        
      </form>

      {saveMessage && (
        <div className={`form-message${saveMessage.startsWith("✅") ? " msg-success" : " msg-error"}`}>
          {saveMessage}
        </div>
      )}
      </div>

      <FormNavBar
        onBack={handleNavBack}
        onSave={saveFormI}
        onNext={handleNavNext}
        backLabel="Neonatal Morbidities"
        nextLabel="Composite Outcome"
        step={9} totalSteps={17}
        isSaved={isSaved}
      />
    </>
    </FormIDataContext.Provider>
  );
}
