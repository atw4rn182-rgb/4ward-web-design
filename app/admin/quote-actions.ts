"use server";

import { revalidatePath } from "next/cache";
import { getAdminUser } from "@/lib/supabase/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { sendQuotePaymentLinkEmails } from "@/lib/email/static-forms";
import { createQuotePaymentLink } from "@/lib/payments/quote-stripe";
import {
  isQuotePaymentStatus,
  isQuoteStatus,
  type QuotePaymentStatus,
  type QuoteStatus,
} from "@/lib/quotes/statuses";

export type QuoteActionState = {
  ok?: boolean;
  error?: string;
  paymentUrl?: string;
  message?: string;
};

async function adminWriteClient() {
  const user = await getAdminUser();
  if (!user) return { error: "Unauthorized.", client: null as null };

  const client = createServiceClient() || (await createClient());
  return { error: null, client };
}

function parseAmountToCents(raw: string) {
  const cleaned = String(raw || "").replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const dollars = Number.parseFloat(cleaned);
  if (!Number.isFinite(dollars) || dollars < 0) return null;
  return Math.round(dollars * 100);
}

export async function updateQuoteStatusAction(
  quoteId: string,
  status: string
): Promise<QuoteActionState> {
  if (!quoteId || !isQuoteStatus(status)) {
    return { error: "Invalid quote or status." };
  }

  const { error, client } = await adminWriteClient();
  if (error || !client) return { error: error || "Unauthorized." };

  const patch: Record<string, string | null> = { status };
  if (status === "quote_sent") {
    patch.quote_sent_at = new Date().toISOString();
  }
  if (status === "paid") {
    patch.paid_at = new Date().toISOString();
    patch.payment_status = "paid";
  }

  const { error: dbError } = await client
    .from("quote_requests")
    .update(patch)
    .eq("id", quoteId);

  if (dbError) {
    return { error: "Unable to update quote status." };
  }

  revalidatePath("/admin/quotes");
  revalidatePath(`/admin/quotes/${quoteId}`);
  revalidatePath("/admin/dashboard");
  return { ok: true };
}

export async function updateQuoteManagementAction(
  _prev: QuoteActionState,
  formData: FormData
): Promise<QuoteActionState> {
  const quoteId = String(formData.get("quoteId") || "").trim();
  const status = String(formData.get("status") || "").trim();
  const paymentStatus = String(formData.get("paymentStatus") || "").trim();
  const quotedAmount = String(formData.get("quotedAmount") || "").trim();
  const internalNotes = String(formData.get("internalNotes") || "").trim();
  const quantity = String(formData.get("quantity") || "").trim();

  if (!quoteId) return { error: "Quote not found." };
  if (!isQuoteStatus(status)) return { error: "Invalid workflow status." };
  if (!isQuotePaymentStatus(paymentStatus)) return { error: "Invalid payment status." };

  const { error, client } = await adminWriteClient();
  if (error || !client) return { error: error || "Unauthorized." };

  const quotedAmountCents = quotedAmount ? parseAmountToCents(quotedAmount) : null;
  if (quotedAmount && quotedAmountCents === null) {
    return { error: "Enter a valid quoted amount." };
  }

  const { data: existing, error: readError } = await client
    .from("quote_requests")
    .select("status, payment_status, quote_sent_at, paid_at")
    .eq("id", quoteId)
    .maybeSingle();

  if (readError || !existing) {
    return { error: "Quote not found." };
  }

  const patch: Record<string, string | number | null> = {
    status: status as QuoteStatus,
    payment_status: paymentStatus as QuotePaymentStatus,
    internal_notes: internalNotes || null,
    quantity: quantity || null,
    quoted_amount_cents: quotedAmountCents,
  };

  if (status === "quote_sent" && !existing.quote_sent_at) {
    patch.quote_sent_at = new Date().toISOString();
  }
  if (
    (status === "paid" || paymentStatus === "paid") &&
    !existing.paid_at
  ) {
    patch.paid_at = new Date().toISOString();
  }

  const { error: dbError } = await client
    .from("quote_requests")
    .update(patch)
    .eq("id", quoteId);

  if (dbError) {
    return { error: "Unable to save quote changes." };
  }

  revalidatePath("/admin/quotes");
  revalidatePath(`/admin/quotes/${quoteId}`);
  revalidatePath("/admin/dashboard");
  return { ok: true };
}

export async function generateQuotePaymentLinkAction(
  _prev: QuoteActionState,
  formData: FormData
): Promise<QuoteActionState> {
  const quoteId = String(formData.get("quoteId") || "").trim();
  const quotedAmount = String(formData.get("quotedAmount") || "").trim();

  if (!quoteId) return { error: "Quote not found." };

  const { error, client } = await adminWriteClient();
  if (error || !client) return { error: error || "Unauthorized." };

  const { data: quote, error: readError } = await client
    .from("quote_requests")
    .select(
      "id, contact_name, email, company_name, service, quantity, currency, status, payment_status, quoted_amount_cents, stripe_payment_url"
    )
    .eq("id", quoteId)
    .maybeSingle();

  if (readError || !quote) return { error: "Quote not found." };
  if (quote.payment_status === "paid" || quote.status === "paid") {
    return { error: "This quote is already marked paid." };
  }

  const amountFromForm = quotedAmount ? parseAmountToCents(quotedAmount) : null;
  const amountCents = amountFromForm ?? quote.quoted_amount_cents ?? null;

  if (amountCents === null) {
    return { error: "Enter a quoted amount before generating a payment link." };
  }
  if (amountCents < 50) {
    return { error: "Amount must be at least $0.50." };
  }

  let linkResult;
  try {
    linkResult = await createQuotePaymentLink(quote, amountCents);
  } catch (linkError) {
    const message =
      linkError instanceof Error ? linkError.message : "Unable to create payment link.";
    return { error: message };
  }

  const now = new Date().toISOString();
  const patch: Record<string, string | number | null> = {
    quoted_amount_cents: amountCents,
    stripe_payment_link_id: linkResult.paymentLinkId,
    stripe_payment_url: linkResult.paymentUrl,
    payment_status: "pending",
    quote_sent_at: now,
  };

  if (quote.status === "new" || quote.status === "reviewing" || quote.status === "quote_preparing") {
    patch.status = "quote_sent";
  } else if (quote.status !== "paid") {
    patch.status = "awaiting_payment";
  }

  const { error: dbError } = await client
    .from("quote_requests")
    .update(patch)
    .eq("id", quoteId);

  if (dbError) {
    return { error: "Payment link was created in Stripe but could not be saved." };
  }

  revalidatePath("/admin/quotes");
  revalidatePath(`/admin/quotes/${quoteId}`);
  revalidatePath("/admin/dashboard");
  return {
    ok: true,
    paymentUrl: linkResult.paymentUrl,
    message: "Stripe payment link generated.",
  };
}

export async function sendQuotePaymentLinkEmailAction(
  _prev: QuoteActionState,
  formData: FormData
): Promise<QuoteActionState> {
  const quoteId = String(formData.get("quoteId") || "").trim();
  if (!quoteId) return { error: "Quote not found." };

  const { error, client } = await adminWriteClient();
  if (error || !client) return { error: error || "Unauthorized." };

  const { data: quote, error: readError } = await client
    .from("quote_requests")
    .select(
      "id, contact_name, email, company_name, service, quoted_amount_cents, currency, stripe_payment_url, payment_status, status, quote_sent_at"
    )
    .eq("id", quoteId)
    .maybeSingle();

  if (readError || !quote) return { error: "Quote not found." };
  if (!quote.stripe_payment_url) {
    return { error: "Generate a Stripe payment link before sending email." };
  }
  if (quote.payment_status === "paid") {
    return { error: "This quote is already paid." };
  }
  if (!quote.email) {
    return { error: "Quote has no customer email address." };
  }
  if (!quote.quoted_amount_cents) {
    return { error: "Quoted amount is missing." };
  }

  try {
    await sendQuotePaymentLinkEmails({
      contactName: quote.contact_name,
      email: quote.email,
      companyName: quote.company_name,
      service: quote.service,
      amountCents: quote.quoted_amount_cents,
      currency: quote.currency,
      paymentUrl: quote.stripe_payment_url,
    });
  } catch (emailError) {
    const message =
      emailError instanceof Error ? emailError.message : "Unable to send payment link email.";
    return { error: message };
  }

  const patch: Record<string, string> = {};
  if (quote.status !== "paid") {
    patch.status = "awaiting_payment";
  }
  if (!quote.quote_sent_at) {
    patch.quote_sent_at = new Date().toISOString();
  }

  if (Object.keys(patch).length) {
    await client.from("quote_requests").update(patch).eq("id", quoteId);
  }

  revalidatePath("/admin/quotes");
  revalidatePath(`/admin/quotes/${quoteId}`);
  revalidatePath("/admin/dashboard");
  return { ok: true, message: "Payment link email sent to customer." };
}
