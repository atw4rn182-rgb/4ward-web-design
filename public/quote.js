(function () {
  const form = document.getElementById("quote-form");
  const statusEl = document.getElementById("quote-status");
  const submitBtn = document.getElementById("quote-submit");
  const successPanel = document.getElementById("quote-success");
  const year = document.getElementById("quote-year");
  const hpField = form?.querySelector('input[name="_hp_ref"]');
  let hpTouched = false;

  if (year) year.textContent = String(new Date().getFullYear());

  if (hpField) {
    const markHpTouched = () => {
      hpTouched = true;
    };
    hpField.addEventListener("pointerdown", markHpTouched);
    hpField.addEventListener("keydown", markHpTouched);
  }

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

    if (hpField && !hpTouched) {
      hpField.value = "";
    }

    statusEl.classList.remove("is-error");
    statusEl.textContent = "Saving your request…";
    submitBtn.disabled = true;

    const data = new FormData(form);
    const payload = {
      name: data.get("name") || "",
      email: data.get("email") || "",
      phone: data.get("phone") || "",
      company: data.get("company") || "",
      service: data.get("service") || "",
      quantity: data.get("quantity") || "",
      message: data.get("message") || "",
      _hp_ref: data.get("_hp_ref") || "",
    };

    try {
      const response = await fetch("/api/quote-request", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok === false || result.skipped || result.duplicate) {
        throw new Error(
          result.error ||
            (result.skipped
              ? "We couldn't submit your request. Please try again."
              : result.duplicate
                ? "We already received this request recently. There's no need to submit it again."
                : result.message || "Quote request failed.")
        );
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
