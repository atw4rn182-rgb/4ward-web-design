import { tierLabel } from "@/lib/pricing/tier-labels";
import { formatDomainChoices } from "@/lib/onboarding/domains";

const TIER_UPDATES = {
  tier1: "2 included website updates per month",
  tier2: "4 included website updates per month",
  tier3: "4 included website updates per month",
  "buyout-tier1": "Updates after your buy-out period are available at $99 each",
  "buyout-tier2": "Updates after your buy-out period are available at $99 each",
  "buyout-tier3": "Updates after your buy-out period are available at $99 each",
};

function updatesLine(tier) {
  return TIER_UPDATES[tier] || "Monthly update allowances depend on your selected plan";
}

function supportLine(tier, addOnSummary) {
  const isBuyout = String(tier || "").startsWith("buyout");
  const lines = [];
  if (isBuyout) {
    lines.push(
      "Your buy-out covers hosting, development, and maintenance for the prepaid period described in your agreement."
    );
  } else {
    lines.push(
      "Your monthly plan includes hosting, development, maintenance, and the update allowance listed in your service agreement."
    );
    lines.push("Billing continues through Stripe until you cancel per your agreement.");
  }
  if (addOnSummary && addOnSummary !== "None") {
    lines.push(`Selected add-ons: ${addOnSummary}. We will configure these during project setup.`);
  }
  return lines.join(" ");
}

/**
 * Comprehensive post-payment welcome email (website onboarding only).
 * Wording avoids specific calendar timelines — phases describe the actual process.
 */
export function buildOnboardingWelcomeEmail({
  contactName,
  companyName,
  tier,
  amountCents,
  currency,
  domainPreferred,
  domainSecondChoice,
  domainThirdChoice,
  addOnSummary,
  logoProvided,
}) {
  const name = contactName || "there";
  const tierText = tierLabel(tier);
  const amount = ((amountCents || 0) / 100).toFixed(2);
  const cur = String(currency || "usd").toUpperCase();
  const domainBlock = formatDomainChoices(domainPreferred, domainSecondChoice, domainThirdChoice);

  return [
    `Hi ${name},`,
    "",
    "Thank you — Stripe has confirmed your payment and your website project with 4Ward Web Design is officially underway.",
    "",
    "This email is your project welcome guide. It explains what happens next, how we work together, and what we may need from you along the way.",
    "",
    "— — —",
    "PAYMENT CONFIRMATION",
    "— — —",
    "",
    `Company: ${companyName || "—"}`,
    `Plan: ${tierText}`,
    `Amount paid today: ${amount} ${cur}`,
    "",
    "— — —",
    "WHAT HAPPENS NEXT",
    "— — —",
    "",
    "1. Project intake — We review your onboarding details, domain preferences, and any materials you submitted.",
    "2. Kickoff outreach — Our team reaches out by email if we need clarifications, missing content, or branding files.",
    "3. Structured build — Your site moves through the milestones below with review checkpoints before anything goes live.",
    "",
    "You do not need to take further action right now unless we contact you. We will guide you through each stage.",
    "",
    "— — —",
    "PROJECT MILESTONES",
    "— — —",
    "",
    "• Intake & planning — Confirm goals, pages/sections, contact details, and domain direction.",
    "• Design direction — Layout, colors, typography, and overall look aligned with your business.",
    "• Content & assets — Gather copy, photos, logos, and business information for each page.",
    "• Review round(s) — You review drafts and request revisions within your plan’s scope.",
    "• Development & QA — We build, test forms, mobile layout, basic SEO setup, and Analytics.",
    "• Pre-launch review — Final check of content, links, forms, and domain/DNS readiness.",
    "• Launch — Your site goes live on your chosen domain when everything is approved.",
    "• Ongoing care — Hosting, maintenance, and included updates per your plan (see below).",
    "",
    "Timelines vary by project complexity and how quickly materials are provided — we will keep you updated as your project progresses.",
    "",
    "— — —",
    "MATERIALS WE MAY STILL NEED",
    "— — —",
    "",
    "Please gather these when convenient; we will tell you exactly what is needed for your tier:",
    "",
    "Logo & branding",
    logoProvided === "yes"
      ? "• You uploaded a logo during onboarding — we will confirm it meets print/web quality or request a higher-resolution file if needed."
      : "• Logo files (PNG, SVG, or high-resolution JPG) and any brand colors or fonts you want us to use.",
    "",
    "Business information",
    "• Legal business name, address, phone, email, hours, and service area.",
    "• Short descriptions of services, departments, or specialties for each page/section.",
    "",
    "Photos & content",
    "• Professional photos of your team, location, products, or work (or permission to use stock imagery).",
    "• Any existing brochures, PDFs, or copy you want reflected on the site.",
    "",
    "Domain preferences (from your onboarding)",
    domainBlock,
    "",
    "You do not need to already own a domain — we will help check availability and discuss registration or DNS connection during setup.",
    "",
    "— — —",
    "REVISIONS & REVIEW STAGES",
    "— — —",
    "",
    "• You will receive drafts or staging previews to review before launch.",
    "• Consolidated feedback per review round helps us stay efficient and accurate.",
    "• Scope changes beyond your plan may be quoted separately — we will always confirm before extra work begins.",
    "",
    "— — —",
    "HOW WE COMMUNICATE",
    "— — —",
    "",
    "• Primary channel: email (reply to messages from our team or contact us through 4wardwebdesign.com).",
    "• We will notify you at key milestones: intake complete, drafts ready for review, pre-launch, and launch.",
    "• For urgent billing questions, refer to your Stripe receipt or contact us directly.",
    "",
    "— — —",
    "BEFORE LAUNCH",
    "— — —",
    "",
    "• Final content and approvals on all pages and forms.",
    "• Domain registration or DNS access (if not already arranged).",
    "• Google Analytics and basic SEO checks completed.",
    "• Contact forms tested and confirmed delivering to the correct inbox.",
    "",
    "— — —",
    "AT LAUNCH",
    "— — —",
    "",
    "• Your website goes live on your approved domain.",
    "• We submit the site for search engine crawling where applicable.",
    "• Google Business Profile setup is included with your plan’s full online overhaul.",
    "• You receive your live URL and guidance on requesting future updates.",
    "",
    "— — —",
    "ONGOING SUPPORT",
    "— — —",
    "",
    supportLine(tier, addOnSummary),
    "",
    updatesLine(tier) + ".",
    "",
    "— — —",
    "",
    "Thank you for trusting 4Ward Web Design with your online presence. We are excited to build something professional, clear, and effective for your business.",
    "",
    "— 4Ward Web Design, LLC",
    "Carlsbad, New Mexico",
    "https://4wardwebdesign.com",
    "4wardwebdesigns@gmail.com",
  ].join("\n");
}

export function buildOnboardingWelcomeSubject(tier) {
  return `Welcome to 4Ward Web Design — your ${tierLabel(tier)} project is underway`;
}
