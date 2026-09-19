/** Compare audit old/new snapshots so reviewers can see what actually changed. */

export const AUDIT_NOISE_KEYS = new Set([
  "id",
  "created_at",
  "updated_at",
  "created_by",
  "updated_by",
  "deleted_at",
  "deleted_by",
]);

export const AUDIT_ACTION_LABELS = {
  INSERT: "Created",
  UPDATE: "Updated",
  SOFT_DELETE: "Deleted",
  OVERRIDE_UNLOCK: "Override unlock",
};

const ACRONYMS = {
  ga: "GA",
  nbs: "NBS",
  fio2: "FiO₂",
  cpap: "CPAP",
  pii: "PII",
  dob: "DOB",
  uid: "UID",
  et: "ET",
  kmc: "KMC",
  lisa: "LISA",
  sae: "SAE",
  usg: "USG",
  lmp: "LMP",
  sga: "SGA",
  aga: "AGA",
  lga: "LGA",
  pma: "PMA",
  nicu: "NICU",
  hr: "HR",
  spo2: "SpO₂",
  bpd: "BPD",
  ivh: "IVH",
  pvl: "PVL",
  rop: "ROP",
};

const FIELD_LABELS = {
  gestation_weeks: "Gestation (weeks)",
  gestation_days: "Gestation (days)",
  gestation_rand_weeks: "Gestation at randomization (weeks)",
  gestation_rand_days: "Gestation at randomization (days)",
  ga_method: "GA method",
  explicitly_saved: "Explicitly saved",
  screening_datetime: "Screening date & time",
  date_of_birth: "Date of birth",
  time_of_birth: "Time of birth",
  birth_weight: "Birth weight",
  enrollment_id: "Enrollment ID",
  screening_id: "Screening ID",
  screening_status: "Screening status",
  mother_name_first: "Mother first name",
  mother_name_surname: "Mother surname",
  reason: "Reason",
  hours: "Unlock hours",
  nicu_day: "NICU day",
};

export function auditActionLabel(action) {
  if (!action) return "—";
  const key = String(action).toUpperCase();
  return AUDIT_ACTION_LABELS[key] || String(action).replace(/_/g, " ");
}

export function humanizeField(key) {
  if (!key) return "";
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  return String(key)
    .split("_")
    .map((part) => {
      const lower = part.toLowerCase();
      if (ACRONYMS[lower]) return ACRONYMS[lower];
      if (/^\d+$/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");
}

function isEmpty(value) {
  return value === null || value === undefined || value === "";
}

export function formatAuditValue(value) {
  if (isEmpty(value)) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  const str = String(value);
  if (/^\d{4}-\d{2}-\d{2}T/.test(str)) {
    const d = new Date(str);
    if (!Number.isNaN(d.getTime())) return d.toLocaleString();
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const d = new Date(`${str}T00:00:00`);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString();
  }
  return str;
}

function canonical(value) {
  if (isEmpty(value)) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value).trim();
}

export function valuesEqual(a, b) {
  return canonical(a) === canonical(b);
}

function collectKeys(oldValues, newValues) {
  return [...new Set([
    ...Object.keys(oldValues || {}),
    ...Object.keys(newValues || {}),
  ])].sort();
}

/**
 * @returns {{
 *   changes: Array<{key: string, label: string, from: any, to: any, kind: string}>,
 *   unchanged: Array<{key: string, label: string, from: any, to: any, kind: string}>,
 * }}
 */
export function diffAuditValues(oldValues, newValues, { hideKeys = [] } = {}) {
  const hide = new Set([...AUDIT_NOISE_KEYS, ...hideKeys]);
  const oldV = oldValues && typeof oldValues === "object" ? oldValues : {};
  const newV = newValues && typeof newValues === "object" ? newValues : {};
  const changes = [];
  const unchanged = [];

  for (const key of collectKeys(oldV, newV)) {
    if (hide.has(key)) continue;
    const from = Object.prototype.hasOwnProperty.call(oldV, key) ? oldV[key] : undefined;
    const to = Object.prototype.hasOwnProperty.call(newV, key) ? newV[key] : undefined;
    const row = {
      key,
      label: humanizeField(key),
      from,
      to,
      kind: "unchanged",
    };
    if (valuesEqual(from, to)) {
      unchanged.push(row);
      continue;
    }
    if (isEmpty(from) && !isEmpty(to)) row.kind = "added";
    else if (!isEmpty(from) && isEmpty(to)) row.kind = "removed";
    else row.kind = "changed";
    changes.push(row);
  }

  return { changes, unchanged };
}

export function summarizeAuditChanges(changes, { action, limit = 3 } = {}) {
  const act = String(action || "").toUpperCase();
  if (act === "SOFT_DELETE") return "Record deleted";
  if (act === "OVERRIDE_UNLOCK" && (!changes || changes.length === 0)) {
    return "Day unlocked for correction";
  }
  if (!changes || changes.length === 0) {
    return act === "INSERT" ? "Record created" : "No field values changed";
  }
  if (act === "INSERT") {
    return `Created · ${changes.length} field${changes.length === 1 ? "" : "s"} set`;
  }
  const names = changes.map((c) => c.label);
  if (names.length <= limit) return names.join(", ");
  return `${names.slice(0, limit).join(", ")} +${names.length - limit} more`;
}
