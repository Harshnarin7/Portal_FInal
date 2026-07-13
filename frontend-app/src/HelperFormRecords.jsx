// src/HelperFormRecords.jsx — PORTAL Trial Helper Form 2 (Resp/CV/Neuro) Records
// Cross-patient daily-log work queue: today's work first, historical data
// reachable without cluttering it. Mirrors ViewEntries.jsx's page shell.

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import api from "./api/axios";
import { useAuth } from "./context/AuthContext";
import {
  Search, ChevronLeft, ChevronRight, RefreshCw, ClipboardList,
  HeartPulse, CheckCircle2, Clock, AlertTriangle, Bell, ArrowUpDown,
} from "lucide-react";
import "./HelperFormRecords.css";

const QUICK_FILTERS = [
  { key: "today",     label: "Today",       date_filter: "today",     status: "all" },
  { key: "yesterday", label: "Yesterday",   date_filter: "yesterday", status: "all" },
  { key: "last7",     label: "Last 7 Days", date_filter: "last7",     status: "all" },
  { key: "pending",   label: "Pending",     date_filter: "all",       status: "pending" },
  { key: "completed", label: "Completed",   date_filter: "all",       status: "completed" },
  { key: "mine",      label: "My Records",  date_filter: "all",       status: "all" },
  { key: "all",       label: "All Records", date_filter: "all",       status: "all" },
];

const STATUS_LABELS = {
  empty: "Not Started",
  draft: "Draft",
  complete: "Complete",
  submitted: "Submitted",
  late: "Late",
};

const PER_PAGE_OPTIONS = [10, 25, 50, 100];
const POLL_INTERVAL_MS = 60000; // 1 min — cheap latest-update check, not a full refetch

/* ── Helpers ─────────────────────────────────────────────────── */
function timeAgo(iso) {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (diffSec < 60) return "Just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}

function formatDate(isoDate) {
  if (!isoDate) return "—";
  const d = new Date(isoDate + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function highlight(text, query) {
  if (!text) return "—";
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="hr-hl">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function useDebouncedValue(value, delayMs) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

/* ── Sub-components ─────────────────────────────────────────── */
function KPICard({ label, value, icon, color }) {
  return (
    <div className="hr-kpi-card">
      <div className={`hr-kpi-icon hr-kpi-icon--${color}`}>{icon}</div>
      <div>
        <p className="hr-kpi-value">{value}</p>
        <p className="hr-kpi-label">{label}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const s = status || "empty";
  return <span className={`hr-badge hr-badge--${s}`}>{STATUS_LABELS[s] || s}</span>;
}

/* ── Main component ─────────────────────────────────────────── */
export default function HelperFormRecords() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [records,   setRecords]   = useState([]);
  const [total,     setTotal]     = useState(0);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);

  const [quickFilter, setQuickFilter] = useState("today");
  const [siteFilter,  setSiteFilter]  = useState("");
  const [sites,       setSites]       = useState([]);
  const [search,      setSearch]      = useState("");
  const debouncedSearch = useDebouncedValue(search, 350);

  const [sortKey, setSortKey]   = useState("updated_at");
  const [sortDir, setSortDir]   = useState("desc");
  const [page,     setPage]     = useState(1);
  const [perPage,  setPerPage]  = useState(25);

  const [latestSeen, setLatestSeen] = useState(null);
  const [newAvailable, setNewAvailable] = useState(false);
  const pollRef = useRef(null);

  const activeFilter = QUICK_FILTERS.find(f => f.key === quickFilter) || QUICK_FILTERS[0];

  /* ── Fetch page of records ── */
  const fetchRecords = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const params = {
        date_filter: activeFilter.date_filter,
        status: activeFilter.status,
        search: debouncedSearch,
        page,
        per_page: perPage,
      };
      if (siteFilter) params.site = siteFilter;
      const res = await api.get("/resp-cv-neuro/records", { params });
      let rows = res.data.records || [];

      if (quickFilter === "mine" && user?.name) {
        rows = rows.filter(r =>
          (r.saved_by || "").toLowerCase() === user.name.toLowerCase() ||
          (r.submitted_by || "").toLowerCase() === user.name.toLowerCase()
        );
      }

      setRecords(rows);
      setTotal(res.data.total ?? rows.length);

      const sitesSeen = new Set(rows.map(r => r.site_name).filter(Boolean));
      setSites(prev => Array.from(new Set([...prev, ...sitesSeen])).sort());

      const maxUpdated = rows.reduce((max, r) => {
        const t = r.updated_at ? new Date(r.updated_at).getTime() : 0;
        return t > max ? t : max;
      }, 0);
      if (maxUpdated) setLatestSeen(prev => (prev && prev > maxUpdated ? prev : maxUpdated));
      setNewAvailable(false);
    } catch (err) {
      console.error("Error fetching Helper Form records:", err);
      setError("Couldn't load records. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [activeFilter.date_filter, activeFilter.status, debouncedSearch, page, perPage, siteFilter, quickFilter, user]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  // Reset to page 1 whenever a filter/search/site changes
  useEffect(() => { setPage(1); }, [quickFilter, siteFilter, debouncedSearch, perPage]);

  /* ── Background polling — cheap "new records" detection ── */
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await api.get("/resp-cv-neuro/records/latest-update");
        const latest = res.data.latest_updated_at ? new Date(res.data.latest_updated_at).getTime() : null;
        if (latest && latestSeen && latest > latestSeen) setNewAvailable(true);
        if (latest && !latestSeen) setLatestSeen(latest);
      } catch { /* silent — polling is best-effort */ }
    };
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(pollRef.current);
  }, [latestSeen]);

  /* ── Client-side sort (page-local; server already filters/paginates) ── */
  const sorted = useMemo(() => {
    const copy = [...records];
    copy.sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey];
      if (sortKey === "calendar_date" || sortKey === "updated_at") {
        av = av ? new Date(av).getTime() : 0;
        bv = bv ? new Date(bv).getTime() : 0;
      } else {
        av = (av ?? "").toString().toLowerCase();
        bv = (bv ?? "").toString().toLowerCase();
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return copy;
  }, [records, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const kpis = useMemo(() => ([
    { label: "Showing",   value: records.length, icon: <ClipboardList size={20}/>, color: "blue" },
    { label: "Submitted", value: records.filter(r => r.submission_status === "submitted").length, icon: <CheckCircle2 size={20}/>, color: "green" },
    { label: "Pending",   value: records.filter(r => ["empty","draft","complete"].includes(r.submission_status)).length, icon: <Clock size={20}/>, color: "amber" },
    { label: "Late",      value: records.filter(r => r.submission_status === "late").length, icon: <AlertTriangle size={20}/>, color: "red" },
    { label: "Total (this view)", value: total, icon: <HeartPulse size={20}/>, color: "teal" },
  ]), [records, total]);

  const openRecord = (r) => {
    navigate(`/vs6-1/${r.enrollment_id}`);
  };

  if (loading && records.length === 0) {
    return (
      <div className="hr-loading">
        <RefreshCw size={22} className="hr-spin" />
        <span>Loading Helper Form records…</span>
      </div>
    );
  }

  return (
    <div className="hr-wrap">
      {/* ── Page header ── */}
      <div className="hr-header">
        <div>
          <div className="hr-breadcrumb"><HeartPulse size={15}/> Helper Form 2 · Resp / CV / Neuro</div>
          <h1 className="hr-title">Helper Form Records</h1>
          <p className="hr-subtitle">Daily NICU log entries across all patients and sites</p>
        </div>
        <div className="hr-header-right">
          <button
            className={`hr-btn-refresh${loading ? " hr-spin-icon" : ""}`}
            onClick={() => fetchRecords()}
            title="Refresh"
          >
            <RefreshCw size={16}/>
          </button>
        </div>
      </div>

      {/* ── New records banner ── */}
      {newAvailable && (
        <div className="hr-banner">
          <span className="hr-banner-msg"><Bell size={15}/> New or updated records have synced.</span>
          <button className="hr-banner-btn" onClick={() => fetchRecords()}>
            <RefreshCw size={13}/> Refresh
          </button>
        </div>
      )}

      {/* ── KPI strip ── */}
      <div className="hr-kpis">
        {kpis.map(k => <KPICard key={k.label} {...k} />)}
      </div>

      {/* ── Controls ── */}
      <div className="hr-controls">
        <div className="hr-search-wrap">
          <Search size={16} className="hr-search-icon"/>
          <input
            className="hr-search"
            placeholder="Search Participant ID, Screening ID, Mother Name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="hr-filters">
          {QUICK_FILTERS.map(f => (
            <button
              key={f.key}
              className={`hr-filter${quickFilter === f.key ? " hr-filter--active" : ""}`}
              onClick={() => setQuickFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
          {sites.length > 1 && (
            <>
              <div className="hr-filter-sep"/>
              <select
                className="hr-site-select"
                value={siteFilter}
                onChange={e => setSiteFilter(e.target.value)}
              >
                <option value="">All Sites</option>
                {sites.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="hr-banner" style={{ background: "var(--hr-red-lt)", borderColor: "#fca5a5" }}>
          <span className="hr-banner-msg"><AlertTriangle size={15}/> {error}</span>
          <button className="hr-banner-btn" onClick={() => fetchRecords()}>Retry</button>
        </div>
      )}

      {/* ── Table card ── */}
      <div className="hr-card">
        <div className="hr-table-scroll">
          <table className="hr-table">
            <thead>
              <tr className="hr-thead-row">
                <th className="hr-th hr-th--sticky">Participant ID</th>
                <th className="hr-th">Site</th>
                <th className="hr-th hr-th--center">NICU Day</th>
                <th className="hr-th hr-th--sortable" onClick={() => toggleSort("calendar_date")}>
                  Date <ArrowUpDown size={11} className="hr-th-sort-icon"/>
                </th>
                <th className="hr-th hr-th--sortable" onClick={() => toggleSort("submission_status")}>
                  Status <ArrowUpDown size={11} className="hr-th-sort-icon"/>
                </th>
                <th className="hr-th">Completion</th>
                <th className="hr-th hr-th--sortable" onClick={() => toggleSort("updated_at")}>
                  Last Updated <ArrowUpDown size={11} className="hr-th-sort-icon"/>
                </th>
                <th className="hr-th">Assigned User</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={8} className="hr-empty">
                    <ClipboardList size={32} opacity={0.3}/>
                    <p>No Helper Form records match your filters.</p>
                  </td>
                </tr>
              ) : sorted.map(r => (
                <tr key={`${r.enrollment_id}-${r.nicu_day}`} className="hr-row" onClick={() => openRecord(r)}>
                  <td className="hr-td hr-td--sticky hr-td--id">
                    {highlight(r.enrollment_id, debouncedSearch)}
                    {r.mother_name && (
                      <div className="hr-td--muted">{highlight(r.mother_name, debouncedSearch)}</div>
                    )}
                  </td>
                  <td className="hr-td">{r.site_name || "—"}</td>
                  <td className="hr-td hr-td--center">
                    <span className="hr-day-pill">D{r.nicu_day}</span>
                  </td>
                  <td className="hr-td">{formatDate(r.calendar_date)}</td>
                  <td className="hr-td"><StatusBadge status={r.submission_status}/></td>
                  <td className="hr-td">
                    <div className="hr-comp">
                      <div className="hr-comp-track">
                        <div className="hr-comp-fill" style={{ width: `${r.completion_pct || 0}%` }}/>
                      </div>
                      <span className="hr-comp-txt">{r.completion_pct || 0}%</span>
                    </div>
                  </td>
                  <td className="hr-td hr-td--muted" title={r.updated_at ? new Date(r.updated_at).toLocaleString() : ""}>
                    {timeAgo(r.updated_at)}
                  </td>
                  <td className="hr-td hr-td--muted">{r.submitted_by || r.saved_by || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="hr-pagination">
          <p className="hr-page-info">
            {total === 0
              ? "No results"
              : `Showing ${(page-1)*perPage+1}–${Math.min(page*perPage, total)} of ${total} records`}
          </p>
          <div className="hr-page-controls">
            <select className="hr-page-size" value={perPage} onChange={e => setPerPage(Number(e.target.value))}>
              {PER_PAGE_OPTIONS.map(n => <option key={n} value={n}>{n} / page</option>)}
            </select>
            <button className="hr-page-btn" disabled={page === 1} onClick={() => setPage(p => p-1)}>
              <ChevronLeft size={15}/>
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => i+1).map(n => (
              <button
                key={n}
                className={`hr-page-btn${page === n ? " hr-page-btn--active" : ""}`}
                onClick={() => setPage(n)}
              >
                {n}
              </button>
            ))}
            {totalPages > 5 && <span className="hr-page-ellipsis">…</span>}
            <button className="hr-page-btn" disabled={page === totalPages} onClick={() => setPage(p => p+1)}>
              <ChevronRight size={15}/>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
