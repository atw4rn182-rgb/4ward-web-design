const {
  BUSINESS_INBOX,
  submitWeb3Forms,
  formatOnboardingMessage,
} = require("./lib/web3forms");

const TIER_LABELS = {
  tier1: "Tier 1 — Single-Page Online Brochure ($99/mo)",
  tier2: "Tier 2 — Two-Page Customized Site ($225/mo)",
  tier3: "Tier 3 — Multi-Page Multi-Department (from $399/mo)",
  "buyout-tier1": "Tier 4 Buy-Out — 2 years of Tier 1 ($2,376)",
  "buyout-tier2": "Tier 4 Buy-Out — 2 years of Tier 2 ($5,400)",
  "buyout-tier3": "Tier 4 Buy-Out — 2 years of Tier 3 ($9,576)",
};

const TIER_INCLUDES = {
  tier1: [
    "Full website hosting",
    "Complete website development and creation",
    "One-page brochure site",
    "Local SEO setup",
    "Ongoing maintenance",
    "2 free updates/month · extra updates $99",
  ],
  tier2: [
    "Full website hosting",
    "Complete website development and creation",
    "Two-page customized site + gallery",
    "Quote request form",
    "Local SEO + maintenance",
    "4 free updates/month · extra updates $99",
  ],
  tier3: [
    "Full website hosting",
    "Complete website development and creation",
    "Multi-page multi-department site",
    "Multiple routed quote forms",
    "Local SEO + maintenance",
    "Optional AI chatbot add-on",
    "4 free updates/month · extra updates $99",
  ],
  "buyout-tier1": [
    "Everything in Tier 1 for 2 years upfront",
    "No monthly fee after purchase",
    "Updates after buy-out: $150 each",
  ],
  "buyout-tier2": [
    "Everything in Tier 2 for 2 years upfront",
    "No monthly fee after purchase",
    "Updates after buy-out: $150 each",
  ],
  "buyout-tier3": [
    "Everything in Tier 3 for 2 years upfront",
    "No monthly fee after purchase",
    "Updates after buy-out: $150 each",
  ],
};

const EVENT_SUBJECTS = {
  agreement_signed: "Onboarding: agreement signed",
  tier_selected: "Onboarding: tier / plan selected",
  company_submitted: "Onboarding: company info + logo",
  checkout_started: "Onboarding: Stripe checkout started",
  payment_complete: "Onboarding: Stripe payment complete",
};

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function sanitize(value, max = 1000) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.end();
    return;
  }

  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed" });
  }

  let body;
  try {
    body = await readBody(req);
  } catch {
    return json(res, 400, { error: "Invalid JSON body" });
  }

  const event = sanitize(body.event, 60) || "onboarding_update";
  const fields = {
    companyName: sanitize(body.companyName, 120),
    contactName: sanitize(body.contactName, 120),
    email: sanitize(body.email, 160).toLowerCase(),
    phone: sanitize(body.phone, 40),
    address: sanitize(body.address, 240),
    existingLinks: sanitize(body.existingLinks, 1000),
    signerName: sanitize(body.signerName, 120),
    agreementVersion: sanitize(body.agreementVersion, 80),
    signedAt: sanitize(body.signedAt, 80) || new Date().toISOString(),
    tier: sanitize(body.tier, 40),
    logoName: sanitize(body.logoName, 160),
    logoType: sanitize(body.logoType, 80),
    stripeSessionId: sanitize(body.stripeSessionId, 200),
    stripeCustomerId: sanitize(body.stripeCustomerId, 200),
    paymentStatus: sanitize(body.paymentStatus, 40),
  };

  const logoDataUrl = typeof body.logoDataUrl === "string" ? body.logoDataUrl : "";
  if (logoDataUrl && logoDataUrl.length > 1_800_000) {
    return json(res, 400, { error: "Logo file is too large to email." });
  }

  const tierLabel = TIER_LABELS[fields.tier] || fields.tier || "—";
  const includes = TIER_INCLUDES[fields.tier] || [];
  const subject =
    EVENT_SUBJECTS[event] ||
    `Onboarding update for ${fields.companyName || fields.signerName || "new client"}`;

  const message = formatOnboardingMessage({
    event,
    fields,
    tierLabel,
    includes,
  });

  try {
    await submitWeb3Forms({
      subject: `${subject} → ${BUSINESS_INBOX}`,
      message,
      replyTo: fields.email || undefined,
      email: fields.email || BUSINESS_INBOX,
      logoDataUrl,
      logoName: fields.logoName,
      logoType: fields.logoType,
      extraFields: {
        event,
        company: fields.companyName,
        contact: fields.contactName,
        phone: fields.phone,
        tier: fields.tier,
        signer: fields.signerName,
      },
    });

    return json(res, 200, {
      success: true,
      recipient: BUSINESS_INBOX,
      event,
    });
  } catch (error) {
    console.error("Onboarding notify error:", error);
    return json(res, error.status || 500, {
      error: error.message || "Unable to forward onboarding data by email.",
    });
  }
};
