(function () {
  const nav = document.getElementById("site-nav");
  const menuButton = document.querySelector(".nav-toggle");
  const scene = document.getElementById("scene");
  const board = document.getElementById("menu");
  const scroller = document.getElementById("board-scroll");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mobileScene = window.matchMedia("(max-width: 900px) and (orientation: portrait)");
  let spanish = false;
  document.documentElement.dataset.burritoDemo = "ready";

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
    glass.disabled = false;
    const label = level === 3 ? "Return to the menu close-up" : level === 2 ? "Zoom a little closer" : "Magnify the chalkboard menu";
    glass.setAttribute("aria-label", label);
  }

  function quietHint() {
    scene?.parentElement?.querySelector(".menu-hint-open")?.classList.add("is-quiet");
  }

  function showOpenHint() {
    scene?.parentElement?.querySelector(".menu-hint-open")?.classList.remove("is-quiet");
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
    const hint = frame.querySelector(".menu-hint-closed");
    if (hint) {
      const hintW = hint.offsetWidth || 148;
      const hintH = hint.offsetHeight || 28;
      let hx = x + size + 6;
      let hy = y + (size - hintH) / 2;
      if (hx + hintW > fr.width - 8) hx = Math.max(8, x - hintW - 6);
      hint.style.left = Math.max(8, Math.min(fr.width - hintW - 8, hx)) + "px";
      hint.style.top = Math.max(52, hy) + "px";
    }
  }

  function zoomToBoard(zoomLevel) {
    if (!scene || !board) return;
    const frame = scene.parentElement;
    if (!frame) return;
    const closer = zoomLevel >= 3;
    const originX = board.offsetLeft + board.offsetWidth / 2;
    const originY = board.offsetTop + board.offsetHeight / 2;
    const targetW = board.offsetWidth * (closer ? 1.02 : 1.1);
    const targetH = board.offsetHeight * (closer ? 1.04 : 1.14);
    const insetBottom = 78;
    const availW = Math.max(120, frame.clientWidth - 16);
    const availH = Math.max(120, frame.clientHeight - insetBottom);
    const fit = Math.min(availW / targetW, availH / targetH);
    const scale = fit * 0.92;
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
    const opening = !already;
    level = target;
    document.body.classList.add("is-menu");
    document.body.classList.toggle("is-zoom-3", level === 3);
    if (board) board.inert = false;
    if (opening) showOpenHint();
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
    scroller.scrollTo({
      top: Math.max(0, section.offsetTop - 4),
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
      if (document.body.classList.contains("is-menu")) {
        quietHint();
        openMenu(level === 3 ? 2 : 3);
      } else {
        openMenu(2);
      }
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
      quietHint();
      jumpTo(jump.getAttribute("data-jump"));
      return;
    }
    if (
      board &&
      event.target.closest("#menu") &&
      document.body.classList.contains("is-menu") &&
      !boardDrag &&
      !event.target.closest("button, a, article, h3, p, strong, span")
    ) {
      quietHint();
      openMenu(level === 3 ? 2 : 3);
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

  if (scroller) {
    scroller.addEventListener("scroll", () => {
      if (scroller.scrollTop > 6) quietHint();
    }, { passive: true });
  }

  window.addEventListener("resize", () => {
    if (document.body.classList.contains("is-menu")) zoomToBoard(level);
    else placeGlass();
  });
  window.addEventListener("load", placeGlass);
  placeGlass();
})();
