export default function SiteCompareBars({ rows }) {
  const max = Math.max(1, ...rows.map((s) => Math.max(s.sc || 0, s.en || 0)));

  return (
    <div className="flex flex-col gap-4">
      {rows.map((s) => {
        const scW = Math.round(((s.sc || 0) / max) * 100);
        const enW = Math.round(((s.en || 0) / max) * 100);
        const conv = s.sc ? Math.round((s.en / s.sc) * 100) : 0;
        return (
          <div key={s.site}>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-[12px] font-semibold text-portal-ink">{s.label}</span>
              <span className="font-data-mono text-[11px] text-portal-outline">
                {s.en} / {s.sc} · {conv}%
              </span>
            </div>
            <div className="relative h-2.5 overflow-hidden rounded-full bg-portal-ice">
              <div className="absolute inset-y-0 left-0 rounded-full bg-portal-highlight" style={{ width: `${scW}%` }} />
              <div className="absolute inset-y-0 left-0 rounded-full bg-portal-primary" style={{ width: `${enW}%` }} />
            </div>
          </div>
        );
      })}
      <div className="flex items-center gap-4 text-[11px] text-portal-outline">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-portal-highlight" /> Screened
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-portal-primary" /> Enrolled
        </span>
      </div>
    </div>
  );
}
