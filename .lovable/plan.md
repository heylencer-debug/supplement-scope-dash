

## Fix Jungle Scout Lookups: Default to Parent ASIN

### Problem
Jungle Scout's Product Database API doesn't index child/variation ASINs (like LMNT's B0FTGJGPTM). The current flow tries the child ASIN first, fails, then retries with the parent -- but for products where there's no parent (standalone ASINs), JS still returns nothing because `include_keywords` is a keyword search, not an exact ASIN filter.

The real issue is that JS frequently misses even standalone ASINs via keyword search, and the parent fallback only helps variation products.

### Solution: Reorder the Jungle Scout Lookup

**File: `supabase/functions/enrich-product-asin/index.ts`** (lines 532-556)

Change the lookup order:

1. Fetch Keepa first (already done -- gives us `parent_asin`)
2. If Keepa found a `parent_asin` different from the input ASIN, try JS with the **parent ASIN first** (this is where JS data lives for variations)
3. If no parent ASIN, or parent lookup failed, try JS with the original ASIN as fallback
4. This maximizes the chance of getting JS calibration data (sales, revenue, LQS)

```
Current flow:
  1. Keepa(child) -> 2. JS(child) -> 3. JS(parent) if child failed

New flow:
  1. Keepa(child) -> 2. JS(parent) if parent exists -> 3. JS(child) as fallback
```

### Technical Changes

Replace the JS fetch logic (lines 538-556) with:

```typescript
// Step 2: Fetch Jungle Scout -- prefer parent ASIN when available
let jsData: Partial<EnrichedData> | null = null;
const parentAsin = keepaResult?.data?.parent_asin;

if (parentAsin && parentAsin !== asin) {
  // Try parent ASIN first (JS indexes parent-level data)
  console.log(`Trying JS with parent ASIN first: ${parentAsin}`);
  jsData = await fetchJungleScout(parentAsin, marketplace);
  if (jsData) {
    console.log(`JS parent lookup succeeded for ${parentAsin}`);
  } else {
    // Fall back to child ASIN
    console.log(`JS parent failed, trying child ASIN: ${asin}`);
    jsData = await fetchJungleScout(asin, marketplace);
  }
} else {
  // No parent ASIN -- try the original ASIN directly
  jsData = await fetchJungleScout(asin, marketplace);
}
```

### What This Fixes

- **Variation ASINs** (like LMNT): Goes straight to parent where JS has data, avoiding a wasted API call on the child
- **Standalone ASINs**: Behavior unchanged (no parent, so tries the ASIN directly)
- **Calibrated sales**: With JS data from the parent, `calibrateSales` gets real `currentSales` and `currentRank`, producing a calibrated `k` constant instead of the generic fallback

### Expected Result

After deploying and re-enriching LMNT (B0FTGJGPTM):
- JS finds data via parent ASIN, providing real `monthly_sales` and `monthly_revenue`
- Sales estimates use calibrated `k` constant instead of generic 250M
- No more flat 100K cap -- actual JS-reported sales used

### No Other Files Changed

The `update-product-enrichment` and frontend hooks remain unchanged.

