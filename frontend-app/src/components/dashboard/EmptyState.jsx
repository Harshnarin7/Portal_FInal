export default function EmptyState({ icon: Icon, title, body }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
      {Icon && (
        <div className="mb-2.5 flex h-9 w-9 items-center justify-center rounded-lg bg-portal-surface-low text-portal-secondary">
          <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
        </div>
      )}
      <p className="font-display text-[15px] font-semibold text-portal-primary">{title}</p>
      {body && <p className="mt-1 max-w-sm text-[12px] leading-relaxed text-portal-muted">{body}</p>}
    </div>
  );
}
