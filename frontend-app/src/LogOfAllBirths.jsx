// src/LogOfAllBirths.jsx — digitized "Log of All Births" (paper CRF v1.5,
// 2025-12-15): completed for EVERY birth at the study hospital, not just
// enrolled ones, so a GA-eligible (25w0d-31w6d) delivery with no matching
// Form A screening can be caught. The match against existing screenings is
// computed automatically by the backend (birth_log_matching.py) on every
// save, replacing the paper form's own hand-ticked "Screening form filled
// (Y/N), If Y, screening ID" column.

import React, { useState, useEffect, useCallback, useMemo } from "react";
import api from "./api/axios";
import { useAuth } from "./context/AuthContext";
import { formatDateToDDMMYYYY } from "./utils/datetime";
import {
  ClipboardList, Plus, AlertTriangle, CheckCircle2, HelpCircle, Circle, RefreshCw,
} from "lucide-react";
import "./LogOfAllBirths.css";

const MODES_OF_DELIVERY = ["Emergency LSCS", "Elective LSCS", "NVD", "Instrumental", "Other"];

// Same vocabulary as ScreeningForm.jsx's own NOT_APPROACHED_REASONS, plus
// "No time to approach to screen" -- the PI's own reported scenario (a
// birth too fast to even check gestational age on). This is the only
// place that reason can ever be captured for a birth with no Form A at
// all. Named "...to screen" (not "...for consent") to distinguish it in
// the CONSORT flow from Screening.insufficient_time, which is the SAME
// real-world event class at a later stage -- GA already confirmed
// in-window on Form A, but consent itself couldn't be obtained in time
// (see routers/dashboard.py's box4b "No time to approach for consent").
const NOT_APPROACHED_REASONS = ["No time to approach to screen", "Nurse on leave", "Parent not available", "Missed screening", "Other"];

const BLANK_ENTRY = {
  mother_uid: "",
  mother_name: "",
  husband_name: "",
  date_of_birth: "",
  time_of_birth: "",
  gestation_weeks: "",
  gestation_days: "",
  mode_of_delivery: "",
  birth_weight_grams: "",
  resuscitation_required: "",
  ppv_required: "",
  reason_not_approached_list: [],
  reason_not_approached_other: "",
};

function yn(v) {
  if (v === "Yes") return true;
  if (v === "No") return false;
  return null;
}
function ynLabel(v) {
  if (v === true) return "Yes";
  if (v === false) return "No";
  return "";
}

// Two independent facts (2026-09-24 PI-directed redesign), each its own
// badge, shown together whenever both apply -- see
// birth_log_matching.py's module docstring. `match_status` is purely
// about Form A; `ga_log_missing` is purely about the Gestation Log and is
// shown regardless of match_status (the PI explicitly wants an orphan
// Form A -- matched, but the Gestation Log was bypassed -- flagged too).
function MatchBadges({ status, screeningId, gaLogMissing }) {
  const badges = [];
  if (status === "matched") {
    badges.push(
      <span key="matched" className="lob-badge lob-badge--matched">
        <CheckCircle2 size={13} /> Matched{screeningId ? ` — ${screeningId}` : ""}
      </span>
    );
  } else if (status === "in_range_no_match") {
    badges.push(
      <span key="no-form-a" className="lob-badge lob-badge--alert">
        <AlertTriangle size={13} /> Not filled Form A
      </span>
    );
  } else if (status === "ga_unknown") {
    badges.push(
      <span key="unknown" className="lob-badge lob-badge--unknown">
        <HelpCircle size={13} /> GA unknown
      </span>
    );
  } else {
    badges.push(
      <span key="out-of-range" className="lob-badge lob-badge--neutral">
        <Circle size={13} /> Out of range
      </span>
    );
  }
  if (gaLogMissing) {
    badges.push(
      <span key="no-ga-log" className="lob-badge lob-badge--danger">
        <AlertTriangle size={13} /> Never Checked GA log
      </span>
    );
  }
  return <div className="lob-badge-stack">{badges}</div>;
}

export default function LogOfAllBirths() {
  const { user } = useAuth();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState(BLANK_ENTRY);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [editingId, setEditingId] = useState(null);
  // 2026-09-24: the 5 reason checkboxes are hidden by default and only
  // appear when the user clicks "Add reason" on a row (or when editing
  // an entry that already has a reason saved) -- per the PI's explicit
  // "only show when clicked" decision, not always-visible in the form.
  const [showReasonSection, setShowReasonSection] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError("");
    api.get("/birth-log/")
      .then((res) => setEntries(res.data || []))
      .catch((err) => {
        setLoadError(
          err.response?.status === 403
            ? "You don't have access to this log."
            : "Could not load the birth log."
        );
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const alertCount = useMemo(
    () => entries.filter((e) => e.match_status === "in_range_no_match" || e.ga_log_missing).length,
    [entries]
  );

  const setField = (key, value) => setForm((p) => ({ ...p, [key]: value }));

  const resetForm = () => {
    setForm(BLANK_ENTRY);
    setEditingId(null);
    setSaveError("");
    setShowReasonSection(false);
  };

  const startEdit = (entry) => {
    setEditingId(entry.id);
    const reasonList = entry.reason_not_approached
      ? entry.reason_not_approached.split(",").map((s) => s.trim()).filter(Boolean) : [];
    setForm({
      mother_uid: entry.mother_uid || "",
      mother_name: entry.mother_name || "",
      husband_name: entry.husband_name || "",
      date_of_birth: entry.date_of_birth || "",
      time_of_birth: entry.time_of_birth || "",
      gestation_weeks: entry.gestation_weeks ?? "",
      gestation_days: entry.gestation_days ?? "",
      mode_of_delivery: entry.mode_of_delivery || "",
      birth_weight_grams: entry.birth_weight_grams ?? "",
      resuscitation_required: ynLabel(entry.resuscitation_required),
      ppv_required: ynLabel(entry.ppv_required),
      reason_not_approached_list: reasonList,
      reason_not_approached_other: reasonList.includes("Other") ? (entry.reason_not_approached_other || "") : "",
    });
    setShowReasonSection(reasonList.length > 0);
    setSaveError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // "Add reason" action button (per-row) -- opens the entry for editing
  // AND forces the reason section open, so a user going straight for the
  // reason doesn't have to separately notice/click a second toggle.
  const startAddReason = (entry) => {
    startEdit(entry);
    setShowReasonSection(true);
  };

  const toggleReason = (opt) => setForm((p) => {
    const list = p.reason_not_approached_list.includes(opt)
      ? p.reason_not_approached_list.filter((x) => x !== opt)
      : [...p.reason_not_approached_list, opt];
    return { ...p, reason_not_approached_list: list };
  });

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.mother_uid && !form.mother_name) {
      setSaveError("Enter at least the Mother's UHID/CR Number or Name.");
      return;
    }
    if (!form.date_of_birth) {
      setSaveError("Date of birth is required.");
      return;
    }
    setSaving(true);
    setSaveError("");
    const payload = {
      mother_uid: form.mother_uid || null,
      mother_name: form.mother_name || null,
      husband_name: form.husband_name || null,
      date_of_birth: form.date_of_birth,
      time_of_birth: form.time_of_birth || null,
      gestation_weeks: form.gestation_weeks === "" ? null : Number(form.gestation_weeks),
      gestation_days: form.gestation_days === "" ? null : Number(form.gestation_days),
      mode_of_delivery: form.mode_of_delivery || null,
      birth_weight_grams: form.birth_weight_grams === "" ? null : Number(form.birth_weight_grams),
      resuscitation_required: yn(form.resuscitation_required),
      ppv_required: yn(form.ppv_required),
      reason_not_approached: form.reason_not_approached_list.length > 0
        ? form.reason_not_approached_list.join(", ") : null,
      reason_not_approached_other: form.reason_not_approached_list.includes("Other")
        ? (form.reason_not_approached_other || null) : null,
    };
    try {
      if (editingId) {
        await api.put(`/birth-log/${editingId}`, payload);
      } else {
        await api.post("/birth-log/", payload);
      }
      resetForm();
      load();
    } catch (err) {
      setSaveError(err.response?.data?.detail || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="lob-page">
      <div className="lob-header">
        <div className="lob-breadcrumb">
          <ClipboardList size={14} /> Log of All Births
        </div>
        <h1 className="lob-title">Log of All Births</h1>
        <p className="lob-subtitle">
          Completed for every birth at this hospital, not just trial-enrolled ones —
          catches a GA-eligible (25w0d–31w6d) delivery with no matching Form A on file.
        </p>
      </div>

      {alertCount > 0 && (
        <div className="lob-alert-banner">
          <AlertTriangle size={16} />
          <span>
            <strong>{alertCount}</strong> entr{alertCount === 1 ? "y needs" : "ies need"} review —
            "Not filled Form A" and/or "Never Checked GA log" below.
          </span>
        </div>
      )}

      <form className="lob-card" onSubmit={handleSave}>
        <div className="lob-card-head">
          <h2>{editingId ? "Edit entry" : "Add a birth"}</h2>
          {editingId && (
            <button type="button" className="lob-link-btn" onClick={resetForm}>Cancel edit</button>
          )}
        </div>
        <div className="lob-form-grid">
          <label className="lob-field">
            <span>Mother's UHID / CR Number</span>
            <input value={form.mother_uid} onChange={(e) => setField("mother_uid", e.target.value)} placeholder="e.g. 20260495-4829" />
          </label>
          <label className="lob-field">
            <span>Mother's Name</span>
            <input value={form.mother_name} onChange={(e) => setField("mother_name", e.target.value)} />
          </label>
          <label className="lob-field">
            <span>Husband's Name</span>
            <input value={form.husband_name} onChange={(e) => setField("husband_name", e.target.value)} />
          </label>
          <label className="lob-field">
            <span>Date of Birth *</span>
            <input type="date" value={form.date_of_birth} onChange={(e) => setField("date_of_birth", e.target.value)} required />
          </label>
          <label className="lob-field">
            <span>Time of Birth</span>
            <input type="time" value={form.time_of_birth} onChange={(e) => setField("time_of_birth", e.target.value)} />
          </label>
          <label className="lob-field lob-field--ga">
            <span>Gestation (completed)</span>
            <div className="lob-ga-row">
              <input type="number" min="18" max="45" placeholder="wks" value={form.gestation_weeks} onChange={(e) => setField("gestation_weeks", e.target.value)} />
              <input type="number" min="0" max="6" placeholder="days" value={form.gestation_days} onChange={(e) => setField("gestation_days", e.target.value)} />
            </div>
          </label>
          <label className="lob-field">
            <span>Mode of Delivery</span>
            <select value={form.mode_of_delivery} onChange={(e) => setField("mode_of_delivery", e.target.value)}>
              <option value="">–– Select ––</option>
              {MODES_OF_DELIVERY.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label className="lob-field">
            <span>Birth Weight (g)</span>
            <input type="number" min="200" max="6000" value={form.birth_weight_grams} onChange={(e) => setField("birth_weight_grams", e.target.value)} />
          </label>
          <label className="lob-field">
            <span>Resuscitation required?</span>
            <select value={form.resuscitation_required} onChange={(e) => setField("resuscitation_required", e.target.value)}>
              <option value="">–– Select ––</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </select>
          </label>
          <label className="lob-field">
            <span>PPV required?</span>
            <select value={form.ppv_required} onChange={(e) => setField("ppv_required", e.target.value)}>
              <option value="">–– Select ––</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </select>
          </label>
        </div>

        {!showReasonSection && (
          <button type="button" className="lob-link-btn lob-add-reason-toggle" onClick={() => setShowReasonSection(true)}>
            + Add reason
          </button>
        )}

        {showReasonSection && (
          <div className="lob-reason-section">
            <div className="lob-reason-head">
              <span className="lob-reason-label">Reason not approached</span>
              <button type="button" className="lob-link-btn" onClick={() => setShowReasonSection(false)}>Hide</button>
            </div>
            <div className="lob-reason-group">
              {NOT_APPROACHED_REASONS.map((opt) => (
                <label key={opt} className={`lob-reason-item${form.reason_not_approached_list.includes(opt) ? " checked" : ""}`}>
                  <input type="checkbox" checked={form.reason_not_approached_list.includes(opt)} onChange={() => toggleReason(opt)} />
                  <span>{opt}</span>
                </label>
              ))}
            </div>
            {form.reason_not_approached_list.includes("Other") && (
              <input className="lob-reason-other-input" placeholder="Please specify…"
                value={form.reason_not_approached_other}
                onChange={(e) => setField("reason_not_approached_other", e.target.value)} />
            )}
          </div>
        )}

        {saveError && <div className="lob-form-error">{saveError}</div>}
        <div className="lob-form-actions">
          <button type="submit" className="lob-btn lob-btn--primary" disabled={saving}>
            <Plus size={14} /> {saving ? "Saving…" : editingId ? "Save changes" : "Add entry"}
          </button>
        </div>
      </form>

      <div className="lob-card">
        <div className="lob-card-head">
          <h2>Entries {user?.site_name ? `— ${user.site_name}` : ""}</h2>
          <button type="button" className="lob-icon-btn" onClick={load} disabled={loading} title="Refresh">
            <RefreshCw size={14} className={loading ? "lob-spin" : ""} />
          </button>
        </div>
        {loadError && <div className="lob-form-error">{loadError}</div>}
        <div className="lob-table-wrap">
          <table className="lob-table">
            <thead>
              <tr>
                <th>Date / Time</th>
                <th>Mother's UID</th>
                <th>Mother's Name</th>
                <th>GA</th>
                <th>Mode</th>
                <th>Wt (g)</th>
                <th>Resus.</th>
                <th>PPV</th>
                <th>Screening match</th>
                <th>Reason not approached</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const isAlert = e.match_status === "in_range_no_match" || e.ga_log_missing;
                // "Add reason" only makes sense when Form A is genuinely
                // missing -- an orphan Form A (matched, but
                // ga_log_missing=TRUE) has nothing to explain via "reason
                // not approached", since she WAS screened.
                const canAddReason = e.match_status === "in_range_no_match";
                return (
                  <tr key={e.id} className={isAlert ? "lob-row--alert" : ""}>
                    <td>{e.date_of_birth ? formatDateToDDMMYYYY(e.date_of_birth) : "—"}{e.time_of_birth ? ` ${e.time_of_birth}` : ""}</td>
                    <td>{e.mother_uid || "—"}</td>
                    <td>{e.mother_name || "—"}</td>
                    <td>{e.gestation_weeks != null ? `${e.gestation_weeks}w ${e.gestation_days ?? 0}d` : "—"}</td>
                    <td>{e.mode_of_delivery || "—"}</td>
                    <td>{e.birth_weight_grams ?? "—"}</td>
                    <td>{ynLabel(e.resuscitation_required) || "—"}</td>
                    <td>{ynLabel(e.ppv_required) || "—"}</td>
                    <td><MatchBadges status={e.match_status} screeningId={e.matched_screening_id} gaLogMissing={e.ga_log_missing} /></td>
                    <td>
                      {e.reason_not_approached || (canAddReason
                        ? <button type="button" className="lob-link-btn" onClick={() => startAddReason(e)}>+ Add reason</button>
                        : "—")}
                    </td>
                    <td>
                      <button type="button" className="lob-link-btn" onClick={() => startEdit(e)}>Edit</button>
                    </td>
                  </tr>
                );
              })}
              {!loading && entries.length === 0 && (
                <tr><td colSpan={11} className="lob-empty">No births logged yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
