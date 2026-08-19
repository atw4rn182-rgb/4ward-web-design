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

export async function sendQuoteRequestInternalEmail({
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
}

export async function sendQuoteRequestCustomerEmail({
  contactName,
  email,
  phone,
  companyName,
  service,
  quantity,
  message,
  quoteId,
}) {
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

  return sendCustomerConfirmation({
    customerEmail: email,
    customerName: contactName,
    customerSubject,
    body: customerBody,
    emailKind: "quote_confirmation",
  });
}

/** @deprecated Prefer deliverQuoteRequestEmails + dual-delivery helpers */
export async function sendQuoteRequestEmails(params) {
  await sendQuoteRequestInternalEmail(params);
  return sendQuoteRequestCustomerEmail(params);
}

export async function sendOnboardingPendingInternalEmail({
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
}

export async function sendOnboardingPendingCustomerEmail({
  contactName,
  email,
  tier,
}) {
  const tierText = tierLabel(tier);
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

  return sendCustomerConfirmation({
    customerEmail: email,
    customerName: contactName,
    customerSubject,
    body: customerBody,
    emailKind: "onboarding_confirmation",
  });
}

export async function sendOnboardingPendingEmails(params) {
  const { internalOnly, customerOnly, ...rest } = params;
  if (customerOnly) {
    return sendOnboardingPendingCustomerEmail(rest);
  }
  if (internalOnly) {
    await sendOnboardingPendingInternalEmail(rest);
    return { ok: true };
  }
  await sendOnboardingPendingInternalEmail(rest);
  return sendOnboardingPendingCustomerEmail(rest);
}

export async function sendPaymentReceivedInternalEmail({
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
    "The comprehensive paid welcome email is sent to the customer (webhook-triggered).",
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
}

export async function sendPaymentReceivedCustomerEmail({
  contactName,
  companyName,
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

  return sendCustomerConfirmation({
    customerEmail: email,
    customerName: contactName,
    customerSubject,
    body: customerBody,
    emailKind: "payment_welcome",
  });
}

export async function sendPaymentReceivedEmails(params) {
  await sendPaymentReceivedInternalEmail(params);
  return sendPaymentReceivedCustomerEmail(params);
}

export async function sendQuotePaymentLinkInternalEmail({
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
}

export async function sendQuotePaymentLinkCustomerEmail({
  quoteId,
  contactName,
  email,
  service,
  quantity,
  amountCents,
  currency,
  paymentUrl,
}) {
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

  return sendCustomerConfirmation({
    customerEmail: email,
    customerName: contactName,
    customerSubject,
    body: customerBody,
    emailKind: "quote_payment_link",
  });
}

export async function sendQuotePaymentLinkEmails(params) {
  await sendQuotePaymentLinkInternalEmail(params);
  return sendQuotePaymentLinkCustomerEmail(params);
}

export async function sendQuotePaymentReceivedInternalEmail({
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
}

export async function sendQuotePaymentReceivedCustomerEmail({
  quote,
  amountCents,
  currency,
}) {
  const contactName = quote.contact_name || "";
  const email = quote.email || "";
  const service = quote.service || "Custom quote";

  const customerSubject = quotePaymentReceivedCustomerSubject({ service });
  const customerBody = buildQuotePaymentReceivedCustomerBody({
    contactName,
    service,
    quantity: quote.quantity,
    amountCents,
    currency,
    quoteId: quote.id,
  });

  return sendCustomerConfirmation({
    customerEmail: email,
    customerName: contactName,
    customerSubject,
    body: customerBody,
    emailKind: "quote_payment_received",
  });
}

export async function sendQuotePaymentReceivedEmails(params) {
  await sendQuotePaymentReceivedInternalEmail(params);
  return sendQuotePaymentReceivedCustomerEmail(params);
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
