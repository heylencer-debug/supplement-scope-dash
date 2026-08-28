/**
 * dedupe-exact-products.js
 *
 * Removes EXACT (asin, category_id) duplicate rows from DASH `products`,
 * keeping the newest (updated_at, then created_at) row per pair. This is
 * the precondition for the products_asin_category_unique constraint —
 * ADD CONSTRAINT fails while any duplicate pair exists.
 *
 * Usage:
 *   node dedupe-exact-products.js --dry-run
 *   node dedupe-exact-products.js
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const DASH = createClient(
  process.env.DASH_URL || process.env.SUPABASE_URL,
  process.env.DASH_KEY || process.env.SUPABASE_KEY
);
const DRY = process.argv.includes('--dry-run');

(async () => {
  // Page through the whole table — PostgREST caps a single select at 1000.
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await DASH.from('products')
      .select('id, asin, category_id, updated_at, created_at')
      .order('id', { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  console.log(`Loaded ${rows.length} product rows`);

  const byPair = new Map();
  for (const r of rows) {
    const k = `${r.asin}|${r.category_id}`;
    if (!byPair.has(k)) byPair.set(k, []);
    byPair.get(k).push(r);
  }

  const toDelete = [];
  let pairs = 0;
  for (const [k, group] of byPair) {
    if (group.length < 2) continue;
    pairs++;
    group.sort((a, b) =>
      new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0));
    toDelete.push(...group.slice(1).map(r => r.id));
  }
  console.log(`Duplicate (asin,category_id) pairs: ${pairs} | rows to delete: ${toDelete.length}`);

  if (DRY) { console.log('(dry run — nothing deleted)'); return; }

  for (let i = 0; i < toDelete.length; i += 50) {
    const batch = toDelete.slice(i, i + 50);
    const { error } = await DASH.from('products').delete().in('id', batch);
    if (error) { console.error('DELETE ERROR:', error.message); process.exit(1); }
  }
  console.log(`Deleted ${toDelete.length} duplicate rows. Table is now unique on (asin, category_id).`);
})();
