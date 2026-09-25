import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { isGlobalUser } from "../../utils/roles";
import {
  Bell,
  Menu,
  RefreshCw,
  Sparkles,
  LogOut,
} from "lucide-react";
import { formatSiteName, formatSiteShort } from "./siteLabels";

const NOTIF_COL = {
  warn: "#E8A020",
  info: "#006398",
  error: "#ba1a1a",
  ok: "#059669",
};

export default function DashboardHeader({
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
  const siteChip = user?.site
    ? formatSiteShort(user.site)
    : isGlobalUser(user)
      ? "All sites"
      : "";
  const siteChipTitle = user?.site
    ? formatSiteName(user.site)
    : isGlobalUser(user)
      ? "All trial sites"
      : "";

  const handleLogout = () => {
    logout();
    window.location.href = "/login";
  };

  return (
    <header className="sticky top-0 z-40 flex h-[68px] shrink-0 items-center gap-3 border-b border-[#00132c] bg-[#001d3d] px-4 shadow-[0_8px_24px_rgba(0,19,44,0.18)] sm:px-5">
      <button
        type="button"
        className="ds-focus flex h-10 w-10 items-center justify-center rounded-lg border-0 bg-white/10 text-white shadow-none hover:bg-white/15 lg:hidden"
        aria-label="Open navigation"
        onClick={onMenu}
      >
        <Menu size={18} />
      </button>

      <div className="hidden min-w-0 shrink-0 items-center gap-2.5 lg:flex">
        <img src="/logo.png" alt="" className="h-11 w-auto object-contain" />
        <div className="flex min-w-0 flex-col justify-center">
          <p className="m-0 font-display text-[17px] font-semibold leading-none tracking-[-0.02em] text-white">
            Portal
          </p>
          <p className="m-0 mt-0.5 text-[11px] font-normal leading-none tracking-normal text-[#b7c6dc]">
            Clinical research platform
          </p>
        </div>
      </div>

      <p className="min-w-0 flex-1 truncate font-display text-[15px] font-medium tracking-[-0.01em] text-white lg:hidden">
        {tabLabel}
      </p>

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <span className="hidden items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1.5 xl:inline-flex" title="Live telemetry">
          <span className="h-1.5 w-1.5 rounded-full bg-portal-live animate-ds-pulse" aria-hidden="true" />
          <span className="text-[12px] font-medium tracking-normal text-[#8ee0b8]">Live</span>
        </span>

        <time
          className="hidden items-center rounded-full bg-white/10 px-2.5 py-1.5 text-[12px] font-medium tracking-normal text-white lg:inline-flex"
          dateTime={now.toISOString()}
        >
          {now.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
          {" · "}
          {now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
        </time>

        {siteChip && (
          <span className="hidden items-center rounded-full bg-white/10 px-2.5 py-1.5 2xl:inline-flex" title={siteChipTitle}>
            <span className="text-[12px] font-medium text-white">{siteChip}</span>
          </span>
        )}

        <button
          type="button"
          onClick={onAskAi}
          className="ds-focus hidden h-9 items-center gap-1.5 rounded-full border-0 bg-[#006398] px-3.5 text-[13px] font-medium tracking-normal text-white hover:bg-[#1478b0] sm:inline-flex"
        >
          <Sparkles size={13} aria-hidden="true" />
          Ask AI
        </button>

        <button
          type="button"
          onClick={onRefresh}
          className="ds-focus flex h-9 w-9 items-center justify-center rounded-full border-0 bg-white/10 text-white shadow-none hover:bg-white/20"
          aria-label="Refresh dashboard"
        >
          <RefreshCw size={16} />
        </button>

        <div className="relative">
          <button
            type="button"
            className="ds-focus relative flex h-9 w-9 items-center justify-center rounded-full border-0 bg-white/10 text-white shadow-none hover:bg-white/20"
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
              <div
                className="fixed inset-0 z-40 cursor-default bg-transparent"
                aria-hidden="true"
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

        <div className="hidden items-center gap-2.5 border-l border-white/15 pl-2.5 sm:flex">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold text-white"
            style={{ background: roleColor }}
            aria-hidden="true"
          >
            {(user?.name || "U")[0].toUpperCase()}
          </div>
          <div className="flex min-w-0 max-w-[160px] flex-col justify-center">
            <p className="m-0 truncate text-[13px] font-medium leading-none tracking-[-0.01em] text-white">
              {user?.full_name || user?.name || "User"}
            </p>
            <p className="m-0 mt-0.5 truncate text-[11px] font-normal leading-none tracking-normal text-[#b7c6dc]">
              {roleLabel}
              {user?.site ? ` · ${formatSiteName(user.site)}` : ""}
            </p>
          </div>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setConfirmOut((open) => !open)}
            className="ds-focus flex h-9 w-9 items-center justify-center rounded-full border-0 bg-white/10 text-white shadow-none hover:bg-white/20"
            aria-label="Log out"
            aria-expanded={confirmOut}
          >
            <LogOut size={16} />
          </button>
          {confirmOut && (
            <>
              <div
                className="fixed inset-0 z-40 cursor-default bg-transparent"
                aria-hidden="true"
                onClick={() => setConfirmOut(false)}
              />
              <div
                className="absolute right-0 top-[calc(100%+10px)] z-50 w-56 rounded-xl border border-white/10 bg-white p-3.5 shadow-[0_16px_40px_rgba(0,19,44,0.22)]"
                role="dialog"
                aria-label="Confirm log out"
              >
                <p className="m-0 text-[13px] font-semibold leading-none text-portal-ink">Log out?</p>
                <p className="m-0 mt-1.5 text-[12px] leading-snug text-portal-muted">
                  You will need to sign in again to continue.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="ds-focus h-8 flex-1 rounded-lg border-0 bg-portal-accent text-[12px] font-semibold text-white hover:opacity-90"
                  >
                    Log out
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmOut(false)}
                    className="ds-focus h-8 flex-1 rounded-lg border border-portal-line bg-white text-[12px] font-semibold text-portal-ink hover:bg-portal-surface-low"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
