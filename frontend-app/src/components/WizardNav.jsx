import { useNavigate } from "react-router-dom";
import "./WizardNav.css";

export default function WizardNav({ step, enrollmentId }) {
  const navigate = useNavigate();

  return (
    <div className="wizard-nav">
      <span className={step >= 1 ? "active" : ""}>A</span>
      <span className={step >= 2 ? "active" : ""}>B</span>
      <span className={step >= 3 ? "active" : ""}>C</span>
      <span className={step >= 4 ? "active" : ""}>D</span>

      {enrollmentId && (
        <button
          className="dashboard-btn"
          onClick={() => navigate("/dashboard")}
        >
          Dashboard
        </button>
      )}
    </div>
  );
}
