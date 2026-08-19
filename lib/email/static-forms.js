import {
  buildOnboardingWelcomeEmail,
  buildOnboardingWelcomeSubject,
} from "@/lib/email/onboarding-welcome";
import { formatDomainChoices } from "@/lib/onboarding/domains";
import { tierLabel } from "@/lib/pricing/tier-labels";
import {
  buildQuotePaymentLinkCustomerBody,
  buildQuotePaymentLinkInternalBody,
  buildQuotePaymentReceivedCustomerBody,
  buildQuotePaymentReceivedInternalBody,
  buildQuoteRequestCustomerBody,
  buildQuoteRequestInternalBody,
  quotePaymentLinkCustomerSubject,
  quotePaymentLinkInternalSubject,
  quotePaymentReceivedCustomerSubject,
  quotePaymentReceivedInternalSubject,
  quoteRequestCustomerSubject,
  quoteRequestInternalSubject,
} from "@/lib/email/quote-emails";

const STATIC_FORMS_URL = "https://api.staticforms.dev/submit";

function staticFormsKey(kind = "internal") {
  const key =
    kind === "customer"
      ? process.env.STATIC_FORMS_CUSTOMER_API_KEY || process.env.STATIC_FORMS_API_KEY
      : process.env.STATIC_FORMS_API_KEY;
  if (!key) {
    throw new Error("STATIC_FORMS_API_KEY is not configured");
  }
  return key;
}

export { tierLabel };

function companyLabel(companyName, contactName, email) {
  const name = String(companyName || contactName || email || "Customer").trim();
  return name || "Customer";
}

async function postStaticForms(form, apiKey) {
  form.set("apiKey", apiKey || staticFormsKey());
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
    await postStaticForms(form, staticFormsKey("customer"));
    return { ok: true };
  } catch (error) {
    console.error("Customer confirmation email failed:", error.message);
    return { ok: false, error: error.message };
  }
}

export async function sendQuoteRequestEmails({
  quoteId,
  contactName,
  email,
  phone,
  companyName,
  service,
  quantity,
  message,
}) {
  const internalSubject = quoteRequestInternalSubject({
    companyName,
    contactName,
    email,
    service,
  });
  const internalBody = buildQuoteRequestInternalBody({
    quoteId,
    contactName,
    email,
    phone,
    companyName,
    service,
    quantity,
    message,
  });

  const internalForm = baseForm({
    subject: internalSubject,
    name: contactName,
    email,
    message: internalBody,
    replyTo: email,
    extra: {
      requestType: "quote_request",
      service,
      quoteRequestId: quoteId || "",
    },
  });
  await postStaticForms(internalForm);

  const customerSubject = quoteRequestCustomerSubject({ service });
  const customerBody = buildQuoteRequestCustomerBody({
    contactName,
    email,
    phone,
    companyName,
    service,
    quantity,
    message,
    quoteId,
  });

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
  domainPreferred,
  domainSecondChoice,
  domainThirdChoice,
}) {
  const label = companyLabel(companyName, contactName, email);
  const tierText = tierLabel(tier);
  const domainBlock = formatDomainChoices(
    domainPreferred,
    domainSecondChoice,
    domainThirdChoice
  );
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
    "Domain preferences:",
    domainBlock,
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
  domainPreferred,
  domainSecondChoice,
  domainThirdChoice,
  addOnSummary,
  logoProvided,
}) {
  const label = companyLabel(companyName, contactName, email);
  const tierText = tierLabel(tier);
  const amount = ((amountCents || 0) / 100).toFixed(2);
  const cur = String(currency || "usd").toUpperCase();
  const domainBlock = formatDomainChoices(
    domainPreferred,
    domainSecondChoice,
    domainThirdChoice
  );

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
    "Domain preferences:",
    domainBlock,
    "",
    "The client record should now be marked paid/active in Supabase.",
    "The comprehensive paid welcome email was sent to the customer (webhook-triggered).",
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

  const customerSubject = buildOnboardingWelcomeSubject(tier);
  const customerBody = buildOnboardingWelcomeEmail({
    contactName,
    companyName,
    tier,
    amountCents,
    currency,
    domainPreferred,
    domainSecondChoice,
    domainThirdChoice,
    addOnSummary: addOnSummary || "None",
    logoProvided,
  });

  await sendCustomerConfirmation({
    customerEmail: email,
    customerName: contactName,
    customerSubject,
    body: customerBody,
    emailKind: "payment_welcome",
  });
}

export async function sendQuotePaymentLinkEmails({
  quoteId,
  contactName,
  email,
  companyName,
  service,
  quantity,
  amountCents,
  currency,
  paymentUrl,
}) {
  const internalSubject = quotePaymentLinkInternalSubject({
    companyName,
    contactName,
    email,
    service,
  });
  const internalBody = buildQuotePaymentLinkInternalBody({
    quoteId,
    contactName,
    email,
    companyName,
    service,
    quantity,
    amountCents,
    currency,
    paymentUrl,
  });

  await postStaticForms(
    baseForm({
      subject: internalSubject,
      name: contactName,
      email,
      message: internalBody,
      replyTo: email,
      extra: {
        requestType: "quote_payment_link_sent",
        service,
        quoteRequestId: quoteId || "",
      },
    })
  );

  const customerSubject = quotePaymentLinkCustomerSubject({
    amountCents,
    currency,
    service,
  });
  const customerBody = buildQuotePaymentLinkCustomerBody({
    contactName,
    service,
    quantity,
    amountCents,
    currency,
    paymentUrl,
    quoteId,
  });

  await sendCustomerConfirmation({
    customerEmail: email,
    customerName: contactName,
    customerSubject,
    body: customerBody,
    emailKind: "quote_payment_link",
  });
}

export async function sendQuotePaymentReceivedEmails({
  quote,
  session,
  amountCents,
  currency,
}) {
  const contactName = quote.contact_name || "";
  const email = quote.email || "";
  const companyName = quote.company_name || "";
  const service = quote.service || "Custom quote";
  const label = companyLabel(companyName, contactName, email);

  const internalSubject = quotePaymentReceivedInternalSubject({
    companyName,
    contactName,
    email,
    service,
  });
  const internalBody = buildQuotePaymentReceivedInternalBody({
    quote,
    session,
    amountCents,
    currency,
  });

  await postStaticForms(
    baseForm({
      subject: internalSubject,
      name: contactName || label,
      email: email || "payments@4wardwebdesign.com",
      message: internalBody,
      replyTo: email || undefined,
      extra: {
        requestType: "quote_payment_received",
        quoteRequestId: quote.id,
        stripeSessionId: session?.id || "",
      },
    })
  );

  const customerSubject = quotePaymentReceivedCustomerSubject({ service });
  const customerBody = buildQuotePaymentReceivedCustomerBody({
    contactName,
    service,
    quantity: quote.quantity,
    amountCents,
    currency,
    quoteId: quote.id,
  });

  await sendCustomerConfirmation({
    customerEmail: email,
    customerName: contactName,
    customerSubject,
    body: customerBody,
    emailKind: "quote_payment_received",
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
