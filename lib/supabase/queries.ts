import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { formatMoney, formatWhen, labelStatus } from "@/lib/format";

export { formatMoney, formatWhen, labelStatus };

export type CustomerRow = {
  id: string;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  created_at: string;
};

export type ProjectRow = {
  id: string;
  name: string;
  tier: string | null;
  status: string;
  live_url: string | null;
  created_at: string;
  customers: { company_name: string } | { company_name: string }[] | null;
};

export type PaymentRow = {
  id: string;
  amount_cents: number;
  currency: string;
  status: string;
  payment_type: string;
  description: string | null;
  created_at: string;
  customers: { company_name: string } | { company_name: string }[] | null;
};

export type FileRow = {
  id: string;
  file_name: string;
  kind: string;
  byte_size: number | null;
  created_at: string;
  customers: { company_name: string } | { company_name: string }[] | null;
};

export type NoteRow = {
  id: string;
  body: string;
  created_at: string;
  customers: { company_name: string } | { company_name: string }[] | null;
};

export type QuoteRow = {
  id: string;
  contact_name: string;
  email: string;
  phone: string | null;
  company_name: string | null;
  service: string;
  quantity: string | null;
  message: string;
  status: string;
  payment_status: string;
  quoted_amount_cents: number | null;
  currency: string;
  internal_notes: string | null;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_payment_link_id: string | null;
  stripe_payment_url: string | null;
  stripe_customer_id: string | null;
  quote_sent_at: string | null;
  payment_link_sent_at: string | null;
  paid_at: string | null;
  last_email_error: string | null;
  last_email_error_at: string | null;
  last_email_error_type: string | null;
  created_at: string;
  updated_at: string;
};

export type QuoteEmailFailureRow = {
  id: string;
  contact_name: string;
  email: string;
  company_name: string | null;
  service: string;
  status: string;
  payment_status: string;
  last_email_error: string | null;
  last_email_error_at: string | null;
  last_email_error_type: string | null;
};

export type QuoteEmailEventRow = {
  id: string;
  event_key: string;
  event_type: string;
  status: string;
  error_message: string | null;
  recipient_email: string | null;
  created_at: string;
};

export type OnboardingRow = {
  id: string;
  company_name: string | null;
  contact_name: string | null;
  email: string | null;
  tier: string;
  status: string;
  domain_preferred: string | null;
  domain_second_choice: string | null;
  domain_third_choice: string | null;
  created_at: string;
};

type QueryError = { code?: string; message?: string } | null;

async function adminDb() {
  // Prefer service role so admin pages always see portfolio clients / projects
  // even when the browser session's RLS path returns empty rows.
  return createServiceClient() || (await createClient());
}

function missing(error: QueryError) {
  if (!error) return false;
  return /PGRST205|42P01|does not exist|schema cache/i.test(
    `${error.code || ""} ${error.message || ""}`
  );
}

function result<T>(data: T[] | null, error: QueryError): { data: T[]; missing: boolean } {
  if (error) {
    return { data: [], missing: missing(error) };
  }
  return { data: data || [], missing: false };
}

export function relatedCompany(
  relation: { company_name: string } | { company_name: string }[] | null
) {
  if (!relation) return "—";
  if (Array.isArray(relation)) return relation[0]?.company_name || "—";
  return relation.company_name || "—";
}

export async function getCustomers() {
  const supabase = await adminDb();
  const { data, error } = await supabase
    .from("customers")
    .select("id, company_name, contact_name, email, phone, status, created_at")
    .order("created_at", { ascending: false });
  return result<CustomerRow>(data, error);
}

export async function getProjects() {
  const supabase = await adminDb();
  const { data, error } = await supabase
    .from("website_projects")
    .select("id, name, tier, status, live_url, created_at, customers(company_name)")
    .order("created_at", { ascending: false });
  return result<ProjectRow>(data, error);
}

export async function getPayments() {
  const supabase = await adminDb();
  const { data, error } = await supabase
    .from("payments")
    .select(
      "id, amount_cents, currency, status, payment_type, description, created_at, customers(company_name)"
    )
    .order("created_at", { ascending: false });
  return result<PaymentRow>(data, error);
}

export async function getFiles() {
  const supabase = await adminDb();
  const { data, error } = await supabase
    .from("uploaded_files")
    .select("id, file_name, kind, byte_size, created_at, customers(company_name)")
    .order("created_at", { ascending: false });
  return result<FileRow>(data, error);
}

export async function getNotes() {
  const supabase = await adminDb();
  const primary = await supabase
    .from("notes")
    .select("id, body, created_at, customers(company_name)")
    .order("created_at", { ascending: false })
    .limit(50);
  if (!primary.error) {
    return result<NoteRow>(primary.data, primary.error);
  }

  const fallback = await supabase
    .from("notes")
    .select("id, website, customer_id, customers(company_name)")
    .limit(50);
  if (fallback.error) {
    return result<NoteRow>(null, fallback.error);
  }
  const mapped = (fallback.data || []).map((row: { id: string; website?: string | null; customers: NoteRow["customers"] }) => ({
    id: row.id,
    body: row.website || "",
    created_at: "",
    customers: row.customers,
  }));
  return { data: mapped as NoteRow[], missing: false };
}

export async function getQuoteRequests(statusFilter?: string) {
  const supabase = await adminDb();
  let query = supabase
    .from("quote_requests")
    .select(
      "id, contact_name, email, phone, company_name, service, quantity, message, status, payment_status, quoted_amount_cents, currency, internal_notes, stripe_checkout_session_id, stripe_payment_intent_id, stripe_payment_link_id, stripe_payment_url, stripe_customer_id, quote_sent_at, payment_link_sent_at, paid_at, last_email_error, last_email_error_at, last_email_error_type, created_at, updated_at"
    )
    .order("created_at", { ascending: false });

  if (statusFilter && statusFilter !== "all") {
    query = query.eq("status", statusFilter);
  }

  const { data, error } = await query;
  return result<QuoteRow>(data, error);
}

export async function getQuoteRequest(id: string) {
  const supabase = await adminDb();
  const { data, error } = await supabase
    .from("quote_requests")
    .select(
      "id, contact_name, email, phone, company_name, service, quantity, message, status, payment_status, quoted_amount_cents, currency, internal_notes, stripe_checkout_session_id, stripe_payment_intent_id, stripe_payment_link_id, stripe_payment_url, stripe_customer_id, quote_sent_at, payment_link_sent_at, paid_at, last_email_error, last_email_error_at, last_email_error_type, created_at, updated_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return { data: null as QuoteRow | null, missing: missing(error) };
  }
  return { data: (data as QuoteRow | null) || null, missing: false };
}

export async function getQuoteEmailEvents(quoteId: string) {
  const supabase = await adminDb();
  const { data, error } = await supabase
    .from("email_events")
    .select("id, event_key, event_type, status, error_message, recipient_email, created_at")
    .eq("quote_request_id", quoteId)
    .order("created_at", { ascending: false })
    .limit(10);

  return result<QuoteEmailEventRow>(data, error);
}

export async function getQuotesWithEmailFailures() {
  const supabase = await adminDb();
  const { data, error } = await supabase
    .from("quote_requests")
    .select(
      "id, contact_name, email, company_name, service, status, payment_status, last_email_error, last_email_error_at, last_email_error_type"
    )
    .not("last_email_error", "is", null)
    .order("last_email_error_at", { ascending: false })
    .limit(10);

  return result<QuoteEmailFailureRow>(data, error);
}

export async function getOnboardings() {
  const supabase = await adminDb();
  const { data, error } = await supabase
    .from("onboarding_submissions")
    .select(
      "id, company_name, contact_name, email, tier, status, domain_preferred, domain_second_choice, domain_third_choice, created_at"
    )
    .order("created_at", { ascending: false });
  return result<OnboardingRow>(data, error);
}

export function formatBytes(bytes: number | null) {
  const value = bytes || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
