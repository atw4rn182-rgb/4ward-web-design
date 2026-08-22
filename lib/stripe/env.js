export function getStripeEnv() {
  const publishableKey =
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
    process.env.STRIPE_PUBLISHABLE_KEY ||
    "";
  const secret = process.env.STRIPE_SECRET_KEY || "";
  const webhookSecret = (process.env.STRIPE_WEBHOOK_SECRET || "").trim();

  const publishableKind = publishableKey.startsWith("pk_test_")
    ? "test"
    : publishableKey.startsWith("pk_live_")
      ? "live"
      : publishableKey
        ? "unknown"
        : "missing";
  const secretKind = secret.startsWith("sk_test_")
    ? "test"
    : secret.startsWith("sk_live_")
      ? "live"
      : secret
        ? "unknown"
        : "missing";

  return {
    publishableKey,
    secret,
    webhookSecret,
    publishableKind,
    secretKind,
    configured: Boolean(secret),
    liveMode: secretKind === "live" || (publishableKind === "live" && secretKind === "live"),
    testMode: secretKind === "test" || (publishableKind === "test" && secretKind === "test"),
  };
}
