/**
 * Normalize a domain the customer typed (strip protocol, www, paths).
 */
export function normalizeDomainInput(value) {
  let s = String(value || "").trim().toLowerCase();
  if (!s) return "";
  s = s.replace(/^https?:\/\//i, "");
  s = s.replace(/^www\./i, "");
  s = s.split("/")[0].split("?")[0].split("#")[0];
  return s.slice(0, 253);
}

/**
 * Permissive domain validation — customer does not need to own the domain yet.
 */
export function isValidDomain(value) {
  const domain = normalizeDomainInput(value);
  if (!domain || domain.length < 4 || domain.length > 253) return false;
  if (!domain.includes(".")) return false;
  if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(domain)) return false;
  if (domain.includes("..")) return false;
  const labels = domain.split(".");
  if (labels.some((label) => !label || label.length > 63)) return false;
  const tld = labels[labels.length - 1];
  return tld.length >= 2 && /^[a-z]{2,}$/.test(tld);
}

export function formatDomainChoices(preferred, second, third) {
  const lines = [`Preferred: ${preferred || "—"}`];
  if (second) lines.push(`Second choice: ${second}`);
  if (third) lines.push(`Third choice: ${third}`);
  return lines.join("\n");
}
