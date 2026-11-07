"use server";

import { revalidatePath } from "next/cache";
import { getAdminUser } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  findDuplicate,
  findSuppression,
  statusTimestampColumn,
  suppressesOutreach,
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
  if (/PGRST205|42P01|does not exist|schema cache/i.test(text)) {
    return "The prospect tables are not in the database yet. Review and run migration 011 before saving. Nothing was emailed.";
  }
  if (/23505|duplicate/i.test(text)) {
    return "A prospect with that business, website, or email already exists.";
  }
  return "";
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

  const { data: existing, error: existingError } = await client
    .from("prospects")
    .select("id, business_name, city, public_email, website_host, website_url");
  const existingSchema = schemaMessage(existingError);
  if (existingError && existingSchema) return { error: existingSchema };
  if (existingError) return { error: "Unable to check existing prospects." };

  const { data: suppressed, error: suppressionError } = await client
    .from("prospect_suppressions")
    .select("business_name, city, email, website_host, reason");
  const suppressionSchema = schemaMessage(suppressionError);
  if (suppressionError && suppressionSchema) return { error: suppressionSchema };
  if (suppressionError) return { error: "Unable to check the do-not-contact list." };

  const blocked = findSuppression(suppressed || [], parsed.value);
  if (blocked) {
    return { error: "This business is on the do-not-contact list and was not added." };
  }
  const duplicate = findDuplicate(existing || [], parsed.value);
  if (duplicate) {
    return { error: "That business is already in the prospect list." };
  }

  const now = new Date().toISOString();
  const { data: created, error: insertError } = await client
    .from("prospects")
    .insert({
      business_name: parsed.value.businessName,
      city: parsed.value.city || null,
      website_url: parsed.value.websiteUrl || null,
      website_host: parsed.value.websiteHost || null,
      public_email: parsed.value.email || null,
      notes: parsed.value.notes || null,
      status: "queued",
      source: "manual",
      manual_priority: true,
      outreach_eligible: false,
      last_activity_at: now,
      queued_at: now,
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

export async function updateProspectStatusAction(
  _prev: ProspectActionState,
  formData: FormData
): Promise<ProspectActionState> {
  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "");
  const eligible = formData.get("outreachEligible") === "on";
  const note = String(formData.get("note") || "").trim();
  const check = validateStatusChange(status, eligible);
  if (!id || !check.ok) return { error: check.error || "Choose a prospect." };

  const { error, client } = await adminWriteClient();
  if (error || !client) return { error: error || "Unauthorized." };

  const { data: current, error: readError } = await client
    .from("prospects")
    .select("id, status, business_name, city, public_email, website_host")
    .eq("id", id)
    .maybeSingle();
  const readSchema = schemaMessage(readError);
  if (readError && readSchema) return { error: readSchema };
  if (readError || !current) return { error: "Prospect not found." };

  const now = new Date().toISOString();
  const patch: Record<string, string | boolean | null> = {
    status,
    outreach_eligible: suppressesOutreach(status) ? false : eligible,
    last_activity_at: now,
  };
  const stamp = statusTimestampColumn(status);
  if (stamp) patch[stamp] = now;

  const { error: updateError } = await client.from("prospects").update(patch).eq("id", id);
  const updateSchema = schemaMessage(updateError);
  if (updateError && updateSchema) return { error: updateSchema };
  if (updateError) return { error: "Unable to update the status." };

  await client.from("prospect_activity").insert({
    prospect_id: id,
    event_type: "status",
    from_status: current.status,
    to_status: status,
    note: note || "Status updated. No email was sent.",
  });

  if (suppressesOutreach(status)) {
    const { data: already } = await client
      .from("prospect_suppressions")
      .select("business_name, city, email, website_host");
    const covered = findSuppression(already || [], {
      businessName: current.business_name,
      city: current.city,
      email: current.public_email,
      websiteHost: current.website_host,
    });
    if (!covered) {
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

  const { error, client } = await adminWriteClient();
  if (error || !client) return { error: error || "Unauthorized." };

  const researchedAt = parsed.value.researchedAt
    ? new Date(`${parsed.value.researchedAt}T12:00:00`).toISOString()
    : null;
  if (parsed.value.researchedAt && Number.isNaN(new Date(researchedAt || "").getTime())) {
    return { error: "Research date is not valid." };
  }

  const now = new Date().toISOString();
  const { error: updateError } = await client
    .from("prospects")
    .update({
      business_name: parsed.value.businessName,
      city: parsed.value.city || null,
      service_area: parsed.value.serviceArea || null,
      industry: parsed.value.industry || null,
      website_url: parsed.value.websiteUrl || null,
      website_host: parsed.value.websiteHost || null,
      public_email: parsed.value.publicEmail || null,
      secondary_email: parsed.value.secondaryEmail || null,
      research_notes: parsed.value.researchNotes || null,
      research_sources: parsed.value.researchSources || null,
      website_opportunities: parsed.value.websiteOpportunities || null,
      gbp_observations: parsed.value.gbpObservations || null,
      researched_at: researchedAt,
      research_confidence: parsed.value.researchConfidence || null,
      outreach_eligible: parsed.value.outreachEligible,
      notes: parsed.value.notes || null,
      last_activity_at: now,
    })
    .eq("id", id);

  const updateSchema = schemaMessage(updateError);
  if (updateError && updateSchema) return { error: updateSchema };
  if (updateError) return { error: "Unable to save research." };

  await client.from("prospect_activity").insert({
    prospect_id: id,
    event_type: "research",
    note: "Research notes saved. No contact details were generated and no email was sent.",
  });

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

  const { error: updateError } = await client
    .from("outreach_settings")
    .update({
      automation_enabled: parsed.value.automation_enabled,
      weekday_target: parsed.value.weekday_target,
      timezone: parsed.value.timezone,
      send_hour: parsed.value.send_hour,
      send_minute: parsed.value.send_minute,
      weekdays: parsed.value.weekdays,
      manual_priority: parsed.value.manual_priority,
      mailing_address: parsed.value.mailing_address || null,
    })
    .eq("id", 1);

  const updateSchema = schemaMessage(updateError);
  if (updateError && updateSchema) return { error: updateSchema };
  if (updateError) return { error: "Unable to save outreach settings." };

  revalidateProspects();
  return {
    ok: true,
    message: parsed.value.automation_enabled
      ? "Automation is marked on. The scheduler is still off, so no emails will be sent."
      : "Automation is paused. No emails will be sent.",
  };
}
