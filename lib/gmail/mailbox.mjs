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
import { sendAdminTest, sendSampleMessage } from "./send.mjs";

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

export async function sendMailboxTest(recipient) {
  const target = String(recipient || "").trim().toLowerCase();
  const refreshToken = await readRefreshToken();
  if (!refreshToken) return { ok: false, error: "Connect Gmail before sending a test." };
  const accessToken = await refreshAccessToken(refreshToken);
  if (!accessToken) return { ok: false, error: "Gmail needs to be connected again. No prospect was contacted." };
  const sent = await sendAdminTest({ accessToken, from: BUSINESS_GMAIL, to: target });
  return sent.ok ? { ok: true, message: `Test sent to ${target}. No prospect was contacted.` } : { ok: false, error: sent.error };
}
