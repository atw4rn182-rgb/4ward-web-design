type StatCardProps = {
  label: string;
  value: string;
  hint: string;
  trend?: string;
};

export function StatCard({ label, value, hint, trend }: StatCardProps) {
  return (
    <article className="rounded-2xl border border-black/10 bg-paper p-4 shadow-soft sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-muted">{label}</p>
        {trend ? (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
            {trend}
          </span>
        ) : null}
      </div>
      <p className="mt-2 break-words font-display text-2xl font-extrabold tracking-tight text-ink sm:mt-3 sm:text-3xl">
        {value}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-muted">{hint}</p>
    </article>
  );
}
