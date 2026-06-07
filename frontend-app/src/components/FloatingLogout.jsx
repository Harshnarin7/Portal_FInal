import React, { useState } from "react";
import "./FloatingLogout.css";

const FloatingLogout = () => {
  const [confirm, setConfirm] = useState(false);

  const handleLogout = () => {
    localStorage.clear();
    window.location.href = "/login";
  };

  return (
    <div className="floating-logout-portal">
      {!confirm ? (
        <button className="floating-logout-btn" onClick={() => setConfirm(true)}>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          Logout
        </button>
      ) : (
        <div className="floating-logout-confirm">
          <span>Log out?</span>
          <button className="logout-yes" onClick={handleLogout}>Yes</button>
          <button className="logout-no" onClick={() => setConfirm(false)}>No</button>
        </div>
      )}
    </div>
  );
};

export default FloatingLogout;