
# Plan: Market Trend Analysis Page with Grok API

## Overview
Create a new "Market Trend" page that provides comprehensive market trend analysis using xAI's Grok API. The analysis runs simultaneously with the existing n8n analysis when the user clicks "Start Analysis" from the New Analysis page.

---

## Technical Architecture

### 1. Database Table
Create a new `market_trend_analyses` table to store analysis results:

```sql
CREATE TABLE market_trend_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL,
  category_name TEXT NOT NULL,
  product_type TEXT,
  analysis JSONB NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies for public read and service role write
```

### 2. Edge Function: `analyze-market-trends`
New Supabase Edge Function that:
- Receives category name and product type
- Calls Grok API (`https://api.x.ai/v1/chat/completions`) with the structured analysis prompt
- Uses background task pattern (EdgeRuntime.waitUntil) to avoid timeouts
- Stores results in `market_trend_analyses` table
- Handles 429/402 rate limit errors gracefully

**Grok API Integration:**
- Endpoint: `https://api.x.ai/v1/chat/completions`
- Model: `grok-3-beta` or `grok-2-latest`
- Authentication: Bearer token via `XAI_API_KEY` secret

### 3. React Hook: `useMarketTrendAnalysis`
Following the existing pattern from `useIngredientAnalysis.ts`:
- Poll for results with 5-second intervals
- Show loading/progress states
- Handle not_available and error states
- Cache results from database

### 4. New Page: `MarketTrend.tsx`
Located at route `/market-trends`, featuring 6 collapsible/tabbed sections:

| Section | Visual Components |
|---------|-------------------|
| Market Overview | Line chart (market growth), stats cards |
| Key Market Trends | Icon list, bar chart (trend popularity) |
| Top Products on Amazon | Sortable table with badges (bestseller, top rated) |
| Competitive Landscape | Bar chart (revenue by brand), ranked list |
| Consumer Insights | Word cloud, tag list |
| Future Outlook | Timeline, pie chart (regional share) |

### 5. Navigation & Routing
- Add route `/market-trends` in `App.tsx`
- Add "Market Trends" to sidebar in `AppSidebar.tsx`
- Page preserves category context like other pages

### 6. Analysis Trigger Integration
Modify `NewAnalysis.tsx` `handleAnalysis` function to:
- Call existing n8n webhook (unchanged)
- **Simultaneously** invoke `analyze-market-trends` edge function
- Both run in parallel, user navigates to Dashboard

---

## File Changes Summary

### New Files
| File | Purpose |
|------|---------|
| `supabase/functions/analyze-market-trends/index.ts` | Edge function for Grok API analysis |
| `src/pages/MarketTrend.tsx` | Main market trend page with 6 sections |
| `src/hooks/useMarketTrendAnalysis.ts` | React hook for data fetching/polling |
| `src/components/market-trends/MarketOverviewSection.tsx` | Section 1: Market size, growth charts |
| `src/components/market-trends/KeyTrendsSection.tsx` | Section 2: Trend list with icons |
| `src/components/market-trends/TopProductsSection.tsx` | Section 3: Product table |
| `src/components/market-trends/CompetitiveLandscapeSection.tsx` | Section 4: Brand rankings |
| `src/components/market-trends/ConsumerInsightsSection.tsx` | Section 5: Use cases, feedback |
| `src/components/market-trends/FutureOutlookSection.tsx` | Section 6: Projections, opportunities |

### Modified Files
| File | Changes |
|------|---------|
| `supabase/config.toml` | Add `[functions.analyze-market-trends]` |
| `src/App.tsx` | Add `/market-trends` route |
| `src/components/layout/AppSidebar.tsx` | Add "Market Trends" nav item |
| `src/pages/NewAnalysis.tsx` | Trigger market trend analysis alongside n8n |

---

## API Secret Required
**XAI_API_KEY** - The user will need to provide their xAI/Grok API key. This will be stored as a Supabase secret and used by the edge function.

---

## Analysis Structure (Stored in JSONB)
The Grok API will return structured JSON matching your provided schema:

```typescript
interface MarketTrendAnalysis {
  sections: {
    marketOverview: {
      globalMarketSize: string;
      usMarketSize: string;
      growthDrivers: string[];
      amazonContext: string;
    };
    keyMarketTrends: {
      trends: Array<{
        trendName: string;
        description: string;
        statistics?: string;
      }>;
    };
    topProducts: {
      products: Array<{
        rank: number;
        brandProductName: string;
        priceUsd: number;
        averageRating: number;
        numberOfReviews: number;
        keyFeatures: string;
        notableTrendsFromReviews: string;
      }>;
      summaryInsights: string;
    };
    competitiveLandscape: {
      brandRankings: Array<{
        brandName: string;
        amazonRevenue: number;
        yoyChange: number;
        strengths: string;
      }>;
      marketShareInsights: string;
    };
    consumerInsights: {
      useCases: string[];
      praisesComplaints: string;
      preferredAttributes: string[];
      emergingBehaviors: string;
    };
    futureOutlook: {
      projectedCagr: string;
      timeframe: string;
      growthRegions: string[];
      innovations: string;
      opportunities: string;
      externalFactors: string;
    };
  };
  citations: Array<{ url: string; title: string }>;
  generatedAt: string;
}
```

---

## UI/UX Details

### Page Layout
- Hero header with category name and analysis timestamp
- Tab-based or accordion navigation for 6 sections
- Each section expands to show detailed content with visualizations
- Loading skeleton while analysis is in progress
- "Refresh Analysis" button to re-run

### Visual Components
- Recharts for line/bar/pie charts (already installed)
- Badge components for bestseller/top-rated indicators
- Sortable tables using existing Table component
- Collapsible sections using Accordion component

---

## Implementation Order
1. Add XAI_API_KEY secret (will prompt user)
2. Create database migration for `market_trend_analyses` table
3. Create edge function `analyze-market-trends`
4. Create React hook `useMarketTrendAnalysis`
5. Create page components (MarketTrend.tsx + section components)
6. Update routing and navigation
7. Modify NewAnalysis.tsx to trigger parallel analysis
8. Test end-to-end flow
