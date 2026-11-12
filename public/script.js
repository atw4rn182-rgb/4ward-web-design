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
  const commercial = window.fwHeroCommercial || null;
  const SLIDE_MS = 3600;
  const CROSSFADE_MS = 1100;
  const DECISION_MS = 10000;
  const SCROLL_CUE_MS = 5000;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let heroSequenceRunning = false;
  let montagePreloaded = false;
  let heroSequenceId = 0;
  let phase = "poster";
  let sequenceStarted = false;
  let decisionTimer = 0;
  const heroContent = document.querySelector(".hero-content");
  const learnBtn = document.querySelector("[data-commercial-learn]");
  const scrollCue = document.getElementById("hero-scroll-cue");

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

  function playHeroVideoOnce(video, seqId) {
    return new Promise((resolve) => {
      if (!video) {
        resolve();
        return;
      }

      let settled = false;
      let cancelWatch = 0;
      const finish = () => {
        if (settled) return;
        settled = true;
        video.removeEventListener("ended", onEnded);
        video.removeEventListener("timeupdate", onTimeUpdate);
        clearTimeout(fallback);
        clearInterval(cancelWatch);
        resolve();
      };

      const onEnded = () => finish();
      const onTimeUpdate = () => {
        const duration = video.duration;
        if (!Number.isFinite(duration) || duration <= 0) return;
        if (seqId !== heroSequenceId) {
          finish();
          return;
        }
        if (duration > 2 && video.currentTime / duration >= 0.55) {
          preloadMontageSlides();
          prepMontageUnderVideo();
        }
      };

      video.addEventListener("ended", onEnded);
      video.addEventListener("timeupdate", onTimeUpdate);
      cancelWatch = setInterval(() => {
        if (seqId !== heroSequenceId) finish();
      }, 200);

      const startPlayback = () => {
        try {
          video.loop = false;
          video.removeAttribute("loop");
          if (video.paused && Number.isFinite(video.currentTime) && video.currentTime > 0.05) {
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

  async function playDesertLandscapes(seqId) {
    if (!heroSlides.length) return;

    for (let i = 0; i < heroSlides.length; i += 1) {
      if (seqId !== heroSequenceId) return;
      setMontageSlide(i);
      await wait(SLIDE_MS);
    }
  }

  function blockBrandingClicks(blocked) {
    if (!heroContent) return;
    if (blocked) heroContent.setAttribute("inert", "");
    else heroContent.removeAttribute("inert");
  }

  function revealScrollCue() {
    if (!scrollCue || scrollCue.classList.contains("is-visible")) return;
    scrollCue.hidden = false;
    requestAnimationFrame(() => {
      if (scrollCue) scrollCue.classList.add("is-visible");
    });
  }

  function prepareUnderneath(video) {
    resetMontageClasses();
    heroSlides.forEach((slide) => slide.classList.remove("is-active"));
    if (!video) return;
    pauseInactiveVideos(video);
    video.classList.remove("is-leaving");
    video.classList.add("is-active");
    armVideo(video);
    muteHeroVideo(video);
    try {
      video.pause();
      if (video.currentTime > 0.05) video.currentTime = 0;
    } catch (_) {
      /* ignore */
    }
  }

  function runBrandingLoop(alreadyPrepared) {
    if (prefersReduced) {
      initReducedHero();
      return;
    }
    const seqId = ++heroSequenceId;
    heroSequenceRunning = true;
    let prepared = Boolean(alreadyPrepared);
    (async () => {
      while (true) {
        if (seqId !== heroSequenceId || prefersReduced) break;
        const video = activeHeroVideo();
        if (!video && !heroSlides.length) break;
        const other = inactiveHeroVideo();
        if (other) disarmVideo(other);
        if (!prepared) {
          await crossfadeMontageToVideo(video);
          if (seqId !== heroSequenceId) break;
        }
        prepared = false;
        await playHeroVideoOnce(video, seqId);
        if (seqId !== heroSequenceId) break;
        await crossfadeVideoToMontage(video);
        if (seqId !== heroSequenceId) break;
        await playDesertLandscapes(seqId);
        if (seqId !== heroSequenceId) break;
      }
      if (seqId === heroSequenceId) heroSequenceRunning = false;
    })();
  }

  function beginBranding(alreadyPrepared) {
    if (sequenceStarted) return;
    sequenceStarted = true;
    phase = "sequence";
    clearTimeout(decisionTimer);
    decisionTimer = 0;
    if (learnBtn) learnBtn.disabled = true;
    blockBrandingClicks(false);
    if (prefersReduced) {
      initReducedHero();
      return;
    }
    runBrandingLoop(alreadyPrepared);
  }

  function startHeroVideo(video) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        video.removeEventListener("playing", finish);
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(finish, 4000);
      video.addEventListener("playing", finish);
      ensurePlaying(video);
    });
  }

  async function crossfadeMontageToVideo(video) {
    if (!video) return;
    pauseInactiveVideos(video);
    video.classList.remove("is-active", "is-leaving");
    armVideo(video);
    muteHeroVideo(video);
    try {
      if (video.currentTime > 0.05) video.currentTime = 0;
    } catch (_) {
      /* ignore */
    }

    await startHeroVideo(video);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    video.classList.add("is-active");
    await wait(CROSSFADE_MS);

    resetMontageClasses();
    heroSlides.forEach((slide) => slide.classList.remove("is-active"));
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
  blockBrandingClicks(true);

  if (commercial && typeof commercial.showPoster === "function") {
    commercial.showPoster();
  } else if (desktopVideo || phoneVideo || heroSlides.length) {
    phase = "sequence";
    sequenceStarted = true;
    blockBrandingClicks(false);
    if (prefersReduced) initReducedHero();
    else {
      const video = activeHeroVideo();
      if (video) prepareUnderneath(video);
      runBrandingLoop(true);
    }
  }

  setTimeout(revealScrollCue, SCROLL_CUE_MS);

  if (phase === "poster") {
    decisionTimer = setTimeout(() => {
      if (phase !== "poster") return;
      const video = activeHeroVideo();
      if (!prefersReduced && video) prepareUnderneath(video);
      if (prefersReduced) initReducedHero();
      if (commercial && typeof commercial.dismiss === "function") commercial.dismiss();
      beginBranding(!prefersReduced);
    }, DECISION_MS);
  }

  if (learnBtn) {
    learnBtn.addEventListener("click", () => {
      if (phase !== "poster") return;
      phase = "commercial";
      clearTimeout(decisionTimer);
      decisionTimer = 0;
      learnBtn.disabled = true;
      const video = activeHeroVideo();
      if (!commercial || typeof commercial.play !== "function") {
        beginBranding(false);
        return;
      }
      commercial.play(() => prepareUnderneath(video)).then((covered) => {
        if (sequenceStarted) return;
        if (!covered && !prefersReduced && video) prepareUnderneath(video);
        if (commercial.silence) commercial.silence();
        if (prefersReduced) initReducedHero();
        beginBranding(!prefersReduced);
      });
    });
  }

  if (typeof mobileHero.addEventListener === "function") {
    mobileHero.addEventListener("change", () => {
      if (phase === "poster" || phase === "commercial") return;
      if (!sequenceStarted || prefersReduced) {
        if (prefersReduced) initReducedHero();
        return;
      }
      heroSequenceId += 1;
      heroSequenceRunning = false;
      const video = activeHeroVideo();
      if (video) prepareUnderneath(video);
      runBrandingLoop(true);
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
      if (window.innerWidth > 1100) closeNav();
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

  document.querySelectorAll("[data-results-toggle]").forEach((btn) => {
    const panel = document.getElementById(btn.getAttribute("aria-controls"));
    const block = btn.closest(".plan-results");
    if (!panel || !block) return;
    btn.addEventListener("click", () => {
      const open = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", open ? "false" : "true");
      block.classList.toggle("is-open", !open);
    });
  });

  document.querySelectorAll(".growth-showcase").forEach((block) => {
    block.querySelectorAll("[data-growth]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const view = btn.getAttribute("data-growth") === "after" ? "after" : "before";
        block.dataset.view = view;
        block.querySelectorAll("[data-growth]").forEach((item) => {
          item.setAttribute("aria-pressed", item === btn ? "true" : "false");
        });
        block.querySelectorAll(".growth-score").forEach((score) => {
          score.textContent = score.getAttribute(view === "after" ? "data-after" : "data-before") || "";
        });
      });
    });
  });

  function trackEvent(name, params) {
    if (typeof window.gtag !== "function") return;
    window.gtag("event", name, params);
  }

  document.addEventListener("click", (event) => {
    const badge = event.target.closest("[data-tier-badge]");
    if (badge) {
      trackEvent("tier_badge_click", {
        tier: badge.getAttribute("data-tier-badge") || "",
      });
      return;
    }

    const portfolioLink = event.target.closest("#work a[href^='http']");
    if (portfolioLink) {
      const project = portfolioLink.closest(".ba-project");
      const heading = project ? project.querySelector("h3") : null;
      trackEvent("portfolio_website_click", {
        project_name: heading ? heading.textContent.trim() : "",
        link_url: portfolioLink.href,
      });
      return;
    }

    const pricingCta = event.target.closest("#pricing .plan-actions a, .hero-actions a[href='#pricing']");
    if (!pricingCta) return;
    const plan = pricingCta.closest(".plan");
    trackEvent("pricing_cta_click", {
      cta_label: pricingCta.textContent.replace(/\s+/g, " ").trim(),
      tier: plan && plan.id ? plan.id.replace(/^plan-/, "") : "",
    });
  });

  const selectedOffer = document.getElementById("selected-offer");
  if (selectedOffer) {
    const offers = {
      local: {
        title: "10% off the monthly plan",
        copy: "This southeastern New Mexico offer is selected. Add the business address and confirm that it is in southeastern New Mexico. The 10% continues for the life of a new subscription.",
        address: true,
        service: false,
      },
      service: {
        title: "20% off the monthly plan",
        copy: "This military and first responder offer is selected. List the branch or service. The 20% continues for the life of a new subscription.",
        address: false,
        service: true,
      },
      both: {
        title: "10% then 20% off the monthly plan",
        copy: "Both offers are selected. The 10% local discount is applied first, then the 20% service discount. Tier 4 becomes $31.68/month for the life of a new subscription. The $200 setup fee and upfront buyouts are not discounted.",
        address: true,
        service: true,
      },
    };
    const offer = new URLSearchParams(window.location.search).get("offer");
    const choice = offers[offer];
    if (choice) {
      selectedOffer.hidden = false;
      document.getElementById("selected-offer-title").textContent = choice.title;
      document.getElementById("selected-offer-copy").textContent = choice.copy;
      const addressLabel = document.getElementById("offer-address-label");
      const attestLabel = document.getElementById("offer-attest-label");
      const serviceLabel = document.getElementById("offer-service-label");
      const address = document.getElementById("offer-address");
      const attest = document.getElementById("offer-attest");
      const service = document.getElementById("offer-service");
      const status = document.getElementById("selected-offer-status");
      addressLabel.hidden = !choice.address;
      attestLabel.hidden = !choice.address;
      serviceLabel.hidden = !choice.service;
      document.querySelectorAll('a[href^="consultation.html"]').forEach((link) => {
        const url = new URL(link.getAttribute("href"), window.location.href);
        url.searchParams.set("offer", offer);
        link.setAttribute("href", `${url.pathname.split("/").pop()}${url.search}`);
      });
      const remember = () => {
        const ready = (!choice.address || (address.value.trim() && attest.checked)) && (!choice.service || service.value.trim());
        sessionStorage.setItem(
          "fwSelectedOffer",
          JSON.stringify({
            offer,
            address: choice.address ? address.value.trim() : "",
            attested: choice.address ? attest.checked : false,
            service: choice.service ? service.value.trim() : "",
          })
        );
        status.textContent = ready
          ? "Checking the monthly total…"
          : "Add the required details to show how this offer applies.";
        clearTimeout(previewTimer);
        if (!ready) {
          refreshPlanTotals(false);
          return;
        }
        previewTimer = setTimeout(() => refreshPlanTotals(true), 450);
      };
      let priceRequest = 0;
      let previewTimer = 0;
      document.querySelectorAll(".plan-due").forEach((due) => {
        if (!due.dataset.standardDue) due.dataset.standardDue = due.textContent.trim();
      });
      async function refreshPlanTotals(ready) {
        const requestId = ++priceRequest;
        if (!ready) {
          document.querySelectorAll(".plan-due").forEach((due) => {
            if (due.dataset.standardDue) due.textContent = due.dataset.standardDue;
          });
          return;
        }
        const plans = ["tier4", "tier1", "tier2", "tier3"];
        await Promise.all(
          plans.map(async (tier) => {
            const due = document.querySelector(`#plan-${tier} .plan-due`);
            if (!due) return;
            const response = await fetch("/api/offer-preview", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                tier,
                addOns: [],
                offer,
                businessAddress: address.value,
                addressAttested: attest.checked ? "yes" : "no",
                serviceBranch: service.value,
              }),
            });
            if (requestId !== priceRequest || !response.ok) return;
            const data = await response.json();
            due.textContent = data.percent > 0 ? `${data.dueLabel}. ${data.thenLabel}.` : due.dataset.standardDue;
          })
        );
        if (requestId !== priceRequest) return;
        status.textContent = "The offer details are saved in this browser. The plan totals above match checkout for a new subscription with no add-ons.";
      }
      document.getElementById("selected-offer-form").addEventListener("submit", (event) => event.preventDefault());
      [address, attest, service].forEach((field) => field.addEventListener("input", remember));
      attest.addEventListener("change", remember);
      remember();
    }
  }
})();
