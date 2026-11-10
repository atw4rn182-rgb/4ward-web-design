import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDemo, parseDemoPath, SEED_PRODUCTS } from "../public/examples/canyon-demo-logic.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

const coffee = read("public/examples/desert-sunrise-coffee.html");
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

check("coffee demo is labeled and explained", coffee.includes("Tier 4 Example — Online Flyer") && coffee.includes("An affordable, professional online presence with your own domain, menu, business information, and click-to-call functionality."));
check("coffee CTA uses the existing Tier 4 inquiry", coffee.includes('href="/consultation.html?tier=tier4"') && coffee.includes("Get Started With Tier 4"));
check("coffee page is a single flyer without checkout or a dashboard", !/admin dashboard|checkout|stripe|supabase/i.test(coffee));
check("coffee demo opts out of search indexing and local-business data", coffee.includes('content="noindex, nofollow"') && !coffee.includes("application/ld+json"));
check("coffee demo includes menu, hours, fictional location, call, language, and social samples", ["Menu", "Hours", "Fictional demonstration", "tel:+15550142200", "data-lang", "aria-label=\"Sample Instagram"].every((part) => coffee.includes(part)));

check("canyon demo is labeled with the Tier 2 promise", canyon.includes("Tier 2 Example — E-Commerce &amp; Business Management") && canyon.includes("YOUR WEBSITE. YOUR STORE. YOUR CONTROL.") && canyon.includes("Manage your products, update prices, upload pictures, and control your website through your own secure dashboard."));
check("canyon CTA uses the existing Tier 2 inquiry", canyon.includes('href="/consultation.html?tier=tier2"') && canyon.includes("Get Started With Tier 2"));
check("canyon demo opts out of search indexing and local-business data", canyon.includes('content="noindex, nofollow"') && !canyon.includes("application/ld+json"));
check("canyon script never calls Stripe, Supabase, or fetch", !/stripe|supabase|fetch\(|checkout\.stripe|XMLHttpRequest/i.test(canyonScript));

check("demo routes are rewritten to the example pages", config.includes('"/examples/desert-sunrise-coffee"') && config.includes('"/examples/canyon-trail-outfitters/:path*"'));
check("homepage keeps the real portfolio and adds example cards", ["4 Elements Oilfield Services", "S&amp;R Concrete Crafts", "Accu-Fab NM", "Black Mesa Welding", 'id="example-websites"', "Explore Demo", "View Package"].every((part) => home.includes(part)));
check("homepage hero commercial is unchanged", home.includes("4ward-commercial.mp4?v=noflash1") && home.includes('preload="none"') && home.includes("hero-commercial.js?v=hero-x2e"));

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
