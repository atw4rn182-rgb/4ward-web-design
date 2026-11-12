export const FINDING_MS = 1000;

export const QUESTIONS = [
  {
    id: "goal",
    prompt: "What's the main thing you want your website to do?",
    options: [
      { id: "a", signal: "flyer", label: "Show my business information, menu, hours, and phone number.", icon: "info" },
      { id: "b", signal: "contact", label: "Give customers service pages and a form that emails me.", icon: "mail" },
      { id: "c", signal: "manage", label: "Let me manage and update my website myself.", icon: "edit" },
      { id: "d", signal: "department", label: "Showcase multiple departments or service divisions.", icon: "departments" },
    ],
  },
  {
    id: "frequency",
    prompt: "How often will your website information change?",
    options: [
      { id: "a", signal: "flyer", label: "Not very often. I mainly need my information available online.", icon: "calendar" },
      { id: "b", signal: "contact", label: "Sometimes, and customers should be able to email me from the site.", icon: "mail" },
      { id: "c", signal: "manage", label: "Frequently. I want to make updates myself.", icon: "edit" },
      { id: "d", signal: "department", label: "Different departments will need their own information.", icon: "departments" },
    ],
  },
  {
    id: "action",
    prompt: "What should customers be able to do online?",
    options: [
      { id: "a", signal: "flyer", label: "View my information and call me.", icon: "phone" },
      { id: "b", signal: "contact", label: "Send an inquiry to my existing email address.", icon: "mail" },
      { id: "c", signal: "payments", label: "Pay or place an order online.", icon: "pay" },
      { id: "d", signal: "department", label: "Submit a detailed request to the right department.", icon: "departments" },
    ],
  },
  {
    id: "business",
    prompt: "Which best describes your business?",
    options: [
      { id: "a", signal: "flyer", label: "A simple, focused business, shop, or food trailer.", icon: "store" },
      { id: "b", signal: "contact", label: "A business that needs several pages and email inquiries.", icon: "mail" },
      { id: "c", signal: "manage", label: "A business that needs control over its own website content.", icon: "edit" },
      { id: "d", signal: "department", label: "A company with multiple departments or service divisions.", icon: "departments" },
    ],
  },
];

const PRESENCE =
  "All four tiers include a professional online presence. The difference is the functionality and complexity your business needs.";

const NO_PROMISE =
  "This recommendation does not promise traffic, rankings, sales, or calls.";

const PACKAGES = {
  tier4: {
    tierNumber: "4",
    name: "Online Flyer",
    price: "$44/month",
    priceDetail: "+$200 setup, once. Due today: $244 on the monthly plan. Or $1,256 upfront.",
    explanation:
      "Perfect for getting your business online with a professional presence that helps customers find you, explore your information, and get in touch.",
    benefits: [
      "A professional one-page presence with your name, branding, and description",
      "Menu or service list, hours, location, and click-to-call",
      "A standard domain for the first year, plus hosting and basic on-page SEO",
      "One small content update per month while the subscription is active",
    ],
    examplesHref: "#example-tier4",
    examples: [
      {
        title: "Desert Brew Coffee Trailer",
        href: "/examples/desert-sunrise-coffee",
        image: "examples/desert-sunrise-trailer.jpg",
        alt: "Desert Brew Coffee Trailer demonstration",
        note: "Fictional demonstration",
      },
      {
        title: "New Mexico Burrito Co.",
        href: "/examples/new-mexico-burrito",
        image: "examples/nm-burrito-blank-board-16x9.jpg",
        alt: "New Mexico Burrito Co. demonstration",
        note: "Fictional demonstration",
      },
    ],
  },
  tier1: {
    tierNumber: "1",
    name: "Small Business Website",
    price: "$99/month",
    priceDetail: "+$200 setup, once. Due today: $299 on the standard plan. Or $2,576 upfront.",
    explanation:
      "You need a professional multi-page website where customers can read about your services and send a message to the email inbox you already use.",
    benefits: [
      "A professional multi-page website with pages for your business and services",
      "Phone and contact information on a mobile-friendly site",
      "A contact form with name, email, and message that emails your existing inbox",
      "Basic search engine setup. This does not create a hosted mailbox",
    ],
    examplesHref: "#example-tier1",
    examples: [
      {
        title: "Accu-Fab NM",
        href: "https://accufabnm.com",
        image: "assets/after-accufab.jpg?v=home4",
        alt: "Accu-Fab NM website designed by 4Ward Web Design",
        note: "Real client website",
        external: true,
      },
      {
        title: "Black Mesa Welding",
        href: "https://www.blackmesawelding.com/",
        image: "assets/after-blackmesa.jpg",
        alt: "Black Mesa Welding website designed by 4Ward Web Design",
        note: "Real client website",
        external: true,
      },
    ],
  },
  tier2: {
    tierNumber: "2",
    name: "Business Management",
    price: "$225/month",
    priceDetail: "+$200 setup, once. Due today: $425, dashboard included. Or $5,600 upfront.",
    explanation:
      "You want more control over your website, with the flexibility to manage information and keep everything up to date.",
    paymentExplanation:
      "You also want customers to pay or place orders. Online ordering or payments can be configured for this package. Custom integrations, shipping, and inventory are quoted separately.",
    benefits: [
      "A professional multipage website",
      "A secure admin dashboard included in the $225 price",
      "Update supported products, prices, pictures, menus, and content yourself",
      "Hosting, maintenance, and four updates per month",
    ],
    paymentBenefits: [
      "Online ordering and payments when configured for your business",
      "A secure admin dashboard included, so you can update the supported storefront",
      "A professional multipage website",
      "Hosting, maintenance, and four updates per month",
    ],
    examplesHref: "#example-tier2",
    examples: [
      {
        title: "S&R Concrete Crafts",
        href: "https://www.sandrconcretecrafts.com/",
        image: "assets/work-sandr-home.jpg",
        alt: "Homepage of the S&R Concrete Crafts website",
        note: "Real client website",
        external: true,
      },
    ],
  },
  tier3: {
    tierNumber: "3",
    name: "Premium Multi-Department Website",
    price: "$399/month",
    priceDetail: "+$200 setup, once. Due today: $599. Or $9,776 upfront.",
    explanation:
      "Your business has multiple services or departments, and you need a professional website that brings everything together.",
    benefits: [
      "An advanced multipage website with department or division pages",
      "Quote-request forms that can be routed to the right team",
      "Expanded SEO and Google Business Profile setup",
      "Hosting, maintenance, and four updates per month",
    ],
    examplesHref: "/case-studies/4-elements",
    examples: [
      {
        title: "4 Elements Oilfield Services",
        href: "/case-studies/4-elements",
        image: "assets/work-4elements-home.jpg",
        alt: "Homepage of the 4 Elements Oilfield Services website",
        note: "Real client case study",
      },
    ],
    results: {
      kicker: "Real client results, not a promise for every business",
      title: "4 Elements Oilfield Services — first 60 days live",
      source: "Actual figures from Google Business Profile reports, September and October 2026.",
      stats: [
        { label: "Profile views", change: "+81%", detail: "508 views in October 2026" },
        { label: "Website clicks", change: "+750%", detail: "17 clicks in September 2026" },
        { label: "Direction requests", change: "+130%", detail: "115 requests in September 2026" },
        { label: "Calls", change: "+12.5%", detail: "99 calls in September 2026" },
      ],
    },
  },
};

function optionSignal(question, answerId) {
  const option = question.options.find((item) => item.id === answerId);
  return option ? option.signal : "";
}

function signalsFrom(answers) {
  const signals = answers.map((answer, index) => optionSignal(QUESTIONS[index], answer));
  return {
    department: signals.includes("department"),
    manage: signals.includes("manage"),
    contact: signals.includes("contact"),
    payments: signals.includes("payments"),
  };
}

function gapsFor(tier, signals) {
  const gaps = [];
  if (tier === "tier4") {
    gaps.push("An owner dashboard, online checkout, and Google Business Profile setup are not included.");
  }
  if (tier === "tier1" && signals.payments) {
    gaps.push("Optional online payment integration is available with setup assistance. It is not included in the $99 monthly subscription. This is not full e-commerce, inventory management, or online ordering.");
  }
  if (tier === "tier1") {
    gaps.push("The admin dashboard is an optional $50/month add-on. It is not included in the $99 price. The contact form does not create a hosted mailbox.");
  }
  if (tier === "tier2" && signals.payments) {
    gaps.push("Shipping, inventory, and other integrations beyond the supported storefront are quoted separately. Card processing fees belong to the payment provider.");
  }
  if (tier === "tier3") {
    gaps.push("An admin dashboard and online payments are not included in the $399 price unless they are arranged separately.");
  }
  if (tier === "tier3" && signals.manage) {
    gaps.push("Updating the site yourself uses the optional $50/month admin dashboard. That dashboard is not included at $399/month.");
  }
  return gaps;
}

function inquiryNote(answers, tier, signals) {
  const chosen = QUESTIONS.map((question, index) => {
    const option = question.options.find((item) => item.id === answers[index]);
    return `${question.prompt} ${option ? option.label : ""}`;
  }).join(" ");
  let payment = "";
  if (signals.payments && tier === "tier1") {
    payment = " Optional online payment integration requested. It is not included in the $99 monthly subscription.";
  } else if (signals.payments && tier === "tier2") {
    payment = " Online ordering or payments requested where configured. Custom integrations are quoted separately.";
  } else if (signals.payments && tier === "tier3") {
    payment = " Online payments requested. They are not included in the $399 price unless scoped separately.";
  }
  return `Tier Finder recommendation: ${tier}.${payment} ${chosen}`.slice(0, 900);
}

export function recommend(answers) {
  if (!Array.isArray(answers) || answers.length !== 4 || answers.some((answer) => !["a", "b", "c", "d"].includes(answer))) {
    throw new Error("Four answers from A to D are required.");
  }

  const signals = signalsFrom(answers);
  let tier = "tier4";
  if (signals.department) tier = "tier3";
  else if (signals.manage) tier = "tier2";
  else if (signals.contact || signals.payments) tier = "tier1";

  const pack = PACKAGES[tier];
  const managedAndPayments = tier === "tier2" && signals.payments;
  const explanation = managedAndPayments
    ? `${pack.explanation} ${pack.paymentExplanation}`
    : pack.explanation;
  const benefits = managedAndPayments ? pack.paymentBenefits : pack.benefits;
  const note = inquiryNote(answers, tier, signals);

  return {
    tier,
    signals,
    tierNumber: pack.tierNumber,
    name: pack.name,
    price: pack.price,
    priceDetail: pack.priceDetail,
    headline: `You're a Perfect Match for Tier ${pack.tierNumber}!`,
    explanation,
    benefits,
    gaps: gapsFor(tier, signals),
    presence: PRESENCE,
    disclaimer: NO_PROMISE,
    examples: pack.examples,
    examplesHref: pack.examplesHref,
    consultHref: `consultation.html?tier=${tier}&note=${encodeURIComponent(note)}`,
    results: pack.results || null,
  };
}
