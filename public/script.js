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
  const CROSSFADE_MS = 1100;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let heroSequenceRunning = false;
  let montagePreloaded = false;
  let heroSequenceId = 0;

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
    heroVideo.classList.remove("is-active", "is-leaving");
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

  function activeHeroVideo() {
    return mobileHero.matches ? phoneVideo : desktopVideo;
  }

  function inactiveHeroVideo() {
    return mobileHero.matches ? desktopVideo : phoneVideo;
  }

  function pauseInactiveVideos(activeVideo) {
    [desktopVideo, phoneVideo].forEach((video) => {
      if (!video || video === activeVideo) return;
      disarmVideo(video);
    });
  }

  function resetMontageClasses() {
    if (!heroMontage) return;
    heroMontage.classList.remove("is-active", "is-prepped");
    heroMontage.setAttribute("aria-hidden", "true");
  }

  function setMontageSlide(index) {
    heroSlides.forEach((slide, i) => {
      slide.classList.toggle("is-active", i === index);
    });
  }

  function preloadMontageSlides() {
    if (montagePreloaded || !heroSlides.length) return Promise.resolve();
    montagePreloaded = true;
    return Promise.all(
      heroSlides.map(
        (slide) =>
          new Promise((resolve) => {
            if (slide.complete && slide.naturalWidth > 0) {
              resolve();
              return;
            }
            const done = () => {
              slide.removeEventListener("load", done);
              slide.removeEventListener("error", done);
              resolve();
            };
            slide.addEventListener("load", done, { once: true });
            slide.addEventListener("error", done, { once: true });
            if (slide.loading === "lazy") {
              slide.loading = "eager";
            }
            const src = slide.currentSrc || slide.src;
            if (src) {
              const img = new Image();
              img.onload = done;
              img.onerror = done;
              img.src = src;
            } else {
              resolve();
            }
          })
      )
    );
  }

  function prepMontageUnderVideo() {
    if (!heroMontage) return;
    setMontageSlide(0);
    heroMontage.classList.add("is-prepped");
    heroMontage.classList.remove("is-active");
    heroMontage.setAttribute("aria-hidden", "true");
  }

  function showHeroVideo(video) {
    if (!video) return;
    pauseInactiveVideos(video);
    resetMontageClasses();
    heroSlides.forEach((slide) => slide.classList.remove("is-active"));
    video.classList.remove("is-leaving");
    video.classList.add("is-active");
    armVideo(video);
    muteHeroVideo(video);
  }

  async function crossfadeVideoToMontage(video) {
    if (!heroMontage || !heroSlides.length) return;

    await preloadMontageSlides();
    setMontageSlide(0);
    heroMontage.classList.add("is-prepped");
    heroMontage.classList.remove("is-active");

    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    heroMontage.classList.add("is-active");
    heroMontage.setAttribute("aria-hidden", "false");
    if (video) {
      video.classList.add("is-leaving");
    }

    await wait(CROSSFADE_MS);

    if (video) {
      video.classList.remove("is-active", "is-leaving");
      try {
        video.pause();
        video.currentTime = 0;
      } catch (_) {
        /* ignore */
      }
      disarmVideo(video);
    }
    heroMontage.classList.remove("is-prepped");
  }

  function playHeroVideoOnce(video) {
    return new Promise((resolve) => {
      if (!video) {
        resolve();
        return;
      }

      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        video.removeEventListener("ended", onEnded);
        video.removeEventListener("timeupdate", onTimeUpdate);
        clearTimeout(fallback);
        resolve();
      };

      const onEnded = () => finish();
      const onTimeUpdate = () => {
        const duration = video.duration;
        if (!Number.isFinite(duration) || duration <= 0) return;
        if (video.currentTime >= duration - 0.35) finish();
        if (duration > 2 && video.currentTime / duration >= 0.55) {
          preloadMontageSlides();
          prepMontageUnderVideo();
        }
      };

      video.addEventListener("ended", onEnded);
      video.addEventListener("timeupdate", onTimeUpdate);

      const startPlayback = () => {
        try {
          video.loop = false;
          video.removeAttribute("loop");
          if (Number.isFinite(video.currentTime) && video.currentTime > 0.05) {
            video.currentTime = 0;
          }
        } catch (_) {
          /* ignore */
        }
        preloadMontageSlides();
        ensurePlaying(video);
      };

      if (video.readyState >= 2) {
        startPlayback();
      } else {
        video.addEventListener("loadeddata", startPlayback, { once: true });
        video.addEventListener("canplay", startPlayback, { once: true });
        try {
          video.load();
        } catch (_) {
          /* ignore */
        }
        startPlayback();
      }

      const durationMs =
        Number.isFinite(video.duration) && video.duration > 0
          ? Math.min(Math.max(video.duration * 1000, 1500) + 800, 60000)
          : 20000;
      const fallback = setTimeout(finish, durationMs);
    });
  }

  async function playDesertLandscapes() {
    if (!heroSlides.length) return;

    for (let i = 0; i < heroSlides.length; i += 1) {
      setMontageSlide(i);
      await wait(SLIDE_MS);
    }
  }

  async function runHeroSequence() {
    if (prefersReduced) return;
    const seqId = ++heroSequenceId;
    heroSequenceRunning = true;

    while (true) {
      if (seqId !== heroSequenceId || prefersReduced) break;

      const video = activeHeroVideo();
      const other = inactiveHeroVideo();
      if (other) disarmVideo(other);

      showHeroVideo(video);
      await playHeroVideoOnce(video);
      if (seqId !== heroSequenceId) break;

      await crossfadeVideoToMontage(video);
      if (seqId !== heroSequenceId) break;

      await playDesertLandscapes();
      if (seqId !== heroSequenceId) break;

      resetMontageClasses();
      heroSlides.forEach((slide) => slide.classList.remove("is-active"));
      await wait(CROSSFADE_MS);
    }

    if (seqId === heroSequenceId) {
      heroSequenceRunning = false;
    }
  }

  function initReducedHero() {
    const video = activeHeroVideo();
    if (video) {
      video.classList.add("is-active");
      video.removeAttribute("autoplay");
      muteHeroVideo(video);
      video.pause();
    }
    if (heroSlides[0]) {
      setMontageSlide(0);
      if (heroMontage) {
        heroMontage.classList.add("is-active");
        heroMontage.setAttribute("aria-hidden", "false");
      }
    }
  }

  [desktopVideo, phoneVideo].forEach((video) => {
    if (!video) return;
    muteHeroVideo(video);
    video.loop = false;
    video.removeAttribute("loop");
  });

  resetMontageClasses();
  heroSlides.forEach((slide) => slide.classList.remove("is-active"));

  if (prefersReduced) {
    initReducedHero();
  } else {
    const video = activeHeroVideo();
    if (video) showHeroVideo(video);
    runHeroSequence();
  }

  if (typeof mobileHero.addEventListener === "function") {
    mobileHero.addEventListener("change", () => {
      heroSequenceId += 1;
      heroSequenceRunning = false;
      montagePreloaded = false;
      resetMontageClasses();
      heroSlides.forEach((slide) => slide.classList.remove("is-active"));
      [desktopVideo, phoneVideo].forEach((video) => {
        if (video) disarmVideo(video);
      });

      if (prefersReduced) {
        initReducedHero();
        return;
      }

      const video = activeHeroVideo();
      if (video) showHeroVideo(video);
      runHeroSequence();
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
