# Normal Shoes films

Site for Normal Shoes, a boutique Blu-ray label from Brighton. Plain static HTML, CSS and JS built by one Node script, hosted on Netlify, payments through Stripe Embedded Checkout.

```
node build.js        # builds everything into dist/
```

`npm install` first if you want the share images (OG/press PNGs). Without it the build still works and just skips them.

## Adding a release

Add one file, `releases/ns-00X.json`. Copying `ns-001.json` is the easiest start. Home, the shelf, the map, the release page, the share image, the sitemap and checkout all pick it up.

| Field | Notes |
|---|---|
| `spine`, `slug` | `NS-003`, `ns-003`. The slug is the URL: `/releases/ns-003/`. |
| `status` | `coming-soon`, `preorder`, `available` or `sold-out`. |
| `teaser` | `true` shows "MADE IN ??????" everywhere and hides the details. |
| `made_in_city`, `made_in_country`, `coordinates` | The Made In label and the map pin. Use a city, not a country. |
| `label_colour` | One of the fixed palette names in `build.js` (`PALETTE`). Take the next unused one so the shelf builds into a spectrum. |
| `price`, `edition_limit`, `ship_date` | Shown before checkout, and used by the checkout function. |
| `stock_remaining` | Fallback number, shown only when Stripe isn't connected. |
| `allocated_elsewhere` | Copies held back for shops. Taken off the online count. |
| `stock_adjust` | Add copies back, e.g. after refunds. |
| `sales_open` | Date pre-orders opened. Stock is counted from Stripe orders since then. |
| `stripe_link_or_price_id` | Empty = priced from `price`. Or a Stripe `price_…` ID, or a Payment Link URL. |
| `images.cover` | Path to real cover art (put files in `src/static/img/`). Until then a house-template placeholder is drawn. |

Anything written as `[TBC]` shows up highlighted on the site, and the build prints a list of every open placeholder.

## Stock

There are no webhooks. The `stock` function counts paid Checkout Sessions tagged with the release's spine (`metadata.release`, `metadata.quantity`) straight from Stripe. Checkout refuses once the edition is gone.

## Launch switch

`src/site.json` has `"launched": false`. While it's false:

- every page is `noindex` and `robots.txt` blocks crawlers;
- checkout refuses **live** Stripe keys (test keys work).

Set it to `true` only when switching normalshoes.co.uk over.

## Forms

Netlify Forms: `mailing-list`, `shoe-club`, `where-next`, `contact`. Submissions are under Forms in the Netlify dashboard (CSV export available).
