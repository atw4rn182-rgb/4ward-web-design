(function () {
  const layer = document.getElementById("hero-commercial");
  const video = document.getElementById("hero-commercial-video");

  if (
    !layer ||
    !video ||
    typeof video.canPlayType !== "function" ||
    !video.canPlayType("video/mp4") ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return;
  }

  // Keep in sync with the .hero-commercial opacity transition in styles.css.
  const FADE_MS = 800;
  const START_TIMEOUT_MS = 5000;
  const STALL_TIMEOUT_MS = 5000;
  const BACKDROP_FRAME_MS = 90;

  const screen = layer.querySelector(".hero-commercial-screen");
  const canvas = layer.querySelector(".hero-commercial-backdrop");
  const progress = layer.querySelector(".hero-commercial-progress");
  const soundBtn = layer.querySelector("[data-commercial-sound]");
  const soundLabel = layer.querySelector("[data-commercial-sound-label]");
  const skipBtn = layer.querySelector("[data-commercial-skip]");
  const heroContent = document.querySelector(".hero-content");
  const ctx = canvas && canvas.getContext ? canvas.getContext("2d", { alpha: false }) : null;

  // null = no choice yet; true/false = the visitor's explicit sound choice.
  let soundChoice = null;
  let awaitingSound = false;
  let run = null;
  let rafId = 0;
  let lastDraw = 0;
  let needsBackdrop = false;

  function load() {
    if (video.getAttribute("src")) return;
    video.preload = "auto";
    video.src = video.getAttribute("data-src");
  }

  function syncSoundButton() {
    if (!soundBtn) return;
    const on = !awaitingSound && !video.paused && !video.muted && video.volume > 0;
    layer.classList.toggle("is-sound-on", on);
    soundBtn.setAttribute("aria-pressed", String(on));
    soundBtn.setAttribute("aria-label", on ? "Mute commercial" : "Play commercial with sound");
    if (soundLabel) soundLabel.textContent = on ? "Mute" : "Play with Sound";
  }

  function measureBackdrop() {
    if (!screen) return;
    needsBackdrop = screen.getBoundingClientRect().width < layer.clientWidth - 2;
    layer.classList.toggle("has-backdrop", needsBackdrop);
  }

  function tick(now) {
    rafId = requestAnimationFrame(tick);
    const duration = video.duration;
    if (progress && Number.isFinite(duration) && duration > 0) {
      progress.style.transform = `scaleX(${Math.min(video.currentTime / duration, 1)})`;
    }
    if (ctx && needsBackdrop && video.readyState >= 2 && now - lastDraw > BACKDROP_FRAME_MS) {
      lastDraw = now;
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      } catch (_) {
        /* ignore */
      }
    }
  }

  function stopTick() {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function fadeAudioOut() {
    const startVolume = video.volume;
    const startTime = performance.now();
    const step = (now) => {
      const t = Math.min(Math.max((now - startTime) / FADE_MS, 0), 1);
      try {
        video.volume = startVolume * (1 - t);
      } catch (_) {
        return;
      }
      if (t < 1 && run && run.leaving) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function resetVideo() {
    try {
      video.pause();
      video.currentTime = 0;
      video.volume = 1;
    } catch (_) {
      /* ignore */
    }
    if (progress) progress.style.transform = "scaleX(0)";
  }

  function playAudible() {
    video.defaultMuted = false;
    video.muted = false;
    video.removeAttribute("muted");
    try {
      video.volume = 1;
    } catch (_) {
      /* ignore */
    }
    syncSoundButton();
    let promise;
    try {
      promise = video.play();
    } catch (_) {
      promise = null;
    }
    return promise && typeof promise.then === "function" ? promise : Promise.resolve();
  }

  function revealLayer(current) {
    if (!current || current.leaving || current.shown) return;
    current.shown = true;
    measureBackdrop();
    requestAnimationFrame(() => {
      if (run !== current || current.leaving) return;
      layer.classList.add("is-active");
      layer.setAttribute("aria-hidden", "false");
      setRunTimer(current, "covered", FADE_MS + 50, () => {
        if (run !== current || current.covered) return;
        current.covered = true;
        try {
          current.onCovered();
        } catch (_) {
          /* ignore */
        }
      });
    });
  }

  function holdForSound(current) {
    if (run !== current || current.leaving) return;
    awaitingSound = true;
    clearTimeout(current.timers.start);
    try {
      video.pause();
      if (video.currentTime > 0.05) video.currentTime = 0;
    } catch (_) {
      /* ignore */
    }
    video.defaultMuted = false;
    video.muted = false;
    video.removeAttribute("muted");
    try {
      video.volume = 1;
    } catch (_) {
      /* ignore */
    }
    syncSoundButton();
    revealLayer(current);
  }

  function startPlayback(current) {
    playAudible().catch((err) => {
      if (run !== current) return;
      if (err && err.name === "NotAllowedError") {
        holdForSound(current);
        return;
      }
      if (!err || err.name !== "AbortError") end("play-failed");
    });
  }

  function setRunTimer(current, name, ms, fn) {
    clearTimeout(current.timers[name]);
    current.timers[name] = setTimeout(() => {
      if (run === current) fn();
    }, ms);
  }

  function clearRunTimers(current) {
    Object.values(current.timers).forEach(clearTimeout);
    current.timers = {};
  }

  function onPlaying() {
    const current = run;
    if (!current || current.leaving) return;
    clearTimeout(current.timers.start);
    clearTimeout(current.timers.stall);
    awaitingSound = false;
    syncSoundButton();
    if (!rafId) {
      lastDraw = 0;
      tick(performance.now());
    }
    revealLayer(current);
  }

  function onWaiting() {
    const current = run;
    if (!current || current.leaving || !current.shown) return;
    setRunTimer(current, "stall", STALL_TIMEOUT_MS, () => end("stalled"));
  }

  // Hides the layer and resolves the run. A run that never covered the hero
  // resolves `false` so the caller can use its normal transition instead.
  function end(reason) {
    const current = run;
    if (!current || current.leaving) return;
    current.leaving = true;
    clearRunTimers(current);

    if (!current.covered) {
      layer.classList.remove("is-active");
      layer.setAttribute("aria-hidden", "true");
      stopTick();
      resetVideo();
      run = null;
      current.resolve(false);
      return;
    }

    if (reason !== "ended" && !video.muted) fadeAudioOut();
    layer.classList.remove("is-active");
    layer.setAttribute("aria-hidden", "true");
    if (layer.contains(document.activeElement)) {
      const target = document.querySelector(".hero-actions a");
      if (target) target.focus({ preventScroll: true });
    }
    current.resolve(true);
    setTimeout(() => {
      if (run !== current) return;
      stopTick();
      resetVideo();
      run = null;
    }, FADE_MS + 50);
  }

  // Plays the commercial once over the hero. `onCovered` runs once the layer is
  // fully opaque so the caller can swap what sits underneath without it showing.
  // Resolves when the layer starts fading out (true) or if it never showed (false).
  function play(onCovered) {
    if (run) end("replaced");
    load();
    return new Promise((resolve) => {
      const current = { resolve, onCovered, timers: {}, shown: false, covered: false, leaving: false };
      run = current;
      try {
        if (video.currentTime > 0.05) video.currentTime = 0;
      } catch (_) {
        /* ignore */
      }
      setRunTimer(current, "start", START_TIMEOUT_MS, () => end("start-timeout"));
      startPlayback(current);
    });
  }

  function abort() {
    const current = run;
    if (!current) return;
    current.leaving = true;
    clearRunTimers(current);
    layer.classList.remove("is-active");
    layer.setAttribute("aria-hidden", "true");
    stopTick();
    resetVideo();
    run = null;
    current.resolve(false);
  }

  video.addEventListener("playing", onPlaying);
  video.addEventListener("waiting", onWaiting);
  video.addEventListener("ended", () => end("ended"));
  video.addEventListener("error", () => {
    if (video.getAttribute("src")) end("error");
  });

  if (soundBtn) {
    soundBtn.addEventListener("click", () => {
      if (!run || run.leaving) return;
      if (awaitingSound) {
        soundChoice = true;
        awaitingSound = false;
        try {
          if (video.currentTime > 0.05) video.currentTime = 0;
        } catch (_) {
          /* ignore */
        }
        playAudible().catch(() => {
          if (!run || run.leaving) return;
          awaitingSound = true;
          syncSoundButton();
        });
        return;
      }
      const turnOn = video.muted || video.volume === 0;
      soundChoice = turnOn;
      if (!turnOn) {
        video.muted = true;
        syncSoundButton();
        return;
      }
      playAudible().catch(() => {});
    });
  }

  if (skipBtn) skipBtn.addEventListener("click", () => end("skip"));
  if (heroContent) heroContent.addEventListener("focusin", () => end("focus"));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && run && run.shown) end("skip");
  });
  window.addEventListener("resize", measureBackdrop, { passive: true });

  syncSoundButton();

  window.fwHeroCommercial = { load, play, abort };
})();
