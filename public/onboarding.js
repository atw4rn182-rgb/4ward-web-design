(function () {
  const STORAGE_KEY = "4ward-onboarding-v1";
  const MAX_LOGO_BYTES = 1.2 * 1024 * 1024;
  const STATIC_FORMS_URL = "https://api.staticforms.dev/submit";
  const LAUNCH_FEE_CENTS = 20000;
  const REPORTS_CENTS = 4900;
  const BILINGUAL_CENTS = 500;

  function money(cents) {
    return "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0 });
  }

  const TIERS = {
    tier1: {
      label: "Tier 1 — Single Page Website",
      priceLabel: "$99/month starting",
      monthlyCents: 9900,
      mode: "subscription",
      billing: "Recurring monthly via Stripe, plus a $200 one-time Launch Fee",
      includes: [
        "$200 one-time Launch Fee (consultation, design/setup, domain/DNS if needed, on-page SEO, Analytics, forms, mobile optimization, testing, onboarding)",
        "Full online overhaul: professional website + Google Business Profile + local SEO foundation",
        "One-page site with contact information, address, phone, and photos",
        "Hosting, development, and ongoing maintenance",
        "Website submitted and crawled by Google",
        "2 free updates per month",
        "Additional updates: $99 each",
      ],
    },
    tier2: {
      label: "Tier 2 — Two-Page Customized Site",
      priceLabel: "$225/month starting",
      monthlyCents: 22500,
      mode: "subscription",
      billing: "Recurring monthly via Stripe, plus a $200 one-time Launch Fee",
      includes: [
        "$200 one-time Launch Fee (consultation, design/setup, domain/DNS if needed, on-page SEO, Analytics, forms, mobile optimization, testing, onboarding)",
        "Full online overhaul: professional website + Google Business Profile + local SEO foundation",
        "Two-page site customized to the business",
        "Photo gallery",
        "One request-a-quote form that sends directly to your email",
        "Hosting, development, and ongoing maintenance",
        "Website submitted and crawled by Google",
        "4 free updates per month",
        "Additional updates: $99 each",
      ],
    },
    tier3: {
      label: "Tier 3 — Multi-Page Multi-Department Website",
      priceLabel: "From $399/month",
      monthlyCents: 39900,
      mode: "subscription",
      billing: "Recurring monthly via Stripe, plus a $200 one-time Launch Fee",
      includes: [
        "$200 one-time Launch Fee (consultation, design/setup, domain/DNS if needed, on-page SEO, Analytics, forms, mobile optimization, testing, onboarding)",
        "Full online overhaul: professional website + Google Business Profile + local SEO foundation",
        "Multi-page site with separate sections for different departments",
        "Multiple request-a-quote forms routed to the right team",
        "Hosting, development, and ongoing maintenance",
        "Website submitted and crawled by Google",
        "Google Business Profile setup included free",
        "4 free updates per month",
        "Additional updates: $99 each",
      ],
    },
    "buyout-tier1": {
      label: "Tier 4 Buy-Out — 2 years of Tier 1",
      priceLabel: "$2,376 one-time",
      monthlyCents: 0,
      dueCents: 2376 * 100 + 20000,
      mode: "payment",
      billing: "One-time Stripe payment (no monthly fee after), plus a $200 Launch Fee",
      includes: [
        "$200 one-time Launch Fee at kickoff",
        "Everything in Tier 1 for two years paid upfront",
        "Full overhaul: website, Google Business Profile, and local SEO",
        "No monthly fee after purchase",
        "Updates after buy-out: $99 each",
      ],
    },
    "buyout-tier2": {
      label: "Tier 4 Buy-Out — 2 years of Tier 2",
      priceLabel: "$5,400 one-time",
      monthlyCents: 0,
      dueCents: 5400 * 100 + 20000,
      mode: "payment",
      billing: "One-time Stripe payment (no monthly fee after), plus a $200 Launch Fee",
      includes: [
        "$200 one-time Launch Fee at kickoff",
        "Everything in Tier 2 for two years paid upfront",
        "Full overhaul: website, Google Business Profile, and local SEO",
        "No monthly fee after purchase",
        "Updates after buy-out: $99 each",
      ],
    },
    "buyout-tier3": {
      label: "Tier 4 Buy-Out — 2 years of Tier 3",
      priceLabel: "$9,576 one-time",
      monthlyCents: 0,
      dueCents: 9576 * 100 + 20000,
      mode: "payment",
      billing: "One-time Stripe payment (no monthly fee after), plus a $200 Launch Fee",
      includes: [
        "$200 one-time Launch Fee at kickoff",
        "Everything in Tier 3 for two years paid upfront",
        "Full overhaul: website, Google Business Profile, and local SEO",
        "No monthly fee after purchase",
        "Updates after buy-out: $99 each",
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
  const addonsField = document.getElementById("recurring-addons");
  const bilingualInput = document.getElementById("addon-bilingual");
  const bilingualLabel = document.getElementById("addon-bilingual-label");
  const reportsInput = document.getElementById("addon-reports");
  const addonsHidden = document.getElementById("recurring-addons-hidden");

  let currentStep = 1;
  let logoMeta = { name: "", type: "" };

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
      name: data.get("name") || "",
      signedAgreement: document.getElementById("signed-agreement")?.checked || false,
      chosenTier: data.get("chosenTier") || "tier2",
      email: data.get("email") || "",
      phone: data.get("phone") || "",
      companyInformation: data.get("companyInformation") || "",
      existingOnlinePresence: data.get("existingOnlinePresence") || "",
      logoMeta,
      addonBilingual: Boolean(bilingualInput && bilingualInput.checked),
      addonReports: Boolean(reportsInput && reportsInput.checked),
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function applyState(state) {
    if (!form || !state) return;
    if (state.name) form.name.value = state.name;
    if (state.signedAgreement) document.getElementById("signed-agreement").checked = true;
    if (state.chosenTier && TIERS[state.chosenTier]) tierSelect.value = state.chosenTier;
    if (state.email) form.email.value = state.email;
    if (state.phone && form.phone) form.phone.value = state.phone;
    if (state.companyInformation) form.companyInformation.value = state.companyInformation;
    if (state.existingOnlinePresence) form.existingOnlinePresence.value = state.existingOnlinePresence;
    if (state.logoMeta) logoMeta = state.logoMeta;
    if (bilingualInput) bilingualInput.checked = Boolean(state.addonBilingual);
    if (reportsInput) reportsInput.checked = Boolean(state.addonReports);
  }

  function selectedAddOnIds(tier) {
    if (!tier || tier.mode !== "subscription") return [];
    const ids = [];
    if (bilingualInput && bilingualInput.checked) ids.push("bilingual");
    if (reportsInput && reportsInput.checked) ids.push("reports");
    return ids;
  }

  function addOnMonthlyCents(tierKey, ids) {
    let cents = 0;
    if (ids.includes("bilingual") && (tierKey === "tier1" || tierKey === "tier2")) {
      cents += BILINGUAL_CENTS;
    }
    if (ids.includes("reports")) cents += REPORTS_CENTS;
    return cents;
  }

  function addOnSummaryLines(tierKey, ids) {
    const lines = [];
    if (ids.includes("bilingual")) {
      lines.push(
        tierKey === "tier3"
          ? "Bilingual Website — Included"
          : "Bilingual Website — +$5/month"
      );
    }
    if (ids.includes("reports")) {
      lines.push("Monthly Updates – $49/mo");
    }
    return lines;
  }

  function renderTier() {
    const tierKey = tierSelect.value;
    const tier = TIERS[tierKey] || TIERS.tier2;
    const isMonthly = tier.mode === "subscription";
    if (addonsField) addonsField.hidden = !isMonthly;
    if (bilingualLabel) {
      bilingualLabel.textContent =
        tierKey === "tier3"
          ? "Bilingual Website — Included"
          : "Bilingual Website — +$5/month";
    }

    const addOnIds = selectedAddOnIds(tier);
    const addonCents = addOnMonthlyCents(tierKey, addOnIds);
    const addonLines = addOnSummaryLines(tierKey, addOnIds);
    if (addonsHidden) {
      addonsHidden.value = isMonthly
        ? addonLines.join("; ") || "None selected"
        : "Not applicable on buy-out";
    }

    const monthlyTotal = (tier.monthlyCents || 0) + addonCents;
    const dueToday = isMonthly
      ? LAUNCH_FEE_CENTS + monthlyTotal
      : tier.dueCents || LAUNCH_FEE_CENTS;
    const dueLabel = isMonthly
      ? money(dueToday) +
        " today (" +
        money(LAUNCH_FEE_CENTS) +
        " launch + " +
        money(monthlyTotal) +
        " first month)"
      : money(dueToday) + " today (buy-out + " + money(LAUNCH_FEE_CENTS) + " launch fee)";
    const thenLabel = isMonthly
      ? money(monthlyTotal) + "/month until canceled"
      : "No monthly fee";

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

    const addonDl = addonLines
      .map((line) => "<div><dt>Add-on</dt><dd>" + line + "</dd></div>")
      .join("");

    paymentSummary.innerHTML =
      "<h3>Order summary</h3><dl>" +
      "<div><dt>Plan</dt><dd>" +
      tier.label +
      "</dd></div>" +
      "<div><dt>Launch Fee</dt><dd>$200 one-time</dd></div>" +
      "<div><dt>First month</dt><dd>" +
      (isMonthly ? money(monthlyTotal) : "Included in buy-out") +
      "</dd></div>" +
      addonDl +
      "<div><dt>Due today</dt><dd>" +
      dueLabel +
      "</dd></div>" +
      "<div><dt>Then</dt><dd>" +
      thenLabel +
      "</dd></div>" +
      "<div><dt>Name</dt><dd>" +
      (form.name.value || "—") +
      "</dd></div>" +
      "<div><dt>Email</dt><dd>" +
      (form.email.value || "—") +
      "</dd></div>" +
      "<div><dt>Phone</dt><dd>" +
      (formatUsPhone(form.phone && form.phone.value) || form.phone.value || "—") +
      "</dd></div>" +
      "<div><dt>Agreement</dt><dd>" +
      (document.getElementById("signed-agreement")?.checked ? "Signed" : "Not signed") +
      "</dd></div>" +
      "<div><dt>Logo</dt><dd>" +
      (logoMeta.name || (logoInput && logoInput.files && logoInput.files[0] && logoInput.files[0].name) || "Not uploaded") +
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

  function formatUsPhone(value) {
    let digits = String(value || "").replace(/\D/g, "");
    if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
    if (digits.length !== 10) return "";
    return "(" + digits.slice(0, 3) + ") " + digits.slice(3, 6) + "-" + digits.slice(6);
  }

  function validateStep(step) {
    const section = steps.find((s) => Number(s.dataset.step) === step);
    if (!section) return false;
    const fields = Array.from(section.querySelectorAll("input, select, textarea")).filter(
      (el) => el.type !== "file" && el.name !== "honeypot"
    );
    for (const field of fields) {
      if (field.name === "phone") {
        const formatted = formatUsPhone(field.value);
        if (!formatted) {
          field.setCustomValidity("Enter a 10-digit U.S. phone number.");
          field.reportValidity();
          return false;
        }
        field.setCustomValidity("");
        field.value = formatted;
      } else if (field.setCustomValidity) {
        field.setCustomValidity("");
      }
      if (!field.checkValidity()) {
        field.reportValidity();
        return false;
      }
    }
    return true;
  }

  function companyLabelFromInfo(text) {
    const firstLine = String(text || "")
      .split(/\n|,/)
      .map((part) => part.trim())
      .find(Boolean);
    return firstLine || "New client";
  }

  async function submitStaticForms() {
    const formData = new FormData(form);
    // Ensure chosen tier text is readable in the email
    const tier = TIERS[tierSelect.value];
    if (tier) {
      formData.set("chosenTier", tierSelect.value + " — " + tier.label + " (" + tier.priceLabel + ")");
    }
    const addOnIds = selectedAddOnIds(tier);
    formData.set(
      "recurringAddOns",
      addOnSummaryLines(tierSelect.value, addOnIds).join("; ") || "None selected"
    );
    formData.set("companyName", companyLabelFromInfo(form.companyInformation.value));
    const formattedPhone = formatUsPhone(form.phone && form.phone.value);
    if (formattedPhone && form.phone) form.phone.value = formattedPhone;
    formData.set("phone", formattedPhone || (form.phone && form.phone.value) || "");
    formData.set(
      "bilingualRequested",
      bilingualInput && bilingualInput.checked ? "Yes" : "No"
    );

    const response = await fetch(STATIC_FORMS_URL, {
      method: "POST",
      body: formData,
      headers: { Accept: "application/json" },
    });

    let result = {};
    try {
      result = await response.json();
    } catch {
      result = {};
    }

    if (!response.ok) {
      throw new Error(result.message || result.error || "Static Forms submission failed.");
    }

    // Some Static Forms responses use success flags; others return 200 with HTML/redirect.
    if (result.success === false) {
      throw new Error(result.message || "Static Forms rejected the submission.");
    }

    return result;
  }

  async function startStripeCheckout() {
    const data = new FormData(form);
    const companyInformation = String(data.get("companyInformation") || "");
    const payload = {
      tier: tierSelect.value,
      companyName: companyLabelFromInfo(companyInformation),
      contactName: data.get("name") || "",
      email: data.get("email") || "",
      phone: formatUsPhone(data.get("phone") || "") || data.get("phone") || "",
      address: "",
      existingLinks: data.get("existingOnlinePresence") || "",
      signerName: data.get("name") || "",
      agreementVersion: "service-agreement-v1",
      logoName: (logoInput && logoInput.files && logoInput.files[0] && logoInput.files[0].name) || logoMeta.name || "",
      logoType: (logoInput && logoInput.files && logoInput.files[0] && logoInput.files[0].type) || logoMeta.type || "",
      companyInformation,
      signedAgreement: document.getElementById("signed-agreement")?.checked ? "yes" : "no",
      addOns: selectedAddOnIds(TIERS[tierSelect.value]),
    };

    const response = await fetch("/api/create-checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || (!result.url && !result.sessionId)) {
      throw new Error(result.error || "Unable to start Stripe Checkout.");
    }

    if (result.url) {
      window.location.href = result.url;
      return;
    }

    if (window.Stripe && result.publishableKey && result.sessionId) {
      const stripe = window.Stripe(result.publishableKey);
      const { error } = await stripe.redirectToCheckout({ sessionId: result.sessionId });
      if (error) throw new Error(error.message || "Stripe redirect failed.");
      return;
    }

    throw new Error("Stripe Checkout did not return a session.");
  }

  if (logoInput) {
    logoInput.addEventListener("change", () => {
      statusEl.textContent = "";
      statusEl.classList.remove("is-error");
      const file = logoInput.files && logoInput.files[0];
      if (!file) return;
      if (file.size > MAX_LOGO_BYTES) {
        logoInput.value = "";
        statusEl.classList.add("is-error");
        statusEl.textContent = "Logo must be 1.2MB or smaller.";
        return;
      }
      logoMeta = { name: file.name, type: file.type };
      const reader = new FileReader();
      reader.onload = () => {
        logoPreviewImg.src = String(reader.result || "");
        logoPreview.hidden = false;
        saveState();
      };
      reader.readAsDataURL(file);
    });
  }

  if (logoClear) {
    logoClear.addEventListener("click", () => {
      logoMeta = { name: "", type: "" };
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

  form?.phone?.addEventListener("blur", () => {
    const formatted = formatUsPhone(form.phone.value);
    if (formatted) form.phone.value = formatted;
    saveState();
  });

  bilingualInput?.addEventListener("change", () => {
    renderTier();
    saveState();
  });
  reportsInput?.addEventListener("change", () => {
    renderTier();
    saveState();
  });

  form?.addEventListener("input", () => saveState());

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!validateStep(1) || !validateStep(2) || !validateStep(3) || !validateStep(4)) {
      return;
    }

    statusEl.classList.remove("is-error");
    statusEl.textContent = "Submitting onboarding details…";
    payBtn.disabled = true;

    try {
      await submitStaticForms();
      statusEl.textContent = "Details sent. Opening secure Stripe Checkout…";
      await startStripeCheckout();
    } catch (error) {
      statusEl.classList.add("is-error");
      statusEl.textContent = error.message || "Submission failed. Please try again.";
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
  } else if (saved.chosenTier && TIERS[saved.chosenTier]) {
    tierSelect.value = saved.chosenTier;
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
