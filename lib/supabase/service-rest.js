const BASE = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(
  /\/$/,
  ""
);
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export function supabaseServiceConfigured() {
  return Boolean(BASE && SERVICE);
}

/**
 * Errors carry `source`, `operation` (method + table, no query string),
 * `reason`, and `status` so callers can log failures without leaking row data.
 */
function supabaseError(message, { operation, reason, status, cause } = {}) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.source = "supabase";
  error.operation = operation;
  error.reason = reason;
  if (status !== undefined) error.status = status;
  return error;
}

export function isSupabaseUniqueViolation(error) {
  return Boolean(
    error &&
      error.source === "supabase" &&
      (error.status === 409 || /23505|duplicate key/i.test(String(error.message || "")))
  );
}

export async function supabaseRest(
  path,
  { method = "GET", body, extraHeaders, signal } = {}
) {
  const operation = `${method} ${String(path).split("?")[0]}`;
  if (!BASE || !SERVICE) {
    throw supabaseError("Supabase service role is not configured", {
      operation,
      reason: "not_configured",
    });
  }
  let response;
  try {
    response = await fetch(`${BASE}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: SERVICE,
        Authorization: `Bearer ${SERVICE}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
        ...(extraHeaders || {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    const timedOut = error && (error.name === "TimeoutError" || error.name === "AbortError");
    throw supabaseError(`Supabase ${operation} request failed: ${timedOut ? "timeout" : "network error"}`, {
      operation,
      reason: timedOut ? "timeout" : "network_error",
      cause: error,
    });
  }
  const text = await response.text();
  if (!response.ok) {
    throw supabaseError(`Supabase ${method} ${path} failed: ${text.slice(0, 300)}`, {
      operation,
      reason: "http_error",
      status: response.status,
    });
  }
  return text ? JSON.parse(text) : null;
}

export async function supabaseInsert(table, row, options = {}) {
  const data = await supabaseRest(table, { ...options, method: "POST", body: row });
  return Array.isArray(data) ? data[0] : data;
}

export async function supabasePatch(table, query, row, options = {}) {
  const data = await supabaseRest(`${table}?${query}`, {
    ...options,
    method: "PATCH",
    body: row,
  });
  return Array.isArray(data) ? data[0] : data;
}

export async function supabaseSelect(table, query, options = {}) {
  const data = await supabaseRest(`${table}?${query}`, options);
  return Array.isArray(data) ? data : [];
}

export async function supabaseDelete(table, query, options = {}) {
  const data = await supabaseRest(`${table}?${query}`, { ...options, method: "DELETE" });
  return Array.isArray(data) ? data : [];
}
