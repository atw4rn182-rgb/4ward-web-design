/**
 * Single log format for Supabase failures that affect payment records, so they
 * can be found with a search for "[payment-persistence]" in runtime logs.
 * Pass identifiers only (Stripe IDs, internal refs) — never form contents.
 */
export function logPaymentPersistenceFailure(stage, context = {}, error) {
  const details = { stage };
  Object.entries(context).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") details[key] = value;
  });
  if (error) {
    details.operation = error.operation || undefined;
    details.reason = error.reason || error.name || "error";
    if (error.status !== undefined) details.status = error.status;
    if (error.source !== "supabase") {
      details.message = String(error.message || "").slice(0, 200);
    }
  }
  console.error(`[payment-persistence] ${stage}`, JSON.stringify(details));
}
