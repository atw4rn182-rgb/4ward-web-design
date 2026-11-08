const DIRECTORY_HOSTS = ["facebook.com", "instagram.com", "yelp.com", "yellowpages.com", "bbb.org", "linkedin.com", "mapquest.com", "google.com", "goo.gl", "nextdoor.com", "namesandnumbers.com", "square.site", "tripadvisor.com", "fedlinks.com", "provenexpert.com", "newbizbot.ai", "carrierintel.ai", "fmcsa.dot.gov", "otrucking.com", "brokersnapshot.com", "roserocket.com"];

/** Comparison form only. Dots and plus tags stay because providers treat them differently. */
export function emailIdentity(value) {
  const original = String(value || "").trim();
  let normalized = original.normalize("NFKC").replace(/^mailto:/i, "").split("?")[0].replace(/^<|>$/g, "").trim().toLowerCase();
  if (!normalized || normalized.length > 254 || /[\s<>]/.test(normalized) || !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(normalized)) {
    return { original, normalized: "" };
  }
  return { original, normalized };
}

export function identityKey(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function namesConflict(left, right) {
  const a = identityKey(left);
  const b = identityKey(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (shorter.split(" ").length < 2) return false;
  return ` ${longer} `.includes(` ${shorter} `);
}

export function phoneDigits(value) {
  const labeled = String(value || "").match(/phone:\s*([+\d().\-\s]{7,20})/i);
  const source = labeled ? labeled[1] : String(value || "");
  let digits = source.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length < 7 || digits.length > 15) return "";
  return digits;
}

export function addressKey(value) {
  const labeled = String(value || "").match(/address:\s*([^|]{4,160})/i);
  const source = labeled ? labeled[1] : value;
  return String(source || "").toLowerCase().normalize("NFKC").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

export function businessDomain(value) {
  const raw = String(value || "").trim();
  if (!raw || /@/.test(raw)) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    if (!host || !host.includes(".")) return "";
    if (DIRECTORY_HOSTS.some((directory) => host === directory || host.endsWith(`.${directory}`))) return "";
    return host;
  } catch {
    return "";
  }
}

export function contactHistoryRecord(input, reason) {
  const email = emailIdentity(input?.email || input?.public_email || input?.publicEmail).normalized;
  const phone = phoneDigits(input?.phone || input?.notes || "");
  const host = businessDomain(input?.websiteHost || input?.website_host || "");
  return {
    prospect_id: input?.id || input?.prospect_id || null,
    business_name: String(input?.name || input?.business_name || "").slice(0, 120),
    city: String(input?.city || "").slice(0, 80) || null,
    email: email || null,
    website_host: host || null,
    reason: `${reason}${phone ? ` phone:${phone}` : ""}`.slice(0, 200),
  };
}

function asRecord(row, source) {
  if (typeof row === "string") {
    return { source, id: "", name: "", city: "", email: emailIdentity(row).normalized, phone: "", address: "", websiteHost: "", status: source, sentAt: "" };
  }
  const text = [row?.notes, row?.reason, row?.research_notes].filter(Boolean).join(" ");
  return {
    source,
    id: String(row?.prospect_id || row?.id || ""),
    name: row?.name || row?.business_name || row?.company_name || "",
    reason: String(row?.reason || ""),
    city: row?.city || "",
    email: emailIdentity(row?.email || row?.public_email || row?.publicEmail || "").normalized,
    phone: phoneDigits(row?.phone || text),
    address: addressKey(row?.address || ""),
    websiteHost: businessDomain(row?.websiteHost || row?.website_host || row?.website_url || ""),
    status: row?.status || source,
    sentAt: row?.sentAt || row?.sent_at || "",
  };
}

export function recordsFromExisting(existing = {}) {
  return [
    ...(existing.prospects || []).map((row) => asRecord(row, "prospect")),
    ...(existing.suppressions || []).map((row) => asRecord(row, "suppression")),
    ...(existing.customers || []).map((row) => asRecord(row, "customer")),
    ...(existing.records || []).map((row) => asRecord(row, row?.source || "prospect")),
  ];
}

export function findRecipientMatch(candidate, records, options = {}) {
  const email = emailIdentity(candidate?.email || candidate?.public_email).normalized;
  const name = identityKey(candidate?.name || candidate?.business_name);
  const city = addressKey(candidate?.city);
  const address = addressKey(candidate?.address || "");
  const phone = phoneDigits(candidate?.phone || candidate?.notes || "");
  const host = businessDomain(candidate?.websiteHost || candidate?.website_host || "");
  const ignoreId = String(options.ignoreId || "");
  const list = (records || []).filter((record) => {
    if (ignoreId && record.source === "prospect" && record.id === ignoreId) return false;
    if (ignoreId && record.source === "suppression" && record.id === ignoreId && /^queued\b/i.test(record.reason || "")) return false;
    return true;
  });

  for (const record of list) {
    if (email && record.email && email === record.email) return { kind: "block", reason: "email", record };
  }
  for (const record of list) {
    if (phone && record.phone && phone === record.phone) return { kind: "block", reason: "phone", record };
    if (host && record.websiteHost && host === record.websiteHost) return { kind: "block", reason: "domain", record };
    const recordName = identityKey(record.name);
    const recordCity = addressKey(record.city);
    if (name && recordName && name === recordName && ((city && recordCity && city === recordCity) || (!city && !recordCity))) {
      return { kind: "block", reason: "business", record };
    }
    if (address && record.address && address === record.address && name && recordName && name === recordName) {
      return { kind: "block", reason: "address", record };
    }
  }
  for (const record of list) {
    const recordName = identityKey(record.name);
    if (!name || !recordName || !record.name) continue;
    const recordCity = addressKey(record.city);
    if (name === recordName && city !== recordCity) return { kind: "review", reason: "ambiguous-name", record };
    if (name !== recordName && namesConflict(name, recordName)) return { kind: "review", reason: "ambiguous-name", record };
  }
  return { kind: "new", reason: "", record: null };
}

export async function rememberContact(supabase, input, reason) {
  const record = contactHistoryRecord(input, reason);
  if (!record.email && !record.business_name) return { ok: false, existing: false };
  const { data: existing } = record.email
    ? await supabase.from("prospect_suppressions").select("id,reason").ilike("email", record.email).limit(1)
    : { data: [] };
  if (existing?.[0]?.id) {
    if (/^queued\b/i.test(existing[0].reason || "") && !/^queued\b/i.test(reason)) {
      await supabase.from("prospect_suppressions").update({
        reason: record.reason,
        prospect_id: record.prospect_id,
        business_name: record.business_name,
        city: record.city,
        website_host: record.website_host,
      }).eq("id", existing[0].id);
    }
    return { ok: true, existing: true };
  }
  const { error } = await supabase.from("prospect_suppressions").insert(record);
  if (!error) return { ok: true, existing: false };
  const text = `${error.code || ""} ${error.message || ""}`;
  if (/23505|duplicate/i.test(text)) return { ok: true, existing: true };
  return { ok: false, existing: false };
}

export function duplicateDecision(match) {
  const record = match?.record || {};
  const who = record.name || "an existing record";
  const href = record.source === "prospect" && record.id ? `/admin/prospects/${record.id}` : "";
  const link = href ? ` Existing record: ${href}.` : "";
  if (match?.kind === "review") {
    return {
      result: "review",
      matchId: record.id || "",
      message: `The name is similar to ${who}. Review it before importing. Nothing was changed and it will not be sent automatically.${link}`,
    };
  }
  if (record.source === "customer") {
    return { result: "skip", matchId: "", message: "This email belongs to an existing customer. That record was not changed." };
  }
  if (record.source === "suppression" && /^queued\b/i.test(record.reason || "")) {
    return { result: "skip", matchId: record.id || "", message: `This email is already queued. The existing record was not overwritten.${link}` };
  }
  if (record.source === "suppression" || record.status === "do_not_contact" || record.status === "not_interested" || record.status === "suppressed") {
    return { result: "skip", matchId: record.id || "", message: `This address is suppressed or opted out. It was not reactivated.${link}` };
  }
  if (record.sentAt || record.status === "sent" || record.status === "interested") {
    return { result: "skip", matchId: record.id || "", message: `This recipient was already contacted. The sent record was not reset.${link}` };
  }
  if (match?.reason === "email") {
    return { result: "skip", matchId: record.id || "", message: `This email is already on a prospect. The existing record was not overwritten.${link}` };
  }
  const because = match?.reason === "phone"
    ? "phone number"
    : match?.reason === "domain"
      ? "website domain"
      : "business name and location";
  return {
    result: "skip",
    matchId: record.id || "",
    message: `This matches ${who} by ${because}. A different email was not treated as a new recipient. Nothing was changed.${link}`,
  };
}
