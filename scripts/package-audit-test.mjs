import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const home = read("public/index.html");
const checkout = read("app/api/create-checkout-session/route.js");
const addons = read("lib/pricing/add-ons.js");
const quiz = read("public/tier-finder-logic.mjs");

function check(name, pass, detail = "") {
  if (!pass) {
    console.error("FAIL", name, detail);
    process.exitCode = 1;
  } else {
    console.log("PASS", name);
  }
}

const amounts = {
  tier1: 9900,
  tier2: 22500,
  tier3: 39900,
  tier4: 4400,
};

check("checkout monthly amounts match the approved prices", [1, 2, 3, 4].every((n) => checkout.includes(`amount: ${amounts[`tier${n}`]}`)));
check("checkout launch fee is $200", checkout.includes("const LAUNCH_FEE_CENTS = 20000;"));
check("checkout buyouts are 24 months of the same monthly amount", ["9900 * 24", "22500 * 24", "39900 * 24", "4400 * 24"].every((expr) => checkout.includes(expr)));
check("tier 2 includes the dashboard and tier 4 cannot buy it", checkout.includes('tier.id === "tier2" || tier.baseTier === "tier2"') && checkout.includes('tier.id === "tier4"'));
check("add-on prices stay $20 reports and $50 dashboard", addons.includes("cents: 2000") && addons.includes("cents: 5000"));

const links = [
  ["tier4", "consultation.html?tier=tier4", "$44/month"],
  ["tier1", "consultation.html?tier=tier1", "$99/month"],
  ["tier2", "consultation.html?tier=tier2", "$225/month"],
  ["tier3", "consultation.html?tier=tier3", "$399/month"],
  ["buyout-tier4", "consultation.html?tier=buyout-tier4", "$1,256"],
  ["buyout-tier1", "consultation.html?tier=buyout-tier1", "$2,576"],
  ["buyout-tier2", "consultation.html?tier=buyout-tier2", "$5,600"],
  ["buyout-tier3", "consultation.html?tier=buyout-tier3", "$9,776"],
];
check("homepage pricing buttons name the same tier they link to", links.every(([tier, href, price]) => home.includes(href) && home.includes(price) && home.includes(`id="plan-${tier.replace("buyout-", "")}"`)));
check("quiz prices match checkout", ["$44/month", "$99/month", "$225/month", "$399/month"].every((price) => quiz.includes(price)));
check("quiz does not send a tier 4 inquiry to another package", quiz.includes("consultation.html?tier=${tier}&note="));

if (process.exitCode) {
  console.error("Package audit checks failed");
  process.exit(process.exitCode);
}
console.log("Package audit checks passed");
