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
import { buildAdminTestMessage, sendAdminTest } from "../lib/gmail/send.mjs";

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

await check("scheduled outreach and discovery stay off", async () => {
  assert.equal(OUTREACH_SCHEDULER_ACTIVE, false);
  assert.equal(discoveryProvider().available, false);
  const mailer = outreachMailer();
  assert.equal(mailer.schedulerActive, false);
  await assert.rejects(() => mailer.submit(), /disabled/);
  const action = readFileSync(new URL("../app/admin/gmail-actions.ts", import.meta.url), "utf8");
  const client = readFileSync(new URL("../components/admin/prospects/GmailConnection.tsx", import.meta.url), "utf8");
  const start = readFileSync(new URL("../app/api/admin/gmail/start/route.ts", import.meta.url), "utf8");
  const callback = readFileSync(new URL("../app/api/admin/gmail/callback/route.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../supabase/migrations/014_gmail_oauth.sql", import.meta.url), "utf8");
  const prospects = readFileSync(new URL("../app/admin/prospect-actions.ts", import.meta.url), "utf8");
  assert.match(action, /getAdminUser/);
  assert.match(action, /testRecipient\(user\)/);
  assert.doesNotMatch(action, /formData|GOOGLE_OAUTH_CLIENT_SECRET|gmail_refresh_token/);
  assert.match(start, /getAdminUser/);
  assert.match(callback, /getAdminUser/);
  assert.match(callback, /statesMatch/);
  assert.doesNotMatch(client, /GOOGLE_OAUTH_CLIENT_SECRET|GMAIL_TOKEN_ENCRYPTION_KEY|gmail_refresh_token|process\.env/);
  assert.doesNotMatch(prospects, /sendMailboxTest|gmail\.googleapis\.com/);
  assert.match(migration, /gmail_email = '4wardwebdesigns@gmail.com'/);
  assert.match(migration, /revoke select on table public\.outreach_settings from anon, authenticated/);
  assert.doesNotMatch(migration, /alter table public\.customers|alter table public\.payments|alter table public\.consultations|auth\.users/i);
  assert.doesNotMatch(migration, /scheduler_live\s*=\s*true|automation_enabled\s*=\s*true/);
});

console.log(`\n${passed} gmail checks passed`);
