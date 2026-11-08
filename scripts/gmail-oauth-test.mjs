import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { strict as assert } from "node:assert";
import { OUTREACH_SCHEDULER_ACTIVE } from "../lib/prospects/model.mjs";
import { discoveryProvider } from "../lib/prospects/research.mjs";
import { outreachMailer } from "../lib/prospects/mailer.mjs";
import {
  BUSINESS_GMAIL,
  GMAIL_REDIRECT_URI,
  GMAIL_SCOPES,
  authorizationUrl,
  createOAuthState,
  decryptSecret,
  encryptSecret,
  exchangeCode,
  gmailEnvReady,
  gmailRedirectUri,
  sameHostAsRedirect,
  statesMatch,
  testRecipient,
} from "../lib/gmail/oauth.mjs";
import { buildAdminTestMessage, buildOutreachMessage, buildSampleOutreachMessage, outreachBlocked, SAMPLE_SUBJECT, sendAdminTest, sendOutreachMessage, sendSampleMessage } from "../lib/gmail/send.mjs";

process.env.GOOGLE_OAUTH_CLIENT_ID = "test-client-id";
process.env.GOOGLE_OAUTH_CLIENT_SECRET = "test-client-secret";
process.env.GMAIL_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64url");
delete process.env.GMAIL_OAUTH_REDIRECT_URI;

let passed = 0;
async function check(name, fn) {
  await fn();
  passed += 1;
  console.log(`ok ${passed} ${name}`);
}

await check("production redirect and send-only Gmail scope stay fixed", () => {
  assert.equal(gmailRedirectUri(), GMAIL_REDIRECT_URI);
  assert.equal(gmailRedirectUri(), "https://www.4wardwebdesign.com/api/admin/gmail/callback");
  assert.equal(gmailEnvReady(), true);
  assert.match(GMAIL_SCOPES, /gmail\.send/);
  assert.doesNotMatch(GMAIL_SCOPES, /gmail\.(readonly|modify|compose)|mail\.google\.com/);
  const url = new URL(authorizationUrl(createOAuthState()));
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("client_id"), "test-client-id");
  assert.equal(url.searchParams.get("redirect_uri"), GMAIL_REDIRECT_URI);
  assert.equal(url.searchParams.get("login_hint"), BUSINESS_GMAIL);
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("include_granted_scopes"), "false");
  assert.equal(url.searchParams.has("client_secret"), false);
  assert.equal(sameHostAsRedirect("https://www.4wardwebdesign.com/admin/prospects"), true);
  assert.equal(sameHostAsRedirect("https://4wardwebdesign.com/admin/prospects"), false);
});

await check("tokens encrypt at rest and a changed ciphertext does not decrypt", () => {
  const stored = encryptSecret("refresh-token-value");
  assert.equal(stored.includes("refresh-token-value"), false);
  assert.equal(decryptSecret(stored), "refresh-token-value");
  assert.equal(decryptSecret(`${stored}x`), "");
});

await check("oauth state must match the cookie", () => {
  const state = createOAuthState();
  assert.equal(statesMatch(state, state), true);
  assert.equal(statesMatch(state, `${state}x`), false);
  assert.equal(statesMatch("forged.signature", "forged.signature"), false);
});

await check("a test can go only to the confirmed signed-in administrator", () => {
  assert.equal(testRecipient({ email: "Admin@Example.com", email_confirmed_at: "2026-11-07" }).email, "admin@example.com");
  assert.equal(testRecipient({ email: "admin@example.com", email_confirmed_at: null }).ok, false);
  assert.equal(testRecipient({ email: "bad\nadmin@example.com", email_confirmed_at: "2026-11-07" }).ok, false);
  const message = buildAdminTestMessage({ from: BUSINESS_GMAIL, to: "admin@example.com" });
  const text = Buffer.from(message.raw, "base64url").toString("utf8");
  assert.match(text, /To: admin@example.com/);
  assert.match(text, /No prospect was contacted/);
  assert.equal(buildAdminTestMessage({ from: "other@gmail.com", to: "admin@example.com" }).ok, false);
  assert.equal(buildAdminTestMessage({ from: BUSINESS_GMAIL, to: "owner\r\nBcc: prospect@example.com" }).ok, false);
});

await check("the wrong Google account is not stored", async () => {
  const calls = [];
  const result = await exchangeCode("auth-code", async (url, options) => {
    calls.push(String(url));
    if (String(url).includes("oauth2.googleapis.com/token")) {
      return { ok: true, text: async () => JSON.stringify({ refresh_token: "should-not-remain", access_token: "access" }) };
    }
    if (String(url).includes("userinfo")) {
      return { ok: true, json: async () => ({ email: "someone@gmail.com", verified_email: true }) };
    }
    return { ok: true, text: async () => "" };
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "wrong-account");
  assert.equal(result.refreshToken, undefined);
  assert.ok(calls.some((url) => url.includes("/revoke")));
});

await check("a failed Gmail response does not become a prospect send", async () => {
  let body = "";
  const result = await sendAdminTest({
    accessToken: "access",
    from: BUSINESS_GMAIL,
    to: "admin@example.com",
    fetchImpl: async (_url, options) => {
      body = options.body;
      return { ok: false };
    },
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /No prospect was contacted/);
  assert.equal(body.includes("prospect@"), false);
});

await check("a sample uses the outreach letter and is not retried", async () => {
  const address = "4Ward Web Design\nPO BOX 1161\nCARLSBAD NM 88220";
  const built = buildSampleOutreachMessage(address);
  assert.equal(built.ok, true);
  const text = Buffer.from(built.raw, "base64url").toString("utf8");
  assert.match(text, /From: 4Ward Web Design <4wardwebdesigns@gmail.com>/);
  assert.match(text, /^To: 4wardwebdesigns@gmail.com/m);
  assert.doesNotMatch(text, /^(Bcc|Cc):/m);
  assert.doesNotMatch(text, /verified-sample@example.com/);
  const encoded = text.match(/Subject: =\?UTF-8\?B\?([^?]+)\?=/)[1];
  assert.equal(Buffer.from(encoded, "base64").toString("utf8"), SAMPLE_SUBJECT);
  assert.match(text, /Adam Windhorst/);
  assert.match(text, /Mesa Verde Pottery/);
  assert.match(text, /mesaverdepottery\.example/);
  assert.match(text, /\(970\) 560-2575/);
  assert.match(text, /https:\/\/www\.4wardwebdesign.com/);
  assert.match(text, /4ward-commercial\.mp4/);
  assert.match(text, /Google Business Profile setup and optimization/);
  assert.match(text, /We help businesses across southeastern New Mexico build a professional website and improve their visibility on Google Search and Maps/);
  assert.match(text, /pottery business in Carlsbad/);
  assert.doesNotMatch(text, /4Ward Web Design in Carlsbad/);
  assert.match(text, /Google Search and Maps/);
  assert.match(text, /free, no-obligation consultation/);
  assert.match(text, /PO BOX 1161/);
  assert.match(text, /30% off the first month/);
  assert.match(text, /offer=local#pricing/);
  assert.match(text, /offer=service#pricing/);
  assert.match(text, /offer=both#pricing/);
  assert.match(text, /<a href="https:\/\/www\.4wardwebdesign\.com\/\?offer=both#pricing"/);
  assert.match(text, /ask to be removed/);
  assert.equal(buildSampleOutreachMessage("").ok, false);

  let calls = 0;
  const accepted = await sendSampleMessage({
    accessToken: "access",
    mailingAddress: address,
    fetchImpl: async () => {
      calls += 1;
      return { ok: true, json: async () => ({ id: "18c5sample01" }) };
    },
  });
  assert.equal(calls, 1);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.id, "18c5sample01");

  calls = 0;
  const rejected = await sendSampleMessage({
    accessToken: "access",
    mailingAddress: address,
    fetchImpl: async () => {
      calls += 1;
      return { ok: false };
    },
  });
  assert.equal(calls, 1);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.uncertain, false);

  calls = 0;
  const uncertain = await sendSampleMessage({
    accessToken: "access",
    mailingAddress: address,
    fetchImpl: async () => {
      calls += 1;
      throw new Error("timeout");
    },
  });
  assert.equal(calls, 1);
  assert.equal(uncertain.uncertain, true);

  const blocked = await sendSampleMessage({
    accessToken: "access",
    mailingAddress: " ",
    fetchImpl: async () => {
      throw new Error("should not send");
    },
  });
  assert.equal(blocked.ok, false);

  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let overlapCalls = 0;
  const first = sendSampleMessage({
    accessToken: "access",
    mailingAddress: address,
    fetchImpl: async () => {
      overlapCalls += 1;
      await gate;
      return { ok: true, json: async () => ({ id: "18c5sample02" }) };
    },
  });
  const second = await sendSampleMessage({
    accessToken: "access",
    mailingAddress: address,
    fetchImpl: async () => {
      overlapCalls += 1;
      return { ok: true, json: async () => ({ id: "18c5sample03" }) };
    },
  });
  assert.equal(second.ok, false);
  assert.match(second.error, /already being sent/);
  release();
  assert.equal((await first).id, "18c5sample02");
  assert.equal(overlapCalls, 1);
});

await check("a connected mailbox sends one checked outreach message and does not retry", async () => {
  assert.equal(outreachBlocked({ email: "shop@example.com", suppressed: true }), "This recipient is opted out.");
  assert.equal(outreachBlocked({ email: "shop@example.com", status: "sent" }), "This recipient was already contacted.");
  assert.equal(outreachBlocked({ email: "shop@example.com", existingCustomer: true }), "This email belongs to an existing customer.");
  assert.match(outreachBlocked({ email: "shop@example.com", oneTimeExcluded: true }), /one-time test/);
  assert.equal(outreachBlocked({ email: "shop@example.com", oneTimeExcluded: true, suppressed: true, authorizedOneTime: true }), "This recipient is opted out.");
  assert.equal(outreachBlocked({ email: "shop@example.com", status: "sent", authorizedOneTime: true, explicitlyAuthorized: true }), "This recipient was already contacted.");
  assert.match(outreachBlocked({ email: "shop@example.com", outreachEligible: false }), /not eligible for automated outreach/);
  assert.equal(outreachBlocked({ email: "shop@example.com", outreachEligible: false, oneTimeExcluded: true, authorizedOneTime: true }), "");
  assert.equal(outreachBlocked({ email: "shop@example.com", outreachEligible: false, explicitlyAuthorized: true }), "");
  assert.match(outreachBlocked({ email: "shop@example.com", oneTimeExcluded: true, explicitlyAuthorized: true, outreachEligible: false }), /one-time test/);
  const noted = buildOutreachMessage({
    mailingAddress: "PO BOX 1161",
    to: "office@shop.example",
    businessName: "Shop Example",
    city: "Artesia",
    websiteLine: "No business-owned website found.",
  });
  assert.match(Buffer.from(noted.raw, "base64url").toString("utf8"), /No business-owned website found/);
  assert.doesNotMatch(Buffer.from(noted.raw, "base64url").toString("utf8"), /no website/i);
  const letter = buildOutreachMessage({
    mailingAddress: "4Ward Web Design\nPO BOX 1161\nCARLSBAD NM 88220",
    to: "office@shop.example",
    businessName: "Shop Example",
    city: "Artesia",
    industry: "plumbing",
    websiteHost: "",
  });
  assert.equal(letter.ok, true);
  const decoded = Buffer.from(letter.raw, "base64url").toString("utf8");
  assert.match(decoded, /To: office@shop\.example/);
  assert.match(decoded, /plumbing business in Artesia/);
  assert.match(decoded, /businesses across southeastern New Mexico/);
  assert.doesNotMatch(decoded, /4Ward Web Design in Carlsbad/);
  assert.match(decoded, /PO BOX 1161/);
  assert.match(decoded, /offer=both#pricing/);
  assert.doesNotMatch(decoded, /no website/i);
  let calls = 0;
  const refused = await sendOutreachMessage({
    accessToken: "access",
    mailingAddress: "PO BOX 1161",
    email: "old@shop.example",
    suppressed: true,
    businessName: "Old Shop",
    city: "Artesia",
    fetchImpl: async () => {
      calls += 1;
      return { ok: true, json: async () => ({ id: "should-not-send" }) };
    },
  });
  assert.equal(refused.ok, false);
  assert.equal(calls, 0);
  const accepted = await sendOutreachMessage({
    accessToken: "access",
    mailingAddress: "PO BOX 1161",
    email: "office@shop.example",
    businessName: "Shop Example",
    city: "Artesia",
    fetchImpl: async () => {
      calls += 1;
      return { ok: true, json: async () => ({ id: "18c5outreach1" }) };
    },
  });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.id, "18c5outreach1");
  assert.equal(accepted.uncertain, false);
  const uncertain = await sendOutreachMessage({
    accessToken: "access",
    mailingAddress: "PO BOX 1161",
    email: "other@shop.example",
    businessName: "Other Shop",
    city: "Carlsbad",
    fetchImpl: async () => {
      calls += 1;
      throw new Error("timeout");
    },
  });
  assert.equal(uncertain.uncertain, true);
  assert.equal(calls, 2);
  const configured = outreachMailer({ accessToken: "access", mailingAddress: "PO BOX 1161", fetchImpl: async () => ({ ok: true, json: async () => ({ id: "18c5outreach2" }) }) });
  assert.equal(configured.configured, true);
  assert.equal(configured.schedulerActive, true);
});

await check("weekday sending is on and discovery stays off", async () => {
  assert.equal(OUTREACH_SCHEDULER_ACTIVE, true);
  assert.equal(discoveryProvider().available, false);
  const mailer = outreachMailer();
  assert.equal(mailer.schedulerActive, true);
  await assert.rejects(() => mailer.submit(), /disabled/);
  const action = readFileSync(new URL("../app/admin/gmail-actions.ts", import.meta.url), "utf8");
  const client = readFileSync(new URL("../components/admin/prospects/GmailConnection.tsx", import.meta.url), "utf8");
  const start = readFileSync(new URL("../app/api/admin/gmail/start/route.ts", import.meta.url), "utf8");
  const callback = readFileSync(new URL("../app/api/admin/gmail/callback/route.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../supabase/migrations/014_gmail_oauth.sql", import.meta.url), "utf8");
  const prospects = readFileSync(new URL("../app/admin/prospect-actions.ts", import.meta.url), "utf8");
  const mailbox = readFileSync(new URL("../lib/gmail/mailbox.mjs", import.meta.url), "utf8");
  assert.match(action, /getAdminUser/);
  assert.match(action, /testRecipient\(user\)/);
  assert.match(action, /sendSampleOutreach\(\)/);
  assert.match(action, /Inbox delivery was not checked/);
  assert.doesNotMatch(action, /formData|GOOGLE_OAUTH_CLIENT_SECRET|gmail_refresh_token/);
  assert.match(mailbox, /export async function sendSampleOutreach\(\)/);
  assert.match(mailbox, /mailing_address/);
  assert.match(client, /Send Sample Outreach Email/);
  assert.match(client, /addressSaved/);
  assert.doesNotMatch(client, /name="(?:to|recipient|email)"/);
  assert.match(start, /getAdminUser/);
  assert.match(callback, /getAdminUser/);
  assert.match(callback, /statesMatch/);
  assert.doesNotMatch(client, /GOOGLE_OAUTH_CLIENT_SECRET|GMAIL_TOKEN_ENCRYPTION_KEY|gmail_refresh_token|process\.env/);
  assert.doesNotMatch(prospects, /sendMailboxTest|gmail\.googleapis\.com/);
  assert.match(migration, /gmail_email = '4wardwebdesigns@gmail.com'/);
  assert.match(migration, /revoke select on table public\.outreach_settings from anon, authenticated/);
  assert.doesNotMatch(migration, /alter table public\.customers|alter table public\.payments|alter table public\.consultations|auth\.users/i);
  assert.doesNotMatch(migration, /scheduler_live\s*=\s*true|automation_enabled\s*=\s*true/);
  const cron = readFileSync(new URL("../vercel.json", import.meta.url), "utf8");
  const weekday = readFileSync(new URL("../app/api/outreach/weekday/route.js", import.meta.url), "utf8");
  assert.match(cron, /0 15 \* \* 1-5/);
  assert.match(cron, /0 16 \* \* 1-5/);
  assert.match(weekday, /CRON_SECRET/);
  assert.match(weekday, /Unauthorized/);
});

console.log(`\n${passed} gmail checks passed`);
