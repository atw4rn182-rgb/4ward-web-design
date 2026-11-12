(function () {
  const form = document.getElementById("consult-form");
  const statusEl = document.getElementById("consult-status");
  const submitBtn = document.getElementById("consult-submit");
  const successPanel = document.getElementById("consult-success");
  const year = document.getElementById("consult-year");
  const tierSelect = document.getElementById("consult-tier");
  const phoneInput = document.getElementById("consult-phone");
  const directCheckout = document.getElementById("direct-checkout");
  const successCheckout = document.getElementById("success-checkout");
  const navCheckout = document.getElementById("nav-checkout");
  const hpField = form ? form.querySelector('input[name="_hp_ref"]') : null;
  let hpTouched = false;
  let sending = false;

  if (year) year.textContent = String(new Date().getFullYear());

  const allowedTiers = {
    tier1: "tier1",
    tier2: "tier2",
    tier3: "tier3",
    tier4: "tier4",
    buyout: "buyout",
    "buyout-tier1": "buyout-tier1",
    "buyout-tier2": "buyout-tier2",
    "buyout-tier3": "buyout-tier3",
    "buyout-tier4": "buyout-tier4",
  };
  const params = new URLSearchParams(window.location.search);
  const requestedTier = allowedTiers[params.get("tier") || ""] || "";
  if (requestedTier && tierSelect) tierSelect.value = requestedTier;

  const note = (params.get("note") || "").replace(/\s+/g, " ").trim().slice(0, 900);
  const description = document.getElementById("consult-description");
  if (note && description && !description.value) description.value = note;

  const offer = ["local", "service", "both"].includes(params.get("offer") || "") ? params.get("offer") : "";

  function checkoutHref() {
    const tier = tierSelect ? tierSelect.value : "";
    const query = new URLSearchParams();
    if (tier) query.set("tier", tier);
    if (offer) query.set("offer", offer);
    const text = query.toString();
    return text ? "onboarding.html?" + text : "onboarding.html";
  }

  function syncCheckoutLinks() {
    const href = checkoutHref();
    [directCheckout, successCheckout, navCheckout].forEach((link) => {
      if (link) link.href = href;
    });
    if (phoneInput) phoneInput.required = false;
  }

  syncCheckoutLinks();
  if (tierSelect) tierSelect.addEventListener("change", syncCheckoutLinks);
  if (form) {
    form.querySelectorAll('input[name="contactMethod"]').forEach((input) => {
      input.addEventListener("change", syncCheckoutLinks);
    });
  }

  if (hpField) {
    const markHpTouched = () => {
      hpTouched = true;
    };
    hpField.addEventListener("pointerdown", markHpTouched);
    hpField.addEventListener("keydown", markHpTouched);
  }

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (sending) return;
    sending = true;
    syncCheckoutLinks();
    if (!form.checkValidity()) {
      sending = false;
      form.reportValidity();
      return;
    }
    if (hpField && !hpTouched) hpField.value = "";

    const data = new FormData(form);
    const payload = {
      businessName: data.get("businessName") || "",
      contactName: data.get("contactName") || "",
      email: data.get("email") || "",
      phone: data.get("phone") || "",
      city: data.get("city") || "",
      industry: data.get("industry") || "",
      hasWebsite: data.get("hasWebsite") || "",
      website: data.get("website") || "",
      tier: data.get("tier") || "",
      description: data.get("description") || "",
      contactMethod: data.get("contactMethod") || "",
      contactTime: data.get("contactTime") || "",
      _hp_ref: data.get("_hp_ref") || "",
    };

    statusEl.classList.remove("is-error");
    statusEl.textContent = "Sending your request…";
    submitBtn.disabled = true;

    try {
      const response = await fetch("/api/consultation", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok === false || result.skipped) {
        throw new Error(result.error || "We couldn't send your request. Please try again.");
      }
      form.hidden = true;
      successPanel.hidden = false;
      successPanel.focus?.();
      window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    } catch (error) {
      sending = false;
      submitBtn.disabled = false;
      statusEl.classList.add("is-error");
      statusEl.textContent = error.message || "Submission failed. Please try again.";
    }
  });
})();
