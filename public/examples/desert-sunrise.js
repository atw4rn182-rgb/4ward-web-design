(function () {
  const nav = document.getElementById("site-nav");
  const menuButton = document.querySelector(".nav-toggle");
  const sheet = document.getElementById("menu");
  const photo = document.querySelector(".stage-photo");
  const tabs = [...document.querySelectorAll("[data-tab]")];
  const panels = [...document.querySelectorAll(".menu-panel")];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let spanish = false;
  let menuTimer = 0;
  document.documentElement.dataset.coffeeDemo = "ready";

  function applyLanguage() {
    document.documentElement.lang = spanish ? "es" : "en";
    document.querySelectorAll("[data-en]").forEach((node) => {
      node.textContent = spanish ? node.getAttribute("data-es") : node.getAttribute("data-en");
    });
    const toggle = document.querySelector("[data-lang]");
    if (toggle) {
      toggle.textContent = spanish ? "English" : "Español";
      toggle.setAttribute("aria-pressed", spanish ? "true" : "false");
    }
  }

  function showCategory(name) {
    tabs.forEach((tab) => {
      const selected = tab.getAttribute("data-tab") === name;
      tab.setAttribute("aria-selected", selected ? "true" : "false");
      tab.tabIndex = selected ? 0 : -1;
    });
    panels.forEach((panel) => {
      const match = panel.id === "panel-" + name;
      panel.hidden = !match;
      panel.classList.remove("is-fading");
    });
  }

  function openMenu() {
    if (!sheet) return;
    document.body.classList.add("is-menu");
    window.clearTimeout(menuTimer);
    const reveal = () => {
      sheet.hidden = false;
      const close = sheet.querySelector("[data-close-menu]");
      close?.focus();
      if (!reduceMotion) sheet.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    if (reduceMotion) reveal();
    else menuTimer = window.setTimeout(reveal, 720);
  }

  function closeMenu() {
    window.clearTimeout(menuTimer);
    document.body.classList.remove("is-menu");
    if (sheet) sheet.hidden = true;
    document.querySelector("[data-open-menu]")?.focus();
    if (!reduceMotion) photo?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  document.addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-lang]");
    if (toggle) {
      spanish = !spanish;
      applyLanguage();
      return;
    }
    if (event.target.closest(".nav-toggle") && nav && menuButton) {
      const open = nav.classList.toggle("is-open");
      menuButton.setAttribute("aria-expanded", open ? "true" : "false");
      return;
    }
    if (event.target.closest("[data-open-menu]")) {
      event.preventDefault();
      if (nav && menuButton) {
        nav.classList.remove("is-open");
        menuButton.setAttribute("aria-expanded", "false");
      }
      openMenu();
      return;
    }
    if (event.target.closest("[data-close-menu]")) {
      closeMenu();
      return;
    }
    const tab = event.target.closest("[data-tab]");
    if (tab) {
      const panel = document.getElementById("panel-" + tab.getAttribute("data-tab"));
      if (!reduceMotion && panel) panel.classList.add("is-fading");
      window.setTimeout(() => showCategory(tab.getAttribute("data-tab")), reduceMotion ? 0 : 120);
      return;
    }
    if (event.target.closest("#site-nav a") && nav && menuButton) {
      nav.classList.remove("is-open");
      menuButton.setAttribute("aria-expanded", "false");
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.body.classList.contains("is-menu")) closeMenu();
    const current = document.activeElement?.closest?.("[data-tab]");
    if (!current || (event.key !== "ArrowRight" && event.key !== "ArrowLeft")) return;
    const index = tabs.indexOf(current);
    const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : (index - 1 + tabs.length) % tabs.length;
    tabs[next].focus();
    showCategory(tabs[next].getAttribute("data-tab"));
  });
})();
