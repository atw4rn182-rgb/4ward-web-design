import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of fs.readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

const anonClient = createClient(url, anon);
const serviceClient = createClient(url, service);

const { data: anonData, error: anonError } = await anonClient
  .from("customers")
  .select("id, company_name, status");
const { data: serviceData, error: serviceError } = await serviceClient
  .from("customers")
  .select("id, company_name, status");

console.log("anon", { count: anonData?.length, error: anonError, data: anonData });
console.log("service", { count: serviceData?.length, error: serviceError, data: serviceData });

const { data: admins, error: adminError } = await serviceClient
  .from("admin_users")
  .select("user_id, email");
console.log("admins", { admins, adminError });
