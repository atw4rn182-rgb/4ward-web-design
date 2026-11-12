import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDemo, parseDemoPath, SEED_PRODUCTS } from "../public/examples/canyon-demo-logic.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

const coffee = read("public/examples/desert-sunrise-coffee.html");
const burrito = read("public/examples/new-mexico-burrito.html");
const canyon = read("public/examples/canyon-trail-outfitters.html");
const canyonScript = read("public/examples/canyon-trail.js");
const home = read("public/index.html");
const config = read("next.config.mjs");

function check(name, pass) {
  if (!pass) {
    console.error("FAIL", name);
    process.exitCode = 1;
  } else {
    console.log("PASS", name);
  }
}

check("coffee demo is labeled and explained", coffee.includes("Desert Brew Coffee Trailer") && !coffee.includes("Desert Sunrise Coffee Co.") && coffee.includes("Tier 4 Example — Online Flyer") && coffee.includes("An affordable, professional online presence with your own domain, menu, business information, and click-to-call functionality."));
check("coffee CTA uses the existing Tier 4 inquiry", coffee.includes('href="/consultation.html?tier=tier4"') && coffee.includes("Get Started With Tier 4"));
check("coffee page is a single flyer without checkout or a dashboard", !/admin dashboard|checkout|stripe|supabase/i.test(coffee));
check("coffee demo opts out of search indexing and local-business data", coffee.includes('content="noindex, nofollow"') && !coffee.includes("application/ld+json"));
check("coffee demo includes menu, hours, fictional location, call, language, and social samples", ["Menu", "Hours", "Fictional demonstration", "tel:+15550142200", "data-lang", "aria-label=\"Sample Instagram"].every((part) => coffee.includes(part)));
check("burrito demo is a fictional tier 4 flyer", burrito.includes("New Mexico Burrito Co.") && burrito.includes("Tier 4 Example — Online Flyer") && burrito.includes("An affordable, professional online presence with your own domain, menu, business information, and click-to-call functionality.") && burrito.includes('href="/consultation.html?tier=tier4"') && burrito.includes("Get Started With Tier 4"));
check("burrito demo stays fictional and has the left-board menu", ["Fictional demonstration", "tel:+15550143310", "data-lang", "data-jump=\"burritos\"", "data-jump=\"tacos\"", "data-jump=\"quesadillas\"", "data-jump=\"sides\"", "data-jump=\"drinks\"", "Back to Trailer", "Hours & Locations", "data-show-hours", 'content="noindex, nofollow"'].every((part) => burrito.includes(part)) && !/checkout|stripe|supabase/i.test(burrito));
const burritoJs = read("public/examples/new-mexico-burrito.js");
const coffeeJs = read("public/examples/desert-sunrise.js");
check("demo locations use separate fictional 555 numbers", burritoJs.includes("+15550143310") && burritoJs.includes("+15550143318") && coffeeJs.includes("+15550142200") && coffeeJs.includes("+15550142208") && coffee.includes("Hours & Locations"));

check("canyon demo is labeled with the Tier 2 promise", canyon.includes("Tier 2 Example — E-Commerce &amp; Business Management") && canyon.includes("YOUR WEBSITE. YOUR STORE. YOUR CONTROL.") && canyon.includes("Manage your products, update prices, upload pictures, and control your website through your own secure dashboard."));
check("canyon CTA uses the existing Tier 2 inquiry", canyon.includes('href="/consultation.html?tier=tier2"') && canyon.includes("Get Started With Tier 2"));
check("canyon demo opts out of search indexing and local-business data", canyon.includes('content="noindex, nofollow"') && !canyon.includes("application/ld+json"));
check("canyon script never calls Stripe, Supabase, or fetch", !/stripe|supabase|fetch\(|checkout\.stripe|XMLHttpRequest/i.test(canyonScript));

check("demo routes are rewritten to the example pages", config.includes('"/examples/desert-sunrise-coffee"') && config.includes('"/examples/new-mexico-burrito"') && config.includes('"/examples/canyon-trail-outfitters/:path*"'));
check("homepage keeps the real portfolio and adds example cards", ["Desert Brew Coffee Trailer", "New Mexico Burrito Co.", "Imagine your own food trailer transformed into an interactive website", "4 Elements Oilfield Services", "S&amp;R Concrete Crafts", "Accu-Fab NM", "Black Mesa Welding", 'id="example-websites"', "View Concept", 'href="/examples/desert-sunrise-coffee"', 'href="/examples/new-mexico-burrito"', "Visit Website", "Visit Accu-Fab Website", "Visit Black Mesa Website", "View Tier 4", "View Tier 1", "$44/month", "$399/month", "$225/month", "$99/month", "Your Future Website Concept", "Your Website. Your Way.", "optional paid add-on", "Starting at $44/Month"].every((part) => home.includes(part)) && !home.includes("/examples/canyon-trail-outfitters") && !home.includes("Canyon Trail Outfitters") && !home.includes("Explore Demo") && !home.includes("example-preview-pair"));
check("homepage hero commercial is unchanged", home.includes("4ward-commercial.mp4?v=noflash1") && home.includes('preload="none"') && home.includes("hero-commercial.js?v=hero-x2e"));
check("pricing results use the supplied figures and stay illustrative", ["See Real Results", "See Potential Results", "+81%", "508 views in October 2026", "+750%", "17 clicks in September 2026", "+130%", "115 requests in September 2026", "+12.5%", "99 calls in September 2026", "Actual performance figures from Google Business Profile reports, September and October 2026.", "Local Coffee Trailer — Illustrative Growth Scenario", "Local Small Business — Illustrative Growth Scenario", "Growing Business — Illustrative Growth Scenario", "Illustrative scenario — not actual client data", "consultation.html?tier=tier3", "consultation.html?tier=tier1", 'href="/case-studies/4-elements"', "Example index values are hypothetical", "These figures are actual reported results from 4 Elements Oilfield Services"].every((part) => home.includes(part)));
const homeNav = home.slice(home.indexOf('id="site-nav"'), home.indexOf("</nav>"));
check("case studies sits between our work and extra-work quotes", homeNav.indexOf(">Our Work<") < homeNav.indexOf(">Case Studies<") && homeNav.indexOf(">Case Studies<") < homeNav.indexOf(">Get a quote for extra work<"));
const elementsCase = read("public/case-studies/4-elements.html");
check("4 elements case study uses the supplied story and figures", ["4 Elements Oilfield Services — Case Study", "An established local leader, now impossible to miss online.", "4 Elements Oilfield Services is the go-to name for quarry runs and oilfield logistics", "What We Built", "Tier 3 local service website", "The Growth", "+81%", "508 views in October 2026", "+750%", "17 clicks in September 2026", "+130%", "115 requests in September 2026", "+12.5%", "99 calls in September 2026", "All figures sourced from Google Business Profile reports, September and October 2026.", "Why It Matters", "The website didn't change who they are"].every((part) => elementsCase.includes(part)) && config.includes('"/case-studies/4-elements"'));

const homeRoute = parseDemoPath("/examples/canyon-trail-outfitters");
const productRoute = parseDemoPath("/examples/canyon-trail-outfitters/product/mesa-daypack");
check("canyon paths map to pages", homeRoute.name === "home" && productRoute.name === "product" && productRoute.id === "mesa-daypack" && parseDemoPath("/examples/canyon-trail-outfitters/dashboard").name === "dashboard");

const demo = createDemo();
const edited = demo.updateProduct("trail-hat", { price: "41.50", description: "Updated in the demo dashboard." });
const added = demo.addProduct({ name: "Cedar Mug", price: "18", description: "A sample mug.", category: "Drinkware" });
demo.addToCart("mesa-daypack");
demo.addToCart("mesa-daypack");
const removed = demo.removeProduct("camp-lantern");
demo.updateContent({ announcement: "Owner updated the banner." });
const payment = demo.checkoutAttempt();
const fresh = createDemo();

check("dashboard edits stay inside the demo store", edited.ok && demo.product("trail-hat").priceCents === 4150 && demo.product("trail-hat").description.startsWith("Updated"));
check("dashboard can add and remove listings", added.ok && demo.product(added.id).name === "Cedar Mug" && removed.ok && !demo.product("camp-lantern"));
check("cart counts sample products and checkout never charges", demo.cartCount() === 2 && demo.cartTotalCents() === 8600 * 2 && payment.charged === false && payment.orderCreated === false);
check("a new visit starts from the original catalog", fresh.products().length === SEED_PRODUCTS.length && fresh.product("trail-hat").priceCents === 3800 && fresh.content().announcement !== "Owner updated the banner.");
check("search and category filters narrow the catalog", demo.filter({ query: "pack", category: "Packs" }).length === 1);

if (process.exitCode) {
  console.error("Example demo checks failed");
  process.exit(process.exitCode);
}
console.log("Example demo checks passed");
