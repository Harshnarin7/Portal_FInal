function Bone({ className = "" }) {
  return (
    <div
      className={`rounded-lg bg-gradient-to-r from-portal-ice via-white to-portal-ice bg-[length:800px_100%] animate-ds-shimmer ${className}`}
      aria-hidden="true"
    />
  );
}

export default function LoadingSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-live="polite" aria-label="Loading live PORTAL data">
      <p className="sr-only">Loading live PORTAL data…</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="ds-card p-4">
            <Bone className="mb-3 h-3 w-16" />
            <Bone className="h-8 w-12" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="ds-card p-5 lg:col-span-4">
          <Bone className="mb-4 h-4 w-40" />
          <Bone className="mx-auto h-36 w-36 rounded-full" />
        </div>
        <div className="ds-card p-5 lg:col-span-8">
          <Bone className="mb-4 h-4 w-48" />
          <Bone className="h-40 w-full" />
        </div>
      </div>
    </div>
  );
}

export function ChartSkeleton({ height = 180 }) {
  return (
    <div
      className="flex items-center justify-center rounded-lg bg-portal-mist"
      style={{ height }}
      role="status"
      aria-label="Loading chart"
    >
      <Bone className="h-full w-full" />
    </div>
  );
}

export function TableSkeleton({ rows = 6 }) {
  return (
    <div className="space-y-2" role="status" aria-label="Loading records">
      {Array.from({ length: rows }).map((_, i) => (
        <Bone key={i} className="h-11 w-full" />
      ))}
    </div>
  );
}
