const COLUMN_TIERS = new Set(["tier1", "tier2", "tier3", "buyout"]);
const TIERS = new Set([
  "tier1",
  "tier2",
  "tier3",
  "tier4",
  "buyout",
  "buyout-tier1",
  "buyout-tier2",
  "buyout-tier3",
  "buyout-tier4",
]);
const METHODS = new Set(["call", "text", "email"]);

export const TIER_LABELS = {
  tier1: "Tier 1 — Small Business Website — $99/month",
  tier2: "Tier 2 — Business Management — $225/month",
  tier3: "Tier 3 — Premium Multi-Department Website — $399/month",
  tier4: "Tier 4 — Online Flyer — $44/month",
  buyout: "Upfront buyout — choose the tier at checkout",
  "buyout-tier1": "Upfront buyout — 2 years of Tier 1",
  "buyout-tier2": "Upfront buyout — 2 years of Tier 2",
  "buyout-tier3": "Upfront buyout — 2 years of Tier 3",
  "buyout-tier4": "Upfront buyout — 2 years of Tier 4",
};

export function sanitize(value, max = 500) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);
}

export function validateConsultation(body) {
  const honeypot = sanitize(body && body._hp_ref, 200);
  if (honeypot) return { ok: false, spam: true };

  const businessName = sanitize(body && body.businessName, 160);
  const contactName = sanitize(body && body.contactName, 120);
  const email = sanitize(body && body.email, 160).toLowerCase();
  const phone = sanitize(body && body.phone, 40);
  const city = sanitize(body && body.city, 120);
  const industry = sanitize(body && body.industry, 120);
  const website = sanitize(body && body.website, 300);
  const hasWebsiteRaw = sanitize(body && body.hasWebsite, 8).toLowerCase();
  const hasWebsite = hasWebsiteRaw === "yes" || hasWebsiteRaw === "no" ? hasWebsiteRaw : "";
  const tierRaw = sanitize(body && body.tier, 40);
  const description = sanitize(body && body.description, 4000);
  const methodRaw = sanitize(body && body.contactMethod, 20).toLowerCase();
  const contactTime = sanitize(body && body.contactTime, 160);

  const contactMethod = METHODS.has(methodRaw) ? methodRaw : "";
  const preferredTier = TIERS.has(tierRaw) ? tierRaw : "";
  const phoneDigits = phone.replace(/\D/g, "");

  if (!businessName || !contactName || !email || !description) {
    return { ok: false, error: "Please add your business name, contact name, email, and a short description." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  if (!contactMethod) {
    return { ok: false, error: "Choose how you would like us to contact you." };
  }
  if (phone && phoneDigits.length > 0 && phoneDigits.length < 7) {
    return { ok: false, error: "Enter a valid phone number." };
  }
  if (/^javascript:/i.test(website)) {
    return { ok: false, error: "Enter a valid website address." };
  }

  return {
    ok: true,
    value: {
      business_name: businessName,
      contact_name: contactName,
      email,
      phone: phone || null,
      city: city || null,
      industry: industry || null,
      website_url: website || null,
      preferred_tier: COLUMN_TIERS.has(preferredTier) ? preferredTier : null,
      project_description: description,
      contact_method: contactMethod,
      contact_time: contactTime || null,
      status: "received",
      payload: {
        source: "consultation.html",
        preferred_package: preferredTier || "",
        preferred_package_label: TIER_LABELS[preferredTier] || "Not Sure — Help Me Choose",
        has_website: hasWebsite,
      },
    },
  };
}
