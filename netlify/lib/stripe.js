// Shared Stripe helpers for the Netlify functions.
//
// Catalogue (prices, edition sizes, ship dates) comes from
// catalogue.generated.json, which build.js writes from releases/*.json.
//
// Stock without webhooks: copies sold = the sum of metadata.quantity over
// paid Checkout Sessions tagged with this release, read straight from
// Stripe's API.

const catalogue = require("./catalogue.generated.json");

// Pinned so the API shapes don't change underneath us (same as before).
const STRIPE_API_VERSION = "2024-12-18.acacia";

function secretKey() {
  // STRIPE_SECRET_KET is the misspelled name the key was first saved under in
  // Netlify; still accepted so nothing breaks before it's renamed.
  return process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KET || "";
}

function isLiveKey(key) {
  return /^(sk|rk)_live_/.test(key);
}

async function stripe(path, { method = "GET", params } = {}) {
  const key = secretKey();
  const url = `https://api.stripe.com/v1/${path}${method === "GET" && params ? `?${params}` : ""}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Stripe-Version": STRIPE_API_VERSION,
      ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: method === "POST" && params ? params.toString() : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((body.error && body.error.message) || `Stripe ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return body;
}

// Count copies sold for a release from paid Checkout Sessions.
async function countSold(release) {
  const since = release.sales_open ? Math.floor(Date.parse(release.sales_open) / 1000) - 86400 : 0;
  let sold = 0;
  let after = null;
  for (let page = 0; page < 60; page++) {
    const params = new URLSearchParams({ limit: "100", status: "complete" });
    if (since > 0) params.set("created[gte]", String(since));
    if (after) params.set("starting_after", after);
    const list = await stripe("checkout/sessions", { params });
    for (const s of list.data) {
      if (s.payment_status !== "paid" || !s.metadata || s.metadata.release !== release.spine) continue;
      sold += Math.max(1, parseInt(s.metadata.quantity, 10) || 1);
    }
    if (!list.has_more || !list.data.length) break;
    after = list.data[list.data.length - 1].id;
  }
  return sold;
}

// Small in-memory cache so a busy page doesn't hammer Stripe.
const cache = new Map();
const CACHE_MS = 60 * 1000;

async function stockFor(slug, { fresh = false } = {}) {
  const release = catalogue.releases[slug];
  if (!release) return null;
  const limit = release.edition_limit;
  if (!limit) return { release: release.spine, limit: null, remaining: null, source: "none" };

  if (!secretKey()) {
    return { release: release.spine, limit, remaining: release.stock_remaining, source: "manual" };
  }

  const hit = cache.get(slug);
  if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  const sold = await countSold(release);
  const remaining = Math.max(0, limit - release.allocated_elsewhere - sold + release.stock_adjust);
  const value = { release: release.spine, limit, sold, remaining, source: "stripe" };
  cache.set(slug, { at: Date.now(), value });
  return value;
}

function reply(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
    body: JSON.stringify(body),
  };
}

module.exports = { catalogue, stripe, stockFor, secretKey, isLiveKey, reply };
