export const QUOTE_STATUSES = [
  { value: "new", label: "New" },
  { value: "reviewing", label: "Reviewing" },
  { value: "quote_preparing", label: "Quote Preparing" },
  { value: "quote_sent", label: "Quote Sent" },
  { value: "awaiting_payment", label: "Awaiting Payment" },
  { value: "paid", label: "Paid" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "canceled", label: "Canceled" },
] as const;

export const QUOTE_PAYMENT_STATUSES = [
  { value: "none", label: "None" },
  { value: "awaiting_payment", label: "Awaiting Payment" },
  { value: "pending", label: "Pending" },
  { value: "paid", label: "Paid" },
  { value: "failed", label: "Failed" },
  { value: "canceled", label: "Canceled" },
  { value: "refunded", label: "Refunded" },
] as const;

export type QuoteStatus = (typeof QUOTE_STATUSES)[number]["value"];
export type QuotePaymentStatus = (typeof QUOTE_PAYMENT_STATUSES)[number]["value"];

const QUOTE_STATUS_SET = new Set(QUOTE_STATUSES.map((s) => s.value));
const PAYMENT_STATUS_SET = new Set(QUOTE_PAYMENT_STATUSES.map((s) => s.value));

export function isQuoteStatus(value: string): value is QuoteStatus {
  return QUOTE_STATUS_SET.has(value as QuoteStatus);
}

export function isQuotePaymentStatus(value: string): value is QuotePaymentStatus {
  return PAYMENT_STATUS_SET.has(value as QuotePaymentStatus);
}

export function quoteStatusLabel(value: string) {
  return QUOTE_STATUSES.find((s) => s.value === value)?.label || value.replace(/_/g, " ");
}

export function quotePaymentStatusLabel(value: string) {
  return QUOTE_PAYMENT_STATUSES.find((s) => s.value === value)?.label || value.replace(/_/g, " ");
}
