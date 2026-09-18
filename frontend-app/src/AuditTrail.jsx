import React, { useCallback, useEffect, useMemo, useState } from "react";
import api from "./api/axios";
import { useAuth } from "./context/AuthContext";
import DashboardWorkspaceLayout from "./components/dashboard/DashboardWorkspaceLayout";
import GlobalSiteFilter, { siteQueryParams } from "./components/dashboard/GlobalSiteFilter";
import AuditChangeList from "./components/AuditChangeList";
import { isGlobalUser, canViewAudit } from "./utils/roles";
import { auditTableLabel, AUDIT_ACTIONS, AUDIT_TABLE_LABELS } from "./utils/auditTableLabels";
import {
  auditActionLabel,
  diffAuditValues,
  summarizeAuditChanges,
} from "./utils/auditDiff";
import { siteShortCode } from "./utils/siteNames";
import "./AuditTrail.css";

const PAGE_SIZE = 50;

function formatTs(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}

function DiffModal({ row, onClose }) {
  const [showUnchanged, setShowUnchanged] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    setShowUnchanged(false);
    setQuery("");
  }, [row?.id]);

  useEffect(() => {
    if (!row) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [row, onClose]);

  const { changes, unchanged } = useMemo(
    () => diffAuditValues(row?.old_values, row?.new_values),
    [row],
  );

  if (!row) return null;

  return (
    <div className="audit-modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="audit-modal" onClick={(e) => e.stopPropagation()}>
        <div className="audit-modal-head">
          <div>
            <strong>What changed — {auditTableLabel(row.table_name)}</strong>
            <div className="audit-modal-meta">
              <span className={`audit-action-pill audit-action-pill--${(row.action || "").toLowerCase()}`}>
                {auditActionLabel(row.action)}
              </span>
              {row.username && <span>by {row.username}</span>}
              <span>{formatTs(row.created_at)}</span>
            </div>
          </div>
          <button type="button" className="audit-btn-link" onClick={onClose}>Close</button>
        </div>
        <div className="audit-modal-body">
          <p className="audit-ref">
            {row.enrollment_id && <>Enrollment: {row.enrollment_id} </>}
            {row.screening_id && <>· Screening: {row.screening_id}</>}
          </p>
          <div className="audit-modal-toolbar">
            <span className="audit-change-count">
              {changes.length} field{changes.length === 1 ? "" : "s"} changed
              {unchanged.length > 0 && ` · ${unchanged.length} unchanged`}
            </span>
            <input
              type="search"
              className="audit-diff-search"
              placeholder="Find a field…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {unchanged.length > 0 && (
              <label className="audit-toggle">
                <input
                  type="checkbox"
                  checked={showUnchanged}
                  onChange={(e) => setShowUnchanged(e.target.checked)}
                />
                Show unchanged
              </label>
            )}
          </div>
          <AuditChangeList
            oldValues={row.old_values}
            newValues={row.new_values}
            showUnchanged={showUnchanged}
            filterText={query}
          />
        </div>
      </div>
    </div>
  );
}

function changeSummary(row) {
  const { changes } = diffAuditValues(row.old_values, row.new_values);
  return summarizeAuditChanges(changes, { action: row.action });
}

export default function AuditTrail() {
  const { user } = useAuth();
  const isGlobal = isGlobalUser(user);
  const allowed = canViewAudit(user);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [detailRow, setDetailRow] = useState(null);

  const [apiSite, setApiSite] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [action, setAction] = useState("");
  const [tableName, setTableName] = useState("");
  const [enrollmentId, setEnrollmentId] = useState("");
  const [screeningId, setScreeningId] = useState("");

  const tableOptions = useMemo(
    () => Object.keys(AUDIT_TABLE_LABELS).sort(),
    [],
  );

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setError(null);
    try {
      const params = {
        skip: page * PAGE_SIZE,
        limit: PAGE_SIZE,
        ...siteQueryParams(apiSite),
      };
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (action) params.action = action;
      if (tableName) params.table_name = tableName;
      if (enrollmentId.trim()) params.enrollment_id = enrollmentId.trim();
      if (screeningId.trim()) params.screening_id = screeningId.trim();

      const res = await api.get("/audit/", { params });
      const list = Array.isArray(res.data) ? res.data : [];
      setRows(list);
      setHasMore(list.length === PAGE_SIZE);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to load audit trail");
      setRows([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [allowed, page, apiSite, dateFrom, dateTo, action, tableName, enrollmentId, screeningId]);

  useEffect(() => {
    load();
  }, [load]);

  const resetFilters = () => {
    setApiSite("");
    setDateFrom("");
    setDateTo("");
    setAction("");
    setTableName("");
    setEnrollmentId("");
    setScreeningId("");
    setPage(0);
  };

  if (!allowed) {
    return (
      <DashboardWorkspaceLayout pageTitle="Audit Trail">
        <div className="audit-root audit-state audit-state--error">
          You do not have permission to view the audit trail.
        </div>
      </DashboardWorkspaceLayout>
    );
  }

  const colSpan = isGlobal ? 8 : 7;

  return (
    <DashboardWorkspaceLayout pageTitle="Audit Trail">
      <div className="audit-root">
        <div className="audit-filters">
          <label className="audit-filter">
            <span>From</span>
            <input type="date" value={dateFrom} onChange={(e) => { setPage(0); setDateFrom(e.target.value); }} />
          </label>
          <label className="audit-filter">
            <span>To</span>
            <input type="date" value={dateTo} onChange={(e) => { setPage(0); setDateTo(e.target.value); }} />
          </label>
          <label className="audit-filter">
            <span>Action</span>
            <select value={action} onChange={(e) => { setPage(0); setAction(e.target.value); }}>
              <option value="">All</option>
              {AUDIT_ACTIONS.map((a) => (
                <option key={a} value={a}>{auditActionLabel(a)}</option>
              ))}
            </select>
          </label>
          <label className="audit-filter">
            <span>Form / table</span>
            <select value={tableName} onChange={(e) => { setPage(0); setTableName(e.target.value); }}>
              <option value="">All</option>
              {tableOptions.map((t) => (
                <option key={t} value={t}>{auditTableLabel(t)}</option>
              ))}
            </select>
          </label>
          <label className="audit-filter audit-filter--wide">
            <span>Enrollment ID</span>
            <input
              type="search"
              placeholder="Filter…"
              value={enrollmentId}
              onChange={(e) => { setPage(0); setEnrollmentId(e.target.value); }}
            />
          </label>
          <label className="audit-filter audit-filter--wide">
            <span>Screening ID</span>
            <input
              type="search"
              placeholder="Filter…"
              value={screeningId}
              onChange={(e) => { setPage(0); setScreeningId(e.target.value); }}
            />
          </label>
          {isGlobal && (
            <GlobalSiteFilter
              value={apiSite}
              onChange={(v) => { setPage(0); setApiSite(v); }}
            />
          )}
          <button type="button" className="audit-btn-link" style={{ marginBottom: 8 }} onClick={resetFilters}>
            Reset filters
          </button>
        </div>

        {loading && <div className="audit-state">Loading audit trail…</div>}
        {error && !loading && <div className="audit-state audit-state--error">{error}</div>}

        {!loading && !error && (
          <>
            <div className="audit-table-wrap">
              <table className="audit-table">
                <thead>
                  <tr>
                    <th>When</th>
                    {isGlobal && <th>Site</th>}
                    <th>User</th>
                    <th>Action</th>
                    <th>Form</th>
                    <th>Record</th>
                    <th>What changed</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={colSpan} className="audit-state">No audit entries match these filters.</td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr key={row.id}>
                        <td>{formatTs(row.created_at)}</td>
                        {isGlobal && <td>{row.site ? siteShortCode(row.site) : "—"}</td>}
                        <td>{row.username || "—"}</td>
                        <td>
                          <span className={`audit-action-pill audit-action-pill--${(row.action || "").toLowerCase()}`}>
                            {auditActionLabel(row.action)}
                          </span>
                        </td>
                        <td>{auditTableLabel(row.table_name)}</td>
                        <td className="audit-ref">
                          {row.enrollment_id || row.screening_id || row.record_id || "—"}
                        </td>
                        <td className="audit-summary">{changeSummary(row)}</td>
                        <td>
                          <button type="button" className="audit-btn-link" onClick={() => setDetailRow(row)}>
                            View details
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="audit-pager">
              <button type="button" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                Previous
              </button>
              <span>Page {page + 1}</span>
              <button type="button" disabled={!hasMore} onClick={() => setPage((p) => p + 1)}>
                Next
              </button>
            </div>
          </>
        )}

        <DiffModal row={detailRow} onClose={() => setDetailRow(null)} />
      </div>
    </DashboardWorkspaceLayout>
  );
}
