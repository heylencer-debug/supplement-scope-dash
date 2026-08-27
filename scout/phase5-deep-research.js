/**
 * phase5-deep-research.js — Automated P5 Deep Research (2026-08-28 rebuild)
 *
 * Rebuilt because the previous version ran ~20 SEQUENTIAL heavy-reasoning
 * Grok calls (4000 tokens each) and ate the entire 1hr Cloud Run job
 * timeout, and Grok's memory of brand/product details is stale/unreliable.
 *
 * This version:
 *   1. Analyzes far fewer products total (~8 default: 5 top + 3 new/fast-
 *      moving), configurable via P5_TOP_COUNT / P5_NEW_COUNT.
 *   2. GROUNDS every brief on REAL data already in Supabase for the ASIN —
 *      dovive_research (Bright Data product data + bullet points),
 *      dovive_ocr (supplement facts), dovive_reviews (real customer
 *      reviews), dovive_keepa (price/BSR/rating history) — so the model
 *      SUMMARIZES real facts instead of recalling brand details from
 *      memory. This also shrinks the prompt vs the old version.
 *   3. Adds live off-Amazon Playwright scraping per ASIN: search the web for
 *      "<brand> <product name>", pick the official brand site or a major
 *      retailer (iHerb/Walmart), and scrape real ingredient claims,
 *      certifications, dosage, and retail price into dovive_p5_sources.
 *      Discovery is imperfect — if there's no confident match, scraping is
 *      SKIPPED for that ASIN (never scrape the wrong page); the output is
 *      flagged low-confidence instead. Grok-from-memory is used ONLY as a
 *      clearly-flagged low-confidence fallback when NEITHER real Amazon DB
 *      data NOR a brand/retailer page is available for that product.
 *   4. Parallelizes the per-product analyses in small batches (default 5
 *      concurrent) and uses a fast/cheap Grok tier for routine
 *      summarization, reserving the heavy reasoning tier only for the
 *      memory-fallback case.
 *
 * Pools (both kept):
 *   Pool A — TOP N BSR:      The best-ranking products in the category
 *   Pool B — TOP N NEW:      Top BSR products with < 500 reviews (fast-moving new brands)
 *
 * Saves to: dovive_phase5_research (DOVIVE Supabase)
 * Also saves to: products.marketing_analysis.p5_research (DASH Supabase — for dashboard)
 * Scraped off-Amazon sources saved to: dovive_p5_sources (DOVIVE Supabase)
 *
 * Usage:
 *   node phase5-deep-research.js --keyword "ashwagandha gummies"
 *   node phase5-deep-research.js --keyword "ashwagandha gummies" --force
 *   node phase5-deep-research.js --keyword "ashwagandha gummies" --pool top10    (only Pool A)
 *   node phase5-deep-research.js --keyword "ashwagandha gummies" --pool newbrands (only Pool B)
 *
 * Env vars:
 *   P5_TOP_COUNT       products in Pool A (default 5)
 *   P5_NEW_COUNT       products in Pool B (default 3)
 *   P5_CONCURRENCY     parallel product analyses (default 5)
 *   P5_FAST_MODEL      routine summarization model (default grok-4-fast)
 *   P5_REASONING_MODEL heavy fallback model, memory-only case (default grok-4.20-beta-0309-reasoning)
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { resolveCategory } = require('./utils/category-resolver');
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth');
chromium.use(stealth());

const DASH   = createClient(process.env.DASH_URL || process.env.SUPABASE_URL, process.env.DASH_KEY || process.env.SUPABASE_KEY);
const DOVIVE = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const KEYWORD  = process.argv.includes('--keyword')  ? process.argv[process.argv.indexOf('--keyword')  + 1] : 'ashwagandha gummies';
const FORCE    = process.argv.includes('--force');
const POOL_ARG = process.argv.includes('--pool')     ? process.argv[process.argv.indexOf('--pool')     + 1] : 'both';

const P5_TOP_COUNT   = parseInt(process.env.P5_TOP_COUNT   || '5', 10);
const P5_NEW_COUNT   = parseInt(process.env.P5_NEW_COUNT   || '3', 10);
const P5_CONCURRENCY = parseInt(process.env.P5_CONCURRENCY || '5', 10);
const P5_FAST_MODEL      = process.env.P5_FAST_MODEL      || 'grok-4-fast';
const P5_REASONING_MODEL = process.env.P5_REASONING_MODEL || 'grok-4.20-beta-0309-reasoning';

// ─── xAI Key ──────────────────────────────────────────────────────────────────

function getXaiKey() {
  return process.env.XAI_API_KEY || null;
}

// ─── Grok Call (model + max_tokens configurable per call) ─────────────────────

async function callGrok(prompt, { model = P5_FAST_MODEL, maxTokens = 1600 } = {}) {
  const key = getXaiKey();
  if (!key) throw new Error('XAI_API_KEY not found in scout/.env');

  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const j = await res.json();
  if (j.error) throw new Error(`Grok error (${model}): ${j.error.message}`);
  return j.choices?.[0]?.message?.content || null;
}

// ─── Tiny concurrency pool (no external dependency) ────────────────────────────

async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function lane() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      try {
        results[i] = { ok: true, value: await worker(items[i], i) };
      } catch (err) {
        results[i] = { ok: false, error: err };
      }
    }
  }
  const lanes = Array.from({ length: Math.min(concurrency, items.length) }, () => lane());
  await Promise.all(lanes);
  return results;
}

// ─── Grounding: pull REAL data already in Supabase for this ASIN ──────────────

async function fetchGroundingData(asin, keyword) {
  const [researchRes, ocrRes, reviewsRes, keepaRes] = await Promise.all([
    DOVIVE.from('dovive_research')
      .select('title, brand, description, bullet_points, price, rating, review_count, bsr')
      .eq('asin', asin).ilike('keyword', `%${keyword.split(' ')[0]}%`).limit(1).maybeSingle(),
    DOVIVE.from('dovive_ocr')
      .select('supplement_facts, other_ingredients, health_claims, certifications')
      .eq('asin', asin).order('image_index', { ascending: true }).limit(3),
    DOVIVE.from('dovive_reviews')
      .select('rating, title, body, verified_purchase, helpful_votes')
      .eq('asin', asin).order('helpful_votes', { ascending: false }).limit(10),
    DOVIVE.from('dovive_keepa')
      .select('price_usd, bsr_current, bsr_drops_30d, bsr_drops_90d, bsr_history_30d')
      .eq('asin', asin).limit(1).maybeSingle(),
  ]);

  const research = researchRes.data || null;
  const ocrRows  = ocrRes.data || [];
  const reviews  = reviewsRes.data || [];
  const keepa    = keepaRes.data || null;

  const hasRealData = !!(research || ocrRows.length || reviews.length || keepa);

  return { research, ocrRows, reviews, keepa, hasRealData };
}

function formatGroundingForPrompt(grounding) {
  const { research, ocrRows, reviews, keepa } = grounding;
  const parts = [];

  if (research) {
    parts.push(`**Bright Data listing (dovive_research):**
Title: ${research.title || 'N/A'}
Brand: ${research.brand || 'N/A'}
Description: ${(research.description || '').substring(0, 400) || 'N/A'}
Bullet points: ${JSON.stringify(research.bullet_points || []).substring(0, 800)}
Price: $${research.price || 'N/A'} | Rating: ${research.rating || 'N/A'} (${research.review_count || 0} reviews) | BSR: ${research.bsr || 'N/A'}`);
  } else {
    parts.push('**Bright Data listing:** Not available in dovive_research.');
  }

  if (ocrRows.length) {
    const facts = ocrRows.map((r, i) =>
      `  Image ${i + 1} — Supplement Facts: ${JSON.stringify(r.supplement_facts || {}).substring(0, 500)} | Other ingredients: ${(r.other_ingredients || '').substring(0, 200)} | Certifications: ${JSON.stringify(r.certifications || [])} | Health claims: ${JSON.stringify(r.health_claims || [])}`
    ).join('\n');
    parts.push(`**OCR'd label facts (dovive_ocr, real photos of this product):**\n${facts}`);
  } else {
    parts.push('**OCR label facts:** Not available in dovive_ocr.');
  }

  if (reviews.length) {
    const revText = reviews.slice(0, 8).map(r =>
      `  [${r.rating}★${r.verified_purchase ? ', verified' : ''}] "${(r.title || '').substring(0, 60)}" — ${(r.body || '').substring(0, 220)}`
    ).join('\n');
    parts.push(`**Real customer reviews (dovive_reviews, top ${Math.min(reviews.length, 8)} by helpfulness):**\n${revText}`);
  } else {
    parts.push('**Real customer reviews:** Not available in dovive_reviews.');
  }

  if (keepa) {
    parts.push(`**Keepa price/BSR history:**
Current price: $${keepa.price_usd || 'N/A'} | Current BSR: ${keepa.bsr_current || 'N/A'}
BSR drops (30d/90d — proxy for sales velocity): ${keepa.bsr_drops_30d ?? 'N/A'} / ${keepa.bsr_drops_90d ?? 'N/A'}`);
  } else {
    parts.push('**Keepa price/BSR history:** Not available in dovive_keepa.');
  }

  return parts.join('\n\n');
}

// ─── Off-Amazon source discovery + scrape (Playwright, no Bright Data needed) ──
// Brand sites and major retailers (iHerb/Walmart) don't typically block
// datacenter IPs the way Amazon does, so plain Playwright is sufficient here.

const RETAILER_DOMAINS = [
  { match: /iherb\.com/i,        type: 'iherb' },
  { match: /walmart\.com/i,      type: 'walmart' },
  { match: /vitaminshoppe\.com/i, type: 'retailer_other' },
  { match: /gnc\.com/i,          type: 'retailer_other' },
  { match: /target\.com/i,       type: 'retailer_other' },
];

function slugify(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function pickConfidentResult(links, brand) {
  const brandSlug = slugify(brand);
  if (!brandSlug || brandSlug.length < 3) return null;

  for (const { href } of links) {
    let host;
    try { host = new URL(href).hostname.replace(/^www\./, ''); } catch { continue; }
    const hostSlug = slugify(host.split('.')[0]);
    // Confident match #1: official brand site — the brand name is the domain
    if (hostSlug && brandSlug.includes(hostSlug) || hostSlug.includes(brandSlug)) {
      if (hostSlug.length >= 4) return { url: href, type: 'brand_site' };
    }
    // Confident match #2: a known major retailer product page
    for (const r of RETAILER_DOMAINS) {
      if (r.match.test(host)) return { url: href, type: r.type };
    }
  }
  return null;
}

async function findAndScrapeSource(browserContext, product, keyword) {
  const brand = product.brand || '';
  const title = product.title || '';
  if (!brand && !title) return null;

  const query = `${brand} ${title}`.trim().substring(0, 120);
  const page = await browserContext.newPage();
  try {
    // DuckDuckGo HTML search — no login wall, no heavy JS, tolerant of
    // datacenter IPs (unlike Google, which frequently CAPTCHAs them).
    await page.goto(`https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      waitUntil: 'domcontentloaded', timeout: 20000,
    });
    await page.waitForTimeout(800);

    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a.result__a, a[data-testid="result-title-a"]'))
        .map(a => ({ href: a.href, text: a.textContent?.trim() || '' }))
        .filter(l => l.href && !/duckduckgo\.com/i.test(l.href))
        .slice(0, 8);
    });

    const pick = pickConfidentResult(links, brand);
    if (!pick) {
      return { skipped: true, reason: 'no confident brand/retailer match in search results' };
    }

    const sourcePage = await browserContext.newPage();
    try {
      await sourcePage.goto(pick.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await sourcePage.waitForTimeout(500);
      const bodyText = await sourcePage.locator('body').innerText({ timeout: 5000 }).catch(() => '');
      const excerpt = bodyText.replace(/\s+/g, ' ').trim().substring(0, 4000);

      if (!excerpt || excerpt.length < 40) {
        return { skipped: true, reason: 'source page returned no usable text' };
      }

      const extracted = extractSignalsFromText(excerpt);

      return {
        skipped: false,
        source_url: pick.url,
        source_type: pick.type,
        raw_html_excerpt: excerpt,
        extracted,
      };
    } finally {
      await sourcePage.close();
    }
  } catch (err) {
    return { skipped: true, reason: `scrape error: ${err.message}` };
  } finally {
    await page.close();
  }
}

// Cheap regex-based signal extraction from the scraped page text — no LLM
// call needed for this step, keeps the pipeline fast.
function extractSignalsFromText(text) {
  const priceMatch = text.match(/\$\s?\d{1,4}(?:\.\d{2})?/);
  const certKeywords = ['NSF Certified', 'USP Verified', 'Informed Sport', 'Informed Choice', 'GMP', 'Non-GMO', 'Vegan', 'Gluten Free', 'Third Party Tested', 'cGMP'];
  const certifications = certKeywords.filter(c => new RegExp(c.replace(/\s/g, '\\s*'), 'i').test(text));
  const dosageMatch = text.match(/(\d{2,5})\s?mg/i);

  return {
    retail_price: priceMatch ? priceMatch[0] : null,
    certifications,
    dosage_mg_mentioned: dosageMatch ? dosageMatch[1] : null,
    excerpt_preview: text.substring(0, 300),
  };
}

async function saveSource(asin, keyword, scraped) {
  const { error } = await DOVIVE.from('dovive_p5_sources').insert({
    asin,
    keyword,
    source_url: scraped.source_url,
    source_type: scraped.source_type,
    raw_html_excerpt: scraped.raw_html_excerpt,
    extracted: scraped.extracted,
  });
  if (error) console.error(`  NOTE: dovive_p5_sources save failed for ${asin}: ${error.message}`);
}

// ─── Build Prompt for one product — grounded on real data ─────────────────────

function buildGroundedPrompt(product, rank, pool, keyword, groundingText, sourceBlock, memoryFallback) {
  const poolLabel = pool === 'top10'
    ? `TOP BSR — Rank #${rank} in "${keyword}"`
    : `NEW/FAST-MOVING BRAND — BSR ${product.bsr_current?.toLocaleString()} | Only ${product.rating_count} reviews`;

  const fallbackNotice = memoryFallback
    ? `\n\n⚠️ NO REAL DATA AVAILABLE for this product (no Amazon DB records, no matched brand/retailer page). You must rely on your training-data memory of this brand/product. CLEARLY FLAG every claim you are not certain of as "(low confidence — from memory, not verified)". Do not state unverified facts as if confirmed.`
    : '';

  return `You are a senior supplement competitive intelligence analyst producing a CONCISE research brief on one competitor product for the DOVIVE brand. Ground every claim in the REAL DATA below — do not invent details. Where the data doesn't cover something, say "not disclosed" rather than guessing.

## PRODUCT: ${product.brand || 'Unknown'} — ${(product.title || '').substring(0, 80)}
**ASIN:** ${product.asin} | **Pool:** ${poolLabel}
**BSR:** ${product.bsr_current?.toLocaleString() || 'N/A'} | **Price:** $${product.price || 'N/A'} | **Rating:** ${product.rating_value || 'N/A'}★ (${(product.rating_count || 0).toLocaleString()} reviews)

---
## REAL DATA GATHERED FOR THIS ASIN

${groundingText}

${sourceBlock}
${fallbackNotice}

---
## DELIVERABLE (be concise — this is a summary brief, not an essay; ~500-700 words total)

### 1. FORMULA SNAPSHOT
Key ingredients/doses from the real data above, and whether the dose looks clinically meaningful.

### 2. MARKET POSITION
Pricing tier, how it's positioned, label claims vs what the data actually shows.

### 3. CONSUMER SENTIMENT
Top 2-3 things reviewers love, top 2-3 complaints — pulled from the real review text above.

### 4. THIRD-PARTY TESTING & TRANSPARENCY
Certifications/testing found in the OCR or scraped source data. Say "not disclosed" if none found.

### 5. DOVIVE COMPETITIVE ANGLE
How DOVIVE can beat this specific product. One-line positioning statement: "DOVIVE vs [Brand] — [advantage]".

### 6. THREAT ASSESSMENT
**Threat Level:** [Critical / High / Medium / Low] — one-line justification.
**Why they win:** [top 2 reasons]
**Where they're vulnerable:** [top 2 weaknesses]

### 7. KEY INTELLIGENCE SUMMARY
(3-5 bullets — the most important facts for DOVIVE's product team)`;
}

// ─── Parse AI output into structured fields ────────────────────────────────────

function parseResearchOutput(rawText, product, pool, meta) {
  const threatMatch = rawText.match(/\*\*Threat Level:\*\*\s*([^\n\-–]+)/i);
  const threatLevel = threatMatch?.[1]?.trim().split(/[\s,]/)[0] || 'Unknown';

  const angleSection = rawText.match(/### 5\. DOVIVE COMPETITIVE ANGLE([\s\S]*?)(?:### 6|$)/)?.[1]?.trim() || '';

  const summarySection = rawText.match(/### 7\. KEY INTELLIGENCE SUMMARY([\s\S]*?)(?:---|$)/)?.[1]?.trim() || '';
  const keyBullets = summarySection
    .split('\n')
    .filter(l => l.trim().startsWith('-') || l.trim().startsWith('•'))
    .map(l => l.replace(/^[-•]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 5);

  const formulaSection = rawText.match(/### 1\. FORMULA SNAPSHOT([\s\S]*?)(?:### 2|$)/)?.[1]?.trim() || '';
  const threatsSection = rawText.match(/### 6\. THREAT ASSESSMENT([\s\S]*?)(?:### 7|$)/)?.[1]?.trim() || '';

  return {
    asin: product.asin,
    keyword: product.keyword || KEYWORD,
    brand: product.brand || 'Unknown',
    bsr_rank: product.bsr_current || null,
    pool: pool,
    benefits: keyBullets.slice(0, 3),
    features: [],
    formula_notes: formulaSection.substring(0, 800),
    certifications: meta.sourceExtracted?.certifications || [],
    awards: [],
    third_party_tested: (meta.sourceExtracted?.certifications || []).length > 0,
    transparency_flag: !(meta.sourceExtracted?.certifications || []).length,
    reddit_sentiment: 'unknown',
    reddit_notes: '',
    reddit_sources: [],
    external_reviews: [],
    healthline_covered: false,
    labdoor_score: null,
    key_weaknesses: (threatsSection.match(/Where they're vulnerable[:\s]+([\s\S]*?)(?:\n-|\n###|$)/i)?.[1] || '').substring(0, 400),
    key_strengths: (threatsSection.match(/Why they win[:\s]+([\s\S]*?)(?:\n-|\n###|$)/i)?.[1] || '').substring(0, 400),
    competitor_angle: angleSection.substring(0, 600),
    full_research: rawText,
    researched_at: new Date().toISOString(),
    researched_by: meta.model,
    data_grounding: {
      had_real_amazon_data: meta.hasRealData,
      had_source_scrape: !!meta.sourceUrl,
      source_url: meta.sourceUrl || null,
      memory_fallback: meta.memoryFallback,
    },
    phase: 5,
  };
}

// ─── Fetch products from Supabase (both pools kept, counts trimmed) ───────────

async function getProducts(categoryId) {
  const { data: top10 } = await DASH.from('products')
    .select(`asin, brand, title, bsr_current, price, monthly_revenue, monthly_sales,
             rating_value, rating_count, supplement_facts_raw, other_ingredients,
             claims_on_label, feature_bullets_text, marketing_analysis, review_analysis`)
    .eq('category_id', categoryId)
    .not('bsr_current', 'is', null)
    .order('bsr_current', { ascending: true })
    .limit(P5_TOP_COUNT);

  const { data: newBrands } = await DASH.from('products')
    .select(`asin, brand, title, bsr_current, price, monthly_revenue, monthly_sales,
             rating_value, rating_count, supplement_facts_raw, other_ingredients,
             claims_on_label, feature_bullets_text, marketing_analysis, review_analysis`)
    .eq('category_id', categoryId)
    .not('bsr_current', 'is', null)
    .lt('rating_count', 500)
    .gt('monthly_revenue', 0)
    .order('bsr_current', { ascending: true })
    .limit(P5_NEW_COUNT);

  return { top10: top10 || [], newBrands: newBrands || [] };
}

// ─── Check already researched ──────────────────────────────────────────────────

async function getAlreadyResearched() {
  const { data } = await DOVIVE.from('dovive_phase5_research')
    .select('asin, pool, researched_by')
    .ilike('keyword', `%${KEYWORD.split(' ')[0]}%`);
  return new Set((data || [])
    .filter(r => r.researched_by?.includes('grok'))
    .map(r => `${r.asin}_${r.pool}`));
}

// ─── Save to DOVIVE Supabase ───────────────────────────────────────────────────

async function saveToSupabase(record) {
  const { error } = await DOVIVE.from('dovive_phase5_research')
    .upsert(record, { onConflict: 'asin,keyword' });

  if (error) {
    if (error.message?.includes('pool') || error.message?.includes('full_research') || error.message?.includes('data_grounding') || error.message?.includes('column')) {
      console.log(`  NOTE: Missing columns in dovive_phase5_research — retrying with safe subset`);
      const { pool, full_research, data_grounding, ...safeRecord } = record;
      const { error: error2 } = await DOVIVE.from('dovive_phase5_research')
        .upsert(safeRecord, { onConflict: 'asin,keyword' });
      if (error2) throw new Error(`Save failed for ${record.asin}: ${error2.message}`);
    } else {
      throw new Error(`Save failed for ${record.asin}: ${error.message}`);
    }
  }
}

// ─── Save to DASH products table ──────────────────────────────────────────────

async function saveToDashProduct(asin, research) {
  const { data: product } = await DASH.from('products')
    .select('marketing_analysis')
    .eq('asin', asin)
    .single();

  const existing = product?.marketing_analysis || {};
  await DASH.from('products').update({
    marketing_analysis: {
      ...existing,
      p5_research: {
        pool: research.pool,
        competitor_angle: research.competitor_angle,
        key_strengths: research.key_strengths,
        key_weaknesses: research.key_weaknesses,
        threat_assessment: research.full_research?.match(/### 6\. THREAT ASSESSMENT([\s\S]*?)(?:### 7|$)/)?.[1]?.trim()?.substring(0, 800) || '',
        dovive_angle: research.competitor_angle,
        data_grounding: research.data_grounding,
        researched_at: research.researched_at,
      },
    },
  }).eq('asin', asin);
}

// ─── Per-product pipeline: ground → scrape → summarize → save ─────────────────

async function researchOneProduct({ product, rank, pool }, browserContext) {
  const grounding = await fetchGroundingData(product.asin, KEYWORD);
  const groundingText = formatGroundingForPrompt(grounding);

  const scraped = await findAndScrapeSource(browserContext, product, KEYWORD);
  let sourceBlock = '**Off-Amazon source (Playwright scrape):** Not attempted or no confident match found — relying on Amazon DB data only.';
  let sourceUrl = null, sourceExtracted = null;

  if (scraped && !scraped.skipped) {
    sourceUrl = scraped.source_url;
    sourceExtracted = scraped.extracted;
    sourceBlock = `**Off-Amazon source (${scraped.source_type}, Playwright-scraped just now):**
URL: ${scraped.source_url}
Extracted: ${JSON.stringify(scraped.extracted)}
Page excerpt: ${scraped.raw_html_excerpt.substring(0, 1200)}`;
    await saveSource(product.asin, KEYWORD, scraped);
  } else if (scraped?.skipped) {
    sourceBlock = `**Off-Amazon source (Playwright scrape):** SKIPPED — ${scraped.reason}. Do not assume brand-site facts; note as unknown.`;
  }

  const memoryFallback = !grounding.hasRealData && !sourceUrl;
  const model = memoryFallback ? P5_REASONING_MODEL : P5_FAST_MODEL;
  const maxTokens = memoryFallback ? 3000 : 1600;

  const prompt = buildGroundedPrompt(product, rank, pool, KEYWORD, groundingText, sourceBlock, memoryFallback);
  const rawOutput = await callGrok(prompt, { model, maxTokens });
  if (!rawOutput) throw new Error(`Empty response from Grok (${model})`);

  const record = parseResearchOutput(rawOutput, product, pool, {
    model, hasRealData: grounding.hasRealData, sourceUrl, sourceExtracted, memoryFallback,
  });

  await saveToSupabase(record);
  await saveToDashProduct(product.asin, record);

  return { rawLen: rawOutput.length, model, memoryFallback, hadSource: !!sourceUrl, hadRealData: grounding.hasRealData };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function lookupCategoryId(keyword) {
  const cat = await resolveCategory(DASH, keyword);
  console.log(`  → Resolved category (${cat.method}): "${cat.name}" (${cat.id})`);
  return { id: cat.id, name: cat.name };
}

async function run() {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🔎 PHASE 5: DEEP RESEARCH — "${KEYWORD}"`);
  console.log(`Pool: ${POOL_ARG === 'both' ? `Top ${P5_TOP_COUNT} BSR + Top ${P5_NEW_COUNT} New Brands` : POOL_ARG === 'top10' ? `Top ${P5_TOP_COUNT} BSR only` : `Top ${P5_NEW_COUNT} New Brands only`}`);
  console.log(`Model: ${P5_FAST_MODEL} (routine) / ${P5_REASONING_MODEL} (memory-only fallback)`);
  console.log(`Concurrency: ${P5_CONCURRENCY}`);
  console.log(`${'═'.repeat(60)}\n`);

  const cat = await lookupCategoryId(KEYWORD);
  console.log(`Category: ${cat.name} (${cat.id})`);

  console.log('\nFetching products...');
  const { top10, newBrands } = await getProducts(cat.id);
  console.log(`  Top ${P5_TOP_COUNT} BSR:      ${top10.length} products loaded`);
  console.log(`  New/fast-moving:  ${newBrands.length} products loaded`);

  const already = FORCE ? new Set() : await getAlreadyResearched();
  console.log(`  Already researched (AI): ${already.size} products${FORCE ? ' (--force: re-running all)' : ''}\n`);

  const queue = [];
  if (POOL_ARG !== 'newbrands') {
    top10.forEach((p, i) => queue.push({ product: p, rank: i + 1, pool: 'top10' }));
  }
  if (POOL_ARG !== 'top10') {
    const top10Asins = new Set(top10.map(p => p.asin));
    newBrands.forEach((p, i) => {
      if (!top10Asins.has(p.asin)) {
        queue.push({ product: p, rank: i + 1, pool: 'newbrands' });
      }
    });
  }

  console.log(`Total products to research: ${queue.length}`);
  const toRun = queue.filter(q => !already.has(`${q.product.asin}_${q.pool}`));
  const toSkip = queue.length - toRun.length;
  console.log(`  Running: ${toRun.length} | Skipping (already done): ${toSkip}\n`);

  if (toRun.length === 0) {
    console.log('All products already researched. Use --force to re-run.');
    return;
  }

  const browser = await chromium.launch({ headless: process.platform !== 'win32' });
  const browserContext = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
  });

  const overallStart = Date.now();
  let done = 0, failed = 0;

  const results = await runPool(toRun, P5_CONCURRENCY, async (item) => {
    const poolLabel = item.pool === 'top10' ? `Top BSR #${item.rank}` : `New Brand #${item.rank}`;
    console.log(`\n[start] ${poolLabel} — ${item.product.brand || item.product.asin}`);
    const t0 = Date.now();
    const r = await researchOneProduct(item, browserContext);
    const elapsed = Math.round((Date.now() - t0) / 1000);
    console.log(`[done ${elapsed}s] ${poolLabel} — ${item.product.brand || item.product.asin} | model=${r.model} realData=${r.hadRealData} source=${r.hadSource} ${r.memoryFallback ? '⚠ MEMORY FALLBACK' : ''}`);
    return r;
  });

  await browser.close();

  for (const r of results) {
    if (r.ok) done++;
    else { failed++; console.error(`  FAILED: ${r.error.message}`); }
  }

  const totalElapsed = Math.round((Date.now() - overallStart) / 1000);

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`P5 DEEP RESEARCH COMPLETE — "${KEYWORD}"`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`Researched: ${done} | Failed: ${failed} | Skipped: ${toSkip}`);
  console.log(`Total time: ${totalElapsed}s (concurrency ${P5_CONCURRENCY})`);
  console.log(`Pools: Top ${P5_TOP_COUNT} BSR + Top ${P5_NEW_COUNT} New Brands`);
  console.log(`\nNext: run phase6-product-intelligence.js to score all products`);
}

run().catch(e => {
  console.error('\nFAILED:', e.message);
  process.exit(1);
});
