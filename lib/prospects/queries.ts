import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { QUERY_BUDGET_PER_VIEW } from "@/lib/prospects/model.mjs";

export type ProspectListRow = {
  id: string;
  business_name: string;
  city: string | null;
  service_area: string | null;
  public_email: string | null;
  website_host: string | null;
  status: string;
  last_activity_at: string;
  notes: string | null;
  manual_priority: boolean;
};

export type ProspectRow = ProspectListRow & {
  industry: string | null;
  website_url: string | null;
  secondary_email: string | null;
  research_notes: string | null;
  research_sources: string | null;
  website_opportunities: string | null;
  gbp_observations: string | null;
  researched_at: string | null;
  research_confidence: string | null;
  outreach_eligible: boolean;
  source: string;
  unsubscribe_token: string;
};

export type ProspectActivityRow = {
  id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  note: string | null;
  created_at: string;
};

export type OutreachSettingsRow = {
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
  last_cleanup_at: string | null;
  consecutive_failures: number;
  max_retries: number;
  request_timeout_seconds: number;
  scheduler_live: boolean;
  run_lock_until: string | null;
};

export type UsageDay = {
  day: string;
  writes: number;
  prospects_added: number;
  status_changes: number;
  research_saves: number;
  settings_saves: number;
  cleanups: number;
};

export type ProspectCounts = {
  total: number;
  awaitingResearch: number;
  ready: number;
  emailsSent: number;
  interested: number;
  optedOut: number;
  failed: number;
};

export type ProspectDashboard = {
  rows: ProspectListRow[];
  total: number;
  counts: ProspectCounts;
  settings: OutreachSettingsRow | null;
  usage: UsageDay[];
  limit: number;
  offset: number;
  requests: number;
};

type QueryError = { code?: string; message?: string } | null;

function missing(error: QueryError) {
  if (!error) return false;
  return /PGRST202|PGRST205|42883|42P01|does not exist|schema cache/i.test(
    `${error.code || ""} ${error.message || ""}`
  );
}

async function adminDb() {
  return createServiceClient() || (await createClient());
}

const emptyCounts: ProspectCounts = {
  total: 0,
  awaitingResearch: 0,
  ready: 0,
  emailsSent: 0,
  interested: 0,
  optedOut: 0,
  failed: 0,
};

export const getProspectDashboard = cache(async function getProspectDashboard(input: {
  q: string;
  status: string;
  offset: number;
}): Promise<{ data: ProspectDashboard; missing: boolean; requests: number }> {
  const supabase = await adminDb();
  const { data, error } = await supabase.rpc("prospect_dashboard", {
    p_q: input.q,
    p_status: input.status,
    p_limit: 25,
    p_offset: input.offset,
  });

  if (error || !data) {
    return {
      data: {
        rows: [],
        total: 0,
        counts: emptyCounts,
        settings: null,
        usage: [],
        limit: 25,
        offset: input.offset,
        requests: QUERY_BUDGET_PER_VIEW,
      },
      missing: missing(error),
      requests: QUERY_BUDGET_PER_VIEW,
    };
  }

  const payload = data as ProspectDashboard;
  return {
    data: {
      rows: payload.rows || [],
      total: Number(payload.total || 0),
      counts: { ...emptyCounts, ...(payload.counts || {}) },
      settings: payload.settings || null,
      usage: payload.usage || [],
      limit: Number(payload.limit || 25),
      offset: Number(payload.offset || 0),
      requests: QUERY_BUDGET_PER_VIEW,
    },
    missing: false,
    requests: QUERY_BUDGET_PER_VIEW,
  };
});

export const getProspectDetail = cache(async function getProspectDetail(id: string) {
  const supabase = await adminDb();
  const { data, error } = await supabase.rpc("prospect_detail", { p_id: id });
  if (error) {
    return {
      prospect: null as ProspectRow | null,
      activity: [] as ProspectActivityRow[],
      missing: missing(error),
      requests: QUERY_BUDGET_PER_VIEW,
    };
  }
  const payload = (data || {}) as { prospect?: ProspectRow | null; activity?: ProspectActivityRow[] };
  return {
    prospect: payload.prospect || null,
    activity: payload.activity || [],
    missing: false,
    requests: QUERY_BUDGET_PER_VIEW,
  };
});
