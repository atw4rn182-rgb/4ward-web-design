(function () {
  const AGREEMENT_VERSION = "service-agreement-v1";
  const STORAGE_KEY = "4ward-onboarding-v1";
  const MAX_LOGO_BYTES = 1.2 * 1024 * 1024;

  const TIERS = {
    tier1: {
      label: "Tier 1 — Single-Page Online Brochure",
      priceLabel: "$99/month",
      billing: "Recurring monthly via Stripe",
      includes: [
        "Full website hosting",
        "Complete website development and creation",
        "One-page site with contact information, address, phone, and a photo section",
        "Local SEO setup",
        "Ongoing maintenance",
        "2 free updates per month",
        "Additional updates: $99 each",
      ],
    },
    tier2: {
      label: "Tier 2 — Two-Page Customized Site",
      priceLabel: "$225/month",
      billing: "Recurring monthly via Stripe",
      includes: [
        "Full website hosting",
        "Complete website development and creation",
        "Two-page site customized to the business",
        "Photo gallery",
        "One request-a-quote form that sends directly to your email",
        "Local SEO",
        "Ongoing maintenance",
        "4 free updates per month",
        "Additional updates: $99 each",
      ],
    },
    tier3: {
      label: "Tier 3 — Multi-Page Multi-Department Website",
      priceLabel: "From $399/month",
      billing: "Recurring monthly via Stripe",
      includes: [
        "Full website hosting",
        "Complete website development and creation",
        "Multi-page site with separate sections for different departments",
        "Multiple request-a-quote forms routing to different emails",
        "Local SEO",
        "Ongoing maintenance",
        "AI chatbot available as an add-on ($399–$500/month)",
        "4 free updates per month",
        "Additional updates: $99 each",
      ],
    },
    "buyout-tier1": {
      label: "Tier 4 Buy-Out — 2 years of Tier 1",
      priceLabel: "$2,376 one-time",
      billing: "One-time Stripe payment (no monthly fee after)",
      includes: [
        "Everything in Tier 1 for two years paid upfront",
        "Full hosting, development/creation, local SEO, and maintenance",
        "No monthly fee after purchase",
        "Updates after buy-out: $150 each",
      ],
    },
    "buyout-tier2": {
      label: "Tier 4 Buy-Out — 2 years of Tier 2",
      priceLabel: "$5,400 one-time",
      billing: "One-time Stripe payment (no monthly fee after)",
      includes: [
        "Everything in Tier 2 for two years paid upfront",
        "Full hosting, development/creation, local SEO, and maintenance",
        "No monthly fee after purchase",
        "Updates after buy-out: $150 each",
      ],
    },
    "buyout-tier3": {
      label: "Tier 4 Buy-Out — 2 years of Tier 3",
      priceLabel: "$9,576 one-time",
      billing: "One-time Stripe payment (no monthly fee after)",
      includes: [
        "Everything in Tier 3 for two years paid upfront",
        "Full hosting, development/creation, local SEO, and maintenance",
        "No monthly fee after purchase",
        "Updates after buy-out: $150 each",
      ],
    },
  };

  const form = document.getElementById("onboard-form");
  const progress = document.getElementById("onboard-progress");
  const steps = Array.from(document.querySelectorAll(".onboard-step"));
  const tierSelect = document.getElementById("tier-select");
  const tierBreakdown = document.getElementById("tier-breakdown");
  const paymentSummary = document.getElementById("payment-summary");
  const statusEl = document.getElementById("onboard-status");
  const signDate = document.getElementById("sign-date");
  const logoInput = document.getElementById("logo");
  const logoPreview = document.getElementById("logo-preview");
  const logoPreviewImg = document.getElementById("logo-preview-img");
  const logoClear = document.getElementById("logo-clear");
  const successPanel = document.getElementById("onboard-success");
  const canceledPanel = document.getElementById("onboard-canceled");
  const resumeBtn = document.getElementById("resume-onboarding");
  const year = document.getElementById("year");
  const payBtn = document.getElementById("pay-btn");

  let currentStep = 1;
  let logoData = { name: "", type: "", dataUrl: "" };

  if (year) year.textContent = String(new Date().getFullYear());
  if (signDate) {
    signDate.textContent = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  const params = new URLSearchParams(window.location.search);
  const initialTier = {
    tier1: "tier1",
    tier2: "tier2",
    tier3: "tier3",
    buyout: "buyout-tier2",
    "buyout-tier1": "buyout-tier1",
    "buyout-tier2": "buyout-tier2",
    "buyout-tier3": "buyout-tier3",
  };

  function loadState() {
    try {
      return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function saveState() {
    if (!form) return;
    const data = new FormData(form);
    const state = {
      step: currentStep,
      signerName: data.get("signerName") || "",
      agree: document.getElementById("agree")?.checked || false,
      tier: data.get("tier") || "tier2",
      companyName: data.get("companyName") || "",
      contactName: data.get("contactName") || "",
      email: data.get("email") || "",
      phone: data.get("phone") || "",
      address: data.get("address") || "",
      existingLinks: data.get("existingLinks") || "",
      logo: logoData,
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function applyState(state) {
    if (!form || !state) return;
    if (state.signerName) form.signerName.value = state.signerName;
    if (state.agree) document.getElementById("agree").checked = true;
    if (state.tier && TIERS[state.tier]) tierSelect.value = state.tier;
    if (state.companyName) form.companyName.value = state.companyName;
    if (state.contactName) form.contactName.value = state.contactName;
    if (state.email) form.email.value = state.email;
    if (state.phone) form.phone.value = state.phone;
    if (state.address) form.address.value = state.address;
    if (state.existingLinks) form.existingLinks.value = state.existingLinks;
    if (state.logo && state.logo.dataUrl) {
      logoData = state.logo;
      logoPreviewImg.src = state.logo.dataUrl;
      logoPreview.hidden = false;
    }
  }

  function renderTier() {
    const tier = TIERS[tierSelect.value] || TIERS.tier2;
    tierBreakdown.innerHTML =
      "<header><p class=\"plan-tier\">Selected package</p><h3>" +
      tier.label +
      "</h3><p class=\"plan-price\"><span>" +
      tier.priceLabel +
      "</span></p><p class=\"plan-summary\">" +
      tier.billing +
      "</p></header><ul class=\"plan-features\">" +
      tier.includes.map((item) => "<li>" + item + "</li>").join("") +
      "</ul>";

    paymentSummary.innerHTML =
      "<h3>Order summary</h3><dl>" +
      "<div><dt>Plan</dt><dd>" +
      tier.label +
      "</dd></div>" +
      "<div><dt>Amount</dt><dd>" +
      tier.priceLabel +
      "</dd></div>" +
      "<div><dt>Billing</dt><dd>" +
      tier.billing +
      "</dd></div>" +
      "<div><dt>Company</dt><dd>" +
      (form.companyName.value || "—") +
      "</dd></div>" +
      "<div><dt>Contact</dt><dd>" +
      (form.contactName.value || "—") +
      "</dd></div>" +
      "<div><dt>Email</dt><dd>" +
      (form.email.value || "—") +
      "</dd></div>" +
      "<div><dt>Agreement</dt><dd>Signed by " +
      (form.signerName.value || "—") +
      "</dd></div>" +
      "<div><dt>Logo</dt><dd>" +
      (logoData.name || "Not uploaded") +
      "</dd></div>" +
      "</dl>";
  }

  function setStep(step) {
    currentStep = step;
    steps.forEach((section) => {
      const n = Number(section.dataset.step);
      const active = n === step;
      section.classList.toggle("is-active", active);
      section.hidden = !active;
    });
    progress.querySelectorAll("li").forEach((item) => {
      const n = Number(item.dataset.step);
      item.classList.toggle("is-active", n === step);
      item.classList.toggle("is-complete", n < step);
    });
    renderTier();
    saveState();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function validateStep(step) {
    const section = steps.find((s) => Number(s.dataset.step) === step);
    if (!section) return false;
    const fields = Array.from(section.querySelectorAll("input, select, textarea")).filter(
      (el) => el.type !== "file"
    );
    for (const field of fields) {
      if (!field.checkValidity()) {
        field.reportValidity();
        return false;
      }
    }
    return true;
  }

  function readLogo(file) {
    return new Promise((resolve, reject) => {
      if (!file) return resolve(null);
      if (file.size > MAX_LOGO_BYTES) {
        reject(new Error("Logo must be 1.2MB or smaller."));
        return;
      }
      const reader = new FileReader();
      reader.onload = () =>
        resolve({
          name: file.name,
          type: file.type,
          dataUrl: String(reader.result || ""),
        });
      reader.onerror = () => reject(new Error("Could not read logo file."));
      reader.readAsDataURL(file);
    });
  }

  if (logoInput) {
    logoInput.addEventListener("change", async () => {
      statusEl.textContent = "";
      statusEl.classList.remove("is-error");
      try {
        const next = await readLogo(logoInput.files && logoInput.files[0]);
        if (!next) return;
        logoData = next;
        logoPreviewImg.src = next.dataUrl;
        logoPreview.hidden = false;
        saveState();
      } catch (error) {
        logoInput.value = "";
        statusEl.classList.add("is-error");
        statusEl.textContent = error.message;
      }
    });
  }

  if (logoClear) {
    logoClear.addEventListener("click", () => {
      logoData = { name: "", type: "", dataUrl: "" };
      logoInput.value = "";
      logoPreview.hidden = true;
      logoPreviewImg.removeAttribute("src");
      saveState();
    });
  }

  form?.querySelectorAll("[data-next]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!validateStep(currentStep)) return;
      setStep(Math.min(4, currentStep + 1));
    });
  });

  form?.querySelectorAll("[data-back]").forEach((btn) => {
    btn.addEventListener("click", () => setStep(Math.max(1, currentStep - 1)));
  });

  tierSelect?.addEventListener("change", () => {
    renderTier();
    saveState();
  });

  form?.addEventListener("input", () => saveState());

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!validateStep(4)) return;

    statusEl.classList.remove("is-error");
    statusEl.textContent = "Creating secure Stripe Checkout session…";
    payBtn.disabled = true;

    const data = new FormData(form);
    const payload = {
      tier: data.get("tier"),
      companyName: data.get("companyName"),
      contactName: data.get("contactName"),
      email: data.get("email"),
      phone: data.get("phone"),
      address: data.get("address"),
      existingLinks: data.get("existingLinks"),
      signerName: data.get("signerName"),
      agreementVersion: AGREEMENT_VERSION,
      logoName: logoData.name,
      logoType: logoData.type,
      logoDataUrl: logoData.dataUrl,
    };

    try {
      const response = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.url) {
        throw new Error(result.error || "Unable to start Stripe Checkout.");
      }
      window.location.href = result.url;
    } catch (error) {
      statusEl.classList.add("is-error");
      statusEl.textContent = error.message || "Payment setup failed. Please try again.";
      payBtn.disabled = false;
    }
  });

  function showOutcome() {
    if (params.get("success") === "1") {
      form.hidden = true;
      progress.hidden = true;
      successPanel.hidden = false;
      sessionStorage.removeItem(STORAGE_KEY);
      return true;
    }
    if (params.get("canceled") === "1") {
      form.hidden = true;
      progress.hidden = true;
      canceledPanel.hidden = false;
      return true;
    }
    return false;
  }

  resumeBtn?.addEventListener("click", () => {
    canceledPanel.hidden = true;
    form.hidden = false;
    progress.hidden = false;
    setStep(4);
    history.replaceState({}, "", "/onboarding.html");
  });

  const saved = loadState();
  const tierParam = params.get("tier");
  if (tierParam && initialTier[tierParam]) {
    tierSelect.value = initialTier[tierParam];
  } else if (saved.tier && TIERS[saved.tier]) {
    tierSelect.value = saved.tier;
  } else {
    tierSelect.value = "tier2";
  }

  applyState(saved);

  if (!showOutcome()) {
    setStep(saved.step && saved.step >= 1 && saved.step <= 4 ? saved.step : 1);
  } else {
    renderTier();
  }
})();
