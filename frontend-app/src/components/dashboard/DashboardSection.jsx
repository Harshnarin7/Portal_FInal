export default function DashboardSection({ icon: Icon, title, sub, right, children, className = "", accent }) {
  return (
    <section
      className={`ds-card p-5 ${className}`}
      style={accent ? { borderTopColor: accent, borderTopWidth: 2 } : undefined}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {Icon && (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-portal-surface-low text-portal-secondary">
              <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
            </div>
          )}
          <div className="min-w-0">
            <h2 className="font-display text-[20px] font-semibold tracking-tight text-portal-primary">{title}</h2>
            {sub && <p className="text-[12px] text-portal-muted">{sub}</p>}
          </div>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}
