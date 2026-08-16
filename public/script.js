(function () {
  const header = document.querySelector(".site-header");
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".site-nav");
  const year = document.getElementById("year");

  if (year) {
    year.textContent = String(new Date().getFullYear());
  }

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mobileHero = window.matchMedia("(max-width: 760px)");
  const desktopVideo = document.getElementById("hero-video-desktop");
  const phoneVideo = document.getElementById("hero-video-mobile");
  const heroMontage = document.getElementById("hero-montage");
  const heroSlides = heroMontage ? Array.from(heroMontage.querySelectorAll(".hero-slide")) : [];
  const SLIDE_MS = 3600;
  const FADE_MS = 900;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let desktopSequenceRunning = false;

  function muteHeroVideo(heroVideo) {
    if (!heroVideo) return;
    heroVideo.muted = true;
    heroVideo.defaultMuted = true;
    heroVideo.volume = 0;
    heroVideo.playsInline = true;
    heroVideo.setAttribute("playsinline", "");
    heroVideo.setAttribute("webkit-playsinline", "");
    heroVideo.setAttribute("muted", "");
  }

  function armVideo(heroVideo) {
    if (!heroVideo) return;
    heroVideo.preload = "auto";
    heroVideo.setAttribute("preload", "auto");
  }

  function disarmVideo(heroVideo) {
    if (!heroVideo) return;
    heroVideo.preload = "none";
    heroVideo.setAttribute("preload", "none");
    try {
      heroVideo.pause();
    } catch (_) {
      /* ignore */
    }
  }

  function ensurePlaying(heroVideo) {
    if (!heroVideo) return Promise.resolve();
    armVideo(heroVideo);
    muteHeroVideo(heroVideo);
    const playPromise = heroVideo.play();
    if (playPromise && typeof playPromise.catch === "function") {
      return playPromise.catch(() => {
        return new Promise((resolve) => {
          const retry = () => {
            muteHeroVideo(heroVideo);
            const again = heroVideo.play();
            if (again && typeof again.then === "function") {
              again.then(resolve).catch(() => resolve());
            } else {
              resolve();
            }
          };
          document.addEventListener("touchstart", retry, { once: true, passive: true });
          document.addEventListener("click", retry, { once: true });
          setTimeout(retry, 250);
        });
      });
    }
    return Promise.resolve();
  }

  /* Mobile: only the deer/logo video — muted, autoplay, loop. No still images. */
  function startMobileHeroVideo() {
    if (!phoneVideo) return;

    if (desktopVideo) {
      desktopVideo.classList.remove("is-active");
      disarmVideo(desktopVideo);
    }

    if (heroMontage) {
      heroMontage.hidden = true;
      heroMontage.classList.remove("is-active");
    }
    heroSlides.forEach((slide) => slide.classList.remove("is-active"));

    phoneVideo.classList.add("is-active");
    phoneVideo.loop = true;
    phoneVideo.setAttribute("loop", "");
    phoneVideo.setAttribute("autoplay", "");
    armVideo(phoneVideo);
    muteHeroVideo(phoneVideo);

    const kick = () => ensurePlaying(phoneVideo);
    if (phoneVideo.readyState >= 2) {
      kick();
    } else {
      phoneVideo.addEventListener("loadeddata", kick, { once: true });
      phoneVideo.addEventListener("canplay", kick, { once: true });
      try {
        phoneVideo.load();
      } catch (_) {
        /* ignore */
      }
      kick();
    }

    if (!phoneVideo.dataset.playGuard) {
      phoneVideo.dataset.playGuard = "1";
      phoneVideo.addEventListener("pause", () => {
        if (!mobileHero.matches || prefersReduced || phoneVideo.ended) return;
        ensurePlaying(phoneVideo);
      });
    }
  }

  function pauseInactiveVideos(activeVideo) {
    [desktopVideo, phoneVideo].forEach((video) => {
      if (!video || video === activeVideo) return;
      video.classList.remove("is-active");
      disarmVideo(video);
    });
  }

  function showDesktopVideo() {
    pauseInactiveVideos(desktopVideo);
    if (desktopVideo) {
      desktopVideo.classList.add("is-active");
      armVideo(desktopVideo);
    }
    if (heroMontage) {
      heroMontage.classList.remove("is-active");
      heroMontage.hidden = true;
    }
    heroSlides.forEach((slide) => slide.classList.remove("is-active"));
  }

  function showMontage() {
    if (!heroMontage || mobileHero.matches) return;
    pauseInactiveVideos(null);
    heroMontage.hidden = false;
    heroMontage.classList.add("is-active");
  }

  function playDesktopVideoOnce() {
    return new Promise((resolve) => {
      if (!desktopVideo) {
        resolve();
        return;
      }

      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        desktopVideo.removeEventListener("ended", onEnded);
        clearTimeout(fallback);
        resolve();
      };

      const onEnded = () => finish();
      desktopVideo.addEventListener("ended", onEnded);

      const startPlayback = () => {
        try {
          desktopVideo.loop = false;
          if (Number.isFinite(desktopVideo.currentTime) && desktopVideo.currentTime > 0.05) {
            desktopVideo.currentTime = 0;
          }
        } catch (_) {
          /* ignore */
        }
        ensurePlaying(desktopVideo);
      };

      if (desktopVideo.readyState >= 2) {
        startPlayback();
      } else {
        desktopVideo.addEventListener("loadeddata", startPlayback, { once: true });
        startPlayback();
      }

      const durationMs =
        Number.isFinite(desktopVideo.duration) && desktopVideo.duration > 0
          ? Math.min(Math.max(desktopVideo.duration * 1000, 1500) + 600, 60000)
          : 20000;
      const fallback = setTimeout(finish, durationMs);
    });
  }

  async function playDesertLandscapes() {
    if (!heroSlides.length || mobileHero.matches) return;

    heroSlides.forEach((slide, index) => {
      slide.classList.toggle("is-active", index === 0);
    });
    showMontage();
    await wait(FADE_MS);

    for (let i = 0; i < heroSlides.length; i += 1) {
      heroSlides.forEach((slide, index) => {
        slide.classList.toggle("is-active", index === i);
      });
      await wait(SLIDE_MS);
    }
  }

  async function runDesktopHeroSequence() {
    if (!desktopVideo || prefersReduced || desktopSequenceRunning || mobileHero.matches) return;
    desktopSequenceRunning = true;

    while (true) {
      if (mobileHero.matches) break;
      showDesktopVideo();
      await playDesktopVideoOnce();
      await wait(160);
      await playDesertLandscapes();
      heroSlides.forEach((slide) => slide.classList.remove("is-active"));
      if (heroMontage) {
        heroMontage.classList.remove("is-active");
        heroMontage.hidden = true;
      }
      await wait(FADE_MS);
    }
    desktopSequenceRunning = false;
  }

  if (desktopVideo) {
    muteHeroVideo(desktopVideo);
    desktopVideo.loop = false;
  }

  if (heroMontage) {
    heroMontage.hidden = true;
    heroMontage.classList.remove("is-active");
  }
  heroSlides.forEach((slide) => slide.classList.remove("is-active"));

  if (mobileHero.matches) {
    if (prefersReduced) {
      if (phoneVideo) {
        phoneVideo.classList.add("is-active");
        phoneVideo.removeAttribute("autoplay");
        phoneVideo.pause();
      }
    } else {
      startMobileHeroVideo();
    }
  } else if (desktopVideo) {
    showDesktopVideo();
    if (!prefersReduced) runDesktopHeroSequence();
  }

  if (typeof mobileHero.addEventListener === "function") {
    mobileHero.addEventListener("change", () => {
      if (mobileHero.matches) {
        desktopSequenceRunning = false;
        if (!prefersReduced) startMobileHeroVideo();
      } else if (!prefersReduced) {
        if (phoneVideo) {
          phoneVideo.pause();
          phoneVideo.classList.remove("is-active");
        }
        runDesktopHeroSequence();
      }
    });
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
