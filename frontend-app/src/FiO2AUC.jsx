import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { usePatient } from "./context/PatientContext";
import { useFormProgress } from "./context/FormProgressContext";
import api from "./api/axios";
import { ArrowLeft, ArrowRight, Save, RefreshCw } from "lucide-react";
import "./styles/global.css";
import "./styles/FormC.css";
import "./styles/FiO2AUC.css";

/* 
   CONSTANTS & PURE HELPERS
 */
const mkRow  = (fio2 = "", dur = "") => ({ id: Date.now() + Math.random(), fio2, dur });
// FIX (faster data entry): a brand-new window almost always starts as a
// single FiO2 value covering the whole 12h block. Defaulting the first
// row's duration to 12 means the nurse only has to type the FiO2 value —
// no need to also type "12" for the common single-value case. If the
// value changes mid-block, adding a row (see addRow below) recomputes
// this automatically.
const mkDay  = (d, expand = false) => ({
  day: d, expanded: expand, start1: "", start2: "",
  w1: [mkRow("", 12)], w2: [mkRow("", 12)],
});

/** True if the nurse (or a saved log) has entered FiO2 values (not just a start time / blank stub). */
const dayHasEnteredData = (d) => {
  if (!d) return false;
  if ((d.w1 && d.w1.length > 1) || (d.w2 && d.w2.length > 1)) return true;
  const hasFio2 = rows => (rows || []).some(r => r.fio2 !== "" && r.fio2 != null);
  return hasFio2(d.w1) || hasFio2(d.w2);
};

const restoreEntriesFromLog = (log) => {
  if (!log) return [mkRow("", 12)];
  const entries = Array.isArray(log.entries) ? log.entries : [];
  if (!entries.length) return [mkRow("", 12)];
  return entries.map(e => ({
    id: Date.now() + Math.random(),
    fio2: e.fio2 != null ? String(e.fio2) : "",
    dur:  e.dur  != null ? String(e.dur)  : "",
  }));
};

const dayFromLogs = (dayNum, logs, expand) => {
  const w1Log = logs.find(l => l.day === dayNum && String(l.block || "").startsWith("0"));
  const w2Log = logs.find(l => l.day === dayNum && String(l.block || "").startsWith("12"));
  return {
    ...mkDay(dayNum, expand),
    start1: w1Log?.start_time || "",
    start2: w2Log?.start_time || "",
    w1: restoreEntriesFromLog(w1Log),
    w2: restoreEntriesFromLog(w2Log),
  };
};

/** Saved fio2_logs often stub every day 1–7 from the old form — only keep days with real values. */
const savedDayHasEnteredData = (dayNum, logs) => dayHasEnteredData(dayFromLogs(dayNum, logs, false));

const rowAUC      = (fio2, dur) => ((parseFloat(fio2) || 0) / 100) * (parseFloat(dur) || 0);
const windowAUC   = rows => rows.reduce((s, r) => s + rowAUC(r.fio2, r.dur), 0);
const windowHours = rows => rows.reduce((s, r) => s + (parseFloat(r.dur) || 0), 0);
const dayAUC      = (w1, w2) => windowAUC(w1) + windowAUC(w2);
// Total hours actually logged across all days so far (as opposed to the
// full 168h of a complete 7-day record).
const totalHoursLogged = daysArr => daysArr.reduce((s, d) => s + windowHours(d.w1) + windowHours(d.w2), 0);
const clamp       = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const totalGestationDays = (weeks, days) => {
  if (weeks === null || weeks === undefined || weeks === "") return null;
  if (days === null || days === undefined || days === "") return null;
  const w = Number(weeks);
  const d = Number(days);
  return Number.isNaN(w) || Number.isNaN(d) ? null : w * 7 + d;
};
const formatGestation = (weeks, days) =>
  weeks !== null && weeks !== undefined && weeks !== "" ? `${weeks}+${days ?? 0} wks` : "";
const formatDateDisplay = value => {
  if (!value) return "";
  const [datePart] = String(value).split("T");
  const parts = datePart.includes("-") ? datePart.split("-") : datePart.split("/");
  if (parts.length !== 3) return datePart;
  if (datePart.includes("-")) {
    const [yyyy, mm, dd] = parts;
    return `${dd}-${mm}-${yyyy}`;
  }
  const [dd, mm, yyyy] = parts;
  return `${dd}-${mm}-${yyyy}`;
};

/* 
   HOURS PROGRESS BAR
 */
function HoursBar({ used }) {
  const pct  = clamp((used / 12) * 100, 0, 100);
  const over = used > 12.01;
  const done = Math.abs(used - 12) < 0.01;
  const cls  = over ? "hb-danger" : done ? "hb-ok" : used >= 9 ? "hb-warn" : "hb-idle";
  // FIX (faster data entry): show remaining hours directly instead of
  // making the nurse subtract "used" from 12 herself.
  const remaining = Math.max(0, +(12 - used).toFixed(2));
  return (
    <div className="hb-wrap">
      <div className="hb-track">
        <div className={`hb-fill ${cls}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`hb-label ${cls}`}>
        {used.toFixed(1)} / 12 h {done ? "" : over ? "exceeds 12h" : `\u2014 ${remaining}h remaining`}
      </span>
    </div>
  );
}

/* 
   WINDOW CARD  (112h  or  1324h)
 */
function WindowCard({ title, rows, onRowChange, onAddRow, onDelRow }) {
  const hrs = windowHours(rows);
  const auc = windowAUC(rows);

  return (
    <div className="window-card">
      {/* Window header */}
      <div className="window-header">
        <h4 className="window-label">{title}</h4>
        <span className="window-clock-icon">&#128336;</span>
      </div>

      {/* Column labels */}
      <div className="entry-head">
        <span>FiO2 (%)</span>
        <span>Duration (hr)</span>
        <span>AUC</span>
        <span></span>
      </div>

      {/* Entry rows */}
      {rows.map(row => {
        const ra = rowAUC(row.fio2, row.dur);
        const fioErr = row.fio2 !== "" && (Number(row.fio2) < 21 || Number(row.fio2) > 100);
        return (
          <div key={row.id} className="entry-row">
            <input
              type="number" min={21} max={100} placeholder="21-100" inputMode="decimal"
              value={row.fio2}
              className={`entry-input${fioErr ? " entry-input--err" : row.fio2 ? " entry-input--ok" : ""}`}
              onChange={e => onRowChange(row.id, "fio2", e.target.value)} />
            <input
              type="number" min={0} max={12} placeholder="0-12" inputMode="decimal"
              value={row.dur}
              className={`entry-input${row.dur && Number(row.dur) < 0 ? " entry-input--err" : row.dur ? " entry-input--ok" : ""}`}
              onChange={e => onRowChange(row.id, "dur", e.target.value)} />
            <div className="entry-auc">
              {ra > 0 ? ra.toFixed(2) : "-"}
            </div>
            <button type="button" className="entry-del"
              onClick={() => onDelRow(row.id)}
              disabled={rows.length <= 1}
              aria-label="Delete row">
              &#10006;
            </button>
          </div>
        );
      })}

      {/* Add row */}
      <button type="button" className="add-row-btn" onClick={onAddRow}>
        <span className="add-row-icon">+</span> Add FiO2 Change
      </button>

      {/* Hours bar */}
      <HoursBar used={hrs} />

      {/* Window AUC */}
      <div className="window-auc-row">
        <span className="window-auc-label">Window AUC</span>
        <span className="window-auc-val">{auc.toFixed(3)}</span>
      </div>
    </div>
  );
}

/* 
   MAIN COMPONENT
 */
export default function Fio2AUCForm() {
  const navigate = useNavigate();
  const { markFormCompleted } = useFormProgress();
  const { enrollmentId }      = useParams();
  const { patientData }       = usePatient();

  /*  Patient identification  */
  const [patient, setPatient] = useState({
    enrollment_id: "", dob: "", gestation: "", gestation_source: "", mother_name: "", maternal_uid: ""
  });

  /*  Per-day state — built from Helper 2 Supplemental O₂=Yes days (not a fixed 1–7) */
  const [days, setDays] = useState([]);
  const [daysLoading, setDaysLoading] = useState(false);
  const [helper2Refreshing, setHelper2Refreshing] = useState(false);

  /*  UI state  */
  const [message, setMessage] = useState("");
  const [isSaved, setIsSaved] = useState(false);
  // Tracks whether there are edits since the last successful save (POST or PUT).
  // Kept separate from `isSaved` (which just means "has a record ever been saved")
  // so autosave and the unload-warning keep working after the first save.
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState(""); // "saving" | "saved" | "error" | ""
  // Shown when a window (1-12h or 13-24h) first reaches its full 12h of
  // logged duration.
  const [completionPopup, setCompletionPopup] = useState(null); // {day, window} | null
  // Shown after the Save button successfully saves the form.
  const [showSavedPopup, setShowSavedPopup] = useState(false);
  
  /*  Auto-save refs  */
  const autoSaveTimer = useRef(null);
  const daysRef = useRef(null);
  /** Last loaded server fio2_logs — merged into saves so hidden days aren't wiped. */
  const lastServerLogsRef = useRef([]);

  /*  Load identification from PatientContext  */
  useEffect(() => {
    if (!patientData) return;
    const g = formatGestation(patientData.gestation_weeks, patientData.gestation_days);
    setPatient(p => ({
      ...p,
      enrollment_id: patientData.enrollment_id || "",
      dob:           p.dob || formatDateDisplay(patientData.dob),
      gestation:     p.gestation || g,
      mother_name:   patientData.mother_name  || patientData.baby_name || "",
      maternal_uid:  patientData.maternal_uid || "",
    }));
  }, [patientData]);

  /*  Load identification from Form B  */
  useEffect(() => {
    if (!enrollmentId) return;
    api.get(`/birth-resuscitation/${enrollmentId}`).then(async res => {
      const b = res?.data || {};
      let gestWeeks = b?.gestation_weeks;
      let gestDays = b?.gestation_days ?? 0;
      let gestSource = b?.gestation_source || "Form B";

      try {
        const dRes = await api.get(`/postnatal-day1/${enrollmentId}`);
        const d = dRes?.data || {};
        const originalWeeks = b?.original_gestation_weeks ?? b?.gestation_weeks;
        const originalDays = b?.original_gestation_days ?? b?.gestation_days ?? 0;
        const originalTotal = totalGestationDays(originalWeeks, originalDays);
        const nbsTotal = totalGestationDays(d?.gestation_weeks, d?.gestation_days);
        const useNbs = d?.ga_method === "NBS" && nbsTotal !== null && (
          originalTotal === null || Math.abs(nbsTotal - originalTotal) > 14
        );
        if (useNbs) {
          gestWeeks = d.gestation_weeks;
          gestDays = d.gestation_days ?? 0;
          gestSource = "Form D NBS";
        }
      } catch (_) {}

      const g = formatGestation(gestWeeks, gestDays);
      setPatient(p => ({
        ...p,
        enrollment_id: b?.enrollment_id || enrollmentId,
        dob:           formatDateDisplay(b?.date_of_birth) || p.dob,
        gestation:     g || p.gestation,
        gestation_source: gestSource,
        mother_name:   `${b?.mother_name_first || ""} ${b?.mother_name_surname || ""}`.trim(),
        maternal_uid:  b?.baby_uid || b?.maternal_uid || "",
      }));
    }).catch(() => {});
  }, [enrollmentId]);

  /**
   * Build day-cards from Helper 2 Supplemental O₂=Yes days, unioned with any days
   * that already have saved/local FiO2 data (so Helper 2 corrections never
   * silently drop entered AUC values). No 7-day cap.
   */
  const syncDaysFromHelper2 = useCallback(async ({ preserveLocal = true, showToast = false } = {}) => {
    if (!enrollmentId) return;
    if (showToast) setHelper2Refreshing(true);
    else setDaysLoading(true);
    try {
      const [sumRes, fio2Res] = await Promise.all([
        api.get(`/resp-cv-neuro/${enrollmentId}/summary`),
        api.get(`/fio2-auc/${enrollmentId}`).catch(err => {
          if (err?.response?.status === 404) return { data: [] };
          throw err;
        }),
      ]);

      const isTruthy = (v) =>
        v === true || v === "true" || v === 1 || v === "1" || v === "Yes" || v === "yes";

      // FiO₂ AUC days = Helper Form 2 Supplemental O₂ = Yes (not Surfactant)
      const oxygenDays = (sumRes?.data || [])
        .filter(s => isTruthy(s.supp_o2))
        .map(s => Number(s.nicu_day))
        .filter(n => Number.isFinite(n) && n >= 1);

      const list = Array.isArray(fio2Res?.data) ? fio2Res.data : [];
      const record = list[0];
      const logs = Array.isArray(record?.fio2_logs) ? record.fio2_logs : [];
      // Keep server logs for merge-on-save so days not currently shown aren't wiped.
      lastServerLogsRef.current = logs.map(l => ({ ...l }));

      // Union Helper 2 Supplemental O₂=Yes days with any day that already has FiO₂
      const dayNumsSet = new Set(oxygenDays);
      for (const l of logs) {
        const entries = Array.isArray(l?.entries) ? l.entries : [];
        const hasFio2 = entries.some(e => String(e?.fio2 ?? "").trim() !== "");
        if (!hasFio2) continue;
        const d = Number(l.day);
        if (Number.isFinite(d) && d >= 1) dayNumsSet.add(d);
      }
      const dayNums = [...dayNumsSet].sort((a, b) => a - b);

      setDays(prev => {
        if (!dayNums.length) return [];

        const earliest = dayNums[0];
        return dayNums.map(n => {
          const prevDay = prev.find(d => d.day === n);
          if (preserveLocal && prevDay && dayHasEnteredData(prevDay)) {
            return { ...prevDay }; // keep expand/collapse state
          }
          const hasLog = logs.some(l => Number(l.day) === n);
          if (hasLog) return dayFromLogs(n, logs, n === earliest);
          return mkDay(n, n === earliest);
        });
      });

      // Any existing FiO₂ row → prefer PUT (backend POST also upserts now).
      if (record) {
        setIsSaved(true);
        if (!preserveLocal) setHasUnsavedChanges(false);
      }
      if (showToast) {
        setMessage(
          oxygenDays.length
            ? `Synced ${oxygenDays.length} Supplemental O₂ day${oxygenDays.length === 1 ? "" : "s"} from Helper 2`
            : "No Helper 2 days with Supplemental O₂ = Yes yet"
        );
        setTimeout(() => setMessage(""), 3500);
      }
    } catch (err) {
      console.log("Error syncing FiO2 days from Helper 2", err);
      if (showToast) {
        setMessage("Could not refresh from Helper 2 — try again");
        setTimeout(() => setMessage(""), 3500);
      }
    } finally {
      setDaysLoading(false);
      setHelper2Refreshing(false);
    }
  }, [enrollmentId]);

  /*  Initial load: Helper 2 Supplemental O₂ days + saved FiO2 AUC  */
  useEffect(() => {
    syncDaysFromHelper2({ preserveLocal: false, showToast: false });
  }, [syncDaysFromHelper2]);

  /*  Warn before unload if there are unsaved changes  */
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "You have unsaved changes. Are you sure you want to leave?";
        return "You have unsaved changes. Are you sure you want to leave?";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  /*  Day helpers  */
  const setDay = useCallback((dayNum, fn) =>
    setDays(prev => prev.map(d => d.day === dayNum ? { ...d, ...fn(d) } : d)), []);

  const toggleDay     = d  => setDay(d, x => ({ expanded: !x.expanded }));
  const addRow = (d, win) => {
    setHasUnsavedChanges(true);
    setDay(d, x => {
      const existing = x[win];
      const lastRow = existing[existing.length - 1];
      // FIX (faster data entry): prefill the new row instead of leaving it
      // blank. Duration defaults to whatever time is left to complete the
      // 12h window (based on the durations already entered) — the nurse
      // only needs to shorten it if there's yet another change coming.
      // FiO2 copies down from the previous row, since most mid-window
      // changes are small adjustments rather than a completely different
      // value typed from scratch; it's one tap to overwrite if different.
      const remaining = Math.max(0, +(12 - windowHours(existing)).toFixed(2));
      return { [win]: [...existing, mkRow(lastRow?.fio2 ?? "", remaining > 0 ? remaining : "")] };
    });
  };
  const updateStartTime = (d, field, value) => {
    setHasUnsavedChanges(true);
    // FIX (faster data entry): the "13-24h" window start time is almost
    // always exactly 12 hours after the "1-12h" start time. Auto-filling
    // it saves a second manual time entry per day; it stays fully
    // editable afterward, and we only auto-fill it if the nurse hasn't
    // already typed something different into it themselves.
    if (field === "start1" && value) {
      const [hh, mm] = value.split(":").map(Number);
      const total = (hh * 60 + mm + 12 * 60) % (24 * 60);
      const auto = `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
      setDay(d, x => ({ start1: value, start2: x.start2 ? x.start2 : auto }));
      return;
    }
    setDay(d, () => ({ [field]: value }));
  };
  const delRow        = (d, win, id) => {
    setHasUnsavedChanges(true);
    setDay(d, x => ({ [win]: x[win].length > 1 ? x[win].filter(r => r.id !== id) : x[win] }));
  };
  const updateRow     = (d, win, id, field, value) => {
    setHasUnsavedChanges(true);
    // Compute before/after hours for THIS window outside the setDays
    // updater (rather than inside it) so the popup only fires once per
    // real transition, not potentially twice under React StrictMode's
    // double-invocation of state updaters in development.
    const currentDay = days.find(x => x.day === d);
    const prevRows = currentDay ? currentDay[win] : [];
    const prevHrs = windowHours(prevRows);
    const newRows = prevRows.map(r => r.id === id ? { ...r, [field]: value } : r);
    const newHrs = windowHours(newRows);
    const justHitTwelve = Math.abs(newHrs - 12) < 0.01 && Math.abs(prevHrs - 12) >= 0.01;

    const windowHasFio2 = (rows) =>
      (rows || []).length > 0 && (rows || []).every(r => String(r.fio2 ?? "").trim() !== "");
    const dayFullyComplete = (day) => {
      if (!day) return false;
      const h1 = windowHours(day.w1);
      const h2 = windowHours(day.w2);
      // Default dur=12 alone is not complete — require FiO₂ in both windows
      // or the card collapses on the first keystroke.
      return Math.abs(h1 - 12) < 0.01 && Math.abs(h2 - 12) < 0.01
        && windowHasFio2(day.w1) && windowHasFio2(day.w2);
    };
    const wasComplete = dayFullyComplete(currentDay);

    setDays(prev => {
      const updated = prev.map(x => x.day === d
        ? { ...x, [win]: x[win].map(r => r.id === id ? { ...r, [field]: value } : r) }
        : x
      );
      const thisDay = updated.find(x => x.day === d);
      if (!thisDay) return updated;
      const justCompleted = !wasComplete && dayFullyComplete(thisDay);
      if (!justCompleted) return updated;
      // Auto-collapse this day, expand the next *rendered* day (gaps allowed)
      const idx = updated.findIndex(x => x.day === d);
      const nextDayNum = idx >= 0 && idx < updated.length - 1 ? updated[idx + 1].day : null;
      return updated.map(x => {
        if (x.day === d) return { ...x, expanded: false };
        if (nextDayNum != null && x.day === nextDayNum) return { ...x, expanded: true };
        return x;
      });
    });

    if (justHitTwelve) {
      setCompletionPopup({ day: d, window: win === "w1" ? "1\u201312h" : "13\u201324h" });
    }
  };

  /*  Totals  */
  const grandTotal   = days.reduce((s, d) => s + dayAUC(d.w1, d.w2), 0);
  // FIX: previously always divided/subtracted against a fixed 168h (7-day)
  // baseline, which silently treated every not-yet-logged hour as "21%
  // FiO2, zero excess" — making these KPIs look artificially low/zero
  // until all 7 days were complete, even with real data entered for
  // Day 1-2. Using hours actually logged so far instead means the number
  // reflects real exposure at any point during the week. Once all 168
  // hours ARE logged, this produces exactly the same final numbers as
  // the old fixed-168 formula did — nothing changes about the Day-7
  // clinical endpoint itself.
  const hoursLoggedSoFar = totalHoursLogged(days);
  const meanFiO2     = hoursLoggedSoFar > 0 ? ((grandTotal / hoursLoggedSoFar) * 100).toFixed(1) : "0.0";
  const excessO2     = Math.max(0, grandTotal - 0.21 * hoursLoggedSoFar).toFixed(2);
  const daysComplete = days.filter(d => {
    const h1 = windowHours(d.w1);
    const h2 = windowHours(d.w2);
    const hasFio2 = (rows) =>
      (rows || []).length > 0 && (rows || []).every(r => String(r.fio2 ?? "").trim() !== "");
    return Math.abs(h1 - 12) < 0.01 && Math.abs(h2 - 12) < 0.01
      && hasFio2(d.w1) && hasFio2(d.w2);
  }).length;

  const buildUiLogs = (currentDays) =>
    currentDays.flatMap(d => [
      { day: d.day, block: "0-12h",  start_time: d.start1 || "", entries: d.w1.map(r => ({ fio2: r.fio2, dur: r.dur })) },
      { day: d.day, block: "12-24h", start_time: d.start2 || "", entries: d.w2.map(r => ({ fio2: r.fio2, dur: r.dur })) },
    ]);

  /** Upsert UI day/blocks onto last server logs (preserve days not on screen). */
  const mergeLogsForSave = (uiLogs) => {
    const merged = (lastServerLogsRef.current || []).map(l => ({ ...l }));
    for (const u of uiLogs) {
      const day = Number(u.day);
      const block = String(u.block || "");
      const idx = merged.findIndex(
        m => Number(m.day) === day && String(m.block || "") === block
      );
      if (idx < 0) merged.push({ ...u });
      else merged[idx] = { ...u };
    }
    return merged;
  };

  const buildDraftPayload = (currentDays) => {
    const total = currentDays.reduce((s, d) => s + dayAUC(d.w1, d.w2), 0);
    const hoursLogged = totalHoursLogged(currentDays);
    const mean = hoursLogged > 0 ? ((total / hoursLogged) * 100).toFixed(1) : "0.0";
    const excess = Math.max(0, total - 0.21 * hoursLogged).toFixed(2);
    const fio2_logs = mergeLogsForSave(buildUiLogs(currentDays));
    return {
      enrollment_id:   enrollmentId,
      total_auc:       parseFloat(total.toFixed(3)),
      mean_daily_fio2: parseFloat(mean),
      excess_o2_auc:   parseFloat(excess),
      fio2_logs,
    };
  };

  /*  Auto-dismiss the window-completion popup  */
  useEffect(() => {
    if (!completionPopup) return;
    const t = setTimeout(() => setCompletionPopup(null), 4000);
    return () => clearTimeout(t);
  }, [completionPopup]);

  /*  Auto-dismiss the save-confirmation popup  */
  useEffect(() => {
    if (!showSavedPopup) return;
    const t = setTimeout(() => setShowSavedPopup(false), 3000);
    return () => clearTimeout(t);
  }, [showSavedPopup]);

  /*  Auto-save every 10 seconds (silent, no validation messages)  */
  const autoSave = useCallback(async () => {
    // Only autosave when there's something new to persist; this is a dirty-flag
    // check, not a "has it ever been saved" check, so it keeps firing on Day 2..7
    // edits after the very first save.
    if (!enrollmentId || !daysRef.current || !hasUnsavedChanges) return;
    setAutoSaveStatus("saving");
    try {
      const currentDays = daysRef.current;
      const grandTotalVal = currentDays.reduce((s, d) => s + dayAUC(d.w1, d.w2), 0);
      const hoursLoggedVal = totalHoursLogged(currentDays);
      const meanFiO2Val = hoursLoggedVal > 0 ? ((grandTotalVal / hoursLoggedVal) * 100).toFixed(1) : "0.0";
      const excessO2Val = Math.max(0, grandTotalVal - 0.21 * hoursLoggedVal).toFixed(2);
      
      const fio2_logs = mergeLogsForSave(buildUiLogs(currentDays));
      const payload = {
        enrollment_id:   enrollmentId,
        total_auc:       parseFloat(grandTotalVal.toFixed(3)),
        mean_daily_fio2: parseFloat(meanFiO2Val),
        excess_o2_auc:   parseFloat(excessO2Val),
        fio2_logs,
      };

      // Prefer PUT upsert; fall back to POST (also upserts on backend).
      try {
        await api.put(`/fio2-auc/${enrollmentId}`, payload);
      } catch (err) {
        if (err?.response?.status !== 404 && err?.response?.status !== 405) throw err;
        await api.post("/fio2-auc/", payload);
      }
      lastServerLogsRef.current = fio2_logs.map(l => ({ ...l }));
      setIsSaved(true);
      setHasUnsavedChanges(false);
      setAutoSaveStatus("saved");
      setTimeout(() => setAutoSaveStatus(""), 2000);
    } catch (err) {
      console.error("Auto-save failed:", err);
      setAutoSaveStatus("error");
      setTimeout(() => setAutoSaveStatus(""), 3000);
    }
  }, [enrollmentId, hasUnsavedChanges]);

  /*  Auto-save interval (10 seconds)  */
  useEffect(() => {
    daysRef.current = days;
  }, [days]);

  useEffect(() => {
    autoSaveTimer.current = setInterval(() => {
      autoSave();
    }, 10000); // 10 seconds
    
    return () => {
      if (autoSaveTimer.current) {
        clearInterval(autoSaveTimer.current);
      }
    };
  }, [autoSave]);

  /*  Save / Submit  */
  const handleSubmit = async () => {
    try {
      if (!enrollmentId) { setMessage("Enrollment ID missing"); return false; }
      
      // Validate all entries before saving
      for (const day of days) {
        for (const win of ["w1", "w2"]) {
          for (const row of day[win]) {
            const fio2 = parseFloat(row.fio2);
            const dur = parseFloat(row.dur);
            if (row.fio2 && (isNaN(fio2) || fio2 < 0 || fio2 > 100)) {
              setMessage(`FiO2 must be 0-100 (Day ${day.day}, ${win === "w1" ? "0-12h" : "12-24h"})`);
              return false;
            }
            if (row.dur && (isNaN(dur) || dur <= 0 || dur > 12)) {
              setMessage(`Duration must be 0-12 hours (Day ${day.day}, ${win === "w1" ? "0-12h" : "12-24h"})`);
              return false;
            }
          }
          const windowHrs = windowHours(day[win]);
          if (windowHrs > 12.01) {
            setMessage(`${win === "w1" ? "0-12h" : "12-24h"} window exceeds 12 hours on Day ${day.day}`);
            return false;
          }
        }
      }
      
      const fio2_logs = mergeLogsForSave(buildUiLogs(days));
      const payload = {
        enrollment_id:   enrollmentId,
        total_auc:       parseFloat(grandTotal.toFixed(3)),
        mean_daily_fio2: parseFloat(meanFiO2),
        excess_o2_auc:   parseFloat(excessO2),
        fio2_logs,
      };
      try {
        await api.put(`/fio2-auc/${enrollmentId}`, payload);
      } catch (err) {
        if (err?.response?.status !== 404 && err?.response?.status !== 405) throw err;
        await api.post("/fio2-auc/", payload);
      }
      lastServerLogsRef.current = fio2_logs.map(l => ({ ...l }));
      markFormCompleted("fio2_auc");
      setMessage("FiO2 data saved successfully");
      setIsSaved(true);
      setHasUnsavedChanges(false);
      setShowSavedPopup(true);
      setTimeout(() => setMessage(""), 3000);
      return true;
    } catch (err) {
      console.error(err);
      setMessage("Error saving FiO2 data");
      return false;
    }
  };

  const saveForLater = async () => {
    if (!enrollmentId) {
      setMessage("Enrollment ID missing. Cannot save draft.");
      return false;
    }
    try {
      const payload = buildDraftPayload(days);
      try {
        await api.put(`/fio2-auc/${enrollmentId}`, payload);
      } catch (err) {
        if (err?.response?.status !== 404 && err?.response?.status !== 405) throw err;
        await api.post("/fio2-auc/", payload);
      }
      lastServerLogsRef.current = (payload.fio2_logs || []).map(l => ({ ...l }));
      setIsSaved(true);
      setHasUnsavedChanges(false);
      setMessage("Draft saved - return any time to complete");
      setTimeout(() => setMessage(""), 3000);
      return true;
    } catch (err) {
      console.error("Draft save failed:", err);
      setMessage("Draft save failed.");
      return false;
    }
  };

  // Route matches the registered path in App.js (/vs6-1/:enrollmentId), not
  // "/resp-cv-neuro/..." which does not exist and previously led to a blank page.
  const handleNext = async () => {
    const ok = await handleSubmit();
    if (ok) navigate(`/vs6-1/${enrollmentId}`);
  };

  const handlePrevious = async () => {
    if (isSaved) {
      navigate(`/form-e/${enrollmentId}`);
    } else {
      const ok = await handleSubmit();
      if (ok) navigate(`/form-e/${enrollmentId}`);
    }
  };

  // FIX (Export PDF): previously just called window.print() directly, which
  // (a) printed the whole app shell — sidebar, buttons, footer — see the
  // @media print rules in FiO2AUC.css for that half of the fix, and (b)
  // only showed whichever single day happened to be expanded on screen,
  // since collapsed days only render a summary chip, not the actual rows.
  // Expanding every day first means the printed/PDF output has full detail
  // for all recorded days; the previous expand/collapse state is restored
  // afterward so it doesn't disrupt what the nurse was doing on screen.
  const handleExportPdf = () => {
    const prevExpanded = days.map(d => d.expanded);
    setDays(prev => prev.map(d => ({ ...d, expanded: true })));
    setTimeout(() => {
      window.print();
      setDays(prev => prev.map((d, i) => ({ ...d, expanded: prevExpanded[i] })));
    }, 50);
  };

  /* 
     RENDER
   */
  return (
    <div className="fio2-page">

      {/*  PAGE HEADER (matches FormC/D/E style)  */}
      <div className="form-header-action-row">
        <div className="form-header-title-area">
          <div className="form-breadcrumb"><span style={{fontSize:12}}></span> HELPER FORM 1</div>
          <h2 className="form-main-title">FiO2 AUC Log</h2>
          <p className="form-main-subtitle">Area under the FiO2 curve - first 7 days of life</p>
        </div>
        <div className="form-header-meta-area">
          {patient.enrollment_id && (
            <div className="screening-id-badge">
              <span className="id-label">Enrollment ID</span>
              <span className="id-val">{patient.enrollment_id}</span>
            </div>
          )}
          {patient.dob && (
            <div className="screening-id-badge">
              <span className="id-label">DOB</span>
              <span className="id-val">{patient.dob}</span>
            </div>
          )}
          {patient.gestation && (
            <div className="screening-id-badge">
              <span className="id-label">
                Gestation{patient.gestation_source === "Form D NBS" ? " (NBS)" : ""}
              </span>
              <span className="id-val">{patient.gestation}</span>
            </div>
          )}
        </div>
      </div>

      {/*  Auto-save status indicator  */}
      {autoSaveStatus && (
        <div className={`fio2-autosave-toast ${autoSaveStatus}`}>
          {autoSaveStatus === "saving" && "Auto-saving..."}
          {autoSaveStatus === "saved" && "Auto-saved"}
          {autoSaveStatus === "error" && "Auto-save failed"}
        </div>
      )}

      {/*  MAIN  */}
      <main className="fio2-main">

        {/*  KPI CARDS  */}
        <section className="fio2-kpi-grid">
          {/* Wide card: Total AUC + Excess O2 */}
          <div className="kpi-card kpi-card--primary">
            <div className="kpi-primary-left">
              <p className="kpi-label">7-Day Cumulative Total</p>
              <div className="kpi-value-row">
                <span className="kpi-big">{grandTotal.toFixed(1)}</span>
                <span className="kpi-unit">FiO2-hr</span>
              </div>
            </div>
            <div className="kpi-primary-right">
              <p className="kpi-label">Cumulative Excess O2</p>
              <div className="kpi-value-row kpi-value-row--right">
                <span className="kpi-big">{excessO2}</span>
                <span className="kpi-unit">&gt;21% FiO2-hr</span>
              </div>
            </div>
            <div className="kpi-glow" />
          </div>

          {/* Mean FiO2 */}
          <div className="kpi-card kpi-card--white">
            <p className="kpi-label kpi-label--muted">Average Mean FiO2</p>
            <div className="kpi-value-row">
              <span className="kpi-big kpi-big--dark">{meanFiO2}%</span>
              <span className="kpi-unit kpi-unit--muted">Trial Avg</span>
            </div>
            <div className="kpi-progress-track">
              <div className="kpi-progress-fill" style={{ width: `${clamp(parseFloat(meanFiO2), 0, 100)}%` }} />
            </div>
          </div>

          {/* Days complete */}
          <div className="kpi-card kpi-card--white">
            <p className="kpi-label kpi-label--muted">Days Complete</p>
            <div className="kpi-value-row">
              <span className="kpi-big kpi-big--dark">
                {daysComplete} / {Math.max(days.length, 1)}
              </span>
            </div>
            <div className="kpi-progress-track">
              <div
                className="kpi-progress-fill kpi-progress-fill--green"
                style={{ width: `${days.length ? (daysComplete / days.length) * 100 : 0}%` }}
              />
            </div>
          </div>
        </section>

        {/*  LOGGING TITLE  */}
        <div className="fio2-section-header">
          <h3 className="fio2-section-title">
            <span className="fio2-section-icon">&#128203;</span>
            Daily FiO2 Logging (Supplemental O₂ days)
          </h3>
          <div className="fio2-section-actions">
            <button
              type="button"
              className="btn-export"
              onClick={() => syncDaysFromHelper2({ preserveLocal: true, showToast: true })}
              disabled={helper2Refreshing || daysLoading}
              title="Re-sync which days appear from Helper Form 2 (Supplemental O₂ = Yes)"
            >
              <RefreshCw size={14} className={helper2Refreshing ? "fio2-spin" : ""} />
              {helper2Refreshing ? "Refreshing…" : "Refresh from Helper 2"}
            </button>
            <button type="button" className="btn-export" onClick={handleExportPdf}>
              &#11123; Export PDF
            </button>
          </div>
        </div>

        {/*  DAY CARDS  */}
        <div className="day-stack">
          {daysLoading && !days.length ? (
            <div className="fio2-empty-state">Loading Supplemental O₂ days from Helper 2…</div>
          ) : !days.length ? (
            <div className="fio2-empty-state">
              FiO2 AUC tracking starts once Helper Form 2 records a day with Supplemental O₂ = Yes.
            </div>
          ) : days.map((d, idx) => {
            const dAuc  = dayAUC(d.w1, d.w2);
            const mFiO2 = ((dAuc / 24) * 100).toFixed(1);
            const h1    = windowHours(d.w1);
            const h2    = windowHours(d.w2);
            // Use a tolerance instead of strict equality  summed parseFloat
            // durations (e.g. 4.1 + 4.1 + 3.8) can land on 11.999999999999998
            // rather than exactly 12, which would otherwise never register as done.
            // Also require FiO₂ filled — default dur=12 alone is not complete.
            const windowHasFio2 = (rows) =>
              (rows || []).length > 0 && (rows || []).every(r => String(r.fio2 ?? "").trim() !== "");
            const done  = Math.abs(h1 - 12) < 0.01 && Math.abs(h2 - 12) < 0.01
              && windowHasFio2(d.w1) && windowHasFio2(d.w2);

            // Day is locked if any previous *rendered* day is incomplete
            const isLocked = idx > 0 && days.slice(0, idx).some(prev => {
              const ph1 = windowHours(prev.w1);
              const ph2 = windowHours(prev.w2);
              return Math.abs(ph1 - 12) >= 0.01 || Math.abs(ph2 - 12) >= 0.01;
            });
            const prevRendered = idx > 0 ? days[idx - 1] : null;

            return (
              <div key={d.day} className={`day-card${d.expanded ? " day-card--open" : ""}${isLocked ? " day-card--locked" : ""}`}>

                {/* Day header */}
                <div className="day-header" onClick={() => !isLocked && toggleDay(d.day)}
                  style={{ cursor: isLocked ? "not-allowed" : "pointer" }}>
                  <div className="day-header-left">
                    <span className={`day-bubble${d.expanded ? " day-bubble--active" : ""}${isLocked ? " day-bubble--locked" : ""}`}>
                      {isLocked ? "L" : d.day}
                    </span>
                    <span className="day-title" style={{ color: isLocked ? "#94a3b8" : undefined }}>
                      Day {d.day}
                    </span>
                    {isLocked && prevRendered && (
                      <span className="locked-hint">
                        Complete Day {prevRendered.day} first
                      </span>
                    )}
                    {!d.expanded && !isLocked && (
                      <div className="day-preview-chips">
                        <span className="chip chip--blue">AUC {dAuc.toFixed(2)}</span>
                        <span className="chip chip--grey">Mean {mFiO2}%</span>
                      </div>
                    )}
                  </div>
                  <div className="day-header-right">
                    {isLocked
                      ? <span className="locked-pill">Locked</span>
                      : done
                        ? <span className="validated-pill">&#10003; VALIDATED</span>
                        : <span className="incomplete-pill">&#9679; Incomplete</span>
                    }
                    {!isLocked && (
                      <span className="day-chevron">{d.expanded ? "^" : "v"}</span>
                    )}
                  </div>
                </div>

                {/* Day body  only shown if unlocked and expanded */}
                {d.expanded && !isLocked && (
                  <div className="day-body">
                    <div className="start-time-grid">
                      <div className="start-time-field">
                        <label>Start timing hour of life - 1-12hr</label>
                        <input
                          type="time"
                          value={d.start1 || ""}
                          onChange={e => updateStartTime(d.day, "start1", e.target.value)}
                          className="entry-input" />
                      </div>
                      <div className="start-time-field">
                        <label>Start timing hour of life - 13-24h</label>
                        <input
                          type="time"
                          value={d.start2 || ""}
                          onChange={e => updateStartTime(d.day, "start2", e.target.value)}
                          className="entry-input" />
                      </div>
                    </div>
                    <div className="windows-grid">
                      <WindowCard
                        title="WINDOW: 1 - 12 HOURS"
                        rows={d.w1}
                        onRowChange={(id, f, v) => updateRow(d.day, "w1", id, f, v)}
                        onAddRow={() => addRow(d.day, "w1")}
                        onDelRow={id => delRow(d.day, "w1", id)} />

                      <WindowCard
                        title="WINDOW: 13 - 24 HOURS"
                        rows={d.w2}
                        onRowChange={(id, f, v) => updateRow(d.day, "w2", id, f, v)}
                        onAddRow={() => addRow(d.day, "w2")}
                        onDelRow={id => delRow(d.day, "w2", id)} />
                    </div>

                    {/* Daily metrics footer */}
                    <div className="day-metrics-footer">
                      <div className="day-metric-tile">
                        <span className="dmt-label">Daily AUC</span>
                        <span className="dmt-value dmt-value--blue">{dAuc.toFixed(2)}</span>
                      </div>
                      <div className="day-metric-tile">
                        <span className="dmt-label">Mean Daily FiO2</span>
                        <span className="dmt-value dmt-value--blue">{mFiO2}%</span>
                      </div>
                      <div className="day-metric-tile">
                        <span className="dmt-label">Excess O2 AUC</span>
                        <span className="dmt-value dmt-value--green">
                          {Math.max(0, dAuc - 0.21 * 24).toFixed(3)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/*  INFO CARD  */}
        <div className="info-card">
          <span className="info-icon">&#9432;</span>
          <div className="info-content">
            <h4 className="info-title">Logging Rules &amp; Formulas</h4>
            <ul className="info-list">
              <li><strong>Daily Cumulative AUC</strong> = Sum of (FiO2 x Hours) for the full 24h period.</li>
              <li><strong>Excess O2 AUC</strong> = Total Cumulative AUC - (21% x 24 hours).</li>
              <li>Record actual FiO2 delivered, even if it differs from the prescribed set point.</li>
              <li>If FiO2 changed within a 12h block, add a new row to record the duration of each FiO2 level.</li>
            </ul>
          </div>
        </div>

        {/*  MESSAGE  */}
        {message && (
          <div className={`fio2-message${/saved|successfully/i.test(message) ? " fio2-message--ok" : " fio2-message--err"}`}>
            {message}
          </div>
        )}

        <div className="fio2-spacer" />
      </main>

      {/*  STICKY FOOTER  matches FormC/D/E exactly  */}
      <div className="form-navigation">
        <button type="button" className="btn btn-secondary btn-outline"
          onClick={handlePrevious}>
          <ArrowLeft size={15} /> NICU Admission
        </button>
        <button type="button" className="btn btn-save btn-outline-blue"
          onClick={handleSubmit}>
          <Save size={15} /> Save
        </button>
        <button type="button" className="btn btn-draft"
          onClick={saveForLater}>
          <Save size={15} /> Save for Later
        </button>
        <div className="footer-step-indicator">
          <span className="step-text">HELPER 1 OF 4</span>
          <div className="step-progress-line">
            <div className="progress-segment active" />
            <div className="progress-segment" />
            <div className="progress-segment" />
            <div className="progress-segment" />
          </div>
        </div>
        <button type="button" className="btn btn-primary"
          onClick={handleNext} disabled={!isSaved}>
          Resp-CV-Neuro <ArrowRight size={15} />
        </button>
      </div>

      {/* WINDOW COMPLETION POPUP */}
      {completionPopup && (
        <div className="fio2-completion-popup-overlay" onClick={() => setCompletionPopup(null)}>
          <div className="fio2-completion-popup-box" onClick={e => e.stopPropagation()}>
            <div className="fio2-completion-popup-icon">&#10003;</div>
            <h3>12 Hours Logged</h3>
            <p>Day {completionPopup.day} &middot; {completionPopup.window} window is now fully accounted for.</p>
            <button type="button" className="fio2-completion-popup-btn" onClick={() => setCompletionPopup(null)}>
              Got it
            </button>
          </div>
        </div>
      )}

      {/* SAVE CONFIRMATION POPUP */}
      {showSavedPopup && (
        <div className="fio2-completion-popup-overlay" onClick={() => setShowSavedPopup(false)}>
          <div className="fio2-completion-popup-box" onClick={e => e.stopPropagation()}>
            <div className="fio2-completion-popup-icon">&#128190;</div>
            <h3>Form Saved</h3>
            <p>FiO2 AUC data has been saved successfully.</p>
            <button type="button" className="fio2-completion-popup-btn" onClick={() => setShowSavedPopup(false)}>
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
