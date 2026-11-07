/** The five messages an administrator may send once. Weekday automation is separate. */
export const WEBSITE_NOTE = "No business-owned website found.";

export const AUTHORIZED_LAUNCH = [
  {
    key: "artesia-plumbing",
    businessName: "Artesia Plumbing Heating & Cooling",
    city: "Artesia",
    industry: "plumbing",
    email: "artesiaplumbing@gmail.com",
    sourceUrl: "https://www.namesandnumbers.com/biz/27183/artesia-plumbing-heating-cooling",
    oneTime: false,
  },
  {
    key: "bobs-auto-body",
    businessName: "Bob's Auto Body",
    city: "Artesia",
    industry: "auto body",
    email: "bobsautobody2711@yahoo.com",
    sourceUrl: "https://www.namesandnumbers.com/biz/27223/bobs-auto-body",
    oneTime: false,
  },
  {
    key: "american-pump",
    businessName: "American Pump & Supply",
    city: "Lovington",
    industry: "pump repair",
    email: "lesliesooter@windstream.net",
    sourceUrl: "https://www.namesandnumbers.com/biz/15570/american-pump-supply",
    oneTime: false,
  },
  {
    key: "morenos-electric",
    businessName: "Moreno's Electric LLC",
    city: "Artesia",
    industry: "electrical",
    email: "morenoelectric1@pvtn.net",
    sourceUrl: "https://www.namesandnumbers.com/biz/27250/morenos-electric-llc",
    oneTime: false,
  },
  {
    key: "nereece-one-time",
    businessName: "Nereece",
    city: "Carlsbad",
    industry: "",
    email: "nereecerodriguez956@gmail.com",
    sourceUrl: "",
    oneTime: true,
  },
];

export const GMAIL_CONFIG_ERROR =
  "Gmail is not configured. Required variables: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GMAIL_TOKEN_ENCRYPTION_KEY.";

export function isOneTimeOutreach(notes) {
  return /one-time test/i.test(String(notes || ""));
}

export function launchRecipient(key) {
  return AUTHORIZED_LAUNCH.find((item) => item.key === String(key || "")) || null;
}

export function earlierLaunchRecipients(key) {
  const index = AUTHORIZED_LAUNCH.findIndex((item) => item.key === key);
  if (index < 0) return [];
  return AUTHORIZED_LAUNCH.slice(0, index);
}

export function messageIdFromNote(note) {
  const match = String(note || "").match(/Message ID: ([A-Za-z0-9_-]{6,128})/);
  return match ? match[1] : "";
}

export function classifyLaunchActivity(rows) {
  const events = Array.isArray(rows) ? rows : [];
  const accepted = events.find((row) => row?.event_type === "gmail_accepted" && messageIdFromNote(row?.note));
  const acceptedId = accepted ? messageIdFromNote(accepted.note) : "";
  if (acceptedId) return { acceptedId, accepted: true, uncertain: false, refused: false };
  if (events.some((row) => row?.event_type === "gmail_uncertain")) {
    return { acceptedId: "", accepted: false, uncertain: true, refused: false };
  }
  if (events.some((row) => row?.event_type === "gmail_refused")) {
    return { acceptedId: "", accepted: false, uncertain: false, refused: true };
  }
  if (events.some((row) => row?.event_type === "gmail_sending")) {
    return { acceptedId: "", accepted: false, uncertain: true, refused: false };
  }
  return { acceptedId: "", accepted: false, uncertain: false, refused: false };
}

/**
 * Explicit authorization allows one send when outreach_eligible is false.
 * A one-time test also needs authorizedOneTime. Suppression, customers,
 * duplicates, and an uncertain result are never bypassed.
 */
export function launchSendInput(recipient, record = {}) {
  const oneTime = Boolean(recipient?.oneTime) || isOneTimeOutreach(record.notes);
  return {
    email: recipient.email,
    businessName: record.businessName || recipient.businessName,
    city: record.city || recipient.city,
    industry: record.industry || recipient.industry || "",
    websiteHost: record.websiteHost || "",
    websiteLine: recipient.oneTime ? "" : WEBSITE_NOTE,
    suppressed: Boolean(record.suppressed),
    existingCustomer: Boolean(record.existingCustomer),
    duplicate: Boolean(record.duplicate),
    status: record.status || "",
    sentAt: record.sentAt || "",
    oneTimeExcluded: oneTime,
    authorizedOneTime: Boolean(recipient.oneTime),
    explicitlyAuthorized: true,
    outreachEligible: record.outreachEligible === true,
    uncertainRecorded: Boolean(record.uncertainRecorded),
    refusedRecorded: Boolean(record.refusedRecorded),
  };
}
