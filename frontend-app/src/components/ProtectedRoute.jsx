import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children }) {
  const { token, user } = useAuth();
  const location = useLocation();

  if (!token && !localStorage.getItem("token")) {
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
