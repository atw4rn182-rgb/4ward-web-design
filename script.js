(function () {
  const header = document.querySelector(".site-header");
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".site-nav");
  const year = document.getElementById("year");
  const form = document.getElementById("quote-form");
  const status = document.getElementById("form-status");
  const monthly = document.getElementById("monthly-plans");
  const buyout = document.getElementById("buyout-plans");
  const planButtons = document.querySelectorAll("[data-plan-view]");

  if (year) {
    year.textContent = String(new Date().getFullYear());
  }

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const slides = Array.from(document.querySelectorAll(".hero-slide"));
  if (slides.length > 1 && !prefersReduced) {
    let current = slides.findIndex((slide) => slide.classList.contains("is-active"));
    if (current < 0) {
      current = 0;
      slides[0].classList.add("is-active");
    }

    window.setInterval(() => {
      const next = (current + 1) % slides.length;
      slides[current].classList.remove("is-active");
      slides[next].classList.add("is-active");
      current = next;
    }, 5000);
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

  planButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const view = button.getAttribute("data-plan-view");
      planButtons.forEach((btn) => {
        const active = btn === button;
        btn.classList.toggle("is-active", active);
        btn.setAttribute("aria-selected", String(active));
      });

      if (view === "monthly") {
        monthly?.classList.remove("is-hidden");
        monthly?.removeAttribute("hidden");
        buyout?.classList.add("is-hidden");
        buyout?.setAttribute("hidden", "");
      } else {
        buyout?.classList.remove("is-hidden");
        buyout?.removeAttribute("hidden");
        monthly?.classList.add("is-hidden");
        monthly?.setAttribute("hidden", "");
      }
    });
  });

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

  if (form && status) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      status.classList.remove("is-error");

      if (!form.checkValidity()) {
        status.classList.add("is-error");
        status.textContent = "Please fill in the required fields.";
        form.reportValidity();
        return;
      }

      const data = new FormData(form);
      const plan = data.get("plan") || "not specified";
      const name = data.get("name");

      const planLabels = {
        basic: "Basic Monthly",
        standard: "Standard Professional",
        premium: "Premium",
        buyout: "Buy-Out Option",
        unsure: "Not sure yet",
      };
      const planLabel = planLabels[plan] || "a plan";

      status.textContent =
        "Thanks, " +
        name +
        "! We’ve received your interest in " +
        planLabel +
        ". We’ll follow up shortly.";
      form.reset();
    });
  }
})();
