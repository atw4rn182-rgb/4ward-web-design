import { NextResponse } from "next/server";
import { supabaseInsert, supabaseSelect } from "@/lib/supabase/service-rest";
import { deliverQuoteRequestEmails } from "@/lib/quotes/deliver-request-emails";

function sanitize(value, max = 500) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function json(status, body) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function first(rows) {
  return Array.isArray(rows) && rows.length ? rows[0] : null;
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
  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const honeypot = sanitize(body.honeypot, 200);
  if (honeypot) {
    return json(200, { ok: true, skipped: "spam" });
  }

  const contactName = sanitize(body.name, 120);
  const email = sanitize(body.email, 160).toLowerCase();
  const phone = sanitize(body.phone, 40);
  const companyName = sanitize(body.company, 120);
  const service = sanitize(body.service, 120);
  const quantity = sanitize(body.quantity, 120);
  const message = sanitize(body.message, 4000);

  if (!contactName || !email || !service || !message) {
    return json(400, { error: "Missing required fields" });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(400, { error: "Invalid email address" });
  }

  const duplicateWindow = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  try {
    const recent = first(
      await supabaseSelect(
        "quote_requests",
        `email=eq.${encodeURIComponent(email)}&service=eq.${encodeURIComponent(service)}&created_at=gte.${duplicateWindow}&select=id,message&order=created_at.desc&limit=1`
      )
    );
    if (recent && recent.message === message) {
      return json(200, {
        ok: true,
        duplicate: true,
        id: recent.id,
        message: "Quote request already received.",
      });
    }
  } catch (error) {
    console.error("Quote duplicate check failed:", error.message);
  }

  let quoteRow = null;
  try {
    quoteRow = await supabaseInsert("quote_requests", {
      contact_name: contactName,
      email,
      phone: phone || null,
      company_name: companyName || null,
      service,
      quantity: quantity || null,
      message,
      status: "new",
      payment_status: "none",
      payload: { source: "quote.html" },
    });
  } catch (error) {
    console.error("Quote Supabase save failed:", error.message);
    return json(503, {
      error: "Unable to save quote request. Please try again or email us directly.",
    });
  }

  try {
    const emailResult = await deliverQuoteRequestEmails(quoteRow);
    if (!emailResult.ok && !emailResult.skipped) {
      return json(502, {
        error:
          "Your request was saved but email delivery failed. We will follow up manually.",
        id: quoteRow?.id,
      });
    }
  } catch (error) {
    console.error("Quote email failed:", error.message);
    return json(502, {
      error:
        "Your request was saved but email delivery failed. We will follow up manually.",
      id: quoteRow?.id,
    });
  }

  return json(200, { ok: true, id: quoteRow?.id });
}
