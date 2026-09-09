export default function DashboardKpiCard({
  label,
  value,
  icon: Icon,
  tone = "default",
  compact = false,
  hint,
  warn = false,
  footer,
}) {
  const iconTone = {
    default: "text-portal-outline",
    primary: "text-portal-secondary",
    teal: "text-portal-secondary",
    success: "text-portal-secondary",
    warning: "text-amber-700",
    danger: warn ? "text-portal-accent" : "text-portal-outline",
    muted: "text-portal-outline",
  };

  const valueTone = warn ? "text-portal-accent" : "text-portal-primary";

  return (
    <div className={`ds-card relative flex flex-col justify-between overflow-hidden ${compact ? "px-3 py-3" : "p-4"}`}>
      {warn && <span className="absolute inset-x-0 top-0 h-1 bg-portal-accent" aria-hidden="true" />}
      <div className="flex items-start justify-between gap-2">
        <p className={`text-[11px] font-semibold uppercase tracking-[0.06em] ${warn ? "text-portal-accent" : "text-portal-outline"}`}>
          {label}
        </p>
        {Icon && (
          <Icon
            size={compact ? 14 : 16}
            strokeWidth={1.75}
            className={iconTone[tone] || iconTone.default}
            aria-hidden="true"
          />
        )}
      </div>
      <p className={`font-display font-bold tabular-nums leading-none tracking-tight ${valueTone} ${compact ? "mt-2 text-[22px]" : "mt-2.5 text-[32px]"}`}>
        {value}
      </p>
      {(hint != null && hint !== "") || footer ? (
        <p className="mt-2 font-data-mono text-[10px] text-portal-outline">
          {footer || hint}
        </p>
      ) : null}
    </div>
  );
}
