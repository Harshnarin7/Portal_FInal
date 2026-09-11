import { COORDINATING_SITE, PARTICIPATING_SITES } from "./siteLabels";

export default function TrialContextBanner({ enrolled, target, pct }) {
  return (
    <section className="ds-card relative overflow-hidden p-6">
      <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-portal-ice/40 to-transparent" />
      <div className="relative z-10 flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
        <div className="max-w-4xl space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-portal-primary px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-white">
              Active Trial Dashboard
            </span>
            <span className="rounded-full bg-portal-secondary-fixed px-2.5 py-0.5 text-[11px] font-bold text-portal-primary">
              ICMR-funded · Multi-site RCT
            </span>
          </div>
          <h1 className="font-display text-[22px] font-bold leading-tight tracking-tight text-portal-primary sm:text-[28px]">
            Preterm Oxygen for Resuscitation Trial At deLivery{" "}
            <span className="font-display text-[17px] font-semibold tracking-normal text-portal-secondary">(PORTAL)</span>
          </h1>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-portal-muted">
            <span className="inline-flex items-center font-semibold text-portal-secondary">
              Coordinating Site: {COORDINATING_SITE}
            </span>
            <span className="text-portal-outline">•</span>
            <span>Participating Sites: {PARTICIPATING_SITES.join(", ")}</span>
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-2 xl:items-end">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-portal-outline">
            Overall Recruitment Progress
          </p>
          <p className="font-display text-[22px] font-bold tabular-nums leading-none text-portal-primary">
            {enrolled}
            <span className="text-[13px] font-medium text-portal-outline"> / {target}</span>
            <span className="ml-2 font-data-mono text-[18px] font-semibold text-portal-secondary">{pct}%</span>
          </p>
        </div>
      </div>
    </section>
  );
}
