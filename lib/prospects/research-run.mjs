import { parseWebsite } from "./model.mjs";
import {
  RESEARCH_DEADLINE_MS,
  buildDraft,
  extractPublicContacts,
  qualifyProspect,
  robotsAllows,
  sameHost,
} from "./research.mjs";

const USER_AGENT = "4WardWebDesign-Research/1.0 (admin research; +https://www.4wardwebdesign.com)";

export async function readOwnWebsite(rawUrl, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const budget = Math.max(1000, Number(options.timeoutMs) || RESEARCH_DEADLINE_MS);
  const started = Date.now();
  const website = parseWebsite(rawUrl);
  if (!website) {
    return { ok: false, robotsBlocked: false, error: "The website on the record is not a valid public address.", emails: [], contactUrl: "", title: "", sourceUrl: "" };
  }
  const pageUrl = new URL(website.url);
  const remaining = () => budget - (Date.now() - started);
  const robotsUrl = `${pageUrl.origin}/robots.txt`;
  const robots = await fetchText(fetchImpl, robotsUrl, remaining());
  if (robots.error === "timeout") {
    return { ok: false, robotsBlocked: false, error: "The website did not answer within the time limit.", emails: [], contactUrl: "", title: "", sourceUrl: robotsUrl };
  }
  if (robots.status === 200 && !robotsAllows(robots.text, pageUrl.pathname || "/")) {
    return {
      ok: false,
      robotsBlocked: true,
      error: "This website's robots.txt disallows automated reading.",
      emails: [],
      contactUrl: "",
      title: "",
      sourceUrl: robotsUrl,
    };
  }
  let page = await fetchText(fetchImpl, pageUrl.toString(), remaining(), pageUrl.host);
  if ((page.error || page.status >= 500) && remaining() > 300) {
    page = await fetchText(fetchImpl, pageUrl.toString(), remaining(), pageUrl.host);
  }
  if (page.error || page.status < 200 || page.status >= 400) {
    return {
      ok: false,
      robotsBlocked: false,
      error: "The public website could not be read. Review it manually.",
      emails: [],
      contactUrl: "",
      title: "",
      sourceUrl: pageUrl.toString(),
    };
  }
  const contacts = extractPublicContacts(page.text, pageUrl.toString());
  return {
    ok: true,
    robotsBlocked: false,
    error: "",
    emails: contacts.emails,
    contactUrl: contacts.contactUrl,
    title: contacts.title,
    sourceUrl: pageUrl.toString(),
  };
}

async function fetchText(fetchImpl, url, timeoutMs, expectedHost, depth = 0) {
  if (depth > 1) return { status: 0, text: "", error: "redirect", location: "" };
  if (timeoutMs < 300) return { status: 0, text: "", error: "timeout", location: "" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      redirect: "manual",
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,text/plain;q=0.9" },
    });
    const location = response.headers?.get?.("location") || "";
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (!expectedHost || !sameHost(url, location)) {
        return { status: response.status, text: "", error: "redirect", location };
      }
      return fetchText(fetchImpl, new URL(location, url).toString(), timeoutMs - 200, expectedHost, depth + 1);
    }
    const text = await response.text();
    return { status: response.status, text: String(text || "").slice(0, 120000), error: "", location };
  } catch (error) {
    const aborted = error?.name === "AbortError";
    return { status: 0, text: "", error: aborted ? "timeout" : "network", location: "" };
  } finally {
    clearTimeout(timer);
  }
}

export function researchFromRecord(prospect, reading, mailingAddress) {
  const manualEmail = String(prospect.public_email || "").trim().toLowerCase();
  const pageEmail = reading?.emails?.[0] || "";
  const email = manualEmail || pageEmail;
  const emailFromPage = !manualEmail && Boolean(pageEmail);
  const decision = qualifyProspect({
    businessName: prospect.business_name,
    city: prospect.city,
    serviceArea: prospect.service_area,
    industry: prospect.industry,
    publicEmail: email,
    websiteHost: prospect.website_host,
    suppressed: Boolean(prospect.suppressed),
    robotsBlocked: Boolean(reading?.robotsBlocked),
    fetchError: reading?.error || "",
    emailsFound: reading?.emails || [],
    emailFromPage,
  });
  const sources = [reading?.sourceUrl, reading?.contactUrl].filter(Boolean).join("\n");
  const draft = buildDraft({
    qualification: decision.qualification,
    email: decision.email,
    businessName: prospect.business_name,
    city: prospect.city,
    industry: decision.industry,
    websiteHost: prospect.website_host,
    mailingAddress,
  });
  const factual = reading?.title ? `Public page title: ${reading.title}.` : "";
  return {
    ...decision,
    sources,
    factualNotes: factual,
    draftSubject: draft?.subject || "",
    draftBody: draft?.body || "",
    listingNote: reading?.contactUrl ? `Contact page: ${reading.contactUrl}` : "",
  };
}
