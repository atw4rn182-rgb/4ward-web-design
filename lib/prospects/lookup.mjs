import { WEBSITE_CHECK_NOTE, ONE_TIME_EMAIL, LOOKUP_BLOCKER } from "./discovery.mjs";
import { extractPublicContacts, inSoutheasternNewMexico, isPersonalEmail, isPublishableEmail } from "./research.mjs";
import { readOwnWebsite } from "./research-run.mjs";

const PLACES_URL = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK = "places.id,places.displayName,places.formattedAddress,places.businessStatus,places.googleMapsUri,places.websiteUri,places.postalAddress";
const DIRECTORY_HOSTS = ["facebook.com", "instagram.com", "yelp.com", "yellowpages.com", "bbb.org", "linkedin.com", "mapquest.com", "google.com", "goo.gl"];
export const SEARCH_CITIES = ["Carlsbad", "Artesia", "Hobbs", "Lovington"];

export function placesKey(env = process.env) {
  return String(env.GOOGLE_PLACES_API_KEY || "").trim();
}

export function websiteHost(value) {
  try {
    return new URL(String(value || "")).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export function isDirectoryHost(host) {
  const name = String(host || "").toLowerCase();
  return DIRECTORY_HOSTS.some((directory) => name === directory || name.endsWith(`.${directory}`));
}

export function classifyCandidate(input) {
  const name = String(input?.name || "").trim();
  const city = String(input?.city || "").trim();
  const status = String(input?.businessStatus || "");
  const host = websiteHost(input?.websiteUrl);
  const ownSite = Boolean(host) && !isDirectoryHost(host);
  const emails = (input?.pageEmails || []).map((email) => String(email).toLowerCase()).filter((email) => isPublishableEmail(email) && !isPersonalEmail(email) && email !== ONE_TIME_EMAIL);
  if (/CLOSED_PERMANENTLY|CLOSED_TEMPORARILY|^CLOSED$/i.test(status)) return { action: "exclude", reason: "closed", email: "", websiteHost: host };
  if (!name || inSoutheasternNewMexico(city) !== true) return { action: "exclude", reason: "outside-area", email: "", websiteHost: host };
  if (!input?.pageChecked) {
    const reason = host
      ? "The listed page was not read, so a business-owned website was not confirmed or ruled out."
      : "No website field was returned. That is not proof that no website exists. No email was guessed.";
    return { action: "pending", reason, email: "", websiteHost: ownSite ? host : "", eligible: false };
  }
  if (ownSite) {
    return { action: "pending", reason: `A business-owned website was found at ${host}.`, email: emails[0] || "", websiteHost: host, eligible: false };
  }
  if (!emails.length) {
    return { action: "pending", reason: "No published business email was on the pages that were read. An address was not guessed.", email: "", websiteHost: "", eligible: false };
  }
  return { action: "ready", reason: `${WEBSITE_CHECK_NOTE} Published email ${emails[0]} was on a page that was read.`, email: emails[0], websiteHost: "", eligible: true };
}

export function candidateFromPlace(place) {
  const city = place?.postalAddress?.locality || "";
  return {
    placeId: String(place?.id || ""),
    name: String(place?.displayName?.text || "").trim(),
    city: String(city || "").trim(),
    businessStatus: String(place?.businessStatus || ""),
    mapsUrl: String(place?.googleMapsUri || ""),
    websiteUrl: String(place?.websiteUri || ""),
    address: String(place?.formattedAddress || ""),
  };
}

export async function searchCity({ city, fetchImpl, apiKey }) {
  const response = await fetchImpl(PLACES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify({ textQuery: `local business in ${city}, New Mexico`, pageSize: 10, regionCode: "us" }),
  });
  if (!response?.ok) return { ok: false, places: [], error: "Places search did not succeed." };
  const body = await response.json();
  return { ok: true, places: (body.places || []).map(candidateFromPlace), error: "" };
}

/** Finds candidates only. This function does not send email. */
export async function discoverCandidates(options = {}) {
  const apiKey = options.apiKey ?? placesKey();
  if (!apiKey) return { active: false, tested: false, found: [], requests: 0, blocker: LOOKUP_BLOCKER };
  const fetchImpl = options.fetchImpl || fetch;
  const readPage = options.readPage || ((url) => readOwnWebsite(url, { fetchImpl, timeoutMs: 4000 }));
  const cities = (options.cities || SEARCH_CITIES).slice(0, 4);
  const found = [];
  let requests = 0;
  for (const city of cities) {
    if (found.length >= (options.limit || 20)) break;
    requests += 1;
    const search = await searchCity({ city, fetchImpl, apiKey });
    if (!search.ok) return { active: false, tested: false, found, requests, blocker: search.error };
    for (const place of search.places) {
      if (found.length >= (options.limit || 20)) break;
      let pageEmails = [];
      let pageChecked = false;
      if (place.websiteUrl) {
        const reading = await readPage(place.websiteUrl);
        pageChecked = Boolean(reading?.ok);
        pageEmails = reading?.emails || [];
      }
      const decision = classifyCandidate({ ...place, pageEmails, pageChecked });
      found.push({ ...place, ...decision, sources: [place.mapsUrl, place.websiteUrl].filter(Boolean) });
    }
  }
  return { active: false, tested: requests > 0 && found.length >= 0, found, requests, blocker: found.some((row) => row.action === "ready") ? "" : "The lookup ran, but no candidate had both a published business email and a completed website check." };
}

export function publishedEmails(html, pageUrl) {
  return extractPublicContacts(html, pageUrl).emails;
}

export async function saveDiscoveredCandidates(supabase, found) {
  let saved = 0;
  let ready = 0;
  for (const row of found || []) {
    if (row.action === "exclude" || !row.name) continue;
    const email = String(row.email || "").toLowerCase();
    if (!email && row.action === "ready") continue;
    if (email === ONE_TIME_EMAIL) continue;
    const { data: byEmail } = email
      ? await supabase.from("prospects").select("id").ilike("public_email", email).limit(1)
      : { data: [] };
    if (byEmail?.length) continue;
    const { data: byName } = await supabase.from("prospects").select("id").ilike("business_name", row.name).ilike("city", row.city).limit(1);
    if (byName?.length) continue;
    if (email) {
      const [{ data: suppressed }, { data: customers }, { data: sent }] = await Promise.all([
        supabase.from("prospect_suppressions").select("id").ilike("email", email).limit(1),
        supabase.from("customers").select("id").ilike("email", email).limit(1),
        supabase.from("prospects").select("id").ilike("public_email", email).not("sent_at", "is", null).limit(1),
      ]);
      if (suppressed?.length || customers?.length || sent?.length) continue;
    }
    const now = new Date().toISOString();
    const status = row.action === "ready" ? "ready" : "queued";
    const { error } = await supabase.from("prospects").insert({
      business_name: row.name,
      city: row.city || null,
      public_email: email || null,
      website_url: row.websiteUrl || null,
      website_host: row.websiteHost || null,
      status,
      source: "research",
      outreach_eligible: status === "ready",
      research_notes: String(row.reason || "").slice(0, 1000),
      research_sources: (row.sources || []).join("\n").slice(0, 1000),
      researched_at: now,
      ready_at: status === "ready" ? now : null,
      notes: "Found by discovery. No email was sent.",
    });
    if (error) continue;
    saved += 1;
    if (status === "ready") ready += 1;
  }
  return { saved, ready };
}
