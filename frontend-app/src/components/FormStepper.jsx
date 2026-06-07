import React from "react";
import { useNavigate } from "react-router-dom";
import "./FormStepper.css";

export default function FormStepper({ enrollmentId, status, current }) {
  const navigate = useNavigate();

  const steps = [
    { key: "formA", label: "Form A", path: "/form-a" },
    { key: "formB", label: "Form B", path: `/form-b/${enrollmentId}` },
    { key: "formC", label: "Form C", path: `/form-c/${enrollmentId}` },
    { key: "formD", label: "Form D", path: `/form-d/${enrollmentId}` },
  ];

  return (
    <div className="stepper">
      {steps.map((s, index) => {
        const completed = status?.[s.key];
        const isCurrent = current === s.key;

        return (
          <div key={s.key} className="step">
            <div
              className={`step-circle ${
                completed ? "done" : isCurrent ? "current" : "locked"
              }`}
              onClick={() => completed && navigate(s.path)}
            >
              {completed ? "✔" : isCurrent ? "⏳" : "🔒"}
            </div>
            <span className="step-label">{s.label}</span>

            {index < steps.length - 1 && <div className="step-line" />}
          </div>
        );
      })}
    </div>
  );
}
