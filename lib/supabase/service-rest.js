const BASE = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(
  /\/$/,
  ""
);
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export function supabaseServiceConfigured() {
  return Boolean(BASE && SERVICE);
}

export async function supabaseRest(path, { method = "GET", body, extraHeaders } = {}) {
  if (!BASE || !SERVICE) {
    throw new Error("Supabase service role is not configured");
  }
  const response = await fetch(`${BASE}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(extraHeaders || {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase ${method} ${path} failed: ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : null;
}

export async function supabaseInsert(table, row) {
  const data = await supabaseRest(table, { method: "POST", body: row });
  return Array.isArray(data) ? data[0] : data;
}

export async function supabasePatch(table, query, row) {
  const data = await supabaseRest(`${table}?${query}`, {
    method: "PATCH",
    body: row,
  });
  return Array.isArray(data) ? data[0] : data;
}

export async function supabaseSelect(table, query) {
  const data = await supabaseRest(`${table}?${query}`);
  return Array.isArray(data) ? data : [];
}
