(function () {
  const header = document.querySelector(".site-header");
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".site-nav");
  const year = document.getElementById("year");

  if (year) {
    year.textContent = String(new Date().getFullYear());
  }

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Hero: one logo spin → design montage → loop back to logo */
  const heroVideo = document.getElementById("hero-logo-video") || document.querySelector(".hero-video");
  const heroMontage = document.getElementById("hero-montage");
  const heroSlides = heroMontage ? Array.from(heroMontage.querySelectorAll(".hero-slide")) : [];
  const SLIDE_MS = 3200;
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

  function playVideoOnce() {
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
        heroVideo.muted = true;
        heroVideo.currentTime = 0;
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

      // Fallback if ended never fires (approx one spin / clip length)
      const durationMs = Number.isFinite(heroVideo.duration) && heroVideo.duration > 0
        ? Math.min(heroVideo.duration * 1000 + 200, 12000)
        : 6500;
      const fallback = setTimeout(finish, durationMs);
    });
  }

  async function runHeroSequence() {
    if (!heroVideo || prefersReduced) return;

    while (true) {
      showLogoVideo();
      await playVideoOnce();
      await wait(200);

      showMontage();
      await wait(FADE_MS);

      for (let i = 0; i < heroSlides.length; i += 1) {
        heroSlides.forEach((slide, index) => {
          slide.classList.toggle("is-active", index === i);
        });
        await wait(SLIDE_MS);
      }

      heroSlides.forEach((slide) => slide.classList.remove("is-active"));
      showLogoVideo();
      await wait(FADE_MS);
    }
  }

  if (heroVideo) {
    if (prefersReduced) {
      heroVideo.removeAttribute("autoplay");
      heroVideo.pause();
      showLogoVideo();
    } else {
      heroVideo.loop = false;
      heroVideo.muted = true;
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
})();
