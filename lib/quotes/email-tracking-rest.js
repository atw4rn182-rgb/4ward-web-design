import { supabasePatch } from "@/lib/supabase/service-rest";

export async function recordQuoteEmailErrorRest(quoteId, errorType, message) {
  if (!quoteId) return;
  await supabasePatch("quote_requests", `id=eq.${quoteId}`, {
    last_email_error: String(message || "Email delivery failed").slice(0, 2000),
    last_email_error_at: new Date().toISOString(),
    last_email_error_type: errorType,
  });
}

export async function clearQuoteEmailErrorRest(quoteId) {
  if (!quoteId) return;
  await supabasePatch("quote_requests", `id=eq.${quoteId}`, {
    last_email_error: null,
    last_email_error_at: null,
    last_email_error_type: null,
  });
}
