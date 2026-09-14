import DashboardSidebar from "./DashboardSidebar";
import DashboardHeader from "./DashboardHeader";

const TAB_LABELS = {
  overview: "Overview",
  recruitment: "Recruitment",
  patients: "Patients",
  tasks: "Tasks",
  safety: "Safety",
  data: "Data",
  "ai-insights": "AI Insights",
};

export default function DashboardShell({
  tab,
  pageTitle,
  onTabChange,
  sidebarOpen,
  onSidebarOpen,
  onSidebarClose,
  isSuperadmin,
  headerProps,
  children,
}) {
  const headerTitle = pageTitle || TAB_LABELS[tab] || "Overview";
  return (
    <div className="ds-root flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-portal-mist text-portal-ink [&_button]:appearance-none [&_button]:cursor-pointer [&_input]:appearance-none">
      <DashboardHeader
        {...headerProps}
        tabLabel={headerTitle}
        onMenu={onSidebarOpen}
      />
      <div className="flex min-h-0 min-w-0 flex-1">
        <DashboardSidebar
          tab={tab}
          onTabChange={onTabChange}
          open={sidebarOpen}
          onClose={onSidebarClose}
          isSuperadmin={isSuperadmin}
        />
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-5 sm:px-6 lg:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
