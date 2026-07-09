// Sidebar.jsx — PORTAL Trial EDC — Light Theme, CRF v1.22 + Form K & L
import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  ClipboardCheck, Baby, UserRoundCheck, CalendarDays, Hospital,
  FileHeart, HeartPulse, Microscope, TestTube2,
  Activity, Eye, Stethoscope, TrendingUp, BarChart3,
  Building2, Cpu, ShieldAlert, ClipboardList, FileText,
  LayoutDashboard, LogOut, Check, Lock, ChevronRight,
} from 'lucide-react';
import { useFormProgress } from './context/FormProgressContext';
import { useAuth } from './context/AuthContext';
import api from './api/axios';
import './Sidebar.css';

/* All forms unlock after A+B are done */
const PREREQS = {
  form_a:               [],
  form_b:               ['form_a'],
  form_c:               ['form_a', 'form_b'],
  form_d:               ['form_a', 'form_b'],
  form_e:               ['form_a', 'form_b'],
  fio2_auc:             ['form_a', 'form_b'],
  vs6_1:                ['form_a', 'form_b'],
  infect_gi_hema:       ['form_a', 'form_b'],
  metab_renal_vasc_eye: ['form_a', 'form_b'],
  form_f:               ['form_a', 'form_b'],
  form_g:               ['form_a', 'form_b'],
  form_h:               ['form_a', 'form_b'],
  form_i:               ['form_a', 'form_b'],
  form_j:               ['form_a', 'form_b'],
  form_k:               ['form_a', 'form_b'],
  form_l:               ['form_a', 'form_b'],
  form_y_sae:           ['form_a', 'form_b'],
  adverse_events:       ['form_a', 'form_b'],
  sae_list:             ['form_a', 'form_b'],
};

/* CRF v1.22 exact order */
const SECTIONS = [
  {
    key: 'core',
    title: 'Core Forms',
    items: [
      { id: 'form_a', label: 'Form A', sub: 'Screening',             path: '/form-a', Icon: ClipboardCheck },
      { id: 'form_b', label: 'Form B', sub: 'Birth & Resuscitation', path: '/form-b', Icon: Baby           },
      { id: 'form_c', label: 'Form C', sub: 'Maternal Details',      path: '/form-c', Icon: UserRoundCheck },
      { id: 'form_d', label: 'Form D', sub: 'Day 1 Postnatal Life',  path: '/form-d', Icon: CalendarDays   },
      { id: 'form_e', label: 'Form E', sub: 'NICU Admission',        path: '/form-e', Icon: Hospital       },
    ],
  },
  {
    key: 'helpers',
    title: 'Monitoring Logs',
    items: [
      { id: 'fio2_auc',             label: 'Helper 1', sub: 'FiO₂ AUC Logging',   path: '/fio2-auc',                Icon: FileHeart  },
      { id: 'vs6_1',                label: 'Helper 2', sub: 'Resp / CV / Neuro',   path: '/vs6-1',                   Icon: HeartPulse },
      { id: 'infect_gi_hema',       label: 'Helper 3', sub: 'Infect / GI / Hema',  path: '/infect-gi-hema-log',      Icon: Microscope },
      { id: 'metab_renal_vasc_eye', label: 'Helper 4', sub: 'Metab / Renal / Eye', path: '/metab-renal-vasc-eye-log',Icon: TestTube2  },
    ],
  },
  {
    key: 'assessment',
    title: 'Clinical Assessment',
    items: [
      { id: 'form_f', label: 'Form F', sub: 'Cranial Ultrasonography', path: '/form-f', Icon: Activity    },
      { id: 'form_g', label: 'Form G', sub: 'ROP Screening Record',    path: '/form-g', Icon: Eye         },
      { id: 'form_h', label: 'Form H', sub: 'Neonatal Morbidities',    path: '/form-h', Icon: Stethoscope },
    ],
  },
  {
    key: 'outcomes',
    title: 'Outcome Forms',
    items: [
      { id: 'form_i', label: 'Form I', sub: 'Study Outcome Assessment',   path: '/form-i', Icon: TrendingUp },
      { id: 'form_j', label: 'Form J', sub: 'External Hospital Outcomes', path: '/form-j', Icon: Building2  },
      { id: 'form_k', label: 'Form K', sub: 'MRI Brain Assessment',       path: '/form-k', Icon: Cpu        },
      { id: 'form_l', label: 'Form L', sub: 'Blender Data & Summary',     path: '/form-l', Icon: BarChart3  },
    ],
  },
  {
    key: 'safety',
    title: 'Safety',
    items: [
      { id: 'form_y_sae',     label: 'Form Y', sub: 'SAE Reporting',  path: '/form-y-sae',     Icon: ShieldAlert   },
      { id: 'adverse_events', label: 'AE',     sub: 'Adverse Events', path: '/adverse-events', Icon: ClipboardList },
      { id: 'sae_list',       label: 'SAE',    sub: 'SAE Listing',    path: '/sae-list',       Icon: FileText      },
    ],
  },
];

const TOTAL_FORMS = SECTIONS.reduce((n, s) => n + s.items.length, 0);
const ROLE_LABELS = {
  superadmin:'Super Admin', admin:'Admin', pi:'Principal Investigator',
  scientist:'Scientist', nurse:'Research Nurse', deo:'Data Entry Operator', monitor:'Monitor',
};
const validId = value => value && value !== 'undefined' && value !== 'null' ? value : null;
const consentAllowsEnrollment = value => value === 'Yes' || value === 'Trial run';

export default function Sidebar({ currentForm }) {
  const { completedForms = [], isProgressLoaded, fetchProgress } = useFormProgress();
  const { user } = useAuth();
  const navigate = useNavigate();

  const readIds = () => ({
    screeningId:  validId(localStorage.getItem('current_screening_id')),
    enrollmentId: validId(localStorage.getItem('current_enrollment_id')),
  });
  const [ids, setIds] = useState(readIds);
  const screeningId = ids.screeningId;
  const enrollmentId = ids.enrollmentId;

  useEffect(() => {
    const sync = () => setIds(readIds());
    window.addEventListener('storage', sync);
    window.addEventListener('focus', sync);
    return () => { window.removeEventListener('storage', sync); window.removeEventListener('focus', sync); };
  }, []);

  useEffect(() => {
    if (enrollmentId && enrollmentId !== 'undefined' && enrollmentId !== 'null') {
      fetchProgress(enrollmentId);
    }
  }, [enrollmentId]); // eslint-disable-line

  const [enrollmentLocked, setEnrollmentLocked] = useState(
    localStorage.getItem('enrollment_locked') === 'true'
  );
  useEffect(() => {
    const check = () => setEnrollmentLocked(localStorage.getItem('enrollment_locked') === 'true');
    window.addEventListener('storage', check);
    window.addEventListener('focus', check);
    return () => {
      window.removeEventListener('storage', check);
      window.removeEventListener('focus', check);
    };
  }, []);

  useEffect(() => {
    if (!screeningId && !enrollmentId) return;

    let active = true;
    const request = screeningId
      ? api.get(`/screenings/by-screening-id/${screeningId}`)
      : api.get(`/screenings/by-enrollment/${enrollmentId}`);

    request.then(res => {
      if (!active) return;
      const consent = res.data?.consent_given;
      if (consentAllowsEnrollment(consent)) {
        localStorage.removeItem('enrollment_locked');
        setEnrollmentLocked(false);
        return;
      }
      if (consent) {
        localStorage.setItem('enrollment_locked', 'true');
        setEnrollmentLocked(true);
      }
    }).catch(() => {
      if (active) setEnrollmentLocked(localStorage.getItem('enrollment_locked') === 'true');
    });

    return () => { active = false; };
  }, [screeningId, enrollmentId]);

  const getPath = (form) => {
    const sid = ids.screeningId  && ids.screeningId  !== 'undefined' ? ids.screeningId  : null;
    const eid = ids.enrollmentId && ids.enrollmentId !== 'undefined' ? ids.enrollmentId : null;
    if (form.id === 'form_a') return sid ? `/form-a/${sid}` : '/form-a';
    if (form.id === 'form_b') return sid ? `/form-b/${sid}` : '/form-b';
    return eid ? `${form.path}/${eid}` : form.path;
  };

  const isUnlocked = (formId) => {
    if (enrollmentLocked) return false;
    return (PREREQS[formId] || []).every(p => completedForms.includes(p));
  };

  const progressPct = TOTAL_FORMS > 0 ? Math.round((completedForms.length / TOTAL_FORMS) * 100) : 0;

  return (
    <aside className="sidebar">

      <div className="sidebar-header">
        <div className="sidebar-brand" onClick={() => navigate('/dashboard')} title="Dashboard">
          <div className="sidebar-logo-box">
            <img src="/portal-logo.png" alt="PORTAL" className="sidebar-logo-img" />
          </div>
          <div>
            <div className="sidebar-header-title">PORTAL Trial</div>
            <div className="sidebar-header-sub">Clinical EDC · CRF v1.22</div>
          </div>
        </div>
        <div className="sidebar-progress">
          <div className="progress-label">
            <span>Case Progress</span>
            <span>{completedForms.length} / {TOTAL_FORMS} forms</span>
          </div>
          <div className="progress-bar-bg">
            <div className="progress-bar-fill" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      </div>

      <nav className="sidebar-nav">
        <NavLink to="/dashboard"
          className={({ isActive }) => `sidebar-dash-link${isActive ? ' active' : ''}`}>
          <LayoutDashboard size={14} strokeWidth={2} />
          <span>Dashboard</span>
        </NavLink>
        <NavLink to="/trial-monitoring"
          className={({ isActive }) => `sidebar-dash-link${isActive ? ' active' : ''}`}>
          <BarChart3 size={14} strokeWidth={2} />
          <span>Trial Monitoring</span>
        </NavLink>
        <div className="sidebar-sep" />

        {!isProgressLoaded ? (
          <div className="sidebar-loading">
            <div className="sb-dots"><span/><span/><span/></div>
            <span>Loading…</span>
          </div>
        ) : SECTIONS.map(section => {
          const done  = section.items.filter(i => completedForms.includes(i.id)).length;
          const total = section.items.length;
          return (
            <div key={section.key} className="sidebar-section">
              <div className="sidebar-section-header">
                <span className="sidebar-section-title">{section.title}</span>
                <span className={`sidebar-section-badge ${done === total ? 'all-done' : ''}`}>
                  {done}/{total}
                </span>
              </div>

              {section.items.map(form => {
                const completed = completedForms.includes(form.id);
                const unlocked  = isUnlocked(form.id);
                const locked    = !unlocked;
                const isCurrent = currentForm === form.id;
                const { Icon }  = form;
                const path      = getPath(form);
                const stateClass = locked ? 'state-locked' : completed ? 'state-done' : isCurrent ? 'state-active' : 'state-open';

                return (
                  <NavLink key={form.id} to={locked ? '#' : path}
                    onClick={e => {
                      if (locked) {
                        e.preventDefault();
                        const missing = (PREREQS[form.id] || [])
                          .filter(p => !completedForms.includes(p))
                          .map(p => p === 'form_a' ? 'Form A (Screening)' : 'Form B (Birth & Resuscitation)')
                          .join(' and ');
                        alert(enrollmentLocked
                          ? 'Enrollment locked — consent not given.'
                          : `Complete ${missing || 'Form A and Form B'} first to unlock all forms.`);
                      }
                    }}
                    className={({ isActive }) =>
                      `sidebar-item ${stateClass}${isActive && !locked ? ' nav-active' : ''}`
                    }
                  >
                    {isCurrent && !locked && <div className="item-accent" />}
                    <div className={`item-icon ${stateClass}`}>
                      {locked    ? <Lock  size={12} strokeWidth={2.5} /> :
                       completed ? <Check size={12} strokeWidth={3}   /> :
                                   <Icon  size={12} strokeWidth={2}   />}
                    </div>
                    <div className="item-text">
                      <span className="item-label">{form.label}</span>
                      <span className="item-sub">{form.sub}</span>
                    </div>
                    <div className="item-right">
                      {completed ? (
                        <span className="item-badge done">✓</span>
                      ) : locked ? (
                        <Lock size={10} strokeWidth={2.5} className="item-lock-icon" />
                      ) : isCurrent ? (
                        <span className="item-badge active">Active</span>
                      ) : (
                        <ChevronRight size={12} className="item-chevron" />
                      )}
                    </div>
                  </NavLink>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="sidebar-avatar">{(user?.name || 'U')[0].toUpperCase()}</div>
          <div className="sidebar-user-info">
            <span className="sidebar-user-name">{user?.name || 'User'}</span>
            <span className="sidebar-user-role">
              {ROLE_LABELS[user?.role] || user?.role || 'Staff'}
              {user?.site ? ` · ${user.site}` : ''}
            </span>
          </div>
          <button className="sidebar-logout" onClick={() => { localStorage.clear(); window.location.href = '/login'; }} title="Log out">
            <LogOut size={14} strokeWidth={2} />
          </button>
        </div>
      </div>

    </aside>
  );
}
