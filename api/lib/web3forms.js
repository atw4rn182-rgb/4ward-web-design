/**
 * Web3Forms helper — same pattern as Accu-Fab (brother site).
 * Notifications deliver to the email linked to WEB3FORMS_ACCESS_KEY.
 * That key must be registered to exactly: 4wardwebdesigns@gmail.com
 */

const BUSINESS_INBOX = "4wardwebdesigns@gmail.com";

const WEB3FORMS = {
  endpoint: "https://api.web3forms.com/submit",
  accessKey: process.env.WEB3FORMS_ACCESS_KEY || "",
  recipientEmail: BUSINESS_INBOX,
  fromName: "4Ward Web Design Onboarding",
};

function getAccessKey() {
  return WEB3FORMS.accessKey.trim();
}

function assertConfigured() {
  if (!getAccessKey()) {
    const error = new Error(
      "Web3Forms is not configured. Add WEB3FORMS_ACCESS_KEY for 4wardwebdesigns@gmail.com."
    );
    error.status = 503;
    throw error;
  }
}

function dataUrlToFile(dataUrl, fileName, mimeType) {
  if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.includes(",")) {
    return null;
  }
  const base64 = dataUrl.split(",")[1];
  if (!base64) return null;
  const buffer = Buffer.from(base64, "base64");
  const type = mimeType || "application/octet-stream";
  const name = fileName || "logo-upload";
  if (typeof File !== "undefined") {
    return new File([buffer], name, { type });
  }
  return new Blob([buffer], { type });
}

async function submitWeb3Forms({
  subject,
  message,
  replyTo,
  email,
  autoresponse,
  logoDataUrl,
  logoName,
  logoType,
  extraFields,
}) {
  assertConfigured();

  const body = new FormData();
  body.append("access_key", getAccessKey());
  body.append("subject", subject);
  body.append("from_name", WEB3FORMS.fromName);
  body.append("message", message);
  body.append("botcheck", "");

  if (replyTo) body.append("replyto", replyTo);
  if (email) body.append("email", email);
  if (autoresponse) body.append("autoresponse", autoresponse);

  body.append("business_inbox", BUSINESS_INBOX);

  if (extraFields && typeof extraFields === "object") {
    Object.entries(extraFields).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      body.append(key, String(value));
    });
  }

  const file = dataUrlToFile(logoDataUrl, logoName, logoType);
  if (file) {
    const attachmentName = logoName || "logo-upload";
    if (typeof File !== "undefined" && file instanceof File) {
      body.append("attachment", file);
    } else {
      body.append("attachment", file, attachmentName);
    }
  }

  const response = await fetch(WEB3FORMS.endpoint, {
    method: "POST",
    body,
  });

  const text = await response.text();
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    console.error("Web3Forms raw response:", text.slice(0, 300));
    throw new Error("Web3Forms submission failed. Please try again.");
  }

  if (!response.ok || !result.success) {
    throw new Error(result.message || "Unable to send onboarding email.");
  }

  return result;
}

function formatOnboardingMessage({ event, fields, tierLabel, includes }) {
  const lines = [
    `4Ward Web Design — onboarding update`,
    `Business inbox: ${BUSINESS_INBOX}`,
    `Event: ${event}`,
    `Received: ${new Date().toISOString()}`,
    "",
    "—— Client / company ——",
    `Company: ${fields.companyName || "—"}`,
    `Contact: ${fields.contactName || "—"}`,
    `Email: ${fields.email || "—"}`,
    `Phone: ${fields.phone || "—"}`,
    `Address: ${fields.address || "—"}`,
    "",
    "—— Agreement ——",
    `Signer: ${fields.signerName || "—"}`,
    `Agreement version: ${fields.agreementVersion || "—"}`,
    `Signed at: ${fields.signedAt || "—"}`,
    "",
    "—— Selected plan ——",
    `Tier key: ${fields.tier || "—"}`,
    `Tier label: ${tierLabel || "—"}`,
  ];

  if (Array.isArray(includes) && includes.length) {
    lines.push("", "Included:");
    includes.forEach((item) => lines.push(`- ${item}`));
  }

  lines.push(
    "",
    "—— Online presence ——",
    fields.existingLinks || "(none provided)",
    "",
    "—— Logo ——",
    fields.logoName
      ? `Uploaded: ${fields.logoName} (${fields.logoType || "unknown type"})`
      : "No logo uploaded",
    "",
    "—— Stripe ——",
    `Session ID: ${fields.stripeSessionId || "—"}`,
    `Customer ID: ${fields.stripeCustomerId || "—"}`,
    `Payment status: ${fields.paymentStatus || "—"}`
  );

  return lines.join("\n");
}

const CLIENT_COMPLETION_AUTORESPONSE = [
  "Thanks for completing onboarding with 4Ward Web Design, LLC.",
  "",
  "Your agreement, plan details, company information, and payment setup are confirmed.",
  "",
  "What happens next:",
  "1. Our team reviews your materials (logo, company info, and any existing links).",
  "2. We begin building your website for the plan you selected.",
  "3. You’ll receive a progress update and draft preview by email.",
  "4. After your feedback, we finalize, launch, and keep local SEO/maintenance running.",
  "",
  "Questions? Reply to this email or contact 4wardwebdesigns@gmail.com.",
  "",
  "— 4Ward Web Design, LLC · Carlsbad, New Mexico",
].join("\n");

module.exports = {
  BUSINESS_INBOX,
  WEB3FORMS,
  submitWeb3Forms,
  formatOnboardingMessage,
  CLIENT_COMPLETION_AUTORESPONSE,
};
