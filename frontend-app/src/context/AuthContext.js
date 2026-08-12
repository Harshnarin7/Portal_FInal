import { createContext, useContext, useState, useCallback, useEffect } from "react";
import api from "../api/axios";

const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

/* ── Decode JWT payload without any library ── */
function decodeToken(token) {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map(c => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/* ── Build user object from decoded token (+ optional login profile) ── */
function buildUser(token, profile) {
  if (!token) return null;
  const payload = decodeToken(token);
  if (!payload) return null;
  const username = payload.sub || "";
  const fromProfile = profile?.full_name || "";
  const fromToken = payload.full_name || "";
  const fullName =
    (fromProfile && fromProfile !== username ? fromProfile : null)
    || (fromToken && fromToken !== username ? fromToken : null)
    || fromProfile
    || fromToken
    || username;

  const mustChange =
    typeof profile?.must_change_password === "boolean"
      ? profile.must_change_password
      : localStorage.getItem("must_change_password") === "true";

  return {
    username,
    name: username || "User",
    full_name: fullName,
    role: payload.role || profile?.role || "nurse",
    site: payload.site_name || profile?.site_name || "",
    exp: payload.exp || null,
    must_change_password: mustChange,
  };
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [user, setUser] = useState(() => buildUser(localStorage.getItem("token")));

  const login = useCallback((accessToken, refreshToken, profile) => {
    localStorage.setItem("token", accessToken);
    if (refreshToken) localStorage.setItem("refresh_token", refreshToken);
    if (profile?.full_name) {
      localStorage.setItem("user_full_name", profile.full_name);
    }
    const mustChange = !!profile?.must_change_password;
    localStorage.setItem("must_change_password", mustChange ? "true" : "false");
    setToken(accessToken);
    setUser(buildUser(accessToken, profile));
  }, []);

  const setMustChangePassword = useCallback((value) => {
    localStorage.setItem("must_change_password", value ? "true" : "false");
    setUser((prev) => (prev ? { ...prev, must_change_password: !!value } : prev));
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user_full_name");
    localStorage.removeItem("must_change_password");
    setToken(null);
    setUser(null);
  }, []);

  /* Hydrate profile + must_change_password for existing sessions */
  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    api.get("/auth/me")
      .then((res) => {
        if (cancelled || !res?.data) return;
        const data = res.data;
        if (data.full_name) {
          localStorage.setItem("user_full_name", data.full_name);
        }
        const mustChange = !!data.must_change_password;
        localStorage.setItem("must_change_password", mustChange ? "true" : "false");
        setUser((prev) =>
          prev
            ? {
                ...prev,
                full_name: data.full_name || prev.full_name,
                must_change_password: mustChange,
                site: data.site_name || prev.site,
              }
            : prev
        );
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [token]);

  return (
    <AuthContext.Provider value={{ token, user, login, logout, setMustChangePassword }}>
      {children}
    </AuthContext.Provider>
  );
}
