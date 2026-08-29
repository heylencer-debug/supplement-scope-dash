/**
 * consolidate-categories.js — one-time (repeatable) category table consolidation.
 *
 * Problem: legacy n8n/per-ASIN-era runs left many near-duplicate category rows
 * ("=magnesium gummies" vs "Magnesium Gummies", search_term "ASIN: B0..."),
 * so the pipeline writes to one row while the dashboard reads another
 * (split-brain). This:
 *   1. Groups categories by normalized name (leading '='/whitespace/case
 *      stripped) and merges each group into ONE canonical row (prefers a real
 *      keyword search_term, then most live products).
 *      - products move to the canonical (or are deleted when the canonical
 *        already has that ASIN — constraint-safe, keeps canonical's copy)
 *      - formula_briefs / category_analyses move only if canonical lacks one
 *   2. Repairs surviving junk metadata: leading '=' stripped from names,
 *      "ASIN: ..." search_terms replaced with the lowercased clean name.
 *   3. Deletes empty shells (0 products, no brief, no analyses).
 *
 * Skips any group matching a currently running/queued scout_jobs keyword.
 *
 * Usage: node consolidate-categories.js [--dry-run]
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const DASH = createClient(
  process.env.DASH_URL || process.env.SUPABASE_URL,
  process.env.DASH_KEY || process.env.SUPABASE_KEY
);
const DOVIVE = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const DRY = process.argv.includes('--dry-run');

const norm = (s) => (s || '').replace(/^[=\s]+/, '').trim().toLowerCase();
const isRealSearchTerm = (s) => !!s && !/^asin:/i.test(s.trim()) && !s.startsWith('=') && s.trim().length > 2;

async function countProducts(catId) {
  const { count } = await DASH.from('products').select('*', { count: 'exact', head: true }).eq('category_id', catId);
  return count || 0;
}

(async () => {
  console.log(`=== consolidate-categories ${DRY ? '(DRY RUN)' : ''} ===\n`);

  // Skip groups for in-flight jobs
  const { data: activeJobs } = await DOVIVE.from('scout_jobs').select('keyword').in('status', ['queued', 'claimed', 'running']);
  const activeKeys = new Set((activeJobs || []).map(j => norm(j.keyword)));
  if (activeKeys.size) console.log(`In-flight job keywords (groups skipped): ${[...activeKeys].join(', ')}\n`);

  const { data: cats } = await DASH.from('categories').select('id, name, search_term');
  const groups = new Map();
  for (const c of cats || []) {
    const key = norm(c.name);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }

  let merged = 0, moved = 0, dupesDeleted = 0, shellsDeleted = 0, repaired = 0;

  for (const [key, group] of groups) {
    if (activeKeys.has(key)) { console.log(`⏭  "${key}" — in-flight job, skipped`); continue; }

    // live counts
    for (const c of group) c.live = await countProducts(c.id);

    // canonical: real search_term first, then most products, then oldest wins implicitly
    const canonical = [...group].sort((a, b) =>
      (isRealSearchTerm(b.search_term) - isRealSearchTerm(a.search_term)) || (b.live - a.live))[0];

    // 1. merge siblings into canonical
    for (const c of group) {
      if (c.id === canonical.id) continue;
      if (c.live > 0) {
        console.log(`"${key}": merging ${c.live} products from ${c.id.slice(0, 8)} ("${c.name}") → ${canonical.id.slice(0, 8)}`);
        if (!DRY) {
          const { data: canonAsins } = await DASH.from('products').select('asin').eq('category_id', canonical.id);
          const have = new Set((canonAsins || []).map(p => p.asin));
          // Each pass MOVES or DELETES the rows it reads, so always re-read
          // from offset 0 until the source category is empty.
          for (;;) {
            const { data: rows } = await DASH.from('products').select('id, asin').eq('category_id', c.id).range(0, 499);
            if (!rows || !rows.length) break;
            for (const p of rows) {
              if (have.has(p.asin)) {
                await DASH.from('products').delete().eq('id', p.id);
                dupesDeleted++;
              } else {
                const { error } = await DASH.from('products').update({ category_id: canonical.id }).eq('id', p.id);
                if (error) { console.error(`  move failed ${p.asin}: ${error.message}`); continue; }
                have.add(p.asin); moved++;
              }
            }
            if (rows.length < 500) break;
          }
        } else { moved += c.live; }
      }
      // move brief/analyses only if canonical lacks them
      if (!DRY) {
        const { data: canonFb } = await DASH.from('formula_briefs').select('id').eq('category_id', canonical.id).maybeSingle();
        if (canonFb) await DASH.from('formula_briefs').delete().eq('category_id', c.id);
        else await DASH.from('formula_briefs').update({ category_id: canonical.id }).eq('category_id', c.id);
        const { count: canonCa } = await DASH.from('category_analyses').select('*', { count: 'exact', head: true }).eq('category_id', canonical.id);
        if (canonCa) await DASH.from('category_analyses').delete().eq('category_id', c.id);
        else await DASH.from('category_analyses').update({ category_id: canonical.id }).eq('category_id', c.id);
        const { error: delErr } = await DASH.from('categories').delete().eq('id', c.id);
        if (delErr) console.error(`  category delete failed ${c.id.slice(0, 8)}: ${delErr.message}`);
        else merged++;
      } else merged++;
    }

    // 2. repair canonical metadata
    const cleanName = canonical.name.replace(/^[=\s]+/, '').trim();
    const needsName = cleanName !== canonical.name;
    const needsSearch = !isRealSearchTerm(canonical.search_term);
    if (needsName || needsSearch) {
      const newSearch = needsSearch ? cleanName.toLowerCase() : canonical.search_term;
      console.log(`"${key}": repairing canonical ${canonical.id.slice(0, 8)} → name "${cleanName}", search_term "${newSearch}"`);
      if (!DRY) await DASH.from('categories').update({ name: cleanName, search_term: newSearch }).eq('id', canonical.id);
      repaired++;
    }
  }

  // 3. delete empty shells (re-query after merges)
  const { data: finalCats } = await DASH.from('categories').select('id, name');
  for (const c of finalCats || []) {
    const live = await countProducts(c.id);
    if (live > 0) continue;
    const { data: fb } = await DASH.from('formula_briefs').select('id').eq('category_id', c.id).maybeSingle();
    const { count: ca } = await DASH.from('category_analyses').select('*', { count: 'exact', head: true }).eq('category_id', c.id);
    if (!fb && !ca) {
      console.log(`shell: deleting empty category ${c.id.slice(0, 8)} ("${c.name}")`);
      if (!DRY) {
        const { error } = await DASH.from('categories').delete().eq('id', c.id);
        if (error) { console.error(`  delete failed: ${error.message}`); continue; }
      }
      shellsDeleted++;
    }
  }

  console.log(`\n=== DONE ${DRY ? '(dry run)' : ''} ===`);
  console.log(`Duplicate categories merged/removed: ${merged}`);
  console.log(`Products moved to canonical: ${moved} | same-ASIN dupes deleted: ${dupesDeleted}`);
  console.log(`Canonical metadata repaired: ${repaired}`);
  console.log(`Empty shells deleted: ${shellsDeleted}`);
})();
