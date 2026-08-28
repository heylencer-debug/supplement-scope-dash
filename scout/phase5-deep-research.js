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
 *   P5_MODEL           routine + memory-fallback summarization model
 *                      (default ANALYSIS_MODEL, falls back to anthropic/claude-sonnet-5)
 *   P5_FAST_MODEL      legacy alias, still honored if set (routine summarization model)
 *   P5_REASONING_MODEL legacy alias, still honored if set (memory-only fallback model)
 *
 * 2026-08-28: switched from xAI Grok (api.x.ai) to Claude Sonnet 5 via
 * OpenRouter — Grok's memory of brand/product details was unreliable, and
 * this keeps P5 on the same OpenRouter + ANALYSIS_MODEL pattern as P6/P8-P11.
 * XAI_API_KEY is no longer required by this phase.
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { resolveCategory } = require('./utils/category-resolver');
const { launchBrowserContext, launchBrowserAPIOnly } = require('./utils/bright-data-browser');
const { researchBrand: perplexityResearchBrand, getPerplexityKey } = require('./utils/perplexity');

const DASH   = createClient(process.env.DASH_URL || process.env.SUPABASE_URL, process.env.DASH_KEY || process.env.SUPABASE_KEY);
const DOVIVE = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const KEYWORD  = process.argv.includes('--keyword')  ? process.argv[process.argv.indexOf('--keyword')  + 1] : 'ashwagandha gummies';
const FORCE    = process.argv.includes('--force');
const POOL_ARG = process.argv.includes('--pool')     ? process.argv[process.argv.indexOf('--pool')     + 1] : 'both';

const P5_TOP_COUNT   = parseInt(process.env.P5_TOP_COUNT   || '5', 10);
const P5_NEW_COUNT   = parseInt(process.env.P5_NEW_COUNT   || '3', 10);
// Default lowered 5 -> 2: with max_tokens uncapped to 32000, running 5 heavy
// LLM calls concurrently stacks OpenRouter credit reservations and can trip
// 402s mid-run. 2 in-flight keeps data-fetch parallelism elsewhere in the
// pool while bounding heavy-call concurrency. Override via env if needed.
const P5_CONCURRENCY = parseInt(process.env.P5_CONCURRENCY || '2', 10);

// Analysis model — configurable without a rebuild. Default: Claude Sonnet 5 via OpenRouter.
// P5_FAST_MODEL / P5_REASONING_MODEL are honored as legacy per-tier overrides if explicitly
// set (e.g. to point back at a Grok model), otherwise both tiers use the same model.
const DEFAULT_ANALYSIS_MODEL = process.env.P5_MODEL || process.env.ANALYSIS_MODEL || 'anthropic/claude-sonnet-5';
const P5_FAST_MODEL      = process.env.P5_FAST_MODEL      || DEFAULT_ANALYSIS_MODEL;
const P5_REASONING_MODEL = process.env.P5_REASONING_MODEL || DEFAULT_ANALYSIS_MODEL;

// ─── OpenRouter Key ──────────────────────────────────────────────────────────

function getOpenRouterKey() {
  return process.env.OPENROUTER_API_KEY || null;
}

// ─── Claude Call via OpenRouter (model + max_tokens configurable per call) ────

async function callGrokOnce(prompt, model, maxTokens) {
  const key = getOpenRouterKey();
  if (!key) throw new Error('OPENROUTER_API_KEY not found in scout/.env');

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://dovive.com',
      'X-Title': 'DOVIVE Scout P5 Deep Research',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (res.status === 402) {
    console.error(`  ❌ P5 OpenRouter credits exhausted — top up at openrouter.ai`);
    throw new Error('[ERROR: credits] OpenRouter credits exhausted (402)');
  }
  const j = await res.json();
  if (j.error) throw new Error(`OpenRouter error (${model}): ${j.error.message || JSON.stringify(j.error)}`);
  const choice = j.choices?.[0];
  const content = choice?.message?.content || null;
  const finishReason = choice?.finish_reason || 'unknown';
  const reasoningTokens = j.usage?.completion_tokens_details?.reasoning_tokens;
  console.log(`  [P5] finish_reason: ${finishReason} | output_chars: ${(content || '').length}${reasoningTokens != null ? ` | reasoning_tokens: ${reasoningTokens}` : ''}`);
  return { content, finishReason };
}

// No blind retry-on-length: caps were the cause of truncation, not transient
// failures, so retrying at the SAME (now generous) budget only helps for
// genuinely empty/near-empty output. A finish_reason=length WITH substantial
// content is kept as-is (marked in logs only) rather than re-burning tokens.
async function callGrok(prompt, { model = P5_FAST_MODEL, maxTokens = 64000 } = {}) {
  let { content, finishReason } = await callGrokOnce(prompt, model, maxTokens);
  const len = (content || '').length;
  if (finishReason === 'length' && len > 500) {
    console.log(`  [NOTE: output reached token ceiling] — keeping truncated-but-substantial content (${len} chars)`);
  } else if (len < 500) {
    console.log(`  ⚠️  P5 near-empty output (finish_reason=${finishReason}) — retrying once at same budget...`);
    const retry = await callGrokOnce(prompt, model, maxTokens);
    if (retry.content) content = retry.content;
  }
  // Never silently coerce to null; caller (researchOneProduct) already throws on empty,
  // which is the correct never-silent behavior for a per-product research call.
  return content;
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
      .eq('asin', asin).order('image_index', { ascending: true }).limit(8),
    DOVIVE.from('dovive_reviews')
      .select('rating, title, body, verified_purchase, helpful_votes')
      .eq('asin', asin).order('helpful_votes', { ascending: false }).limit(40),
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

// 2026-08-28 FIX: bsr_history_30d was fetched but never rendered into the
// prompt — only static current/30d/90d drop-counts were shown. A momentum
// trend line is richer signal than a static count for the MARKET POSITION
// section. Summarizes {date, rank}[] into a compact trajectory string.
function summarizeBsrTrend(history) {
  if (!Array.isArray(history) || history.length < 2) return null;
  const sorted = [...history].filter(p => p && p.rank != null).sort((a, b) => new Date(a.date) - new Date(b.date));
  if (sorted.length < 2) return null;
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const best = sorted.reduce((m, p) => (p.rank < m.rank ? p : m), sorted[0]);
  const worst = sorted.reduce((m, p) => (p.rank > m.rank ? p : m), sorted[0]);
  const pctChange = first.rank > 0 ? Math.round(((first.rank - last.rank) / first.rank) * 100) : 0;
  const direction = last.rank < first.rank ? 'improved (rank dropped, better)' : last.rank > first.rank ? 'worsened (rank rose, worse)' : 'flat';
  return `Over the last ${sorted.length} tracked days, BSR ${direction} from #${first.rank.toLocaleString()} (${first.date}) to #${last.rank.toLocaleString()} (${last.date}) — ${pctChange >= 0 ? 'improvement' : 'decline'} of ${Math.abs(pctChange)}%. Best rank in window: #${best.rank.toLocaleString()} (${best.date}). Worst: #${worst.rank.toLocaleString()} (${worst.date}).`;
}

function formatGroundingForPrompt(grounding) {
  const { research, ocrRows, reviews, keepa } = grounding;
  const parts = [];

  if (research) {
    parts.push(`**Bright Data listing (dovive_research):**
Title: ${research.title || 'N/A'}
Brand: ${research.brand || 'N/A'}
Description: ${(research.description || '').substring(0, 2000) || 'N/A'}
Bullet points: ${JSON.stringify(research.bullet_points || []).substring(0, 3000)}
Price: $${research.price || 'N/A'} | Rating: ${research.rating || 'N/A'} (${research.review_count || 0} reviews) | BSR: ${research.bsr || 'N/A'}`);
  } else {
    parts.push('**Bright Data listing:** Not available in dovive_research.');
  }

  if (ocrRows.length) {
    const facts = ocrRows.map((r, i) =>
      `  Image ${i + 1} — Supplement Facts: ${JSON.stringify(r.supplement_facts || {}).substring(0, 2500)} | Other ingredients: ${(r.other_ingredients || '').substring(0, 1000)} | Certifications: ${JSON.stringify(r.certifications || [])} | Health claims: ${JSON.stringify(r.health_claims || [])}`
    ).join('\n');
    parts.push(`**OCR'd label facts (dovive_ocr, real photos of this product):**\n${facts}`);
  } else {
    parts.push('**OCR label facts:** Not available in dovive_ocr.');
  }

  if (reviews.length) {
    const revText = reviews.slice(0, 30).map(r =>
      `  [${r.rating}★${r.verified_purchase ? ', verified' : ''}] "${(r.title || '').substring(0, 150)}" — ${(r.body || '').substring(0, 1200)}`
    ).join('\n');
    parts.push(`**Real customer reviews (dovive_reviews, top ${Math.min(reviews.length, 30)} by helpfulness):**\n${revText}`);
  } else {
    parts.push('**Real customer reviews:** Not available in dovive_reviews.');
  }

  if (keepa) {
    const trend = summarizeBsrTrend(keepa.bsr_history_30d);
    parts.push(`**Keepa price/BSR history:**
Current price: $${keepa.price_usd || 'N/A'} | Current BSR: ${keepa.bsr_current || 'N/A'}
BSR drops (30d/90d — proxy for sales velocity): ${keepa.bsr_drops_30d ?? 'N/A'} / ${keepa.bsr_drops_90d ?? 'N/A'}
30-day BSR trajectory: ${trend || 'Not enough tracked history to compute a trend.'}`);
  } else {
    parts.push('**Keepa price/BSR history:** Not available in dovive_keepa.');
  }

  return parts.join('\n\n');
}

// ─── Off-Amazon source discovery ────────────────────────────────────────────
// 2026-08-28 FIX #2: even the Bright Data ISP proxy fix (below, kept as the
// legacy fallback path) didn't solve discovery — CONFIRMED the ISP proxy
// itself connects fine (viaBrightData:true, other page loads through it
// work), but DuckDuckGo/Google SERP simply return 0 usable links THROUGH
// the proxy too (challenge page or empty result set — not an IP-block
// problem, a SERP-scraping problem). Replaced the discovery mechanism
// entirely: Perplexity Sonar (scout/utils/perplexity.js) does live web
// research directly and returns synthesized findings + real citation URLs
// in one call — no SERP scrape needed. The citation URLs are then
// (optionally) re-fetched raw via the same Bright Data browser chain
// (ISP proxy → Browser API retry) for a raw-text excerpt, but Perplexity's
// findings alone already count as a real off-Amazon source even if that
// raw fetch fails or is blocked.
//
// ENV-GATED: if PERPLEXITY_API_KEY is unset, Perplexity discovery is
// skipped entirely and P5 falls back to the OLD DuckDuckGo/Bright-Data-SERP
// scrape path below (unchanged, kept only as a pre-Perplexity fallback so
// nothing breaks before the key is provisioned).
// 2026-08-28 FIX #1 (kept as legacy fallback, no longer primary): the SEARCH
// step was going straight from the Cloud Run container to DuckDuckGo's HTML
// endpoint via Playwright, which returns an empty/challenge page to
// datacenter IPs. Routed through Bright Data's SERP REST endpoint as a
// secondary fallback. Both are now subordinate to the Perplexity path above.

function getBrightDataKey() {
  const key = process.env.BRIGHTDATA_API_KEY || process.env.BRIGHTDATA || null;
  return (key && !/^REPLACE_ME/i.test(key)) ? key : null;
}

const BRIGHTDATA_SERP_ZONE = process.env.BRIGHTDATA_SERP_ZONE || process.env.BRIGHTDATA_ZONE || 'serp_api1';

/**
 * Search via Bright Data's unified Web Unlocker/SERP endpoint. Returns
 * { links: [{href,text}], engine: 'brightdata' } on success, or null if
 * Bright Data isn't configured/available (caller falls back to DDG).
 * Throws only for genuinely unexpected shapes — network/auth/zone errors
 * are caught and logged, then null is returned so the caller can fall back.
 */
async function searchViaBrightData(query) {
  const key = getBrightDataKey();
  if (!key) return null;

  const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&brd_json=1`;
  try {
    const res = await fetch('https://api.brightdata.com/request', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ zone: BRIGHTDATA_SERP_ZONE, url: googleUrl, format: 'raw' }),
    });
    const text = await res.text();
    if (!res.ok) {
      console.log(`  ⚠️  P5 Bright Data SERP call failed [${res.status}] (zone=${BRIGHTDATA_SERP_ZONE}): ${text.slice(0, 200)} — falling back to DDG`);
      return null;
    }
    let parsed;
    try { parsed = JSON.parse(text); } catch {
      console.log(`  ⚠️  P5 Bright Data SERP returned non-JSON (zone "${BRIGHTDATA_SERP_ZONE}" may not be SERP-enabled) — falling back to DDG`);
      return null;
    }
    const organic = parsed?.organic || parsed?.results?.organic || [];
    const links = organic
      .map(r => ({ href: r.link || r.url || '', text: r.title || '' }))
      .filter(l => l.href)
      .slice(0, 8);
    return { links, engine: 'brightdata' };
  } catch (err) {
    console.log(`  ⚠️  P5 Bright Data SERP request errored (${err.message}) — falling back to DDG`);
    return null;
  }
}

// Brand sites and major retailers (iHerb/Walmart) don't typically block
// datacenter IPs the way Amazon does, so plain Playwright is sufficient for
// scraping the DESTINATION page once a confident URL is picked — only the
// search step needed Bright Data.

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

function classifyUrl(href, brandSlug) {
  let host;
  try { host = new URL(href).hostname.replace(/^www\./, ''); } catch { return null; }
  const hostSlug = slugify(host.split('.')[0]);
  // Confident match #1: official brand site — the brand name is the domain
  if (brandSlug && ((hostSlug && brandSlug.includes(hostSlug)) || hostSlug.includes(brandSlug)) && hostSlug.length >= 4) {
    return { url: href, type: 'brand_site' };
  }
  // Confident match #2: a known major retailer product page
  for (const r of RETAILER_DOMAINS) {
    if (r.match.test(host)) return { url: href, type: r.type };
  }
  return null;
}

function pickConfidentResult(links, brand) {
  const brandSlug = slugify(brand);
  if (!brandSlug || brandSlug.length < 3) return null;
  for (const { href } of links) {
    const hit = classifyUrl(href, brandSlug);
    if (hit) return hit;
  }
  return null;
}

// Same brand/retailer confidence filter as pickConfidentResult, but applied
// to a Perplexity citations array (plain URL strings) and returning up to
// `max` confident matches instead of just the first. If NOTHING passes the
// brand/retailer filter, falls back to the first `max` raw citations anyway
// — Perplexity has already vetted these as sources for its own findings, so
// they're still worth a raw-fetch attempt even if the domain doesn't look
// like an obvious brand/retailer site.
function pickConfidentUrls(citations, brand, max = 2) {
  const brandSlug = slugify(brand);
  const confident = [];
  for (const href of citations || []) {
    const hit = brandSlug && brandSlug.length >= 3 ? classifyUrl(href, brandSlug) : null;
    if (hit) confident.push(hit);
    if (confident.length >= max) return confident;
  }
  if (confident.length) return confident;
  return (citations || []).slice(0, max).map(href => ({ url: href, type: 'perplexity_citation' }));
}

async function searchViaDuckDuckGo(browserContext, query, asin) {
  const page = await browserContext.newPage();
  try {
    // DuckDuckGo HTML fallback — no login wall, no heavy JS. NOTE: from a
    // Cloud Run datacenter IP this frequently returns an empty/challenge
    // page (this was the root cause of P5's 100% search-skip rate before
    // the Bright Data routing above was added) — kept only as a fallback
    // when Bright Data isn't configured/available, with loud logging so a
    // silent 0-links result is never mistaken for "no match found".
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
    console.log(`  [P5 search/${asin}] DuckDuckGo fallback returned ${links.length} link(s) for "${query}"${links.length === 0 ? ' — likely blocked from this IP' : ''}`);
    return links;
  } finally {
    await page.close();
  }
}

// Raw-fetch a single page's body text through the P5 browser chain, with an
// explicit retry: if the primary context (which may be the ISP proxy) comes
// back empty/blocked, force a fresh connect via the Browser API (WSS) and
// retry the SAME url once before giving up. Never throws — returns '' on
// total failure so callers can still use Perplexity's findings alone.
async function fetchRawPageWithRetry(browserContext, url, asin) {
  const tryOnce = async (ctx) => {
    const page = await ctx.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(500);
      const bodyText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
      return bodyText.replace(/\s+/g, ' ').trim().substring(0, 15000);
    } finally {
      await page.close();
    }
  };

  let excerpt = '';
  try {
    excerpt = await tryOnce(browserContext);
  } catch (err) {
    console.log(`  [P5 fetch/${asin}] primary raw-page fetch errored for ${url}: ${err.message}`);
  }

  if (!excerpt || excerpt.length < 40) {
    console.log(`  [P5 fetch/${asin}] primary raw-page fetch empty/blocked for ${url} — retrying via Bright Data Browser API`);
    const retry = await launchBrowserAPIOnly({ label: `P5 raw-fetch retry ${asin}` });
    if (retry) {
      try {
        excerpt = await tryOnce(retry.context);
      } catch (err) {
        console.log(`  [P5 fetch/${asin}] Browser API retry fetch errored for ${url}: ${err.message}`);
      } finally {
        await retry.close();
      }
    } else {
      console.log(`  [P5 fetch/${asin}] no Browser API retry path available (BRIGHTDATA_BROWSER_WSS unset) — giving up on raw fetch for ${url}`);
    }
  }
  return excerpt;
}

/**
 * Perplexity-first off-Amazon discovery. Returns:
 *   { skipped: false, perplexity_findings, citations, source_url, source_type,
 *     raw_html_excerpt, extracted }
 *   — perplexity_findings alone is enough to count as source=true even if
 *   raw_html_excerpt ends up empty (raw fetch failed/blocked).
 *   { skipped: true, reason } if Perplexity itself returned nothing usable.
 */
async function findAndScrapeSourceViaPerplexity(browserContext, product, keyword) {
  const brand = product.brand || '';
  const title = product.title || '';
  const asin = product.asin;

  const result = await perplexityResearchBrand(brand, title, keyword);
  if (!result || !result.content) {
    console.log(`  [P5 search/${asin}] Perplexity returned no usable findings — will fall back to legacy search path`);
    return { skipped: true, reason: 'Perplexity returned no usable findings' };
  }

  const nCitations = (result.citations || []).length;
  console.log(`  [P5 search/${asin}] Perplexity returned findings (${result.content.length} chars) + ${nCitations} citation(s)`);

  const candidates = pickConfidentUrls(result.citations, brand, 2);
  let sourceUrl = null, sourceType = null, excerpt = '';

  for (const cand of candidates) {
    console.log(`  [P5 search/${asin}] attempting raw-page fetch of citation: ${cand.url} (${cand.type})`);
    const fetched = await fetchRawPageWithRetry(browserContext, cand.url, asin);
    if (fetched && fetched.length >= 40) {
      sourceUrl = cand.url;
      sourceType = cand.type;
      excerpt = fetched;
      console.log(`  [P5 search/${asin}] raw-page fetch succeeded for ${cand.url} (${excerpt.length} chars)`);
      break;
    }
    console.log(`  [P5 search/${asin}] raw-page fetch failed/empty for ${cand.url}`);
  }

  if (!sourceUrl && candidates.length) {
    // Raw fetch failed for every candidate, but Perplexity's findings still
    // stand on their own — surface the top citation as the recorded source
    // URL (for provenance) even though we have no raw excerpt for it.
    sourceUrl = candidates[0].url;
    sourceType = candidates[0].type;
    console.log(`  [P5 search/${asin}] no raw page fetched — using Perplexity findings alone as the source (citation recorded for provenance)`);
  }

  const extracted = {
    perplexity_findings: result.content,
    citations: result.citations || [],
    signals: excerpt ? extractSignalsFromText(excerpt) : null,
  };

  return {
    skipped: false,
    engine: 'perplexity',
    source_url: sourceUrl,
    source_type: sourceType || 'perplexity_synthesis',
    raw_html_excerpt: excerpt || null,
    extracted,
    perplexity_findings: result.content,
    citations: result.citations || [],
  };
}

async function findAndScrapeSourceLegacy(browserContext, product, keyword) {
  const brand = product.brand || '';
  const title = product.title || '';
  const asin = product.asin;
  if (!brand && !title) {
    console.log(`  [P5 search/${asin}] skipped — no brand/title to search`);
    return null;
  }

  const query = `${brand} ${title}`.trim().substring(0, 120);
  let links = [];
  let engine = 'none';

  try {
    // Primary: real Playwright search (browserContext may be connected via
    // Bright Data's Scraping Browser over CDP — see utils/bright-data-browser.js
    // — in which case this now runs through a residential IP and DDG stops
    // being blocked; if BRIGHTDATA_BROWSER_WSS isn't set yet it's the same
    // local-Playwright DDG call as before).
    links = await searchViaDuckDuckGo(browserContext, query, asin);
    engine = 'duckduckgo';

    // Secondary fallback: Bright Data's REST SERP endpoint, in case the
    // Playwright search path still comes back empty (e.g. local Playwright
    // with no Bright Data browser configured yet).
    if (links.length === 0) {
      const bd = await searchViaBrightData(query);
      if (bd && bd.links.length) {
        links = bd.links;
        engine = 'brightdata-serp';
        console.log(`  [P5 search/${asin}] Bright Data SERP REST fallback returned ${links.length} link(s) for "${query}"`);
      }
    }

    if (links.length === 0) {
      const reason = 'search returned 0 links via both DuckDuckGo-Playwright and the Bright Data SERP REST fallback';
      console.log(`  [P5 search/${asin}] SKIPPED — ${reason}`);
      return { skipped: true, reason };
    }

    const pick = pickConfidentResult(links, brand);
    if (!pick) {
      console.log(`  [P5 search/${asin}] SKIPPED — ${links.length} link(s) found via ${engine} but none matched the brand/retailer confidence filter`);
      return { skipped: true, reason: `no confident brand/retailer match in ${links.length} ${engine} search results` };
    }
    console.log(`  [P5 search/${asin}] confident match via ${engine}: ${pick.url} (${pick.type})`);

    const sourcePage = await browserContext.newPage();
    try {
      await sourcePage.goto(pick.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await sourcePage.waitForTimeout(500);
      const bodyText = await sourcePage.locator('body').innerText({ timeout: 5000 }).catch(() => '');
      const excerpt = bodyText.replace(/\s+/g, ' ').trim().substring(0, 15000);

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
    console.log(`  [P5 search/${asin}] SKIPPED — scrape error: ${err.message}`);
    return { skipped: true, reason: `scrape error: ${err.message}` };
  }
}

/**
 * Top-level off-Amazon discovery dispatcher: Perplexity (primary, if
 * PERPLEXITY_API_KEY is set) → legacy DuckDuckGo/Bright-Data-SERP scrape
 * (fallback). Logs which path ran on every call so this is never silent.
 */
async function findAndScrapeSource(browserContext, product, keyword) {
  const brand = product.brand || '';
  const title = product.title || '';
  const asin = product.asin;
  if (!brand && !title) {
    console.log(`  [P5 search/${asin}] skipped — no brand/title to search`);
    return null;
  }

  if (getPerplexityKey()) {
    console.log(`  [P5 search/${asin}] discovery path: Perplexity`);
    const result = await findAndScrapeSourceViaPerplexity(browserContext, product, keyword);
    if (result && !result.skipped) return result;
    console.log(`  [P5 search/${asin}] Perplexity path yielded nothing — falling back to legacy DuckDuckGo/Bright-Data-SERP search`);
  } else {
    console.log(`  [P5 search/${asin}] discovery path: legacy DuckDuckGo/Bright-Data-SERP (PERPLEXITY_API_KEY not set)`);
  }

  return findAndScrapeSourceLegacy(browserContext, product, keyword);
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
  // dovive_p5_sources.source_url is NOT NULL — if Perplexity returned
  // findings but had zero citations to attach a URL to, there's nothing to
  // persist here (the findings still fed the P8/prompt grounding via
  // sourceBlock — this table just tracks per-URL scraped provenance).
  if (!scraped.source_url) {
    console.log(`  [P5 source/${asin}] no source_url to persist to dovive_p5_sources (Perplexity findings had no usable citation) — findings still used in the prompt`);
    return;
  }
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
//
// Tolerant section matcher — the model doesn't always reproduce the exact
// "### N. HEADING" markdown requested in the prompt (heading level can drift
// between ## and ###, the numbering/period can be dropped, models sometimes
// bold the heading instead). Matches by heading NAME only, any heading level
// 2-4, optional leading number, optional trailing colon, case-insensitive.
function matchNamedSection(text, name, nextNames) {
  const next = nextNames.length
    ? `(?:\\n#{2,4}\\s*(?:\\d+\\.?\\s*)?(?:${nextNames.join('|')})|---\\s*\\n|$)`
    : '(?:---\\s*\\n|$)';
  const re = new RegExp(`#{2,4}\\s*(?:\\d+\\.?\\s*)?${name}\\s*:?\\s*\\n?([\\s\\S]*?)${next}`, 'i');
  return text.match(re)?.[1]?.trim() || '';
}

// sourceExtracted can be the legacy flat shape ({certifications, ...}) or
// the Perplexity shape ({perplexity_findings, citations, signals:{certifications,...}}).
function certificationsFromExtracted(sourceExtracted) {
  return sourceExtracted?.certifications || sourceExtracted?.signals?.certifications || [];
}

function parseResearchOutput(rawText, product, pool, meta) {
  const threatMatch = rawText.match(/\*\*Threat Level:?\*\*\s*([^\n\-–]+)/i)
    || rawText.match(/Threat Level:?\s*([^\n\-–]+)/i);
  const threatLevel = threatMatch?.[1]?.trim().split(/[\s,]/)[0] || 'Unknown';

  const sectionNames = [
    'FORMULA SNAPSHOT',
    'MARKET POSITION',
    'CONSUMER SENTIMENT',
    'THIRD-PARTY TESTING (?:&|AND) TRANSPARENCY',
    'DOVIVE COMPETITIVE ANGLE',
    'THREAT ASSESSMENT',
    'KEY INTELLIGENCE SUMMARY',
  ];

  const formulaSection  = matchNamedSection(rawText, sectionNames[0], sectionNames.slice(1));
  const angleSection    = matchNamedSection(rawText, sectionNames[4], sectionNames.slice(5));
  const threatsSection  = matchNamedSection(rawText, sectionNames[5], sectionNames.slice(6));
  const summarySection  = matchNamedSection(rawText, sectionNames[6], []);

  const keyBullets = summarySection
    .split('\n')
    .filter(l => l.trim().startsWith('-') || l.trim().startsWith('•') || l.trim().startsWith('*'))
    .map(l => l.replace(/^[-•*]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 5);

  // If none of the named sections matched anything at all, the model likely
  // deviated from the requested structure entirely (free-form prose, a
  // different heading scheme, etc). We NEVER lose the raw text in this case
  // (full_research below always carries it) — just flag it loudly so it's
  // visible in the pipeline logs and in data_grounding.parse_fallback.
  const anyStructuredContent = !!(formulaSection || angleSection || threatsSection || keyBullets.length);
  if (!anyStructuredContent) {
    console.warn(`  ⚠ P5 parse fallback: no structured sections matched for ${product.asin} (${product.brand || 'unknown brand'}) — saving full_research raw text only, structured fields will be empty`);
  }

  return {
    asin: product.asin,
    keyword: product.keyword || KEYWORD,
    brand: product.brand || 'Unknown',
    bsr_rank: product.bsr_current || null,
    pool: pool,
    benefits: keyBullets.slice(0, 3),
    features: [],
    formula_notes: formulaSection.substring(0, 800),
    certifications: certificationsFromExtracted(meta.sourceExtracted),
    awards: [],
    third_party_tested: certificationsFromExtracted(meta.sourceExtracted).length > 0,
    transparency_flag: !certificationsFromExtracted(meta.sourceExtracted).length,
    reddit_sentiment: 'unknown',
    reddit_notes: '',
    reddit_sources: [],
    external_reviews: [],
    healthline_covered: false,
    labdoor_score: null,
    key_weaknesses: (threatsSection.match(/Where they'?re vulnerable:?\*{0,2}\s*([\s\S]*?)(?:\n\*\*|\n#{2,4}|$)/i)?.[1] || '').trim().substring(0, 400),
    key_strengths: (threatsSection.match(/Why they win:?\*{0,2}\s*([\s\S]*?)(?:\n\*\*|\n#{2,4}|$)/i)?.[1] || '').trim().substring(0, 400),
    competitor_angle: angleSection.substring(0, 600),
    full_research: rawText,
    researched_at: new Date().toISOString(),
    researched_by: meta.model,
    data_grounding: {
      had_real_amazon_data: meta.hasRealData,
      had_source_scrape: !!meta.sourceUrl,
      source_url: meta.sourceUrl || null,
      had_perplexity_findings: !!meta.hadPerplexityFindings,
      perplexity_citation_count: meta.citationCount || 0,
      memory_fallback: meta.memoryFallback,
      parse_fallback: !anyStructuredContent,
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
    .filter(r => r.researched_by?.includes('claude') || r.researched_by?.includes('grok'))
    .map(r => `${r.asin}_${r.pool}`));
}

// ─── Save to DOVIVE Supabase ───────────────────────────────────────────────────

// CRITICAL: full_research (the raw model brief) must never be silently
// dropped, even if some other field in the record doesn't match the live
// table schema. Previous behavior stripped `pool`, `full_research`, AND
// `data_grounding` together on ANY error whose message contained "column" —
// but `data_grounding` was the only field actually missing from the deployed
// table, so full_research (real content) was being thrown away as
// collateral damage on every save. Now: only the specific column named in
// the Postgres/PostgREST error is dropped and retried, full_research is
// never removed by the auto-drop loop, and if every other field has to be
// dropped, a last-resort raw-only row (still containing full_research) is
// saved so nothing is lost.
async function saveToSupabase(record) {
  let attempt = { ...record };
  const RAW_ONLY_FIELDS = ['asin', 'keyword', 'brand', 'bsr_rank', 'pool', 'full_research', 'researched_at', 'researched_by', 'phase'];

  for (let i = 0; i < 8; i++) {
    const { error } = await DOVIVE.from('dovive_phase5_research')
      .upsert(attempt, { onConflict: 'asin,keyword' });
    if (!error) return;

    // Try to identify the specific offending column from the error message,
    // e.g. "Could not find the 'data_grounding' column of 'dovive_phase5_research' in the schema cache"
    const missingCol = error.message?.match(/'([a-zA-Z0-9_]+)'\s*column/i)?.[1]
      || error.message?.match(/column\s+"?([a-zA-Z0-9_]+)"?\s+(?:of|does not exist)/i)?.[1];

    if (missingCol && missingCol in attempt && missingCol !== 'full_research') {
      console.log(`  NOTE: dovive_phase5_research is missing column '${missingCol}' — dropping just that field and retrying (full_research is preserved)`);
      const { [missingCol]: _drop, ...rest } = attempt;
      attempt = rest;
      continue;
    }

    // Couldn't isolate a single droppable column (or the culprit is
    // full_research itself, which we refuse to drop silently) — fall back
    // to a minimal raw-only row so the raw brief still lands in the DB.
    console.error(`  WARNING: dovive_phase5_research save failed (${error.message}) — falling back to a raw-only row so full_research is not lost`);
    const rawOnly = {};
    for (const f of RAW_ONLY_FIELDS) if (f in record) rawOnly[f] = record[f];
    const { error: error2 } = await DOVIVE.from('dovive_phase5_research')
      .upsert(rawOnly, { onConflict: 'asin,keyword' });
    if (error2) throw new Error(`Save failed for ${record.asin} even for the raw-only fallback: ${error2.message}`);
    console.log(`  Saved raw-only fallback row for ${record.asin} (some structured fields were dropped due to a save error, but full_research is intact)`);
    return;
  }
  throw new Error(`Save failed for ${record.asin}: too many missing-column retries`);
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
  let sourceBlock = '**Off-Amazon source:** Not attempted or no confident match found — relying on Amazon DB data only.';
  let sourceUrl = null, sourceExtracted = null, hadPerplexityFindings = false, citationCount = 0;

  if (scraped && !scraped.skipped) {
    sourceUrl = scraped.source_url;
    sourceExtracted = scraped.extracted;
    hadPerplexityFindings = !!scraped.perplexity_findings;
    citationCount = (scraped.citations || []).length;

    if (scraped.perplexity_findings) {
      // Perplexity path: feed BOTH the synthesized findings and any raw
      // fetched page excerpt into the prompt as off-Amazon grounding.
      const rawBlock = scraped.raw_html_excerpt
        ? `\n\n**Raw page excerpt (${scraped.source_type}, fetched just now from a Perplexity citation):**\nURL: ${scraped.source_url}\n${scraped.raw_html_excerpt.substring(0, 15000)}`
        : `\n\n**Raw page fetch:** not available (citation page could not be fetched — relying on Perplexity's synthesis only).`;
      sourceBlock = `**Off-Amazon source (Perplexity live web research, ${citationCount} citation(s)):**
${scraped.perplexity_findings}${rawBlock}`;
    } else {
      sourceBlock = `**Off-Amazon source (${scraped.source_type}, Playwright-scraped just now):**
URL: ${scraped.source_url}
Extracted: ${JSON.stringify(scraped.extracted)}
Page excerpt: ${scraped.raw_html_excerpt.substring(0, 15000)}`;
    }
    await saveSource(product.asin, KEYWORD, scraped);
  } else if (scraped?.skipped) {
    sourceBlock = `**Off-Amazon source:** SKIPPED — ${scraped.reason}. Do not assume brand-site facts; note as unknown.`;
  }

  // Perplexity findings alone (even with no raw page fetch) count as a real
  // off-Amazon source — only fall back to pure model-memory if there's
  // neither real Amazon DB data NOR any Perplexity/scrape source at all.
  const memoryFallback = !grounding.hasRealData && !sourceUrl && !hadPerplexityFindings;
  const model = memoryFallback ? P5_REASONING_MODEL : P5_FAST_MODEL;
  // Uncapped to a generous 32000-token ceiling — with reasoning disabled, actual
  // output (~500-700 word brief) won't approach it; this just removes the cap
  // as a source of truncation. No per-mode split needed anymore.
  const maxTokens = 64000;

  const prompt = buildGroundedPrompt(product, rank, pool, KEYWORD, groundingText, sourceBlock, memoryFallback);
  const rawOutput = await callGrok(prompt, { model, maxTokens });
  if (!rawOutput) throw new Error(`Empty response from AI model (${model})`);

  const record = parseResearchOutput(rawOutput, product, pool, {
    model, hasRealData: grounding.hasRealData, sourceUrl, sourceExtracted, memoryFallback,
    hadPerplexityFindings, citationCount,
  });

  await saveToSupabase(record);
  await saveToDashProduct(product.asin, record);

  console.log(`  [P5 source/${product.asin}] perplexity=${hadPerplexityFindings} citations=${citationCount} rawPageFetched=${!!scraped?.raw_html_excerpt} source=${!!sourceUrl || hadPerplexityFindings}`);

  return {
    rawLen: rawOutput.length, model, memoryFallback, hadSource: !!sourceUrl || hadPerplexityFindings,
    hadRealData: grounding.hasRealData, hadPerplexityFindings, citationCount,
  };
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

  const { context: browserContext, close: closeBrowser } = await launchBrowserContext({ label: 'P5 browser', useProxy: true });

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

  await closeBrowser();

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
