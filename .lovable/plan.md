
# Enhanced Formula Fit Analysis with Brand Deep Dive

## Overview
Enhance the Formula Fit analysis edge function to include comprehensive data about the top brands mentioned in the Market Trend analysis. When Grok evaluates the formula's competitive fit, it will now also receive detailed product data from our database for each brand mentioned in the market analysis.

---

## Current State

The `analyze-formula-fit` edge function currently sends to Grok:
- Formula brief data
- Formula brief version (full document)
- Extended formula brief from category analysis
- Category analysis metrics
- Full market trend analysis

**What's Missing**: The market trend analysis mentions brands (e.g., "Liquid I.V.", "LMNT", "Ultima Replenisher") but we're not sending the actual detailed product data we have about these brands.

---

## Proposed Enhancement

### Data to Add

For each brand mentioned in the market trend analysis, fetch and include:

**Brand-Level Aggregates:**
- Product count in our database
- Average price
- Average rating
- Total reviews
- Total monthly revenue
- Packaging types used

**Product-Level Details (Top 3-5 per brand):**
- Complete supplement facts (`supplement_facts_complete`)
- All nutrients breakdown (`all_nutrients`)
- Feature bullets / marketing claims (`feature_bullets_text`)
- Claims on label (`claims_on_label`)
- Other ingredients (`other_ingredients`)
- Pricing and performance metrics

---

## Technical Implementation

### Edge Function Changes (`analyze-formula-fit/index.ts`)

**New Data Fetching Logic:**

1. Parse the market trend analysis to extract brand names from:
   - `analysis.sections.competitiveLandscape.brandRankings[].brandName`
   - `analysis.sections.topProducts.products[].brandProductName` (extract brand from "Brand - Product" format)

2. Query products table for matching brands within the category:
```text
SELECT brand, title, price, rating, reviews, monthly_revenue,
       supplement_facts_complete, all_nutrients, feature_bullets_text,
       claims_on_label, other_ingredients, packaging_type, directions
FROM products
WHERE category_id = :categoryId
  AND brand IN (:extractedBrandNames)
ORDER BY monthly_revenue DESC
```

3. Group products by brand and include both:
   - Aggregated brand metrics
   - Top 3 products per brand with full details

**New Data Payload Section:**
```text
top_brands_data: {
  [brandName]: {
    summary: {
      product_count: number,
      avg_price: number,
      avg_rating: number,
      total_reviews: number,
      total_revenue: number,
      packaging_types: string[]
    },
    top_products: [
      {
        title: string,
        price: number,
        rating: number,
        reviews: number,
        monthly_revenue: number,
        supplement_facts_complete: object,
        all_nutrients: array,
        feature_bullets_text: string,
        claims_on_label: array,
        other_ingredients: string,
        packaging_type: string
      }
    ]
  }
}
```

### System Prompt Updates

Add to the existing system prompt:

```text
You will also receive detailed product data for the top brands mentioned in the market trends:
- Actual ingredient formulations from their supplement facts
- Nutrient profiles with dosages and daily values
- Marketing claims and feature bullets
- Performance metrics (reviews, ratings, revenue)

Use this real product data to:
1. Compare the user's formula ingredients directly against competitor formulations
2. Identify specific dosage differences (e.g., "Liquid I.V. uses 500mg sodium, your formula has 400mg")
3. Highlight claims competitors are making that the user's formula supports (or doesn't)
4. Reference actual competitor pricing when evaluating price positioning
```

### User Message Updates

Add new section to the prompt:

```text
=== TOP BRANDS DETAILED DATA ===
${JSON.stringify(topBrandsData, null, 2)}

This contains actual product data from the mentioned brands including:
- Complete supplement facts with exact ingredient amounts
- Marketing claims and feature bullets
- Performance metrics (reviews, ratings, revenue)

Use this to make specific ingredient-by-ingredient comparisons.
```

---

## Data Flow

```text
Market Trend Analysis
       │
       ├─ Extract brand names from:
       │   - brandRankings[].brandName
       │   - topProducts[].brandProductName
       │
       ▼
Query Products Table
       │
       ├─ Filter by category_id
       ├─ Filter by brand IN (extracted names)
       ├─ Order by monthly_revenue DESC
       │
       ▼
Group by Brand
       │
       ├─ Calculate summary metrics
       ├─ Select top 3 products per brand
       │
       ▼
Send to Grok
       │
       ├─ Existing data (formula brief, market trends, etc.)
       ├─ NEW: top_brands_data with real competitor formulations
       │
       ▼
Enhanced Analysis
       │
       ├─ Direct ingredient comparisons
       ├─ Specific dosage analysis
       ├─ Claim gap identification
       └─ Evidence-based positioning recommendations
```

---

## Expected Benefits

1. **Ingredient-Level Comparisons**: Grok can compare exact sodium/potassium/vitamin dosages between the user's formula and competitors

2. **Claim Analysis**: Identify which marketing claims competitors use that the user's formula could (or couldn't) support

3. **Real Price Positioning**: Use actual competitor prices from the database rather than market trend estimates

4. **Formulation Gaps**: Identify specific ingredients competitors include that the user's formula lacks

5. **Evidence-Based Recommendations**: "Add 100mg more sodium to match Liquid I.V.'s 500mg" rather than generic advice

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/analyze-formula-fit/index.ts` | Add brand extraction, product queries, and enhanced prompts |

---

## Example Output Enhancement

**Before (generic):**
> "Your sodium content is lower than some market leaders"

**After (specific):**
> "Your formula contains 350mg sodium per serving. Liquid I.V. leads with 500mg (22% DV), while LMNT positions as 'high sodium' with 1000mg. For the mainstream hydration market, consider increasing to 450-500mg to match category leaders. However, your lower sodium could differentiate for daily wellness use."

---

## Summary

This enhancement bridges the gap between market-level insights and product-level competitive intelligence. By sending actual competitor formulation data to Grok, the Formula Fit analysis can provide specific, actionable comparisons rather than generic assessments. This aligns with the "AI does the hard labor with raw data" philosophy - we send complete product data and let Grok extract meaningful competitive insights.
