type StatCardProps = {
  label: string;
  value: string;
  hint: string;
  trend?: string;
};

export function StatCard({ label, value, hint, trend }: StatCardProps) {
  return (
    <article className="rounded-2xl border border-black/10 bg-paper p-5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-muted">{label}</p>
        {trend ? (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
            {trend}
          </span>
        ) : null}
      </div>
      <p className="mt-3 font-display text-3xl font-extrabold tracking-tight text-ink">
        {value}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-muted">{hint}</p>
    </article>
  );
}
