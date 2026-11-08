import crypto from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import {
  OUTREACH_SCHEDULER_ACTIVE,
  denverDayRange,
  inWeekdaySendWindow,
  sameDenverDay,
} from "../prospects/model.mjs";
import { isOneTimeOutreach } from "../prospects/authorized-launch.mjs";
import { selectWeekdayRecipients, weekdayAllowance } from "../prospects/weekday.mjs";
import { BUSINESS_GMAIL, decryptSecret, gmailEnvReady, refreshAccessToken } from "./oauth.mjs";
import { sendOutreachMessage } from "./send.mjs";

const GMAIL_CONFIG_ERROR = "Gmail is not configured. Required variables: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GMAIL_TOKEN_ENCRYPTION_KEY.";

function skipped(reason) {
  return { ok: true, skipped: reason, submitted: 0, results: [] };
}

export async function runWeekdayOutreach(now = new Date()) {
  if (!OUTREACH_SCHEDULER_ACTIVE) return skipped("scheduler-off");
  if (!inWeekdaySendWindow(now)) return skipped("outside-window");
  const supabase = createServiceClient();
  if (!supabase) return { ok: false, error: "The prospect list could not be read. No message was sent.", results: [] };
  if (!gmailEnvReady()) return { ok: false, error: GMAIL_CONFIG_ERROR, results: [] };

  const { data: settings, error: settingsError } = await supabase
    .from("outreach_settings")
    .select("automation_enabled,mailing_address,gmail_email,gmail_refresh_token,last_run_at")
    .eq("id", 1)
    .maybeSingle();
  if (settingsError || !settings) return { ok: false, error: "Outreach settings could not be read. No message was sent.", results: [] };
  if (!settings.automation_enabled) return skipped("paused");
  const mailingAddress = String(settings.mailing_address || "").trim();
  if (!mailingAddress) return skipped("no-address");
  if (sameDenverDay(settings.last_run_at, now)) return skipped("already-ran");

  const claimedAt = now.toISOString();
  let claim = supabase.from("outreach_settings").update({
    last_run_at: claimedAt,
    last_run_summary: { status: "started", submitted: 0, skipped: 0, failed: 0 },
  }).eq("id", 1);
  claim = settings.last_run_at ? claim.eq("last_run_at", settings.last_run_at) : claim.is("last_run_at", null);
  const { data: claimed, error: claimError } = await claim.select("id");
  if (claimError || !claimed?.length) return skipped("overlap");

  const day = denverDayRange(now);
  const { count } = await supabase
    .from("prospects")
    .select("id", { count: "exact", head: true })
    .gte("sent_at", day.start)
    .lt("sent_at", day.end);
  const allowance = weekdayAllowance(count || 0);
  if (!allowance.allowed) {
    await finish(supabase, { submitted: 0, skipped: 0, failed: 0, reason: "daily-limit" });
    return skipped("daily-limit");
  }

  const { data: rows } = await supabase
    .from("prospects")
    .select("id,business_name,city,industry,public_email,website_host,status,sent_at,outreach_eligible,notes,research_notes")
    .eq("status", "ready")
    .eq("outreach_eligible", true)
    .order("manual_priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(25);
  const emails = [...new Set((rows || []).map((row) => String(row.public_email || "").toLowerCase()).filter(Boolean))];
  const [{ data: suppressions }, { data: customers }, { data: activity }] = await Promise.all([
    emails.length
      ? supabase.from("prospect_suppressions").select("email").in("email", emails)
      : Promise.resolve({ data: [] }),
    emails.length
      ? supabase.from("customers").select("email").in("email", emails)
      : Promise.resolve({ data: [] }),
    rows?.length
      ? supabase.from("prospect_activity").select("prospect_id,event_type").in("prospect_id", rows.map((row) => row.id)).in("event_type", ["gmail_uncertain", "gmail_sending", "gmail_refused"]).limit(100)
      : Promise.resolve({ data: [] }),
  ]);
  const selected = selectWeekdayRecipients(rows, {
    limit: allowance.remaining,
    suppressedEmails: (suppressions || []).map((row) => row.email),
    customerEmails: (customers || []).map((row) => row.email),
    uncertainIds: (activity || []).filter((row) => row.event_type !== "gmail_refused").map((row) => row.prospect_id),
    refusedIds: (activity || []).filter((row) => row.event_type === "gmail_refused").map((row) => row.prospect_id),
  });

  if (settings.gmail_email !== BUSINESS_GMAIL || !settings.gmail_refresh_token) {
    await finish(supabase, { submitted: 0, skipped: selected.skipped.length, failed: 0, reason: "gmail-disconnected" });
    return { ok: false, error: "Connect Gmail before sending. No message was sent.", results: [] };
  }
  const refreshToken = decryptSecret(settings.gmail_refresh_token);
  const accessToken = refreshToken ? await refreshAccessToken(refreshToken) : "";
  if (!accessToken) {
    await finish(supabase, { submitted: 0, skipped: selected.skipped.length, failed: 0, reason: "gmail-disconnected" });
    return { ok: false, error: "Gmail needs to be connected again. No message was sent.", results: [] };
  }

  const results = [];
  let failed = 0;
  for (const row of selected.chosen) {
    const sent = await sendOne(supabase, row, { accessToken, mailingAddress });
    results.push(sent);
    if (sent.uncertain || sent.stopped) break;
    if (!sent.ok) failed += 1;
  }
  const submitted = results.filter((result) => result.ok).length;
  await finish(supabase, { submitted, skipped: selected.skipped.length, failed, reason: "" });
  return { ok: true, skipped: "", submitted, failed, results };
}

async function sendOne(supabase, row, { accessToken, mailingAddress }) {
  const email = String(row.public_email || "").toLowerCase();
  const claim = crypto.randomUUID();
  const { error: claimError } = await supabase.from("prospect_activity").insert({
    prospect_id: row.id,
    event_type: "gmail_sending",
    from_status: row.status,
    to_status: row.status,
    note: claim,
  });
  if (claimError) {
    return { ok: false, uncertain: false, stopped: true, email, id: "", error: "The send could not be recorded. No message was sent." };
  }
  const sent = await sendOutreachMessage({
    accessToken,
    mailingAddress,
    email,
    businessName: row.business_name,
    city: row.city,
    industry: row.industry || "",
    websiteHost: row.website_host || "",
    websiteLine: row.website_host ? "" : "No business-owned website found.",
    outreachEligible: true,
    status: row.status,
    oneTimeExcluded: isOneTimeOutreach(row.notes),
  });
  if (sent.uncertain) {
    await supabase.from("prospect_activity").insert({
      prospect_id: row.id,
      event_type: "gmail_uncertain",
      from_status: row.status,
      to_status: row.status,
      note: "Gmail's response was uncertain. The message was not sent again.",
    });
    return { ok: false, uncertain: true, email, id: "", error: sent.error };
  }
  if (!sent.ok || !sent.id) {
    await supabase.from("prospects").update({ status: "failed", failed_at: new Date().toISOString(), outreach_eligible: false }).eq("id", row.id);
    await supabase.from("prospect_activity").insert({
      prospect_id: row.id,
      event_type: "gmail_refused",
      from_status: row.status,
      to_status: "failed",
      note: sent.error || "Gmail did not accept the message. It was not sent again.",
    });
    return { ok: false, uncertain: false, email, id: "", error: sent.error || "Gmail did not accept the message." };
  }
  const now = new Date().toISOString();
  await supabase.from("prospects").update({ status: "sent", sent_at: now, outreach_eligible: false, last_activity_at: now }).eq("id", row.id);
  await supabase.from("prospect_activity").insert({
    prospect_id: row.id,
    event_type: "gmail_accepted",
    from_status: row.status,
    to_status: "sent",
    note: `Gmail accepted the message. Message ID: ${sent.id}. Inbox delivery was not checked.`,
  });
  return { ok: true, uncertain: false, email, id: sent.id, error: "" };
}

async function finish(supabase, summary) {
  await supabase.from("outreach_settings").update({
    last_run_summary: {
      status: "finished",
      submitted: summary.submitted,
      skipped: summary.skipped,
      failed: summary.failed,
      replies: 0,
      consultations: 0,
      conversions: 0,
      reason: summary.reason || "",
    },
  }).eq("id", 1);
}
