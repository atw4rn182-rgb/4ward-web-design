const {
  BUSINESS_INBOX,
  submitWeb3Forms,
  formatOnboardingMessage,
  CLIENT_COMPLETION_AUTORESPONSE,
} = require("./lib/web3forms");

const TIER_LABELS = {
  tier1: "Tier 1 — Single-Page Online Brochure ($99/mo)",
  tier2: "Tier 2 — Two-Page Customized Site ($225/mo)",
  tier3: "Tier 3 — Multi-Page Multi-Department (from $399/mo)",
  "buyout-tier1": "Tier 4 Buy-Out — 2 years of Tier 1 ($2,376)",
  "buyout-tier2": "Tier 4 Buy-Out — 2 years of Tier 2 ($5,400)",
  "buyout-tier3": "Tier 4 Buy-Out — 2 years of Tier 3 ($9,576)",
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

function sanitize(value, max = 500) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

async function stripeGet(secret, path) {
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${secret}`,
    },
  });
  const data = await response.json();
  if (!response.ok) {
    const message =
      data && data.error && data.error.message
        ? data.error.message
        : "Unable to verify Stripe session";
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return data;
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

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    return json(res, 503, { error: "Stripe is not configured." });
  }

  let body;
  try {
    body = await readBody(req);
  } catch {
    return json(res, 400, { error: "Invalid JSON body" });
  }

  const sessionId = sanitize(body.sessionId, 200);
  if (!sessionId || !sessionId.startsWith("cs_")) {
    return json(res, 400, { error: "Missing or invalid Stripe session id" });
  }

  try {
    const session = await stripeGet(
      secret,
      `/checkout/sessions/${encodeURIComponent(sessionId)}`
    );

    const paid =
      session.payment_status === "paid" ||
      session.status === "complete" ||
      session.payment_status === "no_payment_required";

    if (!paid) {
      return json(res, 402, {
        error: "Payment is not complete yet. Completion email was not sent.",
      });
    }

    const meta = session.metadata || {};
    const clientEmail = (
      session.customer_details?.email ||
      session.customer_email ||
      sanitize(body.email, 160) ||
      meta.contact_email ||
      ""
    )
      .trim()
      .toLowerCase();

    if (!clientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) {
      return json(res, 400, {
        error: "Could not determine client email for confirmation.",
      });
    }

    const fields = {
      companyName: meta.company_name || sanitize(body.companyName, 120),
      contactName: meta.contact_name || sanitize(body.contactName, 120),
      email: clientEmail,
      phone: meta.phone || sanitize(body.phone, 40),
      address: meta.address || sanitize(body.address, 240),
      existingLinks: meta.existing_links || sanitize(body.existingLinks, 1000),
      signerName: meta.signer_name || sanitize(body.signerName, 120),
      agreementVersion: meta.agreement_version || "service-agreement-v1",
      signedAt: meta.agreement_signed_at || new Date().toISOString(),
      tier: meta.tier || sanitize(body.tier, 40),
      logoName: meta.logo_name || sanitize(body.logoName, 160),
      logoType: meta.logo_type || "",
      stripeSessionId: session.id,
      stripeCustomerId:
        typeof session.customer === "string"
          ? session.customer
          : session.customer?.id || "",
      paymentStatus: session.payment_status,
    };

    const tierLabel = TIER_LABELS[fields.tier] || fields.tier || "Selected plan";
    const businessMessage = formatOnboardingMessage({
      event: "payment_complete",
      fields,
      tierLabel,
      includes: [],
    });

    const logoDataUrl = typeof body.logoDataUrl === "string" ? body.logoDataUrl : "";

    await submitWeb3Forms({
      subject: `Onboarding complete + client confirmation — ${fields.companyName || clientEmail}`,
      message: [
        businessMessage,
        "",
        "A completion / next-steps autoresponse was also sent to the client email above.",
      ].join("\n"),
      replyTo: clientEmail,
      email: clientEmail,
      autoresponse: CLIENT_COMPLETION_AUTORESPONSE,
      logoDataUrl,
      logoName: fields.logoName,
      logoType: fields.logoType,
      extraFields: {
        event: "payment_complete",
        company: fields.companyName,
        contact: fields.contactName,
        phone: fields.phone,
        tier: fields.tier,
        stripe_session: session.id,
      },
    });

    return json(res, 200, {
      success: true,
      businessRecipient: BUSINESS_INBOX,
      clientEmail,
      sessionId: session.id,
    });
  } catch (error) {
    console.error("Onboarding complete error:", error);
    return json(res, error.status || 500, {
      error: error.message || "Unable to send completion emails.",
    });
  }
};
