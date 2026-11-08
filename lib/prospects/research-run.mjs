import { parseWebsite } from "./model.mjs";
import {
  RESEARCH_DEADLINE_MS,
  buildDraft,
  extractPublicContacts,
  qualifyProspect,
  robotsAllows,
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
  let page = await fetchText(fetchImpl, pageUrl.toString(), remaining());
  if ((page.error === "network" || page.status >= 500) && remaining() > 300) {
    page = await fetchText(fetchImpl, page.finalUrl || pageUrl.toString(), remaining());
  }
  if (page.error || page.status < 200 || page.status >= 400) {
    const error = page.error === "timeout"
      ? "The source page did not answer in time. It was not marked Ready."
      : page.error === "network"
        ? "The source page could not be reached. It was not marked Ready."
        : page.error === "redirect"
          ? "The source redirected too many times or to a non-public address. It was not marked Ready."
          : "The source page returned an error. It was not marked Ready.";
    return {
      ok: false,
      robotsBlocked: false,
      error,
      emails: [],
      contactUrl: "",
      title: "",
      sourceUrl: page.finalUrl || pageUrl.toString(),
    };
  }
  const finalUrl = page.finalUrl || pageUrl.toString();
  const contacts = extractPublicContacts(page.text, finalUrl);
  const visible = String(page.text || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 8000);
  const final = parseWebsite(finalUrl);
  return {
    ok: true,
    robotsBlocked: false,
    error: "",
    emails: contacts.emails,
    contactUrl: contacts.contactUrl,
    title: contacts.title,
    text: visible,
    host: final?.host || "",
    sourceUrl: finalUrl,
  };
}

async function fetchText(fetchImpl, url, timeoutMs, depth = 0) {
  if (depth > 4) return { status: 0, text: "", error: "redirect", location: "", finalUrl: url };
  if (timeoutMs < 300) return { status: 0, text: "", error: "timeout", location: "", finalUrl: url };
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
      let next;
      try {
        next = new URL(location, url);
      } catch {
        return { status: response.status, text: "", error: "redirect", location, finalUrl: url };
      }
      if (next.protocol !== "http:" && next.protocol !== "https:") {
        return { status: response.status, text: "", error: "redirect", location, finalUrl: url };
      }
      return fetchText(fetchImpl, next.toString(), timeoutMs - 200, depth + 1);
    }
    const text = await response.text();
    return { status: response.status, text: String(text || "").slice(0, 120000), error: "", location: "", finalUrl: url };
  } catch (error) {
    const aborted = error?.name === "AbortError";
    return { status: 0, text: "", error: aborted ? "timeout" : "network", location: "", finalUrl: url };
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
