import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  ACTIVITY_LIMIT,
  ACTIVITY_SELECT,
  COUNT_SELECT,
  DETAIL_SELECT,
  FALLBACK_REQUESTS,
  LIST_SELECT,
  PAGE_SIZE,
  QUERY_BUDGET_PER_VIEW,
  SETTINGS_SELECT,
  countProspects,
  searchOr,
  settingsFromRow,
} from "@/lib/prospects/model.mjs";

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
  research_notes?: string | null;
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

function missingFunction(error: QueryError) {
  if (!error) return false;
  return /PGRST202|42883|could not find the function/i.test(`${error.code || ""} ${error.message || ""}`);
}

function missingTable(error: QueryError) {
  if (!error) return false;
  return /PGRST205|42P01|could not find the table|does not exist|schema cache/i.test(
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

async function dashboardFromTables(input: { q: string; status: string; offset: number }) {
  const supabase = await adminDb();
  const from = input.offset;
  const to = input.offset + PAGE_SIZE - 1;
  let listQuery = supabase
    .from("prospects")
    .select(LIST_SELECT, { count: "exact" })
    .order("manual_priority", { ascending: false })
    .order("last_activity_at", { ascending: false })
    .range(from, to);
  if (input.status && input.status !== "all") listQuery = listQuery.eq("status", input.status);
  const filter = searchOr(input.q);
  if (filter) listQuery = listQuery.or(filter);

  const [listResult, countResult, settingsResult] = await Promise.all([
    listQuery,
    supabase.from("prospects").select(COUNT_SELECT).limit(2000),
    supabase.from("outreach_settings").select(SETTINGS_SELECT).eq("id", 1).maybeSingle(),
  ]);
  const tableError = listResult.error || countResult.error || settingsResult.error;
  return {
    data: {
      rows: (listResult.data || []) as ProspectListRow[],
      total: listResult.count || 0,
      counts: { ...emptyCounts, ...countProspects(countResult.data || []) },
      settings: settingsFromRow(settingsResult.data),
      usage: [] as UsageDay[],
      limit: PAGE_SIZE,
      offset: input.offset,
      requests: FALLBACK_REQUESTS,
    },
    missing: missingTable(tableError),
    requests: FALLBACK_REQUESTS,
  };
}

export const getProspectDashboard = cache(async function getProspectDashboard(input: {
  q: string;
  status: string;
  offset: number;
}): Promise<{ data: ProspectDashboard; missing: boolean; requests: number }> {
  const supabase = await adminDb();
  const { data, error } = await supabase.rpc("prospect_dashboard", {
    p_q: input.q,
    p_status: input.status,
    p_limit: PAGE_SIZE,
    p_offset: input.offset,
  });

  if (missingFunction(error)) return dashboardFromTables(input);

  if (error || !data) {
    return {
      data: {
        rows: [],
        total: 0,
        counts: emptyCounts,
        settings: null,
        usage: [],
        limit: PAGE_SIZE,
        offset: input.offset,
        requests: QUERY_BUDGET_PER_VIEW,
      },
      missing: missingTable(error),
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

async function detailFromTables(id: string) {
  const supabase = await adminDb();
  const [prospectResult, activityResult] = await Promise.all([
    supabase.from("prospects").select(DETAIL_SELECT).eq("id", id).maybeSingle(),
    supabase
      .from("prospect_activity")
      .select(ACTIVITY_SELECT)
      .eq("prospect_id", id)
      .order("created_at", { ascending: false })
      .limit(ACTIVITY_LIMIT),
  ]);
  const tableError = prospectResult.error || activityResult.error;
  return {
    prospect: (prospectResult.data as ProspectRow | null) || null,
    activity: (activityResult.data || []) as ProspectActivityRow[],
    missing: missingTable(tableError),
    requests: 2,
  };
}

export const getProspectDetail = cache(async function getProspectDetail(id: string) {
  const supabase = await adminDb();
  const { data, error } = await supabase.rpc("prospect_detail", { p_id: id });
  if (missingFunction(error)) return detailFromTables(id);
  if (error) {
    return {
      prospect: null as ProspectRow | null,
      activity: [] as ProspectActivityRow[],
      missing: missingTable(error),
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
