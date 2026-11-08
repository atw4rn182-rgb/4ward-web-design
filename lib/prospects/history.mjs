import { isOneTimeOutreach, messageIdFromNote, WEBSITE_NOTE } from "./authorized-launch.mjs";
import { buildDraft } from "./research.mjs";

const SEND_STATUS = {
  gmail_accepted: "Accepted by Gmail",
  gmail_refused: "Gmail did not accept the message",
  gmail_uncertain: "Gmail's response was uncertain",
  gmail_sending: "A send was started and has no acceptance yet",
};

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
  const letter = outreachLetter(prospect, mailingAddress);
  return (activity || [])
    .filter((event) => SEND_STATUS[event?.event_type])
    .map((event) => ({
      id: event.id,
      status: SEND_STATUS[event.event_type],
      at: event.created_at || "",
      messageId: messageIdFromNote(event.note),
      note: String(event.note || ""),
      subject: event.event_type === "gmail_accepted" ? letter?.subject || "" : "",
      body: event.event_type === "gmail_accepted" ? letter?.body || "" : "",
    }));
}
