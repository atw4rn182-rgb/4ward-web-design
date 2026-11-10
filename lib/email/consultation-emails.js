import { TIER_LABELS } from "@/lib/consultations/validate";

function displayValue(value) {
  const text = String(value || "").trim();
  return text || "—";
}

export function consultationInternalSubject({ businessName, contactName, email }) {
  const label = businessName || contactName || email || "New inquiry";
  return `[CONSULTATION] — ${label}`;
}

export function buildConsultationInternalBody(row) {
  const packageId = row.payload && row.payload.preferred_package ? row.payload.preferred_package : row.preferred_tier;
  const tier = packageId ? TIER_LABELS[packageId] || packageId : "Not selected";
  return [
    "A new consultation request was submitted.",
    "",
    `Consultation ID: ${row.id}`,
    `Business: ${displayValue(row.business_name)}`,
    `Contact: ${displayValue(row.contact_name)}`,
    `Email: ${displayValue(row.email)}`,
    `Phone: ${displayValue(row.phone)}`,
    `Preferred contact: ${displayValue(row.contact_method)}`,
    `Preferred time: ${displayValue(row.contact_time)}`,
    `City or service area: ${displayValue(row.city)}`,
    `Industry: ${displayValue(row.industry)}`,
    `Existing website: ${displayValue(row.website_url)}`,
    `Preferred tier: ${tier}`,
    `Status: ${displayValue(row.status)}`,
    "",
    "What they need:",
    displayValue(row.project_description),
    "",
    "This is a consultation request. It did not create a customer, onboarding, or Stripe checkout record.",
  ].join("\n");
}
