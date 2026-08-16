export function SchemaNotice() {
  return (
    <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950">
      <p className="font-semibold">Supabase tables are not created yet</p>
      <p className="mt-1 leading-relaxed">
        The dashboard is querying live tables, so counts stay at zero until the schema exists.
        In the Supabase SQL editor, run{" "}
        <code className="rounded bg-white px-1.5 py-0.5">supabase/migrations/001_admin_schema.sql</code>
        .
      </p>
    </div>
  );
}
