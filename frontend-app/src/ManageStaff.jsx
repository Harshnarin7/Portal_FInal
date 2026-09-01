import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Navigate } from "react-router-dom";
import {
  Users, UserPlus, Search, RefreshCw, Shield, MapPin,
  UserMinus, KeyRound, CheckCircle2, AlertCircle, Loader2,
  X, Copy, Check, Sparkles,
} from "lucide-react";
import api from "./api/axios";
import { useAuth } from "./context/AuthContext";
import "./ManageStaff.css";

const ROLES = [
  { value: "superadmin",        label: "Superadmin",                                      short: "Superadmin",        tone: "purple" },
  { value: "project_scientist", label: "Project scientist (global — e.g. nodal scientist)", short: "Project scientist", tone: "sky" },
  { value: "site_pi",           label: "Site PI",                                         short: "Site PI",           tone: "teal" },
  { value: "site_scientist",    label: "Site scientist",                                  short: "Site scientist",    tone: "blue" },
  { value: "nurse",             label: "Nurse",                                           short: "Nurse",             tone: "green" },
  { value: "pii_officer",       label: "PII officer",                                     short: "PII officer",       tone: "amber" },
];

const ROLE_MAP = Object.fromEntries(ROLES.map((r) => [r.value, r]));

const GLOBAL_ROLES = ["superadmin", "project_scientist"];
const SITES = ["PGIMER", "GMCH", "GMCH-A", "AMC", "IOG", "AFMC"];

const BLANK_NEW_USER = {
  username: "", full_name: "", password: "", role: "nurse", site_name: "PGIMER", mobile: "",
};

function initials(fullName, username) {
  const src = (fullName || username || "?").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

function generateTempPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default function ManageStaff() {
  const { user } = useAuth();

  const [users, setUsers]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [loadError, setLoadError]   = useState("");
  const [newUser, setNewUser]       = useState(BLANK_NEW_USER);
  const [creating, setCreating]     = useState(false);
  const [formError, setFormError]   = useState("");
  const [formNotice, setFormNotice] = useState("");
  const [busyId, setBusyId]         = useState(null);
  const [copied, setCopied]         = useState(false);

  const [query, setQuery]           = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [siteFilter, setSiteFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");

  const [resetModal, setResetModal] = useState(null);

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

  const stats = useMemo(() => {
    const active = users.filter((u) => u.is_active).length;
    const sites = new Set(users.filter((u) => u.site_name).map((u) => u.site_name));
    return {
      total: users.length,
      active,
      deactivated: users.length - active,
      sites: sites.size,
    };
  }, [users]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (statusFilter === "active" && !u.is_active) return false;
      if (statusFilter === "deactivated" && u.is_active) return false;
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (siteFilter === "global" && u.site_name) return false;
      if (siteFilter !== "all" && siteFilter !== "global" && u.site_name !== siteFilter) return false;
      if (!q) return true;
      const hay = [u.username, u.full_name, u.role, u.site_name, u.mobile]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [users, query, roleFilter, siteFilter, statusFilter]);

  if (user && user.role !== "superadmin") {
    return <Navigate to="/dashboard" replace />;
  }

  const handleNewUserChange = (e) => {
    const { name, value } = e.target;
    setNewUser((prev) => {
      const next = { ...prev, [name]: value };
      if (name === "role" && GLOBAL_ROLES.includes(value)) next.site_name = "";
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
      setFormNotice(`Account “${newUser.username.trim()}” created. Share the temporary password — they must change it on first login.`);
      setNewUser(BLANK_NEW_USER);
      loadUsers();
    } catch (err) {
      setFormError(err.response?.data?.detail || "Could not create account.");
    } finally {
      setCreating(false);
    }
  };

  const handleRemove = async (targetUser) => {
    const ok = window.confirm(
      `Deactivate “${targetUser.username}”? They will no longer be able to log in, but their existing records stay unchanged.`
    );
    if (!ok) return;

    setBusyId(targetUser.id);
    try {
      await api.delete(`/users/${targetUser.id}`, { params: { hard_delete: false } });
      loadUsers();
    } catch (err) {
      alert(err.response?.data?.detail || "Could not update this account.");
    } finally {
      setBusyId(null);
    }
  };

  const handleResetPassword = async (targetUser) => {
    const ok = window.confirm(
      `Reset password for “${targetUser.username}”? They will receive a new temporary password and must change it on next login.`
    );
    if (!ok) return;

    setBusyId(targetUser.id);
    try {
      const res = await api.post(`/users/${targetUser.id}/reset-password`);
      setResetModal(res.data);
    } catch (err) {
      alert(err.response?.data?.detail || "Could not reset this password.");
    } finally {
      setBusyId(null);
    }
  };

  const copyTempPassword = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  };

  const isGlobalRole = GLOBAL_ROLES.includes(newUser.role);

  return (
    <div className="ms-page">
      <header className="ms-header">
        <div>
          <div className="ms-breadcrumb">
            <Shield size={12} strokeWidth={2.4} />
            Administration
          </div>
          <h1 className="ms-title">Manage Staff</h1>
          <p className="ms-subtitle">
            Create login accounts for site staff, and deactivate accounts that no longer need access.
          </p>
        </div>
        <button type="button" className="ms-icon-btn" onClick={loadUsers} title="Refresh directory" disabled={loading}>
          <RefreshCw size={16} className={loading ? "ms-spin" : ""} />
        </button>
      </header>

      <div className="ms-kpis">
        <div className="ms-kpi">
          <span className="ms-kpi-icon ms-kpi-icon--blue"><Users size={18} /></span>
          <div>
            <div className="ms-kpi-value">{stats.total}</div>
            <div className="ms-kpi-label">Total accounts</div>
          </div>
        </div>
        <div className="ms-kpi">
          <span className="ms-kpi-icon ms-kpi-icon--green"><CheckCircle2 size={18} /></span>
          <div>
            <div className="ms-kpi-value">{stats.active}</div>
            <div className="ms-kpi-label">Active</div>
          </div>
        </div>
        <div className="ms-kpi">
          <span className="ms-kpi-icon ms-kpi-icon--red"><UserMinus size={18} /></span>
          <div>
            <div className="ms-kpi-value">{stats.deactivated}</div>
            <div className="ms-kpi-label">Deactivated</div>
          </div>
        </div>
        <div className="ms-kpi">
          <span className="ms-kpi-icon ms-kpi-icon--teal"><MapPin size={18} /></span>
          <div>
            <div className="ms-kpi-value">{stats.sites}</div>
            <div className="ms-kpi-label">Sites represented</div>
          </div>
        </div>
      </div>

      <section className="ms-card">
        <div className="ms-card-head">
          <div className="ms-card-head-icon"><UserPlus size={16} /></div>
          <div>
            <h2>Add a new account</h2>
            <p>Issue a temporary password. The staff member must change it on first login.</p>
          </div>
        </div>

        <form className="ms-form" onSubmit={handleCreate}>
          <div className="ms-form-grid">
            <label className="ms-field">
              <span>Username <em>*</em></span>
              <input name="username" value={newUser.username} onChange={handleNewUserChange}
                     placeholder="e.g. asha.pgimer" autoComplete="off" required />
            </label>
            <label className="ms-field">
              <span>Full name</span>
              <input name="full_name" value={newUser.full_name} onChange={handleNewUserChange}
                     placeholder="e.g. Asha Kumari" autoComplete="off" />
            </label>
            <label className="ms-field">
              <span>Temporary password <em>*</em></span>
              <div className="ms-password-row">
                <input name="password" type="text" value={newUser.password} onChange={handleNewUserChange}
                       placeholder="Share with the staff member" autoComplete="off" required />
                <button
                  type="button"
                  className="ms-gen-btn"
                  title="Generate a temporary password"
                  onClick={() => setNewUser((p) => ({ ...p, password: generateTempPassword() }))}
                >
                  <Sparkles size={14} />
                  Generate
                </button>
              </div>
            </label>
            <label className="ms-field">
              <span>Role <em>*</em></span>
              <select name="role" value={newUser.role} onChange={handleNewUserChange}>
                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </label>
            <label className="ms-field">
              <span>Site {isGlobalRole ? "" : <em>*</em>}</span>
              <select name="site_name" value={newUser.site_name} onChange={handleNewUserChange}
                      disabled={isGlobalRole}>
                {isGlobalRole
                  ? <option value="">Global — all sites</option>
                  : SITES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="ms-field">
              <span>Mobile</span>
              <input name="mobile" value={newUser.mobile} onChange={handleNewUserChange}
                     placeholder="Optional" inputMode="tel" />
            </label>
          </div>

          {formError && (
            <div className="ms-banner ms-banner--error" role="alert">
              <AlertCircle size={16} /> {formError}
            </div>
          )}
          {formNotice && (
            <div className="ms-banner ms-banner--ok" role="status">
              <CheckCircle2 size={16} /> {formNotice}
            </div>
          )}

          <div className="ms-form-actions">
            <button type="submit" className="ms-btn-primary" disabled={creating}>
              {creating ? <><Loader2 size={16} className="ms-spin" /> Creating…</> : <><UserPlus size={16} /> Create account</>}
            </button>
          </div>
        </form>
      </section>

      <section className="ms-card">
        <div className="ms-card-head">
          <div className="ms-card-head-icon"><Users size={16} /></div>
          <div>
            <h2>Staff directory</h2>
            <p>{filtered.length} of {users.length} account{users.length === 1 ? "" : "s"} shown</p>
          </div>
        </div>

        <div className="ms-toolbar">
          <div className="ms-search">
            <Search size={15} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, username, site…"
            />
          </div>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label="Filter by role">
            <option value="all">All roles</option>
            {ROLES.map((r) => <option key={r.value} value={r.value}>{r.short}</option>)}
          </select>
          <select value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)} aria-label="Filter by site">
            <option value="all">All sites</option>
            <option value="global">Global</option>
            {SITES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
            <option value="active">Active</option>
            <option value="deactivated">Deactivated</option>
            <option value="all">All statuses</option>
          </select>
        </div>

        {loadError && (
          <div className="ms-banner ms-banner--error" role="alert">
            <AlertCircle size={16} /> {loadError}
          </div>
        )}

        {loading && (
          <div className="ms-state">
            <Loader2 size={20} className="ms-spin" /> Loading directory…
          </div>
        )}

        {!loading && !loadError && filtered.length === 0 && (
          <div className="ms-state">
            {users.length === 0 ? "No accounts found." : "No accounts match these filters."}
          </div>
        )}

        {!loading && !loadError && filtered.length > 0 && (
          <div className="ms-dir">
            <div className="ms-dir-head" aria-hidden="true">
              <span>Staff member</span>
              <span>Role</span>
              <span>Site</span>
              <span>Status</span>
              <span>Actions</span>
            </div>
            {filtered.map((u) => {
              const meta = ROLE_MAP[u.role];
              const isSelf = u.username === user?.username;
              return (
                <div key={u.id} className={`ms-dir-row${!u.is_active ? " ms-dir-row--inactive" : ""}`}>
                  <div className="ms-person">
                    <span className={`ms-avatar ms-avatar--${meta?.tone || "blue"}`} aria-hidden="true">
                      {initials(u.full_name, u.username)}
                    </span>
                    <div className="ms-person-copy">
                      <div className="ms-person-name">
                        {u.full_name || u.username}
                        {isSelf && <span className="ms-you">You</span>}
                      </div>
                      <div className="ms-person-user">{u.username}</div>
                    </div>
                  </div>
                  <span className={`ms-role ms-role--${meta?.tone || "blue"}`}>
                    {meta?.short || u.role}
                  </span>
                  <span className="ms-site">{u.site_name || <span className="ms-muted">Global</span>}</span>
                  <div className="ms-status-stack">
                    <span className={`ms-status ${u.is_active ? "ms-status--on" : "ms-status--off"}`}>
                      {u.is_active ? "Active" : "Deactivated"}
                    </span>
                    {u.is_active && u.must_change_password && (
                      <span className="ms-status ms-status--pending">Password change pending</span>
                    )}
                  </div>
                  <div className="ms-actions">
                    {isSelf ? (
                      <span className="ms-muted">This is you</span>
                    ) : u.is_active ? (
                      <>
                        <button
                          type="button"
                          className="ms-btn-ghost"
                          disabled={busyId === u.id}
                          onClick={() => handleResetPassword(u)}
                          title="Issue a new temporary password"
                        >
                          {busyId === u.id ? <Loader2 size={14} className="ms-spin" /> : <KeyRound size={14} />}
                          Reset
                        </button>
                        <button
                          type="button"
                          className="ms-btn-danger"
                          disabled={busyId === u.id}
                          onClick={() => handleRemove(u)}
                        >
                          {busyId === u.id ? "…" : "Deactivate"}
                        </button>
                      </>
                    ) : (
                      <span className="ms-muted">—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {resetModal && (
        <div className="ms-modal-overlay" onClick={() => { setResetModal(null); setCopied(false); }}>
          <div className="ms-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="ms-reset-title">
            <button type="button" className="ms-modal-close" onClick={() => { setResetModal(null); setCopied(false); }} aria-label="Close">
              <X size={16} />
            </button>
            <div className="ms-modal-icon"><KeyRound size={18} /></div>
            <h3 id="ms-reset-title">Temporary password issued</h3>
            <p>Share this with <strong>{resetModal.username}</strong>. They must change it on next login.</p>
            <div className="ms-temp-row">
              <code>{resetModal.temp_password}</code>
              <button type="button" className="ms-btn-ghost" onClick={() => copyTempPassword(resetModal.temp_password)}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
