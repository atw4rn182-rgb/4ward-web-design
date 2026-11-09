(function () {
  const layer = document.getElementById("hero-commercial");
  const video = document.getElementById("hero-commercial-video");

  if (
    !layer ||
    !video ||
    typeof video.canPlayType !== "function" ||
    !video.canPlayType("video/mp4")
  ) {
    return;
  }

  // Keep in sync with the .hero-commercial opacity transition in styles.css.
  const FADE_MS = 800;
  const START_TIMEOUT_MS = 5000;
  const STALL_TIMEOUT_MS = 5000;
  const BACKDROP_FRAME_MS = 90;
  // Opening frame of the corrected commercial, past any empty decoder frame.
  const POSTER_TIME = 4;

  const screen = layer.querySelector(".hero-commercial-screen");
  const poster = layer.querySelector(".hero-commercial-poster");
  const canvas = layer.querySelector(".hero-commercial-backdrop");
  const progress = layer.querySelector(".hero-commercial-progress");
  const soundBtn = layer.querySelector("[data-commercial-sound]");
  const soundLabel = layer.querySelector("[data-commercial-sound-label]");
  const skipBtn = layer.querySelector("[data-commercial-skip]");
  const heroContent = document.querySelector(".hero-content");
  const ctx = canvas && canvas.getContext ? canvas.getContext("2d", { alpha: false }) : null;

  let awaitingSound = false;
  let run = null;
  let activePromise = null;
  let rafId = 0;
  let lastDraw = 0;
  let needsBackdrop = false;
  // idle → poster (still) → active (one play) → finished. Never restarts.
  let playbackState = "idle";

  function load() {
    if (video.getAttribute("src")) {
      video.preload = "auto";
      return;
    }
    video.preload = "auto";
    video.src = video.getAttribute("data-src");
  }

  function silence() {
    awaitingSound = false;
    try {
      video.pause();
      video.defaultMuted = true;
      video.muted = true;
      video.volume = 0;
      video.setAttribute("muted", "");
      video.loop = false;
      video.removeAttribute("loop");
    } catch (_) {
      /* ignore */
    }
    syncSoundButton();
  }

  function syncSoundButton() {
    if (!soundBtn) return;
    const on = playbackState === "active" && !awaitingSound && !video.paused && !video.muted && video.volume > 0;
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

  function capturePoster() {
    if (playbackState !== "poster" || !poster || video.readyState < 2) return;
    const width = video.videoWidth || 720;
    const height = video.videoHeight || 1280;
    if (!width || !height) return;
    const shot = document.createElement("canvas");
    shot.width = width;
    shot.height = height;
    const shotCtx = shot.getContext("2d", { alpha: false });
    if (!shotCtx) return;
    try {
      shotCtx.drawImage(video, 0, 0, width, height);
      poster.src = shot.toDataURL("image/jpeg", 0.82);
    } catch (_) {
      return;
    }
    if (ctx) {
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      } catch (_) {
        /* ignore */
      }
    }
    measureBackdrop();
  }

  function paintPoster() {
    if (playbackState !== "poster") return;
    silence();
    const duration = video.duration;
    const target = Number.isFinite(duration) && duration > 0.4
      ? Math.min(POSTER_TIME, duration - 0.15)
      : POSTER_TIME;
    try {
      if (Math.abs((video.currentTime || 0) - target) > 0.08) {
        video.currentTime = target;
      } else {
        capturePoster();
      }
    } catch (_) {
      /* ignore */
    }
    measureBackdrop();
  }

  function paintStillBackdrop() {
    measureBackdrop();
    if (!ctx || !poster || !poster.naturalWidth) return;
    try {
      ctx.drawImage(poster, 0, 0, canvas.width, canvas.height);
    } catch (_) {
      /* ignore */
    }
  }

  function showPoster() {
    if (playbackState === "active" || playbackState === "finished") return;
    playbackState = "poster";
    silence();
    if (progress) progress.style.transform = "scaleX(0)";
    layer.classList.add("is-active", "is-poster");
    layer.setAttribute("aria-hidden", "false");
    if (poster && poster.getAttribute("src")) {
      if (poster.complete && poster.naturalWidth > 0) paintStillBackdrop();
      else poster.addEventListener("load", paintStillBackdrop, { once: true });
      return;
    }
    load();
    if (video.readyState >= 2) paintPoster();
    else video.addEventListener("loadeddata", paintPoster, { once: true });
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
      layer.classList.remove("is-poster");
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

  function end(reason) {
    const current = run;
    if (!current || current.leaving) return;
    current.leaving = true;
    playbackState = "finished";
    clearRunTimers(current);
    silence();
    stopTick();

    if (!current.covered) {
      layer.classList.remove("is-active", "is-poster");
      layer.setAttribute("aria-hidden", "true");
      run = null;
      current.resolve(false);
      return;
    }

    layer.classList.remove("is-active", "is-poster");
    layer.setAttribute("aria-hidden", "true");
    if (layer.contains(document.activeElement)) {
      const target = document.querySelector(".hero-actions a");
      if (target) target.focus({ preventScroll: true });
    }
    current.resolve(true);
    setTimeout(() => {
      if (run !== current) return;
      silence();
      run = null;
    }, FADE_MS + 50);
  }

  function rewindThen(fn) {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener("seeked", done);
      fn();
    };
    try {
      video.pause();
      if (video.currentTime > 0.05) {
        video.addEventListener("seeked", done);
        video.currentTime = 0;
        setTimeout(done, 500);
        return;
      }
    } catch (_) {
      /* ignore */
    }
    done();
  }

  function play(onCovered) {
    if (activePromise) return activePromise;
    if (playbackState === "finished") return Promise.resolve(false);
    if (run) return Promise.resolve(false);

    playbackState = "active";
    load();
    layer.classList.remove("is-poster");
    layer.classList.add("is-active");
    layer.setAttribute("aria-hidden", "false");

    activePromise = new Promise((resolve) => {
      const current = {
        resolve,
        onCovered: onCovered || function () {},
        timers: {},
        shown: false,
        covered: false,
        leaving: false,
        promise: null,
      };
      current.promise = activePromise;
      run = current;
      rewindThen(() => {
        if (run !== current || current.leaving) return;
        setRunTimer(current, "start", START_TIMEOUT_MS, () => end("start-timeout"));
        startPlayback(current);
      });
    });
    return activePromise;
  }

  function dismiss() {
    if (playbackState === "active") {
      end("dismiss");
      return new Promise((resolve) => setTimeout(resolve, FADE_MS));
    }
    if (playbackState !== "finished") playbackState = "finished";
    silence();
    stopTick();
    layer.classList.remove("is-poster", "is-active");
    layer.setAttribute("aria-hidden", "true");
    return new Promise((resolve) => setTimeout(resolve, FADE_MS));
  }

  function abort() {
    const current = run;
    playbackState = "finished";
    silence();
    stopTick();
    layer.classList.remove("is-active", "is-poster");
    layer.setAttribute("aria-hidden", "true");
    if (!current) return;
    current.leaving = true;
    clearRunTimers(current);
    run = null;
    current.resolve(false);
  }

  video.addEventListener("playing", onPlaying);
  video.addEventListener("waiting", onWaiting);
  video.addEventListener("ended", () => end("ended"));
  video.addEventListener("play", () => {
    if (playbackState === "poster") silence();
  });
  video.addEventListener("seeked", () => {
    if (playbackState === "poster") {
      silence();
      capturePoster();
      return;
    }
    // A late poster seek must not skip the opening of an explicit play.
    if (playbackState === "active" && run && !run.shown && video.currentTime > 0.12) {
      try {
        video.currentTime = 0;
      } catch (_) {
        /* ignore */
      }
    }
  });
  video.addEventListener("error", () => {
    if (playbackState === "active" && video.getAttribute("src")) end("error");
  });

  if (soundBtn) {
    soundBtn.addEventListener("click", () => {
      if (!run || run.leaving || playbackState !== "active") return;
      if (awaitingSound) {
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
      if (!turnOn) {
        video.muted = true;
        video.volume = 0;
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

  silence();
  syncSoundButton();

  window.fwHeroCommercial = {
    load,
    showPoster,
    play,
    dismiss,
    abort,
    silence,
    isPlaying: function () {
      return playbackState === "active";
    },
  };
})();
