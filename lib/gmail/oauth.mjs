import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const BUSINESS_GMAIL = "4wardwebdesigns@gmail.com";
export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
export const GMAIL_IDENTITY_SCOPE = "https://www.googleapis.com/auth/userinfo.email";
export const GMAIL_SCOPES = `${GMAIL_SEND_SCOPE} ${GMAIL_IDENTITY_SCOPE}`;
export const GMAIL_REDIRECT_URI = "https://www.4wardwebdesign.com/api/admin/gmail/callback";
export const GMAIL_STATE_COOKIE = "gmail_oauth_state";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

export function gmailRedirectUri() {
  const configured = String(process.env.GMAIL_OAUTH_REDIRECT_URI || "").trim();
  return configured || GMAIL_REDIRECT_URI;
}

export function encryptionKeyBytes() {
  const raw = String(process.env.GMAIL_TOKEN_ENCRYPTION_KEY || "").trim();
  if (!raw) return null;
  const bytes = Buffer.from(raw, "base64url");
  const fallback = bytes.length === 32 ? bytes : Buffer.from(raw, "base64");
  return fallback.length === 32 ? fallback : null;
}

export function gmailEnvReady() {
  return Boolean(
    String(process.env.GOOGLE_OAUTH_CLIENT_ID || "").trim() &&
      String(process.env.GOOGLE_OAUTH_CLIENT_SECRET || "").trim() &&
      encryptionKeyBytes()
  );
}

export function sameHostAsRedirect(requestUrl) {
  try {
    return new URL(requestUrl).host === new URL(gmailRedirectUri()).host;
  } catch {
    return false;
  }
}

export function createOAuthState() {
  const key = encryptionKeyBytes();
  if (!key) return "";
  const nonce = randomBytes(24).toString("base64url");
  const sig = createHmac("sha256", key).update(nonce).digest("base64url");
  return `${nonce}.${sig}`;
}

export function verifyOAuthState(value) {
  const key = encryptionKeyBytes();
  const [nonce, sig] = String(value || "").split(".");
  if (!key || !nonce || !sig || nonce.length < 16) return false;
  const expected = createHmac("sha256", key).update(nonce).digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function statesMatch(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b) && verifyOAuthState(left);
}

export function readCookie(header, name) {
  const parts = String(header || "").split(";").map((part) => part.trim());
  const prefix = `${name}=`;
  const found = parts.find((part) => part.startsWith(prefix));
  if (!found) return "";
  try {
    return decodeURIComponent(found.slice(prefix.length));
  } catch {
    return "";
  }
}

export function encryptSecret(plaintext) {
  const key = encryptionKeyBytes();
  if (!key) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64url");
}

export function decryptSecret(encoded) {
  const key = encryptionKeyBytes();
  if (!key || !encoded) return "";
  const raw = Buffer.from(String(encoded), "base64url");
  if (raw.length < 29) return "";
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

export function authorizationUrl(state) {
  const clientId = String(process.env.GOOGLE_OAUTH_CLIENT_ID || "").trim();
  if (!clientId || !state) return "";
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", gmailRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GMAIL_SCOPES);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "false");
  url.searchParams.set("login_hint", BUSINESS_GMAIL);
  url.searchParams.set("state", state);
  return url.toString();
}

export function testRecipient(admin) {
  const email = String(admin?.email || "").trim().toLowerCase();
  if (!admin?.email_confirmed_at || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || /[\r\n]/.test(email)) {
    return { ok: false, email: "", error: "Confirm the signed-in administrator email before sending a test." };
  }
  return { ok: true, email, error: "" };
}

async function postForm(fetchImpl, url, params, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      signal: controller.signal,
    });
    const text = await response.text();
    let json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = {};
    }
    return { ok: response.ok, status: response.status, json };
  } catch {
    return { ok: false, status: 0, json: {} };
  } finally {
    clearTimeout(timer);
  }
}

export async function exchangeCode(code, fetchImpl = fetch) {
  const clientId = String(process.env.GOOGLE_OAUTH_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.GOOGLE_OAUTH_CLIENT_SECRET || "").trim();
  if (!clientId || !clientSecret || !code) return { ok: false, reason: "unconfigured" };
  const result = await postForm(
    fetchImpl,
    TOKEN_URL,
    new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: gmailRedirectUri(),
      grant_type: "authorization_code",
    })
  );
  const refreshToken = String(result.json.refresh_token || "");
  const accessToken = String(result.json.access_token || "");
  if (!result.ok || !refreshToken || !accessToken) return { ok: false, reason: "exchange" };
  const email = await mailboxAddress(accessToken, fetchImpl);
  if (email !== BUSINESS_GMAIL) {
    await revokeToken(refreshToken, fetchImpl);
    return { ok: false, reason: "wrong-account" };
  }
  return { ok: true, refreshToken, email };
}

export async function refreshAccessToken(refreshToken, fetchImpl = fetch) {
  const clientId = String(process.env.GOOGLE_OAUTH_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.GOOGLE_OAUTH_CLIENT_SECRET || "").trim();
  if (!clientId || !clientSecret || !refreshToken) return "";
  const result = await postForm(
    fetchImpl,
    TOKEN_URL,
    new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    })
  );
  return result.ok ? String(result.json.access_token || "") : "";
}

export async function mailboxAddress(accessToken, fetchImpl = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetchImpl(USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });
    if (!response.ok) return "";
    const json = await response.json();
    if (json.verified_email !== true && json.verified_email !== "true") return "";
    return String(json.email || "").trim().toLowerCase();
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

export async function revokeToken(token, fetchImpl = fetch) {
  if (!token) return;
  await postForm(fetchImpl, REVOKE_URL, new URLSearchParams({ token }));
}
