import { BUSINESS_GMAIL } from "./oauth.mjs";
import { buildDraft, OFFER_LINKS } from "../prospects/research.mjs";

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

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);
}

function sampleOfferHtml(body) {
  const urls = new Map(OFFER_LINKS.map(([label, url]) => [url, label]));
  const html = [];
  const paragraph = [];
  const flush = () => {
    if (!paragraph.length) return;
    html.push(`<p>${paragraph.map(escapeHtml).join("<br>")}</p>`);
    paragraph.length = 0;
  };
  body.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (urls.has(trimmed)) {
      flush();
      html.push(
        `<p><a href="${escapeHtml(trimmed)}" style="display:inline-block;background:#172033;color:#ffffff;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:700;">${escapeHtml(urls.get(trimmed))}</a></p>`
      );
      return;
    }
    if (OFFER_LINKS.some(([label]) => trimmed === `${label}:`)) return;
    if (!trimmed) {
      flush();
      return;
    }
    paragraph.push(line);
  });
  flush();
  return `<!DOCTYPE html><html><body style="font-family:Georgia,serif;color:#172033;line-height:1.5;">${html.join("")}</body></html>`;
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
  const boundary = "4ward-sample-offer";
  const message = [
    `From: 4Ward Web Design <${BUSINESS_GMAIL}>`,
    `To: ${BUSINESS_GMAIL}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    draft.body.replace(/\r?\n/g, "\r\n"),
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=utf-8",
    "",
    sampleOfferHtml(draft.body),
    "",
    `--${boundary}--`,
    "",
  ].join("\r\n");
  return { ok: true, raw: Buffer.from(message, "utf8").toString("base64url"), error: "" };
}

const outreachInFlight = new Set();

export function outreachBlocked(input) {
  const email = String(input?.email || "").trim().toLowerCase();
  if (!email || /[\r\n]/.test(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "The recipient email is not valid.";
  if (input?.uncertainRecorded) return "Gmail's response was uncertain. The message was not sent again.";
  if (input?.refusedRecorded) return "Gmail did not accept the message. It was not sent again.";
  if (input?.suppressed || input?.status === "do_not_contact" || input?.status === "not_interested") {
    return "This recipient is opted out.";
  }
  if (input?.existingCustomer) return "This email belongs to an existing customer.";
  if (input?.duplicate || input?.status === "sent" || input?.sentAt) return "This recipient was already contacted.";
  if (input?.oneTimeExcluded && !input?.authorizedOneTime) return "This one-time test is excluded from outreach.";
  const explicit = input?.explicitlyAuthorized === true || input?.authorizedOneTime === true;
  if (input?.outreachEligible === false && !explicit) return "This prospect is not eligible for automated outreach.";
  return "";
}

export function buildOutreachMessage({ mailingAddress, to, businessName, industry, city, websiteHost, websiteLine }) {
  const ready = sampleSendReady({ mailingAddress, accessToken: "present" });
  if (!ready.ok) return { ok: false, error: ready.error };
  const blocked = outreachBlocked({ email: to });
  if (blocked) return { ok: false, error: blocked };
  const draft = buildDraft({
    qualification: "qualified",
    email: to,
    businessName,
    industry: industry || "",
    city,
    websiteHost: websiteHost || "",
    websiteLine: websiteLine || "",
    mailingAddress: ready.mailingAddress,
  });
  if (!draft?.body || !draft.subject) return { ok: false, error: "The outreach letter could not be prepared." };
  const subject = `=?UTF-8?B?${Buffer.from(draft.subject, "utf8").toString("base64")}?=`;
  const boundary = "4ward-outreach-offer";
  const message = [
    `From: 4Ward Web Design <${BUSINESS_GMAIL}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    draft.body.replace(/\r?\n/g, "\r\n"),
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=utf-8",
    "",
    sampleOfferHtml(draft.body),
    "",
    `--${boundary}--`,
    "",
  ].join("\r\n");
  return { ok: true, raw: Buffer.from(message, "utf8").toString("base64url"), subject: draft.subject, error: "" };
}

export async function sendOutreachMessage({ accessToken, mailingAddress, fetchImpl = fetch, ...input }) {
  const ready = sampleSendReady({ mailingAddress, accessToken });
  if (!ready.ok) return { ok: false, error: ready.error, uncertain: false };
  const blocked = outreachBlocked(input);
  if (blocked) return { ok: false, error: blocked, uncertain: false };
  const email = String(input.email || "").trim().toLowerCase();
  if (outreachInFlight.has(email)) return { ok: false, error: "This recipient is already being sent.", uncertain: false };
  outreachInFlight.add(email);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const built = buildOutreachMessage({ ...input, to: email, mailingAddress: ready.mailingAddress });
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
      return { ok: false, error: "Gmail's response was uncertain. The message was not sent again.", uncertain: true };
    }
    if (!response?.ok) return { ok: false, error: "Gmail did not accept the message. It was not sent again.", uncertain: false };
    let payload = {};
    try {
      payload = await response.json();
    } catch {
      return { ok: false, error: "Gmail's response was uncertain. The message was not sent again.", uncertain: true };
    }
    const id = String(payload?.id || "");
    if (!/^[A-Za-z0-9_-]{6,128}$/.test(id)) {
      return { ok: false, error: "Gmail's response was uncertain. The message was not sent again.", uncertain: true };
    }
    return { ok: true, id, uncertain: false };
  } finally {
    clearTimeout(timer);
    outreachInFlight.delete(email);
  }
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
