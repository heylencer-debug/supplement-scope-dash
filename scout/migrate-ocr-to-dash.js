/**
 * migrate-ocr-to-dash.js
 * Syncs P4 OCR data from dovive_ocr → supplement-scope-dash products table
 * Populates: all_nutrients, nutrients_count, ocr_confidence, servings_per_container, serving_size
 *
 * Confidence score logic:
 *   >= 8 nutrients → 0.92 (high)
 *   5–7 nutrients  → 0.78 (good)
 *   2–4 nutrients  → 0.55 (partial)
 *   1 nutrient     → 0.35 (low)
 *   0 / null       → 0.15 (very low)
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { resolveCategory } = require('./utils/category-resolver');

const DOVIVE = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const DASH = createClient(
  process.env.DASH_URL || process.env.SUPABASE_URL,
  process.env.DASH_KEY || process.env.SUPABASE_KEY
);

const kwIdx = process.argv.indexOf('--keyword');
const KEYWORD = kwIdx !== -1 ? process.argv[kwIdx + 1] : (process.argv[2] || 'ashwagandha gummies');

// Dynamic category lookup — resolves keyword → DASH category_id
async function lookupCategoryId(keyword) {
  const cat = await resolveCategory(DASH, keyword);
  console.log(`  → Resolved category (${cat.method}): "${cat.name}" (${cat.id})`);
  return cat.id;
}


function calcConfidence(facts) {
  const n = (facts || []).length;
  if (n >= 8) return 0.92;
  if (n >= 5) return 0.78;
  if (n >= 2) return 0.55;
  if (n >= 1) return 0.35;
  return 0.15;
}

// Pick best OCR record per ASIN: most supplement_facts items
function pickBest(records) {
  return records.reduce((best, cur) => {
    const curCount = (cur.supplement_facts || []).length;
    const bestCount = (best.supplement_facts || []).length;
    return curCount > bestCount ? cur : best;
  });
}

async function main() {
  console.log(`\n=== OCR Migration: dovive_ocr → supplement-scope-dash ===`);
  console.log(`Keyword: "${KEYWORD}"\n`);

  const DASH_CAT_ID = await lookupCategoryId(KEYWORD);

  // 2026-09-02: READ-SIDE MIRROR OF THE aca2339 WRITE-LEAK FIX — dovive_ocr
  // is UNIQUE(asin, image_index) BY DESIGN, shared across every session that
  // ever scraped that product image, with `keyword` set FIRST-WRITER-WINS
  // (aca2339, 2026-09-01) so a sibling session's re-OCR never clobbers the
  // ORIGINAL session's attribution. But that means a fresh session ("#N")
  // re-processing an ASIN a SIBLING session already OCR'd gets fresh,
  // correct data written to the row — while the row's `keyword` column
  // silently stays pinned to the sibling's session label. Fetching here by
  // `.eq('keyword', KEYWORD)` (the old code) therefore missed every
  // ASIN-overlapping row THIS session just paid to re-OCR, even though the
  // content was completely valid. Confirmed live on "electrolyte powder #4"
  // (2026-09-01/02): P4 spent real money OCR'ing/text-extracting all 40
  // products (40/40 saved), but only 15 dovive_ocr rows still carried this
  // session's exact keyword tag, syncing just 4/40 nutrients_count into
  // DASH — which then failed the P4 verifier gate on data that had, in
  // reality, just been freshly and correctly extracted. Fixed the same way
  // migrate-keepa-to-dash.js already does it for the identical
  // dovive_keepa case: resolve THIS session's ASIN list from
  // dovive_research (genuinely UNIQUE(asin, keyword), safe to filter by
  // keyword) first, then fetch dovive_ocr BY ASIN — never by its unreliable
  // `keyword` column.
  const { data: researchRows, error: researchErr } = await DOVIVE
    .from('dovive_research')
    .select('asin')
    .eq('keyword', KEYWORD);
  if (researchErr) { console.error('dovive_research fetch error:', researchErr.message); return; }
  const keywordAsins = (researchRows || []).map(r => r.asin);
  if (!keywordAsins.length) {
    console.log('No ASINs found in dovive_research for this keyword.');
    return;
  }
  console.log(`Found ${keywordAsins.length} ASINs in dovive_research for "${KEYWORD}"`);

  // 1. Load all OCR records for these ASINs (not by dovive_ocr.keyword — see above)
  const { data: ocrRows, error: ocrErr } = await DOVIVE
    .from('dovive_ocr')
    .select('asin,serving_size,servings_per_container,supplement_facts,certifications,health_claims')
    .in('asin', keywordAsins);

  if (ocrErr) { console.error('OCR fetch error:', ocrErr.message); return; }
  console.log(`Fetched ${ocrRows.length} OCR records`);

  // Group by ASIN, keep best record per ASIN
  const byAsin = new Map();
  for (const row of ocrRows) {
    const existing = byAsin.get(row.asin);
    if (!existing) {
      byAsin.set(row.asin, row);
    } else {
      // Keep record with more supplement_facts
      const existingCount = (existing.supplement_facts || []).length;
      const curCount = (row.supplement_facts || []).length;
      if (curCount > existingCount) byAsin.set(row.asin, row);
    }
  }
  console.log(`Unique ASINs with OCR data: ${byAsin.size}`);

  // 2. Load all products from DASH
  const { data: products, error: prodErr } = await DASH
    .from('products')
    .select('id,asin,title,bsr_current')
    .eq('category_id', DASH_CAT_ID);

  if (prodErr) { console.error('Products fetch error:', prodErr.message); return; }
  console.log(`Products in DASH: ${products.length}\n`);

  const dashByAsin = new Map(products.map(p => [p.asin, p]));

  let updated = 0, skipped = 0, errors = 0;
  const weakRows = [];

  for (const [asin, ocr] of byAsin) {
    const product = dashByAsin.get(asin);
    if (!product) { skipped++; continue; }

    const productId = product.id;
    const facts = Array.isArray(ocr.supplement_facts) ? ocr.supplement_facts.filter(f => f && f.name) : [];
    const confidence = calcConfidence(facts);
    const nutrientsCount = facts.length;

    // Build supplement_facts_raw as a human-readable text string (used by phase tracker + formula prompt)
    const sfRaw = facts.length > 0
      ? facts.map(f => `${f.name}: ${f.amount || '?'}${f.dv_percent ? ` (${f.dv_percent}% DV)` : ''}`).join('\n')
      : null;

    const updateData = {
      all_nutrients: facts.length > 0 ? facts : null,
      supplement_facts_raw: sfRaw,
      nutrients_count: nutrientsCount,
      ocr_confidence: confidence,
    };

    // Only set serving info if not already present
    if (ocr.serving_size) updateData.serving_size = ocr.serving_size;
    if (ocr.servings_per_container) updateData.servings_per_container = parseInt(ocr.servings_per_container) || null;
    if (ocr.certifications && Array.isArray(ocr.certifications) && ocr.certifications.length > 0) {
      updateData.claims_on_label = ocr.certifications;
    }

    const { error } = await DASH.from('products').update(updateData).eq('id', productId);
    if (error) {
      console.error(`  ✗ ${asin}: ${error.message}`);
      errors++;
    } else {
      updated++;
      if (nutrientsCount === 0) {
        weakRows.push({ asin, title: product.title || '', bsr: product.bsr_current || null, reason: 'empty_supplement_facts' });
      }
      if (updated % 20 === 0) console.log(`  ${updated} updated...`);
    }
  }

  console.log(`\n=== DONE ===`);
  console.log(`Updated: ${updated} products`);
  console.log(`Skipped (ASIN not in DASH): ${skipped}`);
  console.log(`Errors: ${errors}`);
  console.log(`\nFields now populated: all_nutrients, nutrients_count, ocr_confidence, serving_size, servings_per_container`);

  if (weakRows.length) {
    weakRows.sort((a, b) => (a.bsr || 9999999) - (b.bsr || 9999999));
    const top20Weak = weakRows.filter(r => r.bsr && r.bsr <= 20).length;
    console.log(`\n⚠ OCR weak rows (0 nutrients): ${weakRows.length} | top20 affected: ${top20Weak}`);
    console.log('Top weak rows by BSR:');
    weakRows.slice(0, 20).forEach(r => {
      console.log(`  - ${r.asin} | BSR ${r.bsr ?? 'NA'} | ${r.title.substring(0, 90)}`);
    });
  }
}

main().catch(console.error);
