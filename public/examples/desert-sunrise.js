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

  function frameBox() {
    const raw = mobileScene.matches && scene?.dataset.frameMobile ? scene.dataset.frameMobile : scene?.dataset.frame;
    const parts = (raw || "").split(",").map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return null;
    return parts.map((n) => n / 100);
  }

  function zoomToBoard() {
    if (!scene) return;
    const frame = scene.parentElement;
    const box = frameBox();
    if (!frame || !box) return;
    const [left, top, width, height] = box;
    const originX = scene.offsetWidth * (left + width / 2);
    const originY = scene.offsetHeight * (top + height / 2);
    const boardW = scene.offsetWidth * width;
    const boardH = scene.offsetHeight * height;
    const scale = Math.min(frame.clientWidth / boardW, frame.clientHeight / boardH) * 0.92;
    const tilt = (scene.dataset.tilt || "0,0").split(",").map(Number);
    const rx = tilt[0] || 0;
    const ry = tilt[1] || 0;
    const place = (origin, size, frameSize) => {
      const centered = frameSize / 2;
      const min = frameSize - (size - origin) * scale;
      const max = origin * scale;
      if (size * scale <= frameSize) return centered;
      return Math.min(max, Math.max(min, centered));
    };
    const dx = place(originX, scene.offsetWidth, frame.clientWidth) - (scene.offsetLeft + originX);
    const dy = place(originY, scene.offsetHeight, frame.clientHeight) - (scene.offsetTop + originY);
    scene.style.transformOrigin = originX + "px " + originY + "px";
    scene.style.transform = "translate(" + dx + "px, " + dy + "px) scale(" + scale + ") rotateX(" + rx + "deg) rotateY(" + ry + "deg)";
  }

  function openMenu() {
    if (!scene) return;
    window.clearTimeout(closeTimer);
    scene.style.width = scene.offsetWidth + "px";
    document.body.classList.add("is-menu");
    if (board) board.inert = false;
    window.requestAnimationFrame(() => window.requestAnimationFrame(zoomToBoard));
    const back = mobileScene.matches ? scene.parentElement.querySelector(".mobile-back") : board?.querySelector(".board-back");
    back?.focus();
  }

  function closeMenu() {
    if (!scene) return;
    document.body.classList.add("is-closing");
    scene.style.transform = "none";
    const release = () => {
      document.body.classList.remove("is-menu", "is-closing");
      scene.style.width = "";
      scene.style.transform = "";
      scene.style.transformOrigin = "";
      if (board) board.inert = true;
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
    const jump = event.target.closest("[data-jump]");
    if (jump) {
      jumpTo(jump.getAttribute("data-jump"));
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

  window.addEventListener("resize", () => {
    if (document.body.classList.contains("is-menu")) zoomToBoard();
  });
})();
