(function () {
  const header = document.querySelector(".site-header");
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".site-nav");
  const year = document.getElementById("year");

  if (year) {
    year.textContent = String(new Date().getFullYear());
  }

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Hero: one logo spin → full-bleed Carlsbad landscapes → back to logo */
  const heroVideo = document.getElementById("hero-logo-video") || document.querySelector(".hero-video");
  const heroMontage = document.getElementById("hero-montage");
  const heroSlides = heroMontage ? Array.from(heroMontage.querySelectorAll(".hero-slide")) : [];
  const SLIDE_MS = 3400;
  const FADE_MS = 1100;

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function showLogoVideo() {
    if (!heroVideo) return;
    heroVideo.classList.add("is-active");
    if (heroMontage) heroMontage.classList.remove("is-active");
    heroSlides.forEach((slide) => slide.classList.remove("is-active"));
  }

  function showMontage() {
    if (!heroVideo || !heroMontage) return;
    heroVideo.classList.remove("is-active");
    heroMontage.classList.add("is-active");
  }

  function playOneSpin() {
    return new Promise((resolve) => {
      if (!heroVideo) {
        resolve();
        return;
      }

      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        heroVideo.removeEventListener("ended", onEnded);
        clearTimeout(fallback);
        resolve();
      };

      const onEnded = () => finish();
      heroVideo.addEventListener("ended", onEnded);

      const startPlayback = () => {
        try {
          heroVideo.loop = false;
          heroVideo.muted = true;
          heroVideo.playsInline = true;
          if (heroVideo.currentTime !== 0) heroVideo.currentTime = 0;
        } catch (_) {
          /* ignore seek errors while loading */
        }
        const playPromise = heroVideo.play();
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch(() => finish());
        }
      };

      if (heroVideo.readyState >= 2) {
        startPlayback();
      } else {
        heroVideo.addEventListener("loadeddata", startPlayback, { once: true });
        startPlayback();
      }

      const durationMs =
        Number.isFinite(heroVideo.duration) && heroVideo.duration > 0
          ? Math.min(Math.max(heroVideo.duration * 1000, 1200) + 150, 14000)
          : 7000;
      const fallback = setTimeout(finish, durationMs);
    });
  }

  async function runHeroSequence() {
    if (!heroVideo || prefersReduced) return;

    while (true) {
      showLogoVideo();
      await playOneSpin();
      await wait(150);

      if (heroSlides.length) {
        showMontage();
        await wait(FADE_MS);

        for (let i = 0; i < heroSlides.length; i += 1) {
          heroSlides.forEach((slide, index) => {
            slide.classList.toggle("is-active", index === i);
          });
          await wait(SLIDE_MS);
        }

        heroSlides.forEach((slide) => slide.classList.remove("is-active"));
      }

      showLogoVideo();
      await wait(FADE_MS);
    }
  }

  if (heroVideo) {
    heroVideo.setAttribute("playsinline", "");
    heroVideo.muted = true;
    if (prefersReduced) {
      heroVideo.removeAttribute("autoplay");
      heroVideo.pause();
      showLogoVideo();
    } else {
      heroVideo.loop = false;
      runHeroSequence();
    }
  }

  const onScroll = () => {
    if (!header) return;
    header.classList.toggle("is-scrolled", window.scrollY > 12);
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  if (toggle && nav) {
    const closeNav = () => {
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Open menu");
      nav.classList.remove("is-open");
    };

    toggle.addEventListener("click", (event) => {
      event.stopPropagation();
      const open = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!open));
      toggle.setAttribute("aria-label", open ? "Open menu" : "Close menu");
      nav.classList.toggle("is-open", !open);
    });

    nav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", closeNav);
    });

    document.addEventListener("click", (event) => {
      if (!nav.classList.contains("is-open")) return;
      if (nav.contains(event.target) || toggle.contains(event.target)) return;
      closeNav();
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 760) closeNav();
    });
  }

  const reveals = document.querySelectorAll(".reveal");

  if (prefersReduced) {
    reveals.forEach((el) => el.classList.add("is-visible"));
  } else if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    reveals.forEach((el) => observer.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add("is-visible"));
  }

  const addonsPanel = document.getElementById("pricing-addons");
  const addonToggles = Array.from(document.querySelectorAll("[data-addons-toggle]"));

  function setAddonsOpen(open) {
    if (!addonsPanel) return;
    addonsPanel.hidden = !open;
    addonToggles.forEach((btn) => {
      btn.setAttribute("aria-expanded", String(open));
      if (btn.closest(".pricing-addons-header")) {
        btn.textContent = open ? "Hide add-ons" : "View add-ons";
      }
    });
    if (open) {
      addonsPanel.scrollIntoView({ behavior: prefersReduced ? "auto" : "smooth", block: "nearest" });
    }
  }

  addonToggles.forEach((btn) => {
    btn.addEventListener("click", () => {
      const open = addonsPanel && !addonsPanel.hidden;
      setAddonsOpen(!open);
    });
  });
})();
