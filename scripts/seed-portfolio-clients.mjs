import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");

for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (!match) continue;
  let value = match[2].trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  process.env[match[1].trim()] = value;
}

const base = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!base || !key) {
  console.error("Missing Supabase URL or service role key");
  process.exit(1);
}

async function rest(pathname, { method = "GET", body, prefer } = {}) {
  const response = await fetch(`${base}/rest/v1/${pathname}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: prefer || "return=representation",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${pathname} -> ${response.status} ${text.slice(0, 400)}`);
  }
  return text ? JSON.parse(text) : null;
}

const portfolioClients = [
  {
    company_name: "Accu-Fab NM",
    contact_name: "Accu-Fab NM",
    email: "info@accufabnm.com",
    website_url: "https://accufabnm.com",
    city: "Milan",
    state: "NM",
    status: "active",
    project_name: "Accu-Fab NM Website",
    live_url: "https://accufabnm.com",
  },
  {
    company_name: "Black Mesa Welding",
    contact_name: "Black Mesa Welding",
    email: "info@blackmesawelding.com",
    website_url: "https://blackmesawelding.com",
    city: "Carlsbad",
    state: "NM",
    status: "active",
    project_name: "Black Mesa Welding Website",
    live_url: "https://blackmesawelding.com",
  },
];

async function ensureClient(client) {
  const byCompany = await rest(
    `customers?company_name=eq.${encodeURIComponent(client.company_name)}&select=id,company_name,status,website_url`
  );
  const byEmail = await rest(
    `customers?email=eq.${encodeURIComponent(client.email)}&select=id,company_name,status,website_url`
  );

  let customer = (Array.isArray(byCompany) && byCompany[0]) || (Array.isArray(byEmail) && byEmail[0]) || null;

  if (customer) {
    const patched = await rest(`customers?id=eq.${customer.id}`, {
      method: "PATCH",
      body: {
        company_name: client.company_name,
        contact_name: client.contact_name,
        email: client.email,
        website_url: client.website_url,
        city: client.city,
        state: client.state,
        status: "active",
        updated_at: new Date().toISOString(),
      },
    });
    customer = Array.isArray(patched) ? patched[0] : customer;
    console.log(`updated customer: ${client.company_name} (${customer.id})`);
  } else {
    const inserted = await rest("customers", {
      method: "POST",
      body: {
        company_name: client.company_name,
        contact_name: client.contact_name,
        email: client.email,
        website_url: client.website_url,
        city: client.city,
        state: client.state,
        status: "active",
      },
    });
    customer = Array.isArray(inserted) ? inserted[0] : inserted;
    console.log(`created customer: ${client.company_name} (${customer.id})`);
  }

  const projects = await rest(
    `website_projects?customer_id=eq.${customer.id}&select=id,name,status,live_url`
  );
  const project = Array.isArray(projects) ? projects[0] : null;

  if (project) {
    await rest(`website_projects?id=eq.${project.id}`, {
      method: "PATCH",
      body: {
        name: client.project_name,
        status: "live",
        live_url: client.live_url,
        launched_at: project.launched_at || new Date().toISOString().slice(0, 10),
        updated_at: new Date().toISOString(),
      },
    });
    console.log(`updated project: ${client.project_name}`);
  } else {
    await rest("website_projects", {
      method: "POST",
      body: {
        customer_id: customer.id,
        name: client.project_name,
        tier: "custom",
        status: "live",
        live_url: client.live_url,
        launched_at: new Date().toISOString().slice(0, 10),
      },
    });
    console.log(`created project: ${client.project_name}`);
  }
}

const before = await rest("customers?select=id,company_name,status&order=created_at.desc");
console.log("customers before:", JSON.stringify(before, null, 2));

for (const client of portfolioClients) {
  await ensureClient(client);
}

const after = await rest("customers?select=id,company_name,status,website_url&order=created_at.desc");
const projects = await rest(
  "website_projects?select=id,name,status,live_url,customers(company_name)&order=created_at.desc"
);
console.log("customers after:", JSON.stringify(after, null, 2));
console.log("projects after:", JSON.stringify(projects, null, 2));
