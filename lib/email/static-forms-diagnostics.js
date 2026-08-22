/**
 * Safe Static Forms failure classification — never logs API key values.
 */

export function normalizeStaticFormsEnvKey(raw) {
  let key = String(raw || "").trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1).trim();
  }
  return key;
}

export function classifyStaticFormsError(error) {
  const message = error instanceof Error ? error.message : String(error || "");

  if (/STATIC_FORMS_API_KEY is not configured/i.test(message)) {
    return {
      category: "missing_key",
      safeMessage: "STATIC_FORMS_API_KEY is not configured",
    };
  }
  if (/API key is required/i.test(message)) {
    return {
      category: "sf_api_key_required",
      safeMessage: "Static Forms rejected request (missing apiKey/accessKey)",
    };
  }
  if (/Static Forms failed \(401\)/i.test(message) || /401|invalid|unauthor/i.test(message)) {
    return {
      category: "sf_401",
      safeMessage: "Static Forms auth rejected (401/invalid key)",
    };
  }
  if (/Static Forms failed \(429\)/i.test(message) || /429|rate limit/i.test(message)) {
    return {
      category: "sf_429",
      safeMessage: "Static Forms rate limited (429)",
    };
  }
  if (/Static Forms failed \(400\)/i.test(message)) {
    return {
      category: "sf_400",
      safeMessage: "Static Forms bad request (400)",
    };
  }

  const statusMatch = message.match(/Static Forms failed \((\d+)\)/i);
  if (statusMatch) {
    return {
      category: `sf_${statusMatch[1]}`,
      safeMessage: `Static Forms HTTP ${statusMatch[1]}`,
    };
  }

  if (/fetch failed|network|ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i.test(message)) {
    return {
      category: "network",
      safeMessage: "Static Forms network/runtime error",
    };
  }

  return {
    category: "other",
    safeMessage: "Static Forms delivery error",
  };
}

export function logStaticFormsFailure(context, error) {
  const { category, safeMessage } = classifyStaticFormsError(error);
  console.error(`[static-forms] ${context} category=${category} ${safeMessage}`);
}
