import { createDemo, parseDemoPath } from "./canyon-demo-logic.mjs";

const demo = createDemo();
const view = document.getElementById("cto-view");
const count = document.getElementById("cart-count");
const BASE = "/examples/canyon-trail-outfitters";

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function money(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function href(path) {
  return `${BASE}${path}`;
}

function visual(product) {
  if (product.image) return `<img class="preset" alt="" src="${esc(product.image)}" />`;
  return `<div class="preset ${esc(product.preset || "custom")}" role="img" aria-label=""></div>`;
}

function card(product) {
  return `<article class="card">
    ${visual(product)}
    <p class="kicker">${esc(product.category)}</p>
    <h3><a data-demo-link href="${href(`/product/${encodeURIComponent(product.id)}`)}">${esc(product.name)}</a></h3>
    <p>${esc(product.description)}</p>
    <p class="price">${money(product.priceCents)}</p>
    <button class="btn" type="button" data-add="${esc(product.id)}">Add to demo cart</button>
  </article>`;
}

function home() {
  const content = demo.content();
  const featured = demo.products().slice(0, 3).map(card).join("");
  return `<section class="hero-band">
      <div>
        <p class="kicker">Tier 2 Example — E-Commerce &amp; Business Management</p>
        <h1>YOUR WEBSITE. YOUR STORE. YOUR CONTROL.</h1>
        <p class="promise">${esc(content.announcement)}</p>
        <p>Manage your products, update prices, upload pictures, and control your website through your own secure dashboard.</p>
        <p class="demo-note">The dashboard in this example is included the way Tier 2 includes it at $225/month. This is a demonstration, not an extra $50 feature, and nothing you change is saved to a live store.</p>
        <div class="toolbar">
          <a class="btn" href="/consultation.html?tier=tier2">Get Started With Tier 2</a>
          <a class="btn secondary" data-demo-link href="${href("/shop")}">Browse the catalog</a>
          <a class="btn ghost" data-demo-link href="${href("/dashboard")}">Open the owner dashboard</a>
        </div>
      </div>
      <div class="scene" role="img" aria-label="Illustrated canyon trail at sunset"><span class="ridge"></span></div>
    </section>
    <section>
      <h2>From the rack</h2>
      <div class="grid">${featured}</div>
    </section>`;
}

function shop() {
  const params = new URLSearchParams(location.search);
  const query = params.get("q") || "";
  const category = params.get("category") || "";
  const products = demo.filter({ query, category });
  const options = [""].concat(demo.categories).map((item) => {
    const label = item || "All categories";
    return `<option value="${esc(item)}"${item === category ? " selected" : ""}>${esc(label)}</option>`;
  }).join("");
  const list = products.length ? products.map(card).join("") : `<p class="notice">No sample products match that search.</p>`;
  return `<h1>Shop</h1>
    <form class="filters" id="filter-form">
      <label>Search <input name="q" value="${esc(query)}" type="search" /></label>
      <label>Category <select name="category">${options}</select></label>
      <button class="btn" type="submit">Filter</button>
    </form>
    <div class="grid">${list}</div>`;
}

function productPage(id) {
  const product = demo.product(id);
  if (!product) return `<h1>Product not in the demo</h1><p><a data-demo-link href="${href("/shop")}">Back to the shop</a></p>`;
  return `<article class="product">
      ${visual(product)}
      <div>
        <p class="kicker">${esc(product.category)}</p>
        <h1>${esc(product.name)}</h1>
        <p>${esc(product.description)}</p>
        <p class="price">${money(product.priceCents)}</p>
        <button class="btn" type="button" data-add="${esc(product.id)}">Add to demo cart</button>
      </div>
    </article>`;
}

function about() {
  return `<h1>About</h1><div class="panel"><p>${esc(demo.content().about)}</p><p>The shop, trail notes, and prices are sample content for a Tier 2 website demonstration.</p></div>`;
}

function contact() {
  return `<h1>Contact</h1>
    <form class="panel" id="contact-form">
      <p class="demo-note">This form is a demonstration. It does not email anyone or create a customer record.</p>
      <label>Name <input name="name" required autocomplete="name" /></label>
      <label>Email <input name="email" type="email" required autocomplete="email" /></label>
      <label>Message <textarea name="message" required></textarea></label>
      <button class="btn" type="submit">Send demonstration message</button>
      <p id="contact-result" role="status"></p>
    </form>`;
}

function cart() {
  const lines = demo.cart();
  if (!lines.length) return `<h1>Cart</h1><p class="notice">The demonstration cart is empty.</p>`;
  const rows = lines.map((line) => `<div class="card"><h3>${esc(line.product ? line.product.name : "Removed item")}</h3><p>${line.product ? money(line.product.priceCents) : ""}</p><label>Quantity <input class="qty" data-qty="${esc(line.id)}" type="number" min="0" max="12" value="${line.qty}" /></label></div>`).join("");
  return `<h1>Cart</h1>
    <p class="demo-note">Demonstration only. Continuing does not place an order or charge a card.</p>
    ${rows}
    <p class="price">Sample total ${money(demo.cartTotalCents())}</p>
    <button class="btn" type="button" id="demo-checkout">Continue demonstration</button>
    <p id="checkout-result" role="status"></p>`;
}

function dashboard() {
  const rows = demo.products().map((product) => `<form class="card" data-edit="${esc(product.id)}">
      <h3>Edit listing</h3>
      <label>Name <input name="name" value="${esc(product.name)}" required /></label>
      <label>Price <input name="price" value="${(product.priceCents / 100).toFixed(2)}" inputmode="decimal" required /></label>
      <label>Description <textarea name="description">${esc(product.description)}</textarea></label>
      <label>Category <select name="category">${demo.categories.map((item) => `<option${item === product.category ? " selected" : ""}>${esc(item)}</option>`).join("")}</select></label>
      <label>Replace picture <input name="image" type="file" accept="image/*" /></label>
      <div class="row-actions"><button class="btn" type="submit">Save</button><button class="btn ghost" type="button" data-remove="${esc(product.id)}">Remove</button></div>
    </form>`).join("");
  const content = demo.content();
  return `<h1>Owner dashboard</h1>
    <p class="demo-note">Included with the Tier 2 demonstration. Changes show on the shop immediately and reset when you refresh. They are not written to 4Ward records.</p>
    <div class="dashboard">
      <div>
        <form class="panel" id="add-form">
          <h2>Add a product</h2>
          <label>Name <input name="name" required /></label>
          <label>Price <input name="price" inputmode="decimal" required /></label>
          <label>Description <textarea name="description"></textarea></label>
          <label>Category <select name="category">${demo.categories.map((item) => `<option>${esc(item)}</option>`).join("")}</select></label>
          <label>Picture <input name="image" type="file" accept="image/*" /></label>
          <button class="btn" type="submit">Add listing</button>
          <p id="add-result" role="status"></p>
        </form>
        <form class="panel" id="content-form">
          <h2>Supported website content</h2>
          <label>Homepage line <textarea name="announcement">${esc(content.announcement)}</textarea></label>
          <label>About text <textarea name="about">${esc(content.about)}</textarea></label>
          <button class="btn secondary" type="submit">Update content</button>
        </form>
      </div>
      <div class="edit-list">${rows}</div>
    </div>`;
}

function render() {
  const route = parseDemoPath(location.pathname);
  const current = route.name === "product" ? "shop" : route.name;
  document.querySelectorAll("#cto-nav a").forEach((link) => {
    const path = new URL(link.href).pathname;
    const name = parseDemoPath(path).name;
    if (name === current) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  count.textContent = String(demo.cartCount());
  const pages = {
    home,
    shop,
    about,
    contact,
    cart,
    dashboard,
    product: () => productPage(route.id),
    missing: () => `<h1>Page not in the demo</h1><p><a data-demo-link href="${href("")}">Back to the example homepage</a></p>`,
  };
  view.innerHTML = (pages[route.name] || pages.missing)();
  view.focus({ preventScroll: true });
}

function go(url) {
  history.pushState({}, "", url);
  render();
  window.scrollTo(0, 0);
}

function readImage(file) {
  return new Promise((resolve) => {
    if (!file) return resolve("");
    if (!file.type.startsWith("image/") || file.size > 900000) return resolve("");
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

document.addEventListener("click", (event) => {
  const link = event.target.closest("[data-demo-link]");
  if (link) {
    event.preventDefault();
    document.getElementById("cto-nav").classList.remove("is-open");
    document.querySelector(".nav-toggle").setAttribute("aria-expanded", "false");
    go(link.getAttribute("href"));
    return;
  }
  const add = event.target.closest("[data-add]");
  if (add) {
    demo.addToCart(add.getAttribute("data-add"));
    count.textContent = String(demo.cartCount());
    add.textContent = "Added";
    return;
  }
  const remove = event.target.closest("[data-remove]");
  if (remove) {
    demo.removeProduct(remove.getAttribute("data-remove"));
    render();
  }
  if (event.target.id === "demo-checkout") {
    const result = demo.checkoutAttempt();
    document.getElementById("checkout-result").textContent = result.message;
  }
});

document.addEventListener("submit", async (event) => {
  const form = event.target;
  if (form.id === "filter-form") {
    event.preventDefault();
    const data = new FormData(form);
    const params = new URLSearchParams();
    if (data.get("q")) params.set("q", data.get("q"));
    if (data.get("category")) params.set("category", data.get("category"));
    go(`${href("/shop")}?${params.toString()}`);
  }
  if (form.id === "contact-form") {
    event.preventDefault();
    document.getElementById("contact-result").textContent = "Demonstration only. This message was not sent.";
    form.reset();
  }
  if (form.id === "add-form") {
    event.preventDefault();
    const data = new FormData(form);
    const image = await readImage(data.get("image"));
    const result = demo.addProduct({
      name: data.get("name"),
      price: data.get("price"),
      description: data.get("description"),
      category: data.get("category"),
      image,
    });
    document.getElementById("add-result").textContent = result.ok ? "Listing added to the demo shop." : result.error;
    if (result.ok) render();
  }
  if (form.id === "content-form") {
    event.preventDefault();
    const data = new FormData(form);
    demo.updateContent({ announcement: data.get("announcement"), about: data.get("about") });
    render();
  }
  if (form.dataset.edit) {
    event.preventDefault();
    const data = new FormData(form);
    const image = await readImage(data.get("image"));
    demo.updateProduct(form.dataset.edit, {
      name: data.get("name"),
      price: data.get("price"),
      description: data.get("description"),
      category: data.get("category"),
      ...(image ? { image } : {}),
    });
    render();
  }
});

document.addEventListener("change", (event) => {
  const input = event.target.closest("[data-qty]");
  if (!input) return;
  demo.setQty(input.getAttribute("data-qty"), input.value);
  render();
});

document.querySelector(".nav-toggle").addEventListener("click", () => {
  const nav = document.getElementById("cto-nav");
  const open = nav.classList.toggle("is-open");
  document.querySelector(".nav-toggle").setAttribute("aria-expanded", open ? "true" : "false");
});

window.addEventListener("popstate", render);
render();
