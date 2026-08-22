import crypto from "node:crypto";

export function verifyStripeSignature(rawBody, signatureHeader, secret, toleranceSec = 300) {
  const normalizedSecret = typeof secret === "string" ? secret.trim() : "";
  if (!normalizedSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  }
  if (!signatureHeader) {
    throw new Error("Missing stripe-signature header");
  }

  const parts = {};
  for (const item of signatureHeader.split(",")) {
    const [key, ...rest] = item.split("=");
    const value = rest.join("=");
    if (!key || !value) continue;
    (parts[key] ||= []).push(value);
  }

  const timestamp = parts.t && parts.t[0];
  const candidates = parts.v1 || [];
  if (!timestamp || candidates.length === 0) {
    throw new Error("Malformed stripe-signature header");
  }

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (Number.isFinite(Number(timestamp)) && age > toleranceSec) {
    throw new Error("Stripe signature timestamp is too old");
  }

  const expected = crypto
    .createHmac("sha256", normalizedSecret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  const valid = candidates.some((sig) => {
    const got = Buffer.from(sig, "utf8");
    return got.length === expectedBuf.length && crypto.timingSafeEqual(got, expectedBuf);
  });
  if (!valid) {
    throw new Error("Invalid Stripe signature");
  }
}
