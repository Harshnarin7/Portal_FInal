import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "./api/axios";
import { useAuth } from "./context/AuthContext";
import "./Login.css";

export default function Login() {

  const navigate = useNavigate();
  const { login } = useAuth();   // ✅ get login function from AuthContext

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

      const res = await api.post("/auth/login", {
        username,
        password,
      });

      login(res.data.access_token, res.data.refresh_token);

      // ✅ redirect after login
      navigate("/dashboard", { replace: true });

    } catch (err) {

      setError("Invalid username or password");

    } finally {

      setLoading(false);

    }
  };

  return (
  <div className="login-page">

  <div className="login-glow"></div>

  <form className="login-card" onSubmit={handleSubmit}>

    {/* ✅ LOGO */}
    <img src="/logo.png" alt="PORTAL Logo" className="logo" />

    <h2>PORTAL Trial</h2>
    <p className="subtitle">Secure Clinical Access</p>

    {error && <div className="error">{error}</div>}

    <div className="form-group">
      <label>Username</label>
      <input
        autoComplete="username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        required
      />
    </div>

    <div className="form-group password-group">
  <label>Password</label>

  <div className="password-wrapper">
    <input
      type={showPassword ? "text" : "password"}
      autoComplete="current-password"
      value={password}
      onChange={(e) => setPassword(e.target.value)}
      required
    />

    {/* 👁️ Eye Button */}
    <span
      className="eye-icon"
      onClick={() => setShowPassword(!showPassword)}
    >
      {showPassword ? "🙈" : "👁️"}
    </span>
  </div>
</div>

    <button type="submit" disabled={loading}>
      {loading ? "Signing in..." : "Login"}
    </button>

    <p className="security-note">
      Authorized clinical research personnel only
    </p>

  </form>
</div>
);
}