import { NextResponse } from "next/server";
import { runWeekdayOutreach } from "@/lib/gmail/weekday.mjs";

export const maxDuration = 60;

export async function GET(request) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET is not configured. No message was sent." }, { status: 503 });
  }
  const header = request.headers.get("authorization") || "";
  if (header !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  const result = await runWeekdayOutreach();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
