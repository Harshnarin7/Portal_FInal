// src/Sidebar.jsx  (or src/components/Sidebar.jsx)
import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  ClipboardCheck, Baby, UserRoundCheck, CalendarDays, Hospital,
  Stethoscope, TrendingUp, BarChart3, Activity, Eye,
  FileHeart, HeartPulse, Microscope, TestTube2,
  ShieldAlert, ClipboardList, FileText, Check, Lock,
} from 'lucide-react';
import { useFormProgress } from './context/FormProgressContext';
import './Sidebar.css';

const ALL_SECTIONS = [
  {
    title: 'Core Forms',
    items: [
      { id: 'form_a', label: 'Screening',             path: '/form-a',  icon: ClipboardCheck },
      { id: 'form_b', label: 'Birth & Resuscitation', path: '/form-b',  icon: Baby },
      { id: 'form_c', label: 'Maternal Details',      path: '/form-c',  icon: UserRoundCheck },
    ],
  },
  {
    title: 'Clinical',
    items: [
      { id: 'form_d', label: 'Postnatal Day 1', path: '/form-d', icon: CalendarDays },
      { id: 'form_e', label: 'NICU Admission',  path: '/form-e', icon: Hospital },
      { id: 'form_f', label: 'Morbidities',     path: '/form-f', icon: Stethoscope },
    ],
  },
  {
    title: 'Outcomes',
    items: [
      { id: 'form_j', label: 'Composite Outcome', path: '/form-j', icon: TrendingUp },
      { id: 'form_g', label: 'Outcomes',          path: '/form-g', icon: BarChart3 },
      { id: 'form_h', label: 'Cranial USG',       path: '/form-h', icon: Activity },
      { id: 'form_i', label: 'ROP Screening',     path: '/form-i', icon: Eye },
    ],
  },
  {
    title: 'Monitoring Logs',
    items: [
      { id: 'fio2_auc',             label: 'FiO2 AUC',           path: '/fio2-auc',               icon: FileHeart },
      { id: 'vs6_1',                label: 'Resp / CV / Neuro',  path: '/vs6-1',                  icon: HeartPulse },
      { id: 'infect_gi_hema',       label: 'Infect / GI / Hema', path: '/infect-gi-hema-log',     icon: Microscope },
      { id: 'metab_renal_vasc_eye', label: 'Metab / Renal / Eye',path: '/metab-renal-vasc-eye-log',icon: TestTube2 },
    ],
  },
  {
    title: 'Safety',
    items: [
      { id: 'form_y_sae',     label: 'SAE Form',       path: '/form-y-sae',    icon: ShieldAlert },
      { id: 'adverse_events', label: 'Adverse Events', path: '/adverse-events',icon: ClipboardList },
      { id: 'sae_list',       label: 'SAE Listing',    path: '/sae-list',      icon: FileText },
    ],
  },
];

// Forms that must be done before others unlock
const REQUIRED_FORMS = ['form_a', 'form_b'];

export default function Sidebar() {
  const { completedForms = [], isProgressLoaded } = useFormProgress();

  /* ══════════════════════════════════════════
     BUG FIX — Sidebar reads localStorage once
     at mount, then NEVER updates when the form
     saves and writes new IDs.

     Fix: use state + listen to both the storage
     event (cross-tab) AND a custom
     "localStorageUpdate" event (same-tab) that
     we dispatch from saveForm().
  ══════════════════════════════════════════ */
  const readIds = () => ({
    screeningId:  localStorage.getItem("current_screening_id"),
    enrollmentId: localStorage.getItem("current_enrollment_id"),
  });

  const [ids, setIds] = useState(readIds);

  useEffect(() => {
    const sync = () => setIds(readIds());
    // "storage" fires for cross-tab changes
    window.addEventListener("storage", sync);
    // "focus" catches returning to tab
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);

  const { screeningId, enrollmentId } = ids;

  const [isEnrollmentLocked, setIsEnrollmentLocked] = useState(
    localStorage.getItem("enrollment_locked") === "true"
  );

  useEffect(() => {
    const checkLock = () =>
      setIsEnrollmentLocked(localStorage.getItem("enrollment_locked") === "true");
    window.addEventListener("storage", checkLock);
    return () => window.removeEventListener("storage", checkLock);
  }, []);

  const isUnlocked = REQUIRED_FORMS.every(id => completedForms.includes(id));

  /* Build the correct path for each form including the ID param */
  const getPath = (form) => {
    if (form.id === 'form_a' && screeningId &&
        screeningId !== "undefined" && screeningId !== "null") {
      return `/form-a/${screeningId}`;
    }
    if (form.id === 'form_b' && screeningId &&
        screeningId !== "undefined" && screeningId !== "null") {
      return `/form-b/${screeningId}`;
    }
    if (enrollmentId && enrollmentId !== "undefined" && enrollmentId !== "null") {
      return `${form.path}/${enrollmentId}`;
    }
    return form.path;
  };

  const handleLogout = () => {
    localStorage.clear();
    window.location.href = '/login';
  };

  const progressPct = Math.round((completedForms.length / 17) * 100);

  return (
    <aside className="sidebar">

      {/* ── HEADER ── */}
      <div className="sidebar-header">
        <div className="sidebar-brand">
          <div className="sidebar-logo-box">
            <img src="/portal-logo.png" alt="PORTAL" className="sidebar-logo-img" />
          </div>
          <div className="sidebar-header-title">PORTAL TRIAL</div>
        </div>
        <div className="sidebar-progress">
          <div className="progress-label">
            <span>Overall Progress</span>
            <span>{completedForms.length} / 17</span>
          </div>
          <div className="progress-bar-bg">
            <div className="progress-bar-fill" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      </div>

      {/* ── NAV ── */}
      <nav className="sidebar-nav">
        {!isProgressLoaded ? (
          <div className="sidebar-loading">Loading…</div>
        ) : (
          ALL_SECTIONS.map(section => (
            <div key={section.title} className="sidebar-section">
              <div className="sidebar-section-title">{section.title}</div>
              {section.items.map(form => {
                const completed = completedForms.includes(form.id);
                const locked    = isEnrollmentLocked ||
                  (!REQUIRED_FORMS.includes(form.id) && !isUnlocked);
                const Icon      = form.icon;
                const path      = getPath(form);

                return (
                  <NavLink
                    key={form.id}
                    to={locked ? '#' : path}
                    onClick={e => {
                      if (locked) {
                        e.preventDefault();
                        alert(isEnrollmentLocked
                          ? 'Participant cannot be enrolled — consent was not given.'
                          : 'Complete Screening and Birth & Resuscitation forms first.');
                      }
                    }}
                    className={({ isActive }) =>
                      `sidebar-item${isActive ? ' active' : ''}${locked ? ' locked' : ''}`
                    }
                  >
                    <div className="icon-box">
                      <Icon size={16} strokeWidth={2.5} />
                    </div>
                    <span className="label">{form.label}</span>
                    <span className="status-indicator">
                      {locked
                        ? <Lock size={12} />
                        : completed
                          ? <Check size={14} className="status-check" />
                          : null}
                    </span>
                  </NavLink>
                );
              })}
            </div>
          ))
        )}
      </nav>

      {/* ── FOOTER ── */}
      <div className="sidebar-footer">
        <div className="user-profile">
          <div className="avatar">RN</div>
          <div className="user-info">
            <span className="user-name">Nurse Administrator</span>
            <span className="user-role">PGIMER Site</span>
          </div>
          <button
            onClick={handleLogout}
            title="Log out"
            style={{
              marginLeft:'auto', border:'none', background:'transparent',
              cursor:'pointer', color:'var(--text-muted)', padding:'6px',
              borderRadius:'6px', display:'flex', alignItems:'center',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </div>

    </aside>
  );
}
