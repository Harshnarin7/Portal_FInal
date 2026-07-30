import React, { useState, useEffect, useCallback } from "react";
import { Navigate } from "react-router-dom";
import api from "./api/axios";
import { useAuth } from "./context/AuthContext";
import "./ManageStaff.css";

const ROLES = [
  { value: "superadmin",        label: "Superadmin" },
  { value: "project_scientist", label: "Project scientist (global — e.g. nodal scientist)" },
  { value: "site_pi",           label: "Site PI" },
  { value: "site_scientist",    label: "Site scientist" },
  { value: "nurse",             label: "Nurse" },
  { value: "pii_officer",       label: "PII officer" },
];

// Roles that don't belong to a single site — site_name must stay empty for these.
const GLOBAL_ROLES = ["superadmin", "project_scientist"];

const SITES = ["PGIMER", "GMCH", "GMCH-A", "AMC", "IOG", "AFMC"];

const BLANK_NEW_USER = {
  username: "", full_name: "", password: "", role: "nurse", site_name: "PGIMER", mobile: "",
};

export default function ManageStaff() {
  const { user } = useAuth();

  const [users, setUsers]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [loadError, setLoadError]   = useState("");
  const [newUser, setNewUser]       = useState(BLANK_NEW_USER);
  const [creating, setCreating]     = useState(false);
  const [formError, setFormError]   = useState("");
  const [formNotice, setFormNotice] = useState("");
  const [busyId, setBusyId]         = useState(null);  // user id currently being deactivated/removed

  const loadUsers = useCallback(() => {
    setLoading(true);
    setLoadError("");
    api.get("/users/")
      .then((res) => setUsers(res.data || []))
      .catch((err) => {
        setLoadError(
          err.response?.status === 403
            ? "Superadmin access required to view this page."
            : "Could not load users."
        );
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  // Only a superadmin should ever land on this page.
  if (user && user.role !== "superadmin") {
    return <Navigate to="/dashboard" replace />;
  }

  const handleNewUserChange = (e) => {
    const { name, value } = e.target;
    setNewUser((prev) => {
      const next = { ...prev, [name]: value };
      if (name === "role" && GLOBAL_ROLES.includes(value)) {
        next.site_name = "";
      }
      if (name === "role" && !GLOBAL_ROLES.includes(value) && !prev.site_name) {
        next.site_name = SITES[0];
      }
      return next;
    });
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormError("");
    setFormNotice("");

    if (!newUser.username || !newUser.password || !newUser.role) {
      setFormError("Username, password, and role are required.");
      return;
    }
    if (!GLOBAL_ROLES.includes(newUser.role) && !newUser.site_name) {
      setFormError("Site is required for this role.");
      return;
    }

    setCreating(true);
    try {
      await api.post("/users/", {
        username: newUser.username.trim(),
        full_name: newUser.full_name.trim() || undefined,
        password: newUser.password,
        role: newUser.role,
        site_name: GLOBAL_ROLES.includes(newUser.role) ? null : newUser.site_name,
        mobile: newUser.mobile.trim() || undefined,
      });
      setFormNotice(`Account "${newUser.username}" created.`);
      setNewUser(BLANK_NEW_USER);
      loadUsers();
    } catch (err) {
      setFormError(err.response?.data?.detail || "Could not create account.");
    } finally {
      setCreating(false);
    }
  };

  const handleRemove = async (targetUser, hardDelete) => {
    const ok = window.confirm(
      `Deactivate "${targetUser.username}"? They will no longer be able to log in, but their existing records stay unchanged.`
    );
    if (!ok) return;

    setBusyId(targetUser.id);
    try {
      await api.delete(`/users/${targetUser.id}`, { params: { hard_delete: hardDelete } });
      loadUsers();
    } catch (err) {
      alert(err.response?.data?.detail || "Could not update this account.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="manage-staff-page">
      <h2>Manage staff</h2>
      <p className="manage-staff-subtitle">
        Create login accounts for site staff, and deactivate or remove accounts that no longer need access.
      </p>

      {/* ===== Create account ===== */}
      <div className="manage-staff-card">
        <h3>Add a new account</h3>
        <form className="manage-staff-form" onSubmit={handleCreate}>
          <div className="manage-staff-form-grid">
            <label>
              Username
              <input name="username" value={newUser.username} onChange={handleNewUserChange}
                     placeholder="e.g. asha.pgimer" required />
            </label>
            <label>
              Full name
              <input name="full_name" value={newUser.full_name} onChange={handleNewUserChange}
                     placeholder="e.g. Asha Kumari" />
            </label>
            <label>
              Temporary password
              <input name="password" type="text" value={newUser.password} onChange={handleNewUserChange}
                     placeholder="Given to staff member to change on first login" required />
            </label>
            <label>
              Role
              <select name="role" value={newUser.role} onChange={handleNewUserChange}>
                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </label>
            <label>
              Site
              <select name="site_name" value={newUser.site_name} onChange={handleNewUserChange}
                      disabled={GLOBAL_ROLES.includes(newUser.role)}>
                {GLOBAL_ROLES.includes(newUser.role)
                  ? <option value="">— Global (all sites) —</option>
                  : SITES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label>
              Mobile (optional)
              <input name="mobile" value={newUser.mobile} onChange={handleNewUserChange} />
            </label>
          </div>

          {formError  && <div className="manage-staff-error">{formError}</div>}
          {formNotice && <div className="manage-staff-notice">{formNotice}</div>}

          <button type="submit" disabled={creating}>
            {creating ? "Creating…" : "Create account"}
          </button>
        </form>
      </div>

      {/* ===== Existing accounts ===== */}
      <div className="manage-staff-card">
        <h3>Existing accounts</h3>

        {loading && <p>Loading…</p>}
        {loadError && <div className="manage-staff-error">{loadError}</div>}

        {!loading && !loadError && (
          <div className="manage-staff-table-wrapper">
            <table className="manage-staff-table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Full name</th>
                  <th>Role</th>
                  <th>Site</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className={!u.is_active ? "manage-staff-row-inactive" : ""}>
                    <td>{u.username}</td>
                    <td>{u.full_name || "—"}</td>
                    <td>{ROLES.find((r) => r.value === u.role)?.label || u.role}</td>
                    <td>{u.site_name || "Global"}</td>
                    <td>{u.is_active ? "Active" : "Deactivated"}</td>
                    <td className="manage-staff-row-actions">
                      {u.username === user.username ? (
                        <span className="manage-staff-muted">This is you</span>
                      ) : u.is_active ? (
                        <button
                          className="manage-staff-btn-danger"
                          disabled={busyId === u.id}
                          onClick={() => handleRemove(u, false)}
                        >
                          {busyId === u.id ? "…" : "Remove"}
                        </button>
                      ) : (
                        <span className="manage-staff-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={6} className="manage-staff-muted">No accounts found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
