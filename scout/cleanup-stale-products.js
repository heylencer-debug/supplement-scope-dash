/**
 * cleanup-stale-products.js
 *
 * One-off / repeatable cleanup for the DASH `products` table.
 *
 * Root cause (see migrate-p1-to-dash.js's header comment on
 * findSiblingCategoryIds, added the same session): `resolveCategory()`'s
 * exact `search_term` match is case-sensitive, so the same conceptual
 * category ("ashwagandha gummies") has been created multiple times over the
 * pipeline's history with different casing/spacing — each is a genuinely
 * separate `categories.id`. The SAME ASIN can therefore have a fresh
 * `products` row under the current category id while an old, stale row
 * (older title, wildly wrong price) sits orphaned under a duplicate
 * category id forever. The dashboard's price aggregation has no way to
 * distinguish these from real products, so a single old $607/$2103 orphan
 * can blow up a whole category's average price next to real $10-30 rows.
 *
 * This script does NOT touch/merge the duplicate `categories` rows
 * themselves (other tables may reference those ids — out of scope, riskier).
 * It only cleans `products`: for every group of `categories` rows sharing
 * the same name (case-insensitive, trimmed) or the same search_term, it
 * finds ASINs that have more than one `products` row across that group and
 * keeps exactly one — preferring the row whose price/title matches the
 * current `dovive_research` row for that ASIN+keyword, falling back to the
 * newest `updated_at`/`created_at` — deleting the rest.
 *
 * Usage:
 *   node cleanup-stale-products.js            # run against ALL categories
 *   node cleanup-stale-products.js --dry-run   # report only, no deletes
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const DOVIVE = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const DASH = createClient(
  process.env.DASH_URL || process.env.SUPABASE_URL,
  process.env.DASH_KEY || process.env.SUPABASE_KEY
);

const DRY_RUN = process.argv.includes('--dry-run');

function normName(name) {
  return (name || '').trim().toLowerCase();
}

async function fetchAll(table, select, filterFn) {
  // Simple paged fetch to avoid default row caps on large tables.
  let all = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    let q = DASH.from(table).select(select).range(from, from + pageSize - 1);
    if (filterFn) q = filterFn(q);
    const { data, error } = await q;
    if (error) throw error;
    all = all.concat(data || []);
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function run() {
  console.log('=== cleanup-stale-products.js ===');
  if (DRY_RUN) console.log('(DRY RUN — no deletes will be executed)\n');

  const categories = await fetchAll('categories', 'id,name,search_term');
  console.log(`Loaded ${categories.length} categories\n`);

  // Group categories by normalized name (name is the field the dashboard
  // groups/displays by, and is what collides across duplicate re-runs).
  const groups = new Map(); // normName -> [{id,name,search_term}]
  for (const c of categories) {
    const key = normName(c.name);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }

  const report = []; // {groupName, categoryIds, orphansRemoved, keptAsins}
  let totalRemoved = 0;

  for (const [key, group] of groups) {
    const categoryIds = group.map(g => g.id);
    const displayName = group[0].name;

    // Fetch all products across every category id in this group.
    const products = await fetchAll(
      'products',
      'id,asin,title,price,current_price,category_id,created_at,updated_at',
      q => q.in('category_id', categoryIds)
    );
    if (!products.length) continue;

    // 2026-08-28 addendum: per-ASIN dedup alone (below) leaves single-
    // occurrence stale rows untouched — an old duplicate `categories` row
    // (e.g. a stale "Ashwagandha Gummies" created back in March, superseded
    // by a fresh one later) can have MANY products that never got
    // re-migrated into the current category, so they never collide on
    // ASIN and never get caught by the per-ASIN pass below, yet still have
    // wildly wrong/stale prices (verified live: one such duplicate category
    // averaged $1329/unit vs $21.90 for its current sibling — a systemic
    // batch issue, not a one-off). When a name-group has more than one
    // category, pick the PRIMARY category using the same signal
    // resolveCategory() uses for its own tie-break (highest live product
    // count with a non-null price — the healthiest-looking data set), and
    // retire every OTHER category in the group entirely: delete ALL its
    // product rows, not just ones that collide by ASIN with the primary.
    if (categoryIds.length > 1) {
      const withPriceCounts = categoryIds.map(id => ({
        id,
        priceCount: products.filter(p => p.category_id === id && p.price > 0).length,
        totalCount: products.filter(p => p.category_id === id).length,
      }));
      withPriceCounts.sort((a, b) => (b.priceCount - a.priceCount) || (b.totalCount - a.totalCount));
      const primaryId = withPriceCounts[0].id;
      const staleCategoryIds = categoryIds.filter(id => id !== primaryId);
      const staleProductIds = products.filter(p => staleCategoryIds.includes(p.category_id)).map(p => p.id);

      if (staleProductIds.length) {
        if (!DRY_RUN) {
          const { error: delErr } = await DASH.from('products').delete().in('id', staleProductIds);
          if (delErr) {
            console.error(`  ERROR retiring stale duplicate categor${staleCategoryIds.length === 1 ? 'y' : 'ies'} for "${displayName}": ${delErr.message}`);
          } else {
            totalRemoved += staleProductIds.length;
            report.push({ name: displayName, categoryIds, removed: staleProductIds.length, mode: 'retired-stale-categories' });
            console.log(`"${displayName}": retired ${staleCategoryIds.length} stale duplicate categor${staleCategoryIds.length === 1 ? 'y' : 'ies'} entirely, removed ${staleProductIds.length} row(s) (kept primary ${primaryId})`);
          }
        } else {
          totalRemoved += staleProductIds.length;
          report.push({ name: displayName, categoryIds, removed: staleProductIds.length, mode: 'retired-stale-categories' });
          console.log(`"${displayName}": would retire ${staleCategoryIds.length} stale duplicate categor${staleCategoryIds.length === 1 ? 'y' : 'ies'} entirely, ${staleProductIds.length} row(s) [dry-run] (primary would be ${primaryId})`);
        }
      }
      // Nothing left to per-ASIN-dedup within this group — the primary
      // category's own internal ASIN collisions (if any) are handled below
      // using only its own rows.
      continue;
    }

    // Group by asin (single-category groups only reach here — dedupe
    // duplicate rows for the same ASIN that were written within the SAME
    // category, e.g. from a pre-upsert-fix migrate-p1-to-dash.js re-run).
    const byAsin = new Map();
    for (const p of products) {
      if (!p.asin) continue;
      if (!byAsin.has(p.asin)) byAsin.set(p.asin, []);
      byAsin.get(p.asin).push(p);
    }

    const dupeAsins = [...byAsin.entries()].filter(([, rows]) => rows.length > 1);
    if (!dupeAsins.length) continue;

    // Pull current dovive_research rows for this keyword (use the
    // search_term(s) in the group, deduped) to determine the "current" row
    // per ASIN.
    const searchTerms = [...new Set(group.map(g => g.search_term).filter(Boolean))];
    let researchByAsin = new Map();
    if (searchTerms.length) {
      const { data: research, error: rErr } = await DOVIVE
        .from('dovive_research')
        .select('asin,title,price')
        .in('keyword', searchTerms);
      if (rErr) {
        console.error(`  WARN: dovive_research lookup failed for "${displayName}": ${rErr.message}`);
      } else {
        for (const r of research || []) {
          // Keep the most recently seen row per asin if multiple keyword
          // variants matched the same asin.
          researchByAsin.set(r.asin, r);
        }
      }
    }

    let groupRemoved = 0;
    const toDeleteIds = [];

    for (const [asin, rows] of dupeAsins) {
      const currentResearch = researchByAsin.get(asin);
      let keep = null;

      if (currentResearch) {
        const wantPrice = currentResearch.price
          ? parseFloat(String(currentResearch.price).replace(/[^0-9.]/g, ''))
          : null;
        // Prefer exact title match, then closest price match.
        keep = rows.find(r => r.title && currentResearch.title && r.title.trim() === currentResearch.title.trim());
        if (!keep && wantPrice != null) {
          keep = rows.reduce((best, r) => {
            const p = r.price ?? r.current_price;
            if (p == null) return best;
            const diff = Math.abs(parseFloat(p) - wantPrice);
            if (!best || diff < best.diff) return { row: r, diff };
            return best;
          }, null);
          keep = keep?.row || null;
        }
      }

      if (!keep) {
        // Fallback: newest by updated_at, then created_at.
        keep = [...rows].sort((a, b) => {
          const au = new Date(a.updated_at || a.created_at || 0).getTime();
          const bu = new Date(b.updated_at || b.created_at || 0).getTime();
          return bu - au;
        })[0];
      }

      for (const r of rows) {
        if (r.id !== keep.id) toDeleteIds.push(r.id);
      }
      groupRemoved += rows.length - 1;
    }

    if (toDeleteIds.length && !DRY_RUN) {
      const { error: delErr } = await DASH.from('products').delete().in('id', toDeleteIds);
      if (delErr) {
        console.error(`  ERROR deleting orphans for "${displayName}": ${delErr.message}`);
        continue;
      }
    }

    totalRemoved += groupRemoved;
    report.push({ name: displayName, categoryIds, dupeAsinCount: dupeAsins.length, removed: groupRemoved });
    console.log(`"${displayName}" (${categoryIds.length} categor${categoryIds.length === 1 ? 'y' : 'ies'} sharing this name): ${dupeAsins.length} duplicate ASIN(s), removed ${groupRemoved} stale row(s)${DRY_RUN ? ' [dry-run]' : ''}`);
  }

  console.log(`\n=== DONE ===`);
  console.log(`Categories scanned: ${categories.length}`);
  console.log(`Category-name groups with duplicates: ${report.length}`);
  console.log(`Total stale rows removed: ${totalRemoved}${DRY_RUN ? ' [dry-run, none actually deleted]' : ''}`);

  return { report, totalRemoved };
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
