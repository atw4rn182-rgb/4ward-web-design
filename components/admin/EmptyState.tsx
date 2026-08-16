export function EmptyState({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-black/15 bg-paper px-5 py-10 text-center shadow-soft">
      <p className="font-display text-lg font-bold tracking-tight">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">{detail}</p>
    </div>
  );
}
