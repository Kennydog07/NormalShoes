// Normal Shoes: static site build.
//
//   node build.js        -> writes the whole site to dist/
//
// Everything about a release lives in one file: releases/<slug>.json.
// Home, the shelf, the map, release pages, OG images, the sitemap and the
// checkout catalogue (netlify/lib/catalogue.generated.json) are all built
// from those files, so adding a release means adding one JSON file.
//
// Prose pages (About, Terms...) are HTML fragments in src/pages/. Their first
// line is a JSON comment with the page title and description.
//
// The only dependency is @resvg/resvg-js, used to render OG/press PNGs. If it
// isn't installed the build still works and skips the PNGs.

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = __dirname;
const SRC = path.join(ROOT, "src");
const OUT = path.join(ROOT, "dist");

const site = readJSON(path.join(SRC, "site.json"));
const BASE = (process.env.BASE_URL || (site.launched ? site.url : process.env.URL) || site.url).replace(/\/$/, "");

// One fixed label palette, in shelf (spectrum) order. Ink text passes WCAG AA
// on every colour.
const PALETTE = {
  mustard: "#e8b04a",
  terracotta: "#e2866a",
  rose: "#e3a3b3",
  lilac: "#b9a6dc",
  sky: "#8fb6d9",
  teal: "#7dbfb5",
  sage: "#a4c48c",
  lime: "#cfd46a",
  sand: "#d8b98c",
  coral: "#f09a7f",
  plum: "#c79ac7",
  steel: "#a9b8c6",
};

const STATUS = {
  "coming-soon": "Coming soon",
  preorder: "Pre-order",
  available: "Available",
  "sold-out": "Sold out",
};

// ---------------------------------------------------------------------------
// Helpers

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// For attributes, titles and meta: [TBC] markers are dropped.
function plain(s) {
  return String(s == null ? "" : s).replace(/\s*\[TBC\]\s*/g, " ").replace(/\s+/g, " ").trim();
}
function attr(s) {
  return esc(plain(s));
}

// In page text, [TBC] becomes a highlighted marker so placeholders are obvious.
function markTbc(html) {
  return html.replace(/\[TBC\]/g, '<mark class="tbc" title="To be confirmed">TBC</mark>');
}

function write(rel, content) {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function copyDir(from, to) {
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, entry.name);
    const b = path.join(to, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(b, { recursive: true });
      copyDir(a, b);
    } else {
      fs.copyFileSync(a, b);
    }
  }
}

function hash(content) {
  return crypto.createHash("sha1").update(content).digest("hex").slice(0, 8);
}

function pounds(pence) {
  return "£" + (pence / 100).toFixed(2);
}

function fmtCoords(c) {
  if (!c) return "—";
  const lat = `${Math.abs(c.lat).toFixed(2)}° ${c.lat >= 0 ? "N" : "S"}`;
  const lon = `${Math.abs(c.lon).toFixed(2)}° ${c.lon >= 0 ? "E" : "W"}`;
  return `${lat} ${lon}`;
}

function paras(list) {
  return (list || []).map((p) => `<p>${esc(p)}</p>`).join("\n");
}

// ---------------------------------------------------------------------------
// Releases

const releases = fs
  .readdirSync(path.join(ROOT, "releases"))
  .filter((f) => f.endsWith(".json"))
  .map((f) => readJSON(path.join(ROOT, "releases", f)))
  .sort((a, b) => a.spine.localeCompare(b.spine, "en", { numeric: true }));

for (const r of releases) {
  if (!STATUS[r.status]) throw new Error(`${r.spine}: unknown status "${r.status}"`);
  if (r.label_colour && !PALETTE[r.label_colour]) {
    throw new Error(`${r.spine}: label_colour must be one of ${Object.keys(PALETTE).join(", ")}`);
  }
  r.url = `/releases/${r.slug}/`;
  r.colour = PALETTE[r.label_colour] || PALETTE.steel;
  r.buyable = r.status === "preorder" || r.status === "available";
  r.price_pence = r.price == null ? null : Math.round(r.price * 100);
  r.city = r.teaser ? "??????" : r.made_in_city;
}

const current =
  [...releases].reverse().find((r) => r.buyable) ||
  [...releases].reverse().find((r) => !r.teaser) ||
  releases[0];
const nextUp = releases.find((r) => r.teaser || r.status === "coming-soon");

// ---------------------------------------------------------------------------
// Components

function label(r, { size = "", stamp = false } = {}) {
  const country = r.teaser ? "Next" : r.made_in_country;
  const name = r.teaser
    ? `Normal Shoes ${r.spine}: made in a place we're not announcing yet`
    : `Normal Shoes ${r.spine}: made in ${r.made_in_city}, ${r.made_in_country}`;
  const cls = ["label", size && `label--${size}`, stamp && "label--stamp", r.teaser && "label--unknown"]
    .filter(Boolean)
    .join(" ");
  return `<div class="${cls}" style="--label:${r.colour}" role="img" aria-label="${attr(name)}">
  <div class="label-top" aria-hidden="true"><span>Normal Shoes</span><span class="mono">${esc(r.spine)}</span></div>
  <p class="label-made" aria-hidden="true">Made in</p>
  <p class="label-city" aria-hidden="true">${esc(r.city)}</p>
  <p class="label-coords mono" aria-hidden="true">${esc(fmtCoords(r.coordinates))}</p>
  <p class="label-country" aria-hidden="true">${esc(country)}</p>
</div>`;
}

function cover(r, { eager = false } = {}) {
  if (r.images && r.images.cover) {
    return `<figure class="cover cover--art"><img src="${attr(r.images.cover)}" alt="${attr(r.images.cover_alt || r.title)}" width="800" height="1000" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></figure>`;
  }
  // House template placeholder until real art arrives.
  return `<figure class="cover" style="--label:${r.colour}" aria-label="${attr(r.teaser ? `${r.spine}: cover not revealed yet` : `${r.spine} ${r.title}: cover art to come`)}">
  <div class="cover-band"><span>Normal Shoes</span><span class="mono">${esc(r.spine)}</span></div>
  <div class="cover-art" aria-hidden="true"><span class="cover-disc"></span></div>
  <p class="cover-title">${esc(r.teaser ? "??????" : r.short_title || r.title)}</p>
  <p class="cover-note mono">${r.teaser ? "Cover under wraps" : "Cover art [TBC]"}</p>
  <div class="cover-label">${label(r, { size: "xs" })}</div>
</figure>`;
}

function badge(r) {
  return `<span class="status status--${r.status}">${STATUS[r.status]}</span>`;
}

function stockLine(r) {
  if (!r.buyable || !r.edition_limit) return "";
  return `<p class="stock"><span class="stock-bar" aria-hidden="true"><span style="width:${Math.round((r.stock_remaining / r.edition_limit) * 100)}%" data-stock-bar="${r.slug}"></span></span><span><strong data-stock="${r.slug}">${r.stock_remaining}</strong> of ${r.edition_limit} left</span></p>`;
}

function buyBox(r, idSuffix) {
  if (r.status === "sold-out") {
    return `<div class="buy"><p class="buy-price">${pounds(r.price_pence)}</p><button class="btn btn-buy" type="button" disabled>Sold out</button><p class="buy-note">All ${r.edition_limit} have gone to good homes. ${r.stockists.length ? "Try our stockists." : ""}</p></div>`;
  }
  if (!r.buyable) return "";
  const pre = r.status === "preorder";
  const ship = r.ship_date || "[TBC]";
  const cta = pre ? `Pre-order · ships ${ship}` : "Buy now";
  const link = /^https:\/\//.test(r.stripe_link_or_price_id || "") ? r.stripe_link_or_price_id : null;
  const priceTbc = r.price_tbc ? " [TBC]" : "";
  const uk = site.shipping.uk;
  const intl = site.shipping.international;
  const id = `${r.slug}-${idSuffix}`;
  const qty = Array.from({ length: site.max_per_order }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join("");
  const note = pre
    ? `Pre-order: ships ${ship}. You pay today, and you can cancel for a full refund any time before it ships. <a href="/terms/#pre-orders">Pre-order terms</a>.`
    : `In stock. Usually posted within [TBC] working days.`;

  if (link) {
    return `<div class="buy" id="buy"><p class="buy-price">${pounds(r.price_pence)}${priceTbc} <span class="buy-plus">+ delivery</span></p>
<p class="buy-note">${note}</p>
<a class="btn btn-buy" href="${attr(link)}">${esc(cta)}</a>
${stockLine(r)}</div>`;
  }

  return `<form class="buy" id="buy-${id}" data-buy="${r.slug}" action="${r.url}#buy" method="get" novalidate>
  <p class="buy-price">${pounds(r.price_pence)}${priceTbc} <span class="buy-plus">+ delivery</span></p>
  <fieldset class="buy-region">
    <legend>Deliver to</legend>
    <label><input type="radio" name="region" value="uk" checked> UK <span class="mono">${pounds(uk.amount_pence)}</span></label>
    <label><input type="radio" name="region" value="international"> Rest of the world <span class="mono">${pounds(intl.amount_pence)}${intl.tbc ? " [TBC]" : ""}</span></label>
  </fieldset>
  <div class="buy-row">
    <label class="buy-qty" for="qty-${id}">Copies</label>
    <select id="qty-${id}" name="quantity">${qty}</select>
    <span class="buy-size">Size: one disc.</span>
  </div>
  <p class="buy-note" id="note-${id}">${note}</p>
  <button class="btn btn-buy" type="submit" aria-describedby="note-${id}">${esc(cta)}</button>
  ${stockLine(r)}
  <p class="buy-error" role="alert" hidden></p>
</form>`;
}

function signup({ id, source, heading = "", intro = "", button = "Sign me up", compact = false }) {
  return `<form class="signup${compact ? " signup--compact" : ""}" id="${id}" name="mailing-list" method="POST" data-netlify="true" netlify-honeypot="bot-field">
  ${heading ? `<h2 class="signup-title">${heading}</h2>` : ""}
  ${intro ? `<p class="signup-intro">${intro}</p>` : ""}
  <input type="hidden" name="form-name" value="mailing-list">
  <input type="hidden" name="source" value="${attr(source)}">
  <p class="hp"><label>Leave this empty <input name="bot-field" tabindex="-1" autocomplete="off"></label></p>
  <div class="signup-row">
    <label class="visually-hidden" for="${id}-email">Email address</label>
    <input id="${id}-email" type="email" name="email" required autocomplete="email" placeholder="you@example.com">
    <button class="btn btn-primary" type="submit">${button}</button>
  </div>
  <p class="fine">Roughly one email per release. We never sell or share your address. Unsubscribe any time by replying. <a href="/privacy/">Privacy</a>.</p>
  <p class="form-success" id="${id}-success" role="status">You're on the list. Next email: when there's a new spine to talk about.</p>
</form>`;
}

function spine(r, { selected = false } = {}) {
  const words = r.teaser ? "Made in ??????" : `Made in ${r.made_in_city}`;
  return `<a class="spine${selected ? " is-out" : ""}" href="${r.url}" data-spine="${r.slug}" style="--label:${r.colour}"${selected ? ' aria-current="true"' : ""}>
  <span class="spine-no mono">${esc(r.spine)}</span>
  <span class="spine-made">${esc(words)}</span>
  <span class="spine-title">${esc(r.teaser ? "Coming soon" : r.short_title || r.title)}</span>
  <span class="visually-hidden">: ${STATUS[r.status]}</span>
</a>`;
}

function shelf({ withPanels = true } = {}) {
  const lastNo = parseInt(releases[releases.length - 1].spine.replace(/\D/g, ""), 10) || releases.length;
  const ghosts = [1, 2, 3]
    .map((i) => `<span class="spine spine--ghost" aria-hidden="true"><span class="spine-no mono">NS-${String(lastNo + i).padStart(3, "0")}</span></span>`)
    .join("");
  const panels = withPanels
    ? releases
        .map(
          (r) => `<div class="shelf-panel" data-panel="${r.slug}"${r === current ? "" : " hidden"}>
  <div class="shelf-panel-cover">${cover(r)}</div>
  <div class="shelf-panel-info">
    ${label(r, { size: "sm" })}
    <p class="shelf-panel-meta mono">${esc(r.spine)} ${badge(r)}</p>
    <h3>${esc(r.teaser ? "Something from somewhere" : r.title)}</h3>
    <p>${esc(r.tagline || "")}</p>
    <a class="btn ${r.buyable ? "btn-primary" : "btn-secondary"}" href="${r.url}">${r.buyable ? (r.status === "preorder" ? "Pre-order" : "Buy") : "Take a look"}</a>
  </div>
</div>`
        )
        .join("\n")
    : "";
  return `<div class="shelf" data-shelf>
  <div class="shelf-row" role="list" aria-label="Releases by spine number">
    ${releases.map((r) => `<div role="listitem">${spine(r, { selected: r === current })}</div>`).join("\n    ")}
    ${ghosts}
  </div>
  <p class="shelf-plank" aria-hidden="true"><span>Fits most shelves.</span></p>
  ${withPanels ? `<div class="shelf-panels" aria-live="polite">${panels}</div>` : ""}
</div>`;
}

// ---------------------------------------------------------------------------
// Layout

const NAV = [
  ["/releases/", "The Shelf"],
  ["/map/", "The Map"],
  ["/where-next/", "Where next?"],
  ["/shoe-club/", "Shoe Club"],
  ["/about/", "About"],
];

let assets = {};

function layout({ title, description, pathName, body, ogImage, jsonld, pageClass = "", fullTitle = false }) {
  const pageTitle = fullTitle ? title : `${title} · Normal Shoes films`;
  const canonical = BASE + pathName;
  const og = BASE + (ogImage || "/og/default.png");
  const nav = NAV.map(
    ([href, text]) => `<li><a href="${href}"${pathName.startsWith(href) ? ' aria-current="page"' : ""}>${text}</a></li>`
  ).join("");
  const ld = (jsonld || []).map((o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`).join("\n");
  const footerSignup = signup({
    id: "signup-footer",
    source: `footer${pathName}`,
    heading: "Get the next spine first",
    intro: "Release news, pre-order dates, the odd story from the tapes.",
  });

  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${attr(pageTitle)}</title>
<meta name="description" content="${attr(description)}">
${site.launched ? "" : '<meta name="robots" content="noindex, nofollow">\n'}<link rel="canonical" href="${canonical}">
<meta property="og:site_name" content="Normal Shoes films">
<meta property="og:title" content="${attr(pageTitle)}">
<meta property="og:description" content="${attr(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${og}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#efe6d6">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preload" href="/fonts/archivo-black-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<script>
  (function () {
    try {
      var t = localStorage.getItem("normal-shoes-theme");
      if (t === "dark" || t === "light") document.documentElement.setAttribute("data-theme", t);
    } catch (e) {}
  })();
</script>
<link rel="stylesheet" href="${assets.css}">
${ld}
</head>
<body class="${pageClass}">
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <div class="wrap header-inner">
    <a class="logo" href="/" aria-label="Normal Shoes, home">
      <picture><source type="image/webp" srcset="/img/normal-shoes-logo-240.webp"><img src="/img/normal-shoes-logo.png" alt="" width="480" height="296"></picture>
    </a>
    <nav class="main-nav" id="main-nav" aria-label="Main">
      <ul>${nav}</ul>
    </nav>
    ${current && current.buyable ? `<a class="btn btn-primary header-cta" href="${current.url}#buy">${current.status === "preorder" ? "Pre-order" : "Buy"} <span class="mono">${esc(current.spine)}</span></a>` : ""}
    <button class="theme-toggle" type="button" aria-label="Switch to dark theme" aria-pressed="false">
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="9" width="16" height="11" rx="1"/><path d="M3 9h18l-2-4H5z"/></svg>
    </button>
    <button class="nav-toggle" type="button" aria-controls="main-nav" aria-expanded="false"><span class="visually-hidden">Menu</span><span aria-hidden="true">Menu</span></button>
  </div>
</header>
<main id="main">
${markTbc(body)}
</main>
<footer class="site-footer">
  <div class="wrap footer-grid">
    <div class="footer-signup">${footerSignup}</div>
    <nav class="footer-links" aria-label="Footer">
      <ul>
        <li><a href="/releases/">The Shelf</a></li>
        <li><a href="/map/">The Map</a></li>
        <li><a href="/where-next/">Where next?</a></li>
        <li><a href="/shoe-club/">Shoe Club</a></li>
        <li><a href="/stockists/">Stockists</a></li>
        <li><a href="/about/">About</a></li>
        <li><a href="/press/">Press</a></li>
        <li><a href="/contact/">Contact</a></li>
        <li><a href="/privacy/">Privacy</a></li>
        <li><a href="/terms/">Terms</a></li>
        <li><a href="${attr(site.instagram)}" rel="noopener">Instagram</a></li>
      </ul>
    </nav>
  </div>
  <div class="wrap footer-base">
    <p>Normal Shoes films · a Blu-ray label from Shoreham-by-Sea, near Brighton · <a href="mailto:${site.email}">${site.email}</a></p>
    <p class="fine">Normal Shoes · ${esc(site.address)} · © ${new Date().getFullYear()} Normal Shoes. We sell films, not footwear. Sensible shoes not included.</p>
  </div>
</footer>
<script src="${assets.js}" defer></script>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Pages

function checkoutDialog() {
  return `<dialog class="checkout" id="checkout" aria-labelledby="checkout-title">
  <div class="checkout-head">
    <p id="checkout-title" class="mono">Secure checkout · Stripe</p>
    <button class="btn btn-secondary checkout-close" type="button">Close</button>
  </div>
  <div class="checkout-mount" id="checkout-mount"></div>
</dialog>`;
}

function homePage() {
  const r = current;
  const body = `
<section class="hero">
  <div class="wrap hero-grid">
    <div class="hero-copy">
      <p class="eyebrow mono">Normal Shoes films · a Blu-ray label from Brighton</p>
      <h1>Films nobody else would release.</h1>
      <p class="lede">DIY films, lost films, and films that have never been released in the UK, on Blu-ray, with care. Every release carries a label saying where it was made. One shelf, a whole map of unseen cinema.</p>
      <div class="hero-stamp">${label(r, { size: "md", stamp: true })}</div>
    </div>
    <div class="hero-release">
      <div class="hero-cover"><a href="${r.url}" tabindex="-1" aria-hidden="true">${cover(r, { eager: true })}</a></div>
      <div class="hero-head">
        <p class="release-kicker mono">${esc(r.spine)} ${badge(r)}</p>
        <h2 class="hero-title"><a href="${r.url}">${esc(r.title)}</a></h2>
        <p class="release-sub">Limited edition Blu-ray · ${r.edition_limit || ""} copies · slipcover and booklet</p>
      </div>
      <div class="hero-buy">${buyBox(r, "home")}</div>
    </div>
  </div>
</section>

<section class="band band--shelf">
  <div class="wrap">
    <div class="section-head"><h2>The Shelf</h2><a class="more" href="/releases/">See every spine →</a></div>
    ${shelf({ withPanels: false })}
  </div>
</section>

${
  nextUp
    ? `<section class="band band--teaser">
  <div class="wrap teaser-grid">
    ${label(nextUp, { size: "lg" })}
    <div>
      <p class="eyebrow mono">${esc(nextUp.spine)} · ${STATUS[nextUp.status]}</p>
      <h2>Made in ??????</h2>
      <p class="lede">${esc(nextUp.tagline)} It's a long way from Brighton, and it has never been released here.</p>
      ${signup({ id: "signup-home", source: "home-next", button: "Tell me where", compact: true })}
    </div>
  </div>
</section>`
    : ""
}

<section class="band">
  <div class="wrap made-in-grid">
    <div>
      <h2>Every film is made somewhere</h2>
      <p>Shoes have a label inside that says where they were made. Our films do too. Each release gets its own shoebox label with the city, its coordinates and a colour, and the catalogue slowly turns into a map.</p>
      <p><a class="btn btn-secondary" href="/map/">See the map</a></p>
    </div>
    <div>
      <h2>Know a film nobody would release?</h2>
      <p>Tell us. A shot-on-video epic from your town, a film that never made it to the UK, something that only exists on a tape in a loft. Filmmakers, that includes yours.</p>
      <p><a class="btn btn-secondary" href="/where-next/">Suggest a film</a></p>
    </div>
  </div>
</section>
${checkoutDialog()}
`;
  return layout({
    title: "Normal Shoes films · Blu-ray label · Films nobody else would release",
    fullTitle: true,
    description: `Normal Shoes is a boutique Blu-ray label from Brighton releasing films nobody else would. Now on pre-order: ${plain(r.spine)} ${plain(r.title)}, limited edition Blu-ray.`,
    pathName: "/",
    body,
    pageClass: "page-home",
    jsonld: [
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "Normal Shoes",
        alternateName: "Normal Shoes films",
        description: "A boutique Blu-ray label from Brighton releasing films nobody else would.",
        url: site.url,
        logo: `${site.url}/img/normal-shoes-logo.png`,
        email: site.email,
        sameAs: [site.instagram],
      },
    ],
  });
}

function shelfPage() {
  const cards = releases
    .map(
      (r) => `<li class="release-card" style="--label:${r.colour}">
  <a href="${r.url}">${label(r, { size: "sm" })}<span class="release-card-title">${esc(r.teaser ? `${r.spine}: coming soon` : `${r.spine} ${r.title}`)}</span></a>
  ${badge(r)}
</li>`
    )
    .join("\n");
  const body = `
<section class="page-head">
  <div class="wrap">
    <p class="eyebrow mono">The catalogue</p>
    <h1>The Shelf</h1>
    <p class="lede">Every release, in spine order. Hover or tap a spine to pull it out.</p>
  </div>
</section>
<section class="band band--tight">
  <div class="wrap">${shelf({ withPanels: true })}</div>
</section>
<section class="band">
  <div class="wrap">
    <h2>All releases</h2>
    <ul class="release-list">${cards}</ul>
  </div>
</section>`;
  return layout({
    title: "The Shelf: every release",
    description: "Every Normal Shoes Blu-ray release in spine order, from NS-001 onwards, with what's on pre-order, available or coming soon.",
    pathName: "/releases/",
    body,
  });
}

function dl(obj) {
  return `<dl class="specs">${Object.entries(obj)
    .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`)
    .join("")}</dl>`;
}

function releasePage(r) {
  const idx = releases.indexOf(r);
  const prev = releases[idx - 1];
  const next = releases[idx + 1];
  const stockistList = site.stockists.filter((s) => (r.stockists || []).includes(s.name));

  if (r.teaser) {
    const body = `
<section class="page-head">
  <div class="wrap teaser-grid">
    ${label(r, { size: "lg" })}
    <div>
      <p class="eyebrow mono"><a href="/releases/">The Shelf</a> / ${esc(r.spine)}</p>
      <h1>${esc(r.spine)}: Made in ??????</h1>
      <p class="lede">${esc(r.tagline)}</p>
      ${paras(r.synopsis)}
      ${signup({ id: "signup-teaser", source: `teaser-${r.slug}`, button: "Tell me where", compact: true })}
    </div>
  </div>
</section>
${pager(prev, next)}`;
    return layout({
      title: `${r.spine}: coming soon`,
      description: `The next Normal Shoes Blu-ray, ${r.spine}. Made somewhere we're not announcing yet. Join the list to hear first.`,
      pathName: r.url,
      body,
      ogImage: `/og/${r.slug}.png`,
    });
  }

  const specs = Object.assign(
    { Runtime: r.runtime, "BBFC rating": r.bbfc_rating, Region: r.region },
    r.specs
  );
  const body = `
<article class="release" style="--label:${r.colour}">
  <section class="release-top">
    <div class="wrap release-grid">
      <div class="release-media">
        ${cover(r, { eager: true })}
      </div>
      <div class="release-info">
        <p class="eyebrow mono"><a href="/releases/">The Shelf</a> / ${esc(r.spine)}</p>
        <h1>${esc(r.title)}</h1>
        <p class="release-kicker mono">${esc(r.spine)} · ${esc(r.year || "")} · Made in ${esc(r.made_in_city)} ${badge(r)}</p>
        <p class="lede">${esc(r.tagline || "")}</p>
        <div id="buy" class="release-buy">${buyBox(r, "page")}</div>
        <ul class="edition-summary">${r.edition.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>
        <p class="fine">Fits most shelves.</p>
      </div>
    </div>
  </section>

  <section class="band">
    <div class="wrap prose-grid">
      <div class="prose">
        <h2>The film</h2>
        ${paras(r.synopsis)}
        ${r.story && r.story.length ? `<h2>How it got made</h2>${paras(r.story)}` : ""}
      </div>
      <aside class="made-in-note">
        ${label(r, { size: "sm" })}
        <h2>Made in ${esc(r.made_in_city)}</h2>
        ${paras(r.made_in_note)}
        <p><a href="/map/">See it on the map →</a></p>
      </aside>
    </div>
  </section>

  <section class="band band--specs">
    <div class="wrap specs-grid">
      <div>
        <h2>Specs</h2>
        ${dl(specs)}
      </div>
      <div>
        <h2>Extras</h2>
        <ul class="ticks">${r.extras.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>
        <h2>The edition</h2>
        <ul class="ticks">${r.edition.items.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>
      </div>
      <div>
        <h2>Credits</h2>
        ${dl(r.credits)}
        <h2>In shops</h2>
        ${
          stockistList.length
            ? `<ul class="plain">${stockistList.map((s) => `<li><strong>${esc(s.name)}</strong>, ${esc(s.city)}</li>`).join("")}</ul><p><a href="/stockists/">All stockists →</a></p>`
            : `<p>Online only for now.</p>`
        }
      </div>
    </div>
  </section>
  ${pager(prev, next)}
</article>
${checkoutDialog()}`;

  const offers = r.price_pence
    ? {
        "@type": "Offer",
        price: (r.price_pence / 100).toFixed(2),
        priceCurrency: "GBP",
        availability:
          r.status === "preorder"
            ? "https://schema.org/PreOrder"
            : r.status === "available"
            ? "https://schema.org/InStock"
            : r.status === "sold-out"
            ? "https://schema.org/SoldOut"
            : "https://schema.org/PreSale",
        url: site.url + r.url,
        seller: { "@type": "Organization", name: "Normal Shoes" },
      }
    : undefined;

  return layout({
    title: `${r.spine} ${r.title} · Limited Blu-ray`,
    description: `${plain(r.title)} (${r.year}) on limited edition Blu-ray from Normal Shoes films, the Blu-ray label. Made in ${r.made_in_city}. ${r.edition_limit} copies, slipcover and booklet. ${STATUS[r.status]} now.`,
    pathName: r.url,
    body,
    ogImage: `/og/${r.slug}.png`,
    jsonld: [
      {
        "@context": "https://schema.org",
        "@type": "Product",
        name: `${plain(r.title)} (${r.spine}) Limited Edition Blu-ray`,
        sku: r.spine,
        category: "Movies & TV > Blu-ray",
        brand: { "@type": "Brand", name: "Normal Shoes" },
        image: `${BASE}/og/${r.slug}.png`,
        description: plain([...(r.synopsis || []), ...(r.story || [])].join(" ")),
        countryOfOrigin: r.made_in_country,
        offers,
      },
    ],
  });
}

function pager(prev, next) {
  if (!prev && !next) return "";
  return `<nav class="pager wrap" aria-label="Neighbouring releases">
  ${prev ? `<a href="${prev.url}">← ${esc(prev.spine)} ${esc(prev.teaser ? "" : prev.short_title)}</a>` : "<span></span>"}
  ${next ? `<a href="${next.url}">${esc(next.spine)} ${esc(next.teaser ? "Made in ??????" : next.short_title)} →</a>` : "<span></span>"}
</nav>`;
}

function mapPage() {
  const map = readJSON(path.join(SRC, "data", "world-dots.json"));
  const project = ({ lat, lon }) => ({
    x: ((lon + 180) / 360) * map.width,
    y: ((map.latTop - lat) / 360) * map.width,
  });
  const pins = releases
    .map((r) => {
      const at = r.coordinates || r.map_teaser;
      if (!at) return "";
      const { x, y } = project(at);
      const w = 128;
      const h = 54;
      const flip = x + 18 + w > map.width; // keep the label on the map
      const bx = flip ? x - 18 - w : x + 18;
      const by = Math.max(4, Math.min(map.height - h - 4, y - h / 2));
      const name = r.teaser ? `${r.spine}: location unknown` : `${r.spine}: Made in ${r.made_in_city}`;
      return `<a class="pin${r.teaser ? " pin--unknown" : ""}" href="${r.url}" aria-label="${attr(name)}" data-pin="${r.slug}" style="--label:${r.colour}">
  <line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(flip ? bx + w : bx).toFixed(1)}" y2="${(by + h / 2).toFixed(1)}" class="pin-line"/>
  <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" class="pin-dot"/>
  <g transform="translate(${bx.toFixed(1)} ${by.toFixed(1)})">
    <rect width="${w}" height="${h}" class="pin-box"/>
    <text x="8" y="15" class="pin-top">NORMAL SHOES ${esc(r.spine)}</text>
    <line x1="6" y1="20" x2="${w - 6}" y2="20" class="pin-rule"/>
    <text x="${w / 2}" y="31" text-anchor="middle" class="pin-made">MADE IN</text>
    <text x="${w / 2}" y="48" text-anchor="middle" class="pin-city">${esc(r.city.toUpperCase())}</text>
  </g>
</a>`;
    })
    .join("\n");

  const list = releases
    .map(
      (r) => `<li><a href="${r.url}"><span class="swatch" style="--label:${r.colour}"></span><span class="mono">${esc(r.spine)}</span> ${
        r.teaser ? "Made in ??????, somewhere new" : `Made in ${esc(r.made_in_city)}, ${esc(r.made_in_country)} · <span class="mono">${esc(fmtCoords(r.coordinates))}</span>`
      }</a> ${badge(r)}</li>`
    )
    .join("");

  const body = `
<section class="page-head">
  <div class="wrap">
    <p class="eyebrow mono">Made In</p>
    <h1>The Map</h1>
    <p class="lede">Every release is pinned to the place it was made. One pin so far, and a question mark heading somewhere.</p>
  </div>
</section>
<section class="band band--tight">
  <div class="wrap">
    <div class="map-scroll" data-map>
      <svg class="world" viewBox="0 0 ${map.width} ${map.height}" role="group" aria-label="World map of Normal Shoes releases">
        <path d="${map.path}" class="world-dots" stroke-width="${map.dot}" aria-hidden="true"/>
        ${pins}
      </svg>
    </div>
    <h2 class="visually-hidden">Releases by place</h2>
    <ul class="map-list">${list}</ul>
  </div>
</section>`;
  return layout({
    title: "The Map: where our films were made",
    description: "A map of unseen cinema: every Normal Shoes Blu-ray release pinned to the city it was made in, starting with NS-001, Made in Brighton.",
    pathName: "/map/",
    body,
  });
}

function stockistsPage() {
  const items = site.stockists
    .map((s) => {
      const has = releases.filter((r) => (r.stockists || []).includes(s.name));
      return `<li class="stockist">
  <h2>${esc(s.name)}</h2>
  <p class="mono">${esc(s.city)} · ${esc(s.address)}</p>
  <p>${esc(s.note)}</p>
  ${has.length ? `<p>Stocks: ${has.map((r) => `<a href="${r.url}">${esc(r.spine)}</a>`).join(", ")}</p>` : ""}
  ${s.url ? `<p><a href="${attr(s.url)}" rel="noopener">Visit ${esc(s.name)} →</a></p>` : ""}
</li>`;
    })
    .join("");
  const body = `
<section class="page-head">
  <div class="wrap">
    <p class="eyebrow mono">Buy it in a real shop</p>
    <h1>Stockists</h1>
    <p class="lede">You can buy direct from us, or pick a copy up over the counter here.</p>
  </div>
</section>
<section class="band band--tight">
  <div class="wrap">
    <ul class="stockists">${items}</ul>
    <p>Run a shop and want our films on your shelves? <a href="/contact/">Get in touch</a>.</p>
  </div>
</section>`;
  return layout({
    title: "Stockists",
    description: "Where to buy Normal Shoes Blu-rays in shops, starting with Timeslip in Brighton.",
    pathName: "/stockists/",
    body,
  });
}

function pressPage(pngs) {
  const rel = releases.filter((r) => !r.teaser);
  const downloads = [
    `<li><a href="/img/normal-shoes-logo.png" download>Normal Shoes logo</a> <span class="mono">PNG</span></li>`,
    ...rel.map((r) =>
      [
        pngs ? `<li><a href="/press/${r.slug}-label.png" download>${esc(r.spine)} Made In label</a> <span class="mono">PNG</span></li>` : "",
        r.images && r.images.cover
          ? `<li><a href="${attr(r.images.cover)}" download>${esc(r.spine)} cover</a></li>`
          : `<li>${esc(r.spine)} cover art <mark class="tbc">TBC</mark></li>`,
        pngs ? `<li><a href="/og/${r.slug}.png" download>${esc(r.spine)} share image</a> <span class="mono">PNG 1200×630</span></li>` : "",
      ].join("")
    ),
  ].join("");
  const body = `
<section class="page-head">
  <div class="wrap">
    <p class="eyebrow mono">For writers, shops and programmers</p>
    <h1>Press</h1>
  </div>
</section>
<section class="band band--tight">
  <div class="wrap prose-grid">
    <div class="prose">
      <h2>In one paragraph</h2>
      <p class="pull">Normal Shoes is a boutique Blu-ray label from Shoreham-by-Sea, near Brighton, releasing films nobody else would: DIY and outsider films, films never released in the UK, and lost or forgotten films. Every release is numbered by spine (NS-001, NS-002…) and carries a shoebox-style “Made In” label naming the city it was made in, so the catalogue builds into a map of unseen cinema. The first release, NS-001, is <em>Brighton Wok: The Legend of Ganja Boxing</em>, Made in Brighton: a limited edition Blu-ray of ${current.edition_limit} copies with slipcover and booklet.</p>
      <h2>Contact</h2>
      <p>Interviews, review copies and screenings: <a href="mailto:${site.email}?subject=Press">${site.email}</a>. A real person answers.</p>
    </div>
    <aside>
      <h2>Downloads</h2>
      <ul class="plain downloads">${downloads}</ul>
      <p class="fine">Free to use for coverage of Normal Shoes releases. Please credit cover artists where named.</p>
    </aside>
  </div>
</section>`;
  return layout({
    title: "Press",
    description: "Press information for Normal Shoes films, the Brighton Blu-ray label: summary, logo, Made In labels and covers to download, and contact details.",
    pathName: "/press/",
    body,
  });
}

function thankYouPage() {
  const body = `
<section class="page-head">
  <div class="wrap teaser-grid">
    ${label(current, { size: "lg", stamp: true })}
    <div>
      <p class="eyebrow mono">Order received</p>
      <h1>Thank you. That's one less empty shelf.</h1>
      <p class="lede">Stripe will email your receipt in a moment. We'll email you again when your disc is on its way.</p>
      <p data-thanks>Your order: <strong>${esc(current.spine)} ${esc(current.title)}</strong>. ${current.status === "preorder" ? `Pre-order: ships ${esc(current.ship_date || "[TBC]")}.` : ""}</p>
      <p>Changed your mind? You can cancel a pre-order for a full refund any time before it ships. Just email <a href="mailto:${site.email}">${site.email}</a>.</p>
      <p><a class="btn btn-secondary" href="/releases/">Back to the shelf</a></p>
    </div>
  </div>
</section>`;
  return layout({ title: "Thank you", description: "Thanks for your order.", pathName: "/thank-you/", body });
}

// Prose fragments in src/pages/*.html
function fragmentPage(file) {
  const raw = fs.readFileSync(path.join(SRC, "pages", file), "utf8");
  const m = raw.match(/^<!--\s*(\{[\s\S]*?\})\s*-->\s*/);
  if (!m) throw new Error(`${file}: missing meta comment`);
  const meta = JSON.parse(m[1]);
  let body = raw.slice(m[0].length);
  body = body
    .replace(/\{\{email\}\}/g, site.email)
    .replace(/\{\{address\}\}/g, esc(site.address))
    .replace(/\{\{instagram\}\}/g, site.instagram)
    .replace(/\{\{current\.url\}\}/g, current.url)
    .replace(/\{\{current\.spine\}\}/g, esc(current.spine))
    .replace(/\{\{current\.title\}\}/g, esc(current.title))
    .replace(/\{\{uk_delivery\}\}/g, pounds(site.shipping.uk.amount_pence))
    .replace(/\{\{intl_delivery\}\}/g, pounds(site.shipping.international.amount_pence) + (site.shipping.international.tbc ? " [TBC]" : ""))
    .replace(/\{\{max_per_order\}\}/g, String(site.max_per_order))
    .replace(/\{\{label:([a-z0-9-]+)(?::([a-z]+))?\}\}/g, (_, slug, size) => {
      const r = releases.find((x) => x.slug === slug);
      if (!r) throw new Error(`${file}: no release ${slug}`);
      return label(r, { size: size || "" });
    })
    .replace(/\{\{signup:([a-z0-9-]+)\}\}/g, (_, source) =>
      signup({ id: `signup-${source}`, source, compact: true })
    )
    .replace(/\{\{perks\}\}/g, `<ul class="ticks">${site.shoe_club.perks.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>`);
  const unknown = body.match(/\{\{[^}]+\}\}/);
  if (unknown) throw new Error(`${file}: unknown token ${unknown[0]}`);
  return { meta, body };
}

// ---------------------------------------------------------------------------
// SVG for OG images, press labels and favicons (rendered to PNG by resvg)

const INK = "#1b1712";
const CARD = "#efe6d6";

function svgEsc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// A 500 × 320 label, drawn at (x, y).
function labelSvg(r, x, y, rotate = 0) {
  const city = r.city.toUpperCase();
  const size = Math.min(84, 440 / (city.length * 0.8));
  return `<g transform="translate(${x} ${y}) rotate(${rotate} 250 160)">
  <rect x="3" y="3" width="494" height="314" fill="${r.teaser ? CARD : r.colour}" stroke="${INK}" stroke-width="6" ${r.teaser ? 'stroke-dasharray="18 10"' : ""}/>
  <text x="26" y="54" font-family="Archivo Black" font-size="26" fill="${INK}">NORMAL SHOES</text>
  <text x="474" y="54" font-family="IBM Plex Mono" font-size="25" fill="${INK}" text-anchor="end">${svgEsc(r.spine)}</text>
  <rect x="24" y="70" width="452" height="4" fill="${INK}"/>
  <text x="250" y="118" font-family="Archivo Black" font-size="22" letter-spacing="5" fill="${INK}" text-anchor="middle">MADE IN</text>
  <text x="250" y="${168 + size * 0.36}" font-family="Archivo Black" font-size="${size.toFixed(1)}" fill="${INK}" text-anchor="middle">${svgEsc(city)}</text>
  <rect x="24" y="232" width="452" height="3" fill="${INK}"/>
  <text x="250" y="266" font-family="IBM Plex Mono" font-size="24" fill="${INK}" text-anchor="middle">${svgEsc(fmtCoords(r.coordinates))}</text>
  <text x="250" y="300" font-family="Archivo Black" font-size="22" letter-spacing="4" fill="${INK}" text-anchor="middle">${svgEsc((r.teaser ? "NEXT" : r.made_in_country).toUpperCase())}</text>
</g>`;
}

function wrapWords(text, max) {
  const lines = [];
  let line = "";
  for (const w of text.split(/\s+/)) {
    if ((line + " " + w).trim().length > max && line) {
      lines.push(line);
      line = w;
    } else {
      line = (line + " " + w).trim();
    }
  }
  if (line) lines.push(line);
  return lines;
}

function ogSvg(r, { headline, sub }) {
  const lines = wrapWords(headline, 15).slice(0, 4);
  const size = lines.length > 3 ? 44 : 50;
  const title = lines
    .map((l, i) => `<text x="640" y="${230 + i * (size + 10)}" font-family="Archivo Black" font-size="${size}" fill="${INK}">${svgEsc(l)}</text>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${CARD}"/>
  <rect x="20" y="20" width="1160" height="590" fill="none" stroke="${INK}" stroke-width="4"/>
  ${labelSvg(r, 80, 150, -3)}
  <text x="640" y="140" font-family="IBM Plex Mono" font-size="24" fill="${INK}">NORMAL SHOES FILMS · BLU-RAY LABEL</text>
  ${title}
  <text x="640" y="${230 + lines.length * (size + 10) + 30}" font-family="IBM Plex Mono" font-size="21" fill="#b5370f">${svgEsc(sub)}</text>
  <text x="640" y="570" font-family="IBM Plex Mono" font-size="22" fill="${INK}">normalshoes.co.uk</text>
</svg>`;
}

function faviconSvg(colour) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect x="3" y="9" width="58" height="46" rx="3" fill="${colour}" stroke="${INK}" stroke-width="4"/>
  <rect x="9" y="21" width="46" height="3" fill="${INK}"/>
  <text x="32" y="47" font-family="Archivo Black, Arial Black, sans-serif" font-weight="900" font-size="22" text-anchor="middle" fill="${INK}">NS</text>
</svg>`;
}

function renderPngs() {
  let Resvg;
  try {
    ({ Resvg } = require("@resvg/resvg-js"));
  } catch (e) {
    console.warn("! @resvg/resvg-js not installed: skipping OG/press PNGs (run npm install).");
    return false;
  }
  const fontFiles = fs.readdirSync(path.join(SRC, "og-fonts")).filter((f) => f.endsWith(".ttf")).map((f) => path.join(SRC, "og-fonts", f));
  const png = (svg, width) =>
    new Resvg(svg, {
      font: { fontFiles, loadSystemFonts: false, defaultFontFamily: "Archivo Black" },
      fitTo: width ? { mode: "width", value: width } : { mode: "original" },
    })
      .render()
      .asPng();

  for (const r of releases) {
    const sub = r.teaser
      ? "COMING SOON · LOCATION UNKNOWN"
      : `${r.spine} · LIMITED BLU-RAY · ${STATUS[r.status].toUpperCase()}`;
    write(`og/${r.slug}.png`, png(ogSvg(r, { headline: r.teaser ? "Made in ??????" : r.title, sub })));
    const labelOnly = `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="340" viewBox="0 0 520 340">${labelSvg(r, 10, 10)}</svg>`;
    write(`press/${r.slug}-label.png`, png(labelOnly, 1040));
  }
  write("og/default.png", png(ogSvg(current, { headline: "Films nobody else would release.", sub: "NORMAL SHOES FILMS · BRIGHTON" })));
  write("favicon-32.png", png(faviconSvg(current.colour), 32));
  write("apple-touch-icon.png", png(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${CARD}"/>${faviconSvg(current.colour).replace(/^<svg[^>]*>|<\/svg>$/g, "")}</svg>`, 180));
  return true;
}

// ---------------------------------------------------------------------------
// Build

function build() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  copyDir(path.join(SRC, "static"), OUT);

  // Fingerprint CSS/JS so they can be cached hard.
  fs.mkdirSync(path.join(OUT, "assets"), { recursive: true });
  for (const [key, file] of [["css", "style.css"], ["js", "script.js"]]) {
    const content = fs.readFileSync(path.join(OUT, file));
    const name = file.replace(".", `.${hash(content)}.`);
    fs.renameSync(path.join(OUT, file), path.join(OUT, "assets", name));
    assets[key] = `/assets/${name}`;
  }

  const pngs = renderPngs();
  write("favicon.svg", faviconSvg(current.colour));

  const pages = [];
  const add = (urlPath, html) => {
    write(urlPath === "/404" ? "404.html" : path.join(urlPath, "index.html"), html);
    if (urlPath !== "/404" && urlPath !== "/thank-you/") pages.push(urlPath);
  };

  add("/", homePage());
  add("/releases/", shelfPage());
  for (const r of releases) add(r.url, releasePage(r));
  add("/map/", mapPage());
  add("/stockists/", stockistsPage());
  add("/press/", pressPage(pngs));
  add("/thank-you/", thankYouPage());

  for (const file of fs.readdirSync(path.join(SRC, "pages")).filter((f) => f.endsWith(".html"))) {
    const { meta, body } = fragmentPage(file);
    const slug = file.replace(/\.html$/, "");
    const urlPath = slug === "404" ? "/404" : `/${slug}/`;
    add(urlPath, layout({ ...meta, pathName: urlPath === "/404" ? "/404" : urlPath, body, pageClass: meta.pageClass || "" }));
  }

  write(
    "sitemap.xml",
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages
      .map((p) => `  <url><loc>${site.url}${p}</loc></url>`)
      .join("\n")}\n</urlset>\n`
  );
  write(
    "robots.txt",
    site.launched ? `User-agent: *\nAllow: /\n\nSitemap: ${site.url}/sitemap.xml\n` : "User-agent: *\nDisallow: /\n"
  );

  // Catalogue for the checkout and stock functions (prices are decided
  // server-side from this file, never from the browser).
  const catalogue = {
    launched: !!site.launched,
    max_per_order: site.max_per_order,
    shipping: site.shipping,
    releases: Object.fromEntries(
      releases.map((r) => [
        r.slug,
        {
          spine: r.spine,
          title: plain(r.title),
          city: r.made_in_city,
          status: r.status,
          price_pence: r.price_pence,
          stripe: r.stripe_link_or_price_id || "",
          ship_date: plain(r.ship_date || "") || "TBC",
          edition_limit: r.edition_limit,
          stock_remaining: r.stock_remaining,
          allocated_elsewhere: r.allocated_elsewhere || 0,
          stock_adjust: r.stock_adjust || 0,
          sales_open: r.sales_open || null,
        },
      ])
    ),
  };
  fs.writeFileSync(path.join(ROOT, "netlify", "lib", "catalogue.generated.json"), JSON.stringify(catalogue, null, 2));

  // Placeholder report, so nothing ships with a forgotten [TBC].
  const tbc = [];
  const scan = (obj, where) => {
    if (typeof obj === "string" && obj.includes("[TBC]")) tbc.push(where);
    else if (obj && typeof obj === "object") for (const [k, v] of Object.entries(obj)) scan(v, `${where}.${k}`);
  };
  for (const r of releases) {
    scan(r, r.spine);
    if (r.price_tbc) tbc.push(`${r.spine}.price`);
  }
  scan(site, "site");
  for (const file of fs.readdirSync(path.join(SRC, "pages"))) {
    const n = (fs.readFileSync(path.join(SRC, "pages", file), "utf8").match(/\[TBC\]/g) || []).length;
    if (n) tbc.push(`src/pages/${file} (${n})`);
  }
  if (site.shipping.international.tbc) tbc.push("site.shipping.international.amount_pence");

  console.log(`Built ${pages.length + 2} pages into dist/ (base ${BASE}${site.launched ? "" : ", PREVIEW: noindex, live payments off"}).`);
  if (tbc.length) console.log(`[TBC] placeholders still open (${tbc.length}):\n  - ${tbc.join("\n  - ")}`);
}

build();
