import { useNavigate } from "react-router-dom";
import "./AppHeader.css";

export default function AppHeader({ title }) {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("access_token");
    navigate("/login");
  };

  return (
    <div className="app-header">
      <h2 className="app-title">{title}</h2>

      <button
        className="logout-btn"
        onClick={handleLogout}
      >
        Logout
      </button>
    </div>
  );
}
