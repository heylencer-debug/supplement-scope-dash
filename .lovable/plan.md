

# Formula vs Market Trends Competitive Analysis

## Overview
Add a new feature to the Market Trends page that provides an honest, AI-powered analysis of how the user's formula brief competes against current market trends, consumer demands, and competitive landscape data.

---

## Feature Design

### User Experience Flow
1. User views Market Trends page with completed analysis
2. A new "Formula Fit" tab appears in the tab navigation
3. Tab displays a comprehensive competitive analysis comparing their formula against market data
4. Analysis is generated via Grok AI with full access to both the formula brief AND market trend data
5. Includes honest assessments of strengths, weaknesses, and gaps

### Visual Components for "Formula Fit" Tab

**1. Formula Readiness Score Card**
- Large radial gauge showing overall "Market Fit Score" (0-100)
- Color-coded: Green (80+), Yellow (50-79), Red (<50)
- Brief tagline: "Strong contender" / "Needs improvement" / "Major gaps"

**2. Strengths & Weaknesses Grid**
- Two-column layout with green (Strengths) and red (Weaknesses)
- Each item shows specific aspect and why it matters
- Animated entrance on scroll

**3. Trend Alignment Chart**
- Horizontal bar chart comparing formula attributes vs key market trends
- Shows how well the formula addresses each trend
- Uses existing Recharts

**4. Consumer Pain Point Coverage**
- Visual checklist showing consumer pain points from market analysis
- Green check if formula addresses it, red X if gap exists
- Includes AI explanation for each

**5. Competitive Position Matrix**
- Quadrant chart positioning the formula vs competitors
- Axes: Price positioning vs Feature richness
- Based on market data + formula specs

**6. Actionable Recommendations**
- Prioritized list of improvements
- Each recommendation includes effort level (Easy/Medium/Hard)
- Tied to specific market data points

---

## Technical Implementation

### New Edge Function: `analyze-formula-fit`

**Purpose**: Compare formula brief against market trend analysis and provide honest competitive assessment

**Inputs**:
- `categoryId` - To fetch both formula brief AND market trend analysis
- No need to send data from frontend - function fetches everything from database

**Data Fetched by Function**:
1. `formula_briefs` table - Full formula document
2. `market_trend_analyses` table - Complete market analysis
3. `category_analyses.analysis_3_formula_brief` - Extended formula content (if available)

**System Prompt Strategy**:
- Send complete raw data to Grok (following user's "AI does the hard labor" philosophy)
- Request structured JSON output with scores, arrays of strengths/weaknesses
- Prompt for brutal honesty - no marketing fluff

**Output Structure**:
```text
{
  overall_score: number (0-100),
  score_label: string,
  executive_summary: string,
  strengths: [{ aspect: string, explanation: string, market_evidence: string }],
  weaknesses: [{ aspect: string, explanation: string, impact: "high"|"medium"|"low" }],
  trend_alignment: [{ trend_name: string, alignment_score: number, notes: string }],
  pain_point_coverage: [{ pain_point: string, addressed: boolean, how_addressed: string }],
  competitive_position: { price_position: string, feature_position: string, summary: string },
  recommendations: [{ priority: number, action: string, effort: string, expected_impact: string }],
  gaps: [{ gap: string, market_opportunity: string }]
}
```

**API**: Uses existing XAI_API_KEY for Grok (grok-4-1-fast-reasoning model)

### New Hook: `useFormulaFitAnalysis`

**Features**:
- Fetches existing analysis from new table `formula_fit_analyses`
- Triggers new analysis via edge function
- Polling pattern for async generation (similar to useMarketTrendAnalysis)
- Returns typed analysis data

### New Component: `FormulaFitSection`

**Location**: `src/components/market-trends/FormulaFitSection.tsx`

**Sub-components**:
- `FormulaFitScoreCard` - Radial gauge with overall score
- `StrengthsWeaknessesGrid` - Two-column layout
- `TrendAlignmentChart` - Horizontal bar chart (Recharts)
- `PainPointCoverage` - Checklist with status icons
- `RecommendationsList` - Prioritized action items

**Styling**:
- Uses existing medical-tech aesthetic
- ScrollAnimate for entrance animations
- StatCard and AnimatedNumber for metrics
- Consistent with other Market Trends sections

### Database Table: `formula_fit_analyses`

```text
id: uuid (primary key)
category_id: uuid (foreign key to categories)
status: text ('pending' | 'processing' | 'completed' | 'error')
analysis: jsonb (structured analysis result)
error: text (null)
created_at: timestamp
updated_at: timestamp
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `supabase/functions/analyze-formula-fit/index.ts` | Edge function for AI analysis |
| `src/hooks/useFormulaFitAnalysis.ts` | React Query hook for data fetching |
| `src/components/market-trends/FormulaFitSection.tsx` | Main section component |

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/MarketTrend.tsx` | Add new "Formula Fit" tab |
| `supabase/config.toml` | Register new edge function |

---

## Data Flow Diagram

```text
Market Trends Page
       │
       ▼
┌──────────────────┐
│ "Formula Fit" Tab│
└────────┬─────────┘
         │
         ▼
┌────────────────────────────────┐
│ useFormulaFitAnalysis Hook     │
│ - Check for existing analysis  │
│ - Trigger new if needed        │
└────────┬───────────────────────┘
         │
         ▼
┌────────────────────────────────┐
│ analyze-formula-fit Edge Fn    │
│                                │
│ Fetches from DB:               │
│ - formula_briefs (full)        │
│ - market_trend_analyses (full) │
│ - category_analyses (extended) │
│                                │
│ Sends ALL raw data to Grok     │
│ AI does: extraction, scoring,  │
│ comparison, recommendations    │
└────────┬───────────────────────┘
         │
         ▼
┌────────────────────────────────┐
│ formula_fit_analyses Table     │
│ Stores structured JSON result  │
└────────────────────────────────┘
```

---

## Honest Analysis Approach

The AI prompt will explicitly request:
- No sugar-coating - highlight real weaknesses
- Evidence-based assessments - tie every claim to market data
- Actionable gaps - don't just identify problems, suggest solutions
- Competitive context - how does this formula compare to what's selling?
- Consumer alignment - does the formula address what consumers actually want?

Example prompt excerpt:
> "Be brutally honest. The user wants to know if their formula will compete or fail. Reference specific data points from the market analysis. If there are major gaps, say so clearly. If the formula is strong, explain why with evidence."

---

## Summary

This feature bridges the Market Trends analysis with the Formula Brief, providing users with an honest, data-driven assessment of their formula's competitive position. By sending complete raw data to Grok (following the established pattern), the AI can perform deep analysis and provide actionable insights.

