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
 * the panel is found. Results here SUPPLEMENT phase4-text-extract.js rows —
 * migrate-ocr-to-dash.js already picks whichever dovive_ocr row (per ASIN)
 * has the most supplement_facts items, so a strong text-extraction result is
 * never clobbered by a weaker image-OCR one.
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
const { parseModelJson } = require('./utils/ocr-utils');

const KEYWORD         = process.argv[2] || 'ashwagandha gummies';
const TEST_MODE       = process.argv.includes('--test');
const _topNIdx        = process.argv.indexOf('--top-n');
const OCR_TOP_N        = _topNIdx > -1 ? parseInt(process.argv[_topNIdx + 1]) : parseInt(process.env.OCR_TOP_N || '20');
const OCR_MAX_IMAGES   = parseInt(process.env.OCR_MAX_IMAGES || '5');
const OPENROUTER_KEY  = process.env.OPENROUTER_API_KEY;
const supabase        = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
// See file header — no network egress here to verify the exact dated Gemini
// Flash slug, so default to OpenRouter's "latest" alias. Override with
// OCR_MODEL once confirmed.
const ANALYSIS_MODEL  = process.env.OCR_MODEL || process.env.ANALYSIS_MODEL || 'google/gemini-flash-latest';

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
  "serving_size": "string or null",
  "servings_per_container": "string or null",
  "supplement_facts": [
    { "name": "nutrient/ingredient name", "amount": "amount per serving", "dv_percent": "% DV or null" }
  ],
  "other_ingredients": "full list as string or null",
  "health_claims": ["array of health claims/benefits shown"],
  "certifications": ["Non-GMO", "Organic", "GMP", "NSF", "Vegan", etc],
  "raw_text": "all visible text concatenated"
}

If no supplement facts panel is visible, still extract any product claims, ingredients, or certifications visible.
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
    recordAiUsage({ phase: 'P4', model: ANALYSIS_MODEL, usage: data.usage, keyword: KEYWORD }).catch(() => {});
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
async function saveOCR(record) {
  const { error } = await supabase
    .from('dovive_ocr')
    .upsert(record, { onConflict: 'asin,image_index' });
  if (error) throw new Error('Save error: ' + error.message);
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
    .select('asin, title, keyword, images, main_image, bsr')
    .ilike('keyword', KEYWORD)
    .not('images', 'is', null)
    .order('bsr', { ascending: true, nullsFirst: false });

  if (error) throw new Error(error.message);
  console.log(`\nFound ${products.length} products with images`);

  const topByBsr = products.slice(0, OCR_TOP_N);
  console.log(`Scoped to top ${topByBsr.length} by BSR (OCR_TOP_N=${OCR_TOP_N})`);

  const processed = await getProcessed(KEYWORD);
  const toProcess = topByBsr.filter(p => !processed.has(p.asin));
  console.log(`Already processed: ${processed.size} | To process: ${toProcess.length}`);

  const list = TEST_MODE ? toProcess.slice(0, 1) : toProcess;
  if (!list.length) { console.log('✅ All in-scope products already processed!'); return; }

  let saved = 0, skipped = 0, totalTokens = 0;

  for (let i = 0; i < list.length; i++) {
    const product = list[i];
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

        // Save each image result
        await saveOCR({
          asin:                  product.asin,
          keyword:               KEYWORD,
          image_url:             imageUrl,
          image_index:           imgIdx,
          serving_size:          result.serving_size || null,
          servings_per_container: result.servings_per_container || null,
          supplement_facts:      result.supplement_facts?.length ? result.supplement_facts : null,
          other_ingredients:     result.other_ingredients || null,
          health_claims:         result.health_claims?.length ? result.health_claims : null,
          certifications:        result.certifications?.length ? result.certifications : null,
          raw_text:              result.raw_text || null,
          gpt_model:             ANALYSIS_MODEL,
          processed_at:          new Date().toISOString()
        });

        if (result.has_supplement_facts && !bestResult) {
          bestResult = result;
          bestImageIdx = imgIdx;
          // Stop scanning this product — facts panel found (cost control).
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

  console.log(`\n✅ Done. ${saved} products processed | ${skipped} skipped | ~${totalTokens} total tokens`);
  console.log(`   Estimated cost: ~$${(totalTokens * 0.000005).toFixed(3)}`);
}

main().catch(err => { console.error('Fatal:', err.message, err.stack?.slice(0,300)); process.exit(1); });
