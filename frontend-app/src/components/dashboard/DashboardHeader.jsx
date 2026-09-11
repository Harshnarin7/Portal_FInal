import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import {
  Bell,
  Menu,
  RefreshCw,
  Search,
  Sparkles,
  LogOut,
} from "lucide-react";
import { COORDINATING_SITE, formatSiteName } from "./siteLabels";

const NOTIF_COL = {
  warn: "#E8A020",
  info: "#006398",
  error: "#ba1a1a",
  ok: "#059669",
};

export default function DashboardHeader({
  search,
  onSearchChange,
  now,
  notifications,
  notifOpen,
  onNotifToggle,
  onNotifClose,
  roleLabel,
  roleColor,
  onAskAi,
  onRefresh,
  onMenu,
  tabLabel,
}) {
  const { user, logout } = useAuth();
  const [confirmOut, setConfirmOut] = useState(false);

  const handleLogout = () => {
    logout();
    window.location.href = "/login";
  };

  return (
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-2.5 border-b border-portal-line/60 bg-portal-mist/90 px-4 backdrop-blur-xl sm:px-5">
      <button
        type="button"
        className="ds-focus flex h-10 w-10 items-center justify-center rounded-lg border-0 bg-transparent text-portal-outline shadow-none hover:bg-portal-surface-low lg:hidden"
        aria-label="Open navigation"
        onClick={onMenu}
      >
        <Menu size={18} />
      </button>

      <div className="hidden min-w-0 shrink-0 items-center gap-2.5 lg:flex">
        <img src="/logo.png" alt="" className="h-8 w-auto object-contain" />
        <div className="min-w-0 leading-tight">
          <p className="font-display text-[16px] font-semibold uppercase tracking-tight text-portal-primary">
            PORTAL
          </p>
          <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-portal-outline">
            Clinical Research Platform // Clinical Ops
          </p>
        </div>
      </div>

      <p className="min-w-0 truncate font-display text-[15px] font-semibold text-portal-primary lg:hidden">
        {tabLabel}
      </p>

      <div className="relative min-w-0 max-w-[22rem] flex-1 lg:w-[22rem] lg:flex-none">
        <Search
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-portal-outline"
          aria-hidden="true"
        />
        <input
          type="search"
          className="ds-focus h-9 w-full rounded-lg border-0 bg-white pl-9 pr-3 text-[13px] text-portal-ink shadow-card placeholder:text-slate-400"
          placeholder="Search patient, site, or enrollment ID..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Search patient, site, or enrollment ID"
        />
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <span className="hidden items-center gap-1.5 rounded-lg bg-portal-surface-low px-2 py-1.5 xl:inline-flex" title="Live telemetry">
          <span className="h-1.5 w-1.5 rounded-full bg-portal-live animate-ds-pulse" aria-hidden="true" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-portal-live">Live</span>
        </span>

        <time
          className="hidden items-center rounded-lg bg-portal-surface-low px-2 py-1.5 font-data-mono text-[12px] font-medium text-portal-ink lg:inline-flex"
          dateTime={now.toISOString()}
        >
          {now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} IST
        </time>

        <span className="hidden items-center rounded-lg bg-portal-surface-low px-2 py-1.5 2xl:inline-flex" title={COORDINATING_SITE}>
          <span className="text-[12px] font-medium text-portal-ink">PGIMER</span>
        </span>

        <button
          type="button"
          onClick={onAskAi}
          className="ds-focus hidden h-9 items-center gap-1.5 rounded-lg border-0 bg-portal-primary px-3 text-[12px] font-medium tracking-wide text-white hover:bg-portal-primary-mid sm:inline-flex"
        >
          <Sparkles size={13} aria-hidden="true" />
          Ask AI
        </button>

        <button
          type="button"
          onClick={onRefresh}
          className="ds-focus flex h-9 w-9 items-center justify-center rounded-lg border-0 bg-white text-portal-outline shadow-card hover:bg-portal-surface-low"
          aria-label="Refresh dashboard"
        >
          <RefreshCw size={16} />
        </button>

        <div className="relative">
          <button
            type="button"
            className="ds-focus relative flex h-9 w-9 items-center justify-center rounded-lg border-0 bg-white text-portal-outline shadow-card hover:bg-portal-surface-low"
            aria-label="Notifications"
            aria-expanded={notifOpen}
            onClick={onNotifToggle}
          >
            <Bell size={16} />
            {notifications.length > 0 && (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-portal-accent ring-2 ring-white" />
            )}
          </button>
          {notifOpen && (
            <>
              <button
                type="button"
                className="fixed inset-0 z-40 cursor-default"
                aria-label="Close notifications"
                onClick={onNotifClose}
              />
              <div
                className="absolute right-0 top-[calc(100%+8px)] z-50 w-[min(320px,calc(100vw-24px))] overflow-hidden rounded-lg border border-portal-line/80 bg-white shadow-portal-elevated"
                role="dialog"
                aria-label="Notifications"
              >
                <div className="flex items-center justify-between border-b border-portal-line/80 bg-portal-surface-low px-3.5 py-2.5">
                  <span className="text-[12px] font-semibold text-portal-ink">Notifications</span>
                  <span className="font-data-mono text-[10px] text-portal-secondary">
                    {notifications.length} recent
                  </span>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <p className="px-4 py-8 text-center text-[12px] font-medium text-portal-muted">
                      No recent live updates
                    </p>
                  ) : (
                    notifications.map((n, i) => (
                      <div key={i} className="flex gap-2.5 border-b border-portal-line/60 px-3.5 py-3 last:border-0">
                        <span
                          className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                          style={{ background: NOTIF_COL[n.type] || "#74777e" }}
                          aria-hidden="true"
                        />
                        <div>
                          <p className="text-[12px] font-medium leading-snug text-portal-ink">{n.msg}</p>
                          <p className="mt-0.5 font-data-mono text-[10px] text-portal-outline">{n.time}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="hidden items-center gap-2.5 border-l border-portal-line/80 pl-2 sm:flex">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold text-white"
            style={{ background: roleColor }}
            aria-hidden="true"
          >
            {(user?.name || "U")[0].toUpperCase()}
          </div>
          <div className="min-w-0 max-w-[148px]">
            <p className="truncate text-[12px] font-semibold text-portal-ink">{user?.name || "User"}</p>
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.06em] text-portal-secondary">
              {roleLabel}
              {user?.site ? ` · ${formatSiteName(user.site)}` : ""}
            </p>
          </div>
        </div>

        {confirmOut ? (
          <div className="flex items-center gap-1 text-[11px] font-medium">
            <span className="hidden text-portal-muted sm:inline">Log out?</span>
            <button type="button" onClick={handleLogout} className="ds-focus rounded-lg bg-portal-accent px-2 py-1 text-white">Yes</button>
            <button type="button" onClick={() => setConfirmOut(false)} className="ds-focus rounded-lg bg-portal-surface-low px-2 py-1 text-portal-ink">No</button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmOut(true)}
            className="ds-focus flex h-9 w-9 items-center justify-center rounded-lg border-0 bg-transparent text-portal-outline shadow-none hover:bg-portal-surface-low"
            aria-label="Log out"
          >
            <LogOut size={16} />
          </button>
        )}
      </div>
    </header>
  );
}
