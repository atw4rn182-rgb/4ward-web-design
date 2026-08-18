import type { SupabaseClient } from "@supabase/supabase-js";
import type { QuoteEmailErrorType } from "@/lib/quotes/automation";

type WritableClient = SupabaseClient;

export async function clearQuoteEmailError(client: WritableClient, quoteId: string) {
  await client
    .from("quote_requests")
    .update({
      last_email_error: null,
      last_email_error_at: null,
      last_email_error_type: null,
    })
    .eq("id", quoteId);
}

export async function recordQuoteEmailError(
  client: WritableClient,
  quoteId: string,
  errorType: QuoteEmailErrorType,
  message: string
) {
  await client
    .from("quote_requests")
    .update({
      last_email_error: message.slice(0, 2000),
      last_email_error_at: new Date().toISOString(),
      last_email_error_type: errorType,
    })
    .eq("id", quoteId);
}
