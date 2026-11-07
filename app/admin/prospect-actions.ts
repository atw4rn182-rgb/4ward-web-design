"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { getAdminUser } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  statusTimestampColumn,
  suppressesOutreach,
  suppressionOr,
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

function missingFunction(error: { code?: string; message?: string } | null) {
  return /PGRST202|42883|could not find the function/i.test(`${error?.code || ""} ${error?.message || ""}`);
}

function schemaMessage(error: { code?: string; message?: string } | null) {
  const text = `${error?.code || ""} ${error?.message || ""}`;
  if (/23505|duplicate/i.test(text)) return "That business is already in the prospect list.";
  if (/PGRST205|42P01|could not find the table|does not exist|schema cache/i.test(text)) {
    return "The prospect tables are not ready. Review migration 011 before saving. Nothing was emailed.";
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

async function addProspectInTables(
  client: SupabaseClient,
  value: {
    businessName: string;
    city: string;
    websiteUrl: string;
    websiteHost: string;
    email: string;
    notes: string;
  }
): Promise<ProspectActionState> {
  const blockedFilter = suppressionOr(value);
  if (blockedFilter) {
    const { data: blocked, error: blockError } = await client
      .from("prospect_suppressions")
      .select("id")
      .or(blockedFilter)
      .limit(1);
    const blockedSchema = schemaMessage(blockError);
    if (blockError && blockedSchema) return { error: blockedSchema };
    if (blockError) return { error: "Unable to check the do-not-contact list." };
    if (blocked?.length) {
      return { error: "This business is on the do-not-contact list and was not added." };
    }
  }

  const { data: created, error: insertError } = await client
    .from("prospects")
    .insert({
      business_name: value.businessName,
      city: value.city || null,
      website_url: value.websiteUrl || null,
      website_host: value.websiteHost || null,
      public_email: value.email || null,
      notes: value.notes || null,
      status: "queued",
      source: "manual",
      manual_priority: true,
      outreach_eligible: false,
    })
    .select("id")
    .single();
  const insertSchema = schemaMessage(insertError);
  if (insertError && insertSchema) return { error: insertSchema };
  if (insertError || !created) return { error: "Unable to add the business." };

  await client.from("prospect_activity").insert({
    prospect_id: created.id,
    event_type: "queued",
    to_status: "queued",
    note: "Added manually. Priority is set for the next scheduled batch. No email was sent.",
  });
  revalidateProspects(created.id);
  return { ok: true, message: "Business added to the queue. No email was sent." };
}

async function updateStatusInTables(
  client: SupabaseClient,
  id: string,
  status: string,
  eligible: boolean,
  note: string
): Promise<ProspectActionState> {
  const { data: current, error: readError } = await client
    .from("prospects")
    .select("id,status,business_name,city,public_email,website_host")
    .eq("id", id)
    .maybeSingle();
  const readSchema = schemaMessage(readError);
  if (readError && readSchema) return { error: readSchema };
  if (readError || !current) return { error: "Prospect not found." };

  const nextEligible = suppressesOutreach(status) ? false : eligible;
  const stamp = statusTimestampColumn(status);
  const now = new Date().toISOString();
  const patch: Record<string, string | boolean> = {
    status,
    outreach_eligible: nextEligible,
    last_activity_at: now,
  };
  if (stamp) patch[stamp] = now;

  const { error: updateError } = await client.from("prospects").update(patch).eq("id", id);
  const updateSchema = schemaMessage(updateError);
  if (updateError && updateSchema) return { error: updateSchema };
  if (updateError) return { error: "Unable to save that change." };

  await client.from("prospect_activity").insert({
    prospect_id: id,
    event_type: "status",
    from_status: current.status,
    to_status: status,
    note: note || "Status updated. No email was sent.",
  });

  if (suppressesOutreach(status)) {
    const filter = suppressionOr({
      businessName: current.business_name,
      city: current.city || "",
      email: current.public_email || "",
      websiteHost: current.website_host || "",
    });
    const { data: existing } = filter
      ? await client.from("prospect_suppressions").select("id").or(filter).limit(1)
      : { data: [] };
    if (!existing?.length) {
      await client.from("prospect_suppressions").insert({
        prospect_id: id,
        business_name: current.business_name,
        city: current.city,
        email: current.public_email,
        website_host: current.website_host,
        reason: status,
      });
    }
  }

  revalidateProspects(id);
  return { ok: true, message: "Status saved. No email was sent." };
}

async function updateResearchInTables(
  client: SupabaseClient,
  id: string,
  value: {
    businessName: string;
    city: string;
    serviceArea: string;
    industry: string;
    websiteUrl: string;
    websiteHost: string;
    publicEmail: string;
    secondaryEmail: string;
    researchNotes: string;
    researchSources: string;
    websiteOpportunities: string;
    gbpObservations: string;
    researchConfidence: string;
    outreachEligible: boolean;
    notes: string;
  },
  researchedAt: string | null
): Promise<ProspectActionState> {
  const { data: existing, error: readError } = await client
    .from("prospects")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  const readSchema = schemaMessage(readError);
  if (readError && readSchema) return { error: readSchema };
  if (readError || !existing) return { error: "Prospect not found." };

  const { error: updateError } = await client
    .from("prospects")
    .update({
      business_name: value.businessName,
      city: value.city || null,
      service_area: value.serviceArea || null,
      industry: value.industry || null,
      website_url: value.websiteUrl || null,
      website_host: value.websiteHost || null,
      public_email: value.publicEmail || null,
      secondary_email: value.secondaryEmail || null,
      research_notes: value.researchNotes || null,
      research_sources: value.researchSources || null,
      website_opportunities: value.websiteOpportunities || null,
      gbp_observations: value.gbpObservations || null,
      researched_at: researchedAt,
      research_confidence: value.researchConfidence || null,
      outreach_eligible: value.outreachEligible,
      notes: value.notes || null,
      last_activity_at: new Date().toISOString(),
    })
    .eq("id", id);
  const updateSchema = schemaMessage(updateError);
  if (updateError && updateSchema) return { error: updateSchema };
  if (updateError) return { error: "Unable to save that change." };

  await client.from("prospect_activity").insert({
    prospect_id: id,
    event_type: "research",
    note: "Research summary saved. No email was sent.",
  });
  revalidateProspects(id);
  return { ok: true, message: "Research saved." };
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
  if (missingFunction(rpcError)) return addProspectInTables(client, parsed.value);
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
  if (missingFunction(rpcError)) return updateStatusInTables(client, id, status, eligible, note);
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
  if (missingFunction(rpcError)) return updateResearchInTables(client, id, parsed.value, researchedAt);
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
  if (missingFunction(rpcError)) {
    const { error: saveError } = await client
      .from("outreach_settings")
      .update({
        automation_enabled: parsed.value.automation_enabled,
        manual_priority: parsed.value.manual_priority,
        mailing_address: parsed.value.mailing_address || null,
      })
      .eq("id", 1);
    const saveSchema = schemaMessage(saveError);
    if (saveError && saveSchema) return { error: saveSchema };
    if (saveError) return { error: "Unable to save that change." };
    revalidateProspects();
    return {
      ok: true,
      message: parsed.value.automation_enabled
        ? "Automation is marked on. The scheduler is still off, so no emails will be sent."
        : "Automation is paused. No emails will be sent.",
    };
  }
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
  if (missingFunction(rpcError)) {
    const cutoff = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
    const { error: deleteError, count } = await client
      .from("prospect_activity")
      .delete({ count: "exact" })
      .lt("created_at", cutoff)
      .or("to_status.is.null,and(to_status.neq.not_interested,to_status.neq.do_not_contact)");
    const deleteSchema = schemaMessage(deleteError);
    if (deleteError && deleteSchema) return { error: deleteSchema };
    if (deleteError) return { error: "Unable to clean up old logs." };
    revalidateProspects();
    return {
      ok: true,
      message: `Removed ${count || 0} old log entries. Suppression records were kept.`,
    };
  }
  const schema = schemaMessage(rpcError);
  if (rpcError && schema) return { error: schema };
  if (rpcError || !data?.ok) return { error: "Unable to clean up old logs." };

  revalidateProspects();
  return {
    ok: true,
    message: `Removed ${data.activityDeleted || 0} old log entries. Suppression records were kept.`,
  };
}
