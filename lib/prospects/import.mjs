export const IMPORT_ROW_LIMIT = 100;

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
  const email = String(value || "").trim().toLowerCase();
  if (!email || email.length > 254 || /[\s<>]/.test(email)) return "";
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) return "";
  return email;
}

export function identityKey(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function namesConflict(left, right) {
  const a = identityKey(left);
  const b = identityKey(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (shorter.split(" ").length < 2) return false;
  return ` ${longer} `.includes(` ${shorter} `);
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

function cellsOf(line) {
  const raw = String(line || "").trim();
  if (!raw) return [];
  const parts = raw.includes("|") ? raw.split("|") : raw.split("\t");
  return parts.map((cell) => cell.trim()).filter(Boolean);
}

function isDivider(cells) {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function isHeader(cells) {
  if (cells.length < 2) return false;
  const name = visibleText(cells[0]);
  const email = visibleText(cells[1]);
  return /business/i.test(name) && /email/i.test(email) && !/@/.test(email);
}

function parseLine(line, lineNumber) {
  const cells = cellsOf(line);
  if (!cells.length || isDivider(cells) || isHeader(cells)) return null;
  const nameCell = cells[0] || "";
  const emailCell = cells[1] || "";
  const extra = cells.slice(2).join(" ");
  let email = "";
  let source = "";
  for (const link of [...linksIn(emailCell), ...linksIn(nameCell), ...linksIn(extra)]) {
    if (/^mailto:/i.test(link)) email = email || decodeURIComponent(link.replace(/^mailto:/i, "").split("?")[0]);
    else if (/^https?:\/\//i.test(link)) source = source || link;
  }
  const emailText = visibleText(emailCell);
  const found = emailText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (!email && found) email = found[0];
  if (!source) {
    const url = `${extra} ${nameCell}`.match(/https?:\/\/[^\s)]+/i);
    if (url) source = url[0];
  }
  const name = visibleText(nameCell).replace(/https?:\/\/\S+/g, "").trim().slice(0, 120);
  let error = "";
  if (!name) error = "A business name is required.";
  else if (!emailCell && !email) error = "Use a vertical bar between the business name and email.";
  else if (!email) error = "An email address is required.";
  return {
    line: lineNumber,
    name,
    email: String(email || "").trim().toLowerCase(),
    source: safeSource(source),
    error,
  };
}

export function parseProspectList(value) {
  const text = String(value || "").replace(/^\uFEFF/, "");
  if (text.length > 50000) return { error: "That paste is too large. Nothing was imported.", rows: [] };
  const rows = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const row = parseLine(lines[index], index + 1);
    if (row) rows.push(row);
  }
  if (!rows.length) return { error: "Paste at least one business. Nothing was imported.", rows: [] };
  if (rows.length > IMPORT_ROW_LIMIT) {
    return { error: `Paste at most ${IMPORT_ROW_LIMIT} businesses at a time. Nothing was imported.`, rows: [] };
  }
  return { error: "", rows };
}

function emailOwned(email, existing) {
  return (existing?.prospects || []).find((row) => String(row.email || "").toLowerCase() === email) || null;
}

export function classifyImport(rows, existing = {}) {
  const customers = new Set((existing.customers || []).map((email) => String(email).toLowerCase()));
  const suppressions = new Set((existing.suppressions || []).map((email) => String(email).toLowerCase()));
  const seenEmails = new Set();
  const seenNames = new Map();
  const classified = (rows || []).map((row) => {
    if (row.error) return { ...row, result: "skip", message: row.error };
    const email = emailSyntax(row.email);
    if (!email) {
      return { ...row, result: "skip", message: "The email format is not valid. This check does not prove an inbox can receive mail." };
    }
    if (seenEmails.has(email)) {
      return { ...row, email, result: "skip", message: "This email is repeated in the pasted list. The first copy is the one that can be imported." };
    }
    seenEmails.add(email);
    const priorName = seenNames.get(identityKey(row.name));
    if (priorName && priorName !== email) {
      return { ...row, email, result: "review", message: "This business name is repeated in the paste with a different email. It was not imported." };
    }
    seenNames.set(identityKey(row.name), email);
    if (suppressions.has(email)) {
      return { ...row, email, result: "skip", message: "This address is suppressed or opted out. It was not reactivated." };
    }
    if (customers.has(email)) {
      return { ...row, email, result: "skip", message: "This email belongs to an existing customer. That record was not changed." };
    }
    const owned = emailOwned(email, existing);
    if (owned?.sentAt || owned?.status === "sent") {
      return { ...row, email, result: "skip", message: "This recipient was already contacted. The sent record was not reset." };
    }
    if (owned?.status === "do_not_contact" || owned?.status === "not_interested") {
      return { ...row, email, result: "skip", message: "This address is suppressed or opted out. It was not reactivated." };
    }
    if (owned) {
      return { ...row, email, result: "skip", message: "This email is already on a prospect. The existing record was not overwritten." };
    }
    const similar = (existing.prospects || []).find((item) => item.email !== email && namesConflict(row.name, item.name));
    if (similar) {
      return { ...row, email, result: "review", message: `The name is similar to ${similar.name}. Review it before importing. Nothing was changed.` };
    }
    return {
      ...row,
      email,
      result: "import",
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
