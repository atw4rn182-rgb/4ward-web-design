import { translateLong, translatePhrase } from "./i18n/messages.mjs";

const STORAGE_KEY = "4ward-lang";
const originals = new WeakMap();
let applying = false;

function savedLang() {
  try {
    const params = new URLSearchParams(window.location.search);
    const query = params.get("lang");
    if (query === "es" || query === "en") {
      localStorage.setItem(STORAGE_KEY, query);
      return query;
    }
    return localStorage.getItem(STORAGE_KEY) === "es" ? "es" : "en";
  } catch {
    return "en";
  }
}

function normalize(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function rememberText(node) {
  const current = node.nodeValue;
  const known = originals.get(node);
  if (typeof known !== "string") {
    originals.set(node, current);
    return current;
  }
  const currentKey = normalize(current);
  const knownKey = normalize(known);
  const knownSpanish = translatePhrase(knownKey);
  if (currentKey !== knownKey && currentKey !== knownSpanish && translatePhrase(currentKey)) {
    originals.set(node, current);
    return current;
  }
  return known;
}

function applyText(node, lang) {
  const original = rememberText(node);
  if (original == null) return;
  const lead = original.match(/^\s*/)[0];
  const tail = original.match(/\s*$/)[0];
  const key = normalize(original);
  if (!key) return;
    if (lang === "es") {
      const next = translatePhrase(key);
      const value = next ? lead + next + tail : null;
      if (value && node.nodeValue !== value) node.nodeValue = value;
    } else if (node.nodeValue !== original) {
      node.nodeValue = original;
    }
}

function skipElement(node) {
  return node.closest("[data-i18n-skip]") != null;
}

function applyAttribute(node, attr, lang) {
  if (!node.hasAttribute(attr)) return;
  if (node.classList.contains("nav-toggle") && attr === "aria-label") {
    const current = node.getAttribute(attr);
    const bag = originals.get(node);
    const source = bag && typeof bag === "object" ? bag[attr] : null;
    if (source && current !== source && current !== translatePhrase(source)) return;
  }
  if (!originals.has(node) || typeof originals.get(node) !== "object") originals.set(node, {});
  const bag = originals.get(node);
  const current = node.getAttribute(attr);
  if (bag[attr] == null) bag[attr] = current;
  const currentKey = normalize(current);
  const sourceKey = normalize(bag[attr]);
  const sourceSpanish = translatePhrase(sourceKey);
  if (currentKey !== sourceKey && currentKey !== sourceSpanish && translatePhrase(currentKey)) {
    bag[attr] = current;
  }
  const source = bag[attr];
  if (lang === "es") {
    const next = translatePhrase(normalize(source));
    if (next && node.getAttribute(attr) !== next) node.setAttribute(attr, next);
  } else if (source != null && node.getAttribute(attr) !== source) {
    node.setAttribute(attr, source);
  }
}

function walk(node, lang) {
  if (node.nodeType === 3) {
    if (node.parentElement && skipElement(node.parentElement)) return;
    applyText(node, lang);
    return;
  }
  if (node.nodeType !== 1) return;
  const tag = node.tagName;
  if (tag === "SCRIPT" || tag === "STYLE") return;
  if (skipElement(node)) return;
  ["placeholder", "aria-label", "alt", "title"].forEach((attr) => applyAttribute(node, attr, lang));
  for (const child of node.childNodes) walk(child, lang);
}

function markToggle(lang) {
  document.querySelectorAll("[data-set-lang]").forEach((button) => {
    const on = button.getAttribute("data-set-lang") === lang;
    button.setAttribute("aria-pressed", on ? "true" : "false");
    button.classList.toggle("is-active", on);
  });
}

function translateNamedMeta(lang) {
  const root = document.documentElement;
  if (!root.dataset.i18nTitle) root.dataset.i18nTitle = document.title;
  const title = root.dataset.i18nTitle;
  document.title = lang === "es" ? translatePhrase(title) || title : title;
  document.querySelectorAll('meta[name="description"], meta[property="og:title"], meta[property="og:description"], meta[name="twitter:title"], meta[name="twitter:description"]').forEach((meta) => {
    if (!meta.dataset.i18n) meta.dataset.i18n = meta.getAttribute("content") || "";
    const source = meta.dataset.i18n;
    meta.setAttribute("content", lang === "es" ? translatePhrase(source) || source : source);
  });
  const locale = document.querySelector('meta[property="og:locale"]');
  if (locale) locale.setAttribute("content", lang === "es" ? "es_US" : "en_US");
}

export function applyLanguage(lang) {
  const next = lang === "es" ? "es" : "en";
  applying = true;
  document.documentElement.lang = next;
  translateNamedMeta(next);
  if (document.body) walk(document.body, next);
  markToggle(next);
  applying = false;
  document.dispatchEvent(new CustomEvent("fwd-lang", { detail: { lang: next } }));
}

function setLanguage(lang) {
  const next = lang === "es" ? "es" : "en";
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
  const url = new URL(window.location.href);
  if (next === "es") url.searchParams.set("lang", "es");
  else url.searchParams.delete("lang");
  window.history.replaceState({}, "", url);
  applyLanguage(next);
}

function ensureAlternates() {
  const clean = new URL(window.location.href);
  clean.searchParams.delete("lang");
  const english = clean.toString();
  const spanish = new URL(clean);
  spanish.searchParams.set("lang", "es");
  const links = [
    ["en", english],
    ["es", spanish.toString()],
    ["x-default", english],
  ];
  links.forEach(([code, href]) => {
    let link = document.querySelector(`link[rel="alternate"][hreflang="${code}"]`);
    if (!link) {
      link = document.createElement("link");
      link.rel = "alternate";
      link.hreflang = code;
      document.head.append(link);
    }
    link.href = href;
  });
}

window.fwdApplyLang = () => applyLanguage(savedLang());
window.fwdSetLang = setLanguage;
window.fwdT = (text) => (document.documentElement.lang === "es" ? translatePhrase(text) || text : text);
window.fwdTranslateLong = (text) => (document.documentElement.lang === "es" ? translateLong(text) : text);

const initial = savedLang();
function boot() {
  ensureAlternates();
  applyLanguage(initial);
  const observer = new MutationObserver(() => {
    if (applying || document.documentElement.lang !== "es") return;
    applying = true;
    walk(document.body, "es");
    applying = false;
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["placeholder", "aria-label", "alt", "title"],
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-set-lang]");
  if (!button) return;
  setLanguage(button.getAttribute("data-set-lang"));
});

document.addEventListener(
  "invalid",
  (event) => {
    const field = event.target;
    if (!field || !field.validity || document.documentElement.lang !== "es") return;
    if (field.validity.customError && field.validationMessage && field.validationMessage !== "Complete este campo." && field.validationMessage !== "Ingrese un correo electrónico válido.") {
      return;
    }
    if (field.validity.valueMissing) field.setCustomValidity("Complete este campo.");
    else if (field.validity.typeMismatch && field.type === "email") field.setCustomValidity("Ingrese un correo electrónico válido.");
  },
  true
);

document.addEventListener("input", (event) => {
  const field = event.target;
  if (!field || !field.setCustomValidity) return;
  const message = field.validationMessage;
  if (message === "Complete este campo." || message === "Ingrese un correo electrónico válido.") {
    field.setCustomValidity("");
  }
});
