import { NextResponse } from "next/server";
import { outreachRequestAllowed, runWeekdayOutreach } from "@/lib/gmail/weekday.mjs";

export const maxDuration = 60;

async function denied(request) {
  if (await outreachRequestAllowed(request.headers.get("authorization") || "")) return null;
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET is not configured. No message was sent." }, { status: 503 });
  return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
}

export async function GET(request) {
  const refusal = await denied(request);
  if (refusal) return refusal;
  const result = await runWeekdayOutreach();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function POST(request) {
  const refusal = await denied(request);
  if (refusal) return refusal;
  let deliverToday = false;
  try {
    const body = await request.json();
    deliverToday = body?.deliverToday === true;
  } catch {
    deliverToday = false;
  }
  if (!deliverToday) {
    return NextResponse.json({ ok: false, error: "No message was sent." }, { status: 400 });
  }
  const result = await runWeekdayOutreach(new Date(), { deliverNow: true });
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
