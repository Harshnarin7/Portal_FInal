export default function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-portal-line/80 bg-white px-3 py-2 text-[11px] shadow-card">
      <p className="mb-1 text-portal-outline">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="font-semibold" style={{ color: p.color || "#006398" }}>
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
}
