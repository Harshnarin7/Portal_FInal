// src/components/Sidebar.jsx  (or src/Sidebar.jsx — keep wherever yours currently lives)
import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  ClipboardCheck, Baby, UserRoundCheck, CalendarDays, Hospital,
  Stethoscope, TrendingUp, BarChart3, Activity, Eye,
  FileHeart, HeartPulse, Microscope, TestTube2,
  ShieldAlert, ClipboardList, FileText, Check, Lock,
} from 'lucide-react';
import { useFormProgress } from './context/FormProgressContext';  // keep your existing import
import './Sidebar.css';

/* All 17 form sections — keep existing paths exactly */
const sections = [
  {
    title: 'Core Forms',
    items: [
      { id: 'form_a',  label: 'Screening',          path: '/form-a',  icon: ClipboardCheck },
      { id: 'form_b',  label: 'Birth & Resuscitation', path: '/form-b', icon: Baby },
      { id: 'form_c',  label: 'Maternal Details',   path: '/form-c',  icon: UserRoundCheck },
    ],
  },
  {
    title: 'Clinical',
    items: [
      { id: 'form_d',  label: 'Postnatal Day 1',    path: '/form-d',  icon: CalendarDays },
      { id: 'form_e',  label: 'NICU Admission',     path: '/form-e',  icon: Hospital },
      { id: 'form_f',  label: 'Morbidities',        path: '/form-f',  icon: Stethoscope },
    ],
  },
  {
    title: 'Outcomes',
    items: [
      { id: 'form_j',  label: 'Composite Outcome',  path: '/form-j',  icon: TrendingUp },
      { id: 'form_g',  label: 'Outcomes',           path: '/form-g',  icon: BarChart3 },
      { id: 'form_h',  label: 'Cranial USG',        path: '/form-h',  icon: Activity },
      { id: 'form_i',  label: 'ROP Screening',      path: '/form-i',  icon: Eye },
    ],
  },
  {
    title: 'Monitoring Logs',
    items: [
      { id: 'fio2_auc',          label: 'FiO2 AUC',           path: '/fio2-auc',               icon: FileHeart },
      { id: 'vs6_1',             label: 'Resp / CV / Neuro',  path: '/vs6-1',                  icon: HeartPulse },
      { id: 'infect_gi_hema',    label: 'Infect / GI / Hema', path: '/infect-gi-hema-log',     icon: Microscope },
      { id: 'metab_renal_vasc_eye', label: 'Metab / Renal / Eye', path: '/metab-renal-vasc-eye-log', icon: TestTube2 },
    ],
  },
  {
    title: 'Safety',
    items: [
      { id: 'form_y_sae',    label: 'SAE Form',        path: '/form-y-sae',    icon: ShieldAlert },
      { id: 'adverse_events',label: 'Adverse Events',  path: '/adverse-events',icon: ClipboardList },
      { id: 'sae_list',      label: 'SAE Listing',     path: '/sae-list',      icon: FileText },
    ],
  },
];

const requiredForms = ['form_a', 'form_b'];

export default function Sidebar() {
  /* ── keep all your existing logic ── */
  const { completedForms = [], isProgressLoaded } = useFormProgress();
  const [isEnrollmentLocked, setIsEnrollmentLocked] = useState(
    localStorage.getItem('enrollment_locked') === 'true'
  );

  const screeningId  = localStorage.getItem('current_screening_id');
  const enrollmentId = localStorage.getItem('current_enrollment_id');
  const isUnlocked   = requiredForms.every(id => completedForms.includes(id));

  useEffect(() => {
    const check = () =>
      setIsEnrollmentLocked(localStorage.getItem('enrollment_locked') === 'true');
    window.addEventListener('storage', check);
    check();
    return () => window.removeEventListener('storage', check);
  }, []);

  const getPath = form => {
    if (form.id === 'form_a' && screeningId)  return `/form-a/${screeningId}`;
    if (form.id === 'form_b' && screeningId)  return `/form-b/${screeningId}`;
    if (form.id === 'form_c' && enrollmentId) return `/form-c/${enrollmentId}`;
    if (form.id === 'form_d' && enrollmentId) return `/form-d/${enrollmentId}`;
    if (form.id === 'form_e' && enrollmentId) return `/form-e/${enrollmentId}`;
    if (enrollmentId) return `${form.path}/${enrollmentId}`;
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
          sections.map(section => (
            <div key={section.title} className="sidebar-section">
              <div className="sidebar-section-title">{section.title}</div>

              {section.items.map(form => {
                const completed = completedForms.includes(form.id);
                const isLocked  = isEnrollmentLocked || (!requiredForms.includes(form.id) && !isUnlocked);
                const Icon      = form.icon;

                return (
                  <NavLink
                    key={form.id}
                    to={isLocked ? '#' : getPath(form)}
                    onClick={e => {
                      if (isLocked) {
                        e.preventDefault();
                        alert(isEnrollmentLocked
                          ? 'Participant cannot be enrolled as consent was not given.'
                          : 'Complete required forms to unlock.');
                      }
                    }}
                    className={({ isActive }) =>
                      `sidebar-item${isActive ? ' active' : ''}${isLocked ? ' locked' : ''}`
                    }
                  >
                    <div className="icon-box">
                      <Icon size={16} strokeWidth={2.5} />
                    </div>
                    <span className="label">{form.label}</span>
                    <span className="status-indicator">
                      {isLocked
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
            className="logout-icon-btn"
            onClick={handleLogout}
            title="Log out"
            style={{
              marginLeft: 'auto', border: 'none', background: 'transparent',
              cursor: 'pointer', color: 'var(--text-muted)', padding: '4px',
              borderRadius: '6px', display: 'flex', alignItems: 'center',
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
