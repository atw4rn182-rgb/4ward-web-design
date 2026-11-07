"use server";

import { revalidatePath } from "next/cache";
import { getAdminUser } from "@/lib/supabase/admin";
import { sendAuthorizedLaunchRecipient } from "@/lib/gmail/mailbox.mjs";

export type LaunchActionState = {
  ok: boolean;
  error: string;
  uncertain: boolean;
  email: string;
  id: string;
  alreadyRecorded: boolean;
  exclusionSaved: boolean;
};

export async function sendAuthorizedLaunchAction(recipientKey: string): Promise<LaunchActionState> {
  const user = await getAdminUser();
  if (!user) {
    return { ok: false, error: "Unauthorized.", uncertain: false, email: "", id: "", alreadyRecorded: false, exclusionSaved: false };
  }
  const result = await sendAuthorizedLaunchRecipient(String(recipientKey || ""));
  revalidatePath("/admin/prospects");
  return {
    ok: Boolean(result.ok),
    error: result.error || "",
    uncertain: Boolean(result.uncertain),
    email: result.email || "",
    id: result.id || "",
    alreadyRecorded: Boolean(result.alreadyRecorded),
    exclusionSaved: result.exclusionSaved !== false,
  };
}
