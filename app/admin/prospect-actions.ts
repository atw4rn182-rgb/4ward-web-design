"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { getAdminUser } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  statusTimestampColumn,
  suppressesOutreach,
  WEEKDAY_TARGET,
  suppressionOr,
  monthlyOutreachVolume,
  validateManualProspect,
  validateOutreachSettings,
  validateResearch,
  validateStatusChange,
} from "@/lib/prospects/model.mjs";
import {
  RESEARCH_BATCH_LIMIT,
  RESEARCH_DEADLINE_MS,
  RESEARCH_FAILURE_LIMIT,
  isQualification,
  packResearchRecord,
  qualificationLabel,
  selectResearchBatch,
  suppressionMatches,
} from "@/lib/prospects/research.mjs";
import { readOwnWebsite, researchFromRecord } from "@/lib/prospects/research-run.mjs";
import { classifyImport, importNotes, parseProspectList } from "@/lib/prospects/import.mjs";
import { assignQueueTimes, QUEUE_PAUSE_NOTE } from "@/lib/prospects/queue.mjs";

export type ImportPreviewRow = {
  line: number;
  name: string;
  email: string;
  source: string;
  city?: string;
  phone?: string;
  notes?: string;
  result: "import" | "skip" | "review";
  message: string;
};

export type ProspectActionState = {
  ok?: boolean;
  error?: string;
  message?: string;
  weekdayTarget?: number;
  preview?: ImportPreviewRow[];
  summary?: { imported: number; skipped: number; review: number; batchId: string };
  counts?: { import: number; skip: number; review: number };
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
  const qualification = String(formData.get("qualification") || "");
  const draftBody = String(formData.get("draftBody") || "").trim();
  if (draftBody.length > 2000) return { error: "The draft is too long." };
  if (qualification && !isQualification(qualification)) return { error: "Choose a valid qualification." };
  const packed = packResearchRecord({
    qualification,
    reason: formData.get("qualificationReason"),
    summary: parsed.value.researchNotes,
    sources: parsed.value.researchSources,
    factualNotes: formData.get("factualNotes") || parsed.value.websiteOpportunities,
    draftSubject: formData.get("draftSubject"),
    draftBody,
    listingNote: parsed.value.gbpObservations,
    confidence: parsed.value.researchConfidence,
    email: parsed.value.publicEmail,
    industry: parsed.value.industry,
  });
  parsed.value.researchNotes = packed.research_notes;
  parsed.value.websiteOpportunities = packed.website_opportunities;
  parsed.value.gbpObservations = packed.gbp_observations || parsed.value.gbpObservations;
  if (["suppressed", "not_qualified", "no_verified_contact"].includes(qualification)) {
    parsed.value.outreachEligible = false;
  }
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

function settingsSavedMessage(
  value: { automation_enabled: boolean; weekday_target: number },
  targetLocked: boolean
) {
  const pause = value.automation_enabled
    ? "Automation is on. Weekday sending stays at 9:00 AM America/Denver."
    : "Automation is paused. No emails will be sent.";
  if (targetLocked) {
    return `${pause} The daily target is still locked at 5 until migration 013 is approved. Nothing was sent.`;
  }
  return `${pause} Daily target is ${value.weekday_target} submitted emails per weekday, about ${monthlyOutreachVolume(value.weekday_target)} per month. Nothing was sent.`;
}

async function persistOutreachSettings(
  client: SupabaseClient,
  value: { automation_enabled: boolean; weekday_target: number; manual_priority: boolean; mailing_address: string }
) {
  const base = {
    automation_enabled: value.automation_enabled,
    manual_priority: value.manual_priority,
    mailing_address: value.mailing_address || null,
    weekday_target: value.weekday_target,
  };
  const { error } = await client.from("outreach_settings").update(base).eq("id", 1);
  const checkViolation = error?.code === "23514" || /23514|check constraint/i.test(`${error?.code || ""} ${error?.message || ""}`);
  if (checkViolation) {
    const { error: retryError } = await client
      .from("outreach_settings")
      .update({
        automation_enabled: value.automation_enabled,
        manual_priority: value.manual_priority,
        mailing_address: value.mailing_address || null,
      })
      .eq("id", 1);
    const schema = schemaMessage(retryError);
    if (retryError && schema) return { error: schema, targetLocked: false };
    if (retryError) return { error: "Unable to save that change.", targetLocked: false };
    return { error: null as string | null, targetLocked: true };
  }
  const schema = schemaMessage(error);
  if (error && schema) return { error: schema, targetLocked: false };
  if (error) return { error: "Unable to save that change.", targetLocked: false };
  return { error: null as string | null, targetLocked: false };
}

export async function saveOutreachSettingsAction(
  _prev: ProspectActionState,
  formData: FormData
): Promise<ProspectActionState> {
  const parsed = validateOutreachSettings({
    automationEnabled: formData.get("automationEnabled"),
    pauseAutomation: formData.get("pauseAutomation"),
    weekdayTarget: formData.get("weekdayTarget"),
    manualPriority: formData.get("manualPriority"),
    mailingAddress: formData.get("mailingAddress"),
  });
  if (!parsed.ok || !parsed.value) return { error: parsed.error };
  if (parsed.value.automation_enabled && formData.get("confirmOutreach") !== "on") {
    return { error: "Confirm weekday sending before saving with automation on. Nothing was changed." };
  }

  const { error, client } = await adminWriteClient();
  if (error || !client) return { error: error || "Unauthorized." };

  const saved = await persistOutreachSettings(client, parsed.value);
  if (saved.error) return { error: saved.error };
  revalidateProspects();
  return {
    ok: true,
    weekdayTarget: saved.targetLocked ? WEEKDAY_TARGET : parsed.value.weekday_target,
    message: settingsSavedMessage(parsed.value, saved.targetLocked),
  };
}

export async function cleanupProspectLogsAction(
  _prev: ProspectActionState,
  formData?: FormData
): Promise<ProspectActionState> {
  if (!formData || formData.get("confirmCleanup") !== "on") {
    return { error: "Confirm cleanup before old logs are removed. Nothing was deleted." };
  }
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

const RESEARCH_COLUMNS =
  "id,business_name,city,service_area,industry,website_url,website_host,public_email,status,manual_priority,last_activity_at";

async function saveResearchResult(client: SupabaseClient, prospect: { id: string; status: string }, result: {
  qualification: string;
  reason: string;
  confidence: string;
  email: string;
  industry: string;
  sources: string;
  factualNotes: string;
  draftSubject: string;
  draftBody: string;
  listingNote: string;
}) {
  const packed = packResearchRecord(result);
  const now = new Date().toISOString();
  const status = result.qualification === "suppressed" ? "do_not_contact" : prospect.status === "queued" ? "researching" : prospect.status;
  const patch: Record<string, string | boolean | null> = {
    research_notes: packed.research_notes || null,
    research_sources: packed.research_sources || null,
    website_opportunities: packed.website_opportunities || null,
    gbp_observations: packed.gbp_observations || null,
    research_confidence: packed.research_confidence || null,
    industry: packed.industry || null,
    outreach_eligible: false,
    status,
    researched_at: now,
    last_activity_at: now,
  };
  if (packed.public_email) patch.public_email = packed.public_email;
  if (status === "do_not_contact") patch.do_not_contact_at = now;
  const { error } = await client.from("prospects").update(patch).eq("id", prospect.id);
  if (error) return error;
  await client.from("prospect_activity").insert({
    prospect_id: prospect.id,
    event_type: "research",
    from_status: prospect.status,
    to_status: status,
    note: `Research saved as ${qualificationLabel(result.qualification) || "Needs review"}. No email was sent.`.slice(0, 500),
  });
  return null;
}

async function researchProspectRecord(client: SupabaseClient, prospect: {
  id: string;
  business_name: string;
  city: string | null;
  service_area: string | null;
  industry: string | null;
  website_url: string | null;
  website_host: string | null;
  public_email: string | null;
  status: string;
}, mailingAddress: string, timeoutMs: number) {
  const filter = suppressionOr({
    businessName: prospect.business_name,
    city: prospect.city || "",
    email: prospect.public_email || "",
    websiteHost: prospect.website_host || "",
  });
  const { data: blocked } = filter
    ? await client.from("prospect_suppressions").select("id,business_name,city,email,website_host").or(filter).limit(1)
    : { data: [] };
  if (suppressionMatches(prospect, blocked || [])) {
    const error = await saveResearchResult(client, prospect, {
      qualification: "suppressed",
      reason: "This business matches a do-not-contact record and was not queued for outreach.",
      confidence: "high",
      email: prospect.public_email || "",
      industry: prospect.industry || "",
      sources: "",
      factualNotes: "",
      draftSubject: "",
      draftBody: "",
      listingNote: "",
    });
    return { state: error ? "failed" : "suppressed", error };
  }
  const reading = prospect.website_url ? await readOwnWebsite(prospect.website_url, { timeoutMs }) : null;
  const result = researchFromRecord({ ...prospect, suppressed: false }, reading, mailingAddress);
  const error = await saveResearchResult(client, prospect, result);
  if (error) return { state: "failed", error };
  if (reading && !reading.ok && !reading.robotsBlocked) return { state: "failed", error: null };
  return { state: "researched", error: null };
}

export async function researchProspectAction(
  _prev: ProspectActionState,
  formData: FormData
): Promise<ProspectActionState> {
  const id = String(formData.get("id") || "");
  if (!id) return { error: "Choose a prospect." };
  const { error, client } = await adminWriteClient();
  if (error || !client) return { error: error || "Unauthorized." };
  const { data: prospect, error: readError } = await client
    .from("prospects")
    .select(RESEARCH_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  const readSchema = schemaMessage(readError);
  if (readError && readSchema) return { error: readSchema };
  if (readError || !prospect) return { error: "Prospect not found." };
  const { data: settings } = await client.from("outreach_settings").select("mailing_address").eq("id", 1).maybeSingle();
  const outcome = await researchProspectRecord(client, prospect, settings?.mailing_address || "", RESEARCH_DEADLINE_MS);
  if (outcome.state === "failed" && outcome.error) return { error: "Research could not be saved." };
  revalidateProspects(id);
  return {
    ok: true,
    message:
      outcome.state === "suppressed"
        ? "This business is suppressed. Research stopped and no email was sent."
        : outcome.state === "failed"
          ? "The website could not be read. The record was marked for review and no email was sent."
          : "Research saved. The draft, if one was prepared, has not been sent.",
  };
}

export async function researchQueueAction(_prev: ProspectActionState): Promise<ProspectActionState> {
  const { error, client } = await adminWriteClient();
  if (error || !client) return { error: error || "Unauthorized." };
  const { data: rows, error: readError } = await client
    .from("prospects")
    .select(RESEARCH_COLUMNS)
    .in("status", ["queued", "researching"])
    .order("manual_priority", { ascending: false })
    .order("last_activity_at", { ascending: true })
    .limit(15);
  const readSchema = schemaMessage(readError);
  if (readError && readSchema) return { error: readSchema };
  if (readError) return { error: "Unable to read the queue." };
  const batch = selectResearchBatch(rows || [], RESEARCH_BATCH_LIMIT);
  const { data: settings } = await client.from("outreach_settings").select("mailing_address").eq("id", 1).maybeSingle();
  const started = Date.now();
  let researched = 0;
  let suppressed = 0;
  let failed = 0;
  for (const prospect of batch.chosen) {
    if (Date.now() - started >= RESEARCH_DEADLINE_MS || failed >= RESEARCH_FAILURE_LIMIT) break;
    const remaining = RESEARCH_DEADLINE_MS - (Date.now() - started);
    const outcome = await researchProspectRecord(client, prospect, settings?.mailing_address || "", remaining);
    if (outcome.state === "researched") researched += 1;
    else if (outcome.state === "suppressed") suppressed += 1;
    else failed += 1;
  }
  revalidateProspects();
  return {
    ok: true,
    message: `Researched ${researched}. Suppressed ${suppressed}. Failed ${failed}. Skipped ${batch.skipped.length} duplicates or closed records. The batch stops at ${RESEARCH_BATCH_LIMIT} businesses and ${RESEARCH_DEADLINE_MS / 1000} seconds. No email was sent.`,
  };
}

async function lookupChunk(client: SupabaseClient, column: "public_email" | "business_name" | "email", table: "prospects" | "customers" | "prospect_suppressions", values: string[], select: string) {
  const rows: Record<string, string | null>[] = [];
  for (let index = 0; index < values.length; index += 100) {
    const slice = values.slice(index, index + 100);
    if (!slice.length) continue;
    const { data, error } = await client.from(table).select(select).in(column, slice);
    if (error) return { error, rows };
    rows.push(...((data || []) as unknown as Record<string, string | null>[]));
  }
  return { error: null, rows };
}

async function importContext(client: SupabaseClient, parsedRows: { name?: string; email?: string }[]) {
  const emails = [...new Set(parsedRows.map((row) => String(row.email || "").toLowerCase()).filter((email) => email.includes("@")))];
  const names = [...new Set(parsedRows.map((row) => String(row.name || "").trim()).filter(Boolean))];
  const [prospects, named, customers, suppressions] = await Promise.all([
    lookupChunk(client, "public_email", "prospects", emails, "business_name,city,public_email,status,sent_at"),
    lookupChunk(client, "business_name", "prospects", names, "business_name,city,public_email,status,sent_at"),
    lookupChunk(client, "email", "customers", emails, "email"),
    lookupChunk(client, "email", "prospect_suppressions", emails, "email"),
  ]);
  const error = prospects.error || named.error || customers.error || suppressions.error;
  if (error) return { error: "The existing records could not be checked. Nothing was imported.", existing: null };
  const seen = new Set<string>();
  const prospectRows = [];
  for (const row of [...prospects.rows, ...named.rows]) {
    const key = `${String(row.public_email || "").toLowerCase()}|${String(row.business_name || "").toLowerCase()}|${String(row.city || "").toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    prospectRows.push({
      name: row.business_name || "",
      city: row.city || "",
      email: String(row.public_email || "").toLowerCase(),
      status: row.status || "",
      sentAt: row.sent_at || "",
    });
  }
  return {
    error: "",
    existing: {
      prospects: prospectRows,
      customers: customers.rows.map((row) => String(row.email || "").toLowerCase()).filter(Boolean),
      suppressions: suppressions.rows.map((row) => String(row.email || "").toLowerCase()).filter(Boolean),
    },
  };
}

async function reviewedPaste(client: SupabaseClient, paste: string) {
  const parsed = parseProspectList(paste);
  if (parsed.error) return { error: parsed.error, review: null };
  const context = await importContext(client, parsed.rows);
  if (context.error || !context.existing) return { error: context.error || "The existing records could not be checked. Nothing was imported.", review: null };
  return { error: "", review: classifyImport(parsed.rows, context.existing) as { rows: ImportPreviewRow[]; counts: { import: number; skip: number; review: number } } };
}

export async function previewProspectImportAction(_prev: ProspectActionState, formData: FormData): Promise<ProspectActionState> {
  const { error, client } = await adminWriteClient();
  if (error || !client) return { error: error || "Unauthorized." };
  const checked = await reviewedPaste(client, String(formData.get("paste") || ""));
  if (checked.error || !checked.review) return { error: checked.error || "The paste could not be checked. Nothing was imported." };
  const counts = checked.review.counts;
  return {
    ok: true,
    message: `${counts.import} can be imported, ${counts.skip} will be skipped, and ${counts.review} need review. Nothing has been saved.`,
    counts,
    preview: previewRows(checked.review.rows as ImportPreviewRow[]),
  };
}

function previewRows(rows: ImportPreviewRow[]) {
  const problems = rows.filter((row) => row.result !== "import").slice(0, 40);
  const sample = rows.filter((row) => row.result === "import").slice(0, 10);
  return [...problems, ...sample];
}

export async function importProspectListAction(_prev: ProspectActionState, formData: FormData): Promise<ProspectActionState> {
  const { error, client } = await adminWriteClient();
  if (error || !client) return { error: error || "Unauthorized." };
  if (String(formData.get("confirmImport") || "") !== "on") {
    return { error: "Confirm the import before saving. Nothing was imported." };
  }
  const checked = await reviewedPaste(client, String(formData.get("paste") || ""));
  if (checked.error || !checked.review) return { error: checked.error || "The paste could not be checked. Nothing was imported." };
  const suppliedBatch = String(formData.get("batchId") || "").trim();
  const batchId = /^[0-9a-f-]{36}$/i.test(suppliedBatch) ? suppliedBatch : crypto.randomUUID();
  const importedOn = new Date().toISOString();
  const accepted = checked.review.rows.filter((row) => row.result === "import");
  const { data: latest } = await client.from("prospects").select("queued_at").order("queued_at", { ascending: false }).limit(1);
  const times = assignQueueTimes(latest?.[0]?.queued_at || new Date().toISOString(), accepted.length);
  let imported = 0;
  for (let index = 0; index < accepted.length; index += 1) {
    const row = accepted[index];
    const { data: created, error: insertError } = await client.from("prospects").insert({
      business_name: row.name,
      city: row.city || null,
      public_email: row.email,
      research_sources: row.source || null,
      status: "queued",
      source: "manual",
      manual_priority: true,
      outreach_eligible: false,
      queued_at: times[index],
      created_at: times[index],
      notes: importNotes({ phone: row.phone, notes: row.notes, batchId, importedOn }),
    }).select("id").maybeSingle();
    if (insertError || !created?.id) continue;
    await client.from("prospect_activity").insert({
      prospect_id: created.id,
      event_type: "queued",
      to_status: "queued",
      note: `Pasted import ${batchId}. Pending research. No email was sent.`.slice(0, 500),
    });
    imported += 1;
  }
  revalidateProspects();
  const skipped = checked.review.counts.skip + (checked.review.counts.import - imported);
  return {
    ok: true,
    message: `Imported ${imported} as Pending research. Skipped ${skipped}. ${checked.review.counts.review} need review. Batch ${batchId}. No email was sent.`,
    summary: { imported, skipped, review: checked.review.counts.review, batchId },
    preview: previewRows(checked.review.rows),
  };
}

export async function pauseProspectAction(_prev: ProspectActionState, formData: FormData): Promise<ProspectActionState> {
  const { error, client } = await adminWriteClient();
  if (error || !client) return { error: error || "Unauthorized." };
  if (String(formData.get("confirmPause") || "") !== "on") {
    return { error: "Confirm the pause. Nothing was changed." };
  }
  const id = String(formData.get("id") || "");
  const { data: current, error: readError } = await client.from("prospects").select("id,status,sent_at,notes").eq("id", id).maybeSingle();
  if (readError || !current) return { error: "Prospect not found. Nothing was changed." };
  if (current.sent_at || current.status === "sent" || current.status === "interested") {
    return { error: "A sent prospect was not paused." };
  }
  const notes = `${QUEUE_PAUSE_NOTE} ${current.notes || ""}`.trim().slice(0, 1000);
  const { error: updateError } = await client.from("prospects").update({
    status: current.status === "ready" ? "researching" : current.status,
    outreach_eligible: false,
    notes,
    last_activity_at: new Date().toISOString(),
  }).eq("id", id);
  if (updateError) return { error: "The pause could not be saved." };
  await client.from("prospect_activity").insert({
    prospect_id: id,
    event_type: "status",
    from_status: current.status,
    to_status: current.status === "ready" ? "researching" : current.status,
    note: "Queue paused by an administrator. No email was sent.",
  });
  revalidateProspects();
  return { ok: true, message: "Paused. This prospect stays out of the send queue. No email was sent." };
}

export async function removeProspectAction(_prev: ProspectActionState, formData: FormData): Promise<ProspectActionState> {
  const { error, client } = await adminWriteClient();
  if (error || !client) return { error: error || "Unauthorized." };
  if (String(formData.get("confirmRemove") || "") !== "on") {
    return { error: "Confirm the removal. Nothing was deleted." };
  }
  const id = String(formData.get("id") || "");
  const { data: current, error: readError } = await client.from("prospects").select("id,status,sent_at").eq("id", id).maybeSingle();
  if (readError || !current) return { error: "Prospect not found. Nothing was deleted." };
  if (current.sent_at || !["queued", "researching"].includes(current.status)) {
    return { error: "Only a queued prospect that has not been sent can be removed." };
  }
  const { count, error: activityError } = await client.from("prospect_activity").select("id", { count: "exact", head: true }).eq("prospect_id", id).in("event_type", ["gmail_accepted", "gmail_sending", "gmail_uncertain"]);
  if (activityError) return { error: "Send history could not be checked. Nothing was removed." };
  if (count) return { error: "This prospect has send history and was not removed." };
  const { error: deleteError } = await client.from("prospects").delete().eq("id", id).in("status", ["queued", "researching"]).is("sent_at", null);
  if (deleteError) return { error: "The prospect could not be removed." };
  revalidateProspects();
  return { ok: true, message: "Removed from the queue. No email was sent." };
}
