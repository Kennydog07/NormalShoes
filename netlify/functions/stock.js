// GET /api/stock/:release  ->  { release, limit, remaining, source }
//
// source is "stripe" (counted from paid orders) or "manual" (the
// stock_remaining field in the release file, used when Stripe isn't
// connected). Cached briefly at Netlify's CDN.

const { stockFor, reply } = require("../lib/stripe");

exports.handler = async (event) => {
  const slug = ((event.queryStringParameters || {}).release || "").toLowerCase();
  try {
    const stock = await stockFor(slug);
    if (!stock) return reply(404, { error: "Unknown release" });
    return reply(200, stock, {
      "Cache-Control": "public, max-age=30",
      "Netlify-CDN-Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
    });
  } catch (err) {
    console.error("Stock lookup failed:", err.message);
    return reply(502, { error: "Stock count unavailable" });
  }
};
