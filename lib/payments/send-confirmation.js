const STATIC_FORMS_URL = "https://api.staticforms.dev/submit";
const STATIC_FORMS_KEY = process.env.STATIC_FORMS_API_KEY || "sf_664e6d9a082c77e340ae36b6";

function encodeForm(params) {
  const body = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    body.append(key, String(value));
  });
  return body;
}

async function stripePost(path) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return null;
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: encodeForm({}),
  });
  return response.json();
}

export async function sendPaymentConfirmation(session) {
  if (!session || !session.id) return;
  if (!/^cs_(live|test)_/.test(session.id) || /e2e/i.test(session.id)) return;

  const email =
    (session.customer_details && session.customer_details.email) ||
    session.customer_email ||
    "";
  const company =
    (session.metadata && session.metadata.company_name) || email || "New client";

  if (session.invoice) {
    await stripePost(`/invoices/${session.invoice}/send`);
  }

  const form = new FormData();
  form.set("apiKey", STATIC_FORMS_KEY);
  form.set("subject", `Payment received — ${company}`);
  form.set("name", company);
  form.set("email", email || "payments@4wardwebdesign.com");
  form.set(
    "message",
    [
      "A Stripe checkout just completed.",
      `Company: ${company}`,
      `Email: ${email || "—"}`,
      `Amount: ${((session.amount_total || 0) / 100).toFixed(2)} ${String(session.currency || "usd").toUpperCase()}`,
      `Session: ${session.id}`,
    ].join("\n")
  );
  await fetch(STATIC_FORMS_URL, {
    method: "POST",
    body: form,
    headers: { Accept: "application/json" },
  });
}
