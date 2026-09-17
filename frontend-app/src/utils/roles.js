/** Mirror backend/deps.py GLOBAL_ROLES for UI gating (not authoritative). */
const GLOBAL_ROLES = new Set(["superadmin", "global_scientist"]);

export function isGlobalUser(user) {
  return GLOBAL_ROLES.has((user?.role || "").toLowerCase());
}

export function canViewAudit(user) {
  const r = (user?.role || "").toLowerCase();
  return isGlobalUser(user) || r === "site_pi";
}

export function roleDisplayLabel(role) {
  const r = (role || "").toLowerCase();
  const map = {
    superadmin: "Super Admin",
    global_scientist: "Global Scientist",
    project_scientist: "Project Scientist",
    site_pi: "Site PI",
    site_scientist: "Site Scientist",
    nurse: "Research Nurse",
    pii_officer: "PII Officer",
    admin: "Admin",
    pi: "Principal Investigator",
    scientist: "Scientist",
    deo: "Data Entry Operator",
    monitor: "Trial Monitor",
  };
  return map[r] || role || "User";
}
