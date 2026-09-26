/**
 * utils/serp-pool.js — merge several Amazon searches into ONE candidate pool
 * (pure, unit-tested in test/serp-pool.test.js).
 *
 * P1 used to cut the first 40 results of a single search. Now it runs the
 * query set from utils/query-variants.js, and this module unions them:
 *
 *   - Sponsored placements are recorded but are NEVER candidates. An ASIN that
 *     only ever appeared as an ad is dropped; one that is an ad in one search
 *     and organic in another is kept on the strength of its organic showing.
 *   - Ordering is reciprocal-rank fusion (RRF): score = Σ 1 / (k + position)
 *     over the searches it appeared in organically. A product that ranks well
 *     for several phrasings beats one that ranks slightly better for just one.
 *     k = 60 is the standard constant from the RRF paper; it keeps a #1 in one
 *     search from outweighing consistent top-10 showings everywhere.
 *   - The BASE search's top `baseGuarantee` (40) organic results always get a
 *     pool slot — fusion alone lets a #2 in two variant searches outrank the
 *     #1 of the base search (2/62 > 1/61), and the base keyword is still the
 *     primary definition of the category. Fusion fills the remaining slots.
 *   - The pool is cut to `poolSize` (default 80 — see human-bsr.js for why),
 *     so the post-Keepa ranking has room to choose after flavors fold.
 *
 * Every candidate carries `search_queries` and `serp_positions` so the
 * dashboard can say which searches surfaced it.
 */

const RRF_K = 60;
const POOL_SIZE_DEFAULT = 80;
const BASE_GUARANTEE_DEFAULT = 40;

/**
 * @param {Array<{ query: string, items: Array<{ asin: string, title?: string, position: number, sponsored?: boolean }> }>} searches
 * @param {{ poolSize?: number, baseQuery?: string, baseGuarantee?: number }} [opts]
 * @returns {{ pool: object[], sponsoredOnly: string[], totalUnique: number }}
 */
function buildCandidatePool(searches, opts = {}) {
  const poolSize = Number(opts.poolSize) > 0 ? Number(opts.poolSize) : POOL_SIZE_DEFAULT;
  const baseQuery = opts.baseQuery || (searches[0] && searches[0].query) || null;
  const byAsin = new Map();

  for (const s of searches || []) {
    for (const it of s.items || []) {
      const asin = String(it.asin || '').toUpperCase();
      if (!/^[A-Z0-9]{10}$/.test(asin)) continue;
      let c = byAsin.get(asin);
      if (!c) {
        c = { asin, title: it.title || '', search_queries: [], serp_positions: {}, sponsored_in: [], rrf: 0 };
        byAsin.set(asin, c);
      }
      if (!c.title && it.title) c.title = it.title;
      const pos = Number(it.position);
      if (it.sponsored) {
        if (!c.sponsored_in.includes(s.query)) c.sponsored_in.push(s.query);
        continue;
      }
      if (!Number.isFinite(pos) || pos <= 0) continue;
      // First organic sighting per query wins (the higher placement).
      if (c.serp_positions[s.query] == null) {
        c.serp_positions[s.query] = pos;
        c.search_queries.push(s.query);
        c.rrf += 1 / (RRF_K + pos);
      }
    }
  }

  const all = [...byAsin.values()];
  const sponsoredOnly = all.filter((c) => c.search_queries.length === 0).map((c) => c.asin);
  const organic = all.filter((c) => c.search_queries.length > 0);
  for (const c of organic) {
    c.best_position = Math.min(...Object.values(c.serp_positions));
    c.base_position = baseQuery != null && c.serp_positions[baseQuery] != null ? c.serp_positions[baseQuery] : null;
  }
  organic.sort((a, b) => b.rrf - a.rrf || a.best_position - b.best_position || a.asin.localeCompare(b.asin));
  const baseGuarantee = Math.min(poolSize, Number.isFinite(Number(opts.baseGuarantee)) ? Number(opts.baseGuarantee) : BASE_GUARANTEE_DEFAULT);
  const guaranteed = new Set(
    organic.filter((c) => c.base_position != null).sort((a, b) => a.base_position - b.base_position).slice(0, baseGuarantee).map((c) => c.asin),
  );
  const chosen = new Set(guaranteed);
  for (const c of organic) {
    if (chosen.size >= poolSize) break;
    chosen.add(c.asin);
  }
  const pool = organic
    .filter((c) => chosen.has(c.asin))
    .map((c, i) => ({ ...c, rrf: Math.round(c.rrf * 1e6) / 1e6, pool_rank: i + 1, base_guaranteed: guaranteed.has(c.asin) }));
  return { pool, sponsoredOnly, totalUnique: organic.length };
}

/** The jsonb written to dovive_research.selection_signals for one candidate. */
function selectionSignalsFor(c) {
  return {
    search_queries: c.search_queries,
    serp_positions: c.serp_positions,
    sponsored_in: c.sponsored_in,
    best_position: c.best_position,
    base_position: c.base_position,
    rrf_score: c.rrf,
    pool_rank: c.pool_rank,
    base_guaranteed: !!c.base_guaranteed,
  };
}

module.exports = { buildCandidatePool, selectionSignalsFor, RRF_K, POOL_SIZE_DEFAULT, BASE_GUARANTEE_DEFAULT };
