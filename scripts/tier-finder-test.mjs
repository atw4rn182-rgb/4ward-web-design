import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { QUESTIONS, recommend } from "../public/tier-finder-logic.mjs";

const home = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const styles = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");

function check(name, pass) {
  if (!pass) {
    console.error("FAIL", name);
    process.exitCode = 1;
  } else {
    console.log("PASS", name);
  }
}

const allA = recommend(["a", "a", "a", "a"]);
const contact = recommend(["b", "b", "b", "b"]);
const paymentsOnly = recommend(["a", "a", "c", "a"]);
const contactAndPayments = recommend(["b", "b", "c", "b"]);
const manage = recommend(["c", "a", "a", "a"]);
const manageAndPayments = recommend(["c", "c", "c", "c"]);
const departments = recommend(["d", "a", "a", "a"]);
const departmentsAndPayments = recommend(["d", "a", "c", "d"]);
const departmentsAndManage = recommend(["c", "d", "a", "a"]);

check("calls and basic information recommend the online flyer", allA.tier === "tier4" && allA.price === "$44/month" && allA.name === "Online Flyer");
check("email inquiries recommend the multi-page tier 1 site", contact.tier === "tier1" && contact.name === "Small Business Website" && contact.price === "$99/month" && contact.benefits.some((item) => item.includes("existing inbox")) && !contact.gaps.some((gap) => gap.includes("Optional online payment")));
check("payments alone stay on tier 1 and are not described as included", paymentsOnly.tier === "tier1" && paymentsOnly.gaps.some((gap) => gap.includes("not included in the $99 monthly subscription")) && paymentsOnly.gaps.some((gap) => gap.includes("not full e-commerce")));
check("a multi-page site that also asks for payments stays on tier 1", contactAndPayments.tier === "tier1" && contactAndPayments.consultHref.includes("tier=tier1") && contactAndPayments.consultHref.includes("not%20included"));
check("owner-managed content recommends tier 2", manage.tier === "tier2" && manage.price === "$225/month" && manage.name === "Business Management" && manage.benefits.some((item) => item.includes("dashboard included")));
check("owner-managed content plus payments stays on tier 2", manageAndPayments.tier === "tier2" && manageAndPayments.explanation.includes("can be configured") && manageAndPayments.gaps.some((gap) => gap.includes("quoted separately")));
check("multiple departments recommend tier 3", departments.tier === "tier3" && departments.price === "$399/month" && departments.name === "Premium Multi-Department Website");
check("departments outrank payments and checkout stays out of the $399 price", departmentsAndPayments.tier === "tier3" && departmentsAndPayments.gaps.some((gap) => gap.includes("not included in the $399 price")));
check("departments outrank self-management and the dashboard stays an add-on", departmentsAndManage.tier === "tier3" && departmentsAndManage.gaps.some((gap) => gap.includes("optional $50/month")));
check("the inquiry link keeps the recommended tier and does not start payment", [allA, contact, manage, departments].every((result) => result.consultHref.startsWith(`consultation.html?tier=${result.tier}&note=`) && !result.consultHref.includes("checkout")));
check("tier 4 shows both trailer demonstrations", allA.examples.map((item) => item.title).join("|") === "Desert Brew Coffee Trailer|New Mexico Burrito Co.");
check("tier 3 carries the real 4 elements figures without promising them to everyone", departments.results.stats.some((stat) => stat.change === "+81%") && departments.results.kicker.includes("not a promise") && departments.disclaimer.includes("does not promise traffic"));
check("questions stay free of budget language", QUESTIONS.every((question) => !/budget|spend|afford|how much/i.test(`${question.prompt} ${question.options.map((option) => option.label).join(" ")}`)));
check("quiz copy does not guarantee rankings or sales", [allA, contact, paymentsOnly, departments].every((result) => !/guarantee (traffic|rankings|sales|calls)/i.test(`${result.explanation} ${result.disclaimer}`)));
check("quiz never uses the word tweak", !/tweak/i.test(`${home}\n${readFileSync(new URL("../public/tier-finder-logic.mjs", import.meta.url), "utf8")}\n${readFileSync(new URL("../public/tier-finder.js", import.meta.url), "utf8")}`));

check("homepage quiz sits above pricing", home.indexOf('id="find-my-tier"') < home.indexOf('id="pricing"') && home.includes("Find My Perfect Fit") && home.includes("tier-finder.js?v=finder4"));
check("homepage keeps the published prices", ["$44/month", "$99/month", "$225/month", "$399/month", "$1,256", "$2,576", "$5,600", "$9,776"].every((price) => home.includes(price)));
check("quiz styling keeps the champagne section and gold progress", styles.includes(".tier-finder") && styles.includes("#d8c2ad") && styles.includes("tier-finder-progress-fill") && styles.includes("tier-finder-glow"));

if (process.exitCode) {
  console.error("Tier finder checks failed");
  process.exit(process.exitCode);
}
console.log("Tier finder checks passed");
