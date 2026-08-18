// src/layouts/FormLayout.jsx
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../Sidebar';
import Header from '../components/Header';
import './FormLayout.css';
import '../styles/Theme.css';
import { isUsableEnrollmentId } from '../utils/enrollmentId';

const FormLayout = ({ children, currentForm, headerProps }) => {
  const navigate = useNavigate();

  /* Block deep-links past allowed forms when enrollment is locked.
     - Screen failure / consent / GA: only Form A
     - PPV not required (no_ppv): Forms A–C only */
  useEffect(() => {
    if (!currentForm || currentForm === "form_a") return;
    if (localStorage.getItem("enrollment_locked") !== "true") return;

    const reason = localStorage.getItem("enrollment_lock_reason");
    if (reason === "no_ppv" && (currentForm === "form_b" || currentForm === "form_c")) {
      return;
    }

    const sid = localStorage.getItem("current_screening_id");
    const eid = localStorage.getItem("current_enrollment_id");
    let target;
    if (reason === "no_ppv") {
      target = isUsableEnrollmentId(eid)
        ? `/form-c/${eid}`
        : (sid && sid !== "undefined" && sid !== "null" ? `/form-b/${sid}` : "/form-b");
    } else {
      target = sid && sid !== "undefined" && sid !== "null"
        ? `/form-a/${sid}`
        : "/form-a";
    }
    navigate(target, { replace: true });
  }, [currentForm, navigate]);

  return (
    <div className="form-layout-root portal-app-wrapper">
      <Sidebar currentForm={currentForm} />
      <div className="form-layout-main">
        <Header
          title={headerProps?.title || 'PORTAL Trial'}
          subtitle={headerProps?.subtitle}
          siteName={headerProps?.siteName}
          idBadge={headerProps?.idBadge}
        />
        <main className="form-layout-content">
          {children}
        </main>
      </div>
    </div>
  );
};

export default FormLayout;
