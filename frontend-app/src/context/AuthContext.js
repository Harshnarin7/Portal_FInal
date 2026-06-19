import { createContext, useContext, useState, useCallback } from "react";

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

/* ── Build user object from decoded token ──
   Adjust field names to match whatever your backend puts in the JWT.
   Common fields: sub, username, name, role, site, exp
── */
function buildUser(token) {
  if (!token) return null;
  const payload = decodeToken(token);
  if (!payload) return null;
  return {
    username:  payload.sub       || "",
    name:      payload.sub       || "User",   // your JWT uses "sub" for username
    role:      payload.role      || "nurse",  // "site_user" | "admin" | "nurse"
    site:      payload.site_name || "",
    exp:       payload.exp       || null,
  };
}

export function AuthProvider({ children }) {
  const [token, setToken]   = useState(localStorage.getItem("token"));
  const [user,  setUser]    = useState(() => buildUser(localStorage.getItem("token")));

  const login = useCallback((accessToken, refreshToken) => {
    localStorage.setItem("token", accessToken);
    if (refreshToken) localStorage.setItem("refresh_token", refreshToken);
    setToken(accessToken);
    setUser(buildUser(accessToken));
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("refresh_token");
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ token, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}