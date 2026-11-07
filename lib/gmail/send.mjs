import { BUSINESS_GMAIL } from "./oauth.mjs";
import { buildDraft } from "../prospects/research.mjs";

export const SAMPLE_SUBJECT = "TEST — 4Ward Web Design Outreach";
const SAMPLE_GATE_EMAIL = "verified-sample@example.com";

export function buildAdminTestMessage({ from, to }) {
  const sender = String(from || "").trim().toLowerCase();
  const recipient = String(to || "").trim().toLowerCase();
  if (sender !== BUSINESS_GMAIL) return { ok: false, error: "The test can only be sent from the business mailbox." };
  if (!recipient || /[\r\n]/.test(recipient) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    return { ok: false, error: "The test recipient is not the signed-in administrator." };
  }
  const message = [
    `From: 4Ward Web Design <${sender}>`,
    `To: ${recipient}`,
    "Subject: 4Ward mailbox test",
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    "This is a manual mailbox test from the 4Ward admin dashboard.",
    "No prospect was contacted, and automatic outreach is still off.",
    "",
  ].join("\r\n");
  return { ok: true, raw: Buffer.from(message, "utf8").toString("base64url"), error: "" };
}

export async function sendAdminTest({ accessToken, from, to, fetchImpl = fetch }) {
  const built = buildAdminTestMessage({ from, to });
  if (!built.ok) return built;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetchImpl("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: built.raw }),
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, error: "Gmail did not accept the test. No prospect was contacted." };
    return { ok: true, error: "" };
  } catch {
    return { ok: false, error: "Gmail did not accept the test. No prospect was contacted." };
  } finally {
    clearTimeout(timer);
  }
}

export function sampleSendReady({ mailingAddress, accessToken }) {
  if (!String(accessToken || "").trim()) return { ok: false, error: "Connect Gmail before sending a sample." };
  const address = String(mailingAddress || "").trim();
  if (!address) return { ok: false, error: "Save the business mailing address before sending a sample." };
  return { ok: true, mailingAddress: address };
}

export function buildSampleOutreachMessage(mailingAddress) {
  const ready = sampleSendReady({ mailingAddress, accessToken: "present" });
  if (!ready.ok) return { ok: false, error: ready.error };
  const draft = buildDraft({
    qualification: "qualified",
    email: SAMPLE_GATE_EMAIL,
    businessName: "Mesa Verde Pottery",
    industry: "pottery",
    city: "Carlsbad",
    websiteHost: "mesaverdepottery.example",
    mailingAddress: ready.mailingAddress,
  });
  if (!draft?.body || draft.body.includes(SAMPLE_GATE_EMAIL)) {
    return { ok: false, error: "The sample letter could not be prepared." };
  }
  const subject = `=?UTF-8?B?${Buffer.from(SAMPLE_SUBJECT, "utf8").toString("base64")}?=`;
  const message = [
    `From: 4Ward Web Design <${BUSINESS_GMAIL}>`,
    `To: ${BUSINESS_GMAIL}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    draft.body.replace(/\r?\n/g, "\r\n"),
    "",
  ].join("\r\n");
  return { ok: true, raw: Buffer.from(message, "utf8").toString("base64url"), error: "" };
}

let sampleInFlight = false;

export async function sendSampleMessage({ accessToken, mailingAddress, fetchImpl = fetch }) {
  const ready = sampleSendReady({ mailingAddress, accessToken });
  if (!ready.ok) return { ok: false, error: ready.error, uncertain: false };
  if (sampleInFlight) return { ok: false, error: "A sample email is already being sent.", uncertain: false };
  sampleInFlight = true;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const built = buildSampleOutreachMessage(ready.mailingAddress);
    if (!built.ok) return { ok: false, error: built.error, uncertain: false };
    let response;
    try {
      response = await fetchImpl("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw: built.raw }),
        signal: controller.signal,
      });
    } catch {
      return { ok: false, error: "Gmail's response was uncertain. The sample was not sent again.", uncertain: true };
    }
    if (!response?.ok) return { ok: false, error: "Gmail did not accept the sample. It was not sent again.", uncertain: false };
    let payload = {};
    try {
      payload = await response.json();
    } catch {
      return { ok: false, error: "Gmail's response was uncertain. The sample was not sent again.", uncertain: true };
    }
    const id = String(payload?.id || "");
    if (!/^[A-Za-z0-9_-]{6,128}$/.test(id)) {
      return { ok: false, error: "Gmail's response was uncertain. The sample was not sent again.", uncertain: true };
    }
    return { ok: true, id, uncertain: false };
  } finally {
    clearTimeout(timer);
    sampleInFlight = false;
  }
}
