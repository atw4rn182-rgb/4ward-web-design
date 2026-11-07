import { after, NextResponse } from "next/server";
import { checkRateLimit, clientIp } from "@/lib/api/rate-limit";
import { deliverConsultationEmail } from "@/lib/consultations/deliver-email";
import { validateConsultation } from "@/lib/consultations/validate";
import { classifyStaticFormsError } from "@/lib/email/static-forms-diagnostics";
import { supabaseInsert, supabaseSelect } from "@/lib/supabase/service-rest";

function json(status, body) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export async function POST(request) {
  const limit = checkRateLimit(`consultation:${clientIp(request)}`, {
    limit: 8,
    windowMs: 10 * 60 * 1000,
  });
  if (limit.limited) {
    return json(429, { error: "Please wait a few minutes before sending another request." });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const parsed = validateConsultation(body);
  if (parsed.spam) return json(200, { ok: true, skipped: "spam" });
  if (!parsed.ok) return json(400, { error: parsed.error });

  const row = parsed.value;
  const duplicateWindow = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  try {
    const recent = await supabaseSelect(
      "consultations",
      `email=eq.${encodeURIComponent(row.email)}&created_at=gte.${duplicateWindow}&select=id,project_description&order=created_at.desc&limit=5`
    );
    const match = Array.isArray(recent)
      ? recent.find((item) => item.project_description === row.project_description)
      : null;
    if (match) {
      return json(200, { ok: true, duplicate: true, id: match.id });
    }
  } catch (error) {
    console.error("Consultation duplicate check failed:", error.message);
  }

  let saved;
  try {
    saved = await supabaseInsert("consultations", row);
  } catch (error) {
    console.error("Consultation save failed:", error.message);
    return json(503, {
      error: "We couldn't save your request. Please try again, or text Adam at (970) 560-2575.",
    });
  }

  after(async () => {
    try {
      const result = await deliverConsultationEmail(saved);
      if (!result.ok && !result.skipped) {
        const { category, safeMessage } = classifyStaticFormsError(new Error(result.error || "email failed"));
        console.error(
          `[consultation] email incomplete id=${saved.id} category=${category} ${safeMessage}`
        );
      }
    } catch (error) {
      const { category, safeMessage } = classifyStaticFormsError(error);
      console.error(`[consultation] email failed id=${saved.id} category=${category} ${safeMessage}`);
    }
  });

  return json(200, { ok: true, id: saved.id });
}
