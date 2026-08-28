/**
 * migrate-p1-to-dash.js
 * Creates a DASH category for a keyword and migrates P1 products from
 * dovive_research → supplement-scope-dash products table.
 *
 * Usage:
 *   node migrate-p1-to-dash.js "melatonin gummies"
 *   node migrate-p1-to-dash.js --keyword "melatonin gummies"
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { resolveCategory } = require('./utils/category-resolver');

const DOVIVE = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const DASH = createClient(
  process.env.DASH_URL || process.env.SUPABASE_URL,
  process.env.DASH_KEY || process.env.SUPABASE_KEY
);

const _kwIdx = process.argv.indexOf('--keyword');
const KEYWORD = _kwIdx >= 0
  ? process.argv[_kwIdx + 1]
  : (process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null);

if (!KEYWORD) {
  console.error('Usage: node migrate-p1-to-dash.js "keyword here"');
  process.exit(1);
}

function toTitleCase(str) {
  return str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

async function getOrCreateCategory() {
  // 2026-08-28 (diagnose-first task): this used to do its OWN lookup
  // (`.eq('search_term', KEYWORD).limit(1)`, no ORDER BY, no tie-break) —
  // a SEPARATE, non-deterministic resolution path from the one every other
  // phase uses (`utils/category-resolver.js` resolveCategory(), which
  // does an exact search_term match with a deterministic highest-live-
  // product-count tie-break when duplicates exist). Two duplicate
  // "Magnesium Gummies" categories (same name AND search_term, created 34s
  // apart) already exist in DASH from that non-determinism, and because
  // `.limit(1)` with no ORDER BY has no guaranteed row order, this script
  // could pick either one on a given run while resolveCategory() picked
  // the other — split-brain writes (P1 -> category A, P2/P3/P4/verifier ->
  // category B). Now delegates to the SAME resolveCategory() every other
  // phase/verifier uses, so category resolution is identical everywhere.
  // Only creates a brand-new row when resolveCategory() confirms none
  // exists at all (keyword genuinely new).
  try {
    const cat = await resolveCategory(DASH, KEYWORD);
    console.log(`  → Category resolved (${cat.method}): "${cat.name}" (${cat.id})`);
    return cat.id;
  } catch (e) {
    // resolveCategory() throws "No category candidates found" (or ambiguous
    // ties, which we do NOT want to silently resolve here) only when the
    // keyword truly has zero existing categories. Any other error (ambiguous
    // tie, DB error) should surface, not silently fall through to creating
    // yet another duplicate.
    if (!/No category candidates found/i.test(e.message)) {
      throw e;
    }
  }

  // Create new category
  const name = toTitleCase(KEYWORD);
  const { data, error } = await DASH
    .from('categories')
    .insert({ name, search_term: KEYWORD, last_scanned: new Date().toISOString() })
    .select('id, name')
    .single();

  if (error) throw new Error(`Failed to create category: ${error.message}`);
  console.log(`  → Created category: "${data.name}" (${data.id})`);
  return data.id;
}

/**
 * 2026-08-28 (stale-duplicate-products cleanup task): resolveCategory()'s
 * exact search_term match is CASE-SENSITIVE. Over the pipeline's history,
 * the same conceptual category ("ashwagandha gummies") has been created
 * multiple times with different casing (e.g. "Ashwagandha Gummies" back in
 * March vs "ashwagandha gummies" in a later run) — each one is a genuinely
 * separate `categories` row with its own `id`, so the SAME ASIN can get a
 * fresh `products` row inserted under the new category id every time the
 * casing drifts, while its old row (with stale price/title) sits orphaned
 * under the old category id forever. The dashboard's price aggregation has
 * no way to tell these apart from real products, so a single old $607
 * orphan can blow up a category's average price next to real $10-30 rows.
 * This does NOT rename/merge the duplicate `categories` rows themselves
 * (that's a separate, riskier cleanup — other phases/tables may reference
 * those ids) — it only self-heals `products`: on every re-run, before
 * writing this run's rows, delete any pre-existing `products` rows for the
 * SAME ASINs sitting under a SIBLING category (same name/search_term,
 * case-insensitive, different id), so no orphan can survive a re-run.
 */
async function findSiblingCategoryIds(categoryId, categoryName) {
  const normalized = (categoryName || KEYWORD || '').trim().toLowerCase();
  if (!normalized) return [];

  const [byName, bySearchTerm] = await Promise.all([
    DASH.from('categories').select('id,name').ilike('name', categoryName || ''),
    DASH.from('categories').select('id,search_term').ilike('search_term', KEYWORD || ''),
  ]);

  const siblingIds = new Set();
  for (const c of (byName.data || [])) {
    if (c.id !== categoryId && (c.name || '').trim().toLowerCase() === normalized) siblingIds.add(c.id);
  }
  for (const c of (bySearchTerm.data || [])) {
    if (c.id !== categoryId && (c.search_term || '').trim().toLowerCase() === normalized) siblingIds.add(c.id);
  }
  return [...siblingIds];
}

async function cleanupCrossCategoryOrphans(categoryId, categoryName, asins) {
  if (!asins.length) return 0;
  const siblingIds = await findSiblingCategoryIds(categoryId, categoryName);
  if (!siblingIds.length) return 0;

  const { data: orphans, error } = await DASH
    .from('products')
    .select('id,asin,category_id')
    .in('category_id', siblingIds)
    .in('asin', asins);
  if (error) {
    console.error(`  WARN: cross-category orphan lookup failed: ${error.message}`);
    return 0;
  }
  if (!orphans?.length) return 0;

  const { error: delErr } = await DASH.from('products').delete().in('id', orphans.map(o => o.id));
  if (delErr) {
    console.error(`  WARN: failed to delete ${orphans.length} cross-category orphan(s): ${delErr.message}`);
    return 0;
  }
  console.log(`  → Removed ${orphans.length} stale orphan row(s) from ${siblingIds.length} duplicate categor${siblingIds.length === 1 ? 'y' : 'ies'} sharing this keyword`);
  return orphans.length;
}

async function run() {
  console.log(`\n=== P1 Migration: dovive_research → supplement-scope-dash ===`);
  console.log(`Keyword: "${KEYWORD}"\n`);

  // 1. Get or create the DASH category
  const categoryId = await getOrCreateCategory();
  const { data: catRow } = await DASH.from('categories').select('name').eq('id', categoryId).single();

  // 2. Fetch P1 products from dovive_research
  const { data: products, error: fetchErr } = await DOVIVE
    .from('dovive_research')
    .select('*')
    .eq('keyword', KEYWORD);

  if (fetchErr) throw fetchErr;
  console.log(`Fetched ${products.length} products from dovive_research`);

  if (!products.length) {
    console.log('No products to migrate. Run P1 scraper first.');
    return { categoryId, migrated: 0 };
  }

  // 3. Get existing ASINs in DASH for this category (to skip duplicates)
  const { data: existing } = await DASH
    .from('products')
    .select('asin')
    .eq('category_id', categoryId);
  const existingAsins = new Set((existing || []).map(p => p.asin));
  console.log(`Already in DASH: ${existingAsins.size} products`);

  // 3b. Self-heal: purge any stale rows for these ASINs sitting under a
  // duplicate sibling category (see cleanupCrossCategoryOrphans doc above).
  const allAsins = [...new Set(products.map(p => p.asin).filter(Boolean))];
  const orphansRemoved = await cleanupCrossCategoryOrphans(categoryId, catRow?.name, allAsins);

  // 4. Map + upsert products
  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for (const p of products) {
    if (existingAsins.has(p.asin)) { skipped++; continue; }

    // Parse images
    let imageUrls = [];
    let mainImageUrl = null;
    try {
      const imgs = typeof p.images === 'string' ? JSON.parse(p.images) : (p.images || []);
      imageUrls = Array.isArray(imgs) ? imgs : [];
      mainImageUrl = imageUrls[0] || null;
    } catch {}

    // Parse bullet_points
    let featureBullets = [];
    let featureBulletsText = '';
    try {
      const bp = typeof p.bullet_points === 'string' ? JSON.parse(p.bullet_points) : (p.bullet_points || []);
      featureBullets = Array.isArray(bp) ? bp : [];
      featureBulletsText = featureBullets.join('\n');
    } catch {
      featureBulletsText = p.bullet_points || '';
    }

    const priceVal = p.price ? parseFloat(String(p.price).replace(/[^0-9.]/g, '')) || null : null;
    const row = {
      asin: p.asin,
      category_id: categoryId,
      title: p.title || '',
      brand: p.brand || null,
      price: priceVal,
      current_price: priceVal,
      rating_value: p.rating || null,
      rating_count: p.review_count || null,
      feature_bullets: featureBullets,
      feature_bullets_text: featureBulletsText,
      specifications: p.specs || null,
      image_urls: imageUrls,
      main_image_url: p.main_image || mainImageUrl || null,
      bsr_current: p.bsr || null,
      keyword_rank: p.rank_position || null,
      created_at: p.scraped_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // 2026-08-29: PROGRAMMATIC upsert — the previous `.upsert(row,
    // {onConflict:'asin,category_id'})` failed on EVERY row ("no unique or
    // exclusion constraint matching the ON CONFLICT specification") because
    // the live products table has NO unique constraint on that pair (it
    // can't be added until the stale-duplicate cleanup runs). Select the
    // existing row id for (asin, category_id) and UPDATE it in place, else
    // INSERT — no DB constraint required, same no-orphans guarantee.
    const { data: existRows, error: existErr } = await DASH.from('products')
      .select('id').eq('asin', p.asin).eq('category_id', categoryId).limit(2);
    let error = existErr || null;
    if (!error) {
      if (existRows && existRows.length > 0) {
        // Update the first; if a same-category dupe somehow exists, remove it.
        ({ error } = await DASH.from('products').update(row).eq('id', existRows[0].id));
        if (!error && existRows.length > 1) {
          await DASH.from('products').delete().eq('asin', p.asin).eq('category_id', categoryId).neq('id', existRows[0].id);
        }
      } else {
        ({ error } = await DASH.from('products').insert(row));
      }
    }
    if (error) {
      console.error(`  ERROR ${p.asin}: ${error.message}`);
      errors++;
      continue;
    }
    migrated++;
    if (migrated % 20 === 0) console.log(`  ${migrated} migrated...`);
  }

  // 5. Self-heal the category row itself: the dashboard's "Recently
  // Analyzed Categories" grid was reading this row directly (stale
  // `total_products` written once at category creation, stale
  // `updated_at`/`last_scanned` never bumped by this script) — a genuine
  // new run (e.g. 139 fresh products) could sit invisibly behind an old
  // duplicate category showing a months-old timestamp. Refresh with the
  // real live count + "now" so this row stays honest for anything that
  // reads it directly instead of recomputing counts itself.
  const { count: finalCount, error: finalCountErr } = await DASH
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('category_id', categoryId);

  if (finalCountErr) {
    console.error(`  WARN: failed to recount products for category refresh: ${finalCountErr.message}`);
  } else {
    const { error: catRefreshErr } = await DASH.from('categories').update({
      total_products: finalCount || 0,
      updated_at: new Date().toISOString(),
      last_scanned: new Date().toISOString(),
    }).eq('id', categoryId);
    if (catRefreshErr) {
      console.error(`  WARN: failed to refresh category row: ${catRefreshErr.message}`);
    } else {
      console.log(`  → Category row refreshed: total_products=${finalCount || 0}, updated_at=now`);
    }
  }

  console.log(`\n=== DONE ===`);
  console.log(`Migrated: ${migrated}`);
  console.log(`Skipped (already in DASH): ${skipped}`);
  console.log(`Errors: ${errors}`);
  console.log(`Cross-category orphans removed: ${orphansRemoved}`);
  console.log(`Category ID: ${categoryId}`);

  return { categoryId, migrated, skipped, errors, orphansRemoved };
}

run().catch(console.error);
