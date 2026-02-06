

## Fix Monthly Sales and Revenue for Manually Added Products

### Root Cause

The `calibrateSales` function in `enrich-product-asin/index.ts` calculates `monthly_revenue` as `monthly_sales * price`, but it **only** checks `jsData?.price`. When Jungle Scout returns no data (common for manually added variation ASINs like LMNT), `jsData` is null, so revenue is never calculated -- even though Keepa provides a valid price.

Additionally, the `update-product-enrichment` function has a `net_estimate` calculation that also falls through when `monthly_revenue` is null upstream.

### Fix (2 changes in 1 file)

**File: `supabase/functions/enrich-product-asin/index.ts`**

1. **Pass Keepa price into `calibrateSales`**: Add a `keepaPrice` parameter so the function can fall back to the Keepa price when JS price is unavailable.

2. **Update revenue calculation**:
   ```
   // Before (broken when JS is null):
   if (monthlySales && jsData?.price) {
     monthlyRevenue = Math.round(monthlySales * jsData.price);
   }

   // After (uses Keepa price as fallback):
   const effectivePrice = jsData?.price || keepaPrice || null;
   if (monthlySales && effectivePrice) {
     monthlyRevenue = Math.round(monthlySales * effectivePrice);
   }
   ```

3. **Update the caller** (line ~560) to pass `keepaData?.price` as the new parameter:
   ```
   const calibrated = calibrateSales(
     keepaResult?.bsrHistory || null,
     keepaResult?.bsrCsv || null,
     jsData,
     keepaData?.price || null,  // new param
   );
   ```

### Expected Result

After deploying, re-enriching LMNT (B0FTGJGPTM) should produce:
- `monthly_sales`: 100,000 (capped, already working)
- `monthly_revenue`: ~2,691,000 (100,000 x $26.91)
- `net_estimate`: calculated correctly downstream
