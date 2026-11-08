import { duplicateDecision, emailIdentity, findRecipientMatch, identityKey, namesConflict, recordsFromExisting } from "./identity.mjs";

export { identityKey, namesConflict };

export const IMPORT_ROW_LIMIT = 5000;
export const IMPORT_CHUNK_SIZE = 100;
export const PASTE_CHAR_LIMIT = 2000000;

export function safeSource(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString().slice(0, 500);
  } catch {
    return "";
  }
}

export function emailSyntax(value) {
  return emailIdentity(value).normalized;
}

function visibleText(value) {
  return String(value || "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function linksIn(value) {
  const links = [];
  const text = String(value || "");
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) links.push(match[1]);
  for (const match of text.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) links.push(match[1]);
  return links;
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;
  const text = String(line || "");
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === "\"" && text[index + 1] === "\"") {
        current += "\"";
        index += 1;
      } else if (char === "\"") quoted = false;
      else current += char;
    } else if (char === "\"") quoted = true;
    else if (char === ",") {
      cells.push(current.trim());
      current = "";
    } else current += char;
  }
  cells.push(current.trim());
  return cells;
}

function cellsOf(line) {
  const raw = String(line || "").trim();
  if (!raw) return [];
  const parts = raw.includes("|")
    ? raw.split("|").map((cell) => cell.trim())
    : raw.includes("\t")
      ? raw.split("\t").map((cell) => cell.trim())
      : raw.includes(",")
        ? parseCsvLine(raw)
        : [raw];
  let start = 0;
  let end = parts.length;
  while (start < end && !parts[start]) start += 1;
  while (end > start && !parts[end - 1]) end -= 1;
  return parts.slice(start, end);
}

function isDivider(cells) {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function isHeader(cells) {
  if (cells.length < 2) return false;
  const name = visibleText(cells[0]);
  const email = visibleText(cells[1]);
  return /business|name/i.test(name) && /email/i.test(email) && !/@/.test(email);
}

function headerMap(cells) {
  if (!isHeader(cells)) return null;
  const map = {};
  cells.forEach((cell, index) => {
    const label = visibleText(cell).toLowerCase();
    if ((/business/.test(label) || /^name$/.test(label)) && map.name == null) map.name = index;
    else if (/email/.test(label) && map.email == null) map.email = index;
    else if (/city|town/.test(label)) map.city = index;
    else if (/phone|mobile|tel/.test(label)) map.phone = index;
    else if (/source|url|link/.test(label)) map.source = index;
    else if (/note/.test(label)) map.notes = index;
  });
  if (map.name == null || map.email == null) return null;
  return map;
}

function phoneText(value) {
  const phone = visibleText(value).slice(0, 30);
  if (!phone) return { phone: "", error: "" };
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return { phone: "", error: "The phone number format is not valid." };
  return { phone, error: "" };
}

function cityText(value) {
  const city = visibleText(value).replace(/https?:\/\/\S+/g, "").trim().slice(0, 80);
  if (!city) return "";
  if (city.includes("@") || /^https?:/i.test(city)) return "";
  return city;
}

function parseLine(line, lineNumber, columns) {
  const cells = cellsOf(line);
  if (!cells.length || isDivider(cells) || isHeader(cells)) return null;
  const nameCell = cells[columns?.name ?? 0] || "";
  const emailCell = cells[columns?.email ?? 1] || "";
  const cityCell = columns?.city != null ? cells[columns.city] || "" : "";
  const phoneCell = columns?.phone != null ? cells[columns.phone] || "" : "";
  const sourceCell = columns?.source != null ? cells[columns.source] || "" : "";
  const notesCell = columns?.notes != null ? cells[columns.notes] || "" : "";
  const extra = columns ? "" : cells.slice(2).join(" ");
  let email = "";
  let source = safeSource(sourceCell);
  for (const link of [...linksIn(emailCell), ...linksIn(nameCell), ...linksIn(sourceCell), ...linksIn(extra)]) {
    if (/^mailto:/i.test(link)) email = email || decodeURIComponent(link.replace(/^mailto:/i, "").split("?")[0]);
    else if (/^https?:\/\//i.test(link)) source = source || safeSource(link);
  }
  const emailText = visibleText(emailCell);
  const found = emailText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (!email && found) email = found[0];
  const identity = emailIdentity(email);
  email = identity.normalized;
  if (!source) {
    const url = `${sourceCell} ${extra} ${nameCell}`.match(/https?:\/\/[^\s)]+/i);
    if (url) source = safeSource(url[0]);
  }
  let city = cityText(cityCell);
  let phone = phoneText(phoneCell);
  let notes = visibleText(notesCell).slice(0, 500);
  if (!columns) {
    for (const cell of cells.slice(2)) {
      if (!phone.phone && !phone.error && phoneText(cell).phone) phone = phoneText(cell);
      else if (!source && safeSource(cell)) source = safeSource(cell);
      else if (!city && cityText(cell)) city = cityText(cell);
      else if (!notes && visibleText(cell) && !/@/.test(cell)) notes = visibleText(cell).slice(0, 500);
    }
  }
  const name = visibleText(nameCell).replace(/https?:\/\/\S+/g, "").trim().slice(0, 120);
  let error = "";
  if (!name) error = "A business name is required.";
  else if (!emailCell && !email) error = "Use a vertical bar or comma between the business name and email.";
  else if (!email) error = "An email address is required.";
  else if (phone.error) error = phone.error;
  else if (sourceCell && !source) error = "The source must be an http or https URL.";
  return {
    line: lineNumber,
    name,
    email: identity.normalized || "",
    emailOriginal: identity.original && identity.original !== identity.normalized ? identity.original : "",
    city,
    phone: phone.phone,
    source,
    notes,
    error,
  };
}

export function parseProspectList(value) {
  const text = String(value || "").replace(/^\uFEFF/, "");
  if (text.length > PASTE_CHAR_LIMIT) return { error: "That file is too large. Nothing was imported.", rows: [] };
  const rows = [];
  const lines = text.split(/\r?\n/);
  let columns = null;
  for (let index = 0; index < lines.length; index += 1) {
    const cells = cellsOf(lines[index]);
    if (!columns && headerMap(cells)) {
      columns = headerMap(cells);
      continue;
    }
    const row = parseLine(lines[index], index + 1, columns);
    if (row) rows.push(row);
  }
  if (!rows.length) return { error: "Paste at least one business. Nothing was imported.", rows: [] };
  if (rows.length > IMPORT_ROW_LIMIT) {
    return { error: `Import at most ${IMPORT_ROW_LIMIT} businesses at a time. Nothing was imported.`, rows: [] };
  }
  return { error: "", rows };
}

export function splitImportText(value, size = IMPORT_CHUNK_SIZE) {
  const parsed = parseProspectList(value);
  if (parsed.error) return { error: parsed.error, chunks: [] };
  const limit = Math.max(1, Number(size) || IMPORT_CHUNK_SIZE);
  const chunks = [];
  for (let index = 0; index < parsed.rows.length; index += limit) {
    const slice = parsed.rows.slice(index, index + limit);
    chunks.push(slice.map((row) => [row.name, row.email, row.city, row.phone, row.source, row.notes].join(" | ")).join("\n"));
  }
  return { error: "", chunks };
}

export function importNotes({ phone, notes, batchId, importedOn, emailOriginal }) {
  const original = String(emailOriginal || "").trim();
  return [
    `Imported ${importedOn}. Batch ${batchId}.`,
    "Pending research. Location, operating status, a published business email, and whether a business-owned website exists were not verified.",
    phone ? `Phone: ${phone}` : "",
    original ? `Original email: ${original}` : "",
    notes || "",
    "No email was sent.",
  ].filter(Boolean).join(" ").slice(0, 1000);
}

export function classifyImport(rows, existing = {}) {
  const records = recordsFromExisting(existing);
  const classified = (rows || []).map((row) => {
    if (row.error) return { ...row, result: "skip", message: row.error, matchId: "" };
    const email = emailSyntax(row.email);
    if (!email) {
      return { ...row, result: "skip", matchId: "", message: "The email format is not valid. This check does not prove an inbox can receive mail." };
    }
    const match = findRecipientMatch({ ...row, email }, records);
    if (match.kind !== "new") {
      const decision = duplicateDecision(match);
      return { ...row, email, result: decision.result, matchId: decision.matchId, message: decision.message };
    }
    records.push({
      source: "prospect",
      id: "",
      name: row.name,
      city: row.city || "",
      email,
      phone: row.phone || "",
      address: row.address || "",
      websiteHost: row.websiteHost || "",
      status: "queued",
      sentAt: "",
    });
    return {
      ...row,
      email,
      result: "import",
      matchId: "",
      message: "Email format is valid. This does not prove the inbox can receive mail. The business will be saved as Pending research.",
    };
  });
  return {
    rows: classified,
    counts: {
      import: classified.filter((row) => row.result === "import").length,
      skip: classified.filter((row) => row.result === "skip").length,
      review: classified.filter((row) => row.result === "review").length,
    },
  };
}

export function previewPage(rows, page = 1, pageSize = 25) {
  const problems = (rows || []).filter((row) => row.result !== "import");
  const current = Math.max(1, Number(page) || 1);
  const size = Math.max(1, Number(pageSize) || 25);
  const start = (current - 1) * size;
  return {
    rows: problems.slice(start, start + size),
    problemTotal: problems.length,
    page: current,
    pageSize: size,
  };
}
