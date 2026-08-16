import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

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

export type OnboardingRow = {
  id: string;
  company_name: string | null;
  contact_name: string | null;
  email: string | null;
  tier: string;
  status: string;
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

export async function getOnboardings() {
  const supabase = await adminDb();
  const { data, error } = await supabase
    .from("onboarding_submissions")
    .select("id, company_name, contact_name, email, tier, status, created_at")
    .order("created_at", { ascending: false });
  return result<OnboardingRow>(data, error);
}

export function formatMoney(cents: number, currency = "usd") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format((cents || 0) / 100);
}

export function formatBytes(bytes: number | null) {
  const value = bytes || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatWhen(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function labelStatus(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
