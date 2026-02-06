

# Plan: Enrich Product Data with Jungle Scout & Keepa APIs

## Overview

Add an "Auto-Fill from ASIN" feature to the Add Product form. When the user enters an ASIN and clicks a button, a new edge function calls the Jungle Scout and Keepa APIs to fetch product details (title, brand, price, BSR, sales estimates, images, etc.) and auto-populates the form fields + saves the enriched data to the database.

## Architecture

```text
User enters ASIN → clicks "Lookup ASIN" button
         │
         ▼
┌────────────────────────────────────┐
│  enrich-product-asin               │
│  (New Edge Function)               │
├────────────────────────────────────┤
│  1. Call Jungle Scout Product DB   │
│     (include_keywords = ASIN)      │
│     → title, brand, price, BSR,    │
│       sales, revenue, category,    │
│       fees, LQS, seller info,      │
│       date first available, etc.   │
│                                    │
│  2. Call Keepa Product API         │
│     → price history stats,         │
│       BSR history, rating count,   │
│       image URLs, product URL,     │
│       date first available         │
│                                    │
│  3. Merge and return combined data │
└────────────────────────────────────┘
         │
         ▼
Form auto-fills: title, brand, price, rating, reviews
Database insert includes: bsr_current, monthly_sales,
  monthly_revenue, main_image_url, product_url, lqs,
  date_first_available, seller_name, is_fba, etc.
```

## Step 1: Add API Key Secrets

Two new secrets are needed:
- **JUNGLE_SCOUT_API_KEY** -- The user's Jungle Scout API key (format: `KEY_NAME:API_KEY`)
- **KEEPA_API_KEY** -- The user's Keepa API access key

## Step 2: Create Edge Function

**File: `supabase/functions/enrich-product-asin/index.ts`**

The function will:
1. Accept `{ asin: string, marketplace?: string }` as input
2. Call Jungle Scout Product Database endpoint:
   - `POST https://developer.junglescout.com/api/product_database_query`
   - Headers: `Content-Type: application/vnd.api+json`, `Accept: application/vnd.junglescout.v1+json`, `Authorization: KEY_NAME:API_KEY`
   - Body: filter by `include_keywords` = ASIN
   - Returns: title, brand, price, BSR, estimated units sold, revenue, LQS, fees, seller info, weight, dimensions, date first available, category
3. Call Keepa Product API:
   - `GET https://api.keepa.com/product?key=KEY&domain=1&asin=ASIN&stats=180&rating=1`
   - Returns: price history stats (30/90-day averages), BSR history, rating/review count, image URLs, date first available
4. Merge results with Jungle Scout as primary, Keepa filling gaps (images, historical averages, rating count)
5. Return unified response

**Response shape:**
```typescript
{
  success: boolean;
  source: "jungle_scout" | "keepa" | "both" | "none";
  data: {
    // Form-fillable fields
    title: string | null;
    brand: string | null;
    price: number | null;
    rating: number | null;
    reviews: number | null;
    // Extended fields (saved directly to DB)
    monthly_sales: number | null;
    monthly_revenue: number | null;
    bsr_current: number | null;
    bsr_category: string | null;
    lqs: number | null;
    seller_name: string | null;
    seller_type: string | null;
    is_fba: boolean | null;
    date_first_available: string | null;
    main_image_url: string | null;
    image_urls: string[] | null;
    product_url: string | null;
    feature_bullets: string[] | null;
    dimensions: string | null;
    weight: string | null;
    price_30_days_avg: number | null;
    price_90_days_avg: number | null;
    bsr_30_days_avg: number | null;
    bsr_90_days_avg: number | null;
    estimated_revenue: number | null;
    estimated_monthly_sales: number | null;
    fees_estimate: number | null;
    variations_count: number | null;
    parent_asin: string | null;
  };
}
```

## Step 3: Create React Hook

**File: `src/hooks/useEnrichProduct.ts`**

A React Query mutation hook that:
- Takes an ASIN string as input
- Calls the `enrich-product-asin` edge function
- Returns the enriched data with loading/error states

## Step 4: Update AddProduct Form

**File: `src/pages/AddProduct.tsx`**

Changes:
1. Add a "Lookup" button next to the ASIN input field
2. When clicked, call the enrichment hook
3. Auto-fill form fields: title, brand, price, rating, reviews
4. Store the extended data (BSR, sales, images, etc.) in component state
5. Show a preview of the fetched product image if available
6. Display a summary badge showing data sources used (e.g., "Jungle Scout + Keepa")

## Step 5: Update useAddProduct Hook

**File: `src/hooks/useAddProduct.ts`**

Extend `ProductFormData` interface with optional enrichment fields:
```typescript
// New optional fields from API enrichment
monthly_sales?: number | null;
monthly_revenue?: number | null;
bsr_current?: number | null;
bsr_category?: string | null;
lqs?: number | null;
seller_name?: string | null;
seller_type?: string | null;
is_fba?: boolean | null;
date_first_available?: string | null;
main_image_url?: string | null;
image_urls?: string[] | null;
product_url?: string | null;
feature_bullets?: string[] | null;
dimensions?: string | null;
weight?: string | null;
// ... etc
```

These fields get passed through to the Supabase insert so the product record matches the data richness of other products in the database.

## Step 6: Update config.toml

Add the new edge function entry.

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `supabase/functions/enrich-product-asin/index.ts` | Create | Edge function calling Jungle Scout + Keepa APIs |
| `src/hooks/useEnrichProduct.ts` | Create | React Query mutation hook |
| `src/pages/AddProduct.tsx` | Modify | Add ASIN lookup button and auto-fill logic |
| `src/hooks/useAddProduct.ts` | Modify | Extend ProductFormData with enrichment fields |
| `supabase/config.toml` | Modify | Register new edge function |

## Secrets Required

- `JUNGLE_SCOUT_API_KEY` -- User will be prompted to add this
- `KEEPA_API_KEY` -- User will be prompted to add this

Both are already confirmed by the user as available.

## UI Flow

1. User enters ASIN in the text field
2. Clicks "Lookup" button (magnifying glass icon) next to the ASIN input
3. Loading spinner appears on the button
4. On success: form fields auto-populate, product image thumbnail appears, toast shows "Enriched from Jungle Scout + Keepa"
5. User can still edit any field before saving
6. On save, all enriched data is included in the database insert

