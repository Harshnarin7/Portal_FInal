// src/ViewEntries.jsx — PORTAL Trial Participant Management
// Clean page layout — works inside the existing App header + navbar shell
// No duplicate sidebar or topnav

import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "./api/axios";
import {
  Search, Plus, ChevronLeft, ChevronRight, ChevronDown,
  Eye, Edit, Trash2, ArrowRight, Filter, AlertTriangle,
  RefreshCw, Users, FileText, Activity, ShieldAlert,
  CheckCircle2, Clock, XCircle, ClipboardList,
} from "lucide-react";
import "./ViewEntries.css";

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
  { key: "form_j",              short: "J",   label: "Composite Outcome" },
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

const FILTERS = ["All", "Eligible", "Screen Failure", "Not Eligible", "Pending"];
const DETAIL_TABS = ["Screening Details", "Gestation", "Consent Info", "Audit History"];
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

function buildFormProgress(enrollStatus) {
  if (!enrollStatus) return { form_a: true };
  return {
    form_a: true,
    form_b: enrollStatus.form_b ?? false,
    form_c: enrollStatus.form_c ?? false,
    form_d: enrollStatus.form_d ?? false,
  };
}

function computeForms(formProg) {
  return FORM_LABELS.map(f => ({
    ...f,
    status: formProg[f.key] === true ? "completed" : "locked",
  }));
}

function computeCompletion(formProg) {
  const done = Object.values(formProg).filter(Boolean).length;
  return { done, total: FORM_LABELS.length };
}

function getNextAction(entry, enrollStatus) {
  const s = entry.screening_status;
  if (!s || s === "Pending")      return { label: "Complete Screening", variant: "primary",   key: "form_a" };
  if (s === "Screen Failure")     return { label: "View Screening",     variant: "secondary", key: "form_a" };
  if (s === "Not Eligible")       return { label: "View Screening",     variant: "secondary", key: "form_a" };
  if (!enrollStatus || !enrollStatus.form_b) return { label: "Start Form B",    variant: "primary",   key: "form_b" };
  if (!enrollStatus.form_c)                  return { label: "Continue Form C", variant: "primary",   key: "form_c" };
  if (!enrollStatus.form_d)                  return { label: "Continue Form D", variant: "primary",   key: "form_d" };
  return { label: "Continue Forms", variant: "primary", key: "form_e" };
}

function buildKPIs(entries) {
  return [
    { label: "Total Screened",  value: entries.length,                                                              icon: <Users size={20}/>,        color: "blue"  },
    { label: "Eligible",        value: entries.filter(e => e.screening_status === "Eligible").length,               icon: <CheckCircle2 size={20}/>,  color: "green" },
    { label: "Screen Failures", value: entries.filter(e => e.screening_status === "Screen Failure").length,         icon: <XCircle size={20}/>,       color: "red"   },
    { label: "Pending",         value: entries.filter(e => !e.screening_status || e.screening_status==="Pending").length, icon: <Clock size={20}/>,    color: "amber" },
    { label: "Consented",       value: entries.filter(e => e.consent_given === "Yes").length,                       icon: <FileText size={20}/>,      color: "teal"  },
    { label: "Sites Active",    value: [...new Set(entries.map(e=>e.site_name).filter(Boolean))].length,            icon: <Activity size={20}/>,      color: "purple"},
    { label: "SAE / Safety",    value: 0,                                                                           icon: <ShieldAlert size={20}/>,   color: "red"   },
  ];
}

/* ─── Sub-components ─────────────────────────────────────────── */
function KPICard({ label, value, icon, color }) {
  return (
    <div className={`kpi-card kpi-card--${color}`}>
      <div className={`kpi-icon kpi-icon--${color}`}>{icon}</div>
      <div className="kpi-body">
        <p className="kpi-value">{value}</p>
        <p className="kpi-label">{label}</p>
      </div>
    </div>
  );
}

function ProgressDot({ label, status, title }) {
  return (
    <span className={`pdot pdot--${status}`} title={title || label}>
      {label}
    </span>
  );
}

function Badge({ sk, label }) {
  return <span className={`badge badge--${sk}`}>{label || "—"}</span>;
}

function ActionBtn({ label, variant, onClick }) {
  return (
    <button className={`act-btn act-btn--${variant}`} onClick={onClick}>
      {label}
      {variant === "danger"     ? <AlertTriangle size={14}/> :
       variant === "secondary"  ? <Filter size={14}/>        :
                                  <ArrowRight size={14}/>}
    </button>
  );
}

/* ─── Expanded detail panel ──────────────────────────────────── */
function ExpandedPanel({ entry, onEdit, onDelete }) {
  const [tab, setTab] = useState("Screening Details");
  const ga = entry.gestation_weeks != null
    ? `${entry.gestation_weeks}w ${entry.gestation_days ?? 0}d`
    : "—";

  const Field = ({ label, value }) => (
    <div className="exp-field">
      <p className="exp-field-label">{label}</p>
      <p className="exp-field-value">{value || "—"}</p>
    </div>
  );

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
        {tab === "Screening Details" && (
          <div className="exp-grid">
            <Field label="Screening ID"    value={entry.screening_id} />
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
            <Field label="Signature Obtained"  value={entry.consent_obtained_by_signature} />
            <Field label="Reconsent"           value={entry.reconsent_obtained ? "Yes" : "No"} />
            <Field label="Relationship"        value={entry.relationship_to_participant} />
          </div>
        )}
        {tab === "Audit History" && (
          <div className="exp-audit">
            {[
              entry.created_at  && { event: "Record Created",   time: new Date(entry.created_at).toLocaleString("en-IN"),  by: entry.screened_by },
              entry.updated_at  && { event: "Last Updated",     time: new Date(entry.updated_at).toLocaleString("en-IN"),  by: entry.updated_by },
              entry.consent_datetime && { event: "Consent Recorded", time: new Date(entry.consent_datetime).toLocaleString("en-IN"), by: entry.consent_taken_by },
            ].filter(Boolean).map((log, i) => (
              <div key={i} className="audit-row">
                <div className="audit-dot" />
                <div className="audit-content">
                  <p className="audit-event">{log.event}</p>
                  <p className="audit-meta">{log.time}{log.by ? ` · ${log.by}` : ""}</p>
                </div>
              </div>
            ))}
            {!entry.created_at && <p className="exp-empty">No audit records available.</p>}
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
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState("");
  const [filter,     setFilter]     = useState("All");
  const [expanded,   setExpanded]   = useState(null);
  const [page,       setPage]       = useState(1);

  /* ── Fetch ── */
  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/screenings/");
      setEntries(res.data);
    } catch (err) {
      console.error("Error fetching entries:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  useEffect(() => {
    entries
      .filter(e => e.enrollment_id && e.screening_status === "Eligible")
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

  const handleEdit = (entry) => {
    localStorage.setItem("current_screening_id", entry.screening_id);
    if (entry.enrollment_id) localStorage.setItem("current_enrollment_id", entry.enrollment_id);
    navigate(`/form-a/${entry.screening_id}`);
  };

  const handleAction = (entry, action) => {
    if (entry.screening_id) localStorage.setItem("current_screening_id", entry.screening_id);
    if (entry.enrollment_id) localStorage.setItem("current_enrollment_id", entry.enrollment_id);
    const fn = ROUTE_MAP[action.key];
    if (fn) navigate(fn(entry.screening_id, entry.enrollment_id));
  };

  /* ── Filter ── */
  const filtered = useMemo(() => entries.filter(e => {
    const q = search.toLowerCase();
    const matchQ = !q ||
      (e.screening_id  || "").toLowerCase().includes(q) ||
      (e.enrollment_id || "").toLowerCase().includes(q) ||
      (e.site_name     || "").toLowerCase().includes(q) ||
      (e.screened_by   || "").toLowerCase().includes(q);
    const matchF =
      filter === "All" ||
      (filter === "Eligible"       && e.screening_status === "Eligible") ||
      (filter === "Screen Failure" && e.screening_status === "Screen Failure") ||
      (filter === "Not Eligible"   && e.screening_status === "Not Eligible") ||
      (filter === "Pending"        && (!e.screening_status || e.screening_status === "Pending"));
    return matchQ && matchF;
  }), [entries, search, filter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const kpis  = buildKPIs(entries);

  // Helper to determine the specific class for an active filter
  const getActiveFilterClass = (f) => {
    if (filter !== f) return "";
    switch (f) {
      case "All":            return " ve-filter--active-all";
      case "Eligible":       return " ve-filter--active-eligible";
      case "Screen Failure": return " ve-filter--active-failure";
      case "Not Eligible":   return " ve-filter--active-not-eligible";
      case "Pending":        return " ve-filter--active-pending";
      default:               return "";
    }
  };

  if (loading) return (
    <div className="ve-loading">
      <RefreshCw size={22} className="ve-spin" />
      <span>Loading participants…</span>
    </div>
  );

  return (
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
              navigate("/form-a");
            }}
          >
            <Plus size={16}/> New Screening
          </button>
        </div>
      </div>

      {/* ── KPI strip ── */}
      <div className="ve-kpis">
        {kpis.map(k => <KPICard key={k.label} {...k} />)}
      </div>

      {/* ── Controls (Unified single horizontal row without Consent dropdown) ── */}
      <div className="ve-controls">
        <div className="ve-search-wrap">
          <Search size={16} className="ve-search-icon"/>
          <input
            className="ve-search"
            placeholder="Search Screening ID, Enrollment ID..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        
        <div className="ve-filters">
          {FILTERS.map(f => (
            <button
              key={f}
              className={`ve-filter${getActiveFilterClass(f)}`}
              onClick={() => { setFilter(f); setPage(1); }}
            >
              {f}
            </button>
          ))}
          <div className="ve-filter-sep"/>
          <button className="ve-filter ve-filter--dd">Site <ChevronDown size={13}/></button>
        </div>
      </div>

      {/* ── Table card ── */}
      <div className="ve-card">
        <div className="ve-table-scroll">
          <table className="ve-table">
            <thead>
              <tr className="ve-thead-row">
                <th className="ve-th ve-th--sticky">Screening ID</th>
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
                  <td colSpan={10} className="ve-empty">
                    <ClipboardList size={32} opacity={0.3}/>
                    <p>No participants match your filters.</p>
                  </td>
                </tr>
              ) : paged.map(entry => {
                const sk        = statusKey(entry.screening_status);
                const enr       = entry.enrollment_id ? enrollData[entry.enrollment_id] : null;
                const formProg  = buildFormProgress(enr);
                const forms     = computeForms(formProg);
                const comp      = computeCompletion(formProg);
                const pct       = Math.round((comp.done / comp.total) * 100);
                const action    = getNextAction(entry, enr);
                const ga        = entry.gestation_weeks != null
                  ? `${entry.gestation_weeks}w ${entry.gestation_days ?? 0}d`
                  : "—";

                return (
                  <React.Fragment key={entry.id}>
                    <tr
                      className={`ve-row${expanded === entry.id ? " ve-row--open" : ""}`}
                      onClick={() => setExpanded(p => p === entry.id ? null : entry.id)}
                    >
                      <td className="ve-td ve-td--sticky ve-td--id">{entry.screening_id}</td>
                      <td className="ve-td ve-td--md">{entry.enrollment_id || "—"}</td>
                      <td className="ve-td ve-td--md">{entry.site_name || "—"}</td>
                      <td className="ve-td ve-td--center ve-td--bold">{ga}</td>

                      {/* Form dots */}
                      <td className="ve-td">
                        <div className="ve-dots">
                          {forms.slice(0, 10).map((f, i) => (
                            <ProgressDot key={i} label={f.short} status={f.status} title={f.label}/>
                          ))}
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
                      <td className="ve-td">
                        <ActionBtn
                          label={action.label}
                          variant={action.variant}
                          onClick={e => { e.stopPropagation(); handleAction(entry, action); }}
                        />
                      </td>

                      {/* Icon actions with larger size (18px) */}
                      <td className="ve-td ve-td--right" onClick={e => e.stopPropagation()}>
                        <div className="icon-btns">
                          <button className="icon-btn" title="View" onClick={() => setExpanded(p => p === entry.id ? null : entry.id)}>
                            <Eye size={18}/>
                          </button>
                          <button className="icon-btn" title="Edit" onClick={() => handleEdit(entry)}>
                            <Edit size={18}/>
                          </button>
                          <button className="icon-btn icon-btn--del" title="Delete" onClick={() => handleDelete(entry.id, entry.screening_id)}>
                            <Trash2 size={18}/>
                          </button>
                        </div>
                      </td>
                    </tr>

                    {expanded === entry.id && (
                      <tr className="ve-exp-row">
                        <td colSpan={10} className="ve-exp-cell" onClick={e => e.stopPropagation()}>
                          <ExpandedPanel
                            entry={entry}
                            onEdit={() => handleEdit(entry)}
                            onDelete={() => handleDelete(entry.id, entry.screening_id)}
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
  );
}