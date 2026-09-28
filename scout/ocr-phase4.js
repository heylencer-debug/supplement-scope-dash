/**
 * ocr-phase4.js — Phase 4: Gemini Flash Vision OCR on product images
 *
 * Pulls product images from dovive_research → sends to Gemini Flash Vision
 * (via OpenRouter) → extracts structured supplement facts → saves to
 * dovive_ocr table.
 *
 * 2026-08-28: switched from Claude/GPT vision to Gemini Flash per user
 * directive, routed through OpenRouter so OPENROUTER_API_KEY covers it (same
 * credit balance as every other OpenRouter call in this pipeline). Model slug
 * is env-configurable (OCR_MODEL) — defaults to `google/gemini-flash-latest`,
 * OpenRouter's maintained alias for the current-generation Gemini Flash
 * model, because this environment has no network egress to openrouter.ai to
 * confirm the exact dated slug (e.g. a "3.x" release) at write time.
 *
 * Scope/cost control (2026-08-28): only the TOP N products by BSR are
 * scanned (env OCR_TOP_N, default 20) — this is real image-vision OCR, far
 * more expensive per call than the P4 text-extraction pass which already
 * covers ~everything from bullet_points. Per product: scan at most
 * OCR_MAX_IMAGES (default 5) gallery images, and STOP as soon as one comes
 * back with has_supplement_facts=true — no need to keep burning calls once
 * the panel is found (a panel whose label is ANOTHER product — flavour or brand
 * mismatch — does not count as found; scanning continues). Results here SUPPLEMENT phase4-text-extract.js rows —
 * migrate-ocr-to-dash.js resolves each product field from its own best source
 * (utils/label-sources.js: facts-panel image > text for nutrients, text
 * wording for certifications, conflicts recorded), and never promotes a
 * panel whose label_product_match verdict is 'mismatch' (another product).
 *
 * 2026-09-27 (migration 013): each row also gets facts_v2 (utils/label-facts.js
 * — basis, per-unit, elemental vs compound, extract vs equivalent, evidence
 * line) and label_product_match (utils/label-variant.js — does this label's
 * flavour/count/brand match the listing and its Keepa variation?).
 *
 * Image source note: this reads dovive_research.images, which the Bright
 * Data fallback (bright-data-amazon.js normaliseProduct) populates the same
 * as the Playwright path — the full Amazon PDP image gallery, source-
 * agnostic. Neither Bright Data's Products dataset nor Amazon itself labels
 * which gallery image *is* the facts panel — it's just "image #N" in
 * whatever order the listing has it, commonly slots 2-7 for supplement
 * products but not guaranteed.
 *
 * Usage: node ocr-phase4.js "<keyword>" [--test] [--top-n <n>]
 */

require('dotenv').config();
const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');
const { withUsageTracking, recordAiUsage } = require('./utils/ai-usage');
const { parseModelJson, normalizeFacts } = require('./utils/ocr-utils');
const { buildFactsV2 } = require('./utils/label-facts');
const { checkLabelProductMatch, loadKeepaVariants } = require('./utils/label-variant');
const { createOcrWriter } = require('./utils/ocr-row-write');
const { resolveCategory } = require('./utils/category-resolver');
const { reportProgress } = require('./utils/job-heartbeat');
const { reuseAsinsFromEnv, rescrapeAsinsFromEnv } = require('./utils/reuse-asins');
const { loadSelection, applySelection } = require('./utils/selected-competitors');

const KEYWORD         = require('./utils/keyword-arg').requireKeyword('node ocr-phase4.js "<session label>" [--test] [--top-n <n>]');
// 2026-09-01: resolved once in main() below, purely so recordAiUsage() can
// attribute P4's cost to the right category (P4 previously omitted
// categoryId entirely — its real AI spend, often the largest single-phase
// cost in a run, never showed up in the per-category "AI Cost" card, only
// the job-level roll-up). Best-effort — a resolution failure just leaves
// this null and P4's cost still lands correctly in the job-level total.
let _categoryId = null;
const TEST_MODE       = process.argv.includes('--test');
const _topNIdx        = process.argv.indexOf('--top-n');
const OCR_TOP_N        = _topNIdx > -1 ? parseInt(process.argv[_topNIdx + 1]) : parseInt(process.env.OCR_TOP_N || '20');
const OCR_MAX_IMAGES   = parseInt(process.env.OCR_MAX_IMAGES || '5');
const OPENROUTER_KEY  = process.env.OPENROUTER_API_KEY;
const supabase        = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
// See file header — no network egress here to verify the exact dated Gemini
// Flash slug, so default to OpenRouter's "latest" alias. Override with
// OCR_MODEL once confirmed.
// 2026-09-15: fixed — the bare alias 400'd on every call ("...is not a valid
// model ID"), 20/20 products failed this run before the fix. Confirmed live
// against GET https://openrouter.ai/api/v1/models that OpenRouter's alias
// slugs need a leading `~` (id/canonical_slug are both
// `~google/gemini-flash-latest`, currently redirecting to
// google/gemini-3.8-flash) — see the matching fix in phase4-text-extract.js.
const ANALYSIS_MODEL  = process.env.OCR_MODEL || process.env.ANALYSIS_MODEL || '~google/gemini-flash-latest';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Gemini Flash Vision call — no blind retry, honesty policy ───
// Empty/near-empty output retries ONCE at the same budget. finish_reason
// length with substantial content is kept as-is (logged, not retried).
async function analyzeImageWithGemini(imageUrl, asin, title, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await _analyzeImageWithGemini(imageUrl, asin, title);
    } catch (err) {
      if (err.message.includes('[ERROR: credits]')) throw err;
      const isRateLimit = err.message.includes('429') || err.message.includes('rate limit') || err.message.includes('Rate limit');
      const isServer    = err.message.includes('500') || err.message.includes('503');
      if ((isRateLimit || isServer) && attempt < retries) {
        const wait = isRateLimit ? attempt * 20000 : attempt * 5000;
        console.log(`\n  ⏳ Rate limited. Waiting ${wait/1000}s before retry ${attempt+1}/${retries}...`);
        await sleep(wait);
      } else {
        throw err;
      }
    }
  }
}

async function _analyzeImageWithGemini(imageUrl, asin, title) {
  const prompt = `You are analyzing an Amazon product image for a supplement product.
ASIN: ${asin}
Product: ${title}

Extract ALL text visible in this image and return a JSON object with these fields:
{
  "has_supplement_facts": boolean,
  "serving_size": "string or null, exactly as printed (e.g. '2 Gummies', '1 Scoop (22g)')",
  "servings_per_container": "string or null",
  "supplement_facts": [
    {
      "name": "nutrient/ingredient name exactly as printed, INCLUDING any '(as …)', '(from …)', extract ratio or standardisation text",
      "amount": "amount per serving exactly as printed, with its unit (e.g. '300 mg', '25 mcg (1000 IU)', '1.7mg (1 gummy) / 3.4mg (2 gummies)')",
      "dv_percent": "% DV or null",
      "basis": "per_serving | per_unit | per_day | per_container — ONLY if the label states it (e.g. an 'Amount Per Serving' header, 'per gummy'); else null",
      "compound": "the source compound printed for this row (e.g. 'magnesium glycinate'), or null",
      "elemental_amount": "the elemental amount if the label prints it separately (e.g. 'Providing Elemental Magnesium 70.8 mg' → '70.8 mg'), else null",
      "extract_ratio": "extract ratio if printed (e.g. '10:1'), else null",
      "equivalent_amount": "whole-herb/plant equivalent if printed (e.g. 'equivalent to 500 mg of root' → '500 mg'), else null",
      "standardised_to": "standardisation if printed (e.g. '5% withanolides'), else null",
      "evidence_excerpt": "the exact line of label text this row was read from, verbatim, at most 160 characters"
    }
  ],
  "other_ingredients": "full list as string or null",
  "health_claims": ["array of health claims/benefits shown"],
  "certifications": ["Non-GMO", "Organic", "GMP", "NSF", "Vegan", etc],
  "label_identity": {
    "brand": "brand name printed on the package, or null",
    "product_name": "product name printed on the package, or null",
    "flavor": "flavor printed on the package, or null",
    "count": "container count printed on the package (e.g. '60 Gummies'), or null"
  },
  "raw_text": "all visible text concatenated"
}

Copy what is printed. Never compute, convert or infer a value: if the label does not print it, use null.
If no supplement facts panel is visible, still extract any product claims, ingredients, certifications or package identity visible.
Return ONLY valid JSON, no markdown.`;

  // Plain OpenAI-shape chat request works for Gemini on OpenRouter. Vision
  // content parts: {type:'text'} + {type:'image_url', image_url:{url}} —
  // the OpenAI `detail` hint is dropped (Gemini ignores/doesn't use it).
  const MAX_TOKENS = parseInt(process.env.OCR_MAX_TOKENS || '16000');

  const doCall = async () => {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://dovive.com',
        'X-Title': 'DOVIVE Scout P4 OCR'
      },
      body: JSON.stringify(withUsageTracking({
        model: ANALYSIS_MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageUrl } }
          ]
        }]
      }))
    });

    if (res.status === 402) {
      console.error(`  ❌ OpenRouter credits exhausted — top up at openrouter.ai`);
      throw new Error('[ERROR: credits] OpenRouter credits exhausted (402)');
    }

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenRouter error ${res.status}: ${err.slice(0, 200)}`);
    }

    const data = await res.json();
    if (data.error) throw new Error(`Gemini OCR error: ${data.error.message || JSON.stringify(data.error)}`);
    recordAiUsage({ phase: 'P4', model: ANALYSIS_MODEL, usage: data.usage, categoryId: _categoryId, keyword: KEYWORD }).catch(() => {});
    const choice = data.choices?.[0];
    const content = choice?.message?.content || '';
    const finishReason = choice?.finish_reason || 'unknown';
    return { content, finishReason, usage: data.usage };
  };

  let { content, finishReason, usage } = await doCall();
  console.log(`\n  finish_reason: ${finishReason} | output_chars: ${content.length}`);

  // Retry decision is based on PARSEABILITY, not raw character count — Gemini
  // Flash 3.7 legitimately returns compact JSON (e.g. `has_supplement_facts:
  // false` with empty arrays) that can land under any fixed char threshold
  // while still being complete, valid output. A char-length heuristic was
  // treating those correct-but-terse answers as "near-empty" and burning an
  // extra retry call, and — when the retry came back similarly compact —
  // throwing a false [ERROR: truncated/empty] that discarded a real result.
  // finish_reason='length' (genuinely hit the token ceiling) is still logged;
  // only an UNPARSEABLE response is treated as evidence of truncation now.
  let parsed = parseModelJson(content).parsed;

  if (!parsed) {
    console.log(`  ⚠️  Unparseable output (finish_reason=${finishReason}, ${content.length} chars) — retrying once at same budget...`);
    const retry = await doCall();
    console.log(`  finish_reason (retry): ${retry.finishReason} | output_chars: ${retry.content.length}`);
    const retryParsed = parseModelJson(retry.content).parsed;
    if (!retryParsed) {
      throw new Error('[ERROR: truncated/empty] — retry still produced no parseable content');
    }
    content = retry.content;
    usage = retry.usage;
    parsed = retryParsed;
  } else if (finishReason === 'length') {
    console.log(`  [NOTE: output reached token ceiling] — content still parsed as valid JSON, keeping it`);
  }

  return { result: parsed, usage };
}

// ── Save to Supabase ──────────────────────────────────────────
// Migration 013 (facts_v2, label_product_match) is optional: the writer
// retries once without those columns and stops sending them.
const ocrWriter = createOcrWriter(supabase);
async function saveOCR(record) {
  await ocrWriter.upsert(record);
}

// ── Get already processed ASINs ───────────────────────────────
async function getProcessed(keyword) {
  let allData = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('dovive_ocr')
      .select('asin, image_index')
      .eq('keyword', keyword)
      .range(from, from + pageSize - 1);
    if (error || !data?.length) break;
    allData = allData.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  // An ASIN is "fully processed" if image_index 0 exists (we attempted it)
  return new Set(allData.filter(r => r.image_index === 0).map(r => r.asin));
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  console.log(`\n🔍 Phase 4 — Image OCR with Gemini Flash Vision (${ANALYSIS_MODEL})`);
  console.log(`   Keyword: "${KEYWORD}"`);
  console.log(`   Mode: ${TEST_MODE ? 'TEST (1 product)' : `TOP ${OCR_TOP_N} by BSR`}`);
  console.log(`   Max images/product: ${OCR_MAX_IMAGES} (stops early once facts panel found)`);

  try {
    const cat = await resolveCategory(supabase, KEYWORD);
    _categoryId = cat.id;
    console.log(`   Category (for cost attribution): ${cat.name} (${cat.id})`);
  } catch (e) {
    console.warn(`   ⚠ Could not resolve category for cost attribution (${e.message}) — P4 AI cost will still land in the job-level total, just not the per-category breakdown`);
  }

  // Get products — ordered by BSR so we scope the expensive vision pass to
  // the top N products only (env OCR_TOP_N, default 20).
  // Session-isolation fix (2026-09-01): was a first-word TITLE substring
  // match ('%electrolyte%'), which pulled in every dovive_research row from
  // ANY category/session whose title happens to contain that word —
  // including totally unrelated products, and (for a "#N" session) a
  // sibling session's own rows. human-bsr.js writes the full session label
  // to this table's `keyword` column for every row it scrapes, so an exact
  // case-insensitive match on `keyword` scopes OCR to THIS run's own
  // products only.
  const { data: products, error } = await supabase
    .from('dovive_research')
    .select('asin, title, brand, keyword, images, main_image, bsr')
    .ilike('keyword', KEYWORD)
    .not('images', 'is', null)
    .order('bsr', { ascending: true, nullsFirst: false });

  if (error) throw new Error(error.message);
  console.log(`\nFound ${products.length} products with images`);

  // Competitor selection (2026-09-26, migration 011): scope the vision pass
  // to the selected competitors in selection_rank order (still capped at
  // OCR_TOP_N); inactive selection → top N by BSR exactly as before.
  const selection = await loadSelection(supabase, _categoryId);
  const topByBsr = applySelection(products, selection).slice(0, OCR_TOP_N);
  console.log(selection.active
    ? `Scoped to top ${topByBsr.length} selected competitors by selection rank (OCR_TOP_N=${OCR_TOP_N})`
    : `Scoped to top ${topByBsr.length} by BSR (OCR_TOP_N=${OCR_TOP_N}; competitor selection inactive: ${selection.why})`);

  const processed = await getProcessed(KEYWORD);
  // READ-FIRST plan: facts older than the freshness window with no fresh copy — redo.
  for (const a of rescrapeAsinsFromEnv()) processed.delete(a);
  // READ-FIRST plan: facts already OCR'd under a sibling session — dovive_ocr
  // is UNIQUE(asin, image_index), so migrate-ocr-to-dash.js (reads by ASIN)
  // lands them in this session without paying for the vision pass again.
  const reuseAsins = reuseAsinsFromEnv();
  if (reuseAsins.size) console.log(`READ-FIRST plan: ${reuseAsins.size} ASINs reused from sibling sessions (not re-OCR'd)`);
  const toProcess = topByBsr.filter(p => !processed.has(p.asin) && !reuseAsins.has(p.asin));
  console.log(`Already processed: ${processed.size} | To process: ${toProcess.length}`);

  const list = TEST_MODE ? toProcess.slice(0, 1) : toProcess;
  if (!list.length) { console.log('✅ All in-scope products already processed!'); return; }

  // 2026-09-01: SESSION-ISOLATION FIX — dovive_ocr is UNIQUE(asin,
  // image_index) BY DESIGN (one canonical OCR record per real product
  // image, shared across every session that ever scraped it — same
  // rationale as dovive_keepa). But saveOCR()'s upsert always included
  // `keyword: KEYWORD`, so a sibling session re-OCRing the same image
  // silently REASSIGNED the `keyword` column — corrupting the ORIGINAL
  // session's keyword-scoped data (getProcessed() above reads it as the
  // "already done" gate) exactly like the dovive_keepa bug found live this
  // session. Pre-fetch which (asin, image_index) pairs already exist so
  // `keyword` is only set on first INSERT, never clobbered by a later
  // session's re-scrape.
  const existingOcrKeys = new Set();
  const listAsins = list.map(p => p.asin);
  for (let i = 0; i < listAsins.length; i += 100) {
    const chunk = listAsins.slice(i, i + 100);
    try {
      const { data } = await supabase.from('dovive_ocr').select('asin, image_index').in('asin', chunk);
      (data || []).forEach(r => existingOcrKeys.add(`${r.asin}::${r.image_index}`));
    } catch (e) {
      console.warn(`  ⚠ Pre-fetch of existing dovive_ocr rows failed (${e.message}) — keyword attribution may not be preserved for this batch`);
    }
  }

  // Keepa's own variation attributes (flavour, size) for the label check —
  // read-only, fail-open (an empty map just means the title alone is used).
  const keepaVariants = await loadKeepaVariants(supabase, listAsins);
  let saved = 0, skipped = 0, totalTokens = 0, labelMismatches = 0;

  for (let i = 0; i < list.length; i++) {
    const product = list[i];

    // Mid-phase heartbeat (throttled internally to ~10 products/60s) — see
    // scout/utils/job-heartbeat.js. Placed at the top of the loop (not just
    // the bottom) so the early "no valid image URLs" `continue` below still
    // reports progress. Fail-open, never blocks OCR.
    await reportProgress(i, list.length);

    try {
    let images = product.images || [];
    // Handle case where images is stored as a JSON string
    if (typeof images === 'string') {
      try { images = JSON.parse(images); } catch { images = [images]; }
    }
    if (!Array.isArray(images)) images = [images];
    images = images.filter(u => u && typeof u === 'string' && u.startsWith('http'));
    if (!images.length) {
      console.log(`\n[${i + 1}/${list.length}] [P4 OCR/${product.asin}] images_scanned=0 facts_found=false nutrients=0 (no valid image URLs)`);
      skipped++;
      continue;
    }

    console.log(`\n[${i + 1}/${list.length}] ${product.asin} — ${product.title?.slice(0, 55)}`);
    console.log(`  Images available: ${images.length} (scanning up to ${OCR_MAX_IMAGES})`);

    // Analyze images up to OCR_MAX_IMAGES, STOP as soon as facts panel found.
    let bestResult = null;
    let bestImageIdx = 0;
    let imagesScanned = 0;

    for (let imgIdx = 0; imgIdx < Math.min(images.length, OCR_MAX_IMAGES); imgIdx++) {
      const imageUrl = images[imgIdx];
      // Skip invalid URLs
      if (!imageUrl || !imageUrl.startsWith('http')) {
        console.log(`  [img ${imgIdx}] Skipped (invalid URL)`);
        continue;
      }
      imagesScanned++;
      try {
        process.stdout.write(`  [img ${imgIdx}] Analyzing... `);
        const { result, usage } = await analyzeImageWithGemini(imageUrl, product.asin, product.title);
        totalTokens += usage?.total_tokens || 0;
        process.stdout.write(`${result.has_supplement_facts ? '✅ SUPPLEMENT FACTS' : '⬜ no facts'} | tokens: ${usage?.total_tokens}\n`);

        // Save each image result — `keyword` only set on genuine first-write
        // for this (asin, image_index) pair (see existingOcrKeys above).
        const ocrKeywordField = existingOcrKeys.has(`${product.asin}::${imgIdx}`) ? {} : { keyword: KEYWORD };
        // Legacy column keeps its { name, amount, dv_percent } shape; the v2
        // hints the prompt now asks for go to facts_v2 only.
        const legacyFacts = normalizeFacts(result.supplement_facts);
        const factsV2 = legacyFacts.length ? buildFactsV2({
          facts: result.supplement_facts,
          serving_size: result.serving_size,
          servings_per_container: result.servings_per_container,
          raw_text: result.raw_text,
          is_panel: !!result.has_supplement_facts,
          source: { asin: product.asin, image_url: imageUrl, image_index: imgIdx },
        }) : null;
        const identity = result.label_identity || {};
        const labelMatch = legacyFacts.length ? checkLabelProductMatch({
          asin: product.asin,
          title: product.title,
          brand: product.brand,
          label: { ...identity, raw_text: result.raw_text, serving_size: result.serving_size, servings_per_container: result.servings_per_container },
          keepa: keepaVariants.get(product.asin) || null,
        }) : null;
        if (labelMatch && labelMatch.verdict === 'mismatch') {
          labelMismatches++;
          console.log(`\n  ⚠ [P4 label check/${product.asin}] image ${imgIdx} looks like another product — ${labelMatch.why} (kept in dovive_ocr, not promoted; scanning on)`);
        } else if (labelMatch && labelMatch.verdict === 'match_by_serving') {
          console.log(`\n  ⓘ [P4 label check/${product.asin}] image ${imgIdx}: ${labelMatch.why}`);
        }
        await saveOCR({
          asin:                  product.asin,
          ...ocrKeywordField,
          image_url:             imageUrl,
          image_index:           imgIdx,
          serving_size:          result.serving_size || null,
          servings_per_container: result.servings_per_container || null,
          supplement_facts:      legacyFacts.length ? legacyFacts : null,
          facts_v2:              factsV2,
          label_product_match:   labelMatch,
          other_ingredients:     result.other_ingredients || null,
          health_claims:         result.health_claims?.length ? result.health_claims : null,
          certifications:        result.certifications?.length ? result.certifications : null,
          raw_text:              result.raw_text || null,
          gpt_model:             ANALYSIS_MODEL,
          processed_at:          new Date().toISOString()
        });

        // Stop at the first facts panel that belongs to THIS product (cost
        // control). A panel whose label is another product (flavour/brand
        // mismatch) is saved but not used — keep scanning for the right one,
        // still within OCR_MAX_IMAGES. A pack-size sibling's panel
        // (match_by_serving) is the same product per serving: stop there.
        if (result.has_supplement_facts && !bestResult && !(labelMatch && labelMatch.verdict === 'mismatch')) {
          bestResult = result;
          bestImageIdx = imgIdx;
          break;
        }

        await sleep(1500); // Rate limit buffer between images
      } catch (err) {
        if (err.message.includes('[ERROR: credits]')) throw err;
        console.log(`  [img ${imgIdx}] Error: ${err.message.slice(0, 80)}`);
        await sleep(1000);
      }
    }

    const nutrientsFound = bestResult?.supplement_facts?.length || 0;
    console.log(`  [P4 OCR/${product.asin}] images_scanned=${imagesScanned} facts_found=${!!bestResult} nutrients=${nutrientsFound}`);
    if (bestResult) {
      console.log(`  ✓ Supplement facts found at image ${bestImageIdx}`);
      console.log(`    Serving: ${bestResult.serving_size} | Nutrients: ${nutrientsFound}`);
      console.log(`    Claims: ${bestResult.health_claims?.join(', ').slice(0, 80)}`);
      console.log(`    Certs: ${bestResult.certifications?.join(', ')}`);
    }

    saved++;
    } catch (productErr) {
      if (productErr.message.includes('[ERROR: credits]')) throw productErr; // fail fast, don't loop into more 402s
      console.error(`  ✗ Product ${product.asin} fatal error: ${productErr.message?.slice(0, 100)}`);
      skipped++;
    }
    await sleep(2000); // Buffer between products
  }

  await reportProgress(list.length, list.length); // final heartbeat — always fires regardless of throttle

  console.log(`\n✅ Done. ${saved} products processed | ${skipped} skipped | ~${totalTokens} total tokens`);
  if (labelMismatches) console.log(`   ⚠ ${labelMismatches} facts panel(s) did not match their listing's product/variation — see the label-check lines above`);
  console.log(`   Estimated cost: ~$${(totalTokens * 0.000005).toFixed(3)}`);
}

main().catch(err => { console.error('Fatal:', err.message, err.stack?.slice(0,300)); process.exit(1); });
