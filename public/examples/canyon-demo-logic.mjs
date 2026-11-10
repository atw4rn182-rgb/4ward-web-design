/**
 * Isolated Canyon Trail Outfitters demo state.
 * Nothing here reads or writes Supabase, Stripe, or any network.
 * A new call starts from the seed. Refreshing the page creates a new store.
 */

export const SEED_PRODUCTS = [
  {
    id: "trail-hat",
    name: "Trail Hat",
    category: "Headwear",
    priceCents: 3800,
    description: "A crushable canvas hat with a wide brim for long days on the canyon rim.",
    preset: "hat",
    image: "",
  },
  {
    id: "canyon-canteen",
    name: "Canyon Canteen",
    category: "Drinkware",
    priceCents: 2800,
    description: "Insulated steel canteen that keeps water cold through a desert afternoon.",
    preset: "canteen",
    image: "",
  },
  {
    id: "mesa-daypack",
    name: "Mesa Daypack",
    category: "Packs",
    priceCents: 8600,
    description: "A 22-liter pack with a padded back and a pocket for a paper map.",
    preset: "pack",
    image: "",
  },
  {
    id: "sunset-blanket",
    name: "Sunset Blanket",
    category: "Camp",
    priceCents: 6400,
    description: "A woven camp blanket in rust and pine, sized for two at the overlook.",
    preset: "blanket",
    image: "",
  },
  {
    id: "ridge-sunglasses",
    name: "Ridge Sunglasses",
    category: "Headwear",
    priceCents: 4200,
    description: "Polarized lenses with a matte frame made for bright sandstone trails.",
    preset: "glasses",
    image: "",
  },
  {
    id: "camp-lantern",
    name: "Camp Lantern",
    category: "Camp",
    priceCents: 5400,
    description: "A rechargeable lantern with a warm low setting for camp cooking.",
    preset: "lantern",
    image: "",
  },
];

export const SEED_CONTENT = {
  announcement: "Spring trail kits are on the floor. This catalog is a demonstration.",
  about:
    "Canyon Trail Outfitters is a fictional shop used to show a Tier 2 website. The gear, prices, and trail notes are sample content.",
};

const CATEGORIES = ["Headwear", "Drinkware", "Packs", "Camp"];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function moneyToCents(value) {
  const amount = Number(String(value).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(amount) || amount < 0 || amount > 9999) return null;
  return Math.round(amount * 100);
}

function cleanText(value, max) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

export function parseDemoPath(pathname) {
  const marker = "/examples/canyon-trail-outfitters";
  const index = String(pathname || "").indexOf(marker);
  let rest = index >= 0 ? String(pathname).slice(index + marker.length) : "/";
  rest = rest.replace(/\.html$/, "") || "/";
  const parts = rest.split("/").filter(Boolean);
  if (!parts.length) return { name: "home" };
  if (parts[0] === "shop") return { name: "shop" };
  if (parts[0] === "about") return { name: "about" };
  if (parts[0] === "contact") return { name: "contact" };
  if (parts[0] === "cart") return { name: "cart" };
  if (parts[0] === "dashboard") return { name: "dashboard" };
  if (parts[0] === "product" && parts[1]) return { name: "product", id: decodeURIComponent(parts[1]) };
  return { name: "missing" };
}

export function createDemo() {
  let products = clone(SEED_PRODUCTS);
  let content = clone(SEED_CONTENT);
  let cart = [];

  function findProduct(id) {
    return products.find((item) => item.id === id) || null;
  }

  return {
    categories: CATEGORIES.slice(),
    content() {
      return clone(content);
    },
    products() {
      return clone(products);
    },
    product(id) {
      const item = findProduct(id);
      return item ? clone(item) : null;
    },
    filter({ query = "", category = "" } = {}) {
      const needle = cleanText(query, 80).toLowerCase();
      return products
        .filter((item) => !category || item.category === category)
        .filter((item) => {
          if (!needle) return true;
          return `${item.name} ${item.description} ${item.category}`.toLowerCase().includes(needle);
        })
        .map((item) => clone(item));
    },
    cart() {
      return cart.map((line) => {
        const product = findProduct(line.id);
        return {
          id: line.id,
          qty: line.qty,
          product: product ? clone(product) : null,
        };
      });
    },
    cartCount() {
      return cart.reduce((sum, line) => sum + line.qty, 0);
    },
    cartTotalCents() {
      return cart.reduce((sum, line) => {
        const product = findProduct(line.id);
        return sum + (product ? product.priceCents * line.qty : 0);
      }, 0);
    },
    addProduct(input) {
      const name = cleanText(input.name, 60);
      const description = cleanText(input.description, 240);
      const category = CATEGORIES.includes(input.category) ? input.category : "Camp";
      const priceCents = moneyToCents(input.price);
      if (!name || priceCents === null) return { ok: false, error: "Add a name and a price." };
      const id = `custom-${Date.now().toString(36)}-${products.length}`;
      products.push({
        id,
        name,
        category,
        priceCents,
        description: description || "Sample product added in the demonstration dashboard.",
        preset: "custom",
        image: typeof input.image === "string" && input.image.startsWith("data:image/") ? input.image : "",
      });
      return { ok: true, id };
    },
    updateProduct(id, input) {
      const product = findProduct(id);
      if (!product) return { ok: false, error: "That product is not in the demo." };
      if (input.name !== undefined) {
        const name = cleanText(input.name, 60);
        if (!name) return { ok: false, error: "The name cannot be empty." };
        product.name = name;
      }
      if (input.description !== undefined) product.description = cleanText(input.description, 240);
      if (input.category !== undefined && CATEGORIES.includes(input.category)) product.category = input.category;
      if (input.price !== undefined) {
        const priceCents = moneyToCents(input.price);
        if (priceCents === null) return { ok: false, error: "Enter a price in dollars." };
        product.priceCents = priceCents;
      }
      if (typeof input.image === "string" && input.image.startsWith("data:image/")) product.image = input.image;
      if (input.image === "") product.image = "";
      return { ok: true };
    },
    removeProduct(id) {
      const before = products.length;
      products = products.filter((item) => item.id !== id);
      cart = cart.filter((line) => line.id !== id);
      return { ok: products.length < before };
    },
    updateContent(input) {
      if (input.announcement !== undefined) content.announcement = cleanText(input.announcement, 180);
      if (input.about !== undefined) content.about = cleanText(input.about, 400);
      return { ok: true };
    },
    addToCart(id) {
      const product = findProduct(id);
      if (!product) return { ok: false };
      const line = cart.find((item) => item.id === id);
      if (line) line.qty += 1;
      else cart.push({ id, qty: 1 });
      return { ok: true };
    },
    setQty(id, qty) {
      const next = Math.max(0, Math.min(12, Math.round(Number(qty) || 0)));
      if (next === 0) cart = cart.filter((line) => line.id !== id);
      else {
        const line = cart.find((item) => item.id === id);
        if (line) line.qty = next;
      }
      return { ok: true };
    },
    checkoutAttempt() {
      return {
        ok: false,
        charged: false,
        orderCreated: false,
        message: "Demonstration only. No order was created and no card was charged.",
      };
    },
  };
}
