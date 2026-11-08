import { isOneTimeOutreach, messageIdFromNote, WEBSITE_NOTE } from "./authorized-launch.mjs";
import { buildDraft } from "./research.mjs";

const SEND_STATUS = {
  gmail_accepted: "Accepted by Gmail",
  gmail_refused: "Gmail did not accept the message",
  gmail_uncertain: "Gmail's response was uncertain",
  gmail_sending: "A send was started and has no acceptance yet",
};

export function readSnapshot(note) {
  try {
    const parsed = JSON.parse(String(note || ""));
    if (!parsed?.templateVersion || !parsed.recipient || !parsed.subject || !parsed.text || !parsed.html) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function snapshotIdFromNote(note) {
  const match = String(note || "").match(/Snapshot: ([0-9a-f-]{36})/i);
  return match ? match[1] : "";
}

export function outreachLetter(prospect, mailingAddress) {
  const email = String(prospect?.public_email || prospect?.email || "").trim();
  if (!email) return null;
  const oneTime = isOneTimeOutreach(prospect?.notes);
  const websiteHost = String(prospect?.website_host || prospect?.websiteHost || "").trim();
  return buildDraft({
    qualification: "qualified",
    email,
    businessName: prospect?.business_name || prospect?.businessName || "",
    industry: prospect?.industry || "",
    city: prospect?.city || "",
    websiteHost,
    websiteLine: oneTime || websiteHost ? "" : WEBSITE_NOTE,
    mailingAddress,
  });
}

/** Read-only history. This does not contact Gmail or send mail. */
export function outreachHistory(activity, prospect, mailingAddress) {
  const events = activity || [];
  const snapshots = new Map();
  for (const event of events) {
    if (event?.event_type !== "email_snapshot") continue;
    const parsed = readSnapshot(event.note);
    if (parsed) snapshots.set(event.id, parsed);
  }
  const letter = outreachLetter(prospect, mailingAddress);
  return events
    .filter((event) => SEND_STATUS[event?.event_type])
    .map((event) => {
      const saved = snapshots.get(snapshotIdFromNote(event.note));
      const accepted = event.event_type === "gmail_accepted";
      return {
        id: event.id,
        status: SEND_STATUS[event.event_type],
        at: event.created_at || "",
        messageId: messageIdFromNote(event.note),
        note: String(event.note || ""),
        subject: saved?.subject || (accepted ? letter?.subject || "" : ""),
        body: saved?.text || (accepted ? letter?.body || "" : ""),
        html: saved?.html || "",
        recipient: saved?.recipient || "",
        templateVersion: saved?.templateVersion || "",
        origin: saved ? "snapshot" : accepted && letter?.body ? "reconstructed" : "",
      };
    });
}
