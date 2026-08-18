/**
 * Quote email copy — all values must come from Supabase quote records or form data.
 * Subject lines use [Quote Request] / [Custom Quote] / [QUOTE — …] prefixes
 * to distinguish from website onboarding ([ONBOARDING — …] / [PAYMENT RECEIVED]).
 */

export function formatQuoteMoney(cents, currency = "usd") {
  if (cents === null || cents === undefined || !Number.isFinite(Number(cents))) {
    return "—";
  }
  const amount = (Number(cents) / 100).toFixed(2);
  return `$${amount} ${String(currency || "usd").toUpperCase()}`;
}

function displayValue(value, fallback = "—") {
  const text = String(value || "").trim();
  return text || fallback;
}

function requestSummaryBlock({
  contactName,
  email,
  phone,
  companyName,
  service,
  quantity,
  message,
  quoteId,
}) {
  return [
    "Your request summary:",
    `• Name: ${displayValue(contactName)}`,
    `• Email: ${displayValue(email)}`,
    companyName ? `• Company: ${companyName}` : null,
    phone ? `• Phone: ${phone}` : null,
    `• Service: ${displayValue(service)}`,
    quantity ? `• Quantity: ${quantity}` : null,
    "",
    "Project details you submitted:",
    displayValue(message, "(No additional details provided)"),
    quoteId ? `\nReference: ${quoteId}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

// ——— Quote request (form submit) ———

export function quoteRequestInternalSubject({ companyName, contactName, email, service }) {
  const label = companyName || contactName || email || "Customer";
  return `[QUOTE — NEW REQUEST] — ${label} — ${service}`;
}

export function buildQuoteRequestInternalBody({
  quoteId,
  contactName,
  email,
  phone,
  companyName,
  service,
  quantity,
  message,
}) {
  return [
    "A new custom quote request was submitted through quote.html.",
    "",
    `Quote ID: ${quoteId}`,
    `Name: ${displayValue(contactName)}`,
    `Email: ${displayValue(email)}`,
    `Phone: ${displayValue(phone)}`,
    `Company: ${displayValue(companyName)}`,
    `Service: ${displayValue(service)}`,
    quantity ? `Quantity: ${quantity}` : "Quantity: —",
    "",
    "Project details:",
    displayValue(message),
    "",
    "This is a custom quote request — not fixed-tier website onboarding or Stripe checkout.",
    "Review in Admin → Quotes, prepare pricing, then generate a Stripe payment link when ready.",
  ].join("\n");
}

export function quoteRequestCustomerSubject({ service }) {
  return `[Quote Request] Received — we're reviewing your ${service} request`;
}

export function buildQuoteRequestCustomerBody({
  contactName,
  email,
  phone,
  companyName,
  service,
  quantity,
  message,
  quoteId,
}) {
  const greeting = contactName ? `Hi ${contactName},` : "Hello,";

  return [
    greeting,
    "",
    "Thank you for contacting 4Ward Web Design. We received your custom quote request and wanted to confirm it arrived safely.",
    "",
    requestSummaryBlock({
      contactName,
      email,
      phone,
      companyName,
      service,
      quantity,
      message,
      quoteId,
    }),
    "",
    "— — —",
    "WHAT HAPPENS NEXT",
    "— — —",
    "",
    "1. Our team reviews your project details and any product or vendor requirements.",
    "2. We prepare a custom price that includes design and service time.",
    "3. If the work is a fit, we email you a secure Stripe payment link for the quoted amount.",
    "",
    "We have not approved a final price yet — you will receive a separate email when your quote is ready.",
    "",
    "— — —",
    "IMPORTANT",
    "— — —",
    "",
    "• This message confirms your request only.",
    "• No payment has been charged to your card.",
    "• Website subscription plans use a separate onboarding process at 4wardwebdesign.com/onboarding.html.",
    "",
    "Questions? Reply to this email and we'll be happy to help.",
    "",
    "— 4Ward Web Design, LLC",
    "Carlsbad, New Mexico",
    "https://4wardwebdesign.com",
  ].join("\n");
}

// ——— Payment link (admin sends from dashboard) ———

export function quotePaymentLinkInternalSubject({ companyName, contactName, email, service }) {
  const label = companyName || contactName || email || "Customer";
  return `[QUOTE — PAYMENT LINK SENT] — ${label} — ${service}`;
}

export function buildQuotePaymentLinkInternalBody({
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
  return [
    "A custom Stripe payment link was emailed to the customer for a quote.",
    "",
    `Quote ID: ${quoteId}`,
    `Customer: ${displayValue(contactName)}`,
    `Email: ${displayValue(email)}`,
    `Company: ${displayValue(companyName)}`,
    `Service: ${displayValue(service)}`,
    quantity ? `Quantity: ${quantity}` : "Quantity: —",
    `Quoted amount: ${formatQuoteMoney(amountCents, currency)}`,
    `Payment URL: ${paymentUrl}`,
    "",
    "Quote status should be Awaiting Payment. Paid status updates only via Stripe webhook.",
  ].join("\n");
}

export function quotePaymentLinkCustomerSubject({ amountCents, currency, service }) {
  return `[Custom Quote] Payment link — ${formatQuoteMoney(amountCents, currency)} for ${service}`;
}

export function buildQuotePaymentLinkCustomerBody({
  contactName,
  service,
  quantity,
  amountCents,
  currency,
  paymentUrl,
  quoteId,
}) {
  const greeting = contactName ? `Hi ${contactName},` : "Hello,";
  const amount = formatQuoteMoney(amountCents, currency);

  return [
    greeting,
    "",
    "Your custom quote from 4Ward Web Design is ready. Below is everything you need to pay securely through Stripe.",
    "",
    "— — —",
    "WHAT THIS PAYMENT IS FOR",
    "— — —",
    "",
    `Service: ${displayValue(service)}`,
    quantity ? `Quantity / scope: ${quantity}` : null,
    `Quoted amount due: ${amount}`,
    quoteId ? `Quote reference: ${quoteId}` : null,
    "",
    "This payment covers the custom work described in your quote request — not a recurring website subscription.",
    "",
    "— — —",
    "PAY SECURELY",
    "— — —",
    "",
    paymentUrl,
    "",
    "Stripe hosts checkout — your card details never pass through our website.",
    "",
    "Opening this link does not charge your card. Payment is confirmed only after you complete checkout.",
    "",
    "— — —",
    "",
    "Questions about your quote? Reply to this email before paying — we're here to help.",
    "",
    "— 4Ward Web Design, LLC",
    "Carlsbad, New Mexico",
    "https://4wardwebdesign.com",
  ]
    .filter(Boolean)
    .join("\n");
}

// ——— Payment confirmed (Stripe webhook) ———

export function quotePaymentReceivedInternalSubject({ companyName, contactName, email, service }) {
  const label = companyName || contactName || email || "Customer";
  return `[QUOTE — PAYMENT RECEIVED] — ${label} — ${service}`;
}

export function buildQuotePaymentReceivedInternalBody({
  quote,
  session,
  amountCents,
  currency,
}) {
  const contactName = quote.contact_name || "";
  const email = quote.email || "";
  const companyName = quote.company_name || "";
  const service = quote.service || "Custom quote";

  return [
    "Stripe confirmed payment for a custom quote request.",
    "",
    `Quote ID: ${quote.id}`,
    `Customer: ${displayValue(contactName)}`,
    `Email: ${displayValue(email)}`,
    `Company: ${displayValue(companyName)}`,
    `Service: ${displayValue(service)}`,
    quote.quantity ? `Quantity: ${quote.quantity}` : "Quantity: —",
    `Amount paid: ${formatQuoteMoney(amountCents, currency)}`,
    `Checkout session: ${session?.id || "—"}`,
    "",
    "The quote record should now be marked Paid in Supabase and visible on the admin dashboard.",
  ].join("\n");
}

export function quotePaymentReceivedCustomerSubject({ service }) {
  return `[Custom Quote] Payment confirmed — thank you for your ${service} order`;
}

export function buildQuotePaymentReceivedCustomerBody({
  contactName,
  service,
  quantity,
  amountCents,
  currency,
  quoteId,
}) {
  const greeting = contactName ? `Hi ${contactName},` : "Hello,";
  const amount = formatQuoteMoney(amountCents, currency);

  return [
    greeting,
    "",
    "Thank you! Stripe has confirmed your payment to 4Ward Web Design.",
    "",
    "— — —",
    "PAYMENT CONFIRMATION",
    "— — —",
    "",
    `Service: ${displayValue(service)}`,
    quantity ? `Quantity / scope: ${quantity}` : null,
    `Amount paid: ${amount}`,
    quoteId ? `Quote reference: ${quoteId}` : null,
    "",
    "— — —",
    "WHAT HAPPENS NEXT",
    "— — —",
    "",
    "• We'll begin work on your quoted project and reach out if we need anything else.",
    "• You'll receive project updates by email at this address.",
    "• Keep your Stripe receipt for your records.",
    "",
    "This confirmation is for your custom quote work — separate from website subscription onboarding.",
    "",
    "— 4Ward Web Design, LLC",
    "Carlsbad, New Mexico",
    "https://4wardwebdesign.com",
  ]
    .filter(Boolean)
    .join("\n");
}
