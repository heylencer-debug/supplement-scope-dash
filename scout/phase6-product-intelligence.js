/**
 * phase6-product-intelligence.js - v2 (Market Trends Edition)
 * P6: AI-powered product intelligence via Claude (OpenRouter)
 *
 * Per-product data sent to the model:
 *  - OCR supplement facts, title, claims, feature bullets
 *  - BSR current + 30d avg + 90d avg → pre-computed velocity
 *  - Price, servings → pre-computed price_per_serving
 *  - Monthly revenue, review count → pre-computed revenue/review ratio
 *  - Price vs category median → pre-computed price_positioning_tier
 *
 * Model returns: extract type, dose, certs, bonus ingredients,
 *               formula score, threat level, strengths, weaknesses
 * We merge the model's output with locally-computed market metrics.
 *
 * Usage:
 *   node phase6-product-intelligence.js              # skip already done
 *   node phase6-product-intelligence.js --force      # re-analyze all
 *   node phase6-product-intelligence.js --top 20     # first N by BSR
 *   node phase6-product-intelligence.js --batch 5    # batch size (default 5)
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

// DOVIVE client — raw reviews live in dovive_reviews (DOVIVE Supabase), same
// pattern as phase5-deep-research.js/phase6-market-analysis.js.
const DOVIVE = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// 2026-08-28 FIX (audit item #6): P6a scored products on catalog data alone —
// zero review signal reached key_strengths/key_weaknesses/market_opportunity_gap.
// Fetches a small (5 pos + 5 crit by helpfulness) review slice per ASIN, cheap
// and batch-scoped. Never throws — returns {} on failure so the batch still runs.
async function fetchReviewSentimentMap(asins) {
  if (!asins.length) return {};
  try {
    const { data } = await DOVIVE.from('dovive_reviews')
      .select('asin, rating, title, body, helpful_votes')
      .in('asin', asins)
      .order('helpful_votes', { ascending: false })
      .limit(asins.length * 20);
    const map = {};
    for (const asin of asins) map[asin] = { positive: [], critical: [] };
    for (const r of (data || [])) {
      const bucket = map[r.asin];
      if (!bucket) continue;
      if (r.rating >= 4 && bucket.positive.length < 5) bucket.positive.push(r);
      else if (r.rating <= 2 && bucket.critical.length < 5) bucket.critical.push(r);
    }
    return map;
  } catch (e) {
    console.warn('  ⚠️ Review sentiment fetch failed (non-fatal):', e.message);
    return {};
  }
}

function formatReviewSentiment(bucket) {
  if (!bucket || (!bucket.positive.length && !bucket.critical.length)) return 'No reviews available.';
  const fmt = r => `[${r.rating}★] "${(r.title || '').slice(0, 80)}" — ${(r.body || '').slice(0, 250)}`;
  const parts = [];
  if (bucket.positive.length) parts.push(`Positive: ${bucket.positive.map(fmt).join(' | ')}`);
  if (bucket.critical.length) parts.push(`Critical: ${bucket.critical.map(fmt).join(' | ')}`);
  return parts.join('\n');
}

const KEYWORD    = process.argv.includes('--keyword') ? process.argv[process.argv.indexOf('--keyword') + 1] : 'ashwagandha gummies';
const TOP_N      = process.argv.includes('--top')   ? parseInt(process.argv[process.argv.indexOf('--top')   + 1]) : 999;
const FORCE      = process.argv.includes('--force');
const BATCH_SIZE = process.argv.includes('--batch') ? parseInt(process.argv[process.argv.indexOf('--batch') + 1]) : 5;

// Dynamic category lookup
async function lookupCategoryId(keyword) {
  const cat = await resolveCategory(DASH, keyword);
  console.log(`  → Resolved category (${cat.method}): "${cat.name}" (${cat.id})`);
  return cat.id;
}

// ─── OpenRouter Key ──────────────────────────────────────────────────────────

function getOpenRouterKey() {
  return process.env.OPENROUTER_API_KEY || null;
}

// Analysis model — configurable without a rebuild. Default: Claude Sonnet 5 via OpenRouter.
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
      'X-Title': 'DOVIVE Scout P6 Product Intelligence',
    },
    body: JSON.stringify({
      model: ANALYSIS_MODEL,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (res.status === 402) {
    console.error(`  ❌ P6 OpenRouter credits exhausted — top up at openrouter.ai`);
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

// No blind retry-on-length: caps caused the truncations, not transience.
// finish_reason=length WITH substantial content is kept (logged, not retried);
// only genuinely empty/near-empty output gets one retry at the same budget.
async function callGrok(prompt, maxTokens = 64000) {
  let { content, finishReason } = await callGrokOnce(prompt, maxTokens);
  const len = (content || '').length;
  if (finishReason === 'length' && len > 500) {
    console.log(`  [NOTE: output reached token ceiling] — keeping truncated-but-substantial content (${len} chars)`);
  } else if (len < 500) {
    console.log(`  ⚠️  Near-empty output (finish_reason=${finishReason}) — retrying once at same budget...`);
    const retry = await callGrokOnce(prompt, maxTokens);
    if (retry.content) content = retry.content;
  }
  // Never silently coerce to null; caller throws on empty ('Empty AI response'), which
  // is the correct never-silent behavior since this is a batched multi-product JSON array.
  return content;
}

// ─── Market Metrics (computed locally, no AI needed) ──────────────────────────

/**
 * BSR Velocity:
 *   Compares current BSR vs 30d and 90d averages.
 *   Lower BSR = better rank. A falling BSR number means the product is RISING.
 *   velocity_score: positive = climbing, negative = falling, 0 = stable
 */
function computeBSRVelocity(bsrCurrent, bsr30d, bsr90d) {
  if (!bsrCurrent) return { velocity_direction: 'unknown', velocity_score: 0, bsr_trend_label: 'No Data' };

  const vs30d = bsr30d  ? Math.round(((bsr30d  - bsrCurrent) / bsr30d)  * 100) : 0; // positive = climbing (BSR improved)
  const vs90d = bsr90d  ? Math.round(((bsr90d  - bsrCurrent) / bsr90d)  * 100) : 0;
  const score = Math.round((vs30d * 0.6) + (vs90d * 0.4));

  let direction, label;
  if (score >= 20)      { direction = 'rocket';   label = '🚀 Surging (+' + score + '%)'; }
  else if (score >= 8)  { direction = 'rising';   label = '📈 Rising (+' + score + '%)'; }
  else if (score >= -8) { direction = 'stable';   label = '➡️ Stable';  }
  else if (score >= -20){ direction = 'falling';  label = '📉 Slipping (' + score + '%)'; }
  else                  { direction = 'sinking';  label = '💧 Declining (' + score + '%)'; }

  return {
    velocity_direction: direction,
    velocity_score: score,
    bsr_trend_label: label,
    bsr_vs_30d_pct: vs30d,
    bsr_vs_90d_pct: vs90d,
  };
}

/**
 * Price Positioning Tier:
 *   Segments product relative to category median price.
 */
function computePriceTier(price, medianPrice) {
  if (!price || !medianPrice) return 'unknown';
  const ratio = price / medianPrice;
  if (ratio >= 1.5)      return 'premium';       // ≥150% of median
  else if (ratio >= 1.15) return 'above_average'; // 115-150%
  else if (ratio >= 0.85) return 'mid_market';    // 85-115% (sweet spot)
  else if (ratio >= 0.60) return 'value';         // 60-85%
  else                    return 'budget';         // <60%
}

const TIER_LABELS = {
  premium:       '💎 Premium',
  above_average: '🔵 Above Avg',
  mid_market:    '🟢 Mid-Market',
  value:         '🟡 Value',
  budget:        '🔴 Budget',
  unknown:       '- Unknown',
};

/**
 * Revenue per Review (efficiency ratio):
 *   High ratio = product earns strong revenue with few reviews (formula/positioning working).
 *   Low ratio = lots of social proof but weak conversion/pricing.
 */
function computeRevenuePerReview(monthlyRevenue, reviewCount) {
  if (!monthlyRevenue || !reviewCount || reviewCount === 0) return null;
  return Math.round(monthlyRevenue / reviewCount);
}

function revenuePerReviewLabel(rpr) {
  if (!rpr) return 'No Data';
  if (rpr >= 1000) return '🔥 High Efficiency (≥$1k/review)';
  if (rpr >= 500)  return '✅ Good ($500+/review)';
  if (rpr >= 200)  return '🟡 Average ($200+/review)';
  return '🔴 Low (<$200/review)';
}

// ─── Generic primary active detection helpers ─────────────────────────────────

function detectPrimaryActive(facts) {
  if (!facts) return 'Unknown';
  const f = facts.toLowerCase();
  if (f.includes('vitamin c') || f.includes('ascorbic acid')) return 'Vitamin C';
  if (f.includes('collagen')) return 'Collagen Peptides';
  if (f.includes('magnesium')) return 'Magnesium';
  if (f.includes('melatonin')) return 'Melatonin';
  if (f.includes('creatine')) return 'Creatine';
  if (f.includes('elderberry') || f.includes('sambucus')) return 'Elderberry Extract';
  if (f.includes('ashwagandha') || f.includes('withania')) return 'Ashwagandha';
  if (f.includes('vitamin d3') || f.includes('cholecalciferol')) return 'Vitamin D3';
  if (f.includes('biotin')) return 'Biotin';
  if (f.includes('zinc')) return 'Zinc';
  if (f.includes('iron')) return 'Iron';
  if (f.includes('b12') || f.includes('cobalamin')) return 'Vitamin B12';
  if (f.includes('berberine')) return 'Berberine';
  if (f.includes("lion's mane") || f.includes('hericium')) return "Lion's Mane";
  if (f.includes('turmeric') || f.includes('curcumin')) return 'Turmeric/Curcumin';
  return 'Unknown';
}

function detectPrimaryActiveMg(facts) {
  if (!facts) return null;
  // Try to extract the first numeric mg/mcg value from supplement facts
  const patterns = [
    /(\d+(?:,\d+)?(?:\.\d+)?)\s*mg/i,
    /(\d+(?:\.\d+)?)\s*mcg/i,
    /(\d+(?:\.\d+)?)\s*iu/i,
  ];
  for (const p of patterns) {
    const m = facts.match(p);
    if (m) return parseFloat(m[1].replace(',', ''));
  }
  return null;
}

function detectPrimaryForm(facts) {
  if (!facts) return 'Unknown';
  const f = facts.toLowerCase();
  if (f.includes('liposomal')) return 'Liposomal';
  if (f.includes('hydrolyzed collagen')) return 'Hydrolyzed Collagen';
  if (f.includes('collagen peptide')) return 'Collagen Peptides';
  if (f.includes('magnesium glycinate')) return 'Magnesium Glycinate';
  if (f.includes('magnesium citrate')) return 'Magnesium Citrate';
  if (f.includes('creatine monohydrate')) return 'Creatine Monohydrate';
  if (f.includes('ksm-66')) return 'KSM-66';
  if (f.includes('sensoril')) return 'Sensoril';
  if (f.includes('shoden')) return 'Shoden';
  if (f.includes('methylcobalamin')) return 'Methylcobalamin';
  if (f.includes('cyanocobalamin')) return 'Cyanocobalamin';
  if (f.includes('ascorbic acid')) return 'Ascorbic Acid';
  if (f.includes('cholecalciferol')) return 'Cholecalciferol (D3)';
  return 'Unknown';
}

// ─── Rule-based fallback ──────────────────────────────────────────────────────

function extractAmountRule(facts) {
  if (!facts) return null;
  const patterns = [
    /(?:ashwagandha|ksm-66|sensoril|shoden|withania)[^0-9\n]{0,40}(\d+(?:\.\d+)?)\s*mg/i,
    /(\d+(?:\.\d+)?)\s*mg[^,\n]{0,20}ashwagandha/i,
  ];
  for (const p of patterns) { const m = facts.match(p); if (m) return parseFloat(m[1]); }
  return null;
}

function extractTypeRule(facts) {
  if (!facts) return 'Unknown';
  const f = facts.toLowerCase();
  if (f.includes('ksm-66')) return 'KSM-66';
  if (f.includes('sensoril')) return 'Sensoril';
  if (f.includes('shoden')) return 'Shoden';
  if (f.includes('10:1 extract')) return '10:1 Extract';
  if (f.includes('organic extract') || f.includes('root extract')) return 'Organic Extract';
  if (f.includes('extract')) return 'Generic Extract';
  if (f.includes('root powder')) return 'Root Powder';
  return 'Unknown';
}

function detectCertsRule(facts, title) {
  const text = ((facts || '') + ' ' + (title || '')).toLowerCase();
  const certs = [];
  if (text.includes('nsf')) certs.push('NSF Certified');
  if (text.includes('usp verified') || text.includes('usp certified')) certs.push('USP Verified');
  if (text.includes('cgmp') || text.includes('gmp certified')) certs.push('cGMP');
  if (text.includes('third-party tested') || text.includes('3rd party tested')) certs.push('3rd Party Tested');
  if (text.includes('non-gmo') || text.includes('non gmo')) certs.push('Non-GMO');
  if (text.includes('vegan') && !text.includes('non-vegan')) certs.push('Vegan');
  if (text.includes('gluten-free') || text.includes('gluten free')) certs.push('Gluten-Free');
  if (text.includes('sugar-free') || text.includes('sugar free') || text.includes('no added sugar')) certs.push('Sugar-Free');
  if (text.includes('organic')) certs.push('Organic');
  return certs;
}

function detectBonusRule(facts) {
  if (!facts) return [];
  const f = facts.toLowerCase();
  const checks = [
    ['Black Pepper / BioPerine', ['black pepper', 'bioperine', 'piper nigrum']],
    ['Vitamin D3', ['vitamin d3', 'cholecalciferol']],
    ['Vitamin B12', ['vitamin b12', 'cyanocobalamin', 'methylcobalamin']],
    ['Vitamin C', ['vitamin c', 'ascorbic acid']],
    ['Zinc', ['zinc']], ['Magnesium', ['magnesium']], ['Melatonin', ['melatonin']],
    ['L-Theanine', ['l-theanine', 'theanine']], ['Rhodiola', ['rhodiola']],
    ['Turmeric', ['turmeric', 'curcumin']], ['Lemon Balm', ['lemon balm']],
    ['GABA', ['gaba']], ['5-HTP', ['5-htp', '5htp']],
    ['Elderberry', ['elderberry', 'sambucus']], ['Ginseng', ['ginseng']],
    ['Sea Moss', ['sea moss', 'irish moss']], ['Lion\'s Mane', ['lion\'s mane']],
    ['Saffron', ['saffron', 'crocus sativus']], ['Reishi', ['reishi', 'ganoderma']],
    ['Bacopa', ['bacopa', 'brahmi']], ['Passionflower', ['passionflower']],
  ];
  return checks.filter(([,terms]) => terms.some(t => f.includes(t))).map(([name]) => name);
}

function ruleBasedAnalysis(product, marketMetrics) {
  const facts = product.supplement_facts_raw || '';
  const title = product.title || '';
  const price = parseFloat(product.price || 0);
  const servings = product.servings_per_container;
  const ashwagandhaAmt = extractAmountRule(facts);
  const extractType = extractTypeRule(facts);
  const certs = detectCertsRule(facts, title);
  const bonus = detectBonusRule(facts);
  const isThirdParty = certs.some(c => ['3rd Party Tested','NSF Certified','USP Verified','Informed Sport'].includes(c));
  const pricePerServing = (price && servings) ? Math.round(price / servings * 100) / 100 : null;
  let score = 5;
  if (extractType === 'KSM-66') score += 3;
  else if (extractType === 'Sensoril' || extractType === 'Shoden') score += 2.5;
  else if (extractType.includes('Organic')) score += 1.5;
  else if (extractType === 'Unknown') score -= 1;
  if (ashwagandhaAmt && ashwagandhaAmt >= 600) score += 1;
  if (isThirdParty) score += 1;
  const formulaScore = Math.min(10, Math.max(1, Math.round(score * 10) / 10));
  const bsr = product.bsr_current;
  const rating = product.rating_value;
  const threat = !bsr ? 'Low' : bsr < 1000 ? 'Very High' : bsr < 5000 && (formulaScore >= 7 || rating >= 4.5) ? 'High' : bsr < 20000 ? 'Medium' : 'Low';
  // Generic primary active fields (derived from rule-based detection)
  const primaryActiveIngredient = ashwagandhaAmt ? 'Ashwagandha' : (facts ? detectPrimaryActive(facts) : 'Unknown');
  const primaryActiveAmountMg = ashwagandhaAmt || detectPrimaryActiveMg(facts);
  const primaryActiveForm = ashwagandhaAmt ? extractType : (facts ? detectPrimaryForm(facts) : 'Unknown');

  return {
    primary_active_ingredient: primaryActiveIngredient,
    primary_active_amount_mg: primaryActiveAmountMg,
    primary_active_form: primaryActiveForm,
    ashwagandha_amount_mg: ashwagandhaAmt,
    ashwagandha_extract_type: extractType,
    withanolide_percentage: null,
    price_per_serving: pricePerServing,
    price_per_mg_ashwagandha: (pricePerServing && ashwagandhaAmt) ? Math.round(pricePerServing / ashwagandhaAmt * 10000) / 10000 : null,
    is_sugar_free: certs.includes('Sugar-Free'),
    is_vegan: certs.includes('Vegan'),
    is_gluten_free: certs.includes('Gluten-Free'),
    is_non_gmo: certs.includes('Non-GMO'),
    is_cgmp: certs.includes('cGMP'),
    is_third_party_tested: isThirdParty,
    certifications: certs,
    bonus_ingredients: bonus,
    artificial_colors: (facts+title).toLowerCase().includes('fd&c') || (facts+title).toLowerCase().includes('red 40'),
    formula_quality_score: formulaScore,
    competitor_threat_level: threat,
    key_strengths: [],
    key_weaknesses: [],
    analysis_method: 'rule_based',
    ...marketMetrics,
    analyzed_at: new Date().toISOString(),
  };
}

// ─── Grok batch analysis ──────────────────────────────────────────────────────

async function analyzeWithGrok(products, marketMetricsMap, categoryMedianPrice, reviewSentimentMap = {}) {
  const productList = products.map((p, i) => {
    const mm = marketMetricsMap[p.asin];
    const price = parseFloat(p.price || 0);
    const servings = p.servings_per_container;
    const pricePerServing = (price && servings) ? (price / servings).toFixed(2) : 'N/A';
    return `
PRODUCT ${i + 1} [ASIN: ${p.asin}]
Brand/Title: ${p.brand || '?'} - ${(p.title || '').substring(0, 200)}
BSR: ${p.bsr_current?.toLocaleString() || 'N/A'} | Price: $${price || 'N/A'} | Rating: ${p.rating_value || 'N/A'} ⭐ (${(p.rating_count || 0).toLocaleString()} reviews)
Revenue: $${(p.monthly_revenue || 0).toLocaleString()}/mo | Sales: ${(p.monthly_sales || 0).toLocaleString()}/mo
Servings: ${servings || 'N/A'} | Price/Serving: $${pricePerServing}
--- MARKET SIGNALS (pre-computed) ---
BSR Trend (30d/90d): ${mm.bsr_trend_label} | Velocity Score: ${mm.velocity_score > 0 ? '+' : ''}${mm.velocity_score}%
Price Tier: ${TIER_LABELS[mm.price_positioning_tier]} (category median: $${categoryMedianPrice?.toFixed(2)})
Revenue/Review Ratio: $${mm.revenue_per_review || 'N/A'}/review (${mm.revenue_per_review_label})
--- FORMULA DATA ---
Claims: ${(p.claims_on_label || []).join(', ') || 'N/A'}
Feature Bullets: ${(p.feature_bullets_text || '').substring(0, 1200) || 'N/A'}
Supplement Facts (OCR): ${(p.supplement_facts_raw || '').substring(0, 2500) || 'Not available'}
--- REVIEW SENTIMENT (real customer voice, up to 5 positive + 5 critical) ---
${formatReviewSentiment(reviewSentimentMap[p.asin])}`;
  }).join('\n═══\n');

  const prompt = `You are a supplement industry expert analyzing competitor supplement products for DOVIVE brand's product development team.

The market signals (BSR velocity, price tier, revenue efficiency) have already been computed. Your job is to analyze the FORMULA quality and competitive positioning for each product.

IMPORTANT: These products may be for ANY supplement category (Vitamin C, Collagen, Magnesium, Melatonin, Creatine, Elderberry, etc.) - NOT necessarily Ashwagandha. Detect the PRIMARY ACTIVE INGREDIENT from the supplement facts and analyze accordingly.

${productList}

Return ONLY a valid JSON array with exactly ${products.length} objects:
[
  {
    "asin": "string",
    "primary_active_ingredient": "the main active ingredient name (e.g. Vitamin C, Collagen Peptides, Magnesium Glycinate, Melatonin, Creatine Monohydrate, Ashwagandha, etc.)",
    "primary_active_amount_mg": number or null (amount in mg/mcg - use the numeric value from supplement facts),
    "primary_active_form": "the specific form or grade (e.g. Liposomal Ascorbic Acid, Hydrolyzed Collagen Type I&III, Magnesium Glycinate, KSM-66 Ashwagandha, Creatine Monohydrate, etc.) - 'Unknown' if not specified",
    "ashwagandha_amount_mg": number or null (only if ashwagandha is present),
    "ashwagandha_extract_type": "KSM-66"|"Sensoril"|"Shoden"|"Organic Extract"|"Generic Extract"|"10:1 Extract"|"Root Powder"|"Unknown",
    "withanolide_percentage": "e.g. 5%" or null,
    "is_sugar_free": boolean,
    "is_vegan": boolean,
    "is_gluten_free": boolean,
    "is_non_gmo": boolean,
    "is_cgmp": boolean,
    "is_third_party_tested": boolean,
    "certifications": ["array of detected certifications"],
    "bonus_ingredients": ["secondary active ingredients beyond the primary active"],
    "artificial_colors": boolean,
    "proprietary_blend": boolean,
    "formula_quality_score": 1-10,
    "competitor_threat_level": "Very High"|"High"|"Medium"|"Low",
    "key_strengths": ["max 3 specific strengths"],
    "key_weaknesses": ["max 3 specific weaknesses"],
    "form_factor_notes": "1 line: what makes this formula unique or generic",
    "market_opportunity_gap": "1 line: what DOVIVE could do better with this category"
  }
]

Scoring guidance (generic - applies to ANY supplement category; use judgment, not a mechanical checklist):
- formula_quality_score (1-10): reason like a category expert would. Weigh things such as whether the ingredient form is a branded/clinically-studied grade (e.g. KSM-66, Liposomal, Magnesium Glycinate, Creatine Monohydrate, Type I&III Hydrolyzed) vs a generic/unspecified one, whether the dose is clinically meaningful for THIS category (not just present), real third-party testing/certifications, and whether a proprietary blend is hiding doses the consumer would want to see. Ground the score in what actually differentiates a strong product in this specific category — don't apply a flat point formula across unrelated categories.
- competitor_threat_level: consider BSR strength, formula quality, and review sentiment together (very low BSR + strong formula + genuinely positive reviews = Very High/High threat; weak formula or a pattern of real complaints in the review sentiment above should pull the threat level down even if BSR looks strong).
- key_strengths/key_weaknesses: ground at least one of each in the REVIEW SENTIMENT above when real complaint/praise patterns exist there — don't infer purely from the catalog data if actual customer voice is available.
- market_opportunity_gap: be specific to this category and, where the review sentiment reveals an unmet need or recurring complaint, name it directly — what formula gap can DOVIVE exploit?
- Return ONLY the JSON array. No other text.`;

  const response = await callGrok(prompt, 64000);
  if (!response) throw new Error('Empty AI response');
  const jsonMatch = response.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('No JSON array in AI response');
  return JSON.parse(jsonMatch[0]);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`\n${'═'.repeat(62)}`);
  console.log(`P6: PRODUCT INTELLIGENCE v2 - Market Trends Edition`);
  console.log(`${'═'.repeat(62)}\n`);

  const xaiKey = getOpenRouterKey();
  console.log(`AI: ${xaiKey ? `✅ Claude via OpenRouter (${ANALYSIS_MODEL})` : '⚠️  No key - rule-based fallback'}`);

  const CAT_ID = await lookupCategoryId(KEYWORD);

  // Fetch all products with all needed fields
  const { data: products, error } = await DASH.from('products')
    .select(`id, asin, brand, title, bsr_current, bsr_30_days_avg, bsr_90_days_avg,
             price, monthly_revenue, monthly_sales, rating_value, rating_count,
             serving_size, servings_per_container, supplement_facts_raw,
             feature_bullets_text, claims_on_label, marketing_analysis`)
    .eq('category_id', CAT_ID)
    .order('bsr_current', { ascending: true, nullsFirst: false })
    .limit(TOP_N);

  if (error) throw error;
  console.log(`Fetched: ${products.length} products\n`);

  // Filter already-done
  let toProcess = products;
  if (!FORCE) {
    toProcess = products.filter(p => !p.marketing_analysis?.product_intelligence?.analyzed_at);
    if (products.length !== toProcess.length) {
      console.log(`Skipping ${products.length - toProcess.length} already analyzed → ${toProcess.length} to process\n`);
    }
  }

  // ── Pre-compute market metrics for ALL products ──────────────────────────
  const prices = products.map(p => parseFloat(p.price || 0)).filter(Boolean).sort((a, b) => a - b);
  const categoryMedianPrice = prices.length ? prices[Math.floor(prices.length / 2)] : null;
  console.log(`Category median price: $${categoryMedianPrice?.toFixed(2) || 'N/A'}\n`);

  const marketMetricsMap = {};
  for (const p of toProcess) {
    const bsrVelocity = computeBSRVelocity(p.bsr_current, p.bsr_30_days_avg, p.bsr_90_days_avg);
    const price = parseFloat(p.price || 0);
    const priceTier = computePriceTier(price, categoryMedianPrice);
    const rpr = computeRevenuePerReview(p.monthly_revenue, p.rating_count);
    const servings = p.servings_per_container;
    const pricePerServing = (price && servings) ? Math.round(price / servings * 100) / 100 : null;

    marketMetricsMap[p.asin] = {
      // BSR Velocity
      ...bsrVelocity,
      // Price positioning
      price_positioning_tier: priceTier,
      price_positioning_label: TIER_LABELS[priceTier],
      category_median_price: categoryMedianPrice,
      // Revenue efficiency
      revenue_per_review: rpr,
      revenue_per_review_label: revenuePerReviewLabel(rpr),
      // Pricing
      price_per_serving: pricePerServing,
    };
  }

  // ── Process in batches ──────────────────────────────────────────────────
  let saved = 0, errors = 0, aiCount = 0, ruleCount = 0;
  const batches = [];
  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) batches.push(toProcess.slice(i, i + BATCH_SIZE));

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    process.stdout.write(`Batch ${bi + 1}/${batches.length} (${batch.length} products)... `);

    let analyses = [];

    if (xaiKey) {
      try {
        const reviewSentimentMap = await fetchReviewSentimentMap(batch.map(p => p.asin));
        const grokResults = await analyzeWithGrok(batch, marketMetricsMap, categoryMedianPrice, reviewSentimentMap);
        for (let i = 0; i < batch.length; i++) {
          const gr = grokResults.find((r) => r.asin === batch[i].asin) || grokResults[i];
          if (gr) {
            const mm = marketMetricsMap[batch[i].asin];
            const ashwagandhaAmt = gr.ashwagandha_amount_mg;
            const pps = mm.price_per_serving;
            // Ensure generic primary_active fields are always set
            const facts = batch[i].supplement_facts_raw || '';
            analyses.push({
              product: batch[i],
              intel: {
                primary_active_ingredient: gr.primary_active_ingredient || detectPrimaryActive(facts),
                primary_active_amount_mg: gr.primary_active_amount_mg || detectPrimaryActiveMg(facts),
                primary_active_form: gr.primary_active_form || detectPrimaryForm(facts),
                ...gr,
                price_per_serving: pps,
                price_per_mg_ashwagandha: (pps && ashwagandhaAmt) ? Math.round(pps / ashwagandhaAmt * 10000) / 10000 : null,
                ...mm,
                analysis_method: 'claude_ai_v2',
                analyzed_at: new Date().toISOString(),
              },
            });
            aiCount++;
          }
        }
        process.stdout.write(`✅ Claude AI (${batch.length})`);
      } catch (e) {
        process.stdout.write(`⚠️  Claude AI failed → rule-based | ${e.message.substring(0, 60)}`);
        analyses = batch.map(p => ({ product: p, intel: ruleBasedAnalysis(p, marketMetricsMap[p.asin]) }));
        ruleCount += batch.length;
      }
    } else {
      analyses = batch.map(p => ({ product: p, intel: ruleBasedAnalysis(p, marketMetricsMap[p.asin]) }));
      ruleCount += batch.length;
    }

    // Save
    // CRITICAL fix (2026-09-01, live production incident): this used to
    // .eq('asin', product.asin) with NO category scoping. A "#N" session
    // re-scrapes the same physical Amazon products as its sibling, so the
    // same ASIN now legitimately has a separate `products` row PER
    // category — the unscoped update hit every row sharing that ASIN
    // across EVERY category. Confirmed live: this overwrote
    // marketing_analysis.product_intelligence on 123 of the ORIGINAL,
    // already signed-off "Electrolyte Powder" category's 161 products
    // mid-run. `id` is the row's own unique primary key (now selected
    // above), so scoping by it can never cross a category boundary.
    for (const { product, intel } of analyses) {
      const existing = product.marketing_analysis || {};
      const { error: saveErr } = await DASH.from('products').update({
        marketing_analysis: { ...existing, product_intelligence: intel }
      }).eq('id', product.id);
      if (saveErr) { errors++; process.stdout.write(`\n  ❌ ${product.asin}: ${saveErr.message}`); }
      else saved++;
    }

    console.log(` → saved ${analyses.length}`);
    if (bi < batches.length - 1) await new Promise(r => setTimeout(r, 1500));
  }

  // Summary
  console.log(`\n${'═'.repeat(62)}`);
  console.log(`PHASE 6 COMPLETE`);
  console.log(`Processed: ${toProcess.length} | Saved: ${saved} | Errors: ${errors}`);
  console.log(`AI: ${aiCount} | Rule-based: ${ruleCount}`);
  console.log(`New fields added: bsr_velocity, price_tier, revenue_per_review, market_opportunity_gap`);
}

run().catch(e => { console.error('\n❌ FAILED:', e.message); process.exit(1); });

