import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  BUSINESS_GMAIL,
  decryptSecret,
  encryptSecret,
  exchangeCode,
  gmailEnvReady,
  refreshAccessToken,
  revokeToken,
} from "./oauth.mjs";
import { outreachBlocked, sendAdminTest, sendOutreachMessage, sendSampleMessage } from "./send.mjs";
import {
  earlierLaunchRecipients,
  GMAIL_CONFIG_ERROR,
  isOneTimeOutreach,
  launchRecipient,
  launchSendInput,
  WEBSITE_NOTE,
  classifyLaunchActivity,
} from "../prospects/authorized-launch.mjs";

const STATUS_COLUMNS = "gmail_email,gmail_connected_at";

function missingColumn(error) {
  const text = `${error?.code || ""} ${error?.message || ""}`;
  return /PGRST204|42703|gmail_email|does not exist|schema cache/i.test(text);
}

async function serviceDb() {
  return createServiceClient() || null;
}

export async function gmailConnectionStatus() {
  const configured = gmailEnvReady();
  const supabase = (await serviceDb()) || (await createClient());
  const { data, error } = await supabase.from("outreach_settings").select(STATUS_COLUMNS).eq("id", 1).maybeSingle();
  if (error && missingColumn(error)) {
    return { connected: false, email: "", pendingMigration: true, configured };
  }
  if (error || !data?.gmail_email) {
    return { connected: false, email: "", pendingMigration: false, configured };
  }
  return {
    connected: data.gmail_email === BUSINESS_GMAIL,
    email: data.gmail_email === BUSINESS_GMAIL ? data.gmail_email : "",
    pendingMigration: false,
    configured,
  };
}

export async function saveMailbox(refreshToken) {
  const supabase = await serviceDb();
  if (!supabase) return { ok: false, reason: "storage" };
  const ciphertext = encryptSecret(refreshToken);
  if (!ciphertext) return { ok: false, reason: "unconfigured" };
  const { error } = await supabase
    .from("outreach_settings")
    .update({
      gmail_email: BUSINESS_GMAIL,
      gmail_refresh_token: ciphertext,
      gmail_connected_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error && missingColumn(error)) {
    await revokeToken(refreshToken);
    return { ok: false, reason: "storage" };
  }
  if (error) {
    await revokeToken(refreshToken);
    return { ok: false, reason: "storage" };
  }
  return { ok: true, reason: "connected" };
}

export async function connectFromCode(code) {
  const exchanged = await exchangeCode(code);
  if (!exchanged.ok) return exchanged.reason || "exchange";
  const saved = await saveMailbox(exchanged.refreshToken);
  return saved.reason || "storage";
}

async function readRefreshToken() {
  const supabase = await serviceDb();
  if (!supabase) return "";
  const { data, error } = await supabase
    .from("outreach_settings")
    .select("gmail_email,gmail_refresh_token")
    .eq("id", 1)
    .maybeSingle();
  if (error || data?.gmail_email !== BUSINESS_GMAIL || !data?.gmail_refresh_token) return "";
  return decryptSecret(data.gmail_refresh_token);
}

export async function disconnectMailbox() {
  const refreshToken = await readRefreshToken();
  const supabase = await serviceDb();
  if (!supabase) return { ok: false, error: "The mailbox could not be disconnected." };
  const { error } = await supabase
    .from("outreach_settings")
    .update({ gmail_email: null, gmail_refresh_token: null, gmail_connected_at: null })
    .eq("id", 1);
  if (error && missingColumn(error)) return { ok: true };
  if (error) return { ok: false, error: "The mailbox could not be disconnected." };
  if (refreshToken) await revokeToken(refreshToken);
  return { ok: true };
}

export async function sendSampleOutreach() {
  const supabase = await serviceDb();
  if (!supabase) return { ok: false, error: "Connect Gmail before sending a sample." };
  const { data, error } = await supabase
    .from("outreach_settings")
    .select("gmail_email,gmail_refresh_token,mailing_address")
    .eq("id", 1)
    .maybeSingle();
  if (error || data?.gmail_email !== BUSINESS_GMAIL || !data?.gmail_refresh_token) {
    return { ok: false, error: "Connect Gmail before sending a sample." };
  }
  const mailingAddress = String(data.mailing_address || "").trim();
  if (!mailingAddress) return { ok: false, error: "Save the business mailing address before sending a sample." };
  const refreshToken = decryptSecret(data.gmail_refresh_token);
  if (!refreshToken) return { ok: false, error: "Gmail needs to be connected again. The sample was not sent." };
  const accessToken = await refreshAccessToken(refreshToken);
  if (!accessToken) return { ok: false, error: "Gmail needs to be connected again. The sample was not sent." };
  const sent = await sendSampleMessage({ accessToken, mailingAddress });
  if (!sent.ok) return { ok: false, error: sent.error || "Gmail did not accept the sample." };
  return { ok: true, id: sent.id };
}

const ONE_TIME_NOTE = "One-time test. Exclude from all future outreach.";

function launchResult(email, fields) {
  return { ok: false, id: "", uncertain: false, email, exclusionSaved: true, ...fields };
}

async function prospectByEmail(supabase, email) {
  const { data, error } = await supabase
    .from("prospects")
    .select("id,business_name,city,industry,website_host,public_email,status,sent_at,outreach_eligible,notes")
    .eq("public_email", email)
    .limit(2);
  if (error) return { error: "The prospect list could not be read. The message was not sent." };
  return { rows: data || [] };
}

async function activityFor(supabase, prospectId) {
  const { data, error } = await supabase
    .from("prospect_activity")
    .select("event_type,note")
    .eq("prospect_id", prospectId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return { error: "The send history could not be read. The message was not sent." };
  return { rows: data || [] };
}

async function ensureLaunchProspect(supabase, recipient) {
  const found = await prospectByEmail(supabase, recipient.email);
  if (found.error) return found;
  if (recipient.oneTime) {
    if (found.rows.length !== 1) {
      return { error: "The one-time test prospect was not found as a single existing entry. No duplicate was added." };
    }
    return { row: found.rows[0] };
  }
  if (found.rows.length > 1) return { error: "That business is duplicated. The message was not sent." };
  if (found.rows.length === 1) return { row: found.rows[0] };
  const note = `${WEBSITE_NOTE} Source: ${recipient.sourceUrl}`;
  const { data, error } = await supabase
    .from("prospects")
    .insert({
      business_name: recipient.businessName,
      city: recipient.city,
      industry: recipient.industry,
      public_email: recipient.email,
      notes: note,
      research_notes: `${WEBSITE_NOTE} The published email was on the source page.`,
      research_sources: recipient.sourceUrl,
      status: "queued",
      source: "manual",
      manual_priority: true,
      outreach_eligible: false,
    })
    .select("id,business_name,city,industry,website_host,public_email,status,sent_at,outreach_eligible,notes")
    .single();
  if (error || !data) return { error: "The business could not be added. The message was not sent." };
  return { row: data };
}

async function launchRecord(supabase, recipient) {
  const ensured = await ensureLaunchProspect(supabase, recipient);
  if (ensured.error) return ensured;
  const row = ensured.row;
  const activity = await activityFor(supabase, row.id);
  if (activity.error) return activity;
  const history = classifyLaunchActivity(activity.rows);
  const { data: suppressed } = await supabase.from("prospect_suppressions").select("id").ilike("email", recipient.email).limit(1);
  const { data: named } = await supabase
    .from("prospect_suppressions")
    .select("id")
    .ilike("business_name", recipient.businessName)
    .ilike("city", recipient.city)
    .limit(1);
  const { data: customers } = await supabase.from("customers").select("id").ilike("email", recipient.email).limit(1);
  return {
    row,
    record: {
      businessName: row.business_name,
      city: row.city,
      industry: row.industry,
      websiteHost: row.website_host,
      notes: row.notes,
      status: row.status,
      sentAt: row.sent_at,
      outreachEligible: row.outreach_eligible,
      suppressed: Boolean(suppressed?.length || named?.length),
      existingCustomer: Boolean(customers?.length),
      duplicate: false,
      uncertainRecorded: history.uncertain,
      refusedRecorded: history.refused,
      acceptedId: history.acceptedId,
    },
  };
}

async function recordLaunchEvent(supabase, prospectId, eventType, fromStatus, toStatus, note) {
  await supabase.from("prospect_activity").insert({
    prospect_id: prospectId,
    event_type: eventType,
    from_status: fromStatus,
    to_status: toStatus,
    note,
  });
}

export async function sendAuthorizedLaunchRecipient(recipientKey) {
  const recipient = launchRecipient(recipientKey);
  if (!recipient) return launchResult("", { error: "That recipient is not in the authorized launch." });
  if (!gmailEnvReady()) return launchResult(recipient.email, { error: GMAIL_CONFIG_ERROR });
  const supabase = await serviceDb();
  if (!supabase) return launchResult(recipient.email, { error: "The prospect list could not be read. The message was not sent." });

  for (const earlier of earlierLaunchRecipients(recipient.key)) {
    const prior = await launchRecord(supabase, earlier);
    if (prior.error) return launchResult(recipient.email, { error: prior.error });
    if (!prior.record.acceptedId) {
      return launchResult(recipient.email, { error: "An earlier authorized message has not been accepted. This message was not sent." });
    }
  }

  const current = await launchRecord(supabase, recipient);
  if (current.error) return launchResult(recipient.email, { error: current.error });
  if (current.record.acceptedId) {
    return launchResult(recipient.email, {
      ok: true,
      id: current.record.acceptedId,
      error: "",
      alreadyRecorded: true,
    });
  }
  const input = launchSendInput(recipient, current.record);
  const blocked = outreachBlocked(input);
  if (blocked) return launchResult(recipient.email, { error: blocked, uncertain: Boolean(current.record.uncertainRecorded) });

  const { data: settings, error: settingsError } = await supabase
    .from("outreach_settings")
    .select("gmail_email,gmail_refresh_token,mailing_address")
    .eq("id", 1)
    .maybeSingle();
  if (settingsError || settings?.gmail_email !== BUSINESS_GMAIL || !settings?.gmail_refresh_token) {
    return launchResult(recipient.email, { error: "Connect Gmail before sending. The message was not sent." });
  }
  const mailingAddress = String(settings.mailing_address || "").trim();
  if (!mailingAddress) return launchResult(recipient.email, { error: "Save the business mailing address before sending." });
  const refreshToken = decryptSecret(settings.gmail_refresh_token);
  if (!refreshToken) return launchResult(recipient.email, { error: "Gmail needs to be connected again. The message was not sent." });
  const accessToken = await refreshAccessToken(refreshToken);
  if (!accessToken) return launchResult(recipient.email, { error: "Gmail needs to be connected again. The message was not sent." });

  const claim = crypto.randomUUID();
  await recordLaunchEvent(supabase, current.row.id, "gmail_sending", current.row.status, current.row.status, claim);
  const claimed = await activityFor(supabase, current.row.id);
  const sending = (claimed.rows || []).filter((row) => row.event_type === "gmail_sending");
  const oldestClaim = sending[sending.length - 1];
  if (!oldestClaim || oldestClaim.note !== claim) {
    return launchResult(recipient.email, { error: "This recipient is already being sent.", uncertain: false });
  }

  const sent = await sendOutreachMessage({ accessToken, mailingAddress, ...input });
  if (sent.uncertain) {
    await recordLaunchEvent(
      supabase,
      current.row.id,
      "gmail_uncertain",
      current.row.status,
      current.row.status,
      "Gmail's response was uncertain. The message was not sent again."
    );
    return launchResult(recipient.email, { error: sent.error, uncertain: true });
  }
  if (!sent.ok || !sent.id) {
    await recordLaunchEvent(
      supabase,
      current.row.id,
      "gmail_refused",
      current.row.status,
      current.row.status,
      sent.error || "Gmail did not accept the message. It was not sent again."
    );
    return launchResult(recipient.email, { error: sent.error || "Gmail did not accept the message. It was not sent again." });
  }

  const now = new Date().toISOString();
  const notes = String(current.row.notes || "");
  const nextNotes = recipient.oneTime && !isOneTimeOutreach(notes) ? (notes ? `${notes}\n${ONE_TIME_NOTE}` : ONE_TIME_NOTE) : notes;
  await supabase
    .from("prospects")
    .update({
      status: "sent",
      sent_at: now,
      outreach_eligible: false,
      last_activity_at: now,
      notes: nextNotes,
    })
    .eq("id", current.row.id);
  await recordLaunchEvent(
    supabase,
    current.row.id,
    "gmail_accepted",
    current.row.status,
    "sent",
    `Gmail accepted the message. Message ID: ${sent.id}. Inbox delivery was not checked.`
  );

  let exclusionSaved = true;
  if (recipient.oneTime) {
    const { error: suppressionError } = await supabase.from("prospect_suppressions").insert({
      prospect_id: current.row.id,
      business_name: current.row.business_name,
      city: current.row.city,
      email: recipient.email,
      reason: "one-time-test",
    });
    exclusionSaved = !suppressionError;
  }
  return {
    ok: true,
    id: sent.id,
    uncertain: false,
    email: recipient.email,
    error: exclusionSaved ? "" : "Gmail accepted the message. The permanent exclusion was not saved.",
    exclusionSaved,
  };
}

export async function sendMailboxTest(recipient) {
  const target = String(recipient || "").trim().toLowerCase();
  const refreshToken = await readRefreshToken();
  if (!refreshToken) return { ok: false, error: "Connect Gmail before sending a test." };
  const accessToken = await refreshAccessToken(refreshToken);
  if (!accessToken) return { ok: false, error: "Gmail needs to be connected again. No prospect was contacted." };
  const sent = await sendAdminTest({ accessToken, from: BUSINESS_GMAIL, to: target });
  return sent.ok ? { ok: true, message: `Test sent to ${target}. No prospect was contacted.` } : { ok: false, error: sent.error };
}
