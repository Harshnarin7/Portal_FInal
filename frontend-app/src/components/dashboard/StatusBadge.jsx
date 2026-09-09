const STYLES = {
  complete: "bg-emerald-50 text-emerald-800",
  pending: "bg-amber-50 text-amber-800",
  overdue: "bg-[#ffdad6] text-portal-accent",
  active: "bg-portal-ice text-portal-secondary",
  discharged: "bg-slate-100 text-slate-600",
  eligible: "bg-emerald-50 text-emerald-800",
  failure: "bg-[#ffdad6] text-portal-accent",
};

const LABELS = {
  complete: "Complete",
  pending: "Pending",
  overdue: "Overdue",
  active: "Active",
  discharged: "Discharged",
  eligible: "Eligible",
  failure: "Failure",
};

export default function StatusBadge({ s, label }) {
  const cls = STYLES[s] || STYLES.pending;
  const text = label || LABELS[s] || LABELS.pending;
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${cls}`}>
      {text}
    </span>
  );
}
