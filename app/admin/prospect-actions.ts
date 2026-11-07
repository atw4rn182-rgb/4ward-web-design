"use server";

import { revalidatePath } from "next/cache";
import { getAdminUser } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  validateManualProspect,
  validateOutreachSettings,
  validateResearch,
  validateStatusChange,
} from "@/lib/prospects/model.mjs";

export type ProspectActionState = {
  ok?: boolean;
  error?: string;
  message?: string;
};

async function adminWriteClient() {
  const user = await getAdminUser();
  if (!user) return { error: "Unauthorized.", client: null };
  const client = createServiceClient() || (await createClient());
  return { error: null as string | null, client };
}

function schemaMessage(error: { code?: string; message?: string } | null) {
  const text = `${error?.code || ""} ${error?.message || ""}`;
  if (/PGRST202|PGRST205|42883|42P01|does not exist|schema cache/i.test(text)) {
    return "The prospect tables are not ready. Review and run migrations 011 and 012 before saving. Nothing was emailed.";
  }
  return "";
}

function resultMessage(code: string) {
  if (code === "suppressed") {
    return "This business is on the do-not-contact list and was not added.";
  }
  if (code === "duplicate") return "That business is already in the prospect list.";
  if (code === "not_eligible") {
    return "Mark the business eligible for outreach before setting it to Ready.";
  }
  if (code === "missing") return "Prospect not found.";
  return "Unable to save that change.";
}

function revalidateProspects(id?: string) {
  revalidatePath("/admin/prospects");
  if (id) revalidatePath(`/admin/prospects/${id}`);
}

export async function addProspectAction(
  _prev: ProspectActionState,
  formData: FormData
): Promise<ProspectActionState> {
  const parsed = validateManualProspect({
    businessName: formData.get("businessName"),
    city: formData.get("city"),
    website: formData.get("website"),
    email: formData.get("email"),
    notes: formData.get("notes"),
  });
  if (!parsed.ok) return { error: parsed.errors[0] };

  const { error, client } = await adminWriteClient();
  if (error || !client) return { error: error || "Unauthorized." };

  const { data, error: rpcError } = await client.rpc("admin_add_prospect", {
    p_business_name: parsed.value.businessName,
    p_city: parsed.value.city,
    p_website_url: parsed.value.websiteUrl,
    p_website_host: parsed.value.websiteHost,
    p_email: parsed.value.email,
    p_notes: parsed.value.notes,
  });
  const schema = schemaMessage(rpcError);
  if (rpcError && schema) return { error: schema };
  if (rpcError || !data?.ok) return { error: resultMessage(data?.error || "") };

  revalidateProspects(data.id);
  return { ok: true, message: "Business added to the queue. No email was sent." };
}

export async function updateProspectStatusAction(
  _prev: ProspectActionState,
  formData: FormData
): Promise<ProspectActionState> {
  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "");
  const eligible = formData.get("outreachEligible") === "on";
  const note = String(formData.get("note") || "").trim().slice(0, 500);
  const check = validateStatusChange(status, eligible);
  if (!id || !check.ok) return { error: check.error || "Choose a prospect." };

  const { error, client } = await adminWriteClient();
  if (error || !client) return { error: error || "Unauthorized." };

  const { data, error: rpcError } = await client.rpc("admin_update_prospect_status", {
    p_id: id,
    p_status: status,
    p_eligible: eligible,
    p_note: note,
  });
  const schema = schemaMessage(rpcError);
  if (rpcError && schema) return { error: schema };
  if (rpcError || !data?.ok) return { error: resultMessage(data?.error || "") };

  revalidateProspects(id);
  return { ok: true, message: "Status saved. No email was sent." };
}

export async function updateProspectResearchAction(
  _prev: ProspectActionState,
  formData: FormData
): Promise<ProspectActionState> {
  const id = String(formData.get("id") || "");
  const parsed = validateResearch({
    businessName: formData.get("businessName"),
    city: formData.get("city"),
    serviceArea: formData.get("serviceArea"),
    industry: formData.get("industry"),
    website: formData.get("website"),
    publicEmail: formData.get("publicEmail"),
    secondaryEmail: formData.get("secondaryEmail"),
    researchNotes: formData.get("researchNotes"),
    researchSources: formData.get("researchSources"),
    websiteOpportunities: formData.get("websiteOpportunities"),
    gbpObservations: formData.get("gbpObservations"),
    researchedAt: formData.get("researchedAt"),
    researchConfidence: formData.get("researchConfidence"),
    outreachEligible: formData.get("outreachEligible"),
    notes: formData.get("notes"),
  });
  if (!id) return { error: "Choose a prospect." };
  if (!parsed.ok) return { error: parsed.errors[0] };
  if (parsed.value.businessName.length < 2) return { error: "Enter the business name." };

  const researchedAt = parsed.value.researchedAt
    ? new Date(`${parsed.value.researchedAt}T12:00:00`).toISOString()
    : null;
  if (parsed.value.researchedAt && Number.isNaN(new Date(researchedAt || "").getTime())) {
    return { error: "Research date is not valid." };
  }

  const { error, client } = await adminWriteClient();
  if (error || !client) return { error: error || "Unauthorized." };

  const { data, error: rpcError } = await client.rpc("admin_update_prospect_research", {
    p_id: id,
    p_business_name: parsed.value.businessName,
    p_city: parsed.value.city,
    p_service_area: parsed.value.serviceArea,
    p_industry: parsed.value.industry,
    p_website_url: parsed.value.websiteUrl,
    p_website_host: parsed.value.websiteHost,
    p_public_email: parsed.value.publicEmail,
    p_secondary_email: parsed.value.secondaryEmail,
    p_research_notes: parsed.value.researchNotes,
    p_research_sources: parsed.value.researchSources,
    p_website_opportunities: parsed.value.websiteOpportunities,
    p_gbp_observations: parsed.value.gbpObservations,
    p_researched_at: researchedAt,
    p_research_confidence: parsed.value.researchConfidence || null,
    p_outreach_eligible: parsed.value.outreachEligible,
    p_notes: parsed.value.notes,
  });
  const schema = schemaMessage(rpcError);
  if (rpcError && schema) return { error: schema };
  if (rpcError || !data?.ok) return { error: resultMessage(data?.error || "") };

  revalidateProspects(id);
  return { ok: true, message: "Research saved." };
}

export async function saveOutreachSettingsAction(
  _prev: ProspectActionState,
  formData: FormData
): Promise<ProspectActionState> {
  const parsed = validateOutreachSettings({
    automationEnabled: formData.get("automationEnabled"),
    manualPriority: formData.get("manualPriority"),
    mailingAddress: formData.get("mailingAddress"),
  });
  if (!parsed.ok || !parsed.value) return { error: parsed.error };

  const { error, client } = await adminWriteClient();
  if (error || !client) return { error: error || "Unauthorized." };

  const { data, error: rpcError } = await client.rpc("admin_save_outreach_settings", {
    p_enabled: parsed.value.automation_enabled,
    p_manual_priority: parsed.value.manual_priority,
    p_mailing_address: parsed.value.mailing_address,
  });
  const schema = schemaMessage(rpcError);
  if (rpcError && schema) return { error: schema };
  if (rpcError || !data?.ok) return { error: resultMessage(data?.error || "") };

  revalidateProspects();
  return {
    ok: true,
    message: parsed.value.automation_enabled
      ? "Automation is marked on. The scheduler is still off, so no emails will be sent."
      : "Automation is paused. No emails will be sent.",
  };
}

export async function cleanupProspectLogsAction(
  _prev: ProspectActionState
): Promise<ProspectActionState> {
  const { error, client } = await adminWriteClient();
  if (error || !client) return { error: error || "Unauthorized." };

  const { data, error: rpcError } = await client.rpc("cleanup_prospect_operations");
  const schema = schemaMessage(rpcError);
  if (rpcError && schema) return { error: schema };
  if (rpcError || !data?.ok) return { error: "Unable to clean up old logs." };

  revalidateProspects();
  return {
    ok: true,
    message: `Removed ${data.activityDeleted || 0} old log entries. Suppression records were kept.`,
  };
}
