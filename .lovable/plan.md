

## Fix JS Parent ASIN Fallback, Cap Sales Calibration, and Extract Additional Keepa Fields

### Problem

1. **Jungle Scout fails on child variations** (e.g., LMNT `B0FTGJGPTM`), returning no data. The function never retries with the parent ASIN that Keepa provides.
2. **Sales calibration explodes for low-rank products** when JS data is missing. The generic `k = 250,000,000` applied to rank 7 produces ~17 million estimated sales.
3. **Keepa returns several useful fields** that we never extract: `description`, `manufacturer`, `packageWeight`, `packageHeight/Length/Width`, `buyBoxIsFBA`, `isSNS`, `variationCSV`.

---

### Changes

#### 1. JS Parent ASIN Fallback (`enrich-product-asin/index.ts`)

In the main `serve` handler, after the initial JS call returns null:
- Call Keepa first (lightweight, always works) to get `parentAsin`
- If JS returned null and Keepa found a `parentAsin` different from the original ASIN, retry JS with the parent ASIN
- Merge the parent JS data but keep the original child ASIN throughout

Flow becomes:
```text
1. Fetch Keepa (always works, gives us parentAsin)
2. Fetch JS with child ASIN
3. If JS is null AND Keepa has parentAsin != child ASIN:
   -> Retry JS with parentAsin
4. Pass JS data (if any) into Keepa calibration logic
```

Since Keepa is called before JS now, the calibration step inside `fetchKeepa` needs to be separated -- we'll extract calibration into a post-processing step after both APIs return.

#### 2. Cap Sales Calibration for Uncalibrated Products

When no JS sales data exists (generic `k`), add guardrails:
- **Cap estimated monthly sales at 100,000 units** -- any estimate above this without calibration data is unrealistic
- **Cap per-month estimates identically** in the sales history loop
- Log a warning when the cap is applied

#### 3. Extract Additional Keepa Fields

Add new fields to `EnrichedData` interface and extract from the Keepa product object:

| Keepa field | Maps to | DB column |
|---|---|---|
| `product.description` | `description_text` | `description_text` |
| `product.manufacturer` | `manufacturer` | `manufacturer` |
| `product.packageWeight` (grams) | `weight` | `weight` |
| `product.packageHeight/Length/Width` (mm) | `dimensions` | `dimensions` |
| `product.buyBoxIsFBA` | `is_fba` | `is_fba` |
| `product.isSNS` (Subscribe & Save) | `is_sns` | stored in `historical_data` |
| `product.variationCSV` (count pairs) | `variations_count` | `variations_count` |
| `product.categoryTree` (full) | `categories_flat` | `categories_flat` |

#### 4. Update `update-product-enrichment/index.ts`

Map the new fields into the database update payload:
- `description_text`, `manufacturer`, `categories_flat`
- `is_fba` from Keepa's `buyBoxIsFBA`
- Store `is_sns` inside the `historical_data` JSONB

#### 5. Update `src/hooks/useEnrichProduct.ts`

Add the new fields to the `EnrichedProductData` TypeScript interface so the frontend is type-aware.

---

### Technical Details

**Files modified:**
- `supabase/functions/enrich-product-asin/index.ts` -- Reorder API calls (Keepa first), add parent ASIN retry for JS, extract new Keepa fields, separate calibration into post-processing, add sales cap
- `supabase/functions/update-product-enrichment/index.ts` -- Map new fields (`description_text`, `manufacturer`, `categories_flat`, `is_fba`, `is_sns` in historical_data)
- `src/hooks/useEnrichProduct.ts` -- Add `description_text`, `manufacturer`, `categories_flat`, `is_sns` to interface

**No database migration needed** -- all target columns already exist on the `products` table.

**Sales cap constant:**
```text
MAX_UNCALIBRATED_MONTHLY_SALES = 100000
```

Applied only when `k` equals the generic fallback (no JS calibration data).

**Keepa dimension/weight parsing:**
```text
weight: product.packageWeight in grams -> convert to "X.XX lbs"
dimensions: packageHeight x packageLength x packageWidth in mm -> convert to "H x L x W inches"
```

**Variation count from `variationCSV`:**
```text
variationCSV is an array of [dimension, ASIN, ...] pairs
variations_count = number of unique ASINs in the array
```

