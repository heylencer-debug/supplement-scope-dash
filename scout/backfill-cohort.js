/**
 * backfill-cohort.js — one-shot, free (no AI calls) backfill of
 * products.cohort for every EXISTING product that already has a matching
 * dovive_keepa row.
 *
 * Every future category gets tagged automatically by migrate-keepa-to-dash.js
 * (which now computes the same classifier right after each Keepa sync — see
 * scout/utils/cohort.js). This script exists only to retrofit categories
 * that were already analyzed before cohort tagging shipped, so their
 * competitive-benchmarking UI and any future formula-brief regeneration get
 * the same Established/Emerging split without a paid re-run.
 *
 * Safe to re-run — idempotent (recomputes and overwrites `cohort` from the
 * same deterministic signals every time).
 *
 * Usage: node backfill-cohort.js
 *   (no args — this is a global, one-shot pass across every category)
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { classifyCohort } = require('./utils/cohort');

const DB = createClient(
  process.env.DASH_URL || process.env.SUPABASE_URL,
  process.env.DASH_KEY || process.env.SUPABASE_KEY
);

const PAGE_SIZE = 1000;

/** Fetch every row from a table, paginated (Supabase default cap is 1000/request). */
async function fetchAll(table, select, extra = (q) => q) {
  const rows = [];
  let from = 0;
  for (;;) {
    let q = DB.from(table).select(select).range(from, from + PAGE_SIZE - 1);
    q = extra(q);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

async function run() {
  console.log('=== Cohort backfill (one-shot, free) ===\n');

  console.log('Fetching all products...');
  // rating_count (2026-09-03) — the classifier's review-count signal.
  // Sourced from HERE (products.rating_count, the real P1 Bright Data
  // scrape count), not dovive_keepa.review_count — a live sanity check
  // against Nuun/Liquid I.V./LMNT found the Keepa field stuck at ~45-48 for
  // nearly every ASIN (vs Liquid I.V.'s real ~106k), which silently zeroed
  // out the entire ESTABLISHED cohort on the first run of this script. See
  // the matching comment in migrate-keepa-to-dash.js.
  const products = await fetchAll('products', 'id, asin, category_id, brand, title, cohort, rating_count');
  console.log(`✓ ${products.length} products`);

  const asins = [...new Set(products.map((p) => p.asin).filter(Boolean))];
  console.log(`✓ ${asins.length} unique ASINs\n`);

  console.log('Fetching dovive_keepa signals for those ASINs...');
  const keepaByAsin = new Map();
  const KEEPA_CHUNK = 300; // stay well under a PostgREST `in.()` URL length limit
  for (let i = 0; i < asins.length; i += KEEPA_CHUNK) {
    const chunk = asins.slice(i, i + KEEPA_CHUNK);
    const { data, error } = await DB
      .from('dovive_keepa')
      .select('asin, listed_since, release_date, monthly_sales_est, bsr_history_30d')
      .in('asin', chunk);
    if (error) throw error;
    for (const row of data || []) keepaByAsin.set(row.asin, row);
  }
  console.log(`✓ ${keepaByAsin.size} ASINs have Keepa data (the rest stay cohort=NULL — "not yet classified")\n`);

  let updated = 0;
  let errors = 0;
  const overall = { established: 0, emerging: 0, context: 0 };
  const byCategory = new Map(); // category_id -> { established, emerging, context, samples: [] }

  for (const p of products) {
    const k = keepaByAsin.get(p.asin);
    if (!k) continue; // no Keepa signals — leave cohort untouched (NULL)

    const { cohort } = classifyCohort({
      listedSince: k.listed_since,
      releaseDate: k.release_date,
      reviewCount: p.rating_count,
      monthlySalesEst: k.monthly_sales_est,
      bsrHistory30d: k.bsr_history_30d,
    });

    const { error } = await DB.from('products').update({ cohort }).eq('id', p.id);
    if (error) {
      console.error(`  ERROR ${p.asin}:`, error.message);
      errors++;
      continue;
    }

    updated++;
    overall[cohort] = (overall[cohort] || 0) + 1;
    if (!byCategory.has(p.category_id)) {
      byCategory.set(p.category_id, { established: 0, emerging: 0, context: 0, samples: [] });
    }
    const bucket = byCategory.get(p.category_id);
    bucket[cohort] = (bucket[cohort] || 0) + 1;
    if (cohort !== 'context' && bucket.samples.length < 6) {
      bucket.samples.push(`${p.brand || '?'} (${cohort})`);
    }

    if (updated % 100 === 0) console.log(`  ${updated}/${keepaByAsin.size} tagged...`);
  }

  console.log(`\n=== DONE ===`);
  console.log(`Tagged: ${updated} · Errors: ${errors}`);
  console.log(`Overall — established: ${overall.established} · emerging: ${overall.emerging} · context: ${overall.context}\n`);

  // Per-category sanity check — electrolyte categories should show
  // Liquid I.V./LMNT/Nuun landing 'established'.
  console.log('Per-category distribution (established/emerging/context, sample brands):');
  const catIds = [...byCategory.keys()];
  const { data: cats } = await DB.from('categories').select('id, name').in('id', catIds);
  const catNames = new Map((cats || []).map((c) => [c.id, c.name]));
  for (const [catId, bucket] of byCategory.entries()) {
    const name = catNames.get(catId) || catId;
    console.log(
      `  ${name}: ${bucket.established}E/${bucket.emerging}Em/${bucket.context}C — ${bucket.samples.join(', ') || '(no established/emerging in this category)'}`
    );
  }
}

run().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
