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
  const tier = packageId ? TIER_LABELS[packageId] || packageId : "Not Sure — Help Me Choose";
  const hasWebsite = row.payload && row.payload.has_website;
  const hasWebsiteLabel = hasWebsite === "yes" ? "Yes" : hasWebsite === "no" ? "No" : "Not answered";
  return [
    "A new consultation request was submitted.",
    "",
    `Consultation ID: ${row.id}`,
    `Submitted: ${displayValue(row.created_at)}`,
    `Business: ${displayValue(row.business_name)}`,
    `Contact: ${displayValue(row.contact_name)}`,
    `Email: ${displayValue(row.email)}`,
    `Phone: ${displayValue(row.phone)}`,
    `Preferred contact: ${displayValue(row.contact_method)}`,
    `Preferred time: ${displayValue(row.contact_time)}`,
    `City or service area: ${displayValue(row.city)}`,
    `Type of business: ${displayValue(row.industry)}`,
    `Already has a website: ${hasWebsiteLabel}`,
    `Existing website: ${displayValue(row.website_url)}`,
    `Selected package: ${tier}`,
    `Status: ${displayValue(row.status)}`,
    "",
    "What they need:",
    displayValue(row.project_description),
    "",
    "This is a consultation request. It did not create a customer, onboarding, or Stripe checkout record.",
  ].join("\n");
}
