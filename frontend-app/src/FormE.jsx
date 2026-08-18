import React, { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import api from "./api/axios";
import "./styles/FormC.css";
import "./styles/FormC1.css";
import { useFormProgress } from "./context/FormProgressContext";
import { usePatient } from "./context/PatientContext";
import useFormSession from "./hooks/useFormSession";
import NotesBox from "./components/NotesBox";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import OfflineBanner from "./components/OfflineBanner";
import { toDateOnlyValue, parseDateOnly, toDateTimeLocalValue } from "./utils/datetime";
import {
  ArrowLeft, ArrowRight, Save, Home,
  User, Thermometer, Wind, CheckSquare, Truck,
  CheckCircle, AlertTriangle, XCircle,
} from "lucide-react";

/* ── Toggle — same compact Yes/No control as Form C ── */
function Toggle({ name, value, options, onChange, disabled, error }) {
  const isActive = (opt) => {
    const v = typeof opt === "object" ? opt.value : opt;
    if (value === v) return true;
    if (v === "Yes" && value === true)  return true;
    if (v === "No"  && value === false) return true;
    return String(value) === String(v);
  };

  return (
    <>
      <div style={{ display: "block", lineHeight: 0 }}>
        <div className={`fc-toggle-group${disabled ? " fc-disabled" : ""}${error ? " fc-toggle-error" : ""}`}>
          {options.map((opt, idx) => {
            const v = typeof opt === "object" ? opt.value : opt;
            const l = typeof opt === "object" ? opt.label : opt;
            const active = isActive(opt);
            const sv = String(v).toLowerCase();
            let activeCls = "";
            if (active) {
              if (sv === "yes" || v === true)        activeCls = " fc-yes";
              else if (sv === "no" || v === false)   activeCls = " fc-no";
              else                                    activeCls = " fc-other";
            }
            return (
              <button
                key={String(v)}
                type="button"
                disabled={disabled}
                className={`fc-toggle-btn${active ? " fc-active" + activeCls : ""}${idx > 0 ? " fc-divider" : ""}`}
                onClick={() => !disabled && onChange(name, v)}
              >
                {l}
              </button>
            );
          })}
        </div>
      </div>
      {error && <div className="field-error">{error}</div>}
    </>
  );
}

/* ── Unit-labelled number input ── */
const UnitInput = ({ name, value, onChange, onBlur, readOnly, unit, error, placeholder }) => (
  <div style={{ position: "relative" }}>
    <input type="number" name={name} value={value || ""} readOnly={readOnly}
      onChange={onChange} onBlur={onBlur} placeholder={placeholder}
      className={`emr-input${error ? " input-error" : ""}`}
      style={{ paddingRight: unit.length > 2 ? 68 : 44 }} />
    <span style={{ position:"absolute", right:32, top:"50%", transform:"translateY(-50%)",
      fontSize:11, color:"#94a3b8", fontWeight:600, pointerEvents:"none" }}>{unit}</span>
  </div>
);

const FieldErr = ({ msg }) => msg
  ? <div className="field-error" style={{ display:"flex", alignItems:"center", gap:4 }}>
      <XCircle size={11} /> {msg}
    </div>
  : null;

const KNOWN_HEATING_TYPES = ["Gel pack", "PCM", "Plastic wrap", "Cap", "Other"];
const KNOWN_ADVERSE_TYPES = ["Apnea", "Bradycardia", "Tube accident", "Other"];
const KNOWN_TRANSPORT_MODES = ["Room air", "CPAP", "SIB", "NIPPV", "IMV", "SIMV", "HFOV", "Other"];
const KNOWN_NICU_MODES = ["Room air", "CPAP", "NIPPV", "IMV", "SIMV", "HFOV", "Other"];

/** Encode multi-select + optional Other free-text into a single DB string. */
function encodeMultiChoice(selected, otherText) {
  const list = Array.isArray(selected) ? selected : (selected ? [selected] : []);
  const parts = list.filter(t => t && t !== "Other");
  if (list.includes("Other")) {
    const custom = (otherText || "").trim();
    parts.push(custom || "Other");
  }
  return parts.join(", ") || null;
}

/** Decode a stored string into selected known options + Other free-text. */
function decodeMultiChoice(raw, knownOptions) {
  const parts = String(raw || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!parts.length) return { selected: [], other: "" };
  const selected = [];
  const unknown = [];
  for (const p of parts) {
    if (knownOptions.includes(p) && p !== "Other") selected.push(p);
    else if (p === "Other") selected.push("Other");
    else unknown.push(p);
  }
  if (unknown.length) {
    if (!selected.includes("Other")) selected.push("Other");
    return { selected, other: unknown.join(", ") };
  }
  return { selected, other: "" };
}

function toggleMultiValue(list, value) {
  const arr = Array.isArray(list) ? list : [];
  return arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value];
}

/** Normalize Form B DOB into YYYY-MM-DD (local). */
function normalizeDobYmd(raw) {
  if (raw == null || raw === "") return "";
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const dmyDash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmyDash) {
    return `${dmyDash[3]}-${dmyDash[2].padStart(2, "0")}-${dmyDash[1].padStart(2, "0")}`;
  }
  const dmySlash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmySlash) {
    return `${dmySlash[3]}-${dmySlash[2].padStart(2, "0")}-${dmySlash[1].padStart(2, "0")}`;
  }
  const parsed = parseDateOnly(s.slice(0, 10));
  return parsed ? toDateOnlyValue(parsed) : "";
}

/** Normalize Form B time into HH:MM:SS. */
function normalizeTobHms(raw) {
  if (raw == null || raw === "") return "";
  const m = String(raw).trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return "";
  return `${m[1].padStart(2, "0")}:${m[2]}:${(m[3] || "00").padStart(2, "0")}`;
}

/** Normalize API/local admission datetime into YYYY-MM-DDTHH:mm (local). */
function normalizeAdmissionLocal(raw) {
  if (raw == null || raw === "") return "";
  const s = String(raw).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    return `${m[1]}-${m[2]}-${m[3]}T${m[4].padStart(2, "0")}:${m[5]}`;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return toDateTimeLocalValue(d);
}

/**
 * Age at admission in completed hours (Form B birth datetime → Form E admission).
 * Returns "" when inputs are incomplete or admission is before birth.
 */
function calcAgeAtAdmissionHours(dobYmd, tobHms, admissionLocal) {
  if (!dobYmd || !admissionLocal) return "";
  const birth = parseDateOnly(String(dobYmd).slice(0, 10));
  if (!birth) return "";
  const tm = String(tobHms || "00:00:00").match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (tm) {
    birth.setHours(Number(tm[1]), Number(tm[2]), Number(tm[3] || 0), 0);
  } else {
    birth.setHours(0, 0, 0, 0);
  }
  const admNorm = normalizeAdmissionLocal(admissionLocal);
  const am = String(admNorm).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{1,2}):(\d{2})/);
  if (!am) return "";
  const admission = new Date(
    Number(am[1]), Number(am[2]) - 1, Number(am[3]),
    Number(am[4]), Number(am[5]), 0, 0
  );
  if (Number.isNaN(admission.getTime())) return "";
  const diffMs = admission.getTime() - birth.getTime();
  if (diffMs < 0) return "";
  return String(Math.floor(diffMs / (1000 * 60 * 60)));
}

/* ── Respiratory parameter grid — defined OUTSIDE FormE to prevent remount on state change ── */
function RespParamGrid({ prefix, serial, formData, errors, isFieldEditable, handleChange }) {
  return (
    <div className="form-grid-2" style={{ marginTop: 12 }}>
      <div className="form-group">
        <label>{serial}b. CPAP</label>
        <UnitInput name={`${prefix}_cpap`} value={formData[`${prefix}_cpap`]} unit="cmH₂O"
          readOnly={!isFieldEditable} error={errors[`${prefix}_cpap`]}
          placeholder="2–12"
          onChange={e => {
            const v = e.target.value;
            if (v === "" || (/^\d+$/.test(v) && Number(v) <= 20)) handleChange(e);
          }}
          onBlur={e => {
            let v = Number(e.target.value);
            if (v > 12) v = 12; if (v < 2 && v !== 0) v = 2;
            handleChange({ target: { name: `${prefix}_cpap`, value: v || "" } });
          }} />
        <FieldErr msg={errors[`${prefix}_cpap`]} />
      </div>
      <div className="form-group">
        <label>{serial}c. PIP</label>
        <UnitInput name={`${prefix}_pip`} value={formData[`${prefix}_pip`]} unit="cmH₂O"
          readOnly={!isFieldEditable} error={errors[`${prefix}_pip`]}
          placeholder="10–40"
          onChange={e => {
            const v = e.target.value;
            if (v === "" || (/^\d+$/.test(v) && Number(v) <= 50)) handleChange(e);
          }}
          onBlur={e => {
            let v = Number(e.target.value);
            if (v > 40) v = 40; if (v < 10 && v !== 0) v = 10;
            handleChange({ target: { name: `${prefix}_pip`, value: v || "" } });
          }} />
        <FieldErr msg={errors[`${prefix}_pip`]} />
      </div>
      <div className="form-group">
        <label>{serial}d. PEEP</label>
        <UnitInput name={`${prefix}_peep`} value={formData[`${prefix}_peep`]} unit="cmH₂O"
          readOnly={!isFieldEditable} error={errors[`${prefix}_peep`]}
          placeholder="2–10"
          onChange={e => {
            const v = e.target.value;
            if (v === "" || (/^\d+$/.test(v) && Number(v) <= 15)) handleChange(e);
          }}
          onBlur={e => {
            let v = Number(e.target.value);
            if (v > 10) v = 10; if (v < 2 && v !== 0) v = 2;
            handleChange({ target: { name: `${prefix}_peep`, value: v || "" } });
          }} />
        <FieldErr msg={errors[`${prefix}_peep`]} />
      </div>
      <div className="form-group">
        <label>{serial}e. MAP</label>
        <UnitInput name={`${prefix}_map`} value={formData[`${prefix}_map`]} unit="cmH₂O"
          readOnly={!isFieldEditable} error={errors[`${prefix}_map`]}
          placeholder="5–20"
          onChange={e => {
            const v = e.target.value;
            if (v === "" || (/^\d+$/.test(v) && Number(v) <= 25)) handleChange(e);
          }}
          onBlur={e => {
            let v = Number(e.target.value);
            if (v > 20) v = 20; if (v < 5 && v !== 0) v = 5;
            handleChange({ target: { name: `${prefix}_map`, value: v || "" } });
          }} />
        <FieldErr msg={errors[`${prefix}_map`]} />
      </div>
      {/* FiO₂ — inline (not via UnitInput) to avoid spinner overlap */}
      <div className="form-group">
        <label>{serial}f. FiO2</label>
        <div style={{ position: "relative" }}>
          <input
            type="number"
            name={`${prefix}_fio2`}
            value={formData[`${prefix}_fio2`] || ""}
            readOnly={!isFieldEditable}
            min={21} max={100} step={1}
            placeholder="21–100"
            className={`emr-input${errors[`${prefix}_fio2`] ? " input-error" : formData[`${prefix}_fio2`] ? " fv-input-ok" : ""}`}
            style={{ paddingRight: 36 }}
            onChange={e => {
              const v = e.target.value;
              if (v === "" || (Number(v) >= 0 && Number(v) <= 100))
                handleChange(e);
            }}
            onBlur={e => {
              let v = Number(e.target.value);
              if (e.target.value === "") return;
              if (v < 21) v = 21;
              if (v > 100) v = 100;
              handleChange({ target: { name: `${prefix}_fio2`, value: String(v) } });
            }}
          />
          <span style={{
            position: "absolute", right: 32, top: "50%", transform: "translateY(-50%)",
            fontSize: 11, color: "#94a3b8", fontWeight: 600, pointerEvents: "none",
          }}>%</span>
        </div>
        {errors[`${prefix}_fio2`] && (
          <div className="field-error" style={{ display:"flex", alignItems:"center", gap:4 }}>
            <XCircle size={11} /> {errors[`${prefix}_fio2`]}
          </div>
        )}
        {!errors[`${prefix}_fio2`] && formData[`${prefix}_fio2`] && (
          <div style={{ fontSize:11, color:"#16a34a", marginTop:3, display:"flex", alignItems:"center", gap:3 }}>
            <CheckCircle size={11} />
            {Number(formData[`${prefix}_fio2`]) === 21 ? "Room air (21%)" :
             Number(formData[`${prefix}_fio2`]) === 100 ? "100% O₂" :
             `${formData[`${prefix}_fio2`]}% O₂`}
          </div>
        )}
      </div>
    </div>
  );
}

function RespModeSection({ prefix, label, serial, modes, formData, errors, isFieldEditable, handleChange, setFormData, setErrors }) {
  const modeField = `${prefix}_mode_resp`;
  const otherField = `${prefix}_mode_other`;
  return (
    <div className="obstetric-subcard">
      <div className="obstetric-subcard__title">{label}</div>
      <div className="form-group">
        <label>{serial}a. Mode <span className="required">*</span></label>
        <div className="rx-horizontal-group" style={{ flexWrap:"wrap" }}>
          {modes.map(mode => (
            <button key={mode} type="button"
              className={`rx-horizontal-btn${formData[modeField] === mode ? " active" : ""}`}
              onClick={() => {
                if (!isFieldEditable) return;
                setFormData(prev => ({ ...prev, [modeField]: mode, [otherField]: "" }));
                setErrors(prev => ({ ...prev, [modeField]: "" }));
              }}
              disabled={!isFieldEditable}>{mode}</button>
          ))}
        </div>
        <FieldErr msg={errors[modeField]} />
      </div>
      {formData[modeField] === "Other" && (
        <div className="followup-box" style={{ marginTop:10 }}>
          <div className="form-group">
            <label>Specify Mode <span className="required">*</span></label>
            <input type="text" name={otherField} value={formData[otherField] || ""}
              readOnly={!isFieldEditable} className={`emr-input${errors[otherField] ? " input-error" : ""}`}
              placeholder="e.g. High flow nasal cannula"
              onChange={e => {
                const v = e.target.value;
                if (/^[A-Za-z\s]*$/.test(v)) handleChange(e);
              }} />
            <FieldErr msg={errors[otherField]} />
          </div>
        </div>
      )}
      <RespParamGrid prefix={prefix} serial={serial}
        formData={formData} errors={errors}
        isFieldEditable={isFieldEditable} handleChange={handleChange} />
    </div>
  );
}

export default function FormE() {
  const location = useLocation();
  const navigate = useNavigate();
  const { markFormCompleted } = useFormProgress();
  const { enrollmentId } = useParams();

  const [errors,    setErrors]    = useState({});
  const [touched,   setTouched]   = useState({});
  const [isSaved,   setIsSaved]   = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [message,   setMessage]   = useState("");
  const [isFormELoaded, setIsFormELoaded] = useState(false);
  const [isBirthLoaded, setIsBirthLoaded] = useState(false);
  const [hasFormERecord, setHasFormERecord] = useState(false);
  const isFieldEditable = !isSaved || isEditing;

  const emptyFormE = () => ({
    enrollment_id: "",
    baby_uid: "", annual_number: "", baby_name: "", date_of_birth: "",
    time_of_birth: "",
    admission_datetime: "", age_at_admission_hours: "",
    temp_dr: "",
    temp_skin: "", temp_axillary: "",
    transport_incubator: "", transport_mode: "",
    transport_mode_other: "", nicu_mode_other: "",
    additional_heating: "", heating_type_other: "", heating_type: [],
    transport_adverse_event: "", adverse_event_type: [], tube_accident_type: "",
    transport_mode_resp: "", adverse_event_other: "",
    transport_cpap: "", transport_pip: "", transport_peep: "",
    transport_map: "", transport_fio2: "",
    nicu_mode_resp: "",
    nicu_cpap: "", nicu_pip: "", nicu_peep: "",
    nicu_map: "", nicu_fio2: "",
    completed_by: "", designation: "", completion_date: "",
  });

  const [formData, setFormData] = useState(emptyFormE);

  /* ── Build payload for auto-save (draft-safe, no validation) ── */
  const buildAutoPayload = () => ({
    enrollment_id: formData.enrollment_id,
    baby_uid: formData.baby_uid,
    annual_number: formData.annual_number,
    baby_name: formData.baby_name,
    admission_datetime: formData.admission_datetime || null,
    age_at_admission_hours: num(formData.age_at_admission_hours),
    temp_skin: num(formData.temp_skin),
    temp_axillary: num(formData.temp_axillary),
    temp_dr: num(formData.temp_dr),
    transport_incubator: yesNoToBool(formData.transport_incubator),
    transport_mode: formData.transport_mode,
    additional_heating: yesNoToBool(formData.additional_heating),
    heating_type: encodeMultiChoice(formData.heating_type, formData.heating_type_other),
    transport_adverse_event: yesNoToBool(formData.transport_adverse_event),
    adverse_event_type: encodeMultiChoice(formData.adverse_event_type, formData.adverse_event_other),
    tube_accident_type: formData.adverse_event_type?.includes("Tube accident")
      ? (formData.tube_accident_type || null) : null,
    transport_mode_resp: formData.transport_mode_resp === "Other" ? formData.transport_mode_other : formData.transport_mode_resp,
    transport_cpap: num(formData.transport_cpap),
    transport_pip: num(formData.transport_pip),
    transport_peep: num(formData.transport_peep),
    transport_map: num(formData.transport_map),
    transport_fio2: num(formData.transport_fio2),
    nicu_mode_resp: formData.nicu_mode_resp === "Other" ? formData.nicu_mode_other : formData.nicu_mode_resp,
    nicu_cpap: num(formData.nicu_cpap),
    nicu_pip: num(formData.nicu_pip),
    nicu_peep: num(formData.nicu_peep),
    nicu_map: num(formData.nicu_map),
    nicu_fio2: num(formData.nicu_fio2),
    completed_by: formData.completed_by,
    designation: formData.designation,
    completion_date: formData.completion_date || null,
  });

  /* ── useFormSession hook: auto-save, dirty tracking, beforeunload warning ── */
  const session = useFormSession({
    formKey: "form_e",
    isLoaded: hasFormERecord,
    recordId: enrollmentId,
    buildPayload: buildAutoPayload,
    endpoint: "/nicu-admission",
    enabled: !!(enrollmentId) && isBirthLoaded && isFormELoaded && (!isSaved || isEditing),
  });
  const { markDirty, resetInitialRender } = session;

  /* ── Mark dirty on form change (only while editable) ── */
  useEffect(() => {
    if (!isFormELoaded) return;
    if (isSaved && !isEditing) return;
    markDirty();
  }, [formData, isFormELoaded, isSaved, isEditing, markDirty]);

  /* ════════ ALL ORIGINAL LOGIC PRESERVED ════════ */

  const formatDateTime = (dt) => {
    if (!dt) return "";
    if (dt.includes("T")) return dt;
    const date = new Date(dt);
    if (isNaN(date)) return "";
    return date.toISOString().slice(0, 16);
  };

  useEffect(() => {
    if (!enrollmentId) return;
    let cancelled = false;

    // Wipe previous patient's NICU answers immediately. Without this, opening
    // Form E for baby B while baby A's fields were still in memory let
    // autosave write A's temps/modes under B's enrollment_id.
    setIsSaved(false);
    setIsFormELoaded(false);
    setIsBirthLoaded(false);
    setHasFormERecord(false);
    setIsEditing(false);
    setErrors({});
    setTouched({});
    setFormData(emptyFormE());
    resetInitialRender();

    /* ── Phase 1: identification from Form B (DOB/TOB drive age calc) ── */
    api.get(`/birth-resuscitation/${enrollmentId}`)
      .then(async res => {
        if (cancelled) return;
        const b = res?.data || {};
        let motherName = "";
        let screeningId = b?.screening_id;
        if (!screeningId) {
          try {
            const ownScreening = await api.get(`/screenings/by-enrollment/${enrollmentId}`);
            screeningId = ownScreening.data?.screening_id;
          } catch (_) {}
        }
        if (screeningId) {
          try {
            const piiRes = await api.get(`/pii/screening/${screeningId}`);
            const pii = piiRes.data || {};
            const first = pii.mother_first_name || pii.mother_name_first || "";
            const last  = pii.mother_surname    || pii.mother_name_surname || "";
            motherName  = `${first} ${last}`.trim();
          } catch (_) {}
        }
        if (!motherName)
          motherName = `${b?.mother_name_first || ""} ${b?.mother_name_surname || ""}`.trim();
        const dob = normalizeDobYmd(b?.date_of_birth);
        const tob = normalizeTobHms(b?.time_of_birth);
        setFormData({
          ...emptyFormE(),
          enrollment_id: enrollmentId,
          baby_uid: b?.baby_uid || "",
          baby_name: motherName ? `Baby of ${motherName}` : (b?.baby_name || ""),
          annual_number: b?.annual_number || "",
          date_of_birth: dob,
          time_of_birth: tob,
          age_at_admission_hours: calcAgeAtAdmissionHours(dob, tob, "") || "",
        });
      })
      .catch(() => {
        if (cancelled) return;
      })
      .finally(() => {
        if (!cancelled) setIsBirthLoaded(true);
      });

   /* ── Phase 2: load saved Form E record ── */
   api.get(`/nicu-admission/${enrollmentId}`)
     .then(res => {
       if (cancelled) return;
       const e = res.data;
       if (!e) {
         setIsSaved(false);
         setHasFormERecord(false);
         setIsFormELoaded(true);
         resetInitialRender();
         return;
       }

       const fromBool = (v) => v === true ? "Yes" : v === false ? "No" : "";

      const heatingDecoded = decodeMultiChoice(e.heating_type, KNOWN_HEATING_TYPES);
      const adverseDecoded = decodeMultiChoice(e.adverse_event_type, KNOWN_ADVERSE_TYPES);

      const transportModeRaw = e.transport_mode_resp || "";
      const transportModeIsOther = transportModeRaw && !KNOWN_TRANSPORT_MODES.includes(transportModeRaw);
      const nicuModeRaw = e.nicu_mode_resp || "";
      const nicuModeIsOther = nicuModeRaw && !KNOWN_NICU_MODES.includes(nicuModeRaw);

      setFormData(prev => {
        const admission = normalizeAdmissionLocal(e.admission_datetime);
        const computedAge = calcAgeAtAdmissionHours(
          prev.date_of_birth,
          prev.time_of_birth,
          admission
        );
        const storedAge = e.age_at_admission_hours != null && e.age_at_admission_hours !== ""
          ? String(e.age_at_admission_hours)
          : "";
        return {
         ...prev,
          annual_number:   e.annual_number || prev.annual_number,
          baby_name:       e.baby_name     || prev.baby_name,
          baby_uid:        e.baby_uid      || prev.baby_uid,

          admission_datetime: admission,
          age_at_admission_hours: computedAge !== "" ? computedAge : storedAge,

          temp_dr:       e.temp_dr       != null ? String(e.temp_dr)       : "",
          temp_skin:     e.temp_skin     != null ? String(e.temp_skin)     : "",
          temp_axillary: e.temp_axillary != null ? String(e.temp_axillary) : "",

          additional_heating: fromBool(e.additional_heating),
          heating_type: heatingDecoded.selected,
          heating_type_other: heatingDecoded.other,

          transport_incubator: fromBool(e.transport_incubator),
          transport_mode: e.transport_mode || "",

          transport_adverse_event: fromBool(e.transport_adverse_event),
          adverse_event_type: adverseDecoded.selected,
          adverse_event_other: adverseDecoded.other,
          tube_accident_type: e.tube_accident_type || "",

          transport_mode_resp: transportModeIsOther ? "Other" : transportModeRaw,
          transport_mode_other: transportModeIsOther ? transportModeRaw : "",
          transport_cpap: e.transport_cpap != null ? String(e.transport_cpap) : "",
          transport_pip:  e.transport_pip  != null ? String(e.transport_pip)  : "",
          transport_peep: e.transport_peep != null ? String(e.transport_peep) : "",
          transport_map:  e.transport_map  != null ? String(e.transport_map)  : "",
          transport_fio2: e.transport_fio2 != null ? String(e.transport_fio2) : "",

          nicu_mode_resp: nicuModeIsOther ? "Other" : nicuModeRaw,
          nicu_mode_other: nicuModeIsOther ? nicuModeRaw : "",
          nicu_cpap: e.nicu_cpap != null ? String(e.nicu_cpap) : "",
          nicu_pip:  e.nicu_pip  != null ? String(e.nicu_pip)  : "",
          nicu_peep: e.nicu_peep != null ? String(e.nicu_peep) : "",
          nicu_map:  e.nicu_map  != null ? String(e.nicu_map)  : "",
          nicu_fio2: e.nicu_fio2 != null ? String(e.nicu_fio2) : "",

          completed_by:    e.completed_by    || "",
          designation:     e.designation     || "",
          completion_date: e.completion_date || "",
        };
      });

        setHasFormERecord(true);
        setIsSaved(!!e.finalized);
        setIsFormELoaded(true);
        resetInitialRender();
      })
      .catch(err => {
        if (cancelled) return;
        console.log("❌ Error loading Form E data", err);
        setHasFormERecord(false);
        setIsFormELoaded(true);
        resetInitialRender();
      });

    return () => { cancelled = true; };
  }, [enrollmentId, resetInitialRender]);

  useEffect(() => {
    // Wait for Form B load so we don't wipe a stored age while DOB is still empty.
    if (!isBirthLoaded) return;

    const next = calcAgeAtAdmissionHours(
      formData.date_of_birth,
      formData.time_of_birth,
      formData.admission_datetime
    );
    if (String(formData.age_at_admission_hours ?? "") === String(next)) return;
    setFormData(prev => ({ ...prev, age_at_admission_hours: next }));
  }, [
    isBirthLoaded,
    formData.date_of_birth,
    formData.time_of_birth,
    formData.admission_datetime,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (e) => {
    const { name, value } = e.target;
    let updatedValue = value;
    let errorMsg = "";
    if (name === "admission_datetime" && value && value.includes("/")) {
      const date = new Date(value);
      if (!isNaN(date)) updatedValue = toDateTimeLocalValue(date);
    }
    if (["temp_dr","temp_skin","temp_axillary"].includes(name))
      if (value && (Number(value) < 30 || Number(value) > 40)) errorMsg = "Must be between 30–40 °C";
    if (["transport_fio2","nicu_fio2"].includes(name)) {
      if (value && Number(value) < 21) errorMsg = "Minimum is 21% (room air)";
      else if (value && Number(value) > 100) errorMsg = "Maximum is 100%";
    }
    if (name === "age_at_admission_hours")
      if (value && Number(value) > 99) errorMsg = "Must be between 0–99 hours";
    if (name === "adverse_event_other")
      if (formData.adverse_event_type?.includes("Other") && !value) errorMsg = "Specify adverse event";
      else if (value && !/^[A-Za-z\s]+$/.test(value)) errorMsg = "Only letters are allowed";
    const requiredFields = ["admission_datetime","temp_dr","temp_skin","temp_axillary","additional_heating",
      "transport_incubator","transport_adverse_event","transport_mode_resp","nicu_mode_resp","completed_by"];
    if (requiredFields.includes(name) && !value) errorMsg = "This field is required";
    if (name === "transport_cpap" && value && (Number(value) < 2 || Number(value) > 12)) errorMsg = "Range: 2–12";
    if (name === "transport_pip" && value && (Number(value) < 10 || Number(value) > 40)) errorMsg = "Range: 10–40";
    if (name === "transport_peep" && value && (Number(value) < 2 || Number(value) > 10)) errorMsg = "Range: 2–10";
    if (name === "transport_map" && value && (Number(value) < 5 || Number(value) > 20)) errorMsg = "Range: 5–20";
    if (name === "nicu_cpap" && value && (Number(value) < 2 || Number(value) > 12)) errorMsg = "Range: 2–12";
    if (name === "nicu_pip" && value && (Number(value) < 10 || Number(value) > 40)) errorMsg = "Range: 10–40";
    if (name === "nicu_peep" && value && (Number(value) < 2 || Number(value) > 10)) errorMsg = "Range: 2–10";
    if (name === "nicu_map" && value && (Number(value) < 5 || Number(value) > 20)) errorMsg = "Range: 5–20";
    if (name === "heating_type" && formData.additional_heating === "Yes" && !(Array.isArray(value) ? value.length : value)) errorMsg = "Select heating type";
    if (name === "heating_type_other") {
      if (!value) errorMsg = "Specify heating method";
      else if (!/^[A-Za-z\s]+$/.test(value)) errorMsg = "Only letters are allowed";
    }
    if (name === "transport_mode" && formData.transport_incubator === "No" && !value) errorMsg = "Specify transport mode";
    if (name === "adverse_event_type" && formData.transport_adverse_event === "Yes" && !(Array.isArray(value) ? value.length : value)) errorMsg = "Select adverse event";
    if (name === "tube_accident_type" && formData.adverse_event_type?.includes?.("Tube accident") && !value) errorMsg = "Select tube accident type";
    if (name === "transport_mode_other" && formData.transport_mode_resp === "Other" && !value) errorMsg = "Specify mode";
    if (name === "nicu_mode_other" && formData.nicu_mode_resp === "Other" && !value) errorMsg = "Specify mode";
    setFormData(prev => ({ ...prev, [name]: updatedValue }));
    setErrors(prev => ({ ...prev, [name]: errorMsg }));
  };

  const handleToggle = (name, value) => {
    setFormData(prev => {
      const updated = { ...prev, [name]: value };
      if (name === "additional_heating" && value !== "Yes") {
        updated.heating_type = [];
        updated.heating_type_other = "";
      }
      if (name === "transport_adverse_event" && value !== "Yes") {
        updated.adverse_event_type = [];
        updated.adverse_event_other = "";
        updated.tube_accident_type = "";
      }
      if (name === "transport_incubator" && value !== "No") {
        updated.transport_mode = "";
      }
      return updated;
    });
    setErrors(prev => ({ ...prev, [name]: "" }));
  };

  const yesNoToBool = (v) => v === "Yes" ? true : v === "No" ? false : null;
  const num = (v) => v === "" ? null : Number(v);

  const handleSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();

    if (!formData.enrollment_id) {
      setMessage("❌ Enrollment ID missing. Cannot save form.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return false;
    }

    // Required-field + conditional validation (aligned with CRF E1–E15)
    const v = {};
    if (!formData.admission_datetime) v.admission_datetime = "This field is required";
    if (!formData.temp_dr) v.temp_dr = "This field is required";
    if (!formData.temp_skin) v.temp_skin = "This field is required";
    if (!formData.temp_axillary) v.temp_axillary = "This field is required";
    if (!formData.transport_incubator) v.transport_incubator = "This field is required";
    if (formData.transport_incubator === "No" && !formData.transport_mode)
      v.transport_mode = "Specify transport mode";
    if (!formData.additional_heating) v.additional_heating = "This field is required";
    if (formData.additional_heating === "Yes" && !(formData.heating_type?.length))
      v.heating_type = "Select heating type";
    if (formData.heating_type?.includes("Other") && !formData.heating_type_other)
      v.heating_type_other = "Specify heating method";
    if (!formData.transport_adverse_event) v.transport_adverse_event = "This field is required";
    if (formData.transport_adverse_event === "Yes" && !(formData.adverse_event_type?.length))
      v.adverse_event_type = "Select adverse event";
    if (formData.adverse_event_type?.includes("Tube accident") && !formData.tube_accident_type)
      v.tube_accident_type = "Select tube accident type";
    if (formData.adverse_event_type?.includes("Other") && !formData.adverse_event_other)
      v.adverse_event_other = "Specify adverse event";
    if (!formData.transport_mode_resp) v.transport_mode_resp = "This field is required";
    if (formData.transport_mode_resp === "Other" && !formData.transport_mode_other)
      v.transport_mode_other = "Specify mode";
    if (!formData.nicu_mode_resp) v.nicu_mode_resp = "This field is required";
    if (formData.nicu_mode_resp === "Other" && !formData.nicu_mode_other)
      v.nicu_mode_other = "Specify mode";
    if (!formData.completed_by) v.completed_by = "This field is required";
    if (!formData.completion_date) v.completion_date = "This field is required";

    ["temp_dr","temp_skin","temp_axillary"].forEach(f => {
      if (formData[f] && (Number(formData[f]) < 30 || Number(formData[f]) > 40))
        v[f] = "Must be between 30–40 °C";
    });
    if (formData.transport_fio2 && (Number(formData.transport_fio2) < 21 || Number(formData.transport_fio2) > 100))
      v.transport_fio2 = "Must be between 21% and 100%";
    if (formData.nicu_fio2 && (Number(formData.nicu_fio2) < 21 || Number(formData.nicu_fio2) > 100))
      v.nicu_fio2 = "Must be between 21% and 100%";

    if (Object.keys(v).length > 0) {
      setErrors(prev => ({ ...prev, ...v }));
      setMessage("❌ Please complete the required fields highlighted below.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return false;
    }
    const payload = {
      enrollment_id: formData.enrollment_id,
      baby_uid: formData.baby_uid,
      annual_number: formData.annual_number,
      baby_name: formData.baby_name,
      admission_datetime: formData.admission_datetime || null,
      age_at_admission_hours: num(formData.age_at_admission_hours),
      temp_skin: num(formData.temp_skin),
      temp_axillary: num(formData.temp_axillary),
      temp_dr: num(formData.temp_dr),
      transport_incubator: yesNoToBool(formData.transport_incubator),
      transport_mode: formData.transport_mode,
      additional_heating: yesNoToBool(formData.additional_heating),
      heating_type: encodeMultiChoice(formData.heating_type, formData.heating_type_other),
      transport_adverse_event: yesNoToBool(formData.transport_adverse_event),
      adverse_event_type: encodeMultiChoice(formData.adverse_event_type, formData.adverse_event_other),
      tube_accident_type: formData.adverse_event_type?.includes("Tube accident")
        ? (formData.tube_accident_type || null) : null,
      transport_mode_resp: formData.transport_mode_resp === "Other" ? formData.transport_mode_other : formData.transport_mode_resp,
      transport_cpap: num(formData.transport_cpap),
      transport_pip:  num(formData.transport_pip),
      transport_peep: num(formData.transport_peep),
      transport_map:  num(formData.transport_map),
      transport_fio2: num(formData.transport_fio2),
      nicu_mode_resp: formData.nicu_mode_resp === "Other" ? formData.nicu_mode_other : formData.nicu_mode_resp,
      nicu_cpap: num(formData.nicu_cpap),
      nicu_pip:  num(formData.nicu_pip),
      nicu_peep: num(formData.nicu_peep),
      nicu_map:  num(formData.nicu_map),
      nicu_fio2: num(formData.nicu_fio2),
      completed_by: formData.completed_by,
      designation: formData.designation,
      completion_date: formData.completion_date || null,
      // Only the explicit, fully-validated Save sets this — autosave's
      // payload (buildAutoPayload) never includes this key, and the
      // backend is set up to leave finalized untouched when it's absent
      // rather than resetting it on every 10s autosave tick.
      finalized: true,
    };
    try {
      if (hasFormERecord || isSaved) {
        await api.put(`/nicu-admission/${formData.enrollment_id}`, payload);
      } else {
        await api.post("/nicu-admission/", payload);
      }
      markFormCompleted("form_e");
      setHasFormERecord(true);
      setMessage("✅ Form E saved successfully");
      setIsSaved(true); setIsEditing(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
      setTimeout(() => setMessage(""), 3000);
      return true;
      // Do NOT navigate here — only navigate when user clicks "Next"
    } catch (err) {
      console.error("FormE submit error:", err.response?.data || err);
      setMessage("❌ Error submitting Form E: " + (err?.response?.data?.detail || err.message));
    }
  };

  const saveForLater = async () => {
    setMessage("");
    if (!formData.enrollment_id) {
      setMessage("❌ Enrollment ID missing. Cannot save draft.");
      return;
    }
    try {
      await session.saveDraft();
      setHasFormERecord(true);
      setIsFormELoaded(true);
      setMessage("💾 Draft saved — return any time to complete");
      setTimeout(() => setMessage(""), 3000);
      return true;
    } catch (err) {
      setMessage("❌ " + (err?.message || "Draft save failed."));
    }
  };

  const handleNext = async () => {
    const allTouched = Object.fromEntries(Object.keys(formData).map(k => [k, true]));
    setTouched(allTouched);
    const ok = await handleSubmit({ preventDefault: () => {} });
    if (ok) {
      navigate(`/fio2-auc/${enrollmentId}`);
    }
  };

  const handlePrevious = async () => {
    // Save before going back
    if (session.isDirty && isFormELoaded) {
      try {
        await session.doSave();
      } catch (err) {
        console.error("Save before back failed:", err);
      }
    }
    // FIX: navigate(-1) used browser history "go back", which lands on
    // whatever page happened to be previous in THIS TAB's history (e.g. the
    // FiO2 AUC helper form, if that was visited earlier in the session) —
    // not necessarily Form D. Navigate to the actual Form D route instead,
    // the same way handleNext explicitly targets the FiO2 AUC route above.
    navigate(`/form-d/${enrollmentId}`);
  };

  const nurses = ["Geetika","Navkiran Kaur","Priyanka Thakur","Seemran Kaur",
    "Tanvi Saini","Yashvi Jolly","Mannat Guliani","Shalini Dhiman"];
  const getDesignation = (name) => {
    if (name === "Mannat Guliani") return "Project Research Scientist III (Medical)";
    if (name === "Shalini Dhiman") return "Project Research Scientist III (Non-Medical)";
    return name ? "Project Nurse III" : "";
  };
  const handleCompletedByChange = (e) => {
    const name = e.target.value;
    setFormData(prev => ({ ...prev, completed_by: name, designation: getDesignation(name) }));
  };

  /* ════════ RENDER ════════ */
  return (
    <>
      <OfflineBanner isOnline={session.isOnline} offlineQueue={session.offlineQueue} />

      {isSaved && isEditing && (
        <div className="editing-mode-banner">
          <span className="editing-mode-dot" />
          Editing Mode Active — changes will be saved when you click Save
        </div>
      )}

      <form
        className={`screening-form${isSaved && !isEditing ? " readonly" : ""}${isSaved && isEditing ? " editing-mode" : ""}`}
        onSubmit={handleSubmit}>
        <fieldset>
          <div className="form-inner">

            {/* ═══ HEADER ═══ */}
            <div className="form-header-action-row">
              <div className="form-header-title-area">
                <div className="form-breadcrumb"><Home size={12} /> FORM E</div>
                <h2 className="form-main-title">NICU Admission</h2>
                <p className="form-main-subtitle">Fill only if enrolled subject required NICU admission</p>
              </div>
              <div className="form-header-meta-area">
                {isSaved && <button type="button" className="btn-print-form" onClick={() => window.print()}>🖨️ Print</button>}
                {isSaved && (
                  <button type="button"
                    className={`btn-edit-form-header${isEditing ? " editing-active" : ""}`}
                    onClick={() => setIsEditing(p => {
                      const next = !p;
                      if (!next) resetInitialRender();
                      return next;
                    })}>
                    {isEditing ? "✓ Done Editing" : "Edit Form"}
                  </button>
                )}
                <div className="screening-id-badge">
                  <span className="id-label">Enrollment ID</span>
                  <span className="id-val">{formData.enrollment_id || "—"}</span>
                </div>
              </div>
            </div>

            {/* ═══ CARD 1 — IDENTIFICATION ═══ */}
            <div className="form-section card-section">
              <div className="form-section-header">
                <div className="section-title-left"><User size={18} className="section-header-icon" /><h3>E1 · Identification</h3></div>
              </div>
              <div className="form-section-body">
                <div className="form-grid-2">
                  <div className="form-group">
                    <label>1. Enrollment ID</label>
                    <input value={formData.enrollment_id || "—"} readOnly className="readonly-input" />
                  </div>
                  <div className="form-group">
                    <label>2. Baby of <span className="field-note">(auto)</span></label>
                    <input value={formData.baby_name || ""} readOnly className="readonly-input" />
                  </div>
                </div>
              </div>
            </div>

            {/* ═══ CARD 2 — NICU ADMISSION DETAILS ═══ */}
            <div className="form-section card-section">
              <div className="form-section-header">
                <div className="section-title-left"><Truck size={18} className="section-header-icon" /><h3>E2 · NICU Admission Details</h3></div>
              </div>
              <div className="form-section-body">
                <div className="form-grid-2">
                  <div className="form-group">
                    <label>3. Date &amp; Time <span className="required">*</span> <span className="field-note">(DD/MM/YY; HH:MM)</span></label>
                    <DatePicker
                      selected={(() => {
                        const v = formData.admission_datetime;
                        if (!v) return null;
                        const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?/);
                        if (m) {
                          return new Date(
                            Number(m[1]), Number(m[2]) - 1, Number(m[3]),
                            Number(m[4]), Number(m[5]), Number(m[6] || 0), 0
                          );
                        }
                        const d = new Date(v);
                        return isNaN(d.getTime()) ? null : d;
                      })()}
                      onChange={date => setFormData(prev => {
                        const admission = date ? toDateTimeLocalValue(date) : "";
                        return {
                          ...prev,
                          admission_datetime: admission,
                          age_at_admission_hours: calcAgeAtAdmissionHours(
                            prev.date_of_birth,
                            prev.time_of_birth,
                            admission
                          ),
                        };
                      })}
                      showTimeSelect timeFormat="hh:mm aa" timeIntervals={1}
                      dateFormat="dd-MM-yyyy | hh:mm aa"
                      placeholderText="Select date & time"
                      disabled={!isFieldEditable} />
                  </div>
                  <div className="form-group">
                    <label>4. Age at admission <span className="auto-tag">AUTO</span></label>
                    <div style={{ position:"relative" }}>
                      <input
                        value={formData.age_at_admission_hours === "" || formData.age_at_admission_hours == null
                          ? ""
                          : formData.age_at_admission_hours}
                        readOnly className="readonly-input"
                        placeholder={
                          !isBirthLoaded
                            ? "Loading birth details…"
                            : formData.date_of_birth
                              ? (formData.admission_datetime ? "Auto-calculated" : "Select admission date/time")
                              : "Needs DOB from Form B"
                        }
                        style={{ paddingRight: 52 }} />
                      <span style={{ position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",
                        fontSize:11,color:"#94a3b8",fontWeight:600 }}>hours</span>
                    </div>
                    {isBirthLoaded && !formData.date_of_birth && (
                      <div className="field-note" style={{ marginTop: 4, color: "#b45309" }}>
                        Save Date &amp; Time of Birth on Form B, then reopen Form E.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ═══ CARD 3 — TEMPERATURE & TRANSPORT ═══ */}
            <div className="form-section card-section">
              <div className="form-section-header">
                <div className="section-title-left"><Thermometer size={18} className="section-header-icon" /><h3>E3 · NICU Transport Details</h3></div>
              </div>
              <div className="form-section-body">

                {/* Temperature */}
                <div className="obstetric-subcard">
                  <div className="obstetric-subcard__title">Temperature</div>

                  {/* Row 1: Temperature in DR (prior to transport) */}
                  <div className="form-group" style={{ marginBottom: 14 }}>
                    <label>
                      5. Temperature in DR{" "}
                      <span className="required">*</span>{" "}
                      <span style={{ fontSize:11, color:"#64748b", fontWeight:600 }}>
                        (prior to transport)
                      </span>
                    </label>
                    <UnitInput name="temp_dr" value={formData.temp_dr} unit="°C"
                      readOnly={!isFieldEditable} error={!!errors.temp_dr}
                      placeholder="30–40" onChange={handleChange} />
                    <FieldErr msg={errors.temp_dr} />
                  </div>

                  {/* Row 2: Temperature at admission into NICU */}
                  <div style={{ fontSize:12, fontWeight:600, color:"#475569", marginBottom:10 }}>
                    6. Temperature at admission into NICU:
                  </div>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>6a. Skin <span className="required">*</span></label>
                      <UnitInput name="temp_skin" value={formData.temp_skin} unit="°C"
                        readOnly={!isFieldEditable} error={!!errors.temp_skin}
                        placeholder="30–40" onChange={handleChange} />
                      <FieldErr msg={errors.temp_skin} />
                    </div>
                    <div className="form-group">
                      <label>6b. Axillary <span className="required">*</span></label>
                      <UnitInput name="temp_axillary" value={formData.temp_axillary} unit="°C"
                        readOnly={!isFieldEditable} error={!!errors.temp_axillary}
                        placeholder="30–40" onChange={handleChange} />
                      <FieldErr msg={errors.temp_axillary} />
                    </div>
                  </div>
                </div>

                {/* Transport Incubator */}
                <div className="obstetric-subcard">
                  <div className="obstetric-subcard__title">Transport</div>
                  <div className="form-group">
                    <label>7. Transport incubator used <span className="required">*</span></label>
                    <Toggle name="transport_incubator" value={formData.transport_incubator}
                      options={["Yes","No"]} onChange={handleToggle}
                      disabled={!isFieldEditable} error={errors.transport_incubator} />
                  </div>
                  {formData.transport_incubator === "No" && (
                    <div className="followup-box" style={{ marginTop:10 }}>
                      <div className="form-group">
                        <label>8. If No, mode of transport <span className="required">*</span></label>
                        <input type="text" name="transport_mode"
                          value={formData.transport_mode || ""}
                          readOnly={!isFieldEditable}
                          className={`emr-input${errors.transport_mode ? " input-error" : ""}`}
                          placeholder="e.g. Ambulance, Kangaroo transport"
                          onChange={e => {
                            const v = e.target.value;
                            if (/^[A-Za-z\s]*$/.test(v)) handleChange(e);
                          }} />
                        <FieldErr msg={errors.transport_mode} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Additional Heating */}
                <div className="obstetric-subcard">
                  <div className="obstetric-subcard__title">Additional Heating</div>
                  <div className="form-group">
                    <label>9. Additional heating <span className="required">*</span></label>
                    <Toggle name="additional_heating" value={formData.additional_heating}
                      options={["Yes","No"]} onChange={handleToggle}
                      disabled={!isFieldEditable} error={errors.additional_heating} />
                  </div>
                  {formData.additional_heating === "Yes" && (
                    <div className="followup-box" style={{ marginTop:12 }}>
                      <div className="form-group">
                        <label>10. Type <span className="required">*</span> <span style={{ fontSize:11, fontWeight:400, color:"#94a3b8" }}>(select all that apply)</span></label>
                        <div className="rx-horizontal-group" style={{ flexWrap:"wrap" }}>
                          {KNOWN_HEATING_TYPES.map(type => (
                            <button key={type} type="button"
                              className={`rx-horizontal-btn${formData.heating_type?.includes(type) ? " active" : ""}`}
                              onClick={() => {
                                if (!isFieldEditable) return;
                                setFormData(prev => {
                                  const next = toggleMultiValue(prev.heating_type, type);
                                  return {
                                    ...prev,
                                    heating_type: next,
                                    heating_type_other: next.includes("Other") ? prev.heating_type_other : "",
                                  };
                                });
                                setErrors(prev => ({ ...prev, heating_type: "" }));
                              }}
                              disabled={!isFieldEditable}>{type}</button>
                          ))}
                        </div>
                        <FieldErr msg={errors.heating_type} />
                      </div>
                      {formData.heating_type?.includes("Other") && (
                        <div className="form-group" style={{ marginTop:10 }}>
                          <label>Specify Heating Type <span className="required">*</span></label>
                          <input type="text" name="heating_type_other"
                            value={formData.heating_type_other || ""}
                            readOnly={!isFieldEditable}
                            className={`emr-input${errors.heating_type_other ? " input-error" : ""}`}
                            placeholder="e.g. Warm cloth, Heated mattress"
                            onChange={e => {
                              const v = e.target.value;
                              if (/^[A-Za-z\s]*$/.test(v)) handleChange(e);
                            }} />
                          <FieldErr msg={errors.heating_type_other} />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Adverse Events */}
                <div className="obstetric-subcard">
                  <div className="obstetric-subcard__title">Adverse Events During Transport</div>
                  <div className="form-group">
                    <label>11. Adverse events during transport <span className="required">*</span></label>
                    <Toggle name="transport_adverse_event" value={formData.transport_adverse_event}
                      options={["Yes","No"]} onChange={handleToggle}
                      disabled={!isFieldEditable} error={errors.transport_adverse_event} />
                  </div>
                  {formData.transport_adverse_event === "Yes" && (
                    <div className="followup-box" style={{ marginTop:12 }}>
                      <div className="form-group">
                        <label>12. If yes, type <span className="required">*</span> <span style={{ fontSize:11, fontWeight:400, color:"#94a3b8" }}>(select all that apply)</span></label>
                        <div className="rx-horizontal-group" style={{ flexWrap:"wrap" }}>
                          {KNOWN_ADVERSE_TYPES.map(type => (
                            <button key={type} type="button"
                              className={`rx-horizontal-btn${formData.adverse_event_type?.includes(type) ? " active" : ""}`}
                              onClick={() => {
                                if (!isFieldEditable) return;
                                setFormData(prev => {
                                  const next = toggleMultiValue(prev.adverse_event_type, type);
                                  return {
                                    ...prev,
                                    adverse_event_type: next,
                                    adverse_event_other: next.includes("Other") ? prev.adverse_event_other : "",
                                    tube_accident_type: next.includes("Tube accident") ? prev.tube_accident_type : "",
                                  };
                                });
                                setErrors(prev => ({ ...prev, adverse_event_type: "" }));
                              }}
                              disabled={!isFieldEditable}>{type}</button>
                          ))}
                        </div>
                        <FieldErr msg={errors.adverse_event_type} />
                      </div>
                      {formData.adverse_event_type?.includes("Tube accident") && (
                        <div className="form-group" style={{ marginTop:10 }}>
                          <label>13. If Tube accident <span className="required">*</span></label>
                          <Toggle name="tube_accident_type" value={formData.tube_accident_type}
                            options={["Displacement","Blockage"]} onChange={handleToggle}
                            disabled={!isFieldEditable} error={errors.tube_accident_type} />
                        </div>
                      )}
                      {formData.adverse_event_type?.includes("Other") && (
                        <div className="form-group" style={{ marginTop:10 }}>
                          <label>Specify adverse event <span className="required">*</span></label>
                          <input type="text" name="adverse_event_other"
                            value={formData.adverse_event_other || ""}
                            readOnly={!isFieldEditable}
                            className={`emr-input${errors.adverse_event_other ? " input-error" : ""}`}
                            placeholder="e.g. Hypothermia"
                            onChange={e => {
                              const v = e.target.value;
                              if (/^[A-Za-z\s]*$/.test(v)) handleChange(e);
                            }} />
                          <FieldErr msg={errors.adverse_event_other} />
                        </div>
                      )}
                    </div>
                  )}
                </div>

              </div>
            </div>

            {/* ═══ CARD 4 — RESPIRATORY SUPPORT ═══ */}
            <div className="form-section card-section">
              <div className="form-section-header">
                <div className="section-title-left"><Wind size={18} className="section-header-icon" /><h3>E4 · Respiratory Support</h3></div>
              </div>
              <div className="form-section-body">
                <RespModeSection prefix="transport" label="14. During Transport" serial="14"
                  modes={["Room air","CPAP","SIB","NIPPV","IMV","SIMV","HFOV","Other"]}
                  formData={formData} errors={errors}
                  isFieldEditable={isFieldEditable} handleChange={handleChange}
                  setFormData={setFormData} setErrors={setErrors} />
                <div style={{ marginTop:16 }}>
                  <RespModeSection prefix="nicu" label="15. In NICU (after stabilization)" serial="15"
                    modes={["Room air","CPAP","NIPPV","IMV","SIMV","HFOV","Other"]}
                    formData={formData} errors={errors}
                    isFieldEditable={isFieldEditable} handleChange={handleChange}
                    setFormData={setFormData} setErrors={setErrors} />
                </div>
              </div>
            </div>

            {/* ═══ CARD 5 — COMPLETION ═══ */}
            <div className="form-section card-section">
              <div className="form-section-header">
                <div className="section-title-left"><CheckSquare size={18} className="section-header-icon" /><h3>Completion Details</h3></div>
              </div>
              <div className="form-section-body">
                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Completed by <span className="required">*</span></label>
                    <select name="completed_by" value={formData.completed_by || ""}
                      onChange={handleCompletedByChange} disabled={!isFieldEditable}
                      className="emr-select" required>
                      <option value="">-- Select Nurse --</option>
                      {nurses.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <FieldErr msg={errors.completed_by} />
                  </div>
                  <div className="form-group">
                    <label>Designation</label>
                    <input value={formData.designation || ""} readOnly className="readonly-input" placeholder="Auto-filled" />
                  </div>
                </div>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Date (DD/MM/YY) <span className="required">*</span></label>
                    <DatePicker
                      selected={formData.completion_date ? parseDateOnly(formData.completion_date) : null}
                      onChange={date => {
                        const value = date ? toDateOnlyValue(date) : "";
                        setFormData(prev => ({ ...prev, completion_date: value }));
                        setErrors(prev => ({ ...prev, completion_date: value ? "" : "This field is required" }));
                      }}
                      maxDate={new Date()}
                      dateFormat="dd-MM-yyyy" placeholderText="Select date"
                      disabled={!isFieldEditable} />
                    <FieldErr msg={errors.completion_date} />
                  </div>
                  <div />
                </div>
              </div>
            </div>

            <NotesBox formKey={`form_e_${enrollmentId || "new"}`} />

            {message && (
              <div className={`form-message${message.startsWith("✅") ? " form-message--success" : " form-message--error"}`}>
                {message}
              </div>
            )}

          </div>
        </fieldset>
      </form>

      {/* STICKY FOOTER */}
      <div className="form-navigation">
        <button type="button" className="btn btn-secondary btn-outline" onClick={handlePrevious}>
          <ArrowLeft size={15} /> Postnatal Day 1
        </button>
        <button type="button" className="btn btn-save btn-outline-blue" onClick={handleSubmit}>
          <Save size={15} /> Save
        </button>
        <button type="button" className="btn btn-draft" onClick={saveForLater}>
          <Save size={15} /> Save for Later
        </button>
        <div className="autosave-indicator">
          {session.lastSaved && session.autoSaveStatus === "idle" && (
            <span className="last-saved-txt">Saved {session.relT(session.lastSaved)}</span>
          )}
          {session.isDirty && session.autoSaveStatus === "idle" && !session.lastSaved && (
            <span className="unsaved-dot-pill"><span className="unsaved-dot" />Unsaved changes</span>
          )}
          {session.autoSaveStatus === "saving" && (
            <span className="autosave-pill autosave-pill--saving"><span className="autosave-dot autosave-dot--spin" />Auto-saving...</span>
          )}
          {session.autoSaveStatus === "saved" && (
            <span className="autosave-pill autosave-pill--saved">Auto-saved</span>
          )}
          {session.autoSaveStatus === "error" && (
            <span className="autosave-pill autosave-pill--error">Auto-save failed</span>
          )}
        </div>
        <div className="footer-step-indicator">
          <span className="step-text">STEP 5 OF 17</span>
          <div className="step-progress-line">
            {[...Array(5)].map((_, i) => (
              <div key={i} className={`progress-segment${i < 5 ? " active" : ""}`} />
            ))}
          </div>
        </div>
        <button type="button" className="btn btn-primary"
          onClick={handleNext} disabled={!isSaved}>
          FiO₂ AUC Log <ArrowRight size={15} />
        </button>
      </div>
    </>
  );
}
