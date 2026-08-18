const STATIC_FORMS_URL = "https://api.staticforms.dev/submit";
const STATIC_FORMS_KEY =
  process.env.STATIC_FORMS_API_KEY || "sf_664e6d9a082c77e340ae36b6";
const STATIC_FORMS_CUSTOMER_KEY =
  process.env.STATIC_FORMS_CUSTOMER_API_KEY || STATIC_FORMS_KEY;

const TIER_LABELS = {
  tier1: "Tier 1 — Single Page Website",
  tier2: "Tier 2 — Two-Page Customized Site",
  tier3: "Tier 3 — Multi-Page Multi-Department Website",
  "buyout-tier1": "Tier 4 Buy-Out — 2 years of Tier 1",
  "buyout-tier2": "Tier 4 Buy-Out — 2 years of Tier 2",
  "buyout-tier3": "Tier 4 Buy-Out — 2 years of Tier 3",
};

export function tierLabel(tierId) {
  return TIER_LABELS[tierId] || tierId || "Selected plan";
}

function companyLabel(companyName, contactName, email) {
  const name = String(companyName || contactName || email || "Customer").trim();
  return name || "Customer";
}

async function postStaticForms(form, apiKey = STATIC_FORMS_KEY) {
  form.set("apiKey", apiKey);
  const response = await fetch(STATIC_FORMS_URL, {
    method: "POST",
    body: form,
    headers: { Accept: "application/json" },
  });
  let result = {};
  try {
    result = await response.json();
  } catch {
    result = {};
  }
  if (!response.ok || result.success === false) {
    const message =
      result.message || result.error || `Static Forms failed (${response.status})`;
    throw new Error(message);
  }
  return result;
}

function baseForm({ subject, name, email, message, replyTo, extra = {} }) {
  const form = new FormData();
  form.set("subject", subject);
  form.set("name", name || "4Ward Web Design");
  form.set("email", email || "noreply@4wardwebdesign.com");
  form.set("message", message);
  if (replyTo) form.set("replyTo", replyTo);
  Object.entries(extra).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      form.set(key, String(value));
    }
  });
  return form;
}

/**
 * Customer confirmations rely on Static Forms auto-reply (dashboard) using
 * {{message}} / {{field:customerSubject}} and optional {{field:emailKind}} conditions.
 */
async function sendCustomerConfirmation({
  customerEmail,
  customerName,
  customerSubject,
  body,
  emailKind,
}) {
  if (!customerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
    return { skipped: true, reason: "invalid_email" };
  }
  const form = baseForm({
    subject: `[AUTO-REPLY] ${customerSubject}`,
    name: customerName || customerEmail,
    email: customerEmail,
    message: body,
    extra: {
      emailKind,
      customerSubject,
      confirmationFor: customerEmail,
    },
  });
  try {
    await postStaticForms(form, STATIC_FORMS_CUSTOMER_KEY);
    return { ok: true };
  } catch (error) {
    console.error("Customer confirmation email failed:", error.message);
    return { ok: false, error: error.message };
  }
}

export async function sendQuoteRequestEmails({
  contactName,
  email,
  phone,
  companyName,
  service,
  message,
}) {
  const label = companyLabel(companyName, contactName, email);
  const internalSubject = `[QUOTE REQUEST] — ${label}`;
  const internalBody = [
    "A new custom quote request was submitted.",
    "",
    `Name: ${contactName}`,
    `Email: ${email}`,
    `Phone: ${phone || "—"}`,
    `Company: ${companyName || "—"}`,
    `Service: ${service}`,
    "",
    "Project details:",
    message,
    "",
    "This is a quote request — not a website onboarding / Stripe checkout submission.",
  ].join("\n");

  const internalForm = baseForm({
    subject: internalSubject,
    name: contactName,
    email,
    message: internalBody,
    replyTo: email,
    extra: { requestType: "quote_request", service },
  });
  await postStaticForms(internalForm);

  const customerSubject = "We received your quote request — 4Ward Web Design";
  const customerBody = [
    `Hi ${contactName || "there"},`,
    "",
    "Thank you for contacting 4Ward Web Design. We received your quote request and will review the details shortly.",
    "",
    `Service requested: ${service}`,
    "",
    "What happens next:",
    "• We review your project details and any vendor/product costs.",
    "• We add design and service time to prepare your final price.",
    "• If it's a fit, we'll email you a custom Stripe payment link.",
    "",
    "This message confirms your quote request only — no payment has been charged.",
    "",
    "— 4Ward Web Design, LLC",
    "Carlsbad, New Mexico",
    "https://4wardwebdesign.com",
  ].join("\n");

  await sendCustomerConfirmation({
    customerEmail: email,
    customerName: contactName,
    customerSubject,
    body: customerBody,
    emailKind: "quote_confirmation",
  });
}

export async function sendOnboardingPendingEmails({
  companyName,
  contactName,
  email,
  phone,
  tier,
  companyInformation,
  addOnSummary,
  logoName,
}) {
  const label = companyLabel(companyName, contactName, email);
  const tierText = tierLabel(tier);
  const internalSubject = `[ONBOARDING — PAYMENT PENDING] — ${label} — ${tierText}`;
  const internalBody = [
    "A client completed website onboarding and is proceeding to Stripe Checkout.",
    "",
    `Company: ${companyName || "—"}`,
    `Contact: ${contactName}`,
    `Email: ${email}`,
    `Phone: ${phone || "—"}`,
    `Selected tier: ${tierText} (${tier})`,
    `Add-ons: ${addOnSummary || "None"}`,
    `Logo: ${logoName || "Not uploaded"}`,
    "",
    "Company information:",
    companyInformation || "—",
    "",
    "Status: Payment pending — do not mark as paid until Stripe confirms payment via webhook.",
  ].join("\n");

  const internalForm = baseForm({
    subject: internalSubject,
    name: contactName,
    email,
    message: internalBody,
    replyTo: email,
    extra: {
      requestType: "onboarding_payment_pending",
      tier,
      companyName: companyName || "",
    },
  });
  await postStaticForms(internalForm);

  const customerSubject =
    "Onboarding received — complete payment to start your project";
  const customerBody = [
    `Hi ${contactName || "there"},`,
    "",
    "Thank you for completing onboarding with 4Ward Web Design. We received your company information and plan selection.",
    "",
    `Selected plan: ${tierText}`,
    "",
    "Next step: complete secure payment through Stripe Checkout to activate your project.",
    "If you closed checkout or canceled, your information is saved — you can return to onboarding and finish payment anytime. No charge was made until payment succeeds.",
    "",
    "Once Stripe confirms your payment, you'll receive a separate welcome email and we'll begin your project intake.",
    "",
    "— 4Ward Web Design, LLC",
    "Carlsbad, New Mexico",
    "https://4wardwebdesign.com",
  ].join("\n");

  await sendCustomerConfirmation({
    customerEmail: email,
    customerName: contactName,
    customerSubject,
    body: customerBody,
    emailKind: "onboarding_confirmation",
  });
}

export async function sendPaymentReceivedEmails({
  session,
  companyName,
  contactName,
  email,
  tier,
  amountCents,
  currency,
}) {
  const label = companyLabel(companyName, contactName, email);
  const tierText = tierLabel(tier);
  const amount = ((amountCents || 0) / 100).toFixed(2);
  const cur = String(currency || "usd").toUpperCase();

  const internalSubject = `[PAYMENT RECEIVED] — ${label} — ${tierText}`;
  const internalBody = [
    "Stripe confirmed successful payment for a website onboarding client.",
    "",
    `Company: ${companyName || "—"}`,
    `Contact: ${contactName || "—"}`,
    `Email: ${email || "—"}`,
    `Tier: ${tierText}`,
    `Amount: ${amount} ${cur}`,
    `Checkout session: ${session?.id || "—"}`,
    "",
    "The client record should now be marked paid/active in Supabase.",
  ].join("\n");

  const internalForm = baseForm({
    subject: internalSubject,
    name: contactName || label,
    email: email || "payments@4wardwebdesign.com",
    message: internalBody,
    replyTo: email || undefined,
    extra: {
      requestType: "payment_received",
      tier: tier || "",
      stripeSessionId: session?.id || "",
    },
  });
  await postStaticForms(internalForm);

  const customerSubject = "Welcome to 4Ward Web Design — payment confirmed";
  const customerBody = [
    `Hi ${contactName || "there"},`,
    "",
    "Welcome! Stripe has confirmed your payment and your project with 4Ward Web Design is now active.",
    "",
    `Plan: ${tierText}`,
    `Amount paid today: ${amount} ${cur}`,
    "",
    "What happens next:",
    "• We'll begin project intake and reach out if we need anything else.",
    "• Your Launch Fee and first billing period are now set up through Stripe.",
    "• Keep an eye on your inbox for project updates from our team.",
    "",
    "Thank you for choosing 4Ward Web Design.",
    "",
    "— 4Ward Web Design, LLC",
    "Carlsbad, New Mexico",
    "https://4wardwebdesign.com",
  ].join("\n");

  await sendCustomerConfirmation({
    customerEmail: email,
    customerName: contactName,
    customerSubject,
    body: customerBody,
    emailKind: "payment_welcome",
  });
}

export async function attachLogoToStaticForms({
  contactName,
  email,
  companyName,
  logoBuffer,
  logoName,
  logoMimeType,
}) {
  if (!logoBuffer || !logoName) return;
  const form = baseForm({
    subject: `[ONBOARDING — LOGO] — ${companyLabel(companyName, contactName, email)}`,
    name: contactName || "Client",
    email,
    message: `Logo upload attached for ${companyName || contactName || email}.`,
    replyTo: email,
    extra: { requestType: "onboarding_logo" },
  });
  const blob = new Blob([logoBuffer], {
    type: logoMimeType || "application/octet-stream",
  });
  form.append("logo", blob, logoName);
  await postStaticForms(form);
}
