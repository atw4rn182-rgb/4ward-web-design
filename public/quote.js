(function () {
  const STATIC_FORMS_URL = "https://api.staticforms.dev/submit";
  const form = document.getElementById("quote-form");
  const statusEl = document.getElementById("quote-status");
  const submitBtn = document.getElementById("quote-submit");
  const successPanel = document.getElementById("quote-success");
  const year = document.getElementById("quote-year");

  if (year) year.textContent = String(new Date().getFullYear());

  const params = new URLSearchParams(window.location.search);
  const serviceParam = params.get("service");
  const serviceSelect = document.getElementById("quote-service");
  if (serviceParam && serviceSelect) {
    const match = Array.from(serviceSelect.options).find(
      (option) => option.value.toLowerCase() === serviceParam.toLowerCase()
    );
    if (match) serviceSelect.value = match.value;
  }

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    statusEl.classList.remove("is-error");
    statusEl.textContent = "Sending your request…";
    submitBtn.disabled = true;

    try {
      const response = await fetch(STATIC_FORMS_URL, {
        method: "POST",
        body: new FormData(form),
        headers: { Accept: "application/json" },
      });
      let result = {};
      try {
        result = await response.json();
      } catch {
        result = {};
      }
      if (!response.ok || result.success === false) {
        throw new Error(result.message || result.error || "Quote request failed.");
      }

      form.hidden = true;
      successPanel.hidden = false;
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      statusEl.classList.add("is-error");
      statusEl.textContent = error.message || "Submission failed. Please try again.";
      submitBtn.disabled = false;
    }
  });
})();
