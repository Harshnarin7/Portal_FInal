// src/layouts/FormLayout.jsx
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../Sidebar';
import Header from '../components/Header';
import './FormLayout.css';
import '../styles/Theme.css';

const FormLayout = ({ children, currentForm, headerProps }) => {
  const navigate = useNavigate();

  /* Block deep-links to Form B+ when screening locked out (GA / consent / exclusion).
     Form A stays reachable so the nurse can correct eligibility. */
  useEffect(() => {
    if (!currentForm || currentForm === 'form_a') return;
    if (localStorage.getItem('enrollment_locked') !== 'true') return;

    const sid = localStorage.getItem('current_screening_id');
    const target = sid && sid !== 'undefined' && sid !== 'null'
      ? `/form-a/${sid}`
      : '/form-a';
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
