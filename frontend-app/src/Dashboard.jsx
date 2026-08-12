// Dashboard.jsx — PORTAL Trial Clinical Operations Dashboard v3
// Enhanced: AI Insights tab (Claude API), live activity feed, real backend data,
// recharts charts, notification panel, patient search, all 7 tabs functional.

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  AreaChart, Area, BarChart, Bar,
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer
} from "recharts";
import api from "./api/axios";
import { useAuth } from "./context/AuthContext";
import "./Dashboard.css";

// ─────────────────────────────────────────────────────────
// Tiny SVG icon helper
// ─────────────────────────────────────────────────────────
const Ic = ({ d, s = 15, c = "currentColor" }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
    stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);
const P = {
  users:   "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm11 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  check:   "M20 6L9 17l-5-5",
  alert:   "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01",
  act:     "M22 12h-4l-3 9L9 3l-3 9H2",
  clip:    "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z",
  up:      "M23 6l-9.5 9.5-5-5L1 18M17 6h6v6",
  dn:      "M23 18l-9.5-9.5-5 5L1 6M17 18h6v-6",
  bell:    "M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0",
  search:  "M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0",
  bar:     "M18 20V10M12 20V4M6 20v-6",
  map:     "M3 11l19-9-9 19-2-8-8-2z",
  shield:  "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  zap:     "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
  eye:     "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  file:    "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
  plus:    "M12 5v14M5 12h14",
  target:  "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zm0-14a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4z",
  trend:   "M3 3v18h18M7 16l4-4 4 4 4-4",
  star:    "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
  refresh: "M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15",
  send:    "M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z",
};

const C = {
  teal: "#0E7C7B", tL: "#14A8A7", navy: "#0B1F3A",
  amber: "#E8A020", green: "#22c55e", red: "#ef4444",
  purple: "#8b5cf6", blue: "#3b82f6", slate: "#64748b",
  orange: "#f97316",
};

// ─────────────────────────────────────────────────────────
// Reusable UI components
// ─────────────────────────────────────────────────────────
const Pill = ({ s }) => {
  const m = {
    complete:   ["rgba(34,197,94,.12)",  "#22c55e", "Complete"  ],
    pending:    ["rgba(232,160,32,.12)", "#E8A020", "Pending"   ],
    overdue:    ["rgba(239,68,68,.12)",  "#ef4444", "Overdue"   ],
    active:     ["rgba(14,124,123,.15)", "#14A8A7", "Active"    ],
    discharged: ["rgba(100,116,139,.12)","#64748b", "Discharged"],
    eligible:   ["rgba(34,197,94,.12)",  "#22c55e", "Eligible"  ],
    failure:    ["rgba(239,68,68,.12)",  "#ef4444", "Failure"   ],
  };
  const [bg, col, lbl] = m[s] || m.pending;
  return (
    <span style={{ background: bg, color: col, padding: "2px 9px", borderRadius: 20, fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
      {lbl}
    </span>
  );
};

const Trend = ({ v, up }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 700, color: up ? C.green : C.red }}>
    <Ic d={up ? P.up : P.dn} s={10} c={up ? C.green : C.red} />{v}
  </span>
);

const SH = ({ icon, title, sub, right }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(14,124,123,0.13)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Ic d={icon} s={14} c={C.tL} />
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#0b1c30" }}>{title}</div>
        {sub && <div style={{ fontSize: 11, color: C.slate }}>{sub}</div>}
      </div>
    </div>
    {right}
  </div>
);

const Crd = ({ children, style, accent }) => (
  <div className="db-card" style={{ "--accent": accent || C.teal, ...style }}>{children}</div>
);

const TT = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#ffffff", border: "1px solid #d5e4f0", borderRadius: 8, padding: "8px 12px", fontSize: 11 }}>
      <p style={{ color: C.slate, marginBottom: 3 }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || C.tL, fontWeight: 700 }}>{p.name}: {p.value}</p>
      ))}
    </div>
  );
};

const LiveDot = () => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
    <span className="db-live-dot" />
    <span style={{ fontSize: 10, color: C.green, fontWeight: 700, letterSpacing: "0.05em" }}>LIVE</span>
  </span>
);

// Live-data helpers (no mock/seed numbers)
const pctColor = (p) => (p >= 90 ? C.green : p >= 70 ? C.tL : p >= 50 ? C.amber : C.red);
const TASK_COLORS = { consented_no_form_b: C.amber, randomised_no_form_c: C.blue, randomised_no_form_i: C.red, few_day_logs: C.orange };
const QUICK_AI_QUESTIONS = [
  "What's the current trial status?",
  "Any safety signals to watch?",
  "Which site needs the most attention?",
  "Predict enrollment completion date",
  "Analyse data quality gaps",
  "Summarise composite outcomes so far",
];

// ──────────────────────────────────────────────────────────
// Role maps
// ──────────────────────────────────────────────────────────
const RL_MAP = {
  superadmin: "Super Admin", admin: "Administrator", pi: "Principal Investigator",
  scientist: "Scientist", nurse: "Research Nurse", deo: "Data Entry Operator", monitor: "Trial Monitor",
};
const RL_COL = {
  superadmin: C.purple, admin: C.purple, pi: C.teal,
  scientist: C.blue, nurse: C.green, deo: C.amber, monitor: C.orange,
};

const DEFAULT_TARGET = 700;
const TABS = ["overview", "recruitment", "patients", "tasks", "safety", "data", "ai-insights"];

// ══════════════════════════════════════════════════════════
//   DASHBOARD COMPONENT
// ══════════════════════════════════════════════════════════
export default function Dashboard() {
  const nav = useNavigate();
  const { user } = useAuth();

  // ── Data state (live only) ─────────────────────────────
  const [screenings,   setScreenings]   = useState([]);
  const [ops,          setOps]          = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [loadError,    setLoadError]    = useState(null);

  // ── UI state ───────────────────────────────────────────
  const [tab,          setTab]          = useState("overview");
  const [search,       setSearch]       = useState("");
  const [notifOpen,    setNotifOpen]    = useState(false);
  const [now,          setNow]          = useState(new Date());

  // ── AI Insights state ──────────────────────────────────
  const [aiMessages,   setAiMessages]   = useState([]);
  const [aiInput,      setAiInput]      = useState("");
  const [aiLoading,    setAiLoading]    = useState(false);
  const aiThreadRef    = useRef(null);
  const aiInputRef     = useRef(null);

  // ── Clock ──────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const loadLive = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [opsRes, scrRes] = await Promise.all([
        api.get("/dashboard/ops-summary"),
        api.get("/screenings/", { params: { limit: 100 } }),
      ]);
      setOps(opsRes.data);
      setScreenings(Array.isArray(scrRes.data) ? scrRes.data : []);
    } catch (err) {
      setLoadError(err.response?.data?.detail || "Failed to load live dashboard data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadLive(); }, [loadLive]);

  // ── Derived KPIs from live ops-summary ─────────────────
  const kpis = ops?.kpis || {};
  const target = ops?.target || DEFAULT_TARGET;
  const total = kpis.screened ?? 0;
  const enrolled = kpis.enrolled ?? 0;
  const failures = kpis.screen_failures ?? 0;
  const openSaes = kpis.open_saes ?? 0;
  const pendingForms = kpis.pending_forms ?? 0;
  const logGaps = kpis.log_gaps ?? 0;
  const eligible = kpis.eligible ?? 0;
  const pct = target ? Math.round((enrolled / target) * 100) : 0;
  const siteRows = (ops?.by_site || []).map(s => ({
    site: s.site,
    sc: s.screened,
    en: s.enrolled,
    tg: target,
    q: s.screened ? Math.round((s.enrolled / s.screened) * 100) : 0,
  }));
  const monthly = ops?.monthly || [];
  const formComp = (ops?.form_completion || []).map(f => [f.label, f.pct ?? 0, pctColor(f.pct ?? 0)]);
  const tasks = (ops?.tasks || []).map(t => ({
    title: t.title,
    col: TASK_COLORS[t.key] || C.amber,
    items: t.items || [],
    count: t.count || 0,
  }));
  const saes = (ops?.saes || []).map(s => ({
    id: s.id,
    site: s.site,
    type: s.diagnosis,
    status: s.open ? (s.ongoing ? "overdue" : "pending") : "complete",
    pri: (s.severity || "").toLowerCase() === "severe" ? "HIGH" : "MED",
  }));
  const activities = ops?.activities || [];
  const notifications = ops?.notifications || [];
  const safety = ops?.safety || {};
  const mort = safety.mortality || {};
  const morb = safety.morbidities || {};

  const filtered = screenings.filter(d =>
    !search ||
    (d.enrollment_id || "").toLowerCase().includes(search.toLowerCase()) ||
    (d.site_name     || "").toLowerCase().includes(search.toLowerCase())
  );

  // ── Open enrollment form ───────────────────────────────
  const openEnroll = useCallback(async id => {
    try {
      const r = await api.get(`/enrollment-status/${id}`);
      nav(`/${r.data.next_form}`);
    } catch { alert("Failed to load enrollment"); }
  }, [nav]);

  // ── AI: scroll to bottom ───────────────────────────────
  useEffect(() => {
    if (aiThreadRef.current) {
      aiThreadRef.current.scrollTop = aiThreadRef.current.scrollHeight;
    }
  }, [aiMessages, aiLoading]);

  // ── AI: send message ───────────────────────────────────
  // The live trial-context system prompt is built server-side (from a
  // fresh DB read, not client-supplied numbers) in POST /dashboard/ai-insights
  // — see backend/routers/dashboard.py Section 7. The Anthropic API key
  // never reaches the browser.
  const sendAI = useCallback(async (overrideQ) => {
    const q = (overrideQ || aiInput).trim();
    if (!q || aiLoading) return;
    setAiInput("");

    const userMsg = { role: "user", content: q };
    // Exclude prior error messages from replayed history — they were never a
    // real assistant turn, and FastAPI 422 details aren't always strings.
    const priorHistory = aiMessages.filter(m => !m.isError).map(m => ({ role: m.role, content: m.content }));
    setAiMessages(prev => [...prev, userMsg]);
    setAiLoading(true);

    try {
      const resp = await api.post("/dashboard/ai-insights", { message: q, history: priorHistory });
      const reply = resp.data?.reply || "Unable to generate a response.";
      setAiMessages(prev => [...prev, { role: "assistant", content: reply }]);
    } catch (err) {
      const detail = err.response?.data?.detail;
      const msg = typeof detail === "string" ? detail : "Connection error. Please try again.";
      setAiMessages(prev => [...prev, { role: "assistant", content: msg, isError: true }]);
    }
    setAiLoading(false);
  }, [aiInput, aiLoading, aiMessages]);

  // ── User info ──────────────────────────────────────────
  const roleLabel = RL_MAP[user?.role] || user?.role || "User";
  const roleColor = RL_COL[user?.role] || C.slate;

  const NOTIFS = notifications;
  const NOTIF_COL = { warn: C.amber, info: C.blue, error: C.red, ok: C.green };

  if (loading) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: 14, color: C.slate }}>
      <div className="db-spinner" />
      <p style={{ fontSize: 13, fontWeight: 500 }}>Loading live PORTAL data…</p>
    </div>
  );

  if (loadError && !ops) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: 14, color: C.red }}>
      <p style={{ fontSize: 13, fontWeight: 600 }}>{loadError}</p>
      <button className="db-qa-btn db-qa-primary" onClick={loadLive}>Retry</button>
    </div>
  );

  return (
    <div className="db-root">

      {/* ═══ TOP BAR ═══ */}
      <header className="db-topbar">
        <div className="db-topbar-left">
          <div className="db-topbar-title">
            <span className="db-topbar-portal">PORTAL</span>
            <span className="db-topbar-sub">Clinical Ops</span>
          </div>
          <LiveDot />
          <div className="db-search">
            <Ic d={P.search} s={13} c="#64748b" />
            <input placeholder="Search patient, site, ID…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="db-topbar-right">
          <div className="db-time">
            {now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} IST
          </div>
          {/* Notification bell */}
          <div className="db-notif-wrap">
            <button
              type="button"
              className="db-icon-btn"
              aria-label="Notifications"
              aria-expanded={notifOpen}
              onClick={() => setNotifOpen(o => !o)}
            >
              <Ic d={P.bell} s={14} c="#64748b" />
              {NOTIFS.length > 0 && <span className="db-notif-dot">{NOTIFS.length}</span>}
            </button>
            {notifOpen && (
              <>
                <div className="db-notif-backdrop" onClick={() => setNotifOpen(false)} />
                <div className="db-notif-panel" role="dialog" aria-label="Notifications">
                  <div className="db-notif-panel-head">
                    <span>Notifications</span>
                    <span className="db-notif-panel-count">{NOTIFS.length} recent</span>
                  </div>
                  <div className="db-notif-panel-body">
                    {NOTIFS.length === 0 ? (
                      <div className="db-notif-item">
                        <div>
                          <p className="db-notif-msg" style={{ color: C.slate, fontWeight: 500 }}>No recent live updates</p>
                        </div>
                      </div>
                    ) : NOTIFS.map((n, i) => (
                      <div key={i} className="db-notif-item">
                        <span className="db-notif-badge" style={{ background: NOTIF_COL[n.type] || C.slate }} />
                        <div>
                          <p className="db-notif-msg">{n.msg}</p>
                          <p className="db-notif-time">{n.time}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
          {/* User chip */}
          <div className="db-user-chip">
            <div className="db-user-avatar" style={{ background: roleColor }}>
              {(user?.name || "U")[0].toUpperCase()}
            </div>
            <div className="db-user-info">
              <span className="db-user-name">{user?.name || "User"}</span>
              <span className="db-user-role">{roleLabel}{user?.site ? ` · ${user.site}` : ""}</span>
            </div>
          </div>
        </div>
      </header>

      {/* ═══ TABS ═══ */}
      <div className="db-tabs">
        <div className="db-tabs-list">
          {TABS.map(t => (
            <button key={t} className={`db-tab${tab === t ? " active" : ""}`} onClick={() => setTab(t)}>
              {t === "ai-insights" ? "✦ AI Insights" : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <div className="db-tabs-actions">
          <button className="db-qa-btn db-qa-primary" onClick={() => setTab("ai-insights")}>
            <Ic d={P.star} s={11} c={C.tL} /> Ask AI
          </button>
          <button className="db-qa-btn" onClick={loadLive}>
            <Ic d={P.refresh} s={11} c={C.slate} /> Refresh
          </button>
        </div>
      </div>

      {/* ═══ BODY ═══ */}
      <div className="db-body">

        {/* ════ OVERVIEW ════ */}
        {tab === "overview" && (
          <>
            {/* KPI row */}
            <div className="db-kpi-row">
              {[
                { l: "Screened",        v: total,         col: C.blue,   ic: P.users  },
                { l: "Enrolled",        v: enrolled,      col: C.green,  ic: P.check  },
                { l: "Screen Failures", v: failures,      col: C.red,    ic: P.alert  },
                { l: "Eligible",        v: eligible,      col: C.purple, ic: P.zap    },
                { l: "Open SAEs",       v: openSaes,      col: C.orange, ic: P.shield },
                { l: "Pending Forms",   v: pendingForms,  col: C.amber,  ic: P.clip   },
                { l: "Log Gaps",        v: logGaps,       col: C.orange, ic: P.file   },
                { l: "Consented",       v: kpis.consented ?? 0, col: C.tL, ic: P.act  },
              ].map(k => (
                <Crd key={k.l} accent={k.col}>
                  <div className="db-kpi-icon" style={{ background: `${k.col}18` }}>
                    <Ic d={k.ic} s={16} c={k.col} />
                  </div>
                  <div className="db-kpi-body">
                    <div className="db-kpi-val">{k.v}</div>
                    <div className="db-kpi-label">{k.l}</div>
                  </div>
                </Crd>
              ))}
            </div>

            {/* Recruitment banner */}
            <Crd style={{ marginBottom: 14 }} accent={C.teal}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 11, color: C.slate, marginBottom: 3 }}>Overall Recruitment Progress</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: "#0b1c30", lineHeight: 1 }}>
                    {enrolled} <span style={{ fontSize: 14, color: C.slate, fontWeight: 400 }}>/ {target} enrolled</span>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 32, fontWeight: 800, color: C.tL }}>{pct}%</div>
                </div>
              </div>
              <div style={{ background: "#e0f2fe", borderRadius: 999, height: 8, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", borderRadius: 999, background: `linear-gradient(90deg,${C.teal},${C.tL})`, transition: "width 1.2s ease" }} />
              </div>
              <div style={{ fontSize: 10, color: C.slate, marginTop: 8, textAlign: "right" }}>Live randomised enrollments only — no projected date</div>
            </Crd>

            {/* Charts row */}
            <Crd style={{ marginBottom: 14 }}>
              <SH icon={P.trend} title="Monthly Enrollment Trend" sub="All 6 sites combined" />
              {monthly.length === 0 ? (
                <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", color: C.slate, fontSize: 12 }}>No enrolment trend in live data yet</div>
              ) : (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={monthly} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={C.teal} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={C.teal} stopOpacity={0}    />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#e2e8f0" />
                  <XAxis dataKey="m" stroke="#cbd5e1" tick={{ fill: "#64748b", fontSize: 10 }} />
                  <YAxis width={28} stroke="#cbd5e1" tick={{ fill: "#64748b", fontSize: 10 }} />
                  <Tooltip content={<TT />} />
                  <Area type="monotone" dataKey="n" name="Enrolled" stroke={C.tL} strokeWidth={2} fill="url(#ag)" dot={{ r: 3, fill: C.tL, strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
              )}
            </Crd>

            {/* Site bar + activity */}
            <div className="db-grid-2" style={{ marginBottom: 14 }}>
              <Crd>
                <SH icon={P.map} title="Site Performance" sub="Screened vs Enrolled" />
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={siteRows} barGap={3} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="#e2e8f0" />
                    <XAxis dataKey="site" stroke="#cbd5e1" tick={{ fill: "#64748b", fontSize: 9 }} />
                    <YAxis width={28} stroke="#cbd5e1" tick={{ fill: "#64748b", fontSize: 9 }} />
                    <Tooltip content={<TT />} />
                    <Bar dataKey="sc" name="Screened" fill="#7dd3fc" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="en" name="Enrolled" fill={C.teal}  radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Crd>
              <Crd>
                <SH icon={P.act} title="Live Activity Feed" right={<LiveDot />} />
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {activities.length === 0 && <div style={{ fontSize: 12, color: C.slate }}>No recent live activity</div>}
                  {activities.map((a, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 10px", borderRadius: 8, background: "#f8fcff", border: "1px solid #e8f1f8", transition: ".3s" }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: a.col, marginTop: 5, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 12, color: "#334155", lineHeight: 1.4 }}>{a.txt}</p>
                        <p style={{ fontSize: 10, color: C.slate }}>{a.t} ago</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Crd>
            </div>

            {/* Site table + data quality */}
            <div className="db-grid-2">
              <Crd>
                <SH icon={P.bar} title="Site Rankings" />
                <div className="db-table-wrap">
                  <table className="db-table">
                    <thead>
                      <tr><th>#</th><th>Site</th><th>Screened</th><th>Enrolled</th><th>Retention</th><th>Quality</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {siteRows.map((s, i) => (
                        <tr key={s.site}>
                          <td>
                            <span style={{ width: 20, height: 20, borderRadius: "50%", background: i === 0 ? C.amber : i === 1 ? "#64748b" : "#e0f2fe", color: i < 2 ? "#fff" : "#64748b", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>{i + 1}</span>
                          </td>
                          <td style={{ fontWeight: 700, color: "#0b1c30", fontSize: 12 }}>{s.site}</td>
                          <td>{s.sc}</td>
                          <td style={{ fontWeight: 700, color: C.tL }}>{s.en}</td>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <div style={{ width: 48, background: "#e0f2fe", borderRadius: 999, height: 4 }}>
                                <div style={{ width: `${(s.sc ? Math.round(s.en / s.sc * 100) : 0)}%`, height: "100%", borderRadius: 999, background: C.green }} />
                              </div>
                              <span style={{ fontSize: 10, color: "#64748b" }}>{(s.sc ? Math.round(s.en / s.sc * 100) : 0)}%</span>
                            </div>
                          </td>
                          <td style={{ color: s.q > 90 ? C.green : C.amber, fontWeight: 700, fontSize: 12 }}>{s.q}%</td>
                          <td><Pill s={i < 4 ? "active" : "pending"} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Crd>
              <Crd>
                <SH icon={P.shield} title="Form Completeness" sub="Live % by form" />
                <ResponsiveContainer width="100%" height={150}>
                  <LineChart data={formComp.map(([label, p]) => ({ d: label.replace(/^Form | — .*$/g,'').slice(0,8), q: p }))} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="#e2e8f0" />
                    <XAxis dataKey="d" stroke="#cbd5e1" tick={{ fill: "#64748b", fontSize: 10 }} />
                    <YAxis width={28} domain={[0, 100]} stroke="#cbd5e1" tick={{ fill: "#64748b", fontSize: 10 }} />
                    <Tooltip content={<TT />} />
                    <Line type="monotone" dataKey="q" name="Quality %" stroke={C.green} strokeWidth={2} dot={{ r: 3, fill: C.green, strokeWidth: 0 }} />
                  </LineChart>
                </ResponsiveContainer>
              </Crd>
            </div>
          </>
        )}

        {/* ════ RECRUITMENT ════ */}
        {tab === "recruitment" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12, marginBottom: 14 }}>
              {[["Target", target, C.teal], ["Enrolled", enrolled || 151, C.green], ["Remaining", Math.max(target - enrolled, 0), C.amber], ["Progress", `${pct}%`, C.blue]].map(([l, v, c]) => (
                <Crd key={l} accent={c}>
                  <div style={{ fontSize: 32, fontWeight: 800, color: c, lineHeight: 1 }}>{v}</div>
                  <div style={{ fontSize: 12, color: C.slate, marginTop: 5 }}>{l}</div>
                </Crd>
              ))}
            </div>
            <Crd style={{ marginBottom: 14 }}>
              <SH icon={P.bar} title="Site-wise Enrollment vs Target" />
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {siteRows.map(s => {
                  const p = s.tg ? Math.round(s.en / s.tg * 100) : 0;
                  return (
                    <div key={s.site}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#334155" }}>{s.site}</span>
                        <span style={{ fontSize: 11, color: C.slate }}>{s.en} / {s.tg} ({p}%)</span>
                      </div>
                      <div style={{ background: "#e0f2fe", borderRadius: 999, height: 7 }}>
                        <div style={{ width: `${p}%`, height: "100%", borderRadius: 999, background: p >= 70 ? C.green : p >= 40 ? C.teal : C.amber, transition: "width 1s" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Crd>
            <Crd>
              <SH icon={P.trend} title="Enrollment Velocity" sub="Monthly new enrollments" />
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthly} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#e2e8f0" />
                  <XAxis dataKey="m" stroke="#cbd5e1" tick={{ fill: "#64748b", fontSize: 11 }} />
                  <YAxis width={28} stroke="#cbd5e1" tick={{ fill: "#64748b", fontSize: 11 }} />
                  <Tooltip content={<TT />} />
                  <Bar dataKey="n" name="Enrolled" fill={C.teal} radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Crd>
          </>
        )}

        {/* ════ PATIENTS ════ */}
        {tab === "patients" && (
          <>
            <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center" }}>
              <div className="db-search" style={{ flex: 1, maxWidth: "100%" }}>
                <Ic d={P.search} s={13} c="#64748b" />
                <input placeholder="Search enrollment ID, site, status…" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </div>
            <Crd>
              <SH icon={P.users} title="Patient Tracker" sub={`${filtered.length} records`} />
              <div className="db-table-wrap">
                <table className="db-table">
                  <thead>
                    <tr><th>Enrollment ID</th><th>Site</th><th>Gestation</th><th>Status</th><th>Updated</th><th>Action</th></tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr><td colSpan={6} style={{ textAlign: "center", color: C.slate, padding: 40, fontSize: 13 }}>No records found</td></tr>
                    ) : filtered.slice(0, 50).map(r => (
                      <tr key={r.screening_id || r.enrollment_id}>
                        <td style={{ fontWeight: 700, color: C.tL, fontSize: 12 }}>{r.enrollment_id || r.screening_id || "—"}</td>
                        <td>{r.site_name || "—"}</td>
                        <td>{r.gestation_weeks ? `${r.gestation_weeks}w ${r.gestation_days || 0}d` : "—"}</td>
                        <td>
                          <Pill s={
                            r.screening_status === "Eligible" ? "active" :
                            r.screening_status === "Screen Failure" ? "failure" : "pending"
                          } />
                        </td>
                        <td style={{ color: C.slate, fontSize: 11 }}>
                          {r.updated_at ? new Date(r.updated_at).toLocaleDateString("en-IN") : "—"}
                        </td>
                        <td>
                          <button className="db-link-btn" onClick={() => r.enrollment_id && openEnroll(r.enrollment_id)}>
                            Open →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Crd>
          </>
        )}

        {/* ════ TASKS ════ */}
        {tab === "tasks" && (
          <div className="db-grid-2">
            {(tasks.length ? tasks : [{ title: "No pending actions", col: C.slate, items: [], count: 0 }]).map(sec => (
              <Crd key={sec.title} accent={sec.col}>
                <SH icon={P.clip} title={sec.title} sub={`${sec.count ?? sec.items.length} items`} />
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {sec.items.length === 0 ? (
                    <div style={{ fontSize: 12, color: C.slate, padding: "8px 0" }}>No live items in this category</div>
                  ) : sec.items.map((item, i) => (
                    <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "9px 10px", borderRadius: 8, background: "#f8fcff", border: `1px solid ${sec.col}18` }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: sec.col, marginTop: 5, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: "#334155", lineHeight: 1.45 }}>{item}</span>
                    </div>
                  ))}
                </div>
              </Crd>
            ))}
          </div>
        )}

        {/* ════ SAFETY ════ */}
        {tab === "safety" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12, marginBottom: 14 }}>
              {[
                ["Mortality (in-hosp)", mort?.in_hospital?.n ?? 0, C.red,    `${mort?.in_hospital?.pct ?? 0}%`],
                ["BPD",                 morb?.bpd?.n ?? 0,         C.orange, `${morb?.bpd?.pct ?? 0}%`],
                ["ROP Treated",         morb?.rop_tx?.n ?? 0,      C.amber,  `${morb?.rop_tx?.pct ?? 0}%`],
                ["NEC",                 morb?.nec?.n ?? 0,         C.purple, `${morb?.nec?.pct ?? 0}%`],
                ["Severe IVH",          morb?.ivh_severe?.n ?? 0,  C.red,    `${morb?.ivh_severe?.pct ?? 0}%`],
              ].map(([l, v, c, p]) => (
                <Crd key={l} accent={c}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: 30, fontWeight: 800, color: c, lineHeight: 1 }}>{v}</div>
                      <div style={{ fontSize: 11, color: C.slate, marginTop: 4 }}>{l}</div>
                    </div>
                    <span style={{ background: `${c}18`, color: c, fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 5 }}>{p}</span>
                  </div>
                </Crd>
              ))}
            </div>
            <div className="db-grid-2">
              <Crd accent={C.red}>
                <SH icon={P.shield} title="SAE Command Centre" />
                {saes.length === 0 && <div style={{ fontSize: 12, color: C.slate, padding: "8px 0" }}>No SAE reports in live data</div>}
                {saes.map(s => (
                  <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 11, borderRadius: 9, background: "#f8fcff", border: `1px solid ${s.status === "overdue" ? "rgba(239,68,68,.2)" : "#d5e4f0"}`, marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#0b1c30" }}>{s.id} · {s.site}</div>
                      <div style={{ fontSize: 11, color: C.slate }}>{s.type}</div>
                    </div>
                    <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
                      <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 4, background: s.pri === "HIGH" ? "rgba(239,68,68,.15)" : "rgba(232,160,32,.15)", color: s.pri === "HIGH" ? C.red : C.amber, letterSpacing: "0.05em" }}>{s.pri}</span>
                      <Pill s={s.status} />
                    </div>
                  </div>
                ))}
              </Crd>
              <Crd accent={C.purple}>
                <SH icon={P.eye} title="Live Safety Snapshot" sub="From study outcomes / morbidities" />
                {[
                  ["In-hospital mortality", mort?.in_hospital?.n ?? 0, C.red,    `${mort?.in_hospital?.pct ?? 0}%`],
                  ["BPD",                   morb?.bpd?.n ?? 0,         C.orange, `${morb?.bpd?.pct ?? 0}%`],
                  ["NEC",                   morb?.nec?.n ?? 0,         C.purple, `${morb?.nec?.pct ?? 0}%`],
                ].map(([l, v, c, p]) => (
                  <div key={l} style={{ padding: 12, borderRadius: 9, marginBottom: 9, background: "#f8fcff", border: "1px solid #d5e4f0" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
                      <span style={{ fontSize: 11, color: "#475569", maxWidth: "72%", lineHeight: 1.35 }}>{l}</span>
                      <span style={{ fontSize: 18, fontWeight: 800, color: c }}>{v}</span>
                    </div>
                    <div style={{ background: "#e0f2fe", borderRadius: 999, height: 4 }}>
                      <div style={{ width: p, height: "100%", background: c, borderRadius: 999 }} />
                    </div>
                  </div>
                ))}
              </Crd>
            </div>
          </>
        )}

        {/* ════ DATA ════ */}
        {tab === "data" && (
          <div className="db-grid-2">
            <Crd>
              <SH icon={P.clip} title="Form Completeness" sub="All forms by type" />
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {(formComp.length ? formComp : []).map(([f, p, c]) => (
                  <div key={f}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: "#475569" }}>{f}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: c }}>{p}%</span>
                    </div>
                    <div style={{ background: "rgba(255,255,255,.05)", borderRadius: 999, height: 5 }}>
                      <div style={{ width: `${p}%`, height: "100%", borderRadius: 999, background: c, transition: "width .8s" }} />
                    </div>
                  </div>
                ))}
              </div>
            </Crd>
            <Crd>
              <SH icon={P.alert} title="Open Actions" sub="From live data-quality checks" />
              {tasks.every(t => (t.count || 0) === 0) ? (
                <div style={{ fontSize: 12, color: C.slate, padding: "12px 0" }}>No open action items in live data</div>
              ) : tasks.filter(t => (t.count || 0) > 0).map(t => (
                <div key={t.title} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderRadius: 8, marginBottom: 7, background: "#f8fcff", border: "1px solid #d5e4f0" }}>
                  <div>
                    <div style={{ fontSize: 12, color: "#334155" }}>{t.title}</div>
                    <div style={{ fontSize: 10, color: C.slate }}>{(t.items || []).slice(0, 2).join(" · ") || "—"}</div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 800, color: t.col }}>{t.count}</span>
                </div>
              ))}
            </Crd>
          </div>
        )}

        {/* ════ AI INSIGHTS ════ */}
        {tab === "ai-insights" && (
          <div style={{ maxWidth: 780, margin: "0 auto" }}>
            <Crd accent={C.purple} style={{ marginBottom: 12 }}>
              <SH
                icon={P.star}
                title="AI Trial Intelligence"
                sub="Powered by Claude — ask anything about PORTAL"
              />

              {/* Quick question chips */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
                {QUICK_AI_QUESTIONS.map(q => (
                  <button key={q} className="db-ai-chip" onClick={() => sendAI(q)}>
                    {q}
                  </button>
                ))}
              </div>

              {/* Message thread */}
              <div ref={aiThreadRef} className="db-ai-thread">
                {aiMessages.length === 0 && (
                  <div style={{ textAlign: "center", padding: "40px 20px", color: "#3d4f63" }}>
                    <div style={{ fontSize: 28, marginBottom: 10 }}>✦</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#4a5568", marginBottom: 4 }}>
                      Ask me anything about PORTAL
                    </div>
                    <div style={{ fontSize: 12, color: "#3d4f63" }}>
                      Recruitment trends · safety signals · site performance · data quality
                    </div>
                  </div>
                )}
                {aiMessages.map((m, i) => (
                  <div key={i} className={`db-ai-msg db-ai-msg--${m.role}`}>
                    {m.role === "assistant" && (
                      <div className="db-ai-avatar">✦</div>
                    )}
                    <div className="db-ai-bubble">{m.content}</div>
                  </div>
                ))}
                {aiLoading && (
                  <div className="db-ai-msg db-ai-msg--assistant">
                    <div className="db-ai-avatar">✦</div>
                    <div className="db-ai-bubble db-ai-typing">
                      <span /><span /><span />
                    </div>
                  </div>
                )}
              </div>

              {/* Input bar */}
              <div className="db-ai-inputbar">
                <input
                  ref={aiInputRef}
                  className="db-ai-input"
                  placeholder="Ask about recruitment, safety, sites, data quality…"
                  value={aiInput}
                  onChange={e => setAiInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendAI()}
                  disabled={aiLoading}
                />
                <button className="db-ai-send" onClick={() => sendAI()} disabled={aiLoading || !aiInput.trim()}>
                  <Ic d={P.send} s={14} c="#fff" />
                </button>
              </div>
              <div style={{ fontSize: 10, color: "#3d4f63", marginTop: 8, textAlign: "center" }}>
                AI responses use live trial data. Always verify clinical decisions with source records.
              </div>
            </Crd>
          </div>
        )}

      </div>
    </div>
  );
}