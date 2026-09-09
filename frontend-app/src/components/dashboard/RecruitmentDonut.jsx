export default function RecruitmentDonut({ enrolled, target, pct }) {
  const r = 50;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(Math.max(Number(pct) || 0, 0), 100);
  const dash = (clamped / 100) * c;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
      <div className="relative h-36 w-36 shrink-0">
        <svg className="-rotate-90 h-36 w-36" viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r={r} fill="transparent" stroke="#e7eeff" strokeWidth="12" />
          <circle
            cx="60"
            cy="60"
            r={r}
            fill="transparent"
            stroke="#006398"
            strokeWidth="12"
            strokeDasharray={`${dash} ${c}`}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-[28px] font-bold tabular-nums leading-none text-portal-primary">{clamped}%</span>
          <span className="mt-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-portal-outline">of target</span>
        </div>
      </div>
      <div className="space-y-2 text-center sm:text-left">
        <p className="font-display text-[22px] font-bold tabular-nums text-portal-primary">
          {enrolled}
          <span className="ml-1 text-[13px] font-medium text-portal-outline">enrolled</span>
        </p>
        <p className="font-data-mono text-[12px] text-portal-muted">Target {target}</p>
        <p className="text-[11px] text-portal-outline">Live randomised enrollments only — no projected date</p>
      </div>
    </div>
  );
}
