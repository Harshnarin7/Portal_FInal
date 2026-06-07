// src/components/YesNoToggle.jsx
import React from "react";

const YesNoToggle = ({ label, name, value, onChange }) => {
  const handleClick = (val) => {
    // Simulate a synthetic event so handleChange works unchanged
    onChange({ target: { name, value: val } });
  };

  return (
    <div className="yes-no-toggle">
      <span className="yes-no-label">{label}</span>
      <div className="yes-no-buttons">
        <button
          type="button"
          className={`yn-btn yn-yes${value === "Yes" ? " yn-active" : ""}`}
          onClick={() => handleClick("Yes")}
        >
          YES
        </button>
        <button
          type="button"
          className={`yn-btn yn-no${value === "No" ? " yn-active" : ""}`}
          onClick={() => handleClick("No")}
        >
          NO
        </button>
      </div>
    </div>
  );
};

export default YesNoToggle;