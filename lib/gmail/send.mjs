import { BUSINESS_GMAIL } from "./oauth.mjs";

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
