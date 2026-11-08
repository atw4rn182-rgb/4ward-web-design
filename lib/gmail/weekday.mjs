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
import { LOOKUP_BLOCKER, READY_FLOOR, deliveryShortfall, discoveryNeed, findingFromReading, readinessBlock } from "../prospects/discovery.mjs";
import { duplicateDecision, emailIdentity, findRecipientMatch, rememberContact } from "../prospects/identity.mjs";
import { skipExplanation, slotsAfterAttempt, UNCERTAIN_HOLD_NOTE } from "../prospects/queue.mjs";
import { discoverCandidates, isDirectoryHost, saveDiscoveredCandidates, websiteHost } from "../prospects/lookup.mjs";
import { readOwnWebsite } from "../prospects/research-run.mjs";
import { inNewMexico } from "../prospects/research.mjs";
import { composeOutreachLetter } from "./send.mjs";
import { BUSINESS_GMAIL, decryptSecret, gmailEnvReady, refreshAccessToken } from "./oauth.mjs";
import { sendOutreachMessage } from "./send.mjs";

const GMAIL_CONFIG_ERROR = "Gmail is not configured. Required variables: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GMAIL_TOKEN_ENCRYPTION_KEY.";

function skipped(reason) {
  return { ok: true, skipped: reason, submitted: 0, results: [] };
}

export async function outreachRequestAllowed(header) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  const presented = String(header || "");
  if (secret && presented === `Bearer ${secret}`) return true;
  const token = presented.startsWith("Bearer ") ? presented.slice(7).trim() : "";
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) return false;
  const supabase = createServiceClient();
  if (!supabase) return false;
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  const { data } = await supabase.from("outreach_settings").select("last_run_summary").eq("id", 1).maybeSingle();
  return data?.last_run_summary?.runTokenHash === hash;
}

export async function runWeekdayOutreach(now = new Date(), options = {}) {
  const deliverNow = options.deliverNow === true;
  if (!OUTREACH_SCHEDULER_ACTIVE) return skipped("scheduler-off");
  const supabase = createServiceClient();
  if (!supabase) return { ok: false, error: "The prospect list could not be read. No message was sent.", results: [] };
  if (!inWeekdaySendWindow(now) && !deliverNow) return reviewWithoutSending(supabase, now);
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
  const discovery = await reviewPending(supabase, discoveryNeed(await countReady(supabase)), deliverNow ? 20000 : 15000);
  const readyBefore = await readyRows(supabase);
  const checked = await recheckReady(supabase, readyBefore, now);
  const { count } = await supabase
    .from("prospects")
    .select("id", { count: "exact", head: true })
    .gte("sent_at", day.start)
    .lt("sent_at", day.end);
  const allowance = weekdayAllowance(count || 0);
  if (!allowance.allowed) {
    await finish(supabase, { submitted: 0, skipped: checked.skipped, failed: 0, reason: "daily-limit", shortfall: deliveryShortfall(count || 0, 0), discovery });
    return skipped("daily-limit");
  }

  const rows = checked.fresh;
  const emails = [...new Set((rows || []).map((row) => String(row.public_email || "").toLowerCase()).filter(Boolean))];
  const names = [...new Set((rows || []).map((row) => String(row.business_name || "").replace(/["%_,*()]/g, "").slice(0, 80)).filter(Boolean))];
  const [{ data: suppressions }, { data: customers }, { data: activity }, { data: namedSuppressions }] = await Promise.all([
    emails.length
      ? supabase.from("prospect_suppressions").select("id,prospect_id,business_name,city,email,website_host,reason").in("email", emails)
      : Promise.resolve({ data: [] }),
    emails.length
      ? supabase.from("customers").select("id,company_name,email,phone,city,website_url").in("email", emails)
      : Promise.resolve({ data: [] }),
    rows?.length
      ? supabase.from("prospect_activity").select("prospect_id,event_type").in("prospect_id", rows.map((row) => row.id)).in("event_type", ["gmail_uncertain", "gmail_sending", "gmail_refused"]).limit(100)
      : Promise.resolve({ data: [] }),
    names.length
      ? supabase.from("prospect_suppressions").select("id,prospect_id,business_name,city,email,website_host,reason").in("business_name", names)
      : Promise.resolve({ data: [] }),
  ]);
  const records = [
    ...(suppressions || []).map((row) => ({ source: "suppression", id: row.prospect_id || "", name: row.business_name, city: row.city, email: row.email, phone: row.reason, websiteHost: row.website_host, reason: row.reason, status: "suppressed" })),
    ...(namedSuppressions || []).map((row) => ({ source: "suppression", id: row.prospect_id || "", name: row.business_name, city: row.city, email: row.email, phone: row.reason, websiteHost: row.website_host, reason: row.reason, status: "suppressed" })),
    ...(customers || []).map((row) => ({ source: "customer", id: row.id, name: row.company_name, email: row.email, phone: row.phone, city: row.city, websiteHost: row.website_url, status: "customer" })),
  ];
  const optedOut = (suppressions || []).filter((row) => !/^queued\b/i.test(String(row.reason || "")));
  const selected = selectWeekdayRecipients(rows, {
    limit: allowance.remaining,
    records,
    suppressedEmails: optedOut.map((row) => row.email),
    customerEmails: (customers || []).map((row) => row.email),
    uncertainIds: (activity || []).filter((row) => row.event_type !== "gmail_refused").map((row) => row.prospect_id),
    refusedIds: (activity || []).filter((row) => row.event_type === "gmail_refused").map((row) => row.prospect_id),
  });

  if (settings.gmail_email !== BUSINESS_GMAIL || !settings.gmail_refresh_token) {
    await finish(supabase, { submitted: 0, skipped: selected.skipped.length + checked.skipped, failed: 0, reason: "gmail-disconnected", shortfall: deliveryShortfall(count || 0, 0), discovery });
    return { ok: false, error: "Connect Gmail before sending. No message was sent.", results: [] };
  }
  const refreshToken = decryptSecret(settings.gmail_refresh_token);
  const accessToken = refreshToken ? await refreshAccessToken(refreshToken) : "";
  if (!accessToken) {
    await finish(supabase, { submitted: 0, skipped: selected.skipped.length + checked.skipped, failed: 0, reason: "gmail-disconnected", shortfall: deliveryShortfall(count || 0, 0), discovery });
    return { ok: false, error: "Gmail needs to be connected again. No message was sent.", results: [] };
  }

  const results = [];
  let sendState = { sent: 0, failed: 0, uncertain: 0, stopped: false };
  for (const row of selected.chosen) {
    if (sendState.stopped) break;
    const sent = await sendOne(supabase, row, { accessToken, mailingAddress });
    results.push(sent);
    sendState = slotsAfterAttempt(sendState, sent);
  }
  const submitted = sendState.sent;
  const failed = sendState.failed;
  const shortfall = sendState.uncertain ? 0 : deliveryShortfall(count || 0, submitted);
  await finish(supabase, {
    submitted,
    skipped: selected.skipped.length + checked.skipped,
    failed,
    reason: sendState.uncertain ? "uncertain-hold" : "",
    shortfall,
    uncertain: sendState.uncertain,
    skippedDetails: selected.skipped.slice(0, 15).map((row) => `${row.id || "prospect"}: ${skipExplanation(row.reason)}`),
    discovery,
  });
  return { ok: true, skipped: "", submitted, failed, shortfall, results };
}

async function readyRows(supabase) {
  const rows = [];
  for (let from = 0; from < 1000; from += 100) {
    const { data } = await supabase
      .from("prospects")
      .select("id,business_name,city,service_area,industry,public_email,website_host,status,sent_at,outreach_eligible,notes,research_notes,research_sources,gbp_observations,researched_at,queued_at,created_at")
      .eq("status", "ready")
      .eq("outreach_eligible", true)
      .order("queued_at", { ascending: true })
      .order("created_at", { ascending: true })
      .range(from, from + 99);
    rows.push(...(data || []));
    if (!data || data.length < 100) break;
  }
  return rows;
}

async function countReady(supabase) {
  const { count } = await supabase
    .from("prospects")
    .select("id", { count: "exact", head: true })
    .eq("status", "ready")
    .eq("outreach_eligible", true);
  return count || 0;
}

async function reviewWithoutSending(supabase, now) {
  const { data: settings } = await supabase
    .from("outreach_settings")
    .select("automation_enabled,last_run_summary")
    .eq("id", 1)
    .maybeSingle();
  if (!settings?.automation_enabled) return skipped("paused");
  const discovery = await reviewPending(supabase, discoveryNeed(await countReady(supabase)), 45000);
  const previous = settings.last_run_summary || {};
  await supabase.from("outreach_settings").update({
    last_run_summary: {
      ...previous,
      lastResearchAt: now.toISOString(),
      discoveryReviewed: discovery.reviewed,
      discoveryPromoted: discovery.promoted,
      discoveryBlocker: discovery.blocker,
      discoveryActive: discovery.discoveryActive === true,
      readyAfterResearch: await countReady(supabase),
    },
  }).eq("id", 1);
  return { ok: true, skipped: "research-only", submitted: 0, results: [], discovery };
}

async function recheckReady(supabase, rows, now) {
  const fresh = [];
  let skipped = 0;
  for (const row of rows || []) {
    const reason = readinessBlock(row, now);
    if (!reason) {
      fresh.push(row);
      continue;
    }
    skipped += 1;
    await supabase.from("prospects").update({
      status: "researching",
      outreach_eligible: false,
      last_activity_at: now.toISOString(),
    }).eq("id", row.id).eq("status", "ready");
    await supabase.from("prospect_activity").insert({
      prospect_id: row.id,
      event_type: "research",
      from_status: "ready",
      to_status: "researching",
      note: `Returned to pending research (${reason}). No email was sent.`.slice(0, 500),
    });
  }
  return { fresh, skipped };
}

function researchAttemptRank(row) {
  const notes = String(row.research_notes || "");
  const tried = /not marked Ready|could not be reached|did not answer|returned an error|redirected too many|was not on the page|location conflicts|did not confirm a New Mexico|disallows automated reading/i.test(notes);
  const url = firstResearchUrl(row);
  if (!url) return 4;
  if (row.city && inNewMexico(row.city, row.service_area) !== true) return 3;
  if (tried) return 2;
  if (isDirectoryHost(websiteHost(url))) return 1;
  return 0;
}

function firstResearchUrl(row) {
  const website = String(row.website_url || "").trim();
  if (/^https?:\/\//i.test(website)) return website;
  const host = String(row.website_host || "").trim();
  if (host) return `https://${host}`;
  const source = String(row.research_sources || "").match(/https?:\/\/[^\s]+/i);
  return source ? source[0] : "";
}

async function holdResearch(supabase, row, reason) {
  const note = String(reason || "The public page could not be checked.").slice(0, 1000);
  if (String(row.research_notes || "") === note) return;
  await supabase.from("prospects").update({
    status: row.status === "researching" ? "researching" : "queued",
    outreach_eligible: false,
    research_notes: note,
    last_activity_at: new Date().toISOString(),
  }).eq("id", row.id).in("status", ["queued", "researching"]);
}

async function reviewPending(supabase, need, budgetMs = 20000) {
  const deadline = Date.now() + Math.max(1000, Number(budgetMs) || 20000);
  const summary = { reviewed: 0, promoted: 0, held: 0, blocker: LOOKUP_BLOCKER, discoveryActive: false };
  if (need > 0) {
    const lookup = await discoverCandidates({ limit: Math.min(need, 20) });
    const saved = lookup.found.length ? await saveDiscoveredCandidates(supabase, lookup.found) : { saved: 0, ready: 0 };
    summary.lookupFound = lookup.found.length;
    summary.lookupRequests = lookup.requests;
    summary.discoveredReady = saved.ready;
    summary.discoveryActive = Boolean(lookup.tested && saved.ready > 0);
    if (!lookup.tested) summary.blocker = lookup.blocker;
  } else {
    summary.blocker = `Ready backlog is at least ${READY_FLOOR}. New business lookup was not run. Saved public pages are still checked.`;
  }
  const { data: pending } = await supabase
    .from("prospects")
    .select("id,business_name,city,service_area,industry,public_email,website_url,website_host,status,notes,research_notes,research_sources,gbp_observations,queued_at")
    .in("status", ["queued", "researching"])
    .order("queued_at", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(300);
  const ordered = [...(pending || [])].sort((left, right) => researchAttemptRank(left) - researchAttemptRank(right)
    || (Date.parse(left.queued_at || 0) || 0) - (Date.parse(right.queued_at || 0) || 0));
  summary.reviewed = ordered.length;
  const emails = [...new Set(ordered.map((row) => String(row.public_email || "").toLowerCase()).filter(Boolean))];
  const [{ data: suppressions }, { data: customers }] = await Promise.all([
    emails.length ? supabase.from("prospect_suppressions").select("email,reason,prospect_id").in("email", emails) : Promise.resolve({ data: [] }),
    emails.length ? supabase.from("customers").select("email").in("email", emails) : Promise.resolve({ data: [] }),
  ]);
  const customerEmails = new Set((customers || []).map((row) => String(row.email || "").toLowerCase()));
  const blockedEmail = (row) => {
    const email = String(row.public_email || "").toLowerCase();
    if (customerEmails.has(email)) return true;
    return (suppressions || []).some((item) => {
      if (String(item.email || "").toLowerCase() !== email) return false;
      if (item.prospect_id === row.id && /^queued\b/i.test(item.reason || "")) return false;
      return true;
    });
  };
  for (const row of ordered) {
    if (Date.now() >= deadline) break;
    const preset = readinessBlock({ ...row, status: "ready", outreach_eligible: true, researched_at: new Date().toISOString() });
    if (preset === "one-time" || preset === "paused" || preset === "ambiguous" || preset === "closed" || preset === "opted-out" || preset === "outside-area" || preset === "already-contacted") {
      await holdResearch(supabase, row, skipExplanation(preset));
      summary.held += 1;
      continue;
    }
    if (blockedEmail(row)) {
      await holdResearch(supabase, row, "This email is suppressed, opted out, or belongs to an existing customer. It was not marked Ready.");
      summary.held += 1;
      continue;
    }
    let decision = null;
    if (!preset || preset === "not-ready" || preset === "stale") {
      decision = { ready: true, reason: row.research_notes, websiteHost: row.website_host || "", websiteUrl: row.website_url || "" };
    } else {
      const url = firstResearchUrl(row);
      if (!url) {
        await holdResearch(supabase, row, "A source URL was not saved. It stays Pending research.");
        summary.held += 1;
        continue;
      }
      const remaining = deadline - Date.now();
      if (remaining < 1000) break;
      const reading = await readOwnWebsite(url, { timeoutMs: Math.min(6000, remaining) });
      const host = reading.host || websiteHost(reading.sourceUrl || url);
      decision = findingFromReading(row, { ...reading, host, ownSite: Boolean(host) && !isDirectoryHost(host) });
    }
    if (!decision?.ready) {
      await holdResearch(supabase, row, decision?.reason);
      summary.held += 1;
      continue;
    }
    const now = new Date().toISOString();
    const { data: updated, error } = await supabase.from("prospects").update({
      status: "ready",
      outreach_eligible: true,
      ready_at: now,
      researched_at: now,
      last_activity_at: now,
      research_notes: String(decision.reason || "").slice(0, 1000),
      city: decision.city || row.city || null,
      website_host: decision.websiteHost || row.website_host || null,
      website_url: decision.websiteUrl || row.website_url || null,
    }).eq("id", row.id).in("status", ["queued", "researching"]).select("id");
    if (error || !updated?.length) continue;
    summary.promoted += 1;
    await supabase.from("prospect_activity").insert({
      prospect_id: row.id,
      event_type: "research",
      from_status: row.status,
      to_status: "ready",
      note: "Verified before the weekday send. No separate approval was required. No email was sent.".slice(0, 500),
    });
  }
  return summary;
}

async function holdDuplicate(supabase, row, message) {
  await supabase.from("prospects").update({
    status: "researching",
    outreach_eligible: false,
    last_activity_at: new Date().toISOString(),
    notes: `${row.notes || ""} ${message}`.trim().slice(0, 1000),
  }).eq("id", row.id).eq("status", "ready");
  await supabase.from("prospect_activity").insert({
    prospect_id: row.id,
    event_type: "research",
    from_status: "ready",
    to_status: "researching",
    note: message.slice(0, 500),
  });
}

async function freshRecipientMatch(supabase, row) {
  const email = emailIdentity(row.public_email).normalized;
  const name = String(row.business_name || "").replace(/["%_,*()]/g, "").slice(0, 80);
  const filters = [email ? `email.ilike.${email}` : "", name ? `business_name.ilike."${name}"` : ""].filter(Boolean);
  const [{ data: suppressions }, { data: customers }, { data: prospects }, { data: history }] = await Promise.all([
    filters.length ? supabase.from("prospect_suppressions").select("id,prospect_id,business_name,city,email,website_host,reason").or(filters.join(",")).limit(20) : Promise.resolve({ data: [] }),
    email ? supabase.from("customers").select("id,company_name,email,phone,city,website_url").ilike("email", email).limit(5) : Promise.resolve({ data: [] }),
    name ? supabase.from("prospects").select("id,business_name,city,public_email,website_host,status,sent_at,notes").ilike("business_name", name).limit(20) : Promise.resolve({ data: [] }),
    supabase.from("prospect_activity").select("event_type").eq("prospect_id", row.id).in("event_type", ["gmail_accepted", "gmail_uncertain", "gmail_sending"]).limit(5),
  ]);
  if ((history || []).some((item) => item.event_type === "gmail_accepted" || item.event_type === "gmail_uncertain" || item.event_type === "gmail_sending")) {
    return { blocked: true, message: "This recipient already has send history. It was not emailed again." };
  }
  const records = [
    ...(suppressions || []).map((item) => ({ source: "suppression", id: item.prospect_id || "", name: item.business_name, city: item.city, email: item.email, phone: item.reason, websiteHost: item.website_host, reason: item.reason, status: "suppressed" })),
    ...(customers || []).map((item) => ({ source: "customer", id: item.id, name: item.company_name, email: item.email, phone: item.phone, city: item.city, websiteHost: item.website_url, status: "customer" })),
    ...(prospects || []).map((item) => ({ source: "prospect", id: item.id, name: item.business_name, city: item.city, email: item.public_email, phone: item.notes, websiteHost: item.website_host, status: item.status, sentAt: item.sent_at })),
  ];
  const match = findRecipientMatch(row, records, { ignoreId: row.id });
  if (match.kind === "new") return { blocked: false, message: "" };
  const decision = duplicateDecision(match);
  return { blocked: true, message: decision.message };
}

async function sendOne(supabase, row, { accessToken, mailingAddress }) {
  const email = emailIdentity(row.public_email).normalized;
  const guard = await freshRecipientMatch(supabase, row);
  if (guard.blocked) {
    await holdDuplicate(supabase, row, guard.message);
    return { ok: false, uncertain: false, duplicate: true, email, id: "", error: guard.message };
  }
  const { data: claimed, error: claimUpdateError } = await supabase.from("prospects").update({
    outreach_eligible: false,
    last_activity_at: new Date().toISOString(),
  }).eq("id", row.id).eq("status", "ready").eq("outreach_eligible", true).select("id");
  if (claimUpdateError || !claimed?.length) {
    return { ok: false, uncertain: false, duplicate: true, email, id: "", error: "Another job already claimed this recipient. No message was sent." };
  }
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
  const letter = composeOutreachLetter({
    mailingAddress,
    to: email,
    businessName: row.business_name,
    industry: row.industry || "",
    city: row.city,
    websiteHost: row.website_host || "",
    researchNotes: row.research_notes || "",
  });
  if (!letter.ok) {
    return { ok: false, uncertain: false, stopped: true, email, id: "", error: letter.error || "The letter could not be saved. No message was sent." };
  }
  const { data: snapshot, error: snapshotError } = await supabase.from("prospect_activity").insert({
    prospect_id: row.id,
    event_type: "email_snapshot",
    from_status: row.status,
    to_status: row.status,
    note: JSON.stringify({
      templateVersion: letter.templateVersion,
      recipient: letter.recipient,
      subject: letter.subject,
      text: letter.text,
      html: letter.html,
    }),
  }).select("id").maybeSingle();
  if (snapshotError || !snapshot?.id) {
    return { ok: false, uncertain: false, stopped: true, email, id: "", error: "The letter snapshot could not be saved. No message was sent." };
  }
  const sent = await sendOutreachMessage({
    accessToken,
    mailingAddress,
    email,
    businessName: row.business_name,
    city: row.city,
    industry: row.industry || "",
    websiteHost: row.website_host || "",
    researchNotes: row.research_notes || "",
    outreachEligible: true,
    status: row.status,
    oneTimeExcluded: isOneTimeOutreach(row.notes),
  });
  if (sent.uncertain) {
    const heldAt = new Date().toISOString();
    await supabase.from("prospects").update({
      status: "researching",
      outreach_eligible: false,
      last_activity_at: heldAt,
      notes: `${row.notes || ""} ${UNCERTAIN_HOLD_NOTE}`.trim().slice(0, 1000),
    }).eq("id", row.id);
    await supabase.from("prospect_activity").insert({
      prospect_id: row.id,
      event_type: "gmail_uncertain",
      from_status: row.status,
      to_status: "researching",
      note: UNCERTAIN_HOLD_NOTE,
    });
    await rememberContact(supabase, { ...row, email, public_email: email }, "uncertain-hold");
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
    note: `Gmail accepted the message. Message ID: ${sent.id}. Snapshot: ${snapshot.id}. Inbox delivery was not checked.`,
  });
  await rememberContact(supabase, { ...row, email, public_email: email }, "contacted");
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
      shortfall: summary.shortfall || 0,
      uncertain: summary.uncertain || 0,
      skippedDetails: summary.skippedDetails || [],
      discoveryReviewed: summary.discovery?.reviewed || 0,
      discoveryPromoted: summary.discovery?.promoted || 0,
      discoveryBlocker: summary.discovery?.blocker || LOOKUP_BLOCKER,
      discoveryActive: summary.discovery?.discoveryActive === true,
      lastResearchAt: summary.discovery ? new Date().toISOString() : summary.lastResearchAt || null,
    },
  }).eq("id", 1);
}
