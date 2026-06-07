// src/components/Header.jsx
import React from 'react';
import './Header.css';

const Header = ({ title, subtitle, siteName, idBadge }) => (
  <header className="app-header">
    <div className="header-inner">

      {/* LEFT — PORTAL logo */}
      <div className="header-logo-panel">
        <div className="header-logo-box">
          <img src="/portal-logo.png" alt="PORTAL Trial" className="header-logo-img" />
        </div>
        
      </div>

      {/* CENTER — Titles + badges */}
      <div className="header-titles">
        <div className="header-breadcrumb">
          FORMS / {title || 'SCREENING FORM'}
        </div>
        <h1>{title || 'PORTAL Trial'}</h1>
        <p className="header-subtitle">
          {subtitle || 'Initial Oxygen for Delivery Room Resuscitation of Preterm Neonates'}
        </p>
        <div className="header-badges">
          <span>{siteName || 'PGIMER CHANDIGARH'}</span>
          <span className="badge-green">ICMR FUNDED</span>
          <span>MULTI-SITE RCT</span>
        </div>
      </div>

      {/* RIGHT — ICMR logo + optional ID badge */}
      <div className="header-logo-panel">
        {idBadge && (
          <div className="header-id-indicator">
            <span className="id-label">ID:</span>
            <span className="id-value">{idBadge}</span>
          </div>
        )}
        <div className="header-logo-box">
          <img src="/icmr-logo.svg" alt="ICMR" className="header-logo-img" />
        </div>
        
      </div>

    </div>
    <div className="header-glow-bar" />
  </header>
);

export default Header;
