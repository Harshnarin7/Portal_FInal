// src/GACheckLog.jsx — Gestation (Inclusion Criteria) Screening Log:
// near-zero-friction live pre-screening capture (part 1 of the
// CONSORT-completeness plan; part 2, the digitized Log of All Births, is
// already built — see LogOfAllBirths.jsx).
//
// Logged the instant a nurse checks ANY woman's gestational age at
// antenatal clinic/delivery-room triage — including the majority who turn
// out not preterm and would otherwise leave no trace anywhere in the
// system. This log IS the CONSORT flow's true "Box 1 — Approached for
// screening" population, computed instead of hand-counted from a pocket
// diary. Gestation Source is asked FIRST: only a "Reliable" source lets
// weeks/days be entered and ever continue into Form A — "Unknown/Unreliable"
// dulls (disables) the gestation fields, the log still completes, but this
// entry can never trigger Form A (matches this rule server-side too, see
// backend/ga_check.py::classify_eligibility). Method of assessment
// (LMP / Early USG / Fundal Height — the same options Form A's own "Method
// of gestation assessment" field uses) is captured here once and carried
// forward on "Continue to Form A" so it never has to be re-picked there.

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import api from "./api/axios";
import { useAuth } from "./context/AuthContext";
import { isGlobalUser } from "./utils/roles";
import { SITE_ORDER } from "./utils/siteNames";
import {
  Search, AlertTriangle, CheckCircle2, ArrowRight, RefreshCw, X,
} from "lucide-react";
import "./GACheckLog.css";

const GESTATION_SOURCES = ["Reliable", "Unknown/Unreliable"];
const RELIABLE_SOURCE = "Reliable";

// How this entry came to exist -- a real-time check (default), or a
// retrospective note that a woman was missed entirely (e.g. learned from
// handover or the Log of All Births that someone was never checked).
// Purely a CONSORT-reporting classification tag; every other field behaves
// identically regardless of which value this holds.
const IDENTIFICATION_TYPES = ["Checked at triage", "Missed - identified retrospectively"];
const DEFAULT_IDENTIFICATION_TYPE = "Checked at triage";
const MISSED_IDENTIFICATION_TYPE = "Missed - identified retrospectively";

// Mirrors ScreeningForm.jsx's "Method of gestation assessment" options
// exactly (minus "Unknown" — if the source here isn't reliable, there's no
// method to record at all) so the value carries straight into Form A.
const GESTATION_METHODS = [
  { value: "LMP", label: "LMP" },
  { value: "Early USG", label: "Early USG (<24w)" },
  { value: "Fundal Height", label: "Fundal Height" },
];
const METHOD_LABELS = Object.fromEntries(GESTATION_METHODS.map((m) => [m.value, m.label]));

const BLANK_FORM = {
  site_name: "",
  identification_type: DEFAULT_IDENTIFICATION_TYPE,
  mother_name: "",
  mother_uid: "",
  ga_source: "",
  gestation_method: "",
  gestation_weeks: "",
  gestation_days: "",
};

export const GA_CHECK_SEED_KEY = "ga_check_seed";

export default function GACheckLog() {
  const { user } = useAuth();
  const navigate = useNavigate();
  /* Site-locked users (nurse/site_pi/site_scientist/etc.) can only ever
     log against their own site, same rule ScreeningForm.jsx's
     isSiteLocked applies to Form A — so the site is auto-picked from
     the login and shown read-only, never asked for again. Global roles
     (superadmin) have no home site and must choose one. */
  const isSiteLocked = !isGlobalUser(user) && !!user?.site;

  const [form, setForm] = useState(BLANK_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [lastResult, setLastResult] = useState(null); // the just-saved entry

  const [entries, setEntries] = useState([]);
  const [gapEntries, setGapEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const isReliable = form.ga_source === RELIABLE_SOURCE;

  useEffect(() => {
    if (isSiteLocked) setForm((p) => (p.site_name ? p : { ...p, site_name: user.site }));
  }, [isSiteLocked, user]);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError("");
    Promise.all([
      api.get("/ga-check/"),
      api.get("/ga-check/gap"),
    ])
      .then(([listRes, gapRes]) => {
        setEntries(listRes.data || []);
        setGapEntries(gapRes.data || []);
      })
      .catch((err) => {
        setLoadError(
          err.response?.status === 403
            ? "You don't have access to this log."
            : "Could not load the screening log."
        );
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const total = entries.length;
    const eligible = entries.filter((e) => e.eligible === true).length;
    const continued = entries.filter((e) => e.continued_to_screening).length;
    return { total, eligible, continued, gap: gapEntries.length };
  }, [entries, gapEntries]);

  const setField = (key, value) => setForm((p) => ({ ...p, [key]: value }));

  const setSource = (value) => {
    // Flipping away from "Reliable" dulls (and clears) method/weeks/days —
    // a stray value from before the switch must never linger and get
    // submitted alongside an Unknown/Unreliable source.
    setForm((p) => ({
      ...p,
      ga_source: value,
      ...(value !== RELIABLE_SOURCE ? { gestation_method: "", gestation_weeks: "", gestation_days: "" } : {}),
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.mother_name && !form.mother_uid) {
      setSaveError("Enter at least the mother's name or UID.");
      return;
    }
    if (!isSiteLocked && !form.site_name) {
      setSaveError("Select a site.");
      return;
    }
    if (!form.ga_source) {
      setSaveError("Select a gestation source.");
      return;
    }
    setSaving(true);
    setSaveError("");
    const payload = {
      site_name: form.site_name || null,
      identification_type: form.identification_type || DEFAULT_IDENTIFICATION_TYPE,
      mother_name: form.mother_name || null,
      mother_uid: form.mother_uid || null,
      ga_source: form.ga_source || null,
      // Belt-and-suspenders: never send weeks/days/method for an
      // unreliable source even if something upstream left them set —
      // the backend enforces this too, but the UI shouldn't rely on that.
      gestation_method: isReliable ? (form.gestation_method || null) : null,
      gestation_weeks: isReliable && form.gestation_weeks !== "" ? Number(form.gestation_weeks) : null,
      gestation_days: isReliable && form.gestation_days !== "" ? Number(form.gestation_days) : null,
    };
    try {
      const res = await api.post("/ga-check/", payload);
      setLastResult(res.data);
      setForm((p) => ({ ...BLANK_FORM, site_name: isSiteLocked ? p.site_name : "" }));
      load();
    } catch (err) {
      setSaveError(err.response?.data?.detail || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  /* Shared by the transient just-saved banner AND every row's persistent
     "Continue to Form A" button below — the banner disappears once this
     page is left/reloaded (component state, not a timer), but the entry
     itself stays eligible-and-uncontinued indefinitely, so the action to
     resume it must not disappear along with the banner. */
  const continueEntryToFormA = (entry) => {
    localStorage.setItem(GA_CHECK_SEED_KEY, JSON.stringify({
      id: entry.id,
      mother_name: entry.mother_name || "",
      mother_uid: entry.mother_uid || "",
      gestation_weeks: entry.gestation_weeks ?? "",
      gestation_days: entry.gestation_days ?? "",
      gestation_method: entry.gestation_method || "",
    }));
    setLastResult(null);
    navigate("/form-a");
  };

  const dismissResult = () => setLastResult(null);

  return (
    <div className="gac-page">
      <div className="gac-header">
        <div className="gac-breadcrumb">
          <Search size={14} /> Gestation (Inclusion Criteria) Screening Log
        </div>
        <h1 className="gac-title">Gestation (Inclusion Criteria) Screening Log</h1>
        <p className="gac-subtitle">
          Log every woman checked for gestational age at antenatal clinic or delivery-room
          triage — not just the ones who turn out preterm. This is the true "approached for
          screening" population; a Reliable source with gestation under 32 weeks continues
          straight into Form A.
        </p>
      </div>

      {stats.gap > 0 && (
        <div className="gac-alert-banner">
          <AlertTriangle size={16} />
          <span>
            <strong>{stats.gap}</strong> eligible check{stats.gap === 1 ? "" : "s"} logged
            with no Form A ever started — review below.
          </span>
        </div>
      )}

      {lastResult && (
        <div className={`gac-result ${lastResult.eligible ? "gac-result--eligible" : "gac-result--not-eligible"}`}>
          <div className="gac-result-text">
            {lastResult.eligible ? (
              <>
                <AlertTriangle size={18} />
                Logged — gestation {lastResult.gestation_weeks}w {lastResult.gestation_days ?? 0}d, under 32 weeks. Continue to Form A?
              </>
            ) : (
              <>
                <CheckCircle2 size={18} />
                Logged — not eligible for the trial ({lastResult.ga_source && lastResult.ga_source !== RELIABLE_SOURCE
                  ? "gestation source unreliable"
                  : lastResult.gestation_weeks != null
                    ? `gestation ${lastResult.gestation_weeks}w ${lastResult.gestation_days ?? 0}d`
                    : "gestation not captured"}).
              </>
            )}
          </div>
          <div className="gac-result-actions">
            {lastResult.eligible && (
              <button type="button" className="gac-btn gac-btn--continue" onClick={() => continueEntryToFormA(lastResult)}>
                Continue to Form A <ArrowRight size={14} />
              </button>
            )}
            <button type="button" className="gac-btn gac-btn--dismiss" onClick={dismissResult}>
              <X size={14} /> {lastResult.eligible ? "Not now" : "Dismiss"}
            </button>
          </div>
        </div>
      )}

      <div className="gac-stats-row">
        <div className="gac-stat">
          <div className="gac-stat-value">{stats.total}</div>
          <div className="gac-stat-label">Total logged</div>
        </div>
        <div className="gac-stat">
          <div className="gac-stat-value">{stats.eligible}</div>
          <div className="gac-stat-label">Eligible (&lt;32wk)</div>
        </div>
        <div className="gac-stat">
          <div className="gac-stat-value">{stats.continued}</div>
          <div className="gac-stat-label">Continued to Form A</div>
        </div>
        <div className="gac-stat gac-stat--gap">
          <div className="gac-stat-value">{stats.gap}</div>
          <div className="gac-stat-label">Eligible, no Form A yet</div>
        </div>
      </div>

      <form className="gac-card" onSubmit={handleSave}>
        <div className="gac-card-head">
          <h2>Log a gestation check</h2>
        </div>
        <div className="gac-form-grid">
          <label className="gac-field">
            <span>Site</span>
            {isSiteLocked ? (
              <input value={form.site_name} disabled readOnly />
            ) : (
              <select value={form.site_name} onChange={(e) => setField("site_name", e.target.value)}>
                <option value="">–– Select ––</option>
                {SITE_ORDER.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
          </label>
          <label className="gac-field">
            <span>How identified</span>
            <select value={form.identification_type} onChange={(e) => setField("identification_type", e.target.value)}>
              {IDENTIFICATION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="gac-field">
            <span>Mother's Name</span>
            <input value={form.mother_name} onChange={(e) => setField("mother_name", e.target.value)} autoFocus />
          </label>
          <label className="gac-field">
            <span>Mother's UHID / CR Number</span>
            <input value={form.mother_uid} onChange={(e) => setField("mother_uid", e.target.value)} />
          </label>
          <label className="gac-field">
            <span>Gestation Source</span>
            <select value={form.ga_source} onChange={(e) => setSource(e.target.value)}>
              <option value="">–– Select ––</option>
              {GESTATION_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="gac-field">
            <span>Method of Assessment</span>
            <select value={form.gestation_method} onChange={(e) => setField("gestation_method", e.target.value)} disabled={!isReliable}>
              <option value="">–– Select ––</option>
              {GESTATION_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </label>
          <label className="gac-field gac-field--ga">
            <span>Gestation (completed)</span>
            <div className="gac-ga-row">
              <input type="number" min="10" max="45" placeholder="wks" value={form.gestation_weeks} onChange={(e) => setField("gestation_weeks", e.target.value)} disabled={!isReliable} />
              <input type="number" min="0" max="6" placeholder="days" value={form.gestation_days} onChange={(e) => setField("gestation_days", e.target.value)} disabled={!isReliable} />
            </div>
          </label>
        </div>
        {form.ga_source && !isReliable && (
          <p className="gac-hint">Source is Unknown/Unreliable — this entry will be logged but can never trigger Form A.</p>
        )}
        {saveError && <div className="gac-form-error">{saveError}</div>}
        <div className="gac-form-actions">
          <button type="submit" className="gac-btn gac-btn--primary" disabled={saving}>
            {saving ? "Logging…" : "Log check"}
          </button>
        </div>
      </form>

      <div className="gac-card">
        <div className="gac-card-head">
          <h2>Recent checks {user?.site ? `— ${user.site}` : ""}</h2>
          <button type="button" className="gac-icon-btn" onClick={load} disabled={loading} title="Refresh">
            <RefreshCw size={14} className={loading ? "gac-spin" : ""} />
          </button>
        </div>
        {loadError && <div className="gac-form-error">{loadError}</div>}
        <div className="gac-table-wrap">
          <table className="gac-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Site</th>
                <th>Name</th>
                <th>UID</th>
                <th>How identified</th>
                <th>Source</th>
                <th>Method</th>
                <th>Gestation</th>
                <th>Outcome</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const isGap = e.eligible && !e.continued_to_screening;
                const unreliable = e.ga_source && e.ga_source !== RELIABLE_SOURCE;
                return (
                  <tr key={e.id} className={isGap ? "gac-row--gap" : ""}>
                    <td>{e.check_date || "—"}</td>
                    <td>{e.site_name || "—"}</td>
                    <td>{e.mother_name || "—"}</td>
                    <td>{e.mother_uid || "—"}</td>
                    <td>
                      {e.identification_type === MISSED_IDENTIFICATION_TYPE ? (
                        <span className="gac-badge gac-badge--gap">Missed — retrospective</span>
                      ) : "Checked at triage"}
                    </td>
                    <td>{e.ga_source || "—"}</td>
                    <td>{METHOD_LABELS[e.gestation_method] || e.gestation_method || "—"}</td>
                    <td>{e.gestation_weeks != null ? `${e.gestation_weeks}w ${e.gestation_days ?? 0}d` : "—"}</td>
                    <td>
                      {e.continued_to_screening ? (
                        <span className="gac-badge gac-badge--continued">
                          <CheckCircle2 size={13} /> Form A started{e.screening_id ? ` — ${e.screening_id}` : ""}
                        </span>
                      ) : e.eligible ? (
                        <span className="gac-badge gac-badge--gap">
                          <AlertTriangle size={13} /> Eligible, no Form A
                        </span>
                      ) : e.eligible === false ? (
                        <span className="gac-badge gac-badge--not-eligible">Not eligible</span>
                      ) : unreliable ? (
                        <span className="gac-badge gac-badge--unknown">Unreliable source</span>
                      ) : (
                        <span className="gac-badge gac-badge--unknown">Gestation unknown</span>
                      )}
                    </td>
                    <td>
                      {isGap && (
                        <button type="button" className="gac-row-action" onClick={() => continueEntryToFormA(e)}>
                          Form A <ArrowRight size={12} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!loading && entries.length === 0 && (
                <tr><td colSpan={10} className="gac-empty">No checks logged yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
