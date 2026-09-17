import React, { useCallback, useEffect, useMemo, useState } from "react";
import api from "./api/axios";
import { useAuth } from "./context/AuthContext";
import DashboardWorkspaceLayout from "./components/dashboard/DashboardWorkspaceLayout";
import GlobalSiteFilter, { siteQueryParams } from "./components/dashboard/GlobalSiteFilter";
import { isGlobalUser, canViewAudit } from "./utils/roles";
import { auditTableLabel, AUDIT_ACTIONS, AUDIT_TABLE_LABELS } from "./utils/auditTableLabels";
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

function formatVal(v) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v, null, 2);
  return String(v);
}

function DiffModal({ row, onClose }) {
  if (!row) return null;
  const oldV = row.old_values || {};
  const newV = row.new_values || {};
  const keys = [...new Set([...Object.keys(oldV), ...Object.keys(newV)])].sort();

  return (
    <div className="audit-modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="audit-modal" onClick={(e) => e.stopPropagation()}>
        <div className="audit-modal-head">
          <strong>Change detail — {auditTableLabel(row.table_name)}</strong>
          <button type="button" className="audit-btn-link" onClick={onClose}>Close</button>
        </div>
        <div className="audit-modal-body">
          <p className="audit-ref">
            {row.enrollment_id && <>Enrollment: {row.enrollment_id} </>}
            {row.screening_id && <>· Screening: {row.screening_id}</>}
          </p>
          {keys.length === 0 ? (
            <p>No field-level values recorded.</p>
          ) : (
            keys.map((k) => (
              <div key={k} className="audit-diff-row">
                <div className="audit-diff-key">{k}</div>
                <div className="audit-diff-old">{formatVal(oldV[k])}</div>
                <div className="audit-diff-new">{formatVal(newV[k])}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
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
  }, [allowed, page, apiSite, dateFrom, dateTo, action, tableName, enrollmentId]);

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
                <option key={a} value={a}>{a}</option>
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
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={isGlobal ? 7 : 6} className="audit-state">No audit entries match these filters.</td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr key={row.id}>
                        <td>{formatTs(row.created_at)}</td>
                        {isGlobal && <td>{row.site ? siteShortCode(row.site) : "—"}</td>}
                        <td>{row.username || "—"}</td>
                        <td>{row.action}</td>
                        <td>{auditTableLabel(row.table_name)}</td>
                        <td className="audit-ref">
                          {row.enrollment_id || row.screening_id || row.record_id || "—"}
                        </td>
                        <td>
                          <button type="button" className="audit-btn-link" onClick={() => setDetailRow(row)}>
                            View changes
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
