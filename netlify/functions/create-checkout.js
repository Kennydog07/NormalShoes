// Creates a Stripe Embedded Checkout session for the Hastings Rocks Collection.
//
// Needs two environment variables set in Netlify (Site configuration ->
// Environment variables), then a redeploy:
//   STRIPE_SECRET_KEY       sk_live_... (or sk_test_... for testing)
//   STRIPE_PUBLISHABLE_KEY  pk_live_... (or pk_test_... for testing)
//
// Until both are set this returns 503 and the website falls back to the
// pre-order request form.

const PRODUCT_NAME = "Hastings Rocks Collection (pre-order)";
const PRICE_PENCE = 1999;
const UK_DELIVERY_PENCE = 395;
const MAX_QUANTITY = 10;

// Pinned so the session shape doesn't change underneath us.
const STRIPE_API_VERSION = "2024-12-18.acacia";

const reply = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return reply(405, { error: "Method not allowed" });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
  if (!secretKey || !publishableKey) {
    return reply(503, { error: "Card payments are not set up yet." });
  }

  const params = new URLSearchParams();
  params.set("ui_mode", "embedded");
  params.set("mode", "payment");
  params.set("redirect_on_completion", "never");
  params.set("billing_address_collection", "auto");
  params.set("phone_number_collection[enabled]", "true");

  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][adjustable_quantity][enabled]", "true");
  params.set("line_items[0][adjustable_quantity][minimum]", "1");
  params.set("line_items[0][adjustable_quantity][maximum]", String(MAX_QUANTITY));
  params.set("line_items[0][price_data][currency]", "gbp");
  params.set("line_items[0][price_data][unit_amount]", String(PRICE_PENCE));
  params.set("line_items[0][price_data][product_data][name]", PRODUCT_NAME);

  params.set("shipping_address_collection[allowed_countries][0]", "GB");
  params.set("shipping_options[0][shipping_rate_data][type]", "fixed_amount");
  params.set("shipping_options[0][shipping_rate_data][display_name]", "UK delivery");
  params.set("shipping_options[0][shipping_rate_data][fixed_amount][amount]", String(UK_DELIVERY_PENCE));
  params.set("shipping_options[0][shipping_rate_data][fixed_amount][currency]", "gbp");

  params.set("metadata[order]", "hastings-rocks-preorder");

  let response;
  try {
    response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Stripe-Version": STRIPE_API_VERSION,
      },
      body: params.toString(),
    });
  } catch (err) {
    return reply(502, { error: "Could not reach the payment provider." });
  }

  const session = await response.json().catch(() => ({}));
  if (!response.ok || !session.client_secret) {
    console.error("Stripe session creation failed:", response.status, session.error && session.error.message);
    return reply(502, { error: "Could not start card payment." });
  }

  return reply(200, { clientSecret: session.client_secret, publishableKey });
};
