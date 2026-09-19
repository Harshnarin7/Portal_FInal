import React from "react";
import { diffAuditValues, formatAuditValue } from "../utils/auditDiff";
import "./AuditChangeList.css";

export default function AuditChangeList({
  oldValues,
  newValues,
  hideKeys = [],
  compact = false,
  showUnchanged = false,
  filterText = "",
}) {
  const { changes, unchanged } = diffAuditValues(oldValues, newValues, { hideKeys });
  const q = String(filterText || "").trim().toLowerCase();
  const match = (row) => (
    !q || row.label.toLowerCase().includes(q) || row.key.toLowerCase().includes(q)
  );
  const rows = (showUnchanged ? [...changes, ...unchanged] : changes).filter(match);

  if (rows.length === 0) {
    return (
      <p className="audit-changes-empty">
        {q
          ? "No fields match that search."
          : (showUnchanged ? "No fields recorded." : "No field values changed.")}
      </p>
    );
  }

  if (compact) {
    return (
      <ul className="audit-changes-compact">
        {rows.map((row) => (
          <li key={row.key} className={`audit-changes-compact-item audit-changes-compact-item--${row.kind}`}>
            <span className="audit-changes-compact-label">{row.label}</span>
            <span className="audit-changes-compact-vals">
              <span className="audit-changes-from">{formatAuditValue(row.from)}</span>
              <span className="audit-changes-arrow" aria-hidden="true">→</span>
              <span className="audit-changes-to">{formatAuditValue(row.to)}</span>
            </span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="audit-changes-table-wrap">
      <div className="audit-changes-table" role="table">
        <div className="audit-changes-thead" role="row">
          <span>Field</span>
          <span>Before</span>
          <span>After</span>
        </div>
        {rows.map((row) => (
          <div key={row.key} className={`audit-changes-row audit-changes-row--${row.kind}`} role="row">
            <span className="audit-changes-field" title={row.key}>{row.label}</span>
            <span className="audit-changes-from">{formatAuditValue(row.from)}</span>
            <span className="audit-changes-to">{formatAuditValue(row.to)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
