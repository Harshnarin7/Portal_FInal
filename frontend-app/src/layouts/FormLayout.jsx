// src/layouts/FormLayout.jsx
import React from 'react';
import Sidebar from '../Sidebar';         // adjust path to wherever your Sidebar lives
import Header from '../components/Header';
import './FormLayout.css';
import '../styles/Theme.css';

const FormLayout = ({ children, currentForm, headerProps }) => (
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

export default FormLayout;
