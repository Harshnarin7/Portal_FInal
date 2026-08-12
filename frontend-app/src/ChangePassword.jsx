import React, { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import api from "./api/axios";
import { useAuth } from "./context/AuthContext";
import "./Login.css";

export default function ChangePassword() {
  const navigate = useNavigate();
  const { token, user, setMustChangePassword, logout } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showNew, setShowNew] = useState(false);

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  /* Already updated password — don't keep them on this screen */
  if (user && user.must_change_password === false) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }
    if (newPassword === currentPassword) {
      setError("New password must be different from the temporary password");
      return;
    }

    setLoading(true);
    try {
      await api.post("/auth/change-password", {
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      setMustChangePassword(false);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Could not update password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-atmosphere" aria-hidden="true">
        <div className="login-orb login-orb-a" />
        <div className="login-orb login-orb-b" />
        <div className="login-grid" />
      </div>

      <header className="login-topbar">
        <Link to="/" className="login-brand">
          <img src="/logo.png" alt="" className="login-brand-mark" />
          <span className="login-brand-word">
            P<span className="login-o">O</span>RTAL
          </span>
        </Link>
        <button type="button" className="login-back" onClick={logout}>
          Sign out
        </button>
      </header>

      <main className="login-main">
        <aside className="login-panel-brand">
          <div className="login-panel-inner">
            <div className="login-funders">
              <img src="/logo.png" alt="PORTAL Trial" />
              <img src="/icmr-logo.jpg" alt="ICMR" className="login-icmr" />
            </div>
            <p className="login-kicker">First-time security</p>
            <h1 className="login-display">Set a new password</h1>
            <p className="login-lede">
              Your account was created with a temporary password from the credentials
              CSV. Choose a personal password before using the webforms — same rule as
              the mobile app.
            </p>
            <ul className="login-points">
              <li>At least 8 characters</li>
              <li>Different from the temporary password</li>
              <li>Do not share credentials across staff</li>
            </ul>
          </div>
        </aside>

        <section className="login-panel-form">
          <form className="login-form" onSubmit={handleSubmit} noValidate>
            <h2>Change password</h2>
            <p className="login-form-sub">
              {user?.full_name || user?.username
                ? `Signed in as ${user.full_name || user.username}`
                : "Required before continuing"}
            </p>

            {error && (
              <div className="login-error" role="alert">
                {error}
              </div>
            )}

            <label className="login-field">
              <span>Current (temporary) password</span>
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                disabled={loading}
              />
            </label>

            <label className="login-field">
              <span>New password</span>
              <div className="login-password">
                <input
                  type={showNew ? "text" : "password"}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  disabled={loading}
                  minLength={8}
                />
                <button
                  type="button"
                  className="login-toggle-pw"
                  onClick={() => setShowNew((v) => !v)}
                  aria-label={showNew ? "Hide password" : "Show password"}
                >
                  {showNew ? "Hide" : "Show"}
                </button>
              </div>
            </label>

            <label className="login-field">
              <span>Confirm new password</span>
              <input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={loading}
                minLength={8}
              />
            </label>

            <button type="submit" className="login-submit" disabled={loading}>
              {loading ? "Updating…" : "Save password & continue"}
            </button>

            <p className="login-note">
              After saving you will enter the PORTAL dashboard
            </p>
          </form>
        </section>
      </main>
    </div>
  );
}
