import { FINDING_MS, QUESTIONS, recommend } from "./tier-finder-logic.mjs?v=finder4";

const ICONS = {
  info: '<path d="M12 8h.01M11 12h1v5h1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  pay: '<rect x="3.5" y="6" width="17" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 10h17" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  edit: '<path d="M4 16.5V20h3.5L19 8.5 15.5 5 4 16.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  departments: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 3.5v4M16 3.5v4M4 10h16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  refresh: '<path d="M19 12a7 7 0 1 1-2-4.9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M19 4.5V8h-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4 7l8 6 8-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  phone: '<path d="M8 4.5h2.2l1.2 3-1.6 1a12 12 0 0 0 5.7 5.7l1-1.6 3 1.2V18a1.5 1.5 0 0 1-1.6 1.5A14.5 14.5 0 0 1 4.5 6.1 1.5 1.5 0 0 1 6 4.5H8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  store: '<path d="M4 10l1.2-4h13.6L20 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M5 10v8h14v-8M9 18v-4h6v4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
};

const root = document.querySelector("[data-tier-finder]");
if (root) {
  const intro = root.querySelector("[data-tier-intro]");
  const panel = root.querySelector("[data-tier-panel]");
  const stage = root.querySelector("[data-tier-stage]");
  const stepLabel = root.querySelector("[data-tier-step]");
  const progress = root.querySelector("[data-tier-progress]");
  const fill = root.querySelector("[data-tier-fill]");
  const backButton = root.querySelector("[data-tier-back]");
  const restartButton = root.querySelector("[data-tier-restart]");
  const startButton = root.querySelector("[data-tier-start]");
  const section = root.closest("section");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const answers = [null, null, null, null];
  let step = 0;
  let phase = "intro";
  let locked = false;
  let timer = 0;

  function icon(name) {
    const wrap = document.createElement("span");
    wrap.className = "tier-finder-icon";
    wrap.setAttribute("aria-hidden", "true");
    wrap.innerHTML = `<svg viewBox="0 0 24 24" focusable="false">${ICONS[name] || ICONS.info}</svg>`;
    return wrap;
  }

  function clearTimer() {
    window.clearTimeout(timer);
    timer = 0;
  }

  function setProgress(value, text) {
    const safe = Math.max(0, Math.min(4, value));
    progress.setAttribute("aria-valuenow", String(safe));
    progress.setAttribute("aria-valuetext", text);
    stepLabel.textContent = text;
    fill.style.transform = `scaleX(${safe === 0 ? 0.08 : safe / 4})`;
  }

  function focusHeading() {
    const heading = stage.querySelector("h3");
    if (!heading) return;
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }

  function renderQuestion() {
    phase = "question";
    const question = QUESTIONS[step];
    const chosen = answers[step];
    setProgress(step, `Question ${step + 1} of 4`);
    backButton.hidden = step === 0;
    restartButton.hidden = false;
    stage.replaceChildren();

    const title = document.createElement("h3");
    title.id = "tier-finder-question";
    title.textContent = question.prompt;

    const group = document.createElement("div");
    group.className = "tier-finder-options";
    group.setAttribute("role", "radiogroup");
    group.setAttribute("aria-labelledby", title.id);

    question.options.forEach((option, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tier-finder-option";
      button.setAttribute("role", "radio");
      button.setAttribute("aria-checked", option.id === chosen ? "true" : "false");
      button.dataset.answer = option.id;
      if (option.id === chosen) button.classList.add("is-selected");
      if (index > 0) button.tabIndex = -1;

      const copy = document.createElement("span");
      copy.className = "tier-finder-option-copy";
      const letter = document.createElement("span");
      letter.className = "tier-finder-letter";
      letter.textContent = option.id.toUpperCase();
      const label = document.createElement("span");
      label.textContent = option.label;
      copy.append(letter, label);
      button.append(icon(option.icon), copy);
      group.append(button);
    });

    stage.append(title, group);
    if (section) section.setAttribute("aria-labelledby", title.id);
    focusHeading();
  }

  function renderFinding() {
    phase = "finding";
    setProgress(4, "Finding your perfect fit");
    backButton.hidden = false;
    restartButton.hidden = false;
    stage.replaceChildren();
    const wrap = document.createElement("div");
    wrap.className = "tier-finder-finding";
    const title = document.createElement("h3");
    title.textContent = "Finding Your Perfect Fit...";
    const bar = document.createElement("span");
    bar.className = "tier-finder-finding-bar";
    bar.setAttribute("aria-hidden", "true");
    wrap.append(title, bar);
    stage.append(wrap);
    focusHeading();
  }

  function renderResult(result) {
    phase = "result";
    setProgress(4, `Recommended ${result.name}`);
    backButton.hidden = false;
    backButton.textContent = "Back";
    restartButton.hidden = false;
    stage.replaceChildren();

    const title = document.createElement("h3");
    title.id = "tier-finder-result";
    title.textContent = result.headline;

    const name = document.createElement("p");
    name.className = "tier-finder-package";
    name.textContent = result.name;

    const price = document.createElement("p");
    price.className = "tier-finder-price";
    price.textContent = result.price;

    const detail = document.createElement("p");
    detail.className = "tier-finder-price-detail";
    detail.textContent = result.priceDetail;

    const explanation = document.createElement("p");
    explanation.className = "tier-finder-explanation";
    explanation.textContent = result.explanation;

    const benefits = document.createElement("ul");
    benefits.className = "tier-finder-benefits";
    result.benefits.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      benefits.append(li);
    });

    const presence = document.createElement("p");
    presence.className = "tier-finder-presence";
    presence.textContent = result.presence;

    if (result.gaps.length) {
      const gaps = document.createElement("div");
      gaps.className = "tier-finder-gaps";
      const label = document.createElement("p");
      label.className = "tier-finder-kicker";
      label.textContent = "Not included in the current package";
      const list = document.createElement("ul");
      result.gaps.forEach((item) => {
        const li = document.createElement("li");
        li.textContent = item;
        list.append(li);
      });
      gaps.append(label, list);
      stage.append(title, name, price, detail, explanation, benefits, gaps, presence);
    } else {
      stage.append(title, name, price, detail, explanation, benefits, presence);
    }

    if (result.results) {
      const results = document.createElement("div");
      results.className = "tier-finder-results";
      const kicker = document.createElement("p");
      kicker.className = "tier-finder-kicker";
      kicker.textContent = result.results.kicker;
      const heading = document.createElement("p");
      heading.className = "tier-finder-results-title";
      heading.textContent = result.results.title;
      const stats = document.createElement("div");
      stats.className = "tier-finder-stats";
      result.results.stats.forEach((stat) => {
        const card = document.createElement("article");
        const label = document.createElement("h4");
        label.textContent = stat.label;
        const change = document.createElement("p");
        change.className = "tier-finder-change";
        change.textContent = stat.change;
        const info = document.createElement("p");
        info.textContent = stat.detail;
        card.append(label, change, info);
        stats.append(card);
      });
      const source = document.createElement("p");
      source.className = "tier-finder-source";
      source.textContent = result.results.source;
      results.append(kicker, heading, stats, source);
      stage.append(results);
    }

    if (result.examples.length) {
      const examples = document.createElement("div");
      examples.className = "tier-finder-examples";
      result.examples.forEach((example) => {
        const link = document.createElement("a");
        link.className = "tier-finder-example";
        link.href = example.href;
        if (example.external) {
          link.target = "_blank";
          link.rel = "noopener noreferrer";
        }
        const image = document.createElement("img");
        image.src = example.image;
        image.alt = example.alt;
        image.width = 640;
        image.height = 400;
        const caption = document.createElement("span");
        const strong = document.createElement("strong");
        strong.textContent = example.title;
        const note = document.createElement("small");
        note.textContent = example.note;
        caption.append(strong, note);
        link.append(image, caption);
        examples.append(link);
      });
      stage.append(examples);
    }

    const disclaimer = document.createElement("p");
    disclaimer.className = "tier-finder-disclaimer";
    disclaimer.textContent = result.disclaimer;

    const actions = document.createElement("div");
    actions.className = "tier-finder-actions";
    const see = document.createElement("a");
    see.className = "btn btn-outline";
    see.href = result.examplesHref;
    see.textContent = "See Websites Like Yours";
    const start = document.createElement("a");
    start.className = "btn btn-accent";
    start.href = result.consultHref;
    start.textContent = "Let's Get Started!";
    const compare = document.createElement("a");
    compare.className = "btn btn-outline";
    compare.href = "#pricing";
    compare.dataset.tierCompare = "true";
    compare.textContent = "Compare All Packages";
    const paymentNote = document.createElement("p");
    paymentNote.className = "tier-finder-payment-note";
    paymentNote.textContent = "Let's Get Started opens a question form with this package selected. It does not start a payment.";
    actions.append(see, start, compare);
    stage.append(disclaimer, actions, paymentNote);
    if (section) section.setAttribute("aria-labelledby", title.id);
    focusHeading();
  }

  function showResult() {
    renderResult(recommend(answers));
  }

  function choose(answer) {
    if (locked || phase !== "question") return;
    locked = true;
    answers[step] = answer;
    stage.querySelectorAll("[data-answer]").forEach((button) => {
      const on = button.dataset.answer === answer;
      button.classList.toggle("is-selected", on);
      button.setAttribute("aria-checked", on ? "true" : "false");
    });
    const wait = reduced ? 0 : 240;
    timer = window.setTimeout(() => {
      locked = false;
      if (step === QUESTIONS.length - 1) {
        renderFinding();
        timer = window.setTimeout(showResult, reduced ? 0 : FINDING_MS);
      } else {
        step += 1;
        renderQuestion();
      }
    }, wait);
  }

  function openQuiz() {
    clearTimer();
    locked = false;
    answers.fill(null);
    step = 0;
    intro.hidden = true;
    panel.hidden = false;
    renderQuestion();
  }

  function restart() {
    clearTimer();
    locked = false;
    answers.fill(null);
    step = 0;
    phase = "intro";
    panel.hidden = true;
    intro.hidden = false;
    if (section) section.setAttribute("aria-labelledby", "find-tier-heading");
    startButton.focus();
  }

  function back() {
    clearTimer();
    locked = false;
    if (phase === "finding" || phase === "result") {
      step = QUESTIONS.length - 1;
      renderQuestion();
      return;
    }
    if (step > 0) {
      step -= 1;
      renderQuestion();
    }
  }

  function scrollToTarget(href) {
    const id = href.startsWith("#") ? href.slice(1) : "";
    const target = id ? document.getElementById(id) : null;
    if (!target) return false;
    const top = target.getBoundingClientRect().top + window.scrollY - 94;
    window.scrollTo({ top: Math.max(0, top), behavior: reduced ? "auto" : "smooth" });
    return true;
  }

  startButton.addEventListener("click", openQuiz);
  backButton.addEventListener("click", back);
  restartButton.addEventListener("click", restart);

  stage.addEventListener("click", (event) => {
    const choice = event.target.closest("[data-answer]");
    if (choice) {
      choose(choice.dataset.answer);
      return;
    }
    const compare = event.target.closest("[data-tier-compare]");
    if (compare) {
      event.preventDefault();
      scrollToTarget(compare.getAttribute("href") || "#pricing");
    }
  });

  stage.addEventListener("keydown", (event) => {
    const options = [...stage.querySelectorAll("[data-answer]")];
    if (!options.length) return;
    const current = options.indexOf(document.activeElement);
    let next = current;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") next = current < 0 ? 0 : (current + 1) % options.length;
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft") next = current < 0 ? options.length - 1 : (current - 1 + options.length) % options.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = options.length - 1;
    else return;
    event.preventDefault();
    options.forEach((button, index) => {
      button.tabIndex = index === next ? 0 : -1;
    });
    options[next].focus();
  });
}
