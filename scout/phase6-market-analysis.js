/**
 * phase6-market-analysis.js â€" Market Intelligence (the REAL P6)
 *
 * Single Grok AI call that ingests all product data across the category
 * and produces ONE market intelligence document:
 *   - Category landscape (size, revenue, BSR distribution)
 *   - Formula patterns (ingredient frequency, extract type dominance)
 *   - Pricing tiers and white space
 *   - BSR velocity leaders (rising stars)
 *   - Consumer pain points (aggregated from reviews)
 *   - Market opportunity gaps for DOVIVE
 *
 * Output saved to: market_intelligence table (Supabase DASH) + vault
 *
 * Usage:
 *   node phase6-market-analysis.js --keyword "ashwagandha gummies"
 *   node phase6-market-analysis.js --keyword "ashwagandha gummies" --force
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { resolveCategory } = require('./utils/category-resolver');
const fs = require('fs');
const path = require('path');

const DASH = createClient(
  process.env.DASH_URL || process.env.SUPABASE_URL,
  process.env.DASH_KEY || process.env.SUPABASE_KEY
);

const KEYWORD = process.argv.includes('--keyword')
  ? process.argv[process.argv.indexOf('--keyword') + 1]
  : 'ashwagandha gummies';
const FORCE   = process.argv.includes('--force');

// Dynamic category lookup
async function lookupCategoryId(keyword) {
  const cat = await resolveCategory(DASH, keyword);
  console.log(`  → Resolved category (${cat.method}): "${cat.name}" (${cat.id})`);
  return cat.id;
}

// â"€â"€â"€ xAI Key â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function getOpenRouterKey() {
  return process.env.OPENROUTER_API_KEY || null;
}

const ANALYSIS_MODEL = process.env.ANALYSIS_MODEL || 'anthropic/claude-sonnet-5';

async function callGrokOnce(prompt, maxTokens) {
  const key = getOpenRouterKey();
  if (!key) throw new Error('No OpenRouter key');
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://dovive.com',
      'X-Title': 'DOVIVE Scout P6 Market Analysis',
    },
    body: JSON.stringify({
      model: ANALYSIS_MODEL,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (res.status === 402) {
    console.error(`  ❌ P6 market-analysis OpenRouter credits exhausted — top up at openrouter.ai`);
    throw new Error('[ERROR: credits] OpenRouter credits exhausted (402)');
  }
  const j = await res.json();
  if (j.error) throw new Error(`OpenRouter: ${j.error.message || JSON.stringify(j.error)}`);
  const choice = j.choices?.[0];
  const content = choice?.message?.content || null;
  const finishReason = choice?.finish_reason || 'unknown';
  const reasoningTokens = j.usage?.completion_tokens_details?.reasoning_tokens;
  console.log(`  finish_reason: ${finishReason} | output_chars: ${(content || '').length}${reasoningTokens != null ? ` | reasoning_tokens: ${reasoningTokens}` : ''}`);
  return { content, finishReason };
}

// No blind retry-on-length: the cap itself caused truncation, not transience.
// finish_reason=length WITH substantial content is kept as-is (logged, not
// re-burned); only genuinely empty/near-empty output gets one retry at the
// same (already generous) budget.
async function callGrok(prompt, maxTokens = 64000) {
  let { content, finishReason } = await callGrokOnce(prompt, maxTokens);
  const len = (content || '').length;
  if (finishReason === 'length' && len > 500) {
    console.log(`  [NOTE: output reached token ceiling] — keeping truncated-but-substantial content (${len} chars)`);
    return content;
  }
  if (len < 500) {
    console.log(`  ⚠️  Near-empty response (finish_reason=${finishReason}) — retrying once at same budget...`);
    const retry = await callGrokOnce(prompt, maxTokens);
    if (retry.content && retry.content.length >= 500) return retry.content;
    if (retry.content) {
      console.log(`  ⚠️  Retry still near-empty — keeping whatever content there is, flagging in report.`);
      return retry.content;
    }
    console.log(`  ❌ Retry produced empty content — persisting explicit error marker (never silently null).`);
    return '[ERROR: truncated/empty]';
  }
  return content;
}

// â"€â"€â"€ Data aggregation â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

// ─── Fetch raw reviews for richer consumer signal ─────────────────────────────
async function fetchRawReviews(categoryId) {
  const { data: prods } = await DASH.from('products').select('asin').eq('category_id', categoryId).limit(500);
  if (!prods?.length) return { positive: [], critical: [] };
  const asins = prods.map(p => p.asin);
  const DOVIVE_SB = require('@supabase/supabase-js').createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  const { data: reviews } = await DOVIVE_SB.from('dovive_reviews')
    .select('asin, rating, title, body').in('asin', asins.slice(0, 400))
    .not('body', 'is', null).limit(3000);
  if (!reviews?.length) return { positive: [], critical: [] };
  const positive = reviews.filter(r => r.rating >= 4).sort(() => Math.random() - 0.5).slice(0, 80);
  const critical = reviews.filter(r => r.rating <= 2).sort(() => Math.random() - 0.5).slice(0, 80);
  return { positive, critical };
}

function buildDosageTable(products) {
  const rows = [];
  for (const p of products.slice(0, 60)) {
    const nutrients = p.all_nutrients;
    if (!nutrients || !Array.isArray(nutrients) || !nutrients.length) continue;
    const key = nutrients.slice(0, 15).map(n => `${n.name || n.ingredient || '?'}: ${n.amount || n.quantity || '?'}`).join(' | ');
    rows.push(`${p.brand || '?'} (BSR ${p.bsr_current?.toLocaleString() || '?'}): ${key}`);
  }
  return rows.length ? rows.join('\n') : 'OCR dosage data not yet available';
}

function buildIngredientWhiteSpace(products) {
  const total = products.length;
  const freqMap = {};
  for (const p of products) {
    for (const ing of (p.marketing_analysis?.product_intelligence?.bonus_ingredients || [])) {
      freqMap[ing] = (freqMap[ing] || 0) + 1;
    }
  }
  return Object.entries(freqMap)
    .filter(([, count]) => count / total < 0.15 && count >= 2)
    .sort((a, b) => b[1] - a[1]).slice(0, 30)
    .map(([ing, count]) => `${ing}: ${count} products (${Math.round(count/total*100)}%)`)
    .join('\n') || 'None detected';
}

function buildServingSizeNorm(products) {
  const map = {};
  for (const p of products) {
    const ss = (p.serving_size || '').toString().toLowerCase().trim();
    if (!ss) continue;
    map[ss] = (map[ss] || 0) + 1;
  }
  return Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,8)
    .map(([ss, count]) => `"${ss}": ${count} products`).join('\n') || 'No serving size data';
}

function pct(count, total) {
  return total ? `${Math.round(count / total * 100)}%` : '0%';
}

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function avg(arr) {
  return arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
}

function buildMarketContext(products) {
  const total = products.length;
  const withRevenue = products.filter(p => p.monthly_revenue > 0);
  const totalRevenue = withRevenue.reduce((s, p) => s + (p.monthly_revenue || 0), 0);
  const prices = products.map(p => parseFloat(p.price || 0)).filter(Boolean);
  const bsrs = products.map(p => p.bsr_current).filter(Boolean);
  const ratings = products.map(p => p.rating_value).filter(Boolean);
  const reviewCounts = products.map(p => p.rating_count).filter(Boolean);

  // â"€â"€ Formula extraction from per-product PI data â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const extractTypeCounts = {};
  const certCounts = {};
  const bonusCounts = {};
  const formScores = [];
  const threats = { 'Very High': 0, 'High': 0, 'Medium': 0, 'Low': 0 };
  const velocities = { rocket: 0, rising: 0, stable: 0, falling: 0, sinking: 0, unknown: 0 };
  const priceTiers = { premium: 0, above_average: 0, mid_market: 0, value: 0, budget: 0, unknown: 0 };
  const opportunityGaps = [];
  const ashwagandhaAmounts = [];

  for (const p of products) {
    const pi = p.marketing_analysis?.product_intelligence || {};
    const et = pi.ashwagandha_extract_type || 'Unknown';
    extractTypeCounts[et] = (extractTypeCounts[et] || 0) + 1;
    for (const c of (pi.certifications || [])) certCounts[c] = (certCounts[c] || 0) + 1;
    for (const b of (pi.bonus_ingredients || [])) bonusCounts[b] = (bonusCounts[b] || 0) + 1;
    if (pi.formula_quality_score) formScores.push(pi.formula_quality_score);
    if (pi.competitor_threat_level) threats[pi.competitor_threat_level] = (threats[pi.competitor_threat_level] || 0) + 1;
    if (pi.velocity_direction) velocities[pi.velocity_direction] = (velocities[pi.velocity_direction] || 0) + 1;
    if (pi.price_positioning_tier) priceTiers[pi.price_positioning_tier] = (priceTiers[pi.price_positioning_tier] || 0) + 1;
    if (pi.market_opportunity_gap) opportunityGaps.push(pi.market_opportunity_gap);
    if (pi.ashwagandha_amount_mg) ashwagandhaAmounts.push(pi.ashwagandha_amount_mg);
  }

  // Sort top ingredients
  const topBonusIngredients = Object.entries(bonusCounts)
    .sort((a, b) => b[1] - a[1]).slice(0, 40)
    .map(([name, count]) => `${name}: ${count} products (${pct(count, total)})`);

  const topCerts = Object.entries(certCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `${name}: ${count} (${pct(count, total)})`);

  const extractDist = Object.entries(extractTypeCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `${type}: ${count} (${pct(count, total)})`);

  // â"€â"€ Top performers (BSR < 5000 with data) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const topPerformers = products
    .filter(p => p.bsr_current && p.bsr_current < 8000)
    .sort((a, b) => a.bsr_current - b.bsr_current)
    .slice(0, 40)
    .map(p => {
      const pi = p.marketing_analysis?.product_intelligence || {};
      return `  - ${p.brand || 'Unknown'} | BSR ${p.bsr_current?.toLocaleString()} | $${p.price} | Rev $${(p.monthly_revenue||0).toLocaleString()}/mo | ${pi.ashwagandha_extract_type || 'Unknown'} ${pi.ashwagandha_amount_mg ? pi.ashwagandha_amount_mg + 'mg' : ''} | Score ${pi.formula_quality_score || '?'}/10 | ${(pi.certifications||[]).join(', ')||'No certs'} | Bonus: ${(pi.bonus_ingredients||[]).slice(0,8).join(', ')||'None'}`;
    }).join('\n');

  // â"€â"€ Rising stars (positive BSR velocity) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const risingStars = products
    .filter(p => {
      const pi = p.marketing_analysis?.product_intelligence || {};
      return pi.velocity_direction === 'rocket' || pi.velocity_direction === 'rising';
    })
    .sort((a, b) => {
      const va = a.marketing_analysis?.product_intelligence?.velocity_score || 0;
      const vb = b.marketing_analysis?.product_intelligence?.velocity_score || 0;
      return vb - va;
    })
    .slice(0, 25)
    .map(p => {
      const pi = p.marketing_analysis?.product_intelligence || {};
      return `  - ${p.brand || '?'} | BSR ${p.bsr_current?.toLocaleString()} | ${pi.bsr_trend_label} | $${p.price} | ${pi.ashwagandha_extract_type} | Bonus: ${(pi.bonus_ingredients||[]).slice(0,8).join(', ')||'None'}`;
    }).join('\n');

  // â"€â"€ Consumer pain points from reviews â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const painPoints = [];
  for (const p of products) {
    const ra = p.review_analysis;
    if (!ra) continue;
    const raw = typeof ra === 'string' ? ra : JSON.stringify(ra);
    if (raw.length > 50) painPoints.push(raw.substring(0, 1500));
  }

  // â"€â"€ Price distribution â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const priceRanges = { under15: 0, '15to20': 0, '20to25': 0, '25to30': 0, over30: 0 };
  for (const p of prices) {
    if (p < 15) priceRanges.under15++;
    else if (p < 20) priceRanges['15to20']++;
    else if (p < 25) priceRanges['20to25']++;
    else if (p < 30) priceRanges['25to30']++;
    else priceRanges.over30++;
  }

  return {
    summary: {
      total_products: total,
      total_monthly_revenue: `$${totalRevenue.toLocaleString()}`,
      median_price: `$${median(prices).toFixed(2)}`,
      avg_price: `$${avg(prices).toFixed(2)}`,
      median_bsr: median(bsrs).toLocaleString(),
      avg_rating: (ratings.reduce((a,b)=>a+b,0)/ratings.length).toFixed(1),
      avg_reviews: avg(reviewCounts).toLocaleString(),
      avg_formula_score: formScores.length ? (formScores.reduce((a,b)=>a+b,0)/formScores.length).toFixed(1) : 'N/A',
      avg_ashwagandha_mg: ashwagandhaAmounts.length ? avg(ashwagandhaAmounts) : 'N/A',
    },
    extractDist,
    topCerts,
    topBonusIngredients,
    threats,
    velocities,
    priceTiers,
    priceRanges,
    topPerformers,
    risingStars,
    opportunityGaps: opportunityGaps.slice(0, 60),
    painPointsSample: painPoints.slice(0, 50),
    reviewCoverage: `${products.filter(p => p.review_analysis).length}/${total}`,
    dosageTable: buildDosageTable(products),
    ingredientWhiteSpace: buildIngredientWhiteSpace(products),
    servingSizeNorm: buildServingSizeNorm(products),
  };
}

// â"€â"€â"€ Build Grok prompt â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function buildPrompt(ctx, keyword, rawReviews) {
  const s = ctx.summary;
  const positiveReviewSample = (rawReviews?.positive || []).slice(0, 60)
    .map(r => `[★${r.rating}] "${r.title || ''}" — ${(r.body || '').slice(0, 800)}`).join('\n');
  const criticalReviewSample = (rawReviews?.critical || []).slice(0, 60)
    .map(r => `[★${r.rating}] "${r.title || ''}" — ${(r.body || '').slice(0, 800)}`).join('\n');

  return `You are a senior market intelligence analyst for DOVIVE, a supplement brand entering the ${keyword} market on Amazon US. Your job is to produce a comprehensive, CMO-ready market intelligence report that will directly inform product formulation and go-to-market strategy.

Ground every claim in the MARKET DATA provided below — do not invent statistics, trends, or consumer sentiment that isn't supported by this data. If a section's underlying data is thin or missing (e.g. no reviews, no OCR dosage data), say so explicitly rather than writing generic supplement-market boilerplate to fill the gap.

## MARKET DATA — ${keyword.toUpperCase()} (Amazon US)

### Category Overview
- Total products analyzed: ${s.total_products}
- Total category monthly revenue: ${s.total_monthly_revenue}
- Median BSR: ${s.median_bsr}
- Avg price: ${s.avg_price} | Median: ${s.median_price}
- Avg rating: ${s.avg_rating} stars | Avg reviews: ${s.avg_reviews}
- Avg formula quality score: ${s.avg_formula_score}/10

### Primary Ingredient Extract Type Distribution
${ctx.extractDist.join('\n')}

### Certification Frequency
${ctx.topCerts.join('\n')}

### Bonus Ingredients (frequency across category)
${ctx.topBonusIngredients.join('\n')}

### Ingredient White Space (present in <15% of products — differentiation opportunities)
${ctx.ingredientWhiteSpace}

### Serving Size Distribution
${ctx.servingSizeNorm}

### Competitor Dosage Comparison (from OCR supplement facts)
${ctx.dosageTable}

### Raw Customer Reviews — POSITIVE (Voice of Customer)
${positiveReviewSample || 'No positive reviews found in the database for this category.'}

### Raw Customer Reviews — CRITICAL (Pain Points)
${criticalReviewSample || 'No critical reviews found in the database for this category.'}

### Price Range Distribution
<$15: ${ctx.priceRanges.under15} | $15-20: ${ctx.priceRanges['15to20']} | $20-25: ${ctx.priceRanges['20to25']} | $25-30: ${ctx.priceRanges['25to30']} | >$30: ${ctx.priceRanges.over30}

### Price Positioning Tiers
Premium (â‰¥150% median): ${ctx.priceTiers.premium} | Above Avg: ${ctx.priceTiers.above_average} | Mid-Market: ${ctx.priceTiers.mid_market} | Value: ${ctx.priceTiers.value} | Budget: ${ctx.priceTiers.budget}

### Competitor Threat Levels
Very High: ${ctx.threats['Very High']} | High: ${ctx.threats.High} | Medium: ${ctx.threats.Medium} | Low: ${ctx.threats.Low}

### BSR Velocity (30d/90d momentum)
Surging ðŸš€: ${ctx.velocities.rocket} | Rising ðŸ"ˆ: ${ctx.velocities.rising} | Stable âž¡ï¸: ${ctx.velocities.stable} | Slipping ðŸ"‰: ${ctx.velocities.falling} | Declining ðŸ'§: ${ctx.velocities.sinking}

### Top Performers by BSR (BSR rank, price, revenue, formula)
${ctx.topPerformers}

### Rising Stars (strongest positive BSR momentum)
${ctx.risingStars || 'None detected'}

### Market Opportunity Gaps (AI-detected per product)
${ctx.opportunityGaps.slice(0, 40).map((g, i) => `${i+1}. ${g}`).join('\n')}

### Consumer Pain Points (from review analysis, ${ctx.reviewCoverage} products)
${ctx.painPointsSample.slice(0, 40).map((p, i) => `${i+1}. ${p.substring(0, 1200)}`).join('\n\n')}

---

## YOUR DELIVERABLE

Produce a full market intelligence report in markdown. Use this exact structure:

# ${keyword.toUpperCase()} â€" MARKET INTELLIGENCE REPORT

## 1. EXECUTIVE SUMMARY
3-5 sentences: total market size, revenue concentration, who's winning and why.

## 2. CATEGORY LANDSCAPE
Who dominates? BSR leaders and their moats (brand, formula, price, trust signals).
What is the typical product in this category? (extract type, dose, certs, price)

## 3. FORMULA ANALYSIS
- What extract types dominate and what % of the market does each hold?
- What is the average/median ashwagandha dose? Is it clinically meaningful?
- What bonus ingredients are trending vs declining?
- What formula patterns correlate with low BSR (high rank)?
- What certifications matter most to consumers?

## 4. PRICING INTELLIGENCE
- Where is the price concentration? (Which tier has most products and most revenue)
- What pricing white space exists? (Under-served price points)
- Price vs formula quality correlation â€" are premium products actually better?
- Recommended price positioning for DOVIVE

## 5. MARKET MOMENTUM
- Which products are surging and WHY (formula, price, or brand factor)?
- Which established players are declining? Why?
- What does the velocity data tell us about where the market is heading?

## 6. CONSUMER DEMAND SIGNALS
- Top pain points customers have with current products
- What are buyers asking for but not finding?
- Taste, dose, value, trust â€" rank the priorities
- Unmet needs = DOVIVE opportunity

## 7. COMPETITIVE WHITE SPACE
- What formula approach is completely absent from the market?
- What price tier has high demand but low quality supply?
- What ingredient combinations could create a new category leader?
- Where can DOVIVE win without fighting for BSR 1?

## 8. MARKET RISKS & WATCH-OUTS
- Saturated segments to avoid
- Ingredients that are over-used and now expected (table stakes)
- Pricing traps
- Trust signal requirements (what certs you MUST have)

## 9. DOVIVE STRATEGIC RECOMMENDATION
Based on all the above data, give a clear, direct recommendation:
- Target BSR range
- Recommended price point and why
- Must-have formula elements (non-negotiables)
- Differentiators that can win market share
- Positioning statement vs #1 BSR player

Be specific, data-driven, and direct. This report feeds directly into the formula brief for our contract manufacturer.`;
}

// â"€â"€â"€ Save to Supabase â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

async function saveToSupabase(categoryId, keyword, report, ctx) {
  const marketPayload = {
    ai_market_analysis: report,
    generated_at: new Date().toISOString(),
    grok_model: ANALYSIS_MODEL,
    products_analyzed: ctx.summary.total_products,
    review_coverage: ctx.reviewCoverage,
  };

  // Patch into existing formula_briefs record (add market_intelligence key, keep formula brief intact)
  const { data: existing } = await DASH.from('formula_briefs')
    .select('id, ingredients')
    .eq('category_id', categoryId)
    .maybeSingle();

  if (existing) {
    const updated = { ...(existing.ingredients || {}), market_intelligence: marketPayload };
    const { error } = await DASH.from('formula_briefs').update({ ingredients: updated }).eq('category_id', categoryId);
    if (error) throw new Error(`Patch failed: ${error.message}`);
    return 'formula_briefs.ingredients.market_intelligence';
  } else {
    // No category_name column in formula_briefs - omit it
    const { error } = await DASH.from('formula_briefs').insert({
      category_id: categoryId,
      ingredients: { market_intelligence: marketPayload },
      updated_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });
    if (error) throw new Error(`Insert failed: ${error.message}`);
    return 'formula_briefs (new record)';
  }
}

// â"€â"€â"€ Save to vault â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function saveToVault(keyword, report) {
  const date = new Date().toISOString().split('T')[0];
  const slug = keyword.replace(/\s+/g, '-').toLowerCase();
  const vaultDir = 'C:\\SirPercival-Vault\\07_ai-systems\\agents\\scout\\market-intelligence';
  const vaultPath = path.join(vaultDir, `${date}-${slug}-market-intelligence.md`);
  if (!fs.existsSync(vaultDir)) fs.mkdirSync(vaultDir, { recursive: true });
  fs.writeFileSync(vaultPath, `# Market Intelligence â€" ${keyword}\nGenerated: ${new Date().toISOString()}\n\n${report}`);
  return vaultPath;
}

// â"€â"€â"€ Main â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

async function run() {
  console.log(`\n${'â•'.repeat(62)}`);
  console.log(`P6: MARKET INTELLIGENCE â€" "${KEYWORD}"`);
  console.log(`${'â•'.repeat(62)}\n`);

  // Resolve category dynamically
  const CAT_ID = await lookupCategoryId(KEYWORD);

  // Check for existing (skip unless --force)
  if (!FORCE) {
    const { data: existing } = await DASH.from('formula_briefs')
      .select('id, created_at').eq('category_id', CAT_ID).eq('brief_type', 'market_analysis').limit(1);
    if (existing?.length) {
      console.log(`✅ Market intelligence already exists (${existing[0].created_at}). Use --force to regenerate.`);
      process.exit(0);
    }
  }

  // Fetch all products with all enriched data
  console.log(`Fetching all products...`);
  const { data: products, error } = await DASH.from('products')
    .select(`asin, brand, title, bsr_current, bsr_30_days_avg, bsr_90_days_avg,
             price, monthly_revenue, monthly_sales, rating_value, rating_count,
             supplement_facts_raw, feature_bullets_text, claims_on_label,
             review_analysis, marketing_analysis, serving_size, servings_per_container`)
    .eq('category_id', CAT_ID)
    .order('bsr_current', { ascending: true, nullsFirst: false });
  if (error) throw error;
  console.log(`  ${products.length} products loaded\n`);

  // Aggregate market context
  console.log(`Aggregating market data...`);
  const ctx = buildMarketContext(products);
  console.log(`  âœ… Summary built`);
  console.log(`  Revenue: ${ctx.summary.total_monthly_revenue} | Median BSR: ${ctx.summary.median_bsr}`);
  console.log(`  Extract distribution: ${ctx.extractDist.slice(0, 3).join(' | ')}`);
  console.log(`  Top bonus ingredient: ${ctx.topBonusIngredients[0] || 'None'}`);
  console.log(`  Rising stars: ${ctx.velocities.rocket + ctx.velocities.rising} products\n`);

  // Fetch raw reviews for real consumer-voice grounding
  console.log(`Fetching raw reviews...`);
  const rawReviews = await fetchRawReviews(CAT_ID);
  console.log(`  ${rawReviews.positive.length} positive / ${rawReviews.critical.length} critical reviews loaded\n`);

  // Build prompt
  const prompt = buildPrompt(ctx, KEYWORD, rawReviews);
  console.log(`Calling ${ANALYSIS_MODEL} via OpenRouter... prompt: ${Math.round(prompt.length / 1000)}k chars`);
  const startTime = Date.now();
  const report = await callGrok(prompt, 64000);
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(`  âœ… Done (${elapsed}s, ${Math.round(report.length / 1000)}k chars output)\n`);

  // Save
  console.log(`Saving to Supabase...`);
  const table = await saveToSupabase(CAT_ID, KEYWORD, report, ctx);
  console.log(`  âœ… Saved to ${table}\n`);

  console.log(`Saving to vault...`);
  const vaultPath = saveToVault(KEYWORD, report);
  console.log(`  âœ… ${vaultPath}\n`);

  // Preview
  console.log(`â•â•â• PREVIEW (first 600 chars) â•â•â•`);
  console.log(report.substring(0, 600));
  console.log(`\nâœ… Market Intelligence complete â€" ${Math.round(report.length / 1000)}k chars`);
}

run().catch(e => { console.error('\nâŒ FAILED:', e.message); process.exit(1); });
