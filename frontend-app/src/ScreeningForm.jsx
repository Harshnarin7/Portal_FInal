import React, { useState, useEffect, useCallback, useRef } from "react";
import api from "./api/axios";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { useParams, useNavigate } from "react-router-dom";
import "./styles/global.css";
import "./styles/FormA.css";
// Modern date picker redesign — scoped under .fa-modern-dp (see file header
// comment for why this exists instead of further patching FormA.css/global.css).
import "./styles/FormAModernDatePicker.css";
import PrintSummary from "./components/PrintSummary";
import NotesBox from "./components/NotesBox";
import SignaturePad from "./SignaturePad";
import SaveSuccessModal from "./components/SaveSuccessModal";
import { useRegisterActiveFormSession } from "./context/ActiveFormSessionContext";
import {
  ArrowLeft, ArrowRight, Save, Home, Pencil,
  Calendar, User, FileText, ShieldAlert, CheckSquare, Info, CheckCircle2,
} from "lucide-react";
import { useFormProgress } from "./context/FormProgressContext";
import { isUsableEnrollmentId } from "./utils/enrollmentId";
import { useAuth } from "./context/AuthContext";
import { relativeTime, toDateTimeLocalValue, formatDateToDDMMYYYY, toDateOnlyValue, parseDateOnly, eddFromLmp, normalizeDateTimeLocalString } from "./utils/datetime";
import { resolveConsentSignatureFromRecord, resolvePiSignatureFromRecord } from "./utils/consentSignature";
import { sanitizeScreeningCreatePayload } from "./utils/screeningPayload";
import { printPatientPdf } from "./utils/printPatientPdf";

/* ─── YesNoToggle — animated sliding segment ──────────────── */
function YesNoToggle({ label, name, value, onChange, disabled = false, eligibleWhen }) {
  const fire = (val) => {
    if (disabled) return;
    onChange({ target: { name, value: val } });
  };
  // 0 = neither selected yet (no slide position), 1 = Yes, 2 = No
  const pos = value === "Yes" ? 1 : value === "No" ? 2 : 0;
  const isEligible = eligibleWhen != null && value === eligibleWhen;
  return (
    <div className={`yes-no-toggle${disabled ? " yn-disabled" : ""}`}>
      <span className="yes-no-label">
        {label}
        {isEligible && (
          <CheckCircle2 className="yn-eligible-tick" size={16} title="Not an exclusion — eligible on this criterion"/>
        )}
      </span>
      <div className={`yes-no-buttons yn-pos-${pos}`}>
        <div className="yn-thumb" aria-hidden="true" />
        <button type="button"
          className={`yn-btn yn-yes${value === "Yes" ? " yn-active" : ""}`}
          onClick={() => fire("Yes")} disabled={disabled}>YES</button>
        <button type="button"
          className={`yn-btn yn-no${value === "No" ? " yn-active" : ""}`}
          onClick={() => fire("No")} disabled={disabled}>NO</button>
      </div>
    </div>
  );
}

/* ─── MultiCheckbox ("select all that apply") ─────────────── */
function MultiCheckbox({ options, selected = [], onChange, otherValue = "", onOtherChange, disabled = false, dataField }) {
  const toggle = (opt) => {
    if (disabled) return;
    const next = selected.includes(opt)
      ? selected.filter(x => x !== opt)
      : [...selected, opt];
    onChange(next);
  };
  return (
    <div className="multi-checkbox-group" data-field={dataField}>
      {options.map(opt => (
        <label key={opt} className={`multi-check-item${disabled ? " disabled" : ""}${selected.includes(opt) ? " checked" : ""}`}>
          <input type="checkbox" checked={selected.includes(opt)}
            onChange={() => toggle(opt)} disabled={disabled} />
          <span>{opt}</span>
        </label>
      ))}
      {selected.includes("Other") && (
        <div className="multi-check-other-row">
          <input className="multi-check-other-input"
            placeholder="Please specify…"
            value={otherValue}
            onChange={e => onOtherChange && onOtherChange(e.target.value)}
            disabled={disabled} />
        </div>
      )}
    </div>
  );
}

/* Study inclusion window: 25 weeks 0 days – 31 weeks 6 days inclusive.
   Direct GA entry (best_ga_weeks) and eligibility both use this. */
const GA_MIN_WEEKS = 25;
const GA_MAX_WEEKS = 31;
const GA_MIN_TOTAL_DAYS = GA_MIN_WEEKS * 7;
const GA_MAX_TOTAL_DAYS = GA_MAX_WEEKS * 7 + 6;
const GA_NO_RECORD_MSG =
  "Gestational age is outside the study window (25 weeks 0 days to 31 weeks 6 days). No screening ID is assigned and the record is not saved.";

/* Snapshot classifier taking an explicit fd -- getEligibilityStatus()
   further below does the identical calculation but closes over the live
   formData state, which the autoSave interval callback can't safely use
   (stale-closure risk, same reason it reads formDataRef.current instead
   of formData everywhere else). Kept as a separate small function rather
   than parameterizing getEligibilityStatus so autoSave's usage doesn't
   depend on where in the component body that one happens to be defined. */
function classifyGaSnapshot(fd) {
  if (!fd) return null;
  if (!fd.best_ga_weeks && fd.best_ga_weeks !== 0) return null;
  const weeks = Number(fd.best_ga_weeks);
  const days = Number(fd.best_ga_days || 0);
  if (Number.isNaN(weeks)) return null;
  const t = weeks * 7 + days;
  if (t < GA_MIN_TOTAL_DAYS) return "low";
  if (t > GA_MAX_TOTAL_DAYS) return "high";
  return "eligible";
}

/* ─── Blank form state ────────────────────────────────────── */
const BLANK_FORM = {
  screening_id:"", screening_datetime:"",
  site_name:"", site_id:"", screened_by:"",
  /* A1 Gestation — item "1. Gestation known?" removed 2026-09-23: the
     Gestation (Inclusion Criteria) Screening Log now gates Form A entirely
     (only a Reliable, in-range gestation check ever reaches here), so
     Best Estimate weeks/days is unconditionally item 1, pre-filled when
     seeded from that log. gestation_known/ga_source columns still exist on
     the backend for historical (pre-2026-09-23) records saved via the old
     LMP/EDD-calculation path -- new saves always send gestation_known="Yes"
     and ga_source=null; see buildPayloadFrom(). */
  gestation_method:"",
  best_ga_weeks:"", best_ga_days:"",
  lmp_date:"", edd_date:"",
  /* A3 Maternal */
  mother_first_name:"", mother_surname:"",
  husband_first_name:"", husband_surname:"",
  maternal_uid:"", hospital_admission_number:"",
  mother_contact:"", husband_contact:"",
  /* A4 Exclusions */
  exclusion_anomaly:"", exclusion_anomaly_details:"",
  fetal_hydrops:"", fetal_hydrops_type:"",
  decision_forego_resus:"",
  decision_forego_resus_reasons:[],
  decision_forego_resus_reason_other:"",
  insufficient_time:"", insufficient_time_reason:"",
  iufd:"",
  /* A5 Consent */
  consent_given:"", video_pis_shown:"",
  consent_signature_image:"", consent_signature_captured_at:"",
  pi_signature_image:"", pi_signature_captured_at:"",
  relationship_to_participant:"", relationship_other:"",
  consent_taken_by:"", consent_datetime:"",
  reason_for_consent_refusal_list:[],
  reason_for_consent_refusal_other:"",
  reason_not_approached_list:[],
  reason_not_approached_other:"",
  /* internal */
  consent_form_version:"v1.0", consent_language:"English",
};

const FOREGO_REASONS         = ["Periviable","Socio-economic","Major CMF","Other"];
const REFUSAL_REASONS        = ["Fear of adverse effects","Family pressure","Not known","Other"];
const NOT_APPROACHED_REASONS = ["Nurse on leave","Parent not available","Missed screening","Other"];

/** Name of the person giving consent (patient / parent / guardian) for ICF signing. */
function consentGivenByName(fd) {
  const rel = (fd.relationship_to_participant || "").trim();
  if (rel === "Mother") {
    return [fd.mother_first_name, fd.mother_surname].filter((s) => s?.trim()).join(" ").trim();
  }
  if (rel === "Husband") {
    return [fd.husband_first_name, fd.husband_surname].filter((s) => s?.trim()).join(" ").trim();
  }
  if (rel === "Other") return (fd.relationship_other || "").trim();
  return "";
}

/** Nurse/staff name for print attestation — prefer Screened By, not login username. */
function preparedByDisplayName(fd, user) {
  const screened = (fd.screened_by || "").trim();
  if (screened && screened !== "DRAFT" && screened !== "N/A") return screened;
  const takenBy = (fd.consent_taken_by || "").trim();
  if (takenBy) return takenBy;
  return (user?.full_name || "").trim();
}

/* ════════════════════════════════════════════
   SCREENING FORM — CRF Eligibility Assessment
════════════════════════════════════════════ */
export default function ScreeningForm() {
  const navigate = useNavigate();
  const { markFormCompleted, resetProgress, fetchProgress } = useFormProgress();
  const { screeningId } = useParams();
  const { user } = useAuth();
  // Global roles (project_scientist — e.g. the nodal scientist Mannat —
  // and superadmin) can pick any site. Everyone else is confined to the
  // site on their own login and the field is locked, not just pre-filled.
  const GLOBAL_ROLES = ["project_scientist", "superadmin"];
  const isSiteLocked = !!(user && user.site && !GLOBAL_ROLES.includes(user.role));

  const [errors,           setErrors]           = useState({});
  const [isSaved,          setIsSaved]          = useState(false);
  const [isEditing,        setIsEditing]        = useState(false);
  const [isInitialLoad,    setIsInitialLoad]    = useState(true);
  const [nurses,           setNurses]           = useState([]);
  const [message,          setMessage]          = useState("");
  const [showMissingModal, setShowMissingModal] = useState(false);
  const [missingFields,    setMissingFields]    = useState([]);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [consentMessage,   setConsentMessage]   = useState("");
  const [showDraftModal,   setShowDraftModal]   = useState(false);
  const [showSaveSuccess,  setShowSaveSuccess]  = useState(false);
  const [dataLoaded,       setDataLoaded]       = useState(false);
  const [autoSaveStatus,   setAutoSaveStatus]   = useState("idle");
  const [lastSaved,        setLastSaved]        = useState(null);   // Date object
  const [isDirty,          setIsDirty]          = useState(false);  // unsaved changes
  const [isOnline,         setIsOnline]         = useState(navigator.onLine);
  const [offlineQueue,     setOfflineQueue]     = useState(false);  // pending save while offline
  const [duplicateWarn,    setDuplicateWarn]    = useState("");     // duplicate check warning
  const [fieldTouched,     setFieldTouched]     = useState({});     // which fields user has interacted with
  const autoSaveTimer  = useRef(null);
  const lastSavedTimer = useRef(null);  // for "X mins ago" refresh

  const SITE_ID_MAP = {
    "PGIMER":  "01",
    "GMCH":    "02",
    "IOG":     "03",
    "AFMC":    "04",
    "GMCH-A":  "05",
    "AMC":     "06",
  };

  /* Per-site format rules for Maternal UID (16) and Hospital Admission
     Number (17) — confirmed with the study team 2026-08-01. Sites/fields
     not listed here have no strict pattern (kept as free alphanumeric,
     required only for PGIMER/AMC maternal UID and PGIMER HAN) rather than guessing a
     format that could block a legitimate entry. */
  const idFieldRule = (site, field) => {
    if (field === "maternal_uid") {
      // PGIMER Chandigarh CR numbers are 12 digits (site-confirmed).
      if (site === "PGIMER") return { pattern: /^\d{12}$/, hint: "Must be exactly 12 digits", charFilter: /[^0-9]/g, maxLen: 12, required: true };
      if (site === "AMC")    return { pattern: /^\d+\/\d{4}$/, hint: "Must be in serial/year format, e.g. 123/2026", charFilter: /[^0-9/]/g, maxLen: 15, required: true };
      return null;
    }
    if (field === "hospital_admission_number") {
      if (site === "PGIMER") return { pattern: /^\d{10}$/, hint: "Must be exactly 10 digits", charFilter: /[^0-9]/g, maxLen: 10, required: false };
      if (site === "GMCH-A") return { pattern: /^\d{4,6}$/, hint: "Must be 4–6 digits", charFilter: /[^0-9]/g, maxLen: 6, required: false };
      if (site === "GMCH")   return { pattern: /^\d{9,11}$/, hint: "Must be 9–11 digits", charFilter: /[^0-9]/g, maxLen: 11, required: false };
      if (site === "IOG")    return { pattern: /^\d{4,6}$/, hint: "Must be 4–6 digits", charFilter: /[^0-9]/g, maxLen: 6, required: false };
      if (site === "AMC")    return { pattern: /^\d+\/\d{4}$/, hint: "Must be in serial/year format, e.g. 123/2026", charFilter: /[^0-9/]/g, maxLen: 15, required: false };
      return null;
    }
    return null;
  };

  /* Display label → internal value mapping */
  const SITE_DISPLAY = {
    "PGIMER":  "PGIMER Chandigarh",
    "GMCH":    "GMCH Chandigarh",
    "IOG":     "IOG Chennai",
    "AFMC":    "AFMC Pune",
    "GMCH-A":  "GMCH Aurangabad",
    "AMC":     "AMC Dibrugarh",
  };
  const isFieldEditable = !isSaved || isEditing;
  const today = new Date(); today.setHours(23,59,59,999);

  const [formData, setFormData] = useState({
    ...BLANK_FORM, screening_datetime: toDateTimeLocalValue(new Date()),
    ...(isSiteLocked ? { site_name: user.site, site_id: SITE_ID_MAP[user.site] || "" } : {}),
  });
  const formDataRef    = useRef(formData);
  const screeningIdRef = useRef(screeningId);
  const autoSaveRef    = useRef(null);
  const offlineQueueRef = useRef(false);
  const creatingScreeningRef = useRef(null);
  /* Set by the "seed from GA Check Log" block below when this new Form A
     was continued from a GACheckLog.jsx entry; PATCHed back and cleared
     the first time this screening is actually saved (see
     linkPendingGaCheck). Deliberately a ref, not state -- it must not
     re-trigger the new-screening init effect. */
  const pendingGaCheckIdRef = useRef(null);
  formDataRef.current = formData;
  screeningIdRef.current = screeningId;
  offlineQueueRef.current = offlineQueue;

  const linkPendingGaCheck = useCallback((sid) => {
    const gaCheckId = pendingGaCheckIdRef.current;
    if (!gaCheckId || !sid) return;
    pendingGaCheckIdRef.current = null;
    api.patch(`/ga-check/${gaCheckId}/link`, { screening_id: sid }).catch((err) => {
      console.error("GA check link-back failed:", err.message);
    });
  }, []);

  /* ─── Load ── */
  useEffect(() => {
    if (screeningId && screeningId !== "undefined" && screeningId !== "null") {
      loadScreeningData(screeningId); return;
    }
    // No screeningId in the URL means this is a genuinely new screening —
    // always start blank. Previously this fell back to whatever
    // screening_id happened to be cached in localStorage from the last
    // record viewed anywhere in the app, silently reopening (and letting
    // the nurse unknowingly re-submit/overwrite) a completely different,
    // possibly already-saved patient's screening.
    localStorage.removeItem("current_screening_id");
    localStorage.removeItem("current_enrollment_id");

    /* A brand-new Form A can carry a seed forward from the GA Check Log
       (GACheckLog.jsx "Continue to Form A") -- name/UID/GA already
       captured at triage, no need to retype it. Consumed once: the seed
       is cleared here so a later, unrelated new Form A never inherits a
       stale patient's data. The link back to the GA check entry itself
       (so it stops showing as an uncontinued gap) happens once this
       screening is actually saved -- see linkPendingGaCheck() below. */
    let seedFields = {};
    try {
      const raw = localStorage.getItem("ga_check_seed");
      if (raw) {
        const seed = JSON.parse(raw);
        const [first = "", ...rest] = (seed.mother_name || "").trim().split(/\s+/);
        seedFields = {
          mother_first_name: first,
          mother_surname: rest.join(" "),
          maternal_uid: seed.mother_uid || "",
          best_ga_weeks: seed.gestation_weeks ?? "",
          best_ga_days: seed.gestation_days ?? "",
          gestation_method: seed.gestation_method || "",
        };
        pendingGaCheckIdRef.current = seed.id ?? null;
      }
    } catch { /* malformed/absent seed -- ignore, start blank as normal */ }
    localStorage.removeItem("ga_check_seed");

    setFormData({ ...BLANK_FORM, screening_datetime: toDateTimeLocalValue(new Date()), ...seedFields });
    setIsSaved(false); setIsEditing(false); setDataLoaded(true);
    resetProgress();
  }, [screeningId]); // eslint-disable-line

  const loadScreeningData = useCallback(async (id) => {
    try {
      const res = await api.get(`/screenings/by-screening-id/${id}`);
      const d = res.data;
      if (!d) {
        setMessage("⚠️ Screening record not found for this ID.");
        setDataLoaded(true);
        return;
      }
      let pii = {};
      try { const r = await api.get(`/pii/screening/${id}`); pii = r.data || {}; }
      catch {
        const eid = d.enrollment_id || localStorage.getItem("current_enrollment_id");
        if (eid && eid !== "undefined" && eid !== "null") {
          try { const r2 = await api.get(`/pii/enrollment/${eid}`); pii = r2.data || {}; } catch {}
        }
      }

      const forgoList  = (d.decision_forego_resuscitation_reason || d.decision_forego_resus_reason || "")
        ? (d.decision_forego_resuscitation_reason || d.decision_forego_resus_reason).split(",").map(s=>s.trim()).filter(Boolean) : [];
      const refuseList = d.reason_for_consent_refusal
        ? d.reason_for_consent_refusal.split(",").map(s=>s.trim()).filter(Boolean) : [];
      const notApprList = d.reason_not_approached
        ? d.reason_not_approached.split(",").map(s=>s.trim()).filter(Boolean) : [];

      /* Drop any identity keys from the clinical payload so a future API
         change can't overwrite the PII-store values into the wrong boxes. */
      const {
        mother_first_name: _mf, mother_surname: _ms,
        husband_first_name: _hf, husband_surname: _hs,
        maternal_uid: _mu, hospital_admission_number: _han,
        mother_contact: _mc, husband_contact: _hc,
        ...clinical
      } = d || {};

      setFormData(() => ({
        ...BLANK_FORM, ...clinical,
        screening_datetime: normalizeDateTimeLocalString(d.screening_datetime || clinical.screening_datetime || ""),
        /* Identity fields come ONLY from participant_pii. Strip autosave
           "DRAFT" placeholders so they never reappear as real names. */
        mother_first_name:         (pii.mother_first_name && pii.mother_first_name !== "DRAFT") ? pii.mother_first_name : "",
        mother_surname:            pii.mother_surname || "",
        husband_first_name:        (pii.husband_first_name && pii.husband_first_name !== "DRAFT") ? pii.husband_first_name : "",
        husband_surname:           pii.husband_surname || "",
        maternal_uid:              pii.maternal_uid || "",
        hospital_admission_number: pii.hospital_admission_number || "",
        mother_contact:            pii.mother_contact || "",
        husband_contact:           pii.husband_contact || "",
        /* Best Estimate weeks/days is now unconditional item 1 (2026-09-23
           removal of "Gestation known?") — always populated from the
           saved gestation_weeks/days regardless of whether this record
           was originally saved via the current direct-entry path or the
           older LMP/EDD-calculation path (removed from the UI, but
           historical records still have their computed value sitting in
           these same two columns). gestation_method stays blank for a
           historical record that never had one — informational only, no
           longer required to reopen/view an old record. */
        best_ga_weeks:      d.gestation_weeks ?? "",
        best_ga_days:       d.gestation_days  ?? "",
        gestation_method:   d.gestation_method || "",
        /* Prefer EDD derived from LMP so a stale expected_delivery_date cannot skew GA. */
        edd_date:           (() => {
          const lmp = d.lmp_date || "";
          const fromLmp = lmp ? eddFromLmp(lmp) : "";
          if (fromLmp) return fromLmp;
          return d.expected_delivery_date ? String(d.expected_delivery_date).slice(0, 10) : "";
        })(),
        lmp_date:           d.lmp_date ? String(d.lmp_date).slice(0, 10) : "",
        /* A4 exclusion fields — inline ternary avoids const-in-object error.
           (d.exclusion_present != null) means record was saved before → unanswered = "No".
           If never saved → "" so toggles show as unanswered.                              */
        exclusion_anomaly:     d.exclusion_reasons?.includes("Structural anomaly")   ? "Yes" : (d.exclusion_present != null) ? "No" : "",
        exclusion_anomaly_details: d.exclusion_anomaly_details || d.major_structural_anomalies_if_yes || "",
        fetal_hydrops:         d.exclusion_reasons?.includes("Fetal hydrops")        ? "Yes" : (d.exclusion_present != null) ? "No" : "",
        fetal_hydrops_type:    d.fetal_hydrops_type || d.fetal_hydrops || "",
        decision_forego_resus: d.exclusion_reasons?.includes("Forego resuscitation") ? "Yes" : (d.exclusion_present != null) ? "No" : "",
        decision_forego_resus_reasons: forgoList,
        decision_forego_resus_reason_other: forgoList.includes("Other")
          ? (d.decision_forego_resuscitation_reason_other || d.decision_forego_resus_reason_other || "") : "",
        insufficient_time:     d.exclusion_reasons?.includes("Insufficient time")    ? "Yes" : (d.exclusion_present != null) ? "No" : "",
        insufficient_time_reason: d.insufficient_time_reason || d.reason_for_insufficient_time || "",
        iufd:                  d.exclusion_reasons?.includes("IUFD")                 ? "Yes" : (d.exclusion_present != null) ? "No" : "",
        consent_given:            d.consent_given              || "",
        consent_taken_by:         d.consent_taken_by           || "",
        consent_datetime:         d.consent_datetime ? normalizeDateTimeLocalString(d.consent_datetime) : "",
        consent_form_version:     d.consent_form_version       || "v1.0",
        consent_language:         d.consent_language           || "English",
        relationship_to_participant: d.relationship_to_participant || "",
        relationship_other:       d.relationship_other         || "",
        reason_for_consent_refusal_list:  refuseList,
        reason_for_consent_refusal_other: refuseList.includes("Other") ? (d.reason_for_consent_refusal_other||"") : "",
        reason_not_approached_list:       notApprList,
        reason_not_approached_other:      notApprList.includes("Other") ? (d.reason_not_approached_other||"") : "",
        video_pis_shown:          d.video_pis_shown            || "",
        ...(() => {
          const sig = resolveConsentSignatureFromRecord(d);
          const piSig = resolvePiSignatureFromRecord(d);
          return {
            consent_signature_image: sig.image,
            consent_signature_captured_at: sig.capturedAt
              ? String(sig.capturedAt).slice(0, 16)
              : "",
            pi_signature_image: piSig.image,
            pi_signature_captured_at: piSig.capturedAt
              ? String(piSig.capturedAt).slice(0, 16)
              : "",
          };
        })(),
      }));

      if (d.screening_id) localStorage.setItem("current_screening_id", d.screening_id);
      else localStorage.removeItem("current_screening_id");
      // Drop a previous patient's enrollment_id so the sidebar does not keep
      // showing their Form B/C/D as complete on this (possibly A-only) record.
      // Ignore typing stubs like "01-" left by Form B.
      if (isUsableEnrollmentId(d.enrollment_id)) {
        localStorage.setItem("current_enrollment_id", d.enrollment_id);
      } else {
        localStorage.removeItem("current_enrollment_id");
      }

      // Clear stale locks from another patient when THIS screening is eligible
      // and consented. Keep no_ppv only if enrollment-status later re-applies it.
      const consentOk = d.consent_given === "Yes" || d.consent_given === "Trial run";
      const weeks = d.gestation_weeks;
      const days = d.gestation_days ?? 0;
      let gaOut = false;
      if (weeks != null && weeks !== "") {
        const t = Number(weeks) * 7 + Number(days || 0);
        gaOut = t < 25 * 7 || t > 31 * 7 + 6;
      } else if (d.gestation_known === "No" && d.ga_source === "Neither") {
        gaOut = true;
      }
      const shouldLock =
        d.screening_status === "Screen Failure" ||
        gaOut ||
        !!d.exclusion_present ||
        (d.consent_given && !consentOk);
      if (shouldLock) {
        localStorage.setItem("enrollment_locked", "true");
        if (gaOut || d.screening_status === "Screen Failure") {
          localStorage.setItem(
            "enrollment_lock_reason",
            (d.gestation_known === "No" && d.ga_source === "Neither") ? "ga_unknown" : "ga_out_of_range"
          );
        } else if (d.exclusion_present) {
          localStorage.setItem("enrollment_lock_reason", "exclusion");
        } else {
          localStorage.setItem("enrollment_lock_reason", "consent");
        }
      } else {
        localStorage.removeItem("enrollment_locked");
        localStorage.removeItem("enrollment_lock_reason");
      }

      window.dispatchEvent(new Event("storage"));
      if (isUsableEnrollmentId(d.enrollment_id)) {
        fetchProgress(d.enrollment_id);
      }

      /* If A4 exclusions not fully answered, load in editing mode so nurse can continue */
      const exclusionAnswered = (label) =>
        d.exclusion_reasons?.includes(label) || d.exclusion_present != null;
      const a4Complete  = [
        "Structural anomaly", "Fetal hydrops", "Forego resuscitation", "Insufficient time", "IUFD",
      ].every(exclusionAnswered);
      const consentDone = !!d.consent_given;
      const videosDone  = !!d.video_pis_shown;
      const fullyDone   = a4Complete && consentDone && videosDone;

      const explicitlySaved = !!d.explicitly_saved;
      setIsSaved(explicitlySaved);
      setIsEditing(!explicitlySaved || !fullyDone); // drafts stay editable; explicit saves reopen read-only unless incomplete
      setIsInitialLoad(false);
      setDataLoaded(true);
    } catch (err) {
      if (err?.response?.status !== 404) setMessage("⚠️ Could not load saved data.");
      setDataLoaded(true);
    }
  }, [fetchProgress]); // eslint-disable-line


  /* ─── Online / Offline detection ── */
  useEffect(() => {
    const goOnline  = () => {
      setIsOnline(true);
      // If we had a queued save, flush it now (autoSave read via ref to
      // avoid referencing the const before it is initialized).
      if (offlineQueueRef.current) {
        setOfflineQueue(false);
        autoSaveRef.current?.();
      }
    };
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online",  goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online",  goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []); // eslint-disable-line

  /* ─── Unsaved changes — warn on tab close / navigate away ── */
  useEffect(() => {
    const handler = e => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  /* ─── Mark form dirty only after user edits (not on initial load / readonly) ── */
  const isInitialRender = useRef(true);
  useEffect(() => {
    if (!dataLoaded) {
      isInitialRender.current = true;
      return;
    }
    if (isInitialRender.current) { isInitialRender.current = false; return; }
    if (isSaved && !isEditing) return;
    setIsDirty(true);
  }, [formData, dataLoaded, isSaved, isEditing]); // eslint-disable-line

  /* ─── Refresh "last saved X mins ago" every 30 seconds ── */
  useEffect(() => {
    lastSavedTimer.current = setInterval(() => {
      // force re-render to update the relative time string
      setLastSaved(prev => prev ? new Date(prev) : prev);
    }, 30000);
    return () => clearInterval(lastSavedTimer.current);
  }, []);

  /* ─── Duplicate check: same mother name + site ── */
  useEffect(() => {
    if (!formData.mother_first_name || !formData.site_name || !dataLoaded) return;
    const tid = setTimeout(async () => {
      try {
        const res = await api.get("/screenings/?limit=500");
        const existing = res.data.filter(e =>
          e.id !== formData.id &&
          e.site_name === formData.site_name &&
          (e.mother_first_name || "").toLowerCase() === formData.mother_first_name.toLowerCase()
        );
        if (existing.length > 0) {
          setDuplicateWarn(
            `⚠️ A participant named "${formData.mother_first_name}" already exists at ${formData.site_name} (${existing[0].screening_id}). Please verify this is not a duplicate.`
          );
        } else {
          setDuplicateWarn("");
        }
      } catch {}
    }, 800);
    return () => clearTimeout(tid);
  }, [formData.mother_first_name, formData.site_name, dataLoaded]); // eslint-disable-line

  /* ─── Nurse dropdown ── */
  useEffect(() => {
    if (!formData.site_name) { setNurses([]); return; }
    api.get(`/sites/${formData.site_name}/screeners`)
      .then(r => setNurses((r.data || []).map(n =>
        String(n).replace(/^\s*dr\.?\s+/i, "").trim()
      ))).catch(() => setNurses([]));
  }, [formData.site_name]);

  /* ─── Principal Investigator name for this site (print footer) ── */
  const [piName, setPiName] = useState("");
  useEffect(() => {
    if (!formData.site_name) { setPiName(""); return; }
    api.get(`/sites/${formData.site_name}/pi-name`)
      .then(r => setPiName(r.data?.pi_name || "")).catch(() => setPiName(""));
  }, [formData.site_name]);

  /* ─── Auto-fill Site + Site ID for the logged-in nurse's site ──
     This used to be set only once, inline in the initial useState()
     default for formData. That's not reliable: it depends on `user`
     (from AuthContext) already being populated on ScreeningForm's very
     first render, and testing this live showed isSiteLocked can still
     be false at that exact moment (e.g. right after a full page
     load/refresh) — leaving site_name permanently empty even though
     isSiteLocked correctly flips true moments later, since nothing
     re-applies the value afterward. Making it reactive, mirroring the
     screened_by effect below, fixes that regardless of first-render
     timing. */
  useEffect(() => {
    if (!isSiteLocked || !user?.site) return;
    if (screeningId && screeningId !== "undefined" && screeningId !== "null") return; // don't touch an existing record's saved site
    if (formData.site_name) return;
    setFormData(prev => prev.site_name
      ? prev
      : { ...prev, site_name: user.site, site_id: SITE_ID_MAP[user.site] || "" });
  }, [isSiteLocked, user, screeningId, formData.site_name]);

  /* ─── Auto-fill "Screened by" with the logged-in nurse's own name ──
     Only when: this is a fresh/unsaved form (not editing an existing
     screening someone else filled), the field is still empty, and the
     nurses list for this site has loaded and actually contains their
     name (SiteStaff.name must match users.full_name for this to work —
     if a nurse's account was seeded with a different name string than
     their SiteStaff entry, this intentionally won't force a mismatched
     value into the field). */
  useEffect(() => {
    if (!isSiteLocked) return;
    if (screeningId && screeningId !== "undefined" && screeningId !== "null") return;
    if (formData.screened_by) return;
    if (!user?.full_name || !nurses.length) return;
    const target = String(user.full_name).trim().toLowerCase();
    const match = nurses.find(n => String(n).trim().toLowerCase() === target);
    if (!match) return;
    setFormData(prev => prev.screened_by ? prev : { ...prev, screened_by: match });
  }, [nurses, isSiteLocked, user, screeningId, formData.screened_by]);

  /* ─── LMP → EDD auto-calc (always overwrite from LMP so EDD cannot go stale) ──
     Only Method === "LMP" can still show/need this since "Gestation known?"
     and its LMP/EDD-calculation fallback path were removed 2026-09-23. */
  useEffect(() => {
    if (!formData.lmp_date || !dataLoaded) return;
    if (formData.gestation_method !== "LMP") return;
    const edd = eddFromLmp(formData.lmp_date);
    if (!edd || edd === formData.edd_date) return;
    setFormData(p => ({ ...p, edd_date: edd }));
  }, [formData.lmp_date, formData.gestation_method, dataLoaded]); // eslint-disable-line

  const getEligibilityStatus = () => {
    if (!formData.best_ga_weeks && formData.best_ga_weeks !== 0) return null;
    const weeks = Number(formData.best_ga_weeks);
    const days = Number(formData.best_ga_days || 0);
    if (isNaN(weeks)) return null;
    const t = weeks * 7 + days;
    /* Eligible window: 25w0d – 31w6d inclusive */
    if (t < GA_MIN_TOTAL_DAYS) return "low";
    if (t > GA_MAX_TOTAL_DAYS) return "high";
    return "eligible";
  };
  const eligibilityStatus     = getEligibilityStatus();
  const isNotEligible         = eligibilityStatus === "high" || eligibilityStatus === "low";
  const endParticipation      = isNotEligible;

  /* Lock Form B+ when GA is outside 25w0d–31w6d.
     Form A stays available so nurses can correct the record. */
  useEffect(() => {
    if (!dataLoaded) return;
    if (isNotEligible) {
      localStorage.setItem("enrollment_locked", "true");
      localStorage.setItem("enrollment_lock_reason", "ga_out_of_range");
      window.dispatchEvent(new Event("storage"));
    } else if (eligibilityStatus === "eligible") {
      /* Eligible + consented: clear stale locks from another patient / GA.
         Sidebar re-applies no_ppv from THIS enrollment's birth row if needed. */
      const consentOk =
        formData.consent_given === "Yes" ||
        formData.consent_given === "Trial run" ||
        !formData.consent_given;
      const reason = localStorage.getItem("enrollment_lock_reason");
      if (consentOk && reason !== "no_ppv") {
        localStorage.removeItem("enrollment_lock_reason");
        localStorage.removeItem("enrollment_locked");
        window.dispatchEvent(new Event("storage"));
      } else if (reason === "ga_out_of_range" || reason === "ga_unknown") {
        localStorage.removeItem("enrollment_lock_reason");
        if (consentOk) {
          localStorage.removeItem("enrollment_locked");
          window.dispatchEvent(new Event("storage"));
        }
      }
    }
  }, [dataLoaded, isNotEligible, eligibilityStatus, formData.consent_given]);

  const gestationPathComplete = formData.best_ga_weeks !== "" && formData.best_ga_weeks != null;
  const anyExclusionYes = ["exclusion_anomaly","fetal_hydrops","decision_forego_resus","iufd","insufficient_time"]
    .some(k => formData[k] === "Yes");
  const allExclusionAnswered = ["exclusion_anomaly","fetal_hydrops","decision_forego_resus","iufd","insufficient_time"]
    .every(k => formData[k] === "Yes" || formData[k] === "No");
  const displayWeeks = formData.best_ga_weeks;
  const displayDays  = formData.best_ga_days === "" || formData.best_ga_days === null || formData.best_ga_days === undefined
    ? 0
    : formData.best_ga_days;
  const hasDisplayGa = (() => {
    if (displayWeeks === "" || displayWeeks === null || displayWeeks === undefined) return false;
    const n = Number(displayWeeks);
    return !Number.isNaN(n);
  })();

  /* ─── Field-level change handler ── */
  const set = (patch) => setFormData(p => ({ ...p, ...patch }));

  const handleChange = e => {
    const { name, value } = e.target;
    const newErrors = { ...errors };

    /* Name fields: allow letters (any language), spaces, apostrophe, hyphen, period.
       The old /[^a-zA-Z ]/ filter stripped Indian-script and accented names to "" —
       so Husband's First Name looked filled but stayed empty → required popup. */
    if (["screened_by","mother_first_name","mother_surname","husband_first_name","husband_surname"].includes(name)) {
      const cleaned = value.replace(/[^\p{L}\s.'-]/gu, "");
      set({ [name]: cleaned });
      if (cleaned.trim()) {
        setErrors(prev => ({ ...prev, [name]: "" }));
        setFieldTouched(prev => ({ ...prev, [name]: true }));
      }
      return;
    }
    if (name === "site_name")          { set({ site_name:value, site_id:SITE_ID_MAP[value]||"", screened_by:"" }); return; }
    if (name === "gestation_method")   { set({ gestation_method:value, lmp_date:"", edd_date:"" }); return; }
    if (name === "exclusion_anomaly")  { set({ exclusion_anomaly:value, exclusion_anomaly_details: value==="Yes" ? formData.exclusion_anomaly_details : "" }); return; }
    if (name === "fetal_hydrops")      { set({ fetal_hydrops:value, fetal_hydrops_type: value==="Yes" ? formData.fetal_hydrops_type : "" }); return; }
    if (name === "decision_forego_resus") { set({ decision_forego_resus:value, decision_forego_resus_reasons: value==="Yes" ? formData.decision_forego_resus_reasons : [] }); return; }
    if (name === "insufficient_time")  { set({ insufficient_time:value, insufficient_time_reason: value==="Yes" ? formData.insufficient_time_reason : "" }); return; }
    if (name === "consent_given") {
      const needsAttest = value === "Yes" || value === "No" || value === "Trial run";
      const dt = needsAttest ? new Date().toISOString().slice(0, 16) : "";
      if (!isInitialLoad && formData.consent_given !== value) {
        set({
          consent_given:value,
          consent_taken_by:"",
          consent_datetime: dt,
          relationship_to_participant:"",
          relationship_other:"",
          reason_for_consent_refusal_list:[],
          reason_for_consent_refusal_other:"",
          reason_not_approached_list:[],
          reason_not_approached_other:"",
          consent_signature_image:"",
          consent_signature_captured_at:"",
          pi_signature_image:"",
          pi_signature_captured_at:"",
        });
      } else {
        set({
          consent_given:value,
          ...(needsAttest && !formData.consent_datetime ? { consent_datetime: dt } : {}),
        });
      }
      return;
    }
    if (name === "maternal_uid") {
      // Site-specific formats:
      //   PGIMER: exactly 12 digits, numeric only
      //   AMC:    serial/year, e.g. "123/2026"
      //   GMCH / GMCH-A / IOG / AFMC: optional free alphanumeric if provided
      const rule = idFieldRule(formData.site_name, "maternal_uid");
      const filtered = rule ? value.replace(rule.charFilter, "") : value.replace(/[^a-zA-Z0-9/]/g, "");
      const capped = rule ? filtered.slice(0, rule.maxLen) : filtered;
      set({ maternal_uid: capped });
      if (capped.trim()) {
        const ok = !rule || rule.pattern.test(capped.trim());
        setErrors(prev => ({ ...prev, maternal_uid: ok ? "" : (rule?.hint || "") }));
      }
      return;
    }
    if (name === "hospital_admission_number") {
      // Site-specific formats (confirmed 2026-08-01):
      //   PGIMER: required, exactly 10 digits
      //   GMCH-A: optional, 4–6 digit MRD number if provided
      //   GMCH:   optional, 9–11 digits if provided
      //   IOG:    optional, 4–6 digits if provided
      //   AMC:    optional, serial/year if provided (e.g. "123/2026")
      const rule = idFieldRule(formData.site_name, "hospital_admission_number");
      const filtered = rule ? value.replace(rule.charFilter, "") : value.replace(/[^a-zA-Z0-9/]/g, "");
      const capped = filtered.slice(0, rule ? rule.maxLen : 15);
      set({ hospital_admission_number: capped });
      return;
    }

    /* GA range validation */
    if (name === "best_ga_weeks") {
      const n = parseInt(value);
      newErrors.best_ga_weeks = value && (n < GA_MIN_WEEKS || n > GA_MAX_WEEKS)
        ? "Must be 25 weeks 0 days to 31 weeks 6 days"
        : "";
      setErrors(newErrors);
    }
    if (name === "best_ga_days") {
      const n = parseInt(value);
      newErrors.best_ga_days = value && (n < 0 || n > 6) ? "Must be 0–6 days" : "";
      setErrors(newErrors);
    }

    set({ [name]: value });
  };

  const handleContact = (e, field) => {
    const v = e.target.value.replace(/\D/g, "");
    set({ [field]: v });
    setFieldTouched(p => ({ ...p, [field]: true }));
    let err = "";
    if (v.length > 0 && v.length !== 10)       err = "Must be exactly 10 digits";
    else if (v.length === 10 && !/^[6-9]/.test(v)) err = "Indian mobile must start with 6, 7, 8, or 9";
    setErrors(p => ({ ...p, [field]: err }));
  };

  /* ─── Inline field validation on blur ── */
  const handleBlur = (e) => {
    const { name, value } = e.target;
    setFieldTouched(p => ({ ...p, [name]: true }));
    const newErrors = { ...errors };
    if (name === "best_ga_weeks") {
      const n = parseInt(value);
      newErrors.best_ga_weeks = value && (n < GA_MIN_WEEKS || n > GA_MAX_WEEKS)
        ? "Must be 25 weeks 0 days to 31 weeks 6 days"
        : "";
    }
    if (name === "best_ga_days") {
      const n = parseInt(value);
      newErrors.best_ga_days = value && (n < 0 || n > 6) ? "Must be between 0 and 6 days" : "";
    }
    if (name === "mother_contact" || name === "husband_contact") {
      if (value && value.length !== 10)          newErrors[name] = "Must be exactly 10 digits";
      else if (value && !/^[6-9]/.test(value))   newErrors[name] = "Indian mobile must start with 6, 7, 8, or 9";
      else                                        newErrors[name] = "";
    }
    if (name === "mother_first_name" && !value.trim()) newErrors.mother_first_name = "Required";
    if (name === "husband_first_name" && !value.trim()) newErrors.husband_first_name = "Required";
    if (name === "maternal_uid") {
      const rule = idFieldRule(formData.site_name, "maternal_uid");
      if (!value.trim()) {
        newErrors.maternal_uid = rule?.required ? "Required" : "";
      } else {
        newErrors.maternal_uid = rule && !rule.pattern.test(value.trim()) ? rule.hint : "";
      }
    }
    if (name === "hospital_admission_number") {
      const rule = idFieldRule(formData.site_name, "hospital_admission_number");
      if (!value.trim()) {
        newErrors.hospital_admission_number = (rule && rule.required) ? "Required" : "";
      } else {
        newErrors.hospital_admission_number = rule && !rule.pattern.test(value.trim()) ? rule.hint : "";
      }
    }
    setErrors(newErrors);
  };

  /* ─── Validation ──
     Required fields follow what's currently visible, not a static list.
     Eligible window is 25w0d–31w6d. Outside that (or GA undeterminable)
     A2–A5 are hidden, so Save must not demand their contents. */
  const validate = () => {
    const m = [];
    const add = (label, fieldName) => m.push({ label, fieldName });

    if (!formData.best_ga_weeks && formData.best_ga_weeks !== 0)
                                       add("Best estimate GA — weeks (A1)",      "best_ga_weeks");
    else {
      const n = parseInt(formData.best_ga_weeks, 10);
      if (Number.isFinite(n) && (n < GA_MIN_WEEKS || n > GA_MAX_WEEKS))
        add("Best estimate GA — weeks must be 25w0d–31w6d (A1)", "best_ga_weeks");
    }
    if (formData.best_ga_days === "")  add("Best estimate GA — days (A1)",       "best_ga_days");
    if (!formData.gestation_method)    add("Method of gestation assessment (A1)","gestation_method");
    if (formData.gestation_method === "LMP" && !formData.lmp_date) add("LMP date (A1)", "lmp_date");

    const elig = getEligibilityStatus();
    const gaOutOfRange = elig === "high" || elig === "low";
    const pathComplete = formData.best_ga_weeks !== "" && formData.best_ga_weeks != null;
    const a2a5Visible = pathComplete && !gaOutOfRange;
    if (!a2a5Visible) return m;

    if (!formData.screening_datetime)    add("Screening Date & Time (A2)",        "screening_datetime");
    if (!formData.site_name)             add("Site (A2)",                          "site_name");
    if (!formData.screened_by?.trim())   add("Screened By (A2)",                   "screened_by");
    if (!formData.mother_first_name?.trim())  add("Mother's First Name (A3)",     "mother_first_name");
    if (!formData.husband_first_name?.trim()) add("Husband's First Name (A3)",    "husband_first_name");
    {
      const uidRule = idFieldRule(formData.site_name, "maternal_uid");
      const uidValue = formData.maternal_uid?.trim();
      if (uidRule?.required && !uidValue) {
        add("Maternal UID / CR Number (A3)", "maternal_uid");
      } else if (uidValue && uidRule && !uidRule.pattern.test(uidValue)) {
        add(`Maternal UID — ${uidRule.hint} (A3)`, "maternal_uid");
      }
    }
    {
      const hanRule = idFieldRule(formData.site_name, "hospital_admission_number");
      const hanValue = formData.hospital_admission_number?.trim();
      if (hanRule?.required && !hanValue) {
        add("Hospital Admission Number (A3)", "hospital_admission_number");
      } else if (hanValue && hanRule && !hanRule.pattern.test(hanValue)) {
        add(`Hospital Admission Number — ${hanRule.hint} (A3)`, "hospital_admission_number");
      }
    }
    if (!formData.mother_contact)        add("Mother's Mobile Number (A3)",        "mother_contact");
    else if (formData.mother_contact.length !== 10) add("Mother's Mobile — must be 10 digits (A3)", "mother_contact");
    else if (!/^[6-9]/.test(formData.mother_contact)) add("Mother's Mobile — Indian mobile must start with 6, 7, 8, or 9 (A3)", "mother_contact");
    if (!formData.husband_contact)       add("Husband's Mobile Number (A3)",       "husband_contact");
    else if (formData.husband_contact.length !== 10) add("Husband's Mobile — must be 10 digits (A3)", "husband_contact");
    else if (!/^[6-9]/.test(formData.husband_contact)) add("Husband's Mobile — Indian mobile must start with 6, 7, 8, or 9 (A3)", "husband_contact");
    if (!formData.exclusion_anomaly)     add("Structural Anomaly? (A4)",           "exclusion_anomaly");
    else if (formData.exclusion_anomaly === "Yes" && !formData.exclusion_anomaly_details)
      add("Specify structural anomaly (A4)",                                        "exclusion_anomaly_details");
    if (!formData.fetal_hydrops)         add("Fetal Hydrops? (A4)",                "fetal_hydrops");
    else if (formData.fetal_hydrops === "Yes" && !formData.fetal_hydrops_type)
      add("Fetal hydrops type (A4)",                                                "fetal_hydrops_type");
    if (!formData.decision_forego_resus) add("Decision to forego resuscitation? (A4)", "decision_forego_resus");
    else if (formData.decision_forego_resus === "Yes" && formData.decision_forego_resus_reasons.length === 0)
      add("Reason to forego resuscitation — select at least one (A4)",             "decision_forego_resus");
    else if (formData.decision_forego_resus === "Yes"
        && formData.decision_forego_resus_reasons.includes("Other")
        && !formData.decision_forego_resus_reason_other?.trim())
      add("Specify other reason to forego resuscitation (A4)",                     "decision_forego_resus");
    if (!formData.insufficient_time)     add("Insufficient time for consent? (A4)","insufficient_time");
    else if (formData.insufficient_time === "Yes" && !formData.insufficient_time_reason)
      add("Specify reason for insufficient time (A4)",                             "insufficient_time_reason");
    if (!formData.iufd)                  add("IUFD? (A4)",                         "iufd");

    /* Recompute exclusion flag inside validate to avoid stale closure */
    const hasExclusion = ["exclusion_anomaly","fetal_hydrops","decision_forego_resus","iufd","insufficient_time"]
      .some(k => formData[k] === "Yes");

    if (!hasExclusion) {
      if (!formData.consent_given)       add("Consent (A5)",                       "consent_given");
      if (formData.consent_given === "Yes" || formData.consent_given === "No" || formData.consent_given === "Trial run") {
        if (!formData.relationship_to_participant) add("Consent obtained from (A5)", "relationship_to_participant");
        if (formData.relationship_to_participant === "Other" && !formData.relationship_other?.trim())
          add("Specify relationship (A5)",                                         "relationship_other");
        if (!formData.consent_taken_by)            add("Consent obtained by nurse (A5)", "consent_taken_by");
      }
      if (formData.consent_given === "No" && formData.reason_for_consent_refusal_list.length === 0)
        add("Reason for consent refusal — select at least one (A5)",               "reason_for_consent_refusal_list");
      else if (formData.consent_given === "No"
          && formData.reason_for_consent_refusal_list.includes("Other")
          && !formData.reason_for_consent_refusal_other?.trim())
        add("Specify other reason for consent refusal (A5)",                       "reason_for_consent_refusal_list");
      if (formData.consent_given === "Not approached" && formData.reason_not_approached_list.length === 0)
        add("Reason not approached — select at least one (A5)",                    "reason_not_approached_list");
      else if (formData.consent_given === "Not approached"
          && formData.reason_not_approached_list.includes("Other")
          && !formData.reason_not_approached_other?.trim())
        add("Specify other reason not approached (A5)",                            "reason_not_approached_list");
      /* Video PIS required whenever any consent value is selected */
      if (formData.consent_given && !formData.video_pis_shown)
        add("Video PIS shown? (A5)",                                               "video_pis_shown");
      if (formData.consent_given === "Yes" || formData.consent_given === "No" || formData.consent_given === "Trial run") {
        if (!formData.consent_signature_image) add("Consent signature (A5)", "consent_signature_image");
      }
    }
    return m;
  };

  /* ─── Scroll to first error field ── */
  const scrollToFirstError = (missing) => {
    if (!missing || missing.length === 0) return;
    const fieldName = missing[0].fieldName;
    const el = document.querySelector(
      `[name="${fieldName}"], #${fieldName}, [data-field="${fieldName}"]`
    );
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => el.focus?.(), 400);
    }
  };

  /* ─── Shared payload builder (used by saveForm, saveDraft, autoSave) ── */
  const buildPayloadFrom = (fd, useDraftFallbacks, exclYes, explicitlySaved = false) => {
    const exclusionParts = [];
    if (fd.exclusion_anomaly     === "Yes") exclusionParts.push("Structural anomaly");
    if (fd.fetal_hydrops         === "Yes") exclusionParts.push("Fetal hydrops");
    if (fd.decision_forego_resus === "Yes") exclusionParts.push("Forego resuscitation");
    if (fd.insufficient_time     === "Yes") exclusionParts.push("Insufficient time");
    if (fd.iufd                  === "Yes") exclusionParts.push("IUFD");

    const eddForSave =
      fd.gestation_method === "LMP" && fd.lmp_date
        ? (eddFromLmp(fd.lmp_date) || (fd.edd_date ? String(fd.edd_date).slice(0, 10) : null))
        : (fd.edd_date ? String(fd.edd_date).slice(0, 10) : null);

    return {
      screening_id:              fd.screening_id    || undefined,
      screening_datetime:        normalizeDateTimeLocalString(fd.screening_datetime)
        || (useDraftFallbacks ? toDateTimeLocalValue(new Date()) : null),
      site_name:                 fd.site_name        || (useDraftFallbacks ? "DRAFT" : null),
      site_id:                   fd.site_id          || (useDraftFallbacks ? "00"    : null),
      screened_by:               fd.screened_by      || (useDraftFallbacks ? "DRAFT" : ""),
      mother_first_name:         fd.mother_first_name || (useDraftFallbacks ? "DRAFT" : ""),
      mother_surname:            fd.mother_surname ?? "",
      husband_first_name:        fd.husband_first_name || (useDraftFallbacks ? "DRAFT" : ""),
      husband_surname:           fd.husband_surname ?? "",
      maternal_uid:              fd.maternal_uid ?? "",
      hospital_admission_number: fd.hospital_admission_number ?? "",
      mother_contact:            fd.mother_contact ?? "",
      husband_contact:           fd.husband_contact ?? "",
      /* gestation_known/ga_source columns are historical (pre-2026-09-23
         LMP/EDD-calculation path, removed from the UI) — new saves always
         write "Yes"/null so any backend logic still keyed on them (e.g.
         compute_screening_status) keeps treating every new record as a
         direct-entry one, which it now always is. */
      gestation_known:           "Yes",
      gestation_weeks:           parseInt(fd.best_ga_weeks) || 0,
      gestation_days:            parseInt(fd.best_ga_days) || 0,
      gestation_method:          fd.gestation_method || null,
      lmp_date:                  fd.lmp_date ? String(fd.lmp_date).slice(0, 10) : null,
      expected_delivery_date:    eddForSave,
      ga_source:                 null,
      exclusion_present:         exclYes,
      exclusion_reasons:         exclusionParts.join(", ") || null,
      major_structural_anomalies_if_yes: fd.exclusion_anomaly === "Yes" ? (fd.exclusion_anomaly_details || null) : null,
      fetal_hydrops:             fd.fetal_hydrops === "Yes" ? (fd.fetal_hydrops_type || null) : null,
      decision_forego_resuscitation_reason: fd.decision_forego_resus === "Yes" && fd.decision_forego_resus_reasons.length > 0
        ? fd.decision_forego_resus_reasons.join(", ") : null,
      decision_forego_resuscitation_reason_other: fd.decision_forego_resus_reason_other || null,
      reason_for_insufficient_time: fd.insufficient_time === "Yes" ? (fd.insufficient_time_reason || null) : null,
      consent_given:             fd.consent_given     || null,
      consent_taken_by:          fd.consent_taken_by  || null,
      consent_datetime:          fd.consent_datetime   || null,
      consent_form_version:      fd.consent_form_version || null,
      consent_language:          fd.consent_language   || null,
      relationship_to_participant: fd.relationship_to_participant || null,
      relationship_other:        fd.relationship_other || null,
      reason_for_consent_refusal: fd.reason_for_consent_refusal_list.length > 0
        ? fd.reason_for_consent_refusal_list.join(", ") : null,
      reason_for_consent_refusal_other: fd.reason_for_consent_refusal_other || null,
      reason_not_approached:     fd.reason_not_approached_list.length > 0
        ? fd.reason_not_approached_list.join(", ") : null,
      reason_not_approached_other: fd.reason_not_approached_other || null,
      video_pis_shown:           fd.video_pis_shown  || null,
      ...(fd.consent_signature_image
        ? {
            consent_signature_image: fd.consent_signature_image,
            ...(fd.consent_signature_captured_at
              ? { consent_signature_captured_at: fd.consent_signature_captured_at }
              : {}),
          }
        : {}),
      ...(explicitlySaved ? { explicitly_saved: true } : {}),
    };
  };

  const buildPayload = useCallback(
    (useDraftFallbacks = false) => buildPayloadFrom(formData, useDraftFallbacks, anyExclusionYes, false),
    [formData, anyExclusionYes]
  );

  /* Keep latest flags for the interval callback (avoids stale closures). */
  const isDirtyRef = useRef(false);
  const isSavedRef = useRef(false);
  const isEditingRef = useRef(false);
  useEffect(() => { isDirtyRef.current = isDirty; }, [isDirty]);
  useEffect(() => { isSavedRef.current = isSaved; }, [isSaved]);
  useEffect(() => { isEditingRef.current = isEditing; }, [isEditing]);

  /* Shared by autoSave / saveForm / saveDraft. If a screening_id already
     exists, just PUT. If not, and ANOTHER save is already in the middle
     of creating one (e.g. autosave's POST is still in flight when the
     nurse clicks Save), await that SAME request instead of firing a
     second POST — this is what previously let two callers both create
     separate screening_ids for one in-progress form. */
  const createOrUpdateScreening = useCallback(async (payload, existingId) => {
    const body = sanitizeScreeningCreatePayload(payload);
    if (existingId) {
      return api.put(`/screenings/${existingId}`, body);
    }
    if (creatingScreeningRef.current) {
      return creatingScreeningRef.current;
    }
    const creationPromise = api.post("/screenings/", body)
      .finally(() => {
        creatingScreeningRef.current = null;
      });
    creatingScreeningRef.current = creationPromise;
    return creationPromise;
  }, []);

  /* ─── Auto-save every 10 seconds (silent, no modals, no validation) ──
     Only while the form is editable and has unsaved edits — never on a
     locked/saved view (was PUTting continuously after "Save"). */
  const autoSave = useCallback(async () => {
    if (isSavedRef.current && !isEditingRef.current) return;
    if (!isDirtyRef.current) return;

    const fd = formDataRef.current;
    const exclYes = ["exclusion_anomaly","fetal_hydrops","decision_forego_resus","iufd","insufficient_time"]
      .some(k => fd[k] === "Yes");

    const storedId = localStorage.getItem("current_screening_id");
    const sid = screeningIdRef.current;
    const existingId = (sid || (storedId && storedId !== "undefined" && storedId !== "null" ? storedId : null)) || null;

    /* Don't create a new DB row (and hand out a screening_id) until the
       nurse has entered at least one piece of A3 identification data —
       merely picking a site (e.g. browsing the dropdown, then navigating
       away) shouldn't be enough to spin up a record. site_name is still
       required too since the backend derives the ID's site prefix from
       it and will 422 without one. */
    const hasIdentificationData = [
      "mother_first_name", "mother_surname",
      "husband_first_name", "husband_surname",
      "maternal_uid", "hospital_admission_number",
    ].some(k => (fd[k] || "").toString().trim() !== "");
    if (!existingId && (!fd.site_name || !hasIdentificationData)) return;

    /* Never create or keep writing a row when GA is outside 25w0d–31w6d. */
    const gaClass = classifyGaSnapshot(fd);
    if (gaClass === "low" || gaClass === "high") return;
    if (!existingId && gaClass !== "eligible") return;

    if (!navigator.onLine) {
      setOfflineQueue(true);
      return;
    }

    setAutoSaveStatus("saving");
    try {
      const payload = buildPayloadFrom(fd, true, exclYes);

      const res = await createOrUpdateScreening(payload, existingId);

      const newSid = res.data.screening_id;
      const eid = res.data.enrollment_id;
      if (newSid) localStorage.setItem("current_screening_id", newSid);
      if (eid) localStorage.setItem("current_enrollment_id", eid);
      window.dispatchEvent(new Event("storage"));
      linkPendingGaCheck(newSid);

      setAutoSaveStatus("saved");
      setLastSaved(new Date());
      setIsDirty(false);
      setOfflineQueue(false);
      setTimeout(() => setAutoSaveStatus("idle"), 2500);
    } catch (err) {
      console.error("Screening form auto-save error:", err.message);
      setAutoSaveStatus("error");
      setTimeout(() => setAutoSaveStatus("idle"), 3000);
    }
  }, []);

  autoSaveRef.current = autoSave;

  useRegisterActiveFormSession(() => isDirtyRef.current, autoSave);

  /* ─── Start 10-second interval once form is loaded (stable — not reset on keystroke) ── */
  useEffect(() => {
    if (!dataLoaded) return;
    clearInterval(autoSaveTimer.current);
    autoSaveTimer.current = setInterval(() => {
      autoSaveRef.current?.();
    }, 10000);
    return () => clearInterval(autoSaveTimer.current);
  }, [dataLoaded]);

  /* ─── Save ── */
  const saveForm = async () => {
    if (endParticipation) {
      setMessage(`❌ ${GA_NO_RECORD_MSG}`);
      return false;
    }

    const missing = validate();
    if (missing.length > 0) {
      setMissingFields(missing);
      setShowMissingModal(true);
      return; // show modal, don't attempt save yet
    }

    const payload = buildPayloadFrom(formData, false, anyExclusionYes, true);

    try {
      const storedId = localStorage.getItem("current_screening_id");
      const existingId = screeningId || storedId || null;

      const res = await createOrUpdateScreening(payload, existingId);

      const sid = res.data.screening_id;
      const eid = res.data.enrollment_id;
      localStorage.setItem("current_screening_id", sid);
      if (eid) localStorage.setItem("current_enrollment_id", eid);
      window.dispatchEvent(new Event("storage"));
      linkPendingGaCheck(sid);

      setMessage("✅ Form A saved successfully");
      setShowSaveSuccess(true);
      setIsSaved(true); setIsEditing(false);
      setLastSaved(new Date());
      setIsDirty(false);
      setTimeout(() => setMessage(""), 4000);
      if (!screeningId && sid) navigate(`/form-a/${sid}`, { replace: true, preventScrollReset: true });
      return true;
    } catch (err) {
      console.error("Screening form save error:", err);
      const detail = err?.response?.data?.detail;
      const detailText = Array.isArray(detail)
        ? detail.map(d => d.msg || JSON.stringify(d)).join("; ")
        : (typeof detail === "string" ? detail : (detail ? JSON.stringify(detail) : err.message));
      setMessage(`❌ Save failed: ${detailText}`);
      return false;
    }
  };

  /* ─── Save Draft — no validation, saves whatever is filled ── */
  const saveDraft = async () => {
    if (endParticipation) {
      setMessage(`❌ ${GA_NO_RECORD_MSG}`);
      return;
    }
    const payload = buildPayload(true);

    try {
      const storedId   = localStorage.getItem("current_screening_id");
      const existingId = screeningId || storedId || null;

      const res = await createOrUpdateScreening(payload, existingId);

      const sid = res.data.screening_id;
      const eid = res.data.enrollment_id;
      localStorage.setItem("current_screening_id", sid);
      if (eid) localStorage.setItem("current_enrollment_id", eid);
      window.dispatchEvent(new Event("storage"));
      linkPendingGaCheck(sid);

      setShowDraftModal(true);
    } catch (err) {
      /* Parse FastAPI 422 validation errors into readable text */
      console.error("Screening draft save error:", err);
      const detail = err?.response?.data?.detail;
      let msg = "Draft save failed.";
      if (Array.isArray(detail)) {
        msg = "Draft save failed: " + detail
          .map(e => `${e.loc?.slice(-1)[0] || "field"} — ${e.msg}`)
          .join("; ");
      } else if (typeof detail === "string") {
        msg = `Draft save failed: ${detail}`;
      } else if (err.message) {
        msg = `Draft save failed: ${err.message}`;
      }
      setMessage(`❌ ${msg}`);
    }
  };

  const handlePrevious = async () => {
    if (isDirty) {
      try { await autoSave(); } catch (err) { console.error("Save before back failed:", err); }
    }
    navigate("/dashboard");
  };

  const handleNext = async () => {
    if (endParticipation) {
      localStorage.setItem("enrollment_locked", "true");
      localStorage.setItem("enrollment_lock_reason", "ga_out_of_range");
      window.dispatchEvent(new Event("storage"));
      setConsentMessage(GA_NO_RECORD_MSG);
      setShowConsentModal(true);
      return;
    }
    const ok = await saveForm();
    if (!ok) return;
    if (formData.consent_given !== "Yes" && formData.consent_given !== "Trial run") {
      localStorage.setItem("enrollment_locked","true");
      localStorage.setItem("enrollment_lock_reason", "consent");
      window.dispatchEvent(new Event("storage"));
      const why = { No:"consent was refused.", "Not approached":"consent was not taken." };
      setConsentMessage(`Screening completed. Participant cannot be enrolled because ${why[formData.consent_given]||"of consent status."}`);
      setShowConsentModal(true);
      return;
    }
    localStorage.removeItem("enrollment_locked");
    localStorage.removeItem("enrollment_lock_reason");
    window.dispatchEvent(new Event("storage"));
    markFormCompleted("form_a");
    navigate(`/form-b/${localStorage.getItem("current_screening_id")}`);
  };

  /* ════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════ */
  return (
    <>
      {/* ── OFFLINE BANNER ── */}
      {!isOnline && (
        <div className="offline-banner">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="1" y1="1" x2="23" y2="23"/>
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/>
          </svg>
          You are offline. Changes will be saved automatically when your connection returns.
          {offlineQueue && <strong> · Save queued.</strong>}
        </div>
      )}

      {isSaved && isEditing && (
        <div className="editing-mode-banner" role="status">
          <span className="editing-mode-icon" aria-hidden="true">
            <Pencil size={14} strokeWidth={2.25} />
          </span>
          <div className="editing-mode-copy">
            <span className="editing-mode-label">Editing mode</span>
            <span className="editing-mode-hint">Unsaved changes will be lost if you navigate away</span>
          </div>
        </div>
      )}

      <form className={`screening-form fa-modern-dp${isSaved && !isEditing ? " readonly" : ""}`}
        onSubmit={e => e.preventDefault()}>
        <fieldset>
          <div className="form-inner">

            {/* ── PAGE HEADER ── */}
            <div className="form-header-action-row">
              <div className="form-header-title-area">
                <div className="form-breadcrumb"><Home size={18} strokeWidth={2.25} aria-hidden="true" /> FORM A</div>
                <h2 className="form-main-title">Screening Form</h2>
                <p className="form-main-subtitle">Eligibility Assessment · Fill for pregnant women 25 weeks 0 days to 31 weeks 6 days at admission</p>
              </div>
              <div className="form-header-meta-area">
                {isSaved && <button type="button" className="btn-print-form" onClick={() => printPatientPdf(formData.screening_id)}>🖨️ Print</button>}
                {isSaved && (
                  <button type="button"
                    className={`btn-edit-form-header${isEditing ? " editing-active" : ""}`}
                    onClick={() => setIsEditing(p => {
                      const next = !p;
                      if (!next) setIsDirty(false);
                      return next;
                    })}>
                    {isEditing ? "✓ Done Editing" : "✎ Edit Form"}
                  </button>
                )}
                <div className="screening-id-badge">
                  <span className="id-label">Screening ID</span>
                  <span className="id-val">{formData.screening_id || "—"}</span>
                </div>
              </div>
            </div>

            {/* ══════════════════════════════════════
                A1 — SCREENING
            ══════════════════════════════════════ */}
            <div className="form-section card-section">
              <div className="form-section-header">
                <div className="section-title-left">
                  <Calendar size={15} className="section-header-icon"/>
                  <h3>A1 · Inclusion Criteria</h3>
                </div>
                {eligibilityStatus === "eligible" && <span className="badge-eligible">✓ Eligible</span>}
                {(eligibilityStatus === "high" || eligibilityStatus === "low") && <span className="badge-not-eligible">✗ Not Eligible</span>}
              </div>
              <div className="form-section-body">

                {/* "1. Gestation known?" removed 2026-09-23 — the Gestation
                   (Inclusion Criteria) Screening Log now gates Form A
                   entirely, so Best Estimate is unconditionally item 1,
                   pre-filled when this record was opened via "Continue to
                   Form A" from that log. A nurse opening Form A directly
                   still sees and fills these same fields manually. */}
                <div className="form-grid-3">
                  <div className="form-group">
                    <label>1. Best estimate gestational age — Weeks<span className="required">*</span></label>
                    <input type="number" name="best_ga_weeks" value={formData.best_ga_weeks}
                      onChange={handleChange} min={GA_MIN_WEEKS} max={GA_MAX_WEEKS} placeholder="25–31 weeks"
                      disabled={!isFieldEditable}
                      className={errors.best_ga_weeks ? "input-error" : ""}/>
                    {errors.best_ga_weeks && <div className="field-error">{errors.best_ga_weeks}</div>}
                  </div>
                  <div className="form-group">
                    <label>Days<span className="required">*</span></label>
                    <input type="number" name="best_ga_days" value={formData.best_ga_days}
                      onChange={handleChange} min="0" max="6" placeholder="0–6"
                      disabled={!isFieldEditable}
                      className={errors.best_ga_days ? "input-error" : ""}/>
                    {errors.best_ga_days && <div className="field-error">{errors.best_ga_days}</div>}
                  </div>
                  <div className="form-group">
                    <label>2. Method of gestation assessment<span className="required">*</span></label>
                    <select name="gestation_method" value={formData.gestation_method} onChange={handleChange} disabled={!isFieldEditable}>
                      <option value="">-- Select --</option>
                      <option value="LMP">LMP</option>
                      <option value="Early USG">Early USG (&lt;24w)</option>
                      <option value="Fundal Height">Fundal Height</option>
                      <option value="Unknown">Method not known</option>
                    </select>
                  </div>
                </div>

                {/* LMP date when method = LMP */}
                {formData.gestation_method === "LMP" && (
                  <div className="form-grid-3">
                    <div className="form-group">
                      <label>2. LMP date<span className="required">*</span></label>
                      <DatePicker
                        selected={formData.lmp_date ? parseDateOnly(formData.lmp_date) : null}
                        onChange={d => {
                          if (!d) {
                            set({ lmp_date: "", edd_date: "" });
                            return;
                          }
                          const lmp = toDateOnlyValue(d);
                          set({ lmp_date: lmp, edd_date: eddFromLmp(lmp) });
                        }}
                        dateFormat="dd-MM-yyyy" placeholderText="DD/MM/YY"
                        maxDate={today}
                        readOnly={!isFieldEditable}/>
                    </div>
                    <div className="form-group">
                      <label>EDD <span className="field-note">(auto-calculated from LMP)</span></label>
                      <input value={formData.edd_date ? formatDateToDDMMYYYY(formData.edd_date) : ""}
                        readOnly className="readonly-input" placeholder="—"/>
                    </div>
                    <div/>
                  </div>
                )}

                {/* GA result banner + alerts — always visible once weeks/days exist */}
                {hasDisplayGa && (
                  <div className={`gestation-info-banner ${eligibilityStatus === "eligible" ? "" : "gestation-info-banner--warn"}`}>
                    <Info size={15} className="banner-info-icon"/>
                    <span className="banner-text">
                      Gestational age: <strong>{displayWeeks} weeks ; {displayDays} days</strong>
                      {" — "}
                      participant is <strong>{eligibilityStatus === "eligible" ? "eligible" : "not eligible"}</strong> for the study.
                    </span>
                  </div>
                )}
                {eligibilityStatus === "high" && (
                  <div className="alert-danger">
                    ❌ If ≥32 weeks – cannot proceed. Gestational age is outside 25w0d–31w6d. No screening ID is assigned and the record is not saved.
                  </div>
                )}
                {eligibilityStatus === "low"  && (
                  <div className="alert-danger">
                    ❌ Gestational age &lt;25 weeks — outside 25w0d–31w6d. No screening ID is assigned and the record is not saved.
                  </div>
                )}

              </div>
            </div>

            {/* Rest of form — only shown once gestation path complete + eligible */}
            {gestationPathComplete && !endParticipation && (<>

              {/* ══════════════════════════════════════
                  A2 — IDENTIFICATION
              ══════════════════════════════════════ */}
              <div className="form-section card-section">
                <div className="form-section-header">
                  <div className="section-title-left">
                    <FileText size={15} className="section-header-icon"/>
                    <h3>A2 · Identification</h3>
                  </div>
                </div>
                <div className="form-section-body">

                  {/* Row 1: Screening ID | Site | Site ID */}
                  <div className="form-grid-3">
                    <div className="form-group">
                      <label>8. Screening ID <span className="field-note">(auto filled)</span></label>
                      <input type="text" name="screening_id" value={formData.screening_id||""}
                        placeholder="01-0001" maxLength={7} readOnly
                        className="readonly-input"/>
                    </div>
                    <div className="form-group">
                      <label>9. Site<span className="required">*</span></label>
                      <select name="site_name" value={formData.site_name||""} onChange={handleChange} disabled={!isFieldEditable || isSiteLocked}>
                        <option value="">-- Select Site --</option>
                        <option value="PGIMER">PGIMER</option>
                        <option value="GMCH">GMCH</option>
                        <option value="IOG">IOG</option>
                        <option value="AFMC">AFMC</option>
                        <option value="GMCH-A">GMCH-A</option>
                        <option value="AMC">AMC</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>10. Site ID <span className="field-note">(auto filled)</span></label>
                      <input value={formData.site_id||""} readOnly className="readonly-input"/>
                    </div>
                  </div>

                  {/* Row 2: Screening Date & Time | Screened By */}
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>11. Screening Date &amp; Time<span className="required">*</span></label>
                      <DatePicker
                        selected={(() => {
                          if (!formData.screening_datetime) return null;
                          const d = new Date(formData.screening_datetime);
                          return Number.isNaN(d.getTime()) ? null : d;
                        })()}
                        onChange={d => set({
                          screening_datetime: d ? toDateTimeLocalValue(d) : "",
                        })}
                        showTimeSelect
                        timeFormat="HH:mm"
                        timeIntervals={1}
                        dateFormat="dd-MM-yyyy  |  HH:mm"
                        maxDate={today}
                        placeholderText="dd-MM-yyyy  |  HH:mm"
                        className="screening-datetime-input"
                        readOnly={!isFieldEditable}/>
                    </div>
                    <div className="form-group">
                      <label>12. Screened by (First name)<span className="required">*</span></label>
                      <select name="screened_by" value={formData.screened_by||""} onChange={handleChange}
                        disabled={!isFieldEditable || !formData.site_name}>
                        <option value="">{formData.site_name ? "-- Select --" : "Select Site first"}</option>
                        {formData.screened_by && !nurses.includes(formData.screened_by) &&
                          <option value={formData.screened_by}>{formData.screened_by}</option>}
                        {nurses.map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                  </div>

                </div>
              </div>

              {/* ══════════════════════════════════════
                  A3 — MATERNAL IDENTIFICATION
              ══════════════════════════════════════ */}
              <div className="form-section card-section">
                <div className="form-section-header">
                  <div className="section-title-left">
                    <User size={15} className="section-header-icon"/>
                    <h3>A3 · Maternal Identification</h3>
                  </div>
                </div>
                <div className="form-section-body">

                  {/* Duplicate participant warning */}
                  {duplicateWarn && (
                    <div className="duplicate-warn">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                      </svg>
                      {duplicateWarn}
                    </div>
                  )}

                  {/* Row 1: Mother first + surname */}
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>13. Mother's Name — First<span className="required">*</span></label>
                      <input name="mother_first_name" value={formData.mother_first_name||""}
                        onChange={handleChange} onBlur={handleBlur}
                        placeholder="First name" disabled={!isFieldEditable}
                        autoComplete="given-name"
                        className={fieldTouched.mother_first_name && errors.mother_first_name ? "input-error" : ""}/>
                      {fieldTouched.mother_first_name && errors.mother_first_name && <div className="field-error">{errors.mother_first_name}</div>}
                    </div>
                    <div className="form-group">
                      <label>Surname</label>
                      <input name="mother_surname" value={formData.mother_surname||""}
                        onChange={handleChange} placeholder="Surname" disabled={!isFieldEditable}
                        autoComplete="family-name"/>
                    </div>
                  </div>

                  {/* Row 2: Husband first + surname */}
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>14. Husband's Name — First<span className="required">*</span></label>
                      <input name="husband_first_name" value={formData.husband_first_name||""}
                        onChange={handleChange} onBlur={handleBlur}
                        placeholder="First name" disabled={!isFieldEditable}
                        autoComplete="off"
                        className={fieldTouched.husband_first_name && errors.husband_first_name ? "input-error" : ""}/>
                      {fieldTouched.husband_first_name && errors.husband_first_name && <div className="field-error">{errors.husband_first_name}</div>}
                    </div>
                    <div className="form-group">
                      <label>Surname</label>
                      <input name="husband_surname" value={formData.husband_surname||""}
                        onChange={handleChange} placeholder="Surname" disabled={!isFieldEditable}
                        autoComplete="off"/>
                    </div>
                  </div>

                  {/* Row 3: Maternal UID + Hospital admission */}
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>15. Maternal UID (CR number){idFieldRule(formData.site_name, "maternal_uid")?.required && <span className="required">*</span>}</label>
                      <input name="maternal_uid" value={formData.maternal_uid||""}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        maxLength={formData.site_name === "PGIMER" ? 12 : 15}
                        inputMode={formData.site_name === "PGIMER" ? "numeric" : "text"}
                        placeholder={
                          formData.site_name === "PGIMER" ? "12-digit CR number" :
                          formData.site_name === "AMC"      ? "e.g. 123/2026" :
                          formData.site_name === "GMCH"    ? "CR number" :
                          formData.site_name === "IOG"         ? "CR number (auto from UID)" :
                          "CR / UID number"
                        }
                        disabled={!isFieldEditable}
                        autoComplete="off"
                        className={errors.maternal_uid ? "input-error" : ""}/>
                      {errors.maternal_uid && <div className="field-error">{errors.maternal_uid}</div>}
                    </div>
                    <div className="form-group">
                      <label>16. Hospital Admission Number{idFieldRule(formData.site_name, "hospital_admission_number")?.required && <span className="required">*</span>}</label>
                      <input name="hospital_admission_number" value={formData.hospital_admission_number||""}
                        maxLength={15}
                        inputMode={["PGIMER","GMCH-A","GMCH","IOG"].includes(formData.site_name) ? "numeric" : "text"}
                        placeholder={
                          formData.site_name === "GMCH-A"   ? "4–6 digit MRD number" :
                          formData.site_name === "AMC"      ? "e.g. 123/2026" :
                          formData.site_name === "GMCH"    ? "9–11 digit number" :
                          formData.site_name === "IOG"         ? "4–6 digit MRD number" :
                          formData.site_name === "PGIMER"  ? "10-digit admission number" :
                          "Admission / MRD number"
                        }
                        disabled={!isFieldEditable}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        className={errors.hospital_admission_number ? "input-error" : ""}/>
                      {errors.hospital_admission_number && <div className="field-error">{errors.hospital_admission_number}</div>}
                    </div>
                  </div>

                  {/* Row 4: Mother mobile + Husband mobile */}
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>17. Mobile Number — Mother<span className="required">*</span></label>
                      <input type="text" name="mother_contact" value={formData.mother_contact||""}
                        maxLength={10} inputMode="numeric" placeholder="10-digit mobile"
                        disabled={!isFieldEditable}
                        onChange={e => { if(!isFieldEditable)return; handleContact(e,"mother_contact"); }}
                        className={errors.mother_contact ? "input-error" : ""}/>
                      {errors.mother_contact && <div className="field-error">{errors.mother_contact}</div>}
                    </div>
                    <div className="form-group">
                      <label>Husband<span className="required">*</span></label>
                      <input type="text" name="husband_contact" value={formData.husband_contact||""}
                        maxLength={10} inputMode="numeric" placeholder="10-digit mobile"
                        disabled={!isFieldEditable}
                        onChange={e => { if(!isFieldEditable)return; handleContact(e,"husband_contact"); }}
                        className={errors.husband_contact ? "input-error" : ""}/>
                      {errors.husband_contact && <div className="field-error">{errors.husband_contact}</div>}
                    </div>
                  </div>

                </div>
              </div>

              {/* ══════════════════════════════════════
                  A4 — EXCLUSION CRITERIA
              ══════════════════════════════════════ */}
              <div className="form-section card-section">
                <div className="form-section-header">
                  <div className="section-title-left">
                    <ShieldAlert size={15} className="section-header-icon"/>
                    <h3>A4 · Exclusion Criteria</h3>
                  </div>
                </div>
                <div className="form-section-body">

                  {/* 1. Structural anomaly */}
                  <YesNoToggle label="18. Major structural anomalies or genetic abnormality (suspected/proven)"
                    name="exclusion_anomaly" value={formData.exclusion_anomaly} onChange={handleChange} disabled={!isFieldEditable} eligibleWhen="No"/>
                  {formData.exclusion_anomaly === "Yes" && (
                    <div className="followup-box">
                      <div className="form-grid-2">
                        <div className="form-group">
                          <label>If yes, specify<span className="required">*</span></label>
                          <input name="exclusion_anomaly_details" value={formData.exclusion_anomaly_details||""}
                            onChange={handleChange} placeholder="Describe the anomaly" disabled={!isFieldEditable}/>
                        </div>
                        <div/>
                      </div>
                    </div>
                  )}

                  {/* 2. Fetal Hydrops */}
                  <YesNoToggle label="19. Fetal Hydrops"
                    name="fetal_hydrops" value={formData.fetal_hydrops} onChange={handleChange} disabled={!isFieldEditable} eligibleWhen="No"/>
                  {formData.fetal_hydrops === "Yes" && (
                    <div className="followup-box">
                      <div className="form-grid-2">
                        <div className="form-group">
                          <label>20. If yes<span className="required">*</span></label>
                          <select name="fetal_hydrops_type" value={formData.fetal_hydrops_type||""} onChange={handleChange} disabled={!isFieldEditable}>
                            <option value="">-- Select type --</option>
                            <option>Immune</option>
                            <option>Non-immune</option>
                            <option>Unclear</option>
                          </select>
                        </div>
                        <div/>
                      </div>
                    </div>
                  )}

                  {/* 3. Decision to forego resuscitation */}
                  <YesNoToggle label="21. Decision to forego resuscitation"
                    name="decision_forego_resus" value={formData.decision_forego_resus} onChange={handleChange} disabled={!isFieldEditable} eligibleWhen="No"/>
                  {formData.decision_forego_resus === "Yes" && (
                    <div className="followup-box">
                      <label className="followup-label">22. If yes (select all that apply)<span className="required">*</span></label>
                        <MultiCheckbox
                          options={FOREGO_REASONS}
                          dataField="decision_forego_resus"
                          selected={formData.decision_forego_resus_reasons}
                        onChange={val => set({ decision_forego_resus_reasons: val })}
                        otherValue={formData.decision_forego_resus_reason_other}
                        onOtherChange={val => set({ decision_forego_resus_reason_other: val })}
                        disabled={!isFieldEditable}/>
                    </div>
                  )}

                  {/* 4. Insufficient time */}
                  <YesNoToggle label="23. Insufficient time for consent"
                    name="insufficient_time" value={formData.insufficient_time} onChange={handleChange} disabled={!isFieldEditable} eligibleWhen="No"/>
                  {formData.insufficient_time === "Yes" && (
                    <div className="followup-box">
                      <div className="form-grid-2">
                        <div className="form-group">
                          <label>24. If yes, specify<span className="required">*</span></label>
                          <input name="insufficient_time_reason" value={formData.insufficient_time_reason||""}
                            onChange={handleChange} placeholder="Specify reason" disabled={!isFieldEditable}/>
                        </div>
                        <div/>
                      </div>
                    </div>
                  )}

                  {/* 5. IUFD */}
                  <YesNoToggle label="25. IUFD"
                    name="iufd" value={formData.iufd} onChange={handleChange} disabled={!isFieldEditable} eligibleWhen="No"/>

                  {anyExclusionYes && (
                    <div className="alert-danger" style={{marginTop:16}}>
                      ❌ Exclusion criteria present — participant is not fit for consent. End participation.
                    </div>
                  )}

                  {anyExclusionYes && (
                    <div style={{textAlign:"center", marginTop:16}}>
                      <span className="badge-not-eligible" style={{fontSize:18, padding:"10px 20px"}}>
                        Exclusion Present — End Participation
                      </span>
                    </div>
                  )}
                  {allExclusionAnswered && !anyExclusionYes && (
                    <div style={{textAlign:"center", marginTop:16}}>
                      <div style={{fontSize:13, fontWeight:600, color:"#15803d", marginBottom:6}}>
                        All answers are NO
                      </div>
                      <span className="badge-eligible" style={{fontSize:18, padding:"10px 20px"}}>
                        Exclusion criteria ABSENT - Proceed to CONSENT
                      </span>
                    </div>
                  )}

                </div>
              </div>

              {/* ══════════════════════════════════════
                  A5 — PROCEED FOR CONSENT
                  Shown only when no exclusion OR editing existing record
              ══════════════════════════════════════ */}
              {(!anyExclusionYes || formData.consent_given) && (
                <div className="form-section card-section">
                  <div className="form-section-header">
                    <div className="section-title-left">
                      <CheckSquare size={15} className="section-header-icon"/>
                      <h3>A5 · Consent Process</h3>
                    </div>
                  </div>
                  <div className="form-section-body">

                    {/* 26. Consent — half width */}
                    <div className="form-grid-2">
                      <div className="form-group">
                        <label>26. Consent<span className="required">*</span></label>
                        <select name="consent_given" value={formData.consent_given||""} onChange={handleChange} disabled={!isFieldEditable}>
                          <option value="">-- Select --</option>
                          <option value="Yes">Yes</option>
                          <option value="No">No</option>
                          <option value="Trial run">Trial run</option>
                          <option value="Not approached">Not approached</option>
                        </select>
                      </div>
                      <div/>
                    </div>

                    {/* 27. Obtained from — Yes / No / Trial run */}
                    {(formData.consent_given === "Yes" || formData.consent_given === "No" || formData.consent_given === "Trial run") && (
                      <div className="form-grid-2">
                        <div className="form-group">
                          <label>27. Consent obtained from<span className="required">*</span></label>
                          <select name="relationship_to_participant"
                            value={formData.relationship_to_participant||""} onChange={handleChange} disabled={!isFieldEditable}>
                            <option value="">-- Select --</option>
                            <option value="Mother">Mother</option>
                            <option value="Husband">Husband</option>
                            <option value="Other">Other</option>
                          </select>
                          {formData.relationship_to_participant === "Other" && (
                            <input name="relationship_other" value={formData.relationship_other||""}
                              onChange={handleChange} placeholder="Specify"
                              disabled={!isFieldEditable}
                              style={{marginTop:8}}/>
                          )}
                        </div>
                        <div/>
                      </div>
                    )}

                    {/* 28. Reason for refusal (if No) */}
                    {formData.consent_given === "No" && (
                      <div className="followup-box">
                        <label className="followup-label">28. If no, reason for consent refusal (select all that apply)<span className="required">*</span></label>
                        <MultiCheckbox
                          options={REFUSAL_REASONS}
                          dataField="reason_for_consent_refusal_list"
                          selected={formData.reason_for_consent_refusal_list}
                          onChange={val => set({ reason_for_consent_refusal_list: val })}
                          otherValue={formData.reason_for_consent_refusal_other}
                          onOtherChange={val => set({ reason_for_consent_refusal_other: val })}
                          disabled={!isFieldEditable}/>
                      </div>
                    )}

                    {/* 29. Reason not approached (if Not approached) */}
                    {formData.consent_given === "Not approached" && (
                      <div className="followup-box">
                        <label className="followup-label">29. If not approached, reason (select all that apply)<span className="required">*</span></label>
                        <MultiCheckbox
                          options={NOT_APPROACHED_REASONS}
                          dataField="reason_not_approached_list"
                          selected={formData.reason_not_approached_list}
                          onChange={val => set({ reason_not_approached_list: val })}
                          otherValue={formData.reason_not_approached_other}
                          onOtherChange={val => set({ reason_not_approached_other: val })}
                          disabled={!isFieldEditable}/>
                      </div>
                    )}

                    {/* 30. Consent obtained by + 31. Video PIS */}
                    {(formData.consent_given === "Yes" || formData.consent_given === "No" || formData.consent_given === "Trial run") && (
                      <div className="form-grid-2">
                        <div className="form-group">
                          <label>30. Consent obtained by (First name)<span className="required">*</span></label>
                          <select name="consent_taken_by" value={formData.consent_taken_by||""}
                            onChange={handleChange} disabled={!isFieldEditable || !formData.site_name}>
                            <option value="">{formData.site_name ? "-- Select --" : "Select Site first"}</option>
                            {formData.consent_taken_by && !nurses.includes(formData.consent_taken_by) &&
                              <option value={formData.consent_taken_by}>{formData.consent_taken_by}</option>}
                            {nurses.map(n => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </div>
                        <div className="form-group">
                          <label>31. Video PIS shown<span className="required">*</span></label>
                          <select name="video_pis_shown" value={formData.video_pis_shown||""} onChange={handleChange} disabled={!isFieldEditable}>
                            <option value="">-- Select --</option>
                            <option value="Yes">Yes</option>
                            <option value="No">No</option>
                          </select>
                        </div>
                      </div>
                    )}

                    {/* Video PIS also for Not approached */}
                    {formData.consent_given === "Not approached" && (
                      <div className="form-grid-2">
                        <div className="form-group">
                          <label>31. Video PIS shown<span className="required">*</span></label>
                          <select name="video_pis_shown" value={formData.video_pis_shown||""} onChange={handleChange} disabled={!isFieldEditable}>
                            <option value="">-- Select --</option>
                            <option value="Yes">Yes</option>
                            <option value="No">No</option>
                          </select>
                        </div>
                        <div/>
                      </div>
                    )}

                    {/* ICF — consenting party signature only (staff/PI attestation is print-only) */}
                    {(formData.consent_given === "Yes" || formData.consent_given === "No" ||
                      formData.consent_given === "Trial run") && (
                      <div className="followup-box icf-signature-box" data-field="consent_signature_image">
                        <label className="followup-label">Informed consent (ICF)</label>
                        {consentGivenByName(formData) && (
                          <p className="icf-signer-name" style={{ margin: "4px 0 12px", fontWeight: 600 }}>
                            Consent given by — {consentGivenByName(formData)}
                            {formData.relationship_to_participant
                              ? ` (${formData.relationship_to_participant})`
                              : ""}
                          </p>
                        )}
                        {!consentGivenByName(formData) && formData.relationship_to_participant && (
                          <p className="icf-signer-name" style={{ margin: "4px 0 12px", fontWeight: 600 }}>
                            Relationship — {formData.relationship_to_participant}
                            {formData.relationship_other ? `: ${formData.relationship_other}` : ""}
                          </p>
                        )}
                        <label className="followup-label">
                          Consent signature<span className="required">*</span>
                        </label>
                        <p style={{ margin: "0 0 8px", fontSize: 13, color: "#64748b" }}>
                          Signature of the person giving consent (patient, parent, or guardian)
                        </p>
                        <SignaturePad
                          value={formData.consent_signature_image}
                          disabled={!isFieldEditable}
                          onChange={(dataUrl) => set({
                            consent_signature_image: dataUrl || "",
                            consent_signature_captured_at: dataUrl ? new Date().toISOString() : "",
                          })}
                        />
                        {formData.consent_signature_captured_at && (
                          <p className="icf-signature-timestamp">
                            Signed {new Date(formData.consent_signature_captured_at).toLocaleString("en-IN")}
                          </p>
                        )}
                      </div>
                    )}

                    {/* PIS Document download links — PDF. Punjabi only for
                        PGIMER Chandigarh / GMCH Chandigarh (not GMCH-A). */}
                    {(formData.consent_given === "Yes" || formData.consent_given === "No" ||
                      formData.consent_given === "Trial run" || formData.consent_given === "Not approached") && (
                      <div className="followup-box pis-document-box">
                        <label className="followup-label">PIS Document</label>
                        <div className="pis-document-buttons">
                          <a
                            className="btn btn-secondary pis-document-btn"
                            href="/documents/PIS_ICF_English.pdf"
                            target="_blank"
                            rel="noopener noreferrer"
                            download="PIS_ICF_English.pdf"
                          >
                            PIS Document (English)
                          </a>
                          <a
                            className="btn btn-secondary pis-document-btn"
                            href="/documents/PIS_ICF_Hindi.pdf"
                            target="_blank"
                            rel="noopener noreferrer"
                            download="PIS_ICF_Hindi.pdf"
                          >
                            PIS Document (Hindi)
                          </a>
                          {["PGIMER", "GMCH"].includes(formData.site_name) ||
                          ["PGIMER", "GMCH"].includes(user?.site) ? (
                            <a
                              className="btn btn-secondary pis-document-btn"
                              href="/documents/PIS_ICF_Punjabi.pdf"
                              target="_blank"
                              rel="noopener noreferrer"
                              download="PIS_ICF_Punjabi.pdf"
                            >
                              PIS Document (Punjabi)
                            </a>
                          ) : null}
                        </div>
                      </div>
                    )}

                  </div>
                </div>
              )}

            </>)}

            {/* ── NOTES BOX ──
                Prefer URL screeningId so we don't briefly key notes under
                `form_a_new` while formData is still loading (that wipe bug
                cleared notes when returning from Form B). */}
            <NotesBox formKey={`form_a_${(
              (screeningId && screeningId !== "undefined" && screeningId !== "null" && screeningId)
              || formData.screening_id
              || "new"
            )}`} disabled={!isFieldEditable} />

            {message && <div className={`form-message${message.startsWith("✅") ? " msg-success" : message.startsWith("⚠️") ? " msg-warn" : " msg-error"}`}>{message}</div>}

          </div>
        </fieldset>
      </form>

      {/* ── STICKY NAVIGATION BAR ── */}
      <div className="form-navigation">
        <button type="button" className="btn btn-secondary" onClick={handlePrevious}>
          <ArrowLeft size={15}/> Dashboard
        </button>
        <button
          type="button"
          className="btn btn-save"
          onClick={saveForm}
          disabled={endParticipation}
          title={endParticipation ? GA_NO_RECORD_MSG : undefined}
        >
          <Save size={15}/> Save
        </button>
        <button
          type="button"
          className="btn btn-draft"
          onClick={saveDraft}
          disabled={endParticipation}
          title={endParticipation ? GA_NO_RECORD_MSG : undefined}
        >
          <Save size={15}/> Save for Later
        </button>

        {/* Auto-save status indicator */}
        <div className="autosave-indicator">
          {/* Last saved timestamp */}
          {lastSaved && autoSaveStatus === "idle" && (
            <span className="last-saved-txt">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Saved {relativeTime(lastSaved)}
            </span>
          )}
          {/* Unsaved changes dot */}
          {isDirty && autoSaveStatus === "idle" && !lastSaved && (
            <span className="unsaved-dot-pill">
              <span className="unsaved-dot"/>
              Unsaved changes
            </span>
          )}
          {autoSaveStatus === "saving" && (
            <span className="autosave-pill autosave-pill--saving">
              <span className="autosave-dot autosave-dot--spin"/>
              Auto-saving…
            </span>
          )}
          {autoSaveStatus === "saved" && (
            <span className="autosave-pill autosave-pill--saved">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Auto-saved
            </span>
          )}
          {autoSaveStatus === "error" && (
            <span className="autosave-pill autosave-pill--error">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              Auto-save failed
            </span>
          )}
        </div>

        <div className="footer-step-indicator">
          <span className="step-text">STEP 1 OF 17</span>
          <div className="step-progress-line">
            <div className="progress-segment active"/>
            <div className="progress-segment"/>
            <div className="progress-segment"/>
            <div className="progress-segment"/>
          </div>
        </div>
        <button type="button" className="btn btn-primary" onClick={handleNext}
          disabled={!isSaved || endParticipation}
          title={endParticipation ? "Gestational age outside eligibility — Form B locked" : undefined}>
          Birth &amp; Resuscitation <ArrowRight size={15}/>
        </button>
      </div>

      {/* ── Missing fields modal — modern redesign ── */}
      {showMissingModal && (
        <div className="modal-overlay" onClick={() => setShowMissingModal(false)}>
          <div className="mf-modal" onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="mf-modal-header">
              <div className="mf-modal-icon-wrap">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                  stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </div>
              <div className="mf-modal-text">
                <h3 className="mf-modal-title">Required fields missing</h3>
                <p className="mf-modal-sub">{missingFields.length} field{missingFields.length !== 1 ? "s" : ""} need attention before saving</p>
              </div>
              <button className="mf-modal-close" onClick={() => setShowMissingModal(false)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {/* Field list */}
            <div className="mf-modal-list">
              {missingFields.map((f, i) => (
                <div key={i} className="mf-modal-item">
                  <span className="mf-modal-num">{i + 1}</span>
                  <span className="mf-modal-label">{f.label}</span>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="mf-modal-footer">
              <button className="mf-btn-secondary"
                onClick={() => setShowMissingModal(false)}>
                Dismiss
              </button>
              <button className="mf-btn-primary"
                onClick={() => {
                  setShowMissingModal(false);
                  setTimeout(() => scrollToFirstError(missingFields), 100);
                }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                Go to first error
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Consent outcome modal */}
      {showConsentModal && (
        <div className="consent-overlay">
          <div className="consent-modal">
            <h2>Screening Completed</h2>
            <p>{consentMessage}</p>
            <button className="consent-btn" onClick={() => { setShowConsentModal(false); navigate("/dashboard"); }}>
              Go to Dashboard
            </button>
          </div>
        </div>
      )}

      {/* Draft saved modal */}
      {showDraftModal && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-icon">💾</div>
            <div className="modal-title">Draft Saved</div>
            <div className="modal-subtext">
              Your progress has been saved. You can return to this form any time to complete it.
            </div>
            <div style={{display:"flex", gap:"10px", marginTop:"16px"}}>
              <button className="modal-btn" style={{background:"#f1f5f9", color:"#374151", border:"1px solid #e2e8f0"}}
                onClick={() => { setShowDraftModal(false); setIsSaved(false); setIsEditing(true); }}>
                Keep Editing
              </button>
              <button className="modal-btn"
                onClick={() => { setShowDraftModal(false); navigate("/dashboard"); }}>
                Go to Dashboard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print report lives outside #root via portal — required for window.print() */}
      <SaveSuccessModal
        open={showSaveSuccess}
        onClose={() => setShowSaveSuccess(false)}
        message="Form A has been saved successfully."
      />
      <PrintSummary
        formData={formData}
        preparedByName={preparedByDisplayName(formData, user)}
        piName={piName}
      />
    </>
  );
}
