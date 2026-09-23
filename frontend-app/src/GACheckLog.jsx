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
// diary. When gestation <32 weeks is confirmed, the entry can continue
// straight into Form A with name/UID/gestation already carried forward.

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

const GA_SOURCES = ["LMP", "USG", "Unknown"];

const BLANK_FORM = {
  site_name: "",
  mother_name: "",
  mother_uid: "",
  gestation_weeks: "",
  gestation_days: "",
  ga_source: "",
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
    setSaving(true);
    setSaveError("");
    const payload = {
      site_name: form.site_name || null,
      mother_name: form.mother_name || null,
      mother_uid: form.mother_uid || null,
      gestation_weeks: form.gestation_weeks === "" ? null : Number(form.gestation_weeks),
      gestation_days: form.gestation_days === "" ? null : Number(form.gestation_days),
      ga_source: form.ga_source || null,
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

  const handleContinue = () => {
    if (!lastResult) return;
    localStorage.setItem(GA_CHECK_SEED_KEY, JSON.stringify({
      id: lastResult.id,
      mother_name: lastResult.mother_name || "",
      mother_uid: lastResult.mother_uid || "",
      gestation_weeks: lastResult.gestation_weeks ?? "",
      gestation_days: lastResult.gestation_days ?? "",
      ga_source: lastResult.ga_source || "",
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
          screening" population; when gestation is under 32 weeks, continue straight into Form A.
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
                Logged — not eligible for the trial (gestation {lastResult.gestation_weeks != null ? `${lastResult.gestation_weeks}w ${lastResult.gestation_days ?? 0}d` : "not captured"}).
              </>
            )}
          </div>
          <div className="gac-result-actions">
            {lastResult.eligible && (
              <button type="button" className="gac-btn gac-btn--continue" onClick={handleContinue}>
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
            <span>Mother's Name</span>
            <input value={form.mother_name} onChange={(e) => setField("mother_name", e.target.value)} autoFocus />
          </label>
          <label className="gac-field">
            <span>Mother's UHID / CR Number</span>
            <input value={form.mother_uid} onChange={(e) => setField("mother_uid", e.target.value)} />
          </label>
          <label className="gac-field gac-field--ga">
            <span>Gestation (completed)</span>
            <div className="gac-ga-row">
              <input type="number" min="10" max="45" placeholder="wks" value={form.gestation_weeks} onChange={(e) => setField("gestation_weeks", e.target.value)} />
              <input type="number" min="0" max="6" placeholder="days" value={form.gestation_days} onChange={(e) => setField("gestation_days", e.target.value)} />
            </div>
          </label>
          <label className="gac-field">
            <span>Gestation Source</span>
            <select value={form.ga_source} onChange={(e) => setField("ga_source", e.target.value)}>
              <option value="">–– Select ––</option>
              {GA_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        </div>
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
                <th>Gestation</th>
                <th>Source</th>
                <th>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const isGap = e.eligible && !e.continued_to_screening;
                return (
                  <tr key={e.id} className={isGap ? "gac-row--gap" : ""}>
                    <td>{e.check_date || "—"}</td>
                    <td>{e.site_name || "—"}</td>
                    <td>{e.mother_name || "—"}</td>
                    <td>{e.mother_uid || "—"}</td>
                    <td>{e.gestation_weeks != null ? `${e.gestation_weeks}w ${e.gestation_days ?? 0}d` : "—"}</td>
                    <td>{e.ga_source || "—"}</td>
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
                      ) : (
                        <span className="gac-badge gac-badge--unknown">Gestation unknown</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!loading && entries.length === 0 && (
                <tr><td colSpan={7} className="gac-empty">No checks logged yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
