import { PROSPECT_STATUSES, STATUS_LABELS } from "@/lib/prospects/model.mjs";

export function ProspectFilters({ q, status }: { q: string; status: string }) {
  return (
    <form method="get" className="mb-4 grid gap-3 sm:grid-cols-[1fr_12rem_auto]" role="search">
      <label className="block text-sm font-semibold text-ink">
        <span className="sr-only">Search prospects</span>
        <input
          name="q"
          defaultValue={q}
          placeholder="Search name, city, email, website, notes"
          className="min-h-11 w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm"
        />
      </label>
      <label className="block text-sm font-semibold text-ink">
        <span className="sr-only">Status</span>
        <select
          name="status"
          defaultValue={status}
          className="min-h-11 w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="awaiting">Pending</option>
          <option value="contacted">Emails sent</option>
          <option value="opted_out">Not interested or opted out</option>
          <option value="needs_review">Failed or bounced</option>
          {PROSPECT_STATUSES.map((value) => (
            <option key={value} value={value}>
              {STATUS_LABELS[value as keyof typeof STATUS_LABELS]}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        className="inline-flex min-h-11 items-center justify-center rounded-full border border-black/10 bg-white px-4 text-sm font-semibold text-ink"
      >
        Filter
      </button>
    </form>
  );
}
