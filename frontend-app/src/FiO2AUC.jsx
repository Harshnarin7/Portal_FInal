import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { usePatient } from "./context/PatientContext";
import { useFormProgress } from "./context/FormProgressContext";
import api from "./api/axios";
import "./styles/FormC.css";
import "./styles/FiO2AUC.css";

/* ════════════════════════════════════════════
   CONSTANTS & PURE HELPERS
════════════════════════════════════════════ */
const DAYS   = [1, 2, 3, 4, 5, 6, 7];
const mkRow  = () => ({ id: Date.now() + Math.random(), fio2: "", dur: "" });

const rowAUC      = (fio2, dur) => ((parseFloat(fio2) || 0) / 100) * (parseFloat(dur) || 0);
const windowAUC   = rows => rows.reduce((s, r) => s + rowAUC(r.fio2, r.dur), 0);
const windowHours = rows => rows.reduce((s, r) => s + (parseFloat(r.dur) || 0), 0);
const dayAUC      = (w1, w2) => windowAUC(w1) + windowAUC(w2);
const clamp       = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

/* ════════════════════════════════════════════
   HOURS PROGRESS BAR
════════════════════════════════════════════ */
function HoursBar({ used }) {
  const pct  = clamp((used / 12) * 100, 0, 100);
  const over = used > 12;
  const done = used === 12;
  const cls  = over ? "hb-danger" : done ? "hb-ok" : used >= 9 ? "hb-warn" : "hb-idle";
  return (
    <div className="hb-wrap">
      <div className="hb-track">
        <div className={`hb-fill ${cls}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`hb-label ${cls}`}>
        {used.toFixed(1)} / 12 h {done ? "✓" : over ? "⚠ exceeds 12h" : ""}
      </span>
    </div>
  );
}

/* ════════════════════════════════════════════
   WINDOW CARD  (1–12h  or  13–24h)
════════════════════════════════════════════ */
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
        <span>FiO₂ (%)</span>
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
              type="number" min={21} max={100} placeholder="21–100"
              value={row.fio2}
              className={`entry-input${fioErr ? " entry-input--err" : row.fio2 ? " entry-input--ok" : ""}`}
              onChange={e => onRowChange(row.id, "fio2", e.target.value)} />
            <input
              type="number" min={0} max={12} placeholder="0–12"
              value={row.dur}
              className={`entry-input${row.dur && Number(row.dur) < 0 ? " entry-input--err" : row.dur ? " entry-input--ok" : ""}`}
              onChange={e => onRowChange(row.id, "dur", e.target.value)} />
            <div className="entry-auc">
              {ra > 0 ? ra.toFixed(2) : "—"}
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
        <span className="add-row-icon">+</span> Add FiO₂ Change
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

/* ════════════════════════════════════════════
   MAIN COMPONENT
════════════════════════════════════════════ */
export default function Fio2AUCForm() {
  const navigate = useNavigate();
  const { markFormCompleted } = useFormProgress();
  const { enrollmentId }      = useParams();
  const { patientData }       = usePatient();

  /* ── Patient identification ── */
  const [patient, setPatient] = useState({
    enrollment_id: "", dob: "", gestation: "", mother_name: "", maternal_uid: ""
  });

  /* ── Per-day state ── */
  const [days, setDays] = useState(() =>
    DAYS.map(d => ({ day: d, expanded: d === 1, w1: [mkRow()], w2: [mkRow()] }))
  );

  /* ── UI state ── */
  const [message, setMessage] = useState("");
  const [isSaved, setIsSaved] = useState(false);

  /* ── Load identification from PatientContext ── */
  useEffect(() => {
    if (!patientData) return;
    const g = patientData.gestation_weeks != null
      ? `${patientData.gestation_weeks}+${patientData.gestation_days ?? 0} wks` : "";
    setPatient(p => ({
      ...p,
      enrollment_id: patientData.enrollment_id || "",
      dob:           patientData.dob || "",
      gestation:     g,
      mother_name:   patientData.mother_name  || patientData.baby_name || "",
      maternal_uid:  patientData.maternal_uid || "",
    }));
  }, [patientData]);

  /* ── Load identification from Form B ── */
  useEffect(() => {
    if (!enrollmentId) return;
    api.get(`/birth-resuscitation/${enrollmentId}`).then(res => {
      const b = res?.data || {};
      const g = b?.gestation_weeks != null
        ? `${b.gestation_weeks}+${b.gestation_days ?? 0} wks` : "";
      setPatient(p => ({
        ...p,
        enrollment_id: b?.enrollment_id || enrollmentId,
        dob:           b?.date_of_birth ? b.date_of_birth.split("T")[0] : "",
        gestation:     g,
        mother_name:   `${b?.mother_name_first || ""} ${b?.mother_name_surname || ""}`.trim(),
        maternal_uid:  b?.baby_uid || b?.maternal_uid || "",
      }));
    }).catch(() => {});
  }, [enrollmentId]);

  /* ── Load saved FiO₂ AUC record and rehydrate all 7 days ── */
  useEffect(() => {
    if (!enrollmentId) return;
    api.get(`/fio2-auc/${enrollmentId}`)
      .then(res => {
        const list = Array.isArray(res.data) ? res.data : [];
        if (!list.length) return;
        const record = list[0]; // most recent record
        const logs   = Array.isArray(record.fio2_logs) ? record.fio2_logs : [];
        if (!logs.length) return;

        setDays(prev => prev.map(dayState => {
          const w1Log = logs.find(l => l.day === dayState.day && l.block === "0–12h");
          const w2Log = logs.find(l => l.day === dayState.day && l.block === "12–24h");

          const restoreEntries = (log) => {
            if (!log) return [mkRow()];
            const entries = Array.isArray(log.entries) ? log.entries : [];
            if (!entries.length) return [mkRow()];
            // Regenerate IDs to avoid React key collisions; preserve fio2/dur values
            return entries.map(e => ({
              id:  Date.now() + Math.random(),
              fio2: e.fio2 != null ? String(e.fio2) : "",
              dur:  e.dur  != null ? String(e.dur)  : "",
            }));
          };

          return {
            ...dayState,
            w1: restoreEntries(w1Log),
            w2: restoreEntries(w2Log),
            // Expand day 1, collapse rest (same as initial state)
            expanded: dayState.day === 1,
          };
        }));

        setIsSaved(true);
      })
      .catch(err => {
        if (err?.response?.status !== 404)
          console.log("❌ Error loading FiO₂ AUC data", err);
      });
  }, [enrollmentId]);

  /* ── Day helpers ── */
  const setDay = useCallback((dayNum, fn) =>
    setDays(prev => prev.map(d => d.day === dayNum ? { ...d, ...fn(d) } : d)), []);

  const toggleDay     = d  => setDay(d, x => ({ expanded: !x.expanded }));
  const addRow        = (d, win) => setDay(d, x => ({ [win]: [...x[win], mkRow()] }));
  const delRow        = (d, win, id) =>
    setDay(d, x => ({ [win]: x[win].length > 1 ? x[win].filter(r => r.id !== id) : x[win] }));
  const updateRow     = (d, win, id, field, value) => {
    setDays(prev => {
      const updated = prev.map(x => x.day === d
        ? { ...x, [win]: x[win].map(r => r.id === id ? { ...r, [field]: value } : r) }
        : x
      );
      const thisDay = updated.find(x => x.day === d);
      if (!thisDay) return updated;
      const h1 = windowHours(thisDay.w1);
      const h2 = windowHours(thisDay.w2);
      const justCompleted = Math.abs(h1 - 12) < 0.01 && Math.abs(h2 - 12) < 0.01;
      if (!justCompleted) return updated;
      // Auto-collapse this day, expand the next
      return updated.map(x => {
        if (x.day === d)     return { ...x, expanded: false };
        if (x.day === d + 1) return { ...x, expanded: true };
        return x;
      });
    });
  };

  /* ── Totals ── */
  const grandTotal   = days.reduce((s, d) => s + dayAUC(d.w1, d.w2), 0);
  const meanFiO2     = ((grandTotal / 168) * 100).toFixed(1);
  const excessO2     = Math.max(0, grandTotal - 0.21 * 168).toFixed(2);
  const daysComplete = days.filter(d => {
    const h1 = windowHours(d.w1);
    const h2 = windowHours(d.w2);
    return Math.abs(h1 - 12) < 0.01 && Math.abs(h2 - 12) < 0.01;
  }).length;

  /* ── Save / Submit ── */
  const handleSubmit = async () => {
    try {
      if (!enrollmentId) { setMessage("❌ Enrollment ID missing"); return; }
      
      // Validate all entries before saving
      for (const day of days) {
        for (const win of ["w1", "w2"]) {
          for (const row of day[win]) {
            const fio2 = parseFloat(row.fio2);
            const dur = parseFloat(row.dur);
            if (row.fio2 && (isNaN(fio2) || fio2 < 0 || fio2 > 100)) {
              setMessage(`❌ FiO₂ must be 0–100 (Day ${day.day}, ${win === "w1" ? "0–12h" : "12–24h"})`);
              return;
            }
            if (row.dur && (isNaN(dur) || dur <= 0 || dur > 12)) {
              setMessage(`❌ Duration must be 0–12 hours (Day ${day.day}, ${win === "w1" ? "0–12h" : "12–24h"})`);
              return;
            }
          }
          const windowHrs = windowHours(day[win]);
          if (windowHrs > 12.01) {
            setMessage(`❌ ${win === "w1" ? "0–12h" : "12–24h"} window exceeds 12 hours on Day ${day.day}`);
            return;
          }
        }
      }
      
      const fio2_logs = days.flatMap(d => [
        { day: d.day, block: "0–12h",  entries: d.w1.map(r => ({ fio2: r.fio2, dur: r.dur })) },
        { day: d.day, block: "12–24h", entries: d.w2.map(r => ({ fio2: r.fio2, dur: r.dur })) },
      ]);
      const payload = {
        enrollment_id:   enrollmentId,
        total_auc:       parseFloat(grandTotal.toFixed(3)),
        mean_daily_fio2: parseFloat(meanFiO2),
        excess_o2_auc:   parseFloat(excessO2),
        fio2_logs,
      };
      if (isSaved) {
        await api.put(`/fio2-auc/${enrollmentId}`, payload);
      } else {
        await api.post("/fio2-auc/", payload);
      }
      markFormCompleted("fio2_auc");
      setMessage("✅ FiO₂ data saved successfully");
      setIsSaved(true);
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      console.error(err);
      setMessage("❌ Error saving FiO₂ data");
    }
  };

  const handleNext = async () => { await handleSubmit(); navigate(`/vs6-1/${enrollmentId}`); };

  /* ════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════ */
  return (
    <div className="fio2-page">

      {/* ── PAGE HEADER (matches FormC/D/E style) ── */}
      <div className="form-header-action-row">
        <div className="form-header-title-area">
          <div className="form-breadcrumb"><span style={{fontSize:12}}>🏠</span> HELPER FORM 1</div>
          <h2 className="form-main-title">FiO₂ AUC Log</h2>
          <p className="form-main-subtitle">Area under the FiO₂ curve — first 7 days of life</p>
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
              <span className="id-label">Gestation</span>
              <span className="id-val">{patient.gestation}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── MAIN ── */}
      <main className="fio2-main">

        {/* ── KPI CARDS ── */}
        <section className="fio2-kpi-grid">
          {/* Wide card: Total AUC + Excess O2 */}
          <div className="kpi-card kpi-card--primary">
            <div className="kpi-primary-left">
              <p className="kpi-label">7-Day Cumulative Total</p>
              <div className="kpi-value-row">
                <span className="kpi-big">{grandTotal.toFixed(1)}</span>
                <span className="kpi-unit">FiO₂·hr</span>
              </div>
            </div>
            <div className="kpi-primary-right">
              <p className="kpi-label">Cumulative Excess O₂</p>
              <div className="kpi-value-row kpi-value-row--right">
                <span className="kpi-big">{excessO2}</span>
                <span className="kpi-unit">&gt;21% FiO₂·hr</span>
              </div>
            </div>
            <div className="kpi-glow" />
          </div>

          {/* Mean FiO2 */}
          <div className="kpi-card kpi-card--white">
            <p className="kpi-label kpi-label--muted">Average Mean FiO₂</p>
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
              <span className="kpi-big kpi-big--dark">{daysComplete} / 7</span>
            </div>
            <div className="kpi-progress-track">
              <div className="kpi-progress-fill kpi-progress-fill--green" style={{ width: `${(daysComplete / 7) * 100}%` }} />
            </div>
          </div>
        </section>

        {/* ── LOGGING TITLE ── */}
        <div className="fio2-section-header">
          <h3 className="fio2-section-title">
            <span className="fio2-section-icon">&#128203;</span>
            Daily FiO₂ Logging (First 7 Days)
          </h3>
          <div className="fio2-section-actions">
            <button type="button" className="btn-export" onClick={() => window.print()}>
              &#11123; Export PDF
            </button>
            <button type="button" className="btn-submit" onClick={handleSubmit}>
              &#128190; Save
            </button>
          </div>
        </div>

        {/* ── DAY CARDS ── */}
        <div className="day-stack">
          {days.map((d, idx) => {
            const dAuc  = dayAUC(d.w1, d.w2);
            const mFiO2 = ((dAuc / 24) * 100).toFixed(1);
            const h1    = windowHours(d.w1);
            const h2    = windowHours(d.w2);
            const done  = h1 === 12 && h2 === 12;

            // Day is locked if any previous day is incomplete
            const isLocked = idx > 0 && days.slice(0, idx).some(prev => {
              const ph1 = windowHours(prev.w1);
              const ph2 = windowHours(prev.w2);
              return ph1 !== 12 || ph2 !== 12;
            });

            return (
              <div key={d.day} className={`day-card${d.expanded ? " day-card--open" : ""}${isLocked ? " day-card--locked" : ""}`}>

                {/* Day header */}
                <div className="day-header" onClick={() => !isLocked && toggleDay(d.day)}
                  style={{ cursor: isLocked ? "not-allowed" : "pointer" }}>
                  <div className="day-header-left">
                    <span className={`day-bubble${d.expanded ? " day-bubble--active" : ""}${isLocked ? " day-bubble--locked" : ""}`}>
                      {isLocked ? "🔒" : d.day}
                    </span>
                    <span className="day-title" style={{ color: isLocked ? "#94a3b8" : undefined }}>
                      Day {d.day}
                    </span>
                    {isLocked && (
                      <span className="locked-hint">
                        Complete Day {d.day - 1} first
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
                      ? <span className="locked-pill">🔒 Locked</span>
                      : done
                        ? <span className="validated-pill">&#10003; VALIDATED</span>
                        : <span className="incomplete-pill">&#9679; Incomplete</span>
                    }
                    {!isLocked && (
                      <span className="day-chevron">{d.expanded ? "▲" : "▼"}</span>
                    )}
                  </div>
                </div>

                {/* Day body — only shown if unlocked and expanded */}
                {d.expanded && !isLocked && (
                  <div className="day-body">
                    <div className="windows-grid">
                      <WindowCard
                        title="WINDOW: 1 – 12 HOURS"
                        rows={d.w1}
                        onRowChange={(id, f, v) => updateRow(d.day, "w1", id, f, v)}
                        onAddRow={() => addRow(d.day, "w1")}
                        onDelRow={id => delRow(d.day, "w1", id)} />

                      <WindowCard
                        title="WINDOW: 13 – 24 HOURS"
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
                        <span className="dmt-label">Mean Daily FiO₂</span>
                        <span className="dmt-value dmt-value--blue">{mFiO2}%</span>
                      </div>
                      <div className="day-metric-tile">
                        <span className="dmt-label">Excess Oxygen AUC</span>
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

        {/* ── INFO CARD ── */}
        <div className="info-card">
          <span className="info-icon">&#9432;</span>
          <div className="info-content">
            <h4 className="info-title">Logging Rules &amp; Formulas</h4>
            <ul className="info-list">
              <li><strong>Daily Cumulative AUC</strong> = Sum of (FiO₂ × Hours) for the full 24h period.</li>
              <li><strong>Excess O₂ AUC</strong> = Total Cumulative AUC − (21% × 24 hours).</li>
              <li>Record actual FiO₂ delivered, even if it differs from the prescribed set point.</li>
              <li>If FiO₂ changed within a 12h block, add a new row to record the duration of each FiO₂ level.</li>
            </ul>
          </div>
        </div>

        {/* ── MESSAGE ── */}
        {message && (
          <div className={`fio2-message${message.startsWith("✅") ? " fio2-message--ok" : " fio2-message--err"}`}>
            {message}
          </div>
        )}

        <div className="fio2-spacer" />
      </main>

      {/* ── STICKY FOOTER — matches FormC/D/E exactly ── */}
      <div className="form-navigation">
        <button type="button" className="btn btn-secondary btn-outline"
          onClick={() => navigate(-1)}>
          ← Form E
        </button>
        <button type="button" className="btn btn-save btn-outline-blue"
          onClick={handleSubmit}>
          💾 Save
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
          Next Form →
        </button>
      </div>
    </div>
  );
}
