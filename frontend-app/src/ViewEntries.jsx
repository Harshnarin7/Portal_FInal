// src/ViewEntries.jsx — PORTAL Trial Participant Management

import React, { useState, useMemo, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import api from "./api/axios";
import DashboardWorkspaceLayout from "./components/dashboard/DashboardWorkspaceLayout";
import {
  Search, Plus, ChevronLeft, ChevronRight, ChevronDown,
  Eye, Edit, Trash2, ArrowRight, Filter, AlertTriangle,
  RefreshCw, Users, FileText, Activity, ShieldAlert,
  CheckCircle2, Clock, XCircle, ClipboardList, X,
  History, Baby, Hourglass, Ban,
} from "lucide-react";
import "./ViewEntries.css";
import { formatMotherFirstName, formatParticipantListName } from "./utils/babyName";
import { resolveConsentSignatureFromRecord } from "./utils/consentSignature";
import { formatSiteName, formatSiteShort, canonicalSiteKey, isKnownTrialSite } from "./components/dashboard/siteLabels";
import { formatDateTimeDisplay24 } from "./utils/datetime";

/* ─── Form definitions (from formsConfig.js) ────────────────── */
const FORM_LABELS = [
  { key: "form_a",              short: "A",   label: "Screening"         },
  { key: "form_b",              short: "B",   label: "Birth & Resus"     },
  { key: "form_c",              short: "C",   label: "Maternal Details"  },
  { key: "form_d",              short: "D",   label: "Postnatal Day 1"   },
  { key: "form_e",              short: "E",   label: "NICU Admission"    },
  { key: "form_f",              short: "F",   label: "Cranial USG"       },
  { key: "form_g",              short: "G",   label: "ROP Screening"     },
  { key: "form_h",              short: "H",   label: "Morbidities"       },
  { key: "form_i",              short: "I",   label: "Outcomes"          },
  { key: "form_j",              short: "J",   label: "External Hospital Outcomes" },
  { key: "fio2_auc",            short: "F2",  label: "FiO₂ AUC"         },
  { key: "vs6_1",               short: "RC",  label: "Resp/CV/Neuro"    },
  { key: "infect_gi_hema",      short: "IG",  label: "Infect/GI/Hema"   },
  { key: "metab_renal_vasc_eye",short: "MR",  label: "Metab/Renal/Eye"  },
  { key: "form_y_sae",          short: "Y",   label: "SAE Form"          },
];

const ROUTE_MAP = {
  form_a:              (s, e) => `/form-a/${s}`,
  form_b:              (s, e) => `/form-b/${s}`,
  form_c:              (s, e) => `/form-c/${e}`,
  form_d:              (s, e) => `/form-d/${e}`,
  form_e:              (s, e) => `/form-e/${e}`,
  form_f:              (s, e) => `/form-f/${e}`,
  form_g:              (s, e) => `/form-g/${e}`,
  form_h:              (s, e) => `/form-h/${e}`,
  form_i:              (s, e) => `/form-i/${e}`,
  form_j:              (s, e) => `/form-j/${e}`,
  fio2_auc:            (s, e) => `/fio2-auc/${e}`,
  vs6_1:               (s, e) => `/vs6-1/${e}`,
  infect_gi_hema:      (s, e) => `/infect-gi-hema-log/${e}`,
  metab_renal_vasc_eye:(s, e) => `/metab-renal-vasc-eye-log/${e}`,
  form_y_sae:          (s, e) => `/form-y-sae/${e}`,
};

const DETAIL_TABS = ["Forms", "Screening Details", "Gestation", "Consent Info", "Audit History"];
const PER_PAGE = 10;

/* ─── Helpers ───────────────────────────────────────────────── */
function statusKey(status) {
  if (!status) return "pending";
  const s = status.toLowerCase();
  if (s === "eligible")       return "eligible";
  if (s === "screen failure") return "screen_failure";
  if (s === "not eligible")   return "not_eligible";
  return "pending";
}

function formBHasStarted(enrollStatus) {
  return !!(enrollStatus?.form_b_started || enrollStatus?.form_b);
}

function entryIsDelivered(entry, enrollData = {}) {
  if (!entry?.enrollment_id) return false;
  return formBHasStarted(enrollData[entry.enrollment_id]);
}

function entryHasExclusion(entry) {
  if (entry?.exclusion_present === true) return true;
  return !!(entry?.exclusion_reasons || "").trim();
}

function exclusionReasonList(entry) {
  const raw = (entry?.exclusion_reasons || "").trim();
  if (raw) return raw.split(",").map(s => s.trim()).filter(Boolean);
  return entryHasExclusion(entry) ? ["Present (reason not specified)"] : [];
}

function listNameForEntry(pii, enrollStatus) {
  return formatParticipantListName(pii, { formBStarted: formBHasStarted(enrollStatus) });
}

function formAIsComplete(entry) {
  if (entry.gestation_weeks == null || entry.gestation_weeks === "") return false;
  if (!entry.gestation_method) return false;
  if (!entry.screened_by) return false;
  if (!entry.site_name) return false;
  if (!entry.screening_datetime) return false;
  const status = entry.screening_status || "";
  if (status === "Not Eligible" || status === "Screen Failure") return true;
  const consent = (entry.consent_given || "").trim();
  if (!consent) return false;
  if (consent === "Yes" || consent === "Trial run") {
    return !!(entry.consent_taken_by && entry.relationship_to_participant);
  }
  if (consent === "No") return !!entry.reason_for_consent_refusal;
  if (consent === "Not approached") return !!entry.reason_not_approached;
  return false;
}

function laterFormStatus(complete, started) {
  if (complete) return "completed";
  if (started) return "in_progress";
  return "locked";
}

function buildFormProgress(enrollStatus) {
  if (!enrollStatus) return { form_a: true };
  return {
    form_a: true,
    form_b: !!enrollStatus.form_b,
    form_b_started: !!enrollStatus.form_b_started,
    form_c: !!enrollStatus.form_c,
    form_c_started: !!enrollStatus.form_c_started,
    form_d: !!enrollStatus.form_d,
    form_d_started: !!enrollStatus.form_d_started,
    form_e: !!enrollStatus.form_e,
    form_e_started: !!enrollStatus.form_e_started,
  };
}

/** Dots shown in the table (core forms A–J). */
const VISIBLE_FORMS = FORM_LABELS.slice(0, 10);

function computeForms(formProg, entry) {
  return VISIBLE_FORMS.map(f => {
    let status = "locked";
    if (f.key === "form_a") {
      status = formAIsComplete(entry) ? "completed" : "in_progress";
    } else if (f.key === "form_b" || f.key === "form_c" || f.key === "form_d" || f.key === "form_e") {
      status = laterFormStatus(formProg[f.key] === true, formProg[`${f.key}_started`] === true);
    }
    return { ...f, status };
  });
}

function computeCompletion(forms) {
  const done = forms.filter(f => f.status === "completed").length;
  return { done, total: forms.length };
}

function getNextAction(entry, enrollStatus) {
  const s = entry.screening_status;
  if (!s || s === "Pending")      return { label: "Complete Screening", variant: "primary",   key: "form_a" };
  if (s === "Screen Failure")     return { label: "View Screening",     variant: "secondary", key: "form_a" };
  if (s === "Not Eligible")       return { label: "View Screening",     variant: "secondary", key: "form_a" };
  if (!enrollStatus || !enrollStatus.form_b) return { label: "Start Form B", variant: "primary", key: "form_b" };
  if (!enrollStatus.form_c)                  return { label: "Open Form C",  variant: "primary", key: "form_c" };
  /* PPV not required: A–C only — do not push Form D+ */
  if (enrollStatus.no_ppv) {
    return { label: "A–C complete (no PPV)", variant: "secondary", key: "form_c" };
  }
  if (!enrollStatus.form_d)                  return { label: "Open Form D",  variant: "primary", key: "form_d" };
  if (!enrollStatus.form_e)                  return { label: "Open Form E",  variant: "primary", key: "form_e" };
  return { label: "Open Form F", variant: "primary", key: "form_f" };
}

function buildKPIs(entries, saeCount = 0, enrollData = {}) {
  return [
    { key: "total",          label: "Total Screened",  value: entries.length,                                                              icon: <Users size={20}/>,        color: "blue"  },
    { key: "eligible",       label: "Eligible",        value: entries.filter(e => e.screening_status === "Eligible").length,               icon: <CheckCircle2 size={20}/>,  color: "green" },
    { key: "screen_failure", label: "Screen Failures", value: entries.filter(e => e.screening_status === "Screen Failure").length,         icon: <XCircle size={20}/>,       color: "red"   },
    { key: "pending",        label: "Pending",         value: entries.filter(e => !e.screening_status || e.screening_status==="Pending").length, icon: <Clock size={20}/>,    color: "amber" },
    { key: "consented",      label: "Consented",       value: entries.filter(e => e.consent_given === "Yes").length,                       icon: <FileText size={20}/>,      color: "teal"  },
    { key: "delivered",      label: "Delivered",       value: entries.filter(e => entryIsDelivered(e, enrollData)).length,                 icon: <Baby size={20}/>,          color: "teal"  },
    { key: "undelivered",    label: "Undelivered",     value: entries.filter(e => !entryIsDelivered(e, enrollData)).length,                icon: <Hourglass size={20}/>,     color: "amber" },
    { key: "exclusion",      label: "Exclusion Present", value: entries.filter(entryHasExclusion).length,                                 icon: <Ban size={20}/>,           color: "red"   },
    { key: "sites",          label: "Sites Active",    value: [...new Set(entries.map(e=>e.site_name).filter(Boolean))].length,            icon: <Activity size={20}/>,      color: "purple"},
    { key: "sae",            label: "SAE / Safety",    value: saeCount,                                                                    icon: <ShieldAlert size={20}/>,   color: "red"   },
  ];
}

function recordsForKpi(key, entries, saeItems, enrollData = {}) {
  if (key === "eligible") {
    return { kind: "participants", rows: entries.filter(e => e.screening_status === "Eligible") };
  }
  if (key === "screen_failure") {
    return { kind: "participants", rows: entries.filter(e => e.screening_status === "Screen Failure") };
  }
  if (key === "pending") {
    return { kind: "participants", rows: entries.filter(e => !e.screening_status || e.screening_status === "Pending") };
  }
  if (key === "consented") {
    return { kind: "participants", rows: entries.filter(e => e.consent_given === "Yes") };
  }
  if (key === "delivered") {
    return { kind: "participants", rows: entries.filter(e => entryIsDelivered(e, enrollData)) };
  }
  if (key === "undelivered") {
    return { kind: "participants", rows: entries.filter(e => !entryIsDelivered(e, enrollData)) };
  }
  if (key === "exclusion") {
    return { kind: "exclusions", rows: entries.filter(entryHasExclusion) };
  }
  if (key === "sites") {
    const bySite = new Map();
    entries.forEach(e => {
      const site = (e.site_name || "").trim();
      if (!site) return;
      if (!bySite.has(site)) bySite.set(site, []);
      bySite.get(site).push(e);
    });
    return {
      kind: "sites",
      rows: [...bySite.entries()].map(([site, list]) => ({
        site,
        count: list.length,
        eligible: list.filter(e => e.screening_status === "Eligible").length,
        failures: list.filter(e => e.screening_status === "Screen Failure").length,
        pending: list.filter(e => !e.screening_status || e.screening_status === "Pending").length,
        consented: list.filter(e => e.consent_given === "Yes").length,
      })),
    };
  }
  if (key === "sae") {
    return { kind: "sae", rows: Array.isArray(saeItems) ? saeItems : [] };
  }
  return { kind: "participants", rows: entries };
}

function formatGa(entry) {
  return entry?.gestation_weeks != null
    ? `${entry.gestation_weeks}w ${entry.gestation_days ?? 0}d`
    : "—";
}

/* ─── Sub-components ─────────────────────────────────────────── */
function KPICard({ label, value, icon, color, onClick }) {
  return (
    <button
      type="button"
      className={`kpi-card kpi-card--btn kpi-card--${color}`}
      onClick={onClick}
      aria-haspopup="dialog"
      aria-label={`View ${label} records (${value})`}
    >
      <div className={`kpi-icon kpi-icon--${color}`}>{icon}</div>
      <div className="kpi-body">
        <p className="kpi-value">{value}</p>
        <p className="kpi-label">{label}</p>
      </div>
    </button>
  );
}

function KpiRecordsModal({
  title,
  count,
  kind,
  rows,
  piiByScreening,
  enrollData,
  onClose,
  onOpenParticipant,
  onOpenSae,
}) {
  const [q, setQ] = useState("");

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const needle = q.trim().toLowerCase();
  const visible = !needle ? rows : rows.filter((row) => {
    if (kind === "sites") {
      return formatSiteName(row.site).toLowerCase().includes(needle)
        || String(row.site).toLowerCase().includes(needle);
    }
    if (kind === "sae") {
      const name = listNameForEntry(piiByScreening[row.screening_id], row.enrollment_id ? enrollData[row.enrollment_id] : null);
      return [
        row.enrollment_id, row.screening_id, row.site_name, row.sae,
        row.definition_no, row.start_date, row.end_date, name,
      ].some(v => String(v || "").toLowerCase().includes(needle));
    }
    const name = listNameForEntry(piiByScreening[row.screening_id], row.enrollment_id ? enrollData[row.enrollment_id] : null);
    const exclusions = exclusionReasonList(row).join(" ");
    return [
      row.screening_id, row.enrollment_id, row.site_name, row.screening_status,
      row.consent_given, name, exclusions,
    ].some(v => String(v || "").toLowerCase().includes(needle));
  });

  return createPortal(
    <div className="kpi-modal-overlay" onClick={onClose} role="presentation">
      <div
        className="kpi-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="kpi-modal-title"
        onClick={e => e.stopPropagation()}
      >
        <div className="kpi-modal-header">
          <div>
            <h2 id="kpi-modal-title" className="kpi-modal-title">{title}</h2>
            <p className="kpi-modal-count">{count} record{count === 1 ? "" : "s"}</p>
          </div>
          <button type="button" className="kpi-modal-close" onClick={onClose} aria-label="Close">
            <X size={18}/>
          </button>
        </div>
        <div className="kpi-modal-search-wrap">
          <Search size={15} className="kpi-modal-search-icon"/>
          <input
            className="kpi-modal-search"
            placeholder="Search this list…"
            value={q}
            onChange={e => setQ(e.target.value)}
            autoFocus
          />
        </div>
        <div className="kpi-modal-table-wrap">
          {visible.length === 0 ? (
            <div className="kpi-modal-empty">No records in this list.</div>
          ) : kind === "sites" ? (
            <table className="kpi-modal-table">
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Participants</th>
                  <th>Eligible</th>
                  <th>Screen Failures</th>
                  <th>Pending</th>
                  <th>Consented</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(row => (
                  <tr key={row.site}>
                    <td className="kpi-modal-id">{formatSiteName(row.site)}</td>
                    <td>{row.count}</td>
                    <td>{row.eligible}</td>
                    <td>{row.failures}</td>
                    <td>{row.pending}</td>
                    <td>{row.consented}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : kind === "sae" ? (
            <table className="kpi-modal-table">
              <thead>
                <tr>
                  <th>Enrollment ID</th>
                  <th>Screening ID</th>
                  <th>Name</th>
                  <th>Site</th>
                  <th>SAE</th>
                  <th>Start</th>
                  <th>End</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row, i) => {
                  const name = listNameForEntry(
                    piiByScreening[row.screening_id],
                    row.enrollment_id ? enrollData[row.enrollment_id] : null,
                  );
                  return (
                    <tr
                      key={`${row.enrollment_id}-${row.sae}-${row.start_date}-${i}`}
                      className="kpi-modal-row"
                      onClick={() => row.enrollment_id && onOpenSae(row)}
                    >
                      <td className="kpi-modal-id">{row.enrollment_id || "—"}</td>
                      <td>{row.screening_id || "—"}</td>
                      <td>{name || "—"}</td>
                      <td>{formatSiteName(row.site_name)}</td>
                      <td>{row.sae || row.definition_no || "—"}</td>
                      <td>{row.start_date || "—"}</td>
                      <td>{row.end_date || "—"}</td>
                      <td>
                        <button
                          type="button"
                          className="kpi-modal-open"
                          onClick={e => { e.stopPropagation(); onOpenSae(row); }}
                          disabled={!row.enrollment_id}
                        >
                          Open listing
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <table className="kpi-modal-table">
              <thead>
                <tr>
                  <th>Screening ID</th>
                  <th>Name</th>
                  <th>Enrollment ID</th>
                  <th>Site</th>
                  <th>Gestation</th>
                  <th>Status</th>
                  <th>Consent</th>
                  {kind === "exclusions" && <th>Exclusion</th>}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visible.map(row => {
                  const sk = statusKey(row.screening_status);
                  const name = listNameForEntry(
                    piiByScreening[row.screening_id],
                    row.enrollment_id ? enrollData[row.enrollment_id] : null,
                  );
                  return (
                    <tr
                      key={row.id || row.screening_id}
                      className="kpi-modal-row"
                      onClick={() => onOpenParticipant(row)}
                    >
                      <td className="kpi-modal-id">{row.screening_id || "—"}</td>
                      <td>{name || "—"}</td>
                      <td>{row.enrollment_id || "—"}</td>
                      <td>{formatSiteName(row.site_name)}</td>
                      <td>{formatGa(row)}</td>
                      <td><Badge sk={sk} label={row.screening_status || "Pending"}/></td>
                      <td>
                        <span className={`consent-pill consent-pill--${(row.consent_given||"").toLowerCase()==="yes"?"yes":"no"}`}>
                          {row.consent_given || "—"}
                        </span>
                      </td>
                      {kind === "exclusions" && (
                        <td>
                          <div className="kpi-excl-list">
                            {exclusionReasonList(row).map(reason => (
                              <span key={reason} className="kpi-excl-pill">{reason}</span>
                            ))}
                          </div>
                        </td>
                      )}
                      <td>
                        <button
                          type="button"
                          className="kpi-modal-open"
                          onClick={e => { e.stopPropagation(); onOpenParticipant(row); }}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ProgressDot({ label, status, title, onClick }) {
  const clickable = typeof onClick === "function";
  const Tag = clickable ? "button" : "span";
  return (
    <Tag
      type={clickable ? "button" : undefined}
      className={`pdot pdot--${status}${clickable ? " pdot--clickable" : ""}`}
      title={title || label}
      onClick={clickable ? onClick : undefined}
    >
      {label}
    </Tag>
  );
}

function Badge({ sk, label }) {
  return <span className={`badge badge--${sk}`}>{label || "—"}</span>;
}

function ActionBtn({ label, variant, onClick }) {
  return (
    <button type="button" className={`act-btn act-btn--${variant}`} onClick={onClick} title={label}>
      <span className="act-btn-label">{label}</span>
      {variant === "danger"     ? <AlertTriangle size={14}/> :
       variant === "secondary"  ? <Filter size={14}/>        :
                                  <ArrowRight size={14}/>}
    </button>
  );
}

/* ─── Expanded detail panel ──────────────────────────────────── */
function ExpandedPanel({ entry, forms, onEdit, onDelete, onViewForm, babyName, initialTab }) {
  const [tab, setTab] = useState(initialTab || "Forms");
  const [saves, setSaves] = useState(null);
  const [savesError, setSavesError] = useState("");
  const consentSig = resolveConsentSignatureFromRecord(entry);
  const ga = entry.gestation_weeks != null
    ? `${entry.gestation_weeks}w ${entry.gestation_days ?? 0}d`
    : "—";

  const Field = ({ label, value }) => (
    <div className="exp-field">
      <p className="exp-field-label">{label}</p>
      <p className="exp-field-value">{value || "—"}</p>
    </div>
  );

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab, entry.id]);

  useEffect(() => {
    if (tab !== "Audit History") return;
    let cancelled = false;
    setSaves(null);
    setSavesError("");
    api.get("/audit/patient", { params: { screening_id: entry.screening_id } })
      .then(res => { if (!cancelled) setSaves(Array.isArray(res.data) ? res.data : []); })
      .catch(err => {
        if (cancelled) return;
        setSaves([]);
        setSavesError(err.response?.status === 403
          ? "You don't have access to this patient's audit trail."
          : "Could not load this patient's save history.");
      });
    return () => { cancelled = true; };
  }, [tab, entry.screening_id]);

  const completedForms = (forms || []).filter(f => f.status === "completed");

  return (
    <div className="exp-panel">
      {/* Tabs */}
      <div className="exp-tabs">
        {DETAIL_TABS.map(t => (
          <button key={t} className={`exp-tab${tab === t ? " exp-tab--active" : ""}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
        <div className="exp-tabs-actions">
          <button className="exp-quick-btn exp-quick-btn--edit" onClick={onEdit}>
            <Edit size={13}/> Edit Screening
          </button>
          <button className="exp-quick-btn exp-quick-btn--del" onClick={onDelete}>
            <Trash2 size={13}/> Delete
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="exp-body">
        {tab === "Forms" && (
          <div className="exp-forms">
            <p className="exp-forms-hint">
              Open any completed form to review what was entered earlier (opens read-only; use Edit on the form if changes are needed).
            </p>
            {completedForms.length === 0 ? (
              <p className="exp-empty">No completed forms yet for this participant.</p>
            ) : (
              <ul className="exp-forms-list">
                {(forms || []).map(f => {
                  const done = f.status === "completed";
                  const partial = f.status === "in_progress";
                  const dot = done ? "done" : partial ? "partial" : "locked";
                  const statusText = done
                    ? "Completed"
                    : partial
                      ? "Required fields missing"
                      : "Not started";
                  return (
                    <li key={f.key} className={`exp-form-row${done ? " exp-form-row--done" : ""}`}>
                      <span className={`exp-form-dot exp-form-dot--${dot}`}>
                        {f.short}
                      </span>
                      <div className="exp-form-meta">
                        <p className="exp-form-name">Form {f.short} · {f.label}</p>
                        <p className="exp-form-status">{statusText}</p>
                      </div>
                      {(done || partial) ? (
                        <button
                          type="button"
                          className="exp-form-view"
                          onClick={() => onViewForm(f.key)}
                        >
                          <Eye size={14}/> {done ? "View" : "Open"}
                        </button>
                      ) : (
                        <span className="exp-form-view exp-form-view--disabled">—</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
        {tab === "Screening Details" && (
          <div className="exp-grid">
            <Field label="Screening ID"    value={entry.screening_id} />
            <Field label="Name"            value={babyName} />
            <Field label="Enrollment ID"   value={entry.enrollment_id} />
            <Field label="Site"            value={entry.site_name} />
            <Field label="Screened By"     value={entry.screened_by} />
            <Field label="Status"          value={entry.screening_status} />
            <Field label="Screening Date"  value={entry.screening_datetime ? new Date(entry.screening_datetime).toLocaleDateString("en-IN") : null} />
            <Field label="Exclusion"       value={entry.exclusion_present ? (entry.exclusion_reasons || "Yes") : "None"} />
            <Field label="Updated By"      value={entry.updated_by} />
          </div>
        )}
        {tab === "Gestation" && (
          <div className="exp-grid">
            <Field label="Gestational Age"        value={ga} />
            <Field label="GA Method"              value={entry.gestation_method} />
            <Field label="Expected Delivery Date" value={entry.expected_delivery_date} />
            <Field label="LMP Date"               value={entry.lmp_date} />
          </div>
        )}
        {tab === "Consent Info" && (
          <div className="exp-grid">
            <Field label="Consent Given"       value={entry.consent_given} />
            <Field label="Taken By"            value={entry.consent_taken_by} />
            <Field label="Consent Date"        value={entry.consent_datetime ? new Date(entry.consent_datetime).toLocaleDateString("en-IN") : null} />
            <Field label="Form Version"        value={entry.consent_form_version} />
            <Field label="Language"            value={entry.consent_language} />
            <Field label="Signature on file"   value={consentSig.image ? "Yes" : "No"} />
            <Field label="Reconsent"           value={entry.reconsent_obtained ? "Yes" : "No"} />
            <Field label="Relationship"        value={entry.relationship_to_participant} />
            {consentSig.image && (
              <div className="exp-field">
                <p className="exp-field-label">ICF Signature (signed on tablet)</p>
                <img
                  src={consentSig.image}
                  alt="ICF signature"
                  style={{ maxWidth: "260px", height: "90px", objectFit: "contain", background: "#fff", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "4px" }}
                />
                {consentSig.capturedAt && (
                  <p className="exp-field-value" style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                    Signed {new Date(consentSig.capturedAt).toLocaleString("en-IN")}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
        {tab === "Audit History" && (
          <div className="exp-audit">
            <p className="exp-forms-hint">
              Each card is one Save click. The name is the logged-in user, and the time is when Save was clicked.
            </p>
            {saves == null && !savesError && <p className="exp-empty">Loading save history…</p>}
            {savesError && <p className="exp-empty">{savesError}</p>}
            {saves && saves.length === 0 && !savesError && (
              <p className="exp-empty">No Save clicks recorded for this patient yet.</p>
            )}
            {(saves || []).map(log => {
              const who = (log.saved_by && log.saved_by !== "—") ? log.saved_by : "Name not on account";
              const initial = who.trim().charAt(0).toUpperCase() || "?";
              return (
                <div key={log.id + (log.saved_at || "")} className="audit-card">
                  <div className="audit-avatar" aria-hidden="true">{initial}</div>
                  <div className="audit-card-main">
                    <p className="audit-event">{log.form}</p>
                    <p className="audit-meta">Saved by <strong>{who}</strong></p>
                  </div>
                  <div className="audit-when">
                    <span className="audit-when-label">Saved</span>
                    <span className="audit-when-time">{formatDateTimeDisplay24(log.saved_at)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── MAIN ───────────────────────────────────────────────────── */
export default function ViewEntries() {
  const navigate = useNavigate();

  const [entries,    setEntries]    = useState([]);
  const [enrollData, setEnrollData] = useState({});
  const [piiByScreening, setPiiByScreening] = useState({});
  const [saeCount,   setSaeCount]   = useState(0);
  const [saeItems,   setSaeItems]   = useState([]);
  const [kpiModal,   setKpiModal]   = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState("");
  const [siteFilter, setSiteFilter] = useState("");
  const [expanded,   setExpanded]   = useState(null);
  const [detailTab,  setDetailTab]  = useState("Forms");
  const [page,       setPage]       = useState(1);

  /* ── Fetch ── */
  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/screenings/?limit=200");
      const list = Array.isArray(res.data) ? res.data : [];
      setEntries(list);
      try {
        const saeRes = await api.get("/sae-list/summary");
        setSaeCount(Number(saeRes.data?.total) || 0);
        setSaeItems(Array.isArray(saeRes.data?.items) ? saeRes.data.items : []);
      } catch {
        setSaeCount(0);
        setSaeItems([]);
      }
      const sids = list.map(e => e.screening_id).filter(Boolean);
      if (sids.length) {
        try {
          const piiRes = await api.post("/pii/batch", { screening_ids: sids });
          setPiiByScreening(piiRes.data?.items || {});
        } catch {
          setPiiByScreening({});
        }
      } else {
        setPiiByScreening({});
      }
    } catch (err) {
      console.error("Error fetching entries:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  useEffect(() => {
    entries
      .filter(e => e.enrollment_id)
      .forEach(async e => {
        if (enrollData[e.enrollment_id]) return;
        try {
          const res = await api.get(`/enrollment-status/${e.enrollment_id}`);
          setEnrollData(prev => ({ ...prev, [e.enrollment_id]: res.data }));
        } catch {}
      });
  }, [entries]); // eslint-disable-line

  /* ── Actions ── */
  const handleDelete = async (id, sid) => {
    if (!window.confirm(`Delete screening ${sid}?`)) return;
    try {
      await api.delete(`/screenings/${id}`);
      setEntries(p => p.filter(e => e.id !== id));
    } catch { alert("Failed to delete"); }
  };

  const setSessionIds = (entry) => {
    if (entry.screening_id) localStorage.setItem("current_screening_id", entry.screening_id);
    else localStorage.removeItem("current_screening_id");
    // Always clear a previous patient's enrollment before applying the new one
    if (entry.enrollment_id) localStorage.setItem("current_enrollment_id", entry.enrollment_id);
    else localStorage.removeItem("current_enrollment_id");
    window.dispatchEvent(new Event("storage"));
  };

  const handleEdit = (entry) => {
    setSessionIds(entry);
    navigate(`/form-a/${entry.screening_id}`);
  };

  const openForm = (entry, formKey) => {
    if (!formKey || !ROUTE_MAP[formKey]) return;
    setSessionIds(entry);
    navigate(ROUTE_MAP[formKey](entry.screening_id, entry.enrollment_id));
  };

  const handleAction = (entry, action) => {
    openForm(entry, action.key);
  };

  /* ── Filter ── */
  const filtered = useMemo(() => entries.filter(e => {
    const q = search.toLowerCase();
    const pii = piiByScreening[e.screening_id];
    const enr = e.enrollment_id ? enrollData[e.enrollment_id] : null;
    const baby = listNameForEntry(pii, enr);
    const mother = formatMotherFirstName(pii);
    const matchQ = !q ||
      (e.screening_id  || "").toLowerCase().includes(q) ||
      (e.enrollment_id || "").toLowerCase().includes(q) ||
      (e.site_name     || "").toLowerCase().includes(q) ||
      (e.screened_by   || "").toLowerCase().includes(q) ||
      baby.toLowerCase().includes(q) ||
      String(mother).toLowerCase().includes(q);
    const matchSite = !siteFilter || canonicalSiteKey(e.site_name) === siteFilter;
    return matchQ && matchSite;
  }), [entries, search, siteFilter, piiByScreening, enrollData]);

  const siteOptions = useMemo(() => {
    const seen = new Map();
    entries.forEach(e => {
      const key = canonicalSiteKey(e.site_name);
      if (!key || !isKnownTrialSite(key)) return;
      if (!seen.has(key)) seen.set(key, formatSiteName(key));
    });
    return [...seen.entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
  }, [entries]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const kpis  = buildKPIs(entries, saeCount, enrollData);
  const kpiModalRecords = kpiModal ? recordsForKpi(kpiModal.key, entries, saeItems, enrollData) : null;

  const layoutProps = {
    pageTitle: "All Participants",
    search,
    onSearchChange: setSearch,
    onRefresh: fetchEntries,
  };

  if (loading) {
    return (
      <DashboardWorkspaceLayout {...layoutProps}>
        <div className="ve-loading">
          <RefreshCw size={22} className="ve-spin" />
          <span>Loading participants…</span>
        </div>
      </DashboardWorkspaceLayout>
    );
  }

  return (
    <DashboardWorkspaceLayout {...layoutProps}>
    <div className="ve-wrap">

      {/* ── Page header ── */}
      <div className="ve-header">
        <div className="ve-header-left">
          <div className="ve-breadcrumb">
            <ClipboardList size={15}/> Participant Management
          </div>
          <h1 className="ve-title">All Participants</h1>
          <p className="ve-subtitle">Screening log and form completion across all PORTAL Trial sites</p>
        </div>
        <div className="ve-header-right">
          <button className="ve-btn-refresh" onClick={fetchEntries} title="Refresh">
            <RefreshCw size={16}/>
          </button>
          <button
            className="ve-btn-new"
            onClick={() => {
              localStorage.removeItem("current_screening_id");
              localStorage.removeItem("current_enrollment_id");
              window.dispatchEvent(new Event("storage"));
              navigate("/form-a");
            }}
          >
            <Plus size={16}/> New Screening
          </button>
        </div>
      </div>

      {/* ── KPI strip ── */}
      <div className="ve-kpis">
        {kpis.map(k => (
          <KPICard
            key={k.key}
            {...k}
            onClick={() => setKpiModal({ key: k.key, label: k.label, value: k.value })}
          />
        ))}
      </div>

      {/* ── Controls (Unified single horizontal row without Consent dropdown) ── */}
      <div className="ve-controls">
        <div className="ve-search-wrap">
          <Search size={16} className="ve-search-icon"/>
          <input
            className="ve-search"
            placeholder="Search name, enrollment ID…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        
        <div className="ve-filters">
          <label className={`ve-site-dd${siteFilter ? " ve-filter--dd-active" : ""}`}>
            <span className="ve-site-dd-label">
              {siteFilter ? formatSiteName(siteFilter) : "Site"}
            </span>
            <select
              className="ve-site-select"
              value={siteFilter}
              onChange={e => { setSiteFilter(e.target.value); setPage(1); }}
              aria-label="Filter by site"
            >
              <option value="">All sites</option>
              {siteOptions.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <ChevronDown size={13} className="ve-site-dd-icon" aria-hidden="true"/>
          </label>
        </div>
      </div>

      {/* ── Table card ── */}
      <div className="ve-card">
        <div className="ve-progress-legend" aria-label="Form progress key">
          <span className="ve-legend-item"><span className="pdot pdot--completed">A</span> Complete — all required fields</span>
          <span className="ve-legend-item"><span className="pdot pdot--in_progress">A</span> Incomplete — required fields missing</span>
          <span className="ve-legend-item"><span className="pdot pdot--locked">A</span> Not started</span>
        </div>
        <div className="ve-table-scroll">
          <table className="ve-table">
            <thead>
              <tr className="ve-thead-row">
                <th className="ve-th ve-th--sticky">Screening ID</th>
                <th className="ve-th">Name</th>
                <th className="ve-th">Enrollment ID</th>
                <th className="ve-th">Site</th>
                <th className="ve-th ve-th--center">Gestation</th>
                <th className="ve-th">Form Progress</th>
                <th className="ve-th">Completion</th>
                <th className="ve-th ve-th--center">Status</th>
                <th className="ve-th ve-th--center">Consent</th>
                <th className="ve-th">Next Action</th>
                <th className="ve-th ve-th--right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 ? (
                <tr>
                    <td colSpan={11} className="ve-empty">
                    <ClipboardList size={32} opacity={0.3}/>
                    <p>No participants match your filters.</p>
                  </td>
                </tr>
              ) : paged.map(entry => {
                const sk        = statusKey(entry.screening_status);
                const enr       = entry.enrollment_id ? enrollData[entry.enrollment_id] : null;
                const formProg  = buildFormProgress(enr);
                const forms     = computeForms(formProg, entry);
                const comp      = computeCompletion(forms);
                const pct       = Math.round((comp.done / comp.total) * 100);
                const action    = getNextAction(entry, enr);
                const ga        = entry.gestation_weeks != null
                  ? `${entry.gestation_weeks}w ${entry.gestation_days ?? 0}d`
                  : "—";

                return (
                  <React.Fragment key={entry.id}>
                    <tr
                      className={`ve-row${expanded === entry.id ? " ve-row--open" : ""}`}
                      onClick={() => {
                        setDetailTab("Forms");
                        setExpanded(p => p === entry.id ? null : entry.id);
                      }}
                    >
                      <td className="ve-td ve-td--sticky ve-td--id">{entry.screening_id}</td>
                      <td className="ve-td ve-td--baby">
                        {listNameForEntry(piiByScreening[entry.screening_id], enr) || "—"}
                      </td>
                      <td className="ve-td ve-td--md">{entry.enrollment_id || "—"}</td>
                      <td className="ve-td ve-td--md" title={formatSiteName(entry.site_name)}>{formatSiteShort(entry.site_name)}</td>
                      <td className="ve-td ve-td--center ve-td--bold">{ga}</td>

                      {/* Form dots — completed dots open that form for review */}
                      <td className="ve-td ve-td--dots" onClick={e => e.stopPropagation()}>
                        <div className="ve-dots">
                          {forms.map((f, i) => {
                            const openable = f.status === "completed" || f.status === "in_progress";
                            const title = f.status === "completed"
                              ? `View Form ${f.short}: ${f.label} (complete)`
                              : f.status === "in_progress"
                                ? `Form ${f.short}: ${f.label} — required fields still missing`
                                : `${f.label} (not started)`;
                            return (
                            <ProgressDot
                              key={i}
                              label={f.short}
                              status={f.status}
                              title={title}
                              onClick={openable ? () => openForm(entry, f.key) : undefined}
                            />
                            );
                          })}
                        </div>
                      </td>

                      {/* Completion */}
                      <td className="ve-td ve-td--comp">
                        <p className="comp-txt">{comp.done} / {comp.total}</p>
                        <div className="comp-track">
                          <div className={`comp-fill comp-fill--${sk}`} style={{width: `${pct}%`}}/>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="ve-td ve-td--center">
                        <Badge sk={sk} label={entry.screening_status || "Pending"}/>
                      </td>

                      {/* Consent */}
                      <td className="ve-td ve-td--center">
                        <span className={`consent-pill consent-pill--${(entry.consent_given||"").toLowerCase()==="yes"?"yes":"no"}`}>
                          {entry.consent_given || "—"}
                        </span>
                      </td>

                      {/* Next action */}
                      <td className="ve-td ve-td--action">
                        <ActionBtn
                          label={action.label}
                          variant={action.variant}
                          onClick={e => { e.stopPropagation(); handleAction(entry, action); }}
                        />
                      </td>

                      {/* Icon actions with larger size (18px) */}
                      <td className="ve-td ve-td--right" onClick={e => e.stopPropagation()}>
                        <div className="icon-btns">
                          <button
                            className="icon-btn"
                            title="View completed forms"
                            onClick={() => {
                              setDetailTab("Forms");
                              setExpanded(p => p === entry.id ? null : entry.id);
                            }}
                          >
                            <Eye size={15}/>
                          </button>
                          <button
                            className="icon-btn"
                            title="Audit trail — who saved this patient"
                            onClick={() => {
                              setDetailTab("Audit History");
                              setExpanded(entry.id);
                            }}
                          >
                            <History size={15}/>
                          </button>
                          <button className="icon-btn" title="Edit screening" onClick={() => handleEdit(entry)}>
                            <Edit size={15}/>
                          </button>
                          <button className="icon-btn icon-btn--del" title="Delete" onClick={() => handleDelete(entry.id, entry.screening_id)}>
                            <Trash2 size={15}/>
                          </button>
                        </div>
                      </td>
                    </tr>

                    {expanded === entry.id && (
                      <tr className="ve-exp-row">
                        <td colSpan={11} className="ve-exp-cell" onClick={e => e.stopPropagation()}>
                          <ExpandedPanel
                            entry={entry}
                            forms={forms}
                            babyName={listNameForEntry(piiByScreening[entry.screening_id], enr)}
                            initialTab={detailTab}
                            onEdit={() => handleEdit(entry)}
                            onDelete={() => handleDelete(entry.id, entry.screening_id)}
                            onViewForm={(formKey) => openForm(entry, formKey)}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="ve-pagination">
          <p className="ve-page-info">
            {filtered.length === 0
              ? "No results"
              : `Showing ${(page-1)*PER_PAGE+1}–${Math.min(page*PER_PAGE, filtered.length)} of ${filtered.length} participants`}
          </p>
          <div className="ve-page-controls">
            <button className="ve-page-btn" disabled={page === 1} onClick={() => setPage(p => p-1)}>
              <ChevronLeft size={15}/>
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => i+1).map(n => (
              <button
                key={n}
                className={`ve-page-btn${page === n ? " ve-page-btn--active" : ""}`}
                onClick={() => setPage(n)}
              >
                {n}
              </button>
            ))}
            {totalPages > 5 && <span className="ve-page-ellipsis">…</span>}
            {totalPages > 5 && (
              <button
                className={`ve-page-btn${page === totalPages ? " ve-page-btn--active" : ""}`}
                onClick={() => setPage(totalPages)}
              >{totalPages}</button>
            )}
            <button className="ve-page-btn" disabled={page === totalPages} onClick={() => setPage(p => p+1)}>
              <ChevronRight size={15}/>
            </button>
          </div>
        </div>
      </div>

    </div>
    {kpiModal && kpiModalRecords && (
      <KpiRecordsModal
        title={kpiModal.label}
        count={kpiModalRecords.rows.length}
        kind={kpiModalRecords.kind}
        rows={kpiModalRecords.rows}
        piiByScreening={piiByScreening}
        enrollData={enrollData}
        onClose={() => setKpiModal(null)}
        onOpenParticipant={(entry) => {
          setKpiModal(null);
          handleEdit(entry);
        }}
        onOpenSae={(row) => {
          setKpiModal(null);
          if (row.screening_id) localStorage.setItem("current_screening_id", row.screening_id);
          if (row.enrollment_id) localStorage.setItem("current_enrollment_id", row.enrollment_id);
          window.dispatchEvent(new Event("storage"));
          navigate(`/sae-list/${row.enrollment_id}`);
        }}
      />
    )}
    </DashboardWorkspaceLayout>
  );
}