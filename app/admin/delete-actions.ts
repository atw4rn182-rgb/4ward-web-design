"use server";

import { revalidatePath } from "next/cache";
import { getAdminUser } from "@/lib/supabase/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import {
  isDisposableCustomer,
  isDisposableOnboarding,
  isDisposablePayment,
  isDisposableQuote,
  isPortfolioCompany,
  type DeletableKind,
} from "@/lib/admin/disposable-records";

export type DeleteRecordState = {
  ok?: boolean;
  error?: string;
  message?: string;
  deletedId?: string;
};

async function adminWriteClient() {
  const user = await getAdminUser();
  if (!user) return { error: "Unauthorized.", client: null as null, user: null };

  const client = createServiceClient() || (await createClient());
  return { error: null, client, user };
}

function revalidateAdminLists() {
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/clients");
  revalidatePath("/admin/payments");
  revalidatePath("/admin/quotes");
  revalidatePath("/admin/projects");
  revalidatePath("/admin/messages");
  revalidatePath("/admin/files");
  revalidatePath("/admin/analytics");
}

function allowProductionDeletes() {
  return String(process.env.ADMIN_ALLOW_PRODUCTION_DELETE || "").toLowerCase() === "true";
}

export async function deleteAdminRecordAction(
  _prev: DeleteRecordState,
  formData: FormData
): Promise<DeleteRecordState> {
  const kind = String(formData.get("kind") || "") as DeletableKind;
  const id = String(formData.get("id") || "").trim();
  const confirmToken = String(formData.get("confirmToken") || "").trim();
  const forceProduction = String(formData.get("forceProduction") || "") === "1";

  if (!id || !["quote", "payment", "onboarding", "customer"].includes(kind)) {
    return { error: "Invalid delete request." };
  }

  if (confirmToken !== "DELETE") {
    return { error: "Type DELETE to confirm." };
  }

  const { error, client } = await adminWriteClient();
  if (error || !client) return { error: error || "Unauthorized." };

  try {
    if (kind === "quote") {
      const { data: row, error: loadError } = await client
        .from("quote_requests")
        .select("id, email, company_name, contact_name")
        .eq("id", id)
        .maybeSingle();

      if (loadError || !row) return { error: "Quote not found." };

      const disposable = isDisposableQuote(row);
      if (!disposable) {
        if (!forceProduction || !allowProductionDeletes()) {
          return {
            error:
              "This looks like a real quote. Set ADMIN_ALLOW_PRODUCTION_DELETE=true and confirm production delete to remove it.",
          };
        }
      }

      await client.from("email_events").delete().eq("quote_request_id", id);
      const { error: delError } = await client.from("quote_requests").delete().eq("id", id);
      if (delError) return { error: "Unable to delete quote." };

      revalidateAdminLists();
      revalidatePath(`/admin/quotes/${id}`);
      return {
        ok: true,
        deletedId: id,
        message: disposable ? "Test quote deleted." : "Quote deleted.",
      };
    }

    if (kind === "payment") {
      const { data: row, error: loadError } = await client
        .from("payments")
        .select(
          "id, amount_cents, payment_type, description, stripe_checkout_session_id, customers(company_name)"
        )
        .eq("id", id)
        .maybeSingle();

      if (loadError || !row) return { error: "Payment not found." };

      const disposable = isDisposablePayment(row);
      if (!disposable) {
        if (!forceProduction || !allowProductionDeletes()) {
          return {
            error:
              "This looks like a real payment. Set ADMIN_ALLOW_PRODUCTION_DELETE=true and confirm production delete to remove it.",
          };
        }
      }

      const { error: delError } = await client.from("payments").delete().eq("id", id);
      if (delError) return { error: "Unable to delete payment." };

      revalidateAdminLists();
      return {
        ok: true,
        deletedId: id,
        message: disposable ? "Test / verification payment deleted." : "Payment deleted.",
      };
    }

    if (kind === "onboarding") {
      const { data: row, error: loadError } = await client
        .from("onboarding_submissions")
        .select("id, email, company_name, contact_name")
        .eq("id", id)
        .maybeSingle();

      if (loadError || !row) return { error: "Onboarding submission not found." };

      const disposable = isDisposableOnboarding(row);
      if (!disposable) {
        if (!forceProduction || !allowProductionDeletes()) {
          return {
            error:
              "This looks like a real onboarding submission. Set ADMIN_ALLOW_PRODUCTION_DELETE=true and confirm production delete to remove it.",
          };
        }
      }

      const { error: delError } = await client
        .from("onboarding_submissions")
        .delete()
        .eq("id", id);
      if (delError) return { error: "Unable to delete onboarding submission." };

      revalidateAdminLists();
      return {
        ok: true,
        deletedId: id,
        message: disposable ? "Test onboarding submission deleted." : "Onboarding submission deleted.",
      };
    }

    if (kind === "customer") {
      const { data: row, error: loadError } = await client
        .from("customers")
        .select("id, email, company_name")
        .eq("id", id)
        .maybeSingle();

      if (loadError || !row) return { error: "Client not found." };

      if (isPortfolioCompany(row.company_name)) {
        return { error: "Portfolio clients cannot be deleted from the admin dashboard." };
      }

      const disposable = isDisposableCustomer(row);
      if (!disposable) {
        if (!forceProduction || !allowProductionDeletes()) {
          return {
            error:
              "This looks like a real client. Set ADMIN_ALLOW_PRODUCTION_DELETE=true and confirm production delete to remove it.",
          };
        }
      }

      const { error: delError } = await client.from("customers").delete().eq("id", id);
      if (delError) return { error: "Unable to delete client." };

      revalidateAdminLists();
      return {
        ok: true,
        deletedId: id,
        message: disposable ? "Test client deleted." : "Client deleted.",
      };
    }

    return { error: "Unsupported record type." };
  } catch {
    return { error: "Delete failed unexpectedly." };
  }
}
