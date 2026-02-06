

## Update Keepa Parsing to Match Production Workflow

The current `enrich-product-asin` edge function uses Keepa's `stats` object for basic averages but misses the full historical data parsing and calibrated sales estimation that your production n8n workflow uses. This plan brings the edge function in line with that logic.

---

### What Changes

**1. Update Keepa API call parameters**
- Change from `history=0` to `days=730` to get 2 years of CSV history data
- Remove `offers=20` (not needed, saves API tokens)

**2. Add historical BSR parsing (`getMonthlyBreakdown`)**
- Port the `getMonthlyBreakdown` function that processes `csv[3]` (Sales Rank history) into monthly averages over 24 months
- Uses the Keepa time offset (21564000 minutes) to convert Keepa timestamps to real dates

**3. Add calibrated power-law sales estimation**
- Implement the formula: `Sales = k * (Rank ^ CATEGORY_SLOPE)` where slope = -1.38
- Calibrate `k` using current known sales from Jungle Scout + current rank
- Generate a full `monthly_sales_history` object from BSR history

**4. Compute BSR averages from raw history (more accurate)**
- Replace reliance on `stats.avg30`/`stats.avg90` for BSR with values computed directly from the CSV data (month_1 for 30-day, average of months 1-3 for 90-day)
- Keep using `stats.avg30`/`stats.avg90` for price averages (those are fine)

**5. Extract FBA fees from Keepa**
- Parse `product.fbaFees.pickAndPackFee` (in cents) as `fees_estimate`

**6. Add net estimate calculation**
- In `update-product-enrichment`, compute `net_estimate` after enrichment: `monthly_revenue - (30% COGS) - (fees * monthly_sales)`

**7. Store historical data in the `historical_data` JSONB column**
- Save `monthly_bsr_history` and `monthly_sales_history` into the existing `historical_data` column on the products table

---

### Technical Details

**Files modified:**
- `supabase/functions/enrich-product-asin/index.ts` -- Add `getMonthlyBreakdown`, calibrated sales estimation, FBA fees parsing, updated API params. Add new fields to `EnrichedData` interface: `monthly_bsr_history`, `monthly_sales_history`, `fba_fees`.
- `supabase/functions/update-product-enrichment/index.ts` -- Map new fields (`historical_data`, `fees_estimate` from FBA, `net_estimate` calculation), store histories in `historical_data` JSONB column.
- `src/hooks/useEnrichProduct.ts` -- Add new fields to the `EnrichedProductData` interface.

**No database migration needed** -- the `products` table already has `historical_data` (jsonb), `fees_estimate` (numeric), and `net_estimate` (numeric) columns.

**Key constants (matching your workflow):**
```text
CATEGORY_SLOPE = -1.38
GENERIC_CONSTANT = 250000000
KEEPA_OFFSET_MINUTES = 21564000
```

**Sales calibration logic:**
```text
If Jungle Scout provides current_sales and current_rank:
  k = current_sales / (current_rank ^ -1.38)
Else:
  k = 250000000 (generic fallback)

For each month's average BSR:
  estimated_sales = k * (avg_rank ^ -1.38)
```

