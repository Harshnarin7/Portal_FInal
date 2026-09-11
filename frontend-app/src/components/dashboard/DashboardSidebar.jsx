import {
  LayoutDashboard,
  Target,
  Users,
  ClipboardList,
  Shield,
  Database,
  Sparkles,
  Plus,
  List,
  Activity,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { formatSiteName } from "./siteLabels";

const ITEMS = [
  { id: "overview", label: "Overview", Icon: LayoutDashboard },
  { id: "recruitment", label: "Recruitment", Icon: Target },
  { id: "patients", label: "Patients", Icon: Users },
  { id: "tasks", label: "Tasks", Icon: ClipboardList },
  { id: "safety", label: "Safety", Icon: Shield },
  { id: "data", label: "Data", Icon: Database },
  { id: "ai-insights", label: "AI Insights", Icon: Sparkles },
];

const RL_MAP = {
  superadmin: "Super Admin",
  admin: "Administrator",
  pi: "Principal Investigator",
  scientist: "Scientist",
  nurse: "Research Nurse",
  deo: "Data Entry Operator",
  monitor: "Trial Monitor",
};

export default function DashboardSidebar({
  tab,
  onTabChange,
  open,
  onClose,
  isSuperadmin,
}) {
  const { user } = useAuth();
  const roleLabel = RL_MAP[user?.role] || user?.role || "User";

  const nav = (
    <nav className="flex flex-col gap-0.5 px-1" aria-label="Dashboard sections">
      {ITEMS.map(({ id, label, Icon }) => {
        const active = tab === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => {
              onTabChange(id);
              onClose?.();
            }}
            aria-current={active ? "page" : undefined}
            className={`ds-focus flex h-10 items-center gap-3 rounded-lg border-0 px-3 text-left text-[13px] font-medium shadow-none transition-colors ${
              active
                ? "bg-portal-primary-mid font-semibold text-white"
                : "bg-transparent text-portal-muted hover:bg-portal-ice hover:text-portal-ink"
            }`}
          >
            <Icon size={18} strokeWidth={active ? 2.1 : 1.7} aria-hidden="true" />
            <span className="truncate">{label}</span>
          </button>
        );
      })}
    </nav>
  );

  const workspace = (
    <div className="mt-4 px-1">
      <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-portal-outline">
        Workspace
      </p>
      <div className="flex flex-col gap-0.5">
        <NavLink
          to="/form-a"
          onClick={() => {
            localStorage.removeItem("current_screening_id");
            localStorage.removeItem("current_enrollment_id");
            localStorage.removeItem("enrollment_locked");
            localStorage.removeItem("enrollment_lock_reason");
            window.dispatchEvent(new Event("storage"));
            onClose?.();
            window.location.href = "/form-a";
          }}
          className="ds-focus flex h-9 items-center gap-2 rounded-lg border-0 bg-transparent px-3 text-[12px] text-portal-muted shadow-none hover:bg-portal-ice hover:text-portal-ink"
        >
          <Plus size={14} aria-hidden="true" /> New Entry
        </NavLink>
        <NavLink
          to="/entries"
          onClick={onClose}
          className="ds-focus flex h-9 items-center gap-2 rounded-lg border-0 bg-transparent px-3 text-[12px] text-portal-muted shadow-none hover:bg-portal-ice hover:text-portal-ink"
        >
          <List size={14} aria-hidden="true" /> View Entries
        </NavLink>
        {isSuperadmin && (
          <>
            <NavLink
              to="/manage-staff"
              onClick={onClose}
              className="ds-focus flex h-9 items-center gap-2 rounded-lg border-0 bg-transparent px-3 text-[12px] text-portal-muted shadow-none hover:bg-portal-ice hover:text-portal-ink"
            >
              <Users size={14} aria-hidden="true" /> Manage Staff
            </NavLink>
            <NavLink
              to="/trial-monitoring"
              onClick={onClose}
              className="ds-focus flex h-9 items-center gap-2 rounded-lg border-0 bg-transparent px-3 text-[12px] text-portal-muted shadow-none hover:bg-portal-ice hover:text-portal-ink"
            >
              <Activity size={14} aria-hidden="true" /> Trial Monitoring
            </NavLink>
          </>
        )}
      </div>
    </div>
  );

  const roleCard = (
    <div className="mt-auto px-2 pb-2">
      <div className="rounded-lg bg-white p-3 shadow-card">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-portal-outline">
            Assigned Role
          </p>
          <span className="rounded bg-portal-secondary-fixed px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-portal-primary">
            Active
          </span>
        </div>
        <p className="text-[12px] font-semibold text-portal-ink">{roleLabel}</p>
        <p className="mt-0.5 text-[11px] text-portal-muted">
          {user?.site ? formatSiteName(user.site) : "PORTAL Trial"}
        </p>
      </div>
    </div>
  );

  const panel = (
    <div className="flex h-full w-60 flex-col bg-portal-surface-low text-portal-ink">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 py-4">
        <p className="mb-2 px-4 text-[11px] font-semibold uppercase tracking-[0.06em] text-portal-outline">
          Navigation Menu
        </p>
        {nav}
        {workspace}
      </div>
      {roleCard}
    </div>
  );

  return (
    <>
      <aside className="hidden shrink-0 lg:flex lg:h-full" aria-label="PORTAL navigation">
        {panel}
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-portal-ink/40"
            aria-label="Close navigation"
            onClick={onClose}
          />
          <div
            className="relative h-full w-[min(240px,86vw)] shadow-portal-elevated"
            role="dialog"
            aria-modal="true"
            aria-label="Dashboard navigation"
          >
            {panel}
          </div>
        </div>
      )}
    </>
  );
}
