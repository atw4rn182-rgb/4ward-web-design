/**
 * Heuristics for disposable / test admin records.
 * Real production clients (portfolio + genuine customers) stay protected
 * unless the admin explicitly confirms a production delete.
 */

const PORTFOLIO_COMPANIES = new Set(["accu-fab nm", "black mesa welding"]);

const TEST_EMAIL_RE =
  /@(example\.com|test\.com|mailinator\.com|guerrillamail\.com)$|(\+|_)(test|e2e|probe|hp|diag)@|^test[+._-]|^(e2e|probe|hp-ref|diag)[-+.]/i;

const TEST_NAME_RE =
  /^(e2e|diag|verify|stripe mode verify|live audit)\b|^e2e\s|^verify\s|\blive audit\b/i;

export function isPortfolioCompany(name: string | null | undefined) {
  if (!name) return false;
  return PORTFOLIO_COMPANIES.has(name.trim().toLowerCase());
}

export function isTestEmail(email: string | null | undefined) {
  if (!email) return false;
  const value = email.trim().toLowerCase();
  if (value.endsWith("@example.com")) return true;
  return TEST_EMAIL_RE.test(value);
}

export function isTestCompanyName(name: string | null | undefined) {
  if (!name) return false;
  const value = name.trim();
  if (isPortfolioCompany(value)) return false;
  return (
    TEST_NAME_RE.test(value) ||
    value === "E2E Co" ||
    value === "Diag Co" ||
    value.startsWith("Live Audit ") ||
    value.startsWith("Verify ") ||
    value === "Stripe Mode Verify" ||
    /^E2E Verify \d+$/i.test(value)
  );
}

export function isDisposableQuote(row: {
  email?: string | null;
  company_name?: string | null;
  contact_name?: string | null;
}) {
  return (
    isTestEmail(row.email) ||
    isTestCompanyName(row.company_name) ||
    isTestCompanyName(row.contact_name)
  );
}

export function isDisposableOnboarding(row: {
  email?: string | null;
  company_name?: string | null;
  contact_name?: string | null;
}) {
  return (
    isTestEmail(row.email) ||
    isTestCompanyName(row.company_name) ||
    isTestCompanyName(row.contact_name)
  );
}

export function isDisposableCustomer(row: {
  email?: string | null;
  company_name?: string | null;
}) {
  if (isPortfolioCompany(row.company_name)) return false;
  return isTestEmail(row.email) || isTestCompanyName(row.company_name);
}

export function isDisposablePayment(row: {
  amount_cents?: number | null;
  payment_type?: string | null;
  description?: string | null;
  stripe_checkout_session_id?: string | null;
  customers?: { company_name: string } | { company_name: string }[] | null;
}) {
  const sessionId = row.stripe_checkout_session_id || "";
  const description = row.description || "";
  const company =
    Array.isArray(row.customers)
      ? row.customers[0]?.company_name
      : row.customers?.company_name;

  if (description === "LIVE PAYMENT VERIFICATION") return true;
  if (/live payment verification/i.test(description)) return true;
  if (sessionId.startsWith("cs_test_")) return true;
  if (sessionId === "cs_live_final_check") return true;
  if (description === "Checkout session" && (row.amount_cents || 0) === 0) return true;
  if (
    row.payment_type === "other" &&
    row.amount_cents === 100 &&
    /verification/i.test(description)
  ) {
    return true;
  }
  if (isTestCompanyName(company)) return true;
  if (isTestCompanyName(description.split(" · ")[0])) return true;
  if (description.startsWith("E2E Verify ")) return true;
  return false;
}

export type DeletableKind = "quote" | "payment" | "onboarding" | "customer";

export function disposableBadgeLabel(kind: DeletableKind) {
  if (kind === "payment") return "Test / verification";
  return "Test record";
}
