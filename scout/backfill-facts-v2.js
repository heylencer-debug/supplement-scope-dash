#!/usr/bin/env node
/**
 * backfill-facts-v2.js — deterministic, $0 backfill of the migration-013
 * columns on dovive_ocr rows written BEFORE the columns existed (or by a P4
 * run that skipped already-OCR'd ASINs): facts_v2 (utils/label-facts.js,
 * parsed from the stored supplement_facts / serving / raw_text) and
 * label_product_match (utils/label-variant.js, from the stored raw_text +
 * the listing title/brand + Keepa variations). No model or vision call — old
 * rows have no model-reported label_identity, so flavour/count evidence comes
 * from front-of-pack text only and the verdict is often 'unknown' (honest).
 *
 * Usage:
 *   node backfill-facts-v2.js --keyword "<kw>" [--keyword "<kw2>" …] [--force] [--dry-run]
 * Then run migrate-ocr-to-dash.js for each keyword to promote label_facts /
 * label_sources / label_conflicts onto products.
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { buildFactsV2 } = require('./utils/label-facts');
const { checkLabelProductMatch, loadKeepaVariants } = require('./utils/label-variant');

const argv = process.argv.slice(2);
const keywords = [];
for (let i = 0; i < argv.length; i++) if (argv[i] === '--keyword' && argv[i + 1]) keywords.push(argv[++i]);
const FORCE = argv.includes('--force');
const DRY = argv.includes('--dry-run');
if (!keywords.length) { console.error('usage: node backfill-facts-v2.js --keyword "<kw>" [--force] [--dry-run]'); process.exit(1); }

const DOVIVE = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const DASH = createClient(process.env.DASH_URL || process.env.SUPABASE_URL, process.env.DASH_KEY || process.env.SUPABASE_KEY);

async function all(q) { const out = []; for (let from = 0; ; from += 1000) { const { data, error } = await q.range(from, from + 999); if (error) throw error; out.push(...(data || [])); if (!data || data.length < 1000) break; } return out; }

(async () => {
  let totals = { rows: 0, updated: 0, skipped_present: 0, skipped_nofacts: 0, verdicts: {} };
  for (const kw of keywords) {
    const rows = await all(DOVIVE.from('dovive_ocr').select('id, asin, keyword, image_url, image_index, serving_size, servings_per_container, supplement_facts, raw_text, facts_v2, label_product_match').eq('keyword', kw).order('id'));
    const asins = [...new Set(rows.map((r) => r.asin))];
    const prods = new Map();
    for (let i = 0; i < asins.length; i += 200) {
      const { data } = await DASH.from('products').select('asin, title, brand').in('asin', asins.slice(i, i + 200));
      for (const p of data || []) if (!prods.has(p.asin)) prods.set(p.asin, p);
    }
    const keepa = await loadKeepaVariants(DOVIVE, asins);
    console.log(`\n# ${kw}: ${rows.length} ocr rows, ${asins.length} ASINs, keepa variants for ${keepa.size}`);
    for (const r of rows) {
      totals.rows++;
      if (r.facts_v2 && !FORCE) { totals.skipped_present++; continue; }
      const facts = Array.isArray(r.supplement_facts) ? r.supplement_facts.filter((f) => f && String(f.name || '').trim()) : [];
      if (!facts.length) { totals.skipped_nofacts++; continue; }
      const isPanel = r.image_index !== 99;
      const facts_v2 = buildFactsV2({ facts, serving_size: r.serving_size, servings_per_container: r.servings_per_container, raw_text: r.raw_text, is_panel: isPanel, source: { asin: r.asin, image_url: r.image_url, image_index: r.image_index } });
      let label_product_match = r.label_product_match || null;
      if (isPanel && (!label_product_match || FORCE)) {
        const p = prods.get(r.asin) || {};
        label_product_match = checkLabelProductMatch({ asin: r.asin, title: p.title || '', brand: p.brand || '', label: { raw_text: r.raw_text, serving_size: r.serving_size, servings_per_container: r.servings_per_container }, keepa: keepa.get(r.asin) || null });
        const v = label_product_match?.verdict || 'none';
        totals.verdicts[v] = (totals.verdicts[v] || 0) + 1;
      }
      if (!DRY) {
        const { error } = await DOVIVE.from('dovive_ocr').update({ facts_v2, label_product_match }).eq('id', r.id);
        if (error) { console.error(`  ✗ ${r.asin}#${r.image_index}: ${error.message}`); continue; }
      }
      totals.updated++;
    }
  }
  console.log(`\n${DRY ? 'DRY RUN — ' : ''}rows ${totals.rows} · ${DRY ? 'would update' : 'updated'} ${totals.updated} · already had facts_v2 ${totals.skipped_present} · no facts ${totals.skipped_nofacts} · panel verdicts ${JSON.stringify(totals.verdicts)}`);
})().catch((e) => { console.error('backfill failed:', e.message); process.exit(1); });
