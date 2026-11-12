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
    const bar = frame.querySelector(".order-bar");
    const hint = frame.querySelector(".menu-hint-closed");
    const hit = frame.querySelector(".board-hit") || board;
    if (!bar || !hint || !hit) return;
    const fr = frame.getBoundingClientRect();
    const barR = bar.getBoundingClientRect();
    const hitR = hit.getBoundingClientRect();
    const size = 48;
    const pairGap = 8;
    const hintW = hint.offsetWidth || 150;
    const hintH = hint.offsetHeight || 32;
    const clusterH = Math.max(size, hintH);
    const total = size + pairGap + hintW;
    const boardLeft = hitR.left - fr.left;
    const boardCenter = boardLeft + hitR.width / 2;
    let x = boardCenter > fr.width / 2 ? boardLeft : boardCenter - total / 2;
    x = Math.max(8, Math.min(fr.width - total - 8, x));
    const boardBottom = hitR.bottom - fr.top;
    const barTop = barR.top - fr.top;
    const room = Math.max(0, barTop - boardBottom);
    const drop = Math.max(24, Math.min(room * 0.5, 140));
    let y = boardBottom + drop;
    y = Math.min(y, barTop - 12 - clusterH);
    y = Math.max(8, y);
    glass.style.left = x + "px";
    glass.style.top = y + (clusterH - size) / 2 + "px";
    hint.style.left = x + size + pairGap + "px";
    hint.style.top = y + (clusterH - hintH) / 2 + "px";
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
