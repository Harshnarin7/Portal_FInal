import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "./api/axios";
import { useAuth } from "./context/AuthContext";
import "./Login.css";

function loginErrorMessage(err) {
  const status = err?.response?.status;
  if (!err?.response) {
    return "Could not reach the server — check your connection and try again";
  }
  if (status === 401) {
    return "Invalid username or password";
  }
  if (status === 429) {
    const retry = err.response.headers?.["retry-after"];
    const secs = Number(retry);
    if (Number.isFinite(secs) && secs > 0) {
      const mins = Math.max(1, Math.ceil(secs / 60));
      return `Too many login attempts — please wait ${mins} minute${mins === 1 ? "" : "s"} and try again`;
    }
    return "Too many login attempts — please wait a few minutes and try again";
  }
  if (status === 403) {
    const detail = err.response.data?.detail;
    if (typeof detail === "string" && detail.trim()) return detail;
    return "Account is deactivated";
  }
  return "Something went wrong, please try again";
}

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.post("/auth/login", { username, password });
      login(res.data.access_token, res.data.refresh_token, res.data.user);
      if (res.data.user?.must_change_password) {
        navigate("/change-password", { replace: true });
      } else {
        navigate("/dashboard", { replace: true });
      }
    } catch (err) {
      setError(loginErrorMessage(err));
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
        <Link to="/" className="login-back">
          ← Back to public site
        </Link>
      </header>

      <main className="login-main">
        <aside className="login-panel-brand">
          <div className="login-panel-inner">
            <div className="login-funders">
              <img src="/logo.png" alt="PORTAL Trial" />
              <img src="/icmr-logo.jpg" alt="ICMR" className="login-icmr" />
            </div>
            <p className="login-kicker">Research staff access</p>
            <h1 className="login-display">
              Secure entry to the trial workspace
            </h1>
            <p className="login-lede">
              Authorised investigators and research nurses only. Patient data stays
              behind authenticated sessions with audit trail.
            </p>
            <ul className="login-points">
              <li>ICMR-funded multi-site RCT</li>
              <li>Proposal ID IIRPIG-01-00478</li>
              <li>Coordinating centre · PGIMER Chandigarh</li>
            </ul>
          </div>
        </aside>

        <section className="login-panel-form">
          <form className="login-form" onSubmit={handleSubmit} noValidate>
            <h2>Sign in</h2>
            <p className="login-form-sub">Use your site credentials</p>

            {error && (
              <div className="login-error" role="alert">
                {error}
              </div>
            )}

            <label className="login-field">
              <span>Username</span>
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                required
                disabled={loading}
              />
            </label>

            <label className="login-field">
              <span>Password</span>
              <div className="login-password">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  className="login-toggle-pw"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </label>

            <button type="submit" className="login-submit" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </button>

            <p className="login-note">
              Authorised clinical research personnel only
            </p>
          </form>
        </section>
      </main>
    </div>
  );
}
