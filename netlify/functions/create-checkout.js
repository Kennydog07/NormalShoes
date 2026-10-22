// Creates a Stripe Embedded Checkout session for a release.
//
// POST /api/checkout  { release: "ns-001", region: "uk" | "international", quantity: 1-3 }
//
// Same pattern as before: the browser sends only what it wants; the price,
// shipping rates and edition limit are decided here from the catalogue that
// build.js generates from releases/*.json.
//
// Environment variables (Netlify -> Site configuration -> Environment variables):
//   STRIPE_SECRET_KEY       sk_test_... while building, sk_live_... after launch
//   STRIPE_PUBLISHABLE_KEY  pk_test_... / pk_live_...
//
// Safety: until site.json has "launched": true, live keys are refused, so a
// preview can never take a real payment.

const { catalogue, stripe, stockFor, secretKey, isLiveKey, reply } = require("../lib/stripe");

// Where Stripe sends the buyer afterwards. Only our own hosts are allowed.
function originOf(event) {
  const h = event.headers || {};
  const host = (h["x-forwarded-host"] || h.host || "").toLowerCase();
  if (/^([a-z0-9-]+\.)*normalshoes\.co\.uk$/.test(host) || /^[a-z0-9-]+(--[a-z0-9-]+)?\.netlify\.app$/.test(host)) {
    return `https://${host}`;
  }
  if (/^localhost(:\d+)?$/.test(host)) return `http://${host}`;
  return "https://www.normalshoes.co.uk";
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return reply(405, { error: "Method not allowed" });

  const key = secretKey();
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
  if (!key || !publishableKey) return reply(503, { error: "Card payments aren't switched on yet." });
  if (isLiveKey(key) && !catalogue.launched) {
    return reply(503, { error: "This is a preview, so live payments are switched off." });
  }

  let input;
  try {
    input = JSON.parse(event.body || "{}");
  } catch (e) {
    return reply(400, { error: "Bad request" });
  }

  const slug = String(input.release || "").toLowerCase();
  const release = Object.prototype.hasOwnProperty.call(catalogue.releases, slug) ? catalogue.releases[slug] : null;
  if (!release) return reply(400, { error: "Unknown release." });
  if (release.status !== "preorder" && release.status !== "available") {
    return reply(409, { error: "That one isn't on sale right now." });
  }
  if (/^https:\/\//.test(release.stripe)) return reply(409, { error: "Please use the buy link on the release page." });

  const region = input.region === "international" ? "international" : "uk";
  const rate = catalogue.shipping[region];
  let quantity = Math.floor(Number(input.quantity) || 1);
  quantity = Math.min(Math.max(quantity, 1), catalogue.max_per_order);

  // Edition cap: never sell past the limit.
  let stock;
  try {
    stock = await stockFor(slug, { fresh: true });
  } catch (err) {
    console.error("Stock check failed:", err.message);
    return reply(502, { error: "Couldn't check stock just now." });
  }
  if (stock && stock.remaining != null) {
    if (stock.remaining <= 0) return reply(409, { error: "Sold out, sorry. Every copy has a home." });
    if (quantity > stock.remaining) {
      return reply(409, { error: `Only ${stock.remaining} left, so please choose ${stock.remaining} or fewer.` });
    }
  }

  const preorder = release.status === "preorder";
  const shipLine = preorder ? `Pre-order: ships ${release.ship_date}.` : "In stock.";
  const origin = originOf(event);

  const p = new URLSearchParams();
  p.set("ui_mode", "embedded");
  p.set("mode", "payment");
  p.set("return_url", `${origin}/thank-you/?release=${slug}&session_id={CHECKOUT_SESSION_ID}`);
  p.set("billing_address_collection", "auto");
  p.set("expires_at", String(Math.floor(Date.now() / 1000) + 30 * 60));

  p.set("line_items[0][quantity]", String(quantity));
  if (/^price_/.test(release.stripe)) {
    p.set("line_items[0][price]", release.stripe);
  } else {
    p.set("line_items[0][price_data][currency]", "gbp");
    p.set("line_items[0][price_data][unit_amount]", String(release.price_pence));
    p.set("line_items[0][price_data][product_data][name]", `${release.spine} ${release.title}: Limited Edition Blu-ray${preorder ? " (pre-order)" : ""}`);
    p.set("line_items[0][price_data][product_data][description]", `${shipLine} Made in ${release.city}. Normal Shoes films.`);
  }

  rate.countries.forEach((c, i) => p.set(`shipping_address_collection[allowed_countries][${i}]`, c));
  p.set("shipping_options[0][shipping_rate_data][type]", "fixed_amount");
  p.set("shipping_options[0][shipping_rate_data][display_name]", rate.label);
  p.set("shipping_options[0][shipping_rate_data][fixed_amount][amount]", String(rate.amount_pence));
  p.set("shipping_options[0][shipping_rate_data][fixed_amount][currency]", "gbp");

  p.set(
    "custom_text[submit][message]",
    preorder
      ? `${shipLine} You're charged today. Cancel any time before it ships for a full refund. Terms: normalshoes.co.uk/terms`
      : "Posted from Brighton. Terms: normalshoes.co.uk/terms"
  );
  if (region === "international") {
    p.set("custom_text[shipping_address][message]", "International orders may have import duties or taxes to pay on delivery.");
  }

  p.set("metadata[release]", release.spine);
  p.set("metadata[quantity]", String(quantity));
  p.set("metadata[region]", region);
  p.set("payment_intent_data[metadata][release]", release.spine);
  p.set("payment_intent_data[metadata][quantity]", String(quantity));
  p.set("payment_intent_data[description]", `${release.spine} ${release.title} x${quantity}${preorder ? " (pre-order)" : ""}`);

  try {
    const session = await stripe("checkout/sessions", { method: "POST", params: p });
    if (!session.client_secret) throw new Error("No client secret");
    return reply(200, { clientSecret: session.client_secret, publishableKey });
  } catch (err) {
    console.error("Stripe session creation failed:", err.message);
    return reply(502, { error: "Couldn't start card payment." });
  }
};
