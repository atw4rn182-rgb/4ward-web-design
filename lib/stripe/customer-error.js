/** Safe customer-facing message when Stripe upstream calls fail. */
export const STRIPE_CUSTOMER_ERROR_MESSAGE =
  "Payment setup is temporarily unavailable. Please try again or contact us if the problem continues.";

/**
 * Log full Stripe error server-side; return safe HTTP status + body for public APIs.
 * @param {string} context
 * @param {unknown} error
 */
export function stripeCustomerFailure(context, error) {
  const err = error instanceof Error ? error : new Error(String(error));
  const stripeStatus = Number(err.status);
  console.error(context, {
    message: err.message,
    status: Number.isFinite(stripeStatus) ? stripeStatus : undefined,
  });
  const status =
    Number.isFinite(stripeStatus) && stripeStatus >= 500 ? 503 : 503;
  return {
    status,
    body: { error: STRIPE_CUSTOMER_ERROR_MESSAGE },
  };
}
