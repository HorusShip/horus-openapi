# Margin math

Horus prices a listing from the source cost and the markup (`advantage_pct`), then accounts for the
user's fee settings (`settings.orders.marketplace_fee_percent`, `marketplace_fee_flat`,
`promoted_listings_ad_rate_percent`, `markup_includes_ad`). **Don't reimplement it. Call
`listings_pricing_preview`**, which uses exactly the user's settings:

```json
POST /listings/pricing/preview
{ "cost": 24.99, "advantage_pct": 70 }
→ { "price": { "amount": 42.48 }, "estimated_profit": { "amount": 9.87 }, "breakeven": { "amount": 29.40 },
    "formula": "cost+ad", "ad_rate_pct": 5 }
```

(The numbers above are only an illustration.)

How to read it:

- `estimated_profit` = eBay price − source cost − eBay fees − ad fee. Tax and shipping at the source
  aren't included. A Prime account usually ships free, while a non-Prime account adds shipping at checkout
  and can push the order over the user's minimum ROI (`orders.min_profit_roi_percent`). In that case the sale
  waits in PENDING (price exceeded) and auto-cancels after `orders.auto_cancel_hours`.
- `breakeven` is the lowest eBay price that doesn't lose money.

When choosing what to list:

| Signal | Prefer |
|---|---|
| `estimate.margin_pct` / `roi_pct` (candidates), or `spread` (leads) | Above `min_margin_pct` from `sourcing_config_get`. Ask if unsure. |
| `match.overall` | ≥ 0.8. Below 0.6 the source product is probably a different item. |
| `source.prime` | true (fast, free shipping). |
| `source.in_stock` / `amazon.in_stock` | true. |
| `saturation`, `claim_count` (feed) | Low: fewer sellers on the same item. |
| `vero_blocked`, `vero_risk` | false, always. |
| Price | ≥ $3 source cost. Very cheap items rarely survive fees. |

A quick way to triage a lead or candidate by hand:

```
cost   = source price (Amazon price on the lead / candidate)
preview = listings_pricing_preview(cost)
worth it if preview.estimated_profit ≥ max($2, 10% of preview.price) and match ≥ 0.8
```

Adjust those thresholds to what the user says they want. Some run thin margins at high volume.
