"use server";

import { revalidatePath } from "next/cache";
import { getAdminUser } from "@/lib/supabase/admin";
import { disconnectMailbox, sendMailboxTest, sendSampleOutreach } from "@/lib/gmail/mailbox.mjs";
import { testRecipient } from "@/lib/gmail/oauth.mjs";

export type GmailActionState = { ok?: boolean; error?: string; message?: string };

export async function disconnectGmailAction(_prev: GmailActionState): Promise<GmailActionState> {
  const user = await getAdminUser();
  if (!user) return { error: "Unauthorized." };
  const result = await disconnectMailbox();
  if (!result.ok) return { error: result.error || "The mailbox could not be disconnected." };
  revalidatePath("/admin/prospects");
  return { ok: true, message: "Gmail is disconnected. Automatic outreach is still off." };
}

export async function sendGmailTestAction(_prev: GmailActionState): Promise<GmailActionState> {
  const user = await getAdminUser();
  if (!user) return { error: "Unauthorized." };
  const recipient = testRecipient(user);
  if (!recipient.ok) return { error: recipient.error };
  const result = await sendMailboxTest(recipient.email);
  if (!result.ok) return { error: result.error || "Gmail did not accept the test." };
  return { ok: true, message: result.message };
}

export async function sendSampleOutreachAction(_prev: GmailActionState): Promise<GmailActionState> {
  const user = await getAdminUser();
  if (!user) return { error: "Unauthorized." };
  const recipient = testRecipient(user);
  if (!recipient.ok) return { error: recipient.error };
  const result = await sendSampleOutreach();
  if (!result.ok || !result.id) return { error: result.error || "Gmail did not accept the sample." };
  return {
    ok: true,
    message: `Gmail accepted the sample. Message ID: ${result.id}. Inbox delivery was not checked.`,
  };
}
