import { buildConsultationInternalBody, consultationInternalSubject } from "@/lib/email/consultation-emails";
import { markEmailFailed, markEmailSent, shouldSendEmail } from "@/lib/email/idempotency";
import { sendConsultationInternalEmail } from "@/lib/email/static-forms";

export async function deliverConsultationEmail(row) {
  if (!row || !row.id) return { ok: false, error: "Consultation record missing." };
  const eventKey = `consultation_internal:${row.id}`;
  if (!(await shouldSendEmail(eventKey))) {
    return { ok: true, skipped: true, reason: "already_sent" };
  }
  try {
    await sendConsultationInternalEmail({
      subject: consultationInternalSubject(row),
      replyTo: row.email,
      contactName: row.contact_name,
      message: buildConsultationInternalBody(row),
      consultationId: row.id,
    });
    await markEmailSent(eventKey, "consultation_internal", row.email, {
      consultationId: row.id,
      tier: row.preferred_tier || "",
    });
    return { ok: true };
  } catch (error) {
    const message = error && error.message ? error.message : "Consultation email failed";
    await markEmailFailed(eventKey, "consultation_internal", row.email, message, {
      consultationId: row.id,
    });
    return { ok: false, error: message };
  }
}
