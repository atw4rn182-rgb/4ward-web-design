import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export type ProspectRow = {
  id: string;
  business_name: string;
  city: string | null;
  service_area: string | null;
  industry: string | null;
  website_url: string | null;
  website_host: string | null;
  public_email: string | null;
  secondary_email: string | null;
  research_notes: string | null;
  research_sources: string | null;
  website_opportunities: string | null;
  gbp_observations: string | null;
  researched_at: string | null;
  research_confidence: string | null;
  outreach_eligible: boolean;
  status: string;
  source: string;
  manual_priority: boolean;
  notes: string | null;
  last_activity_at: string;
  queued_at: string | null;
  ready_at: string | null;
  sent_at: string | null;
  interested_at: string | null;
  opted_out_at: string | null;
  bounced_at: string | null;
  failed_at: string | null;
  do_not_contact_at: string | null;
  unsubscribe_token: string;
  created_at: string;
  updated_at: string;
};

export type ProspectActivityRow = {
  id: string;
  prospect_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  note: string | null;
  created_at: string;
};

export type SuppressionRow = {
  id: string;
  prospect_id: string | null;
  business_name: string | null;
  city: string | null;
  email: string | null;
  website_host: string | null;
  reason: string;
  created_at: string;
};

export type OutreachSettingsRow = {
  id: number;
  automation_enabled: boolean;
  weekday_target: number;
  timezone: string;
  send_hour: number;
  send_minute: number;
  weekdays: number[];
  manual_priority: boolean;
  mailing_address: string | null;
  last_run_at: string | null;
  last_run_summary: Record<string, unknown> | null;
  updated_at: string;
};

type QueryError = { code?: string; message?: string } | null;

function missing(error: QueryError) {
  if (!error) return false;
  return /PGRST205|42P01|does not exist|schema cache/i.test(
    `${error.code || ""} ${error.message || ""}`
  );
}

async function adminDb() {
  return createServiceClient() || (await createClient());
}

export async function getProspects() {
  const supabase = await adminDb();
  const { data, error } = await supabase
    .from("prospects")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return { data: [] as ProspectRow[], missing: missing(error) };
  return { data: (data || []) as ProspectRow[], missing: false };
}

export async function getProspect(id: string) {
  const supabase = await adminDb();
  const { data, error } = await supabase
    .from("prospects")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return { data: null as ProspectRow | null, missing: missing(error) };
  return { data: (data as ProspectRow | null) || null, missing: false };
}

export async function getProspectActivity(prospectId: string) {
  const supabase = await adminDb();
  const { data, error } = await supabase
    .from("prospect_activity")
    .select("*")
    .eq("prospect_id", prospectId)
    .order("created_at", { ascending: false });
  if (error) return { data: [] as ProspectActivityRow[], missing: missing(error) };
  return { data: (data || []) as ProspectActivityRow[], missing: false };
}

export async function getOutreachSettings() {
  const supabase = await adminDb();
  const { data, error } = await supabase
    .from("outreach_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) return { data: null as OutreachSettingsRow | null, missing: missing(error) };
  return { data: (data as OutreachSettingsRow | null) || null, missing: false };
}
