import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children }) {
  const { token, user, authReady } = useAuth();
  const location = useLocation();

  const storedToken = localStorage.getItem("token");
  const hasSession = !!(token || storedToken);

  if (hasSession && !authReady) {
    return (
      <div className="auth-boot-screen" role="status" aria-live="polite">
        <p>Checking session…</p>
      </div>
    );
  }

  if (!hasSession) {
    return <Navigate to="/login" replace />;
  }

  const mustChange =
    user?.must_change_password === true
    || localStorage.getItem("must_change_password") === "true";

  if (mustChange && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }

  return children;
}
