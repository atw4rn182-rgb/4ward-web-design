"use server";

import { revalidatePath } from "next/cache";
import { getAdminUser } from "@/lib/supabase/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

export type DeletableKind = "quote" | "payment" | "onboarding" | "customer";

export type DeleteRecordState = {
  ok?: boolean;
  error?: string;
  message?: string;
  deletedId?: string;
};

const KIND_TABLE: Record<DeletableKind, string> = {
  quote: "quote_requests",
  payment: "payments",
  onboarding: "onboarding_submissions",
  customer: "customers",
};

async function adminWriteClient() {
  const user = await getAdminUser();
  if (!user) return { error: "Unauthorized. Sign in as an admin and try again.", client: null as null };

  const service = createServiceClient();
  if (service) return { error: null, client: service };

  const sessionClient = await createClient();
  return { error: null, client: sessionClient };
}

function revalidateAdminLists(kind: DeletableKind, id: string) {
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/clients");
  revalidatePath("/admin/payments");
  revalidatePath("/admin/quotes");
  revalidatePath("/admin/projects");
  revalidatePath("/admin/messages");
  revalidatePath("/admin/files");
  revalidatePath("/admin/analytics");
  if (kind === "quote") {
    revalidatePath(`/admin/quotes/${id}`);
  }
}

function dbErrorMessage(error: { message?: string; code?: string; details?: string } | null, fallback: string) {
  if (!error) return fallback;
  const parts = [error.message, error.details, error.code ? `code ${error.code}` : ""]
    .map((part) => String(part || "").trim())
    .filter(Boolean);
  return parts.join(" — ") || fallback;
}

async function verifyGone(
  client: NonNullable<Awaited<ReturnType<typeof adminWriteClient>>["client"]>,
  kind: DeletableKind,
  id: string
) {
  const table = KIND_TABLE[kind];
  const { data, error } = await client.from(table).select("id").eq("id", id).maybeSingle();
  if (error) {
    return {
      error: `Deleted, but could not verify removal: ${dbErrorMessage(error, "verification query failed")}`,
    };
  }
  if (data?.id) {
    return {
      error:
        "Delete did not remove the row from the database. Check that SUPABASE_SERVICE_ROLE_KEY is set and RLS allows admin deletes.",
    };
  }
  return null;
}

export async function deleteAdminRecordAction(
  _prev: DeleteRecordState,
  formData: FormData
): Promise<DeleteRecordState> {
  const kind = String(formData.get("kind") || "") as DeletableKind;
  const id = String(formData.get("id") || "").trim();
  const confirmToken = String(formData.get("confirmToken") || "").trim();
  const label = String(formData.get("label") || "").trim();

  if (!id || !["quote", "payment", "onboarding", "customer"].includes(kind)) {
    return { error: "Invalid delete request (missing record id or type)." };
  }

  if (confirmToken !== "DELETE") {
    return { error: 'Type DELETE exactly to confirm.' };
  }

  const { error: authError, client } = await adminWriteClient();
  if (authError || !client) return { error: authError || "Unauthorized." };

  try {
    if (kind === "quote") {
      const { data: row, error: loadError } = await client
        .from("quote_requests")
        .select("id, email, company_name, contact_name, service")
        .eq("id", id)
        .maybeSingle();

      if (loadError) {
        return { error: `Could not load quote: ${dbErrorMessage(loadError, "load failed")}` };
      }
      if (!row) return { error: "Quote not found (it may already be deleted)." };

      const { error: emailError } = await client
        .from("email_events")
        .delete()
        .eq("quote_request_id", id);
      if (emailError) {
        return {
          error: `Could not delete related email events first: ${dbErrorMessage(emailError, "email_events delete failed")}`,
        };
      }

      const { error: delError } = await client.from("quote_requests").delete().eq("id", id);
      if (delError) {
        return { error: `Could not delete quote: ${dbErrorMessage(delError, "delete failed")}` };
      }

      const verifyError = await verifyGone(client, kind, id);
      if (verifyError) return verifyError;

      revalidateAdminLists(kind, id);
      return {
        ok: true,
        deletedId: id,
        message: `Deleted quote: ${label || row.contact_name || row.email || id}`,
      };
    }

    if (kind === "payment") {
      const { data: row, error: loadError } = await client
        .from("payments")
        .select("id, amount_cents, currency, description, status")
        .eq("id", id)
        .maybeSingle();

      if (loadError) {
        return { error: `Could not load payment: ${dbErrorMessage(loadError, "load failed")}` };
      }
      if (!row) return { error: "Payment not found (it may already be deleted)." };

      const { error: delError } = await client.from("payments").delete().eq("id", id);
      if (delError) {
        return { error: `Could not delete payment: ${dbErrorMessage(delError, "delete failed")}` };
      }

      const verifyError = await verifyGone(client, kind, id);
      if (verifyError) return verifyError;

      revalidateAdminLists(kind, id);
      return {
        ok: true,
        deletedId: id,
        message: `Deleted payment: ${label || row.description || id}`,
      };
    }

    if (kind === "onboarding") {
      const { data: row, error: loadError } = await client
        .from("onboarding_submissions")
        .select("id, email, company_name, contact_name, tier, status")
        .eq("id", id)
        .maybeSingle();

      if (loadError) {
        return { error: `Could not load onboarding: ${dbErrorMessage(loadError, "load failed")}` };
      }
      if (!row) return { error: "Onboarding submission not found (it may already be deleted)." };

      const { error: delError } = await client
        .from("onboarding_submissions")
        .delete()
        .eq("id", id);
      if (delError) {
        return {
          error: `Could not delete onboarding submission: ${dbErrorMessage(delError, "delete failed")}`,
        };
      }

      const verifyError = await verifyGone(client, kind, id);
      if (verifyError) return verifyError;

      revalidateAdminLists(kind, id);
      return {
        ok: true,
        deletedId: id,
        message: `Deleted onboarding: ${label || row.company_name || row.email || id}`,
      };
    }

    if (kind === "customer") {
      const { data: row, error: loadError } = await client
        .from("customers")
        .select("id, email, company_name, status")
        .eq("id", id)
        .maybeSingle();

      if (loadError) {
        return { error: `Could not load client: ${dbErrorMessage(loadError, "load failed")}` };
      }
      if (!row) return { error: "Client not found (it may already be deleted)." };

      const { error: delError } = await client.from("customers").delete().eq("id", id);
      if (delError) {
        return { error: `Could not delete client: ${dbErrorMessage(delError, "delete failed")}` };
      }

      const verifyError = await verifyGone(client, kind, id);
      if (verifyError) return verifyError;

      revalidateAdminLists(kind, id);
      return {
        ok: true,
        deletedId: id,
        message: `Deleted client: ${label || row.company_name || row.email || id}`,
      };
    }

    return { error: "Unsupported record type." };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete failed unexpectedly.";
    return { error: message };
  }
}
