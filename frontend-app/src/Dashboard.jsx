// Dashboard.jsx — PORTAL Trial Clinical Operations Dashboard
// Visual layer: Tailwind + dashboard presentation components.
// Data, APIs, tab state, search, Open, notifications, and AI are unchanged.

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import {
  Users, UserCheck, AlertTriangle, Zap, Shield, ClipboardList,
  FileText, Activity, TrendingUp, MapPin, BarChart3, Sparkles, Send,
  Inbox,
} from "lucide-react";
import api from "./api/axios";
import { useAuth } from "./context/AuthContext";
import { formatBabyOfLabel } from "./utils/babyName";
import DashboardShell from "./components/dashboard/DashboardShell";
import DashboardKpiCard from "./components/dashboard/DashboardKpiCard";
import DashboardSection from "./components/dashboard/DashboardSection";
import StatusBadge from "./components/dashboard/StatusBadge";
import EmptyState from "./components/dashboard/EmptyState";
import LoadingSkeleton from "./components/dashboard/LoadingSkeleton";
import ChartTooltip from "./components/dashboard/ChartTooltip";
import TrialContextBanner from "./components/dashboard/TrialContextBanner";
import RecruitmentDonut from "./components/dashboard/RecruitmentDonut";
import SiteCompareBars from "./components/dashboard/SiteCompareBars";
import {
  formatSiteName,
  formatSiteShort,
} from "./components/dashboard/siteLabels";
import "./Dashboard.css";

const C = {
  teal: "#0E7C7B", tL: "#14A8A7", navy: "#0B1F3A",
  amber: "#E8A020", green: "#22c55e", red: "#ef4444",
  purple: "#8b5cf6", blue: "#3b82f6", slate: "#64748b",
  orange: "#f97316",
};

const pctColor = (p) => (p >= 90 ? C.green : p >= 70 ? C.tL : p >= 50 ? C.amber : C.red);
const TASK_COLORS = {
  consented_no_form_b: C.amber,
  randomised_no_form_c: C.blue,
  randomised_no_form_i: C.red,
  few_day_logs: C.orange,
};
const QUICK_AI_QUESTIONS = [
  "What's the current trial status?",
  "Any safety signals to watch?",
  "Which site needs the most attention?",
  "Predict enrollment completion date",
  "Analyse data quality gaps",
  "Summarise composite outcomes so far",
];

const RL_MAP = {
  superadmin: "Super Admin", admin: "Administrator", pi: "Principal Investigator",
  scientist: "Scientist", nurse: "Research Nurse", deo: "Data Entry Operator", monitor: "Trial Monitor",
};
const RL_COL = {
  superadmin: C.purple, admin: C.purple, pi: C.teal,
  scientist: C.blue, nurse: C.green, deo: C.amber, monitor: C.orange,
};

const DEFAULT_TARGET = 700;

const AXIS = { fill: "#74777e", fontSize: 10 };
const GRID = "#e7eeff";
const CHART = { primary: "#00132c", secondary: "#006398", screened: "#93ccff" };

function LiveDot() {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-1.5 w-1.5 rounded-full bg-portal-live animate-ds-pulse" aria-hidden="true" />
      <span className="text-[11px] font-bold tracking-[0.06em] text-portal-live">LIVE</span>
    </span>
  );
}

function babyInitials(label) {
  const t = String(label || "").replace(/^baby of\s+/i, "").replace(/^b\/o\s+/i, "").trim();
  if (!t || t === "—") return "?";
  const parts = t.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

function setPatientSessionIds(screeningId, enrollmentId) {
  if (screeningId) localStorage.setItem("current_screening_id", screeningId);
  else localStorage.removeItem("current_screening_id");
  if (enrollmentId) localStorage.setItem("current_enrollment_id", enrollmentId);
  else localStorage.removeItem("current_enrollment_id");
  window.dispatchEvent(new Event("storage"));
}

function pathForNextForm(nextForm, screeningId, enrollmentId) {
  const sid = screeningId || "";
  const eid = enrollmentId || "";
  switch (nextForm) {
    case "form-b":
      return sid ? `/form-b/${sid}` : null;
    case "form-c":
      return eid ? `/form-c/${eid}` : null;
    case "form-d":
      return eid ? `/form-d/${eid}` : null;
    case "form-e":
      return eid ? `/form-e/${eid}` : null;
    case "completed":
      return eid ? `/form-e/${eid}` : (sid ? `/form-a/${sid}` : null);
    default:
      return sid ? `/form-a/${sid}` : null;
  }
}

export default function Dashboard() {
  const nav = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const [screenings, setScreenings] = useState([]);
  const [piiByScreening, setPiiByScreening] = useState({});
  const [ops, setOps] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [tab, setTab] = useState("overview");
  const [search, setSearch] = useState("");
  const [notifOpen, setNotifOpen] = useState(false);
  const [now, setNow] = useState(new Date());
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const next = location.state?.dashboardTab;
    if (next) setTab(next);
  }, [location.state?.dashboardTab]);

  const [aiMessages, setAiMessages] = useState([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const aiThreadRef = useRef(null);
  const aiInputRef = useRef(null);

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
      const list = Array.isArray(scrRes.data) ? scrRes.data : [];
      setScreenings(list);
      const sids = list.map(d => d.screening_id).filter(Boolean);
      if (sids.length) {
        try {
          const piiRes = await api.post("/pii/batch", { screening_ids: sids });
          setPiiByScreening(piiRes.data?.items || {});
        } catch {
          setPiiByScreening({});
        }
      } else {
        setPiiByScreening({});
      }
    } catch (err) {
      setLoadError(err.response?.data?.detail || "Failed to load live dashboard data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadLive(); }, [loadLive]);

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
    label: formatSiteName(s.site),
    short: formatSiteShort(s.site),
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

  const filtered = screenings.filter(d => {
    if (!search) return true;
    const q = search.toLowerCase();
    const baby = formatBabyOfLabel(piiByScreening[d.screening_id]).toLowerCase();
    return (
      (d.enrollment_id || "").toLowerCase().includes(q) ||
      (d.site_name     || "").toLowerCase().includes(q) ||
      baby.includes(q)
    );
  });

  const openPatient = useCallback(async (row) => {
    const screeningId = row?.screening_id;
    const enrollmentId = row?.enrollment_id;

    if (!screeningId && !enrollmentId) {
      alert("Missing patient identifiers");
      return;
    }

    if (!enrollmentId) {
      setPatientSessionIds(screeningId, null);
      nav(`/form-a/${screeningId}`);
      return;
    }

    try {
      const r = await api.get(`/enrollment-status/${enrollmentId}`);
      const path = pathForNextForm(r.data.next_form, screeningId, enrollmentId);
      if (!path) {
        alert("Unable to determine next form for this patient");
        return;
      }
      setPatientSessionIds(screeningId, enrollmentId);
      nav(path);
    } catch {
      alert("Failed to load enrollment");
    }
  }, [nav]);

  useEffect(() => {
    if (aiThreadRef.current) {
      aiThreadRef.current.scrollTop = aiThreadRef.current.scrollHeight;
    }
  }, [aiMessages, aiLoading]);

  const sendAI = useCallback(async (overrideQ) => {
    const q = (overrideQ || aiInput).trim();
    if (!q || aiLoading) return;
    setAiInput("");

    const userMsg = { role: "user", content: q };
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

  const roleLabel = RL_MAP[user?.role] || user?.role || "User";
  const roleColor = RL_COL[user?.role] || C.slate;
  const NOTIFS = notifications;

  const shell = (children) => (
    <DashboardShell
      tab={tab}
      onTabChange={setTab}
      sidebarOpen={sidebarOpen}
      onSidebarOpen={() => setSidebarOpen(true)}
      onSidebarClose={() => setSidebarOpen(false)}
      isSuperadmin={user?.role === "superadmin"}
      headerProps={{
        search,
        onSearchChange: setSearch,
        now,
        notifications: NOTIFS,
        notifOpen,
        onNotifToggle: () => setNotifOpen(o => !o),
        onNotifClose: () => setNotifOpen(false),
        roleLabel,
        roleColor,
        onAskAi: () => { setTab("ai-insights"); setSidebarOpen(false); },
        onRefresh: loadLive,
      }}
    >
      {children}
    </DashboardShell>
  );

  if (loading) return shell(<LoadingSkeleton />);

  if (loadError && !ops) {
    return shell(
      <div className="ds-card mx-auto flex min-h-[380px] max-w-lg flex-col items-center justify-center gap-3 p-10 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#ffdad6] text-portal-accent">
          <AlertTriangle size={28} aria-hidden="true" />
        </div>
        <p className="font-display text-[20px] font-semibold text-portal-accent">{loadError}</p>
        <p className="text-[13px] text-portal-muted">Authentication token remains intact. Retry to reload live PORTAL data.</p>
        <button
          type="button"
          onClick={loadLive}
          className="ds-focus rounded-lg bg-portal-primary px-5 py-2.5 text-[13px] font-semibold text-white"
        >
          Retry
        </button>
      </div>
    );
  }

  return shell(
    <>
      {tab === "overview" && (
        <div className="space-y-6">
          <TrialContextBanner enrolled={enrolled} target={target} pct={pct} />

          <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
            <DashboardKpiCard label="Screened" value={total} icon={Users} tone="primary" />
            <DashboardKpiCard label="Enrolled" value={enrolled} icon={UserCheck} tone="success" />
            <DashboardKpiCard label="Screen Failures" value={failures} icon={AlertTriangle} tone="danger" />
            <DashboardKpiCard label="Eligible" value={eligible} icon={Zap} tone="teal" />
            <DashboardKpiCard label="Open SAEs" value={openSaes} icon={Shield} tone="danger" warn={openSaes > 0} />
            <DashboardKpiCard label="Pending Forms" value={pendingForms} icon={ClipboardList} tone="warning" />
            <DashboardKpiCard label="Log Gaps" value={logGaps} icon={FileText} tone="muted" />
            <DashboardKpiCard label="Consented" value={kpis.consented ?? 0} icon={Activity} tone="teal" />
          </section>

          <div className="grid gap-6 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <DashboardSection icon={TrendingUp} title="Overall Recruitment Progress" sub="Trial trajectory">
                <RecruitmentDonut enrolled={enrolled} target={target} pct={pct} />
              </DashboardSection>
            </div>
            <div className="lg:col-span-8">
              <DashboardSection icon={TrendingUp} title="Monthly Enrollment Trend" sub="All 6 sites combined">
                {monthly.length === 0 ? (
                  <EmptyState icon={BarChart3} title="No enrolment trend in live data yet" body="Monthly enrollments will appear here once records are available." />
                ) : (
                  <div className="h-[220px] w-full min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={monthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={CHART.secondary} stopOpacity={0.22} />
                            <stop offset="95%" stopColor={CHART.secondary} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke={GRID} vertical={false} />
                        <XAxis dataKey="m" stroke={GRID} tick={AXIS} />
                        <YAxis width={28} stroke={GRID} tick={AXIS} />
                        <Tooltip content={<ChartTooltip />} />
                        <Area type="monotone" dataKey="n" name="Enrolled" stroke={CHART.secondary} strokeWidth={2} fill="url(#ag)" dot={{ r: 3, fill: CHART.secondary, strokeWidth: 0 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </DashboardSection>
            </div>
          </div>

          <DashboardSection icon={MapPin} title="Site Performance" sub="Screened vs Enrolled across all 6 sites">
            {siteRows.length === 0 ? (
              <EmptyState icon={MapPin} title="No site data yet" />
            ) : (
              <SiteCompareBars rows={siteRows} />
            )}
          </DashboardSection>

          <div className="grid gap-6 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <DashboardSection icon={ClipboardList} title="Form Completeness" sub="% by form type">
                {formComp.length === 0 ? (
                  <EmptyState icon={ClipboardList} title="No form completeness data yet" />
                ) : (
                  <div className="flex flex-col gap-3">
                    {formComp.map(([f, p, c]) => (
                      <div key={f}>
                        <div className="mb-1 flex justify-between gap-2">
                          <span className="text-[12px] font-medium text-portal-ink">{f}</span>
                          <span className="font-data-mono text-[11px] font-semibold tabular-nums" style={{ color: c }}>{p}%</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-portal-ice">
                          <div className="h-full rounded-full" style={{ width: `${p}%`, background: c }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </DashboardSection>
            </div>
            <div className="lg:col-span-5">
              <DashboardSection icon={Activity} title="Live Activity Feed" right={<LiveDot />}>
                {activities.length === 0 ? (
                  <EmptyState icon={Inbox} title="No recent live activity" body="New enrollments, forms, and safety events will appear here." />
                ) : (
                  <ul className="m-0 flex list-none flex-col p-0">
                    {activities.map((a, i) => (
                      <li key={i} className="flex gap-2.5 border-b border-portal-line/60 py-2.5 last:border-0">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: a.col }} aria-hidden="true" />
                        <div className="min-w-0">
                          <p className="text-[12px] leading-snug text-portal-ink">{a.txt}</p>
                          <p className="mt-0.5 font-data-mono text-[10px] text-portal-outline">{a.t} ago</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </DashboardSection>
            </div>
          </div>

          <DashboardSection icon={BarChart3} title="Site Rankings">
            {siteRows.length === 0 ? (
              <EmptyState icon={MapPin} title="No site data yet" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-portal-line text-[11px] font-semibold uppercase tracking-[0.06em] text-portal-outline">
                      <th className="sticky top-0 bg-white py-2 pr-2">#</th>
                      <th className="sticky top-0 bg-white py-2 pr-2">Site</th>
                      <th className="sticky top-0 bg-white py-2 pr-2 text-right">Screened</th>
                      <th className="sticky top-0 bg-white py-2 pr-2 text-right">Enrolled</th>
                      <th className="sticky top-0 bg-white py-2 pr-2">Retention</th>
                      <th className="sticky top-0 bg-white py-2 pr-2 text-right">Quality</th>
                      <th className="sticky top-0 bg-white py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {siteRows.map((s, i) => (
                      <tr key={s.site} className="border-b border-portal-line/80 last:border-0">
                        <td className="py-2.5 pr-2">
                          <span className={`inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold ${i === 0 ? "bg-amber-500 text-white" : i === 1 ? "bg-slate-500 text-white" : "bg-portal-ice text-portal-muted"}`}>
                            {i + 1}
                          </span>
                        </td>
                        <td className="py-2.5 pr-2 text-[12px] font-semibold text-portal-ink">{s.label}</td>
                        <td className="py-2.5 pr-2 text-right font-data-mono text-[12px] tabular-nums">{s.sc}</td>
                        <td className="py-2.5 pr-2 text-right font-data-mono text-[12px] font-semibold tabular-nums text-portal-secondary">{s.en}</td>
                        <td className="py-2.5 pr-2">
                          <div className="flex items-center gap-1.5">
                            <div className="h-1 w-12 overflow-hidden rounded-full bg-portal-ice">
                              <div className="h-full rounded-full bg-portal-live" style={{ width: `${s.sc ? Math.round(s.en / s.sc * 100) : 0}%` }} />
                            </div>
                            <span className="font-data-mono text-[10px] text-portal-outline">{s.sc ? Math.round(s.en / s.sc * 100) : 0}%</span>
                          </div>
                        </td>
                        <td className={`py-2.5 pr-2 text-right font-data-mono text-[12px] font-semibold tabular-nums ${s.q > 90 ? "text-emerald-600" : "text-amber-600"}`}>{s.q}%</td>
                        <td className="py-2.5"><StatusBadge s={i < 4 ? "active" : "pending"} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DashboardSection>
        </div>
      )}

      {tab === "recruitment" && (
        <div className="space-y-6">
          <DashboardSection icon={BarChart3} title="Recruitment & Trial Accrual Telemetry" sub="Live randomised enrollments only — no projected date">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[["Target", target, "primary"], ["Enrolled", enrolled || 151, "success"], ["Remaining", Math.max(target - enrolled, 0), "warning"], ["Progress", `${pct}%`, "teal"]].map(([l, v, tone]) => (
                <DashboardKpiCard key={l} label={l} value={v} tone={tone} compact />
              ))}
            </div>
            <div className="mt-6 grid gap-6 xl:grid-cols-12">
              <div className="xl:col-span-7">
                <p className="mb-3 font-display text-[17px] font-semibold text-portal-primary">Site-wise Enrollment vs Target</p>
                {siteRows.length === 0 ? (
                  <EmptyState icon={MapPin} title="No site enrollment data yet" />
                ) : (
                  <div className="flex flex-col gap-3">
                    {siteRows.map(s => {
                      const p = s.tg ? Math.round(s.en / s.tg * 100) : 0;
                      return (
                        <div key={s.site}>
                          <div className="mb-1.5 flex justify-between gap-2">
                            <span className="text-[12px] font-semibold text-portal-ink">{s.label}</span>
                            <span className="font-data-mono text-[11px] tabular-nums text-portal-outline">{s.en} / {s.tg} ({p}%)</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-portal-ice">
                            <div
                              className="h-full rounded-full transition-[width] duration-700 motion-reduce:transition-none"
                              style={{ width: `${p}%`, background: p >= 70 ? C.green : p >= 40 ? CHART.secondary : C.amber }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="xl:col-span-5">
                <p className="mb-3 font-display text-[17px] font-semibold text-portal-primary">Monthly Enrollment Velocity</p>
                {monthly.length === 0 ? (
                  <EmptyState icon={BarChart3} title="No monthly enrollment data yet" />
                ) : (
                  <div className="h-[220px] w-full min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthly} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid stroke={GRID} vertical={false} />
                        <XAxis dataKey="m" stroke={GRID} tick={{ ...AXIS, fontSize: 11 }} />
                        <YAxis width={28} stroke={GRID} tick={{ ...AXIS, fontSize: 11 }} />
                        <Tooltip content={<ChartTooltip />} />
                        <Bar dataKey="n" name="Enrolled" fill={CHART.secondary} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
          </DashboardSection>
        </div>
      )}

      {tab === "patients" && (
        <div className="space-y-6">
          <DashboardSection icon={Users} title="Preterm Patient Registry" sub={`${filtered.length} records`}>
            <div className="mb-4 grid grid-cols-1 gap-2 rounded-lg bg-portal-surface-low p-2 sm:grid-cols-12">
              <div className="sm:col-span-12">
                <p className="px-1 text-[12px] text-portal-muted">
                  Filter uses the header search — baby name, enrollment ID, or site.
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-portal-line bg-portal-surface-low text-[11px] font-semibold uppercase tracking-[0.06em] text-portal-outline">
                    <th className="py-2.5 pr-3 pl-3">Baby name</th>
                    <th className="py-2.5 pr-3">Enrollment ID</th>
                    <th className="py-2.5 pr-3">Site</th>
                    <th className="py-2.5 pr-3">Gestation</th>
                    <th className="py-2.5 pr-3">Status</th>
                    <th className="py-2.5 pr-3">Updated</th>
                    <th className="py-2.5 pr-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center">
                        <EmptyState
                          icon={Users}
                          title={search ? "No matching patients" : "No patients"}
                          body={search ? "Try a different baby name, enrollment ID, or site." : "Patient records will appear here from live screening data."}
                        />
                      </td>
                    </tr>
                  ) : filtered.slice(0, 50).map(r => {
                    const baby = formatBabyOfLabel(piiByScreening[r.screening_id]) || "—";
                    return (
                    <tr key={r.screening_id || r.enrollment_id} className="border-b border-portal-line/80 transition-colors hover:bg-portal-surface-low last:border-0">
                      <td className="py-2.5 pr-3 pl-3">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-portal-ice font-display text-[11px] font-bold text-portal-secondary">
                            {babyInitials(baby)}
                          </span>
                          <span className="text-[13px] font-semibold text-portal-ink">{baby}</span>
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 font-data-mono text-[12px] font-semibold text-portal-secondary">
                        {r.enrollment_id || r.screening_id || "—"}
                      </td>
                      <td className="py-2.5 pr-3 text-[12px] text-portal-muted">{formatSiteName(r.site_name) || "—"}</td>
                      <td className="py-2.5 pr-3 font-data-mono text-[12px] tabular-nums">{r.gestation_weeks ? `${r.gestation_weeks}w ${r.gestation_days || 0}d` : "—"}</td>
                      <td className="py-2.5 pr-3">
                        <StatusBadge
                          s={
                            r.screening_status === "Eligible" ? "active" :
                            r.screening_status === "Screen Failure" ? "failure" : "pending"
                          }
                        />
                      </td>
                      <td className="py-2.5 pr-3 font-data-mono text-[11px] text-portal-outline">
                        {r.updated_at ? new Date(r.updated_at).toLocaleDateString("en-IN") : "—"}
                      </td>
                      <td className="py-2.5 pr-3">
                        <button
                          type="button"
                          className="ds-focus min-h-[36px] rounded-lg px-2 text-[12px] font-semibold text-portal-secondary hover:underline"
                          onClick={() => openPatient(r)}
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </DashboardSection>
        </div>
      )}

      {tab === "tasks" && (
        <div className="grid gap-4 md:grid-cols-2">
          {(tasks.length ? tasks : [{ title: "No pending actions", col: C.slate, items: [], count: 0 }]).map(sec => (
            <DashboardSection
              key={sec.title}
              icon={ClipboardList}
              title={sec.title}
              sub={`${sec.count ?? sec.items.length} items`}
              accent={sec.col}
            >
              {sec.items.length === 0 ? (
                <EmptyState icon={ClipboardList} title="No live items in this category" />
              ) : (
                <ul className="m-0 flex list-none flex-col p-0">
                  {sec.items.map((item, i) => (
                    <li key={i} className="flex gap-2.5 border-b border-portal-line/60 px-0 py-2.5 last:border-0">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: sec.col }} aria-hidden="true" />
                      <span className="text-[12px] leading-snug text-portal-ink">{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </DashboardSection>
          ))}
        </div>
      )}

      {tab === "safety" && (
        <div className="space-y-6">
          <div>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-portal-outline">Live Safety Snapshot</p>
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
              {[
                ["Mortality (in-hosp)", mort?.in_hospital?.n ?? 0, "danger", `${mort?.in_hospital?.pct ?? 0}%`],
                ["BPD", morb?.bpd?.n ?? 0, "warning", `${morb?.bpd?.pct ?? 0}%`],
                ["ROP Treated", morb?.rop_tx?.n ?? 0, "warning", `${morb?.rop_tx?.pct ?? 0}%`],
                ["NEC", morb?.nec?.n ?? 0, "muted", `${morb?.nec?.pct ?? 0}%`],
                ["Severe IVH", morb?.ivh_severe?.n ?? 0, "danger", `${morb?.ivh_severe?.pct ?? 0}%`],
              ].map(([l, v, tone, hint]) => (
                <DashboardKpiCard key={l} label={l} value={v} tone={tone} hint={hint} />
              ))}
            </div>
          </div>
          <DashboardSection icon={Shield} title="SAE Incident Log" sub={`${saes.length} recorded`}>
            {saes.length === 0 ? (
              <EmptyState icon={Shield} title="No SAE reports in live data" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-portal-line bg-portal-surface-low text-[11px] font-semibold uppercase tracking-[0.06em] text-portal-outline">
                      <th className="py-2.5 px-3">SAE ID</th>
                      <th className="py-2.5 pr-3">Site</th>
                      <th className="py-2.5 pr-3">Type</th>
                      <th className="py-2.5 pr-3">Status</th>
                      <th className="py-2.5 pr-3">Priority</th>
                    </tr>
                  </thead>
                  <tbody>
                    {saes.map(s => (
                      <tr key={s.id} className={`border-b border-portal-line/80 last:border-0 ${s.status === "overdue" ? "bg-[#ffdad6]/40" : ""}`}>
                        <td className="py-2.5 px-3 font-data-mono text-[12px] font-semibold text-portal-primary">{s.id}</td>
                        <td className="py-2.5 pr-3 text-[12px] text-portal-ink">{formatSiteName(s.site)}</td>
                        <td className="py-2.5 pr-3 text-[12px] text-portal-muted">{s.type}</td>
                        <td className="py-2.5 pr-3"><StatusBadge s={s.status} /></td>
                        <td className="py-2.5 pr-3">
                          <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wide ${s.pri === "HIGH" ? "bg-[#ffdad6] text-portal-accent" : "bg-amber-50 text-amber-700"}`}>
                            {s.pri}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DashboardSection>
        </div>
      )}

      {tab === "data" && (
        <div className="space-y-6">
          <DashboardSection icon={ClipboardList} title="Data Quality & Case Report Form Completeness" sub="All forms by type">
            {formComp.length === 0 ? (
              <EmptyState icon={ClipboardList} title="No completeness data yet" />
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
                {formComp.map(([f, p, c]) => (
                  <div key={f} className="rounded-lg bg-portal-surface-low p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-portal-outline">{f}</p>
                    <p className="mt-2 font-display text-[28px] font-bold tabular-nums leading-none" style={{ color: c }}>{p}%</p>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white">
                      <div className="h-full rounded-full" style={{ width: `${p}%`, background: c }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DashboardSection>
          <DashboardSection icon={AlertTriangle} title="Open Actions" sub="From live data-quality checks">
            {tasks.every(t => (t.count || 0) === 0) ? (
              <EmptyState icon={Inbox} title="No open action items in live data" />
            ) : tasks.filter(t => (t.count || 0) > 0).map(t => (
              <div key={t.title} className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-portal-line/80 bg-portal-surface-low px-3 py-2.5 last:mb-0">
                <div className="min-w-0">
                  <p className="text-[12px] font-medium text-portal-ink">{t.title}</p>
                  <p className="text-[10px] text-portal-outline">{(t.items || []).slice(0, 2).join(" · ") || "—"}</p>
                </div>
                <span className="font-data-mono text-[12px] font-bold tabular-nums" style={{ color: t.col }}>{t.count}</span>
              </div>
            ))}
          </DashboardSection>
        </div>
      )}

      {tab === "ai-insights" && (
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="ds-card flex items-start gap-3 p-4">
            <Sparkles size={18} className="mt-0.5 shrink-0 text-portal-primary" aria-hidden="true" />
            <div>
              <p className="font-display text-[15px] font-semibold text-portal-primary">Clinical Oversight Protocol Notice</p>
              <p className="mt-1 text-[13px] leading-relaxed text-portal-ink">
                AI responses use live trial data. Always verify clinical decisions with source records.
              </p>
            </div>
          </div>
          <DashboardSection
            icon={Sparkles}
            title="AI Trial Intelligence"
            sub="Ask anything about PORTAL recruitment, safety, sites, or data quality"
          >
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-portal-outline">Suggested clinical inquiries</p>
            <div className="mb-4 flex flex-wrap gap-1.5">
              {QUICK_AI_QUESTIONS.map(q => (
                <button
                  key={q}
                  type="button"
                  onClick={() => sendAI(q)}
                  className="ds-focus rounded-full border border-portal-line bg-white px-3 py-1.5 text-[11px] font-medium text-portal-ink shadow-card hover:border-portal-secondary hover:bg-portal-surface-low"
                >
                  {q}
                </button>
              ))}
            </div>

            <div
              ref={aiThreadRef}
              className="mb-3 max-h-[420px] min-h-[220px] overflow-y-auto rounded-lg border border-portal-line/80 bg-portal-surface-low/60 p-3"
            >
              {aiMessages.length === 0 && (
                <EmptyState
                  icon={Sparkles}
                  title="Ask me anything about PORTAL"
                  body="Recruitment trends · safety signals · site performance · data quality"
                />
              )}
              {aiMessages.map((m, i) => (
                <div key={i} className={`mb-3 flex gap-2 ${m.role === "user" ? "justify-end" : "items-start"}`}>
                  {m.role === "assistant" && (
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-portal-primary text-[11px] text-white" aria-hidden="true">✦</div>
                  )}
                  <div className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-[13px] leading-relaxed ${
                    m.role === "user"
                      ? "rounded-tr-none bg-portal-primary text-white"
                      : m.isError
                        ? "border border-red-200 bg-red-50 text-portal-accent"
                        : "border border-portal-line bg-white text-portal-ink"
                  }`}>
                    {m.content}
                  </div>
                </div>
              ))}
              {aiLoading && (
                <div className="flex items-start gap-2" role="status" aria-label="AI is responding">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-portal-primary text-[11px] text-white" aria-hidden="true">✦</div>
                  <div className="flex gap-1 rounded-xl border border-portal-line bg-white px-3 py-2.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-portal-secondary animate-ds-typing" />
                    <span className="h-1.5 w-1.5 rounded-full bg-portal-secondary animate-ds-typing [animation-delay:160ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-portal-secondary animate-ds-typing [animation-delay:320ms]" />
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <input
                ref={aiInputRef}
                className="ds-focus h-10 min-w-0 flex-1 rounded-lg border border-portal-line/80 bg-white px-3 text-[13px] text-portal-ink placeholder:text-slate-400 disabled:opacity-50"
                placeholder="Ask about recruitment, safety, sites, data quality…"
                value={aiInput}
                onChange={e => setAiInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendAI()}
                disabled={aiLoading}
                aria-label="Ask AI about the trial"
              />
              <button
                type="button"
                onClick={() => sendAI()}
                disabled={aiLoading || !aiInput.trim()}
                className="ds-focus flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-portal-primary text-white disabled:opacity-35"
                aria-label="Send"
              >
                <Send size={14} />
              </button>
            </div>
          </DashboardSection>
        </div>
      )}
    </>
  );
}
