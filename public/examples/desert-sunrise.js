(function () {
  const nav = document.getElementById("site-nav");
  const menuButton = document.querySelector(".nav-toggle");
  const scene = document.getElementById("scene");
  const board = document.getElementById("menu");
  const scroller = document.getElementById("board-scroll");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mobileScene = window.matchMedia("(max-width: 900px) and (orientation: portrait)");
  let spanish = false;
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

  let closeTimer = 0;
  let level = 1;
  let boardDrag = false;

  function frameBox() {
    const raw = mobileScene.matches && scene?.dataset.frameMobile ? scene.dataset.frameMobile : scene?.dataset.frame;
    const parts = (raw || "").split(",").map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return null;
    return parts.map((n) => n / 100);
  }

  function glassButton() {
    return scene?.parentElement?.querySelector(".zoom-glass") || null;
  }

  function syncGlass() {
    const glass = glassButton();
    if (!glass) return;
    const maxed = level >= 3;
    glass.disabled = maxed;
    glass.setAttribute("aria-label", maxed ? "Chalkboard is at maximum magnification" : "Magnify the chalkboard menu");
  }

  function placeGlass() {
    const glass = glassButton();
    if (!glass || !board || !scene) return;
    if (document.body.classList.contains("is-menu")) {
      glass.style.left = "";
      glass.style.top = "";
      return;
    }
    const frame = scene.parentElement;
    const fr = frame.getBoundingClientRect();
    const br = board.getBoundingClientRect();
    const size = 48;
    const gap = 18;
    const spaceRight = fr.right - br.right;
    const spaceLeft = br.left - fr.left;
    let x;
    let y = br.top - fr.top + Math.max(0, (br.height - size) / 2);
    if (spaceRight >= size + gap) x = br.right - fr.left + gap;
    else if (spaceLeft >= size + gap) x = br.left - fr.left - size - gap;
    else {
      x = br.left - fr.left;
      y = br.bottom - fr.top + gap;
    }
    x = Math.max(8, Math.min(fr.width - size - 8, x));
    y = Math.max(56, Math.min(fr.height - size - 8, y));
    glass.style.left = x + "px";
    glass.style.top = y + "px";
  }

  function zoomToBoard(zoomLevel) {
    if (!scene || !board) return;
    const frame = scene.parentElement;
    const box = frameBox();
    if (!frame || !box) return;
    const closer = zoomLevel >= 3;
    const [left, top, width, height] = box;
    const targetW = closer ? board.offsetWidth : scene.offsetWidth * width;
    const targetH = closer ? board.offsetHeight : scene.offsetHeight * height;
    const originX = closer ? board.offsetLeft + board.offsetWidth / 2 : scene.offsetWidth * (left + width / 2);
    const originY = closer ? board.offsetTop + board.offsetHeight / 2 : scene.offsetHeight * (top + height / 2);
    const insetBottom = 76;
    const availW = frame.clientWidth - 32;
    const availH = frame.clientHeight - insetBottom - 12;
    const fit = Math.min(availW / targetW, availH / targetH);
    const scale = fit * (closer ? 0.94 : 0.92);
    const tilt = (scene.dataset.tilt || "0,0").split(",").map(Number);
    const rx = tilt[0] || 0;
    const ry = tilt[1] || 0;
    const dx = frame.clientWidth / 2 - (scene.offsetLeft + originX);
    const dy = availH / 2 - (scene.offsetTop + originY);
    scene.style.transformOrigin = originX + "px " + originY + "px";
    scene.style.transform = "translate(" + dx + "px, " + dy + "px) scale(" + scale + ") rotateX(" + rx + "deg) rotateY(" + ry + "deg)";
  }

  function openMenu(nextLevel) {
    if (!scene) return;
    const target = nextLevel === 3 ? 3 : 2;
    const already = document.body.classList.contains("is-menu");
    window.clearTimeout(closeTimer);
    document.body.classList.remove("is-closing");
    if (!already) scene.style.width = scene.offsetWidth + "px";
    level = target;
    document.body.classList.add("is-menu");
    document.body.classList.toggle("is-zoom-3", level === 3);
    if (board) board.inert = false;
    syncGlass();
    placeGlass();
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => zoomToBoard(level)));
    if (!already) scene.parentElement.querySelector(".mobile-back")?.focus();
  }

  function closeMenu() {
    if (!scene) return;
    level = 1;
    document.body.classList.remove("is-zoom-3");
    document.body.classList.add("is-closing");
    syncGlass();
    scene.style.transform = "none";
    const release = () => {
      document.body.classList.remove("is-menu", "is-closing");
      scene.style.width = "";
      scene.style.transform = "";
      scene.style.transformOrigin = "";
      if (board) board.inert = true;
      placeGlass();
    };
    window.clearTimeout(closeTimer);
    if (reduceMotion) release();
    else closeTimer = window.setTimeout(release, 1880);
    document.querySelector(".order-bar [data-open-menu]")?.focus();
  }

  function jumpTo(id) {
    const section = document.getElementById(id);
    if (!section || !scroller) return;
    const top = section.offsetTop;
    scroller.scrollTo({
      top: Math.max(0, top - 4),
      behavior: reduceMotion ? "auto" : "smooth",
    });
    document.querySelectorAll("[data-jump]").forEach((button) => {
      button.setAttribute("aria-current", button.getAttribute("data-jump") === id ? "true" : "false");
    });
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
    if (event.target.closest("[data-zoom-in]")) {
      event.preventDefault();
      if (level >= 3 && document.body.classList.contains("is-menu")) return;
      openMenu(document.body.classList.contains("is-menu") ? 3 : 2);
      return;
    }
    if (event.target.closest("[data-open-menu]")) {
      event.preventDefault();
      if (nav && menuButton) {
        nav.classList.remove("is-open");
        menuButton.setAttribute("aria-expanded", "false");
      }
      openMenu(2);
      return;
    }
    if (event.target.closest("[data-close-menu]")) {
      closeMenu();
      return;
    }
    const jump = event.target.closest("[data-jump]");
    if (jump) {
      jumpTo(jump.getAttribute("data-jump"));
      return;
    }
    if (
      board &&
      event.target.closest("#menu") &&
      document.body.classList.contains("is-menu") &&
      level < 3 &&
      !boardDrag &&
      !event.target.closest("button, a, article, h3, p, strong, span")
    ) {
      openMenu(3);
      return;
    }
    if (event.target.closest("#site-nav a") && nav && menuButton) {
      nav.classList.remove("is-open");
      menuButton.setAttribute("aria-expanded", "false");
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.body.classList.contains("is-menu")) closeMenu();
  });

  if (board) {
    let tracking = false;
    let start = null;
    board.addEventListener("pointerdown", (event) => {
      tracking = true;
      boardDrag = false;
      start = { x: event.clientX, y: event.clientY };
    });
    board.addEventListener("pointermove", (event) => {
      if (!tracking || !start) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (dx * dx + dy * dy > 64) boardDrag = true;
    });
    const stop = () => {
      tracking = false;
    };
    board.addEventListener("pointerup", stop);
    board.addEventListener("pointercancel", stop);
  }

  window.addEventListener("resize", () => {
    if (document.body.classList.contains("is-menu")) zoomToBoard(level);
    else placeGlass();
  });
  window.addEventListener("load", placeGlass);
  placeGlass();
})();
