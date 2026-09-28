/**
 * utils/review-rows.js — build and save dovive_reviews rows (Phase 3).
 * ─────────────────────────────────────────────────────────────────────
 * Pure row building + the one save call used by playwright-reviews.js for
 * BOTH its sources (its own Playwright scrape and the Bright Data fallback,
 * whose records arrive through bright-data-amazon.js:normaliseReview).
 *
 * Why this exists (2026-09-29): dovive_reviews was append-only, so every
 * repeat scrape of an ASIN re-inserted the reviews it already held — 9,794 of
 * 51,023 rows were exact (keyword, asin, review_id) repeats when measured.
 * Migration 016 adds a stored `review_id` column (raw_json->'raw'->>'review_id')
 * and a unique index on (keyword, asin, review_id); this module upserts on
 * that key so a re-scrape refreshes the row it already has instead of adding
 * a second one.
 *
 * Decisions, each load-bearing:
 *  - The key includes `asin`. A variation-shared review (one Amazon review
 *    listed under several child ASINs) keeps one row PER ASIN. Keying on
 *    (keyword, review_id) alone would leave a child ASIN whose reviews are all
 *    shared with a sibling with zero rows: getScrapedAsins() would then never
 *    see it as scraped and every P3 run would pay Bright Data to re-fetch it,
 *    only to discard the result (36 keyword/ASIN pairs today). The read-time
 *    dedupe (utils/review-synthesis.js, migrate-reviews-to-dash.js) already
 *    collapses cross-ASIN copies and uses them as product-family evidence.
 *  - On conflict the row is UPDATED (merge-duplicates), not ignored. P3
 *    freshness is max(scraped_at) per ASIN (inventory.js / plan-scope.js); an
 *    ignored re-scrape would leave a stale ASIN stale forever and re-scraped
 *    (and re-paid) on every run. The row id is kept, so ids stored in P3b
 *    evidence stay valid.
 *  - Rows with no review_id (older Playwright pages, any source that lacks
 *    one) are plain-inserted, exactly as before.
 *  - Until migration 016 is applied the conflict target does not exist; the
 *    save falls back to the old plain insert (warned once) instead of losing
 *    the reviews.
 */

'use strict';

const CONFLICT_TARGET = 'keyword,asin,review_id';
// PostgREST / Postgres codes meaning "the conflict target is not there yet":
// 42P10 no unique index matches ON CONFLICT, 42703 column review_id missing,
// PGRST204 column not in the schema cache.
const MISSING_TARGET_CODES = new Set(['42P10', '42703', 'PGRST204']);

/** Amazon review id carried by a review object or a stored raw_json, or null. */
function reviewIdOf(r) {
  if (!r || typeof r !== 'object') return null;
  const v = (r.raw && typeof r.raw === 'object' ? r.raw.review_id : null) ?? r.review_id ?? null;
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function parseReviewDate(dateText) {
  if (!dateText) return null;
  // Amazon format: "Reviewed in the United States on August 17, 2025"
  const m = String(dateText).match(/(\w+ \d+, \d{4})/);
  if (!m) return null;
  // Parse at noon UTC: `new Date("August 17, 2025")` is LOCAL midnight, and
  // toISOString() then shifts it to the previous day on any host east of UTC.
  const d = new Date(`${m[1]} 12:00:00 UTC`);
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
}

/**
 * Review objects (Playwright scrape or normaliseReview output) → rows.
 * raw_json keeps the full object. A Playwright review carries its id at the
 * top level; it is mirrored to raw_json.raw.review_id — the single path the
 * migration's generated column and every read-time dedupe use.
 */
function buildReviewRows(asin, keyword, rawReviews, opts = {}) {
  const now = opts.now || new Date().toISOString();
  return (rawReviews || []).map((r) => {
    const rid = reviewIdOf(r);
    let raw = r;
    if (rid && !(r.raw && typeof r.raw === 'object' && r.raw.review_id)) {
      raw = { ...r, raw: { ...(r.raw && typeof r.raw === 'object' ? r.raw : {}), review_id: rid } };
    }
    return {
      asin: r.asin || asin,
      keyword: keyword || null,
      reviewer_name: r.reviewer_name,
      rating: r.rating,
      title: r.title,
      body: r.body,
      review_date: parseReviewDate(r.date_text),
      verified_purchase: r.verified_purchase,
      helpful_votes: r.helpful_votes || 0,
      raw_json: raw, // full scraped fields (dovive_reviews.raw_json — see migrations/004)
      scraped_at: now,
    };
  });
}

/** The unique key a row is upserted on, or null when it has no review id. */
function upsertKeyOf(row) {
  const rid = reviewIdOf(row && row.raw_json);
  if (!rid || !row.keyword || !row.asin) return null;
  return `${row.keyword}|${row.asin}|${rid}`;
}

/**
 * Split rows into { keyed, unkeyed }. Keyed rows are de-duplicated on their
 * upsert key (first wins): Postgres refuses an ON CONFLICT DO UPDATE that
 * touches the same row twice in one statement.
 */
function partitionRows(rows) {
  const keyed = [];
  const unkeyed = [];
  const seen = new Set();
  let duplicatesInBatch = 0;
  for (const row of rows || []) {
    const k = upsertKeyOf(row);
    if (!k) { unkeyed.push(row); continue; }
    if (seen.has(k)) { duplicatesInBatch++; continue; }
    seen.add(k);
    keyed.push(row);
  }
  return { keyed, unkeyed, duplicatesInBatch };
}

async function readError(res) {
  const text = await res.text().catch(() => '');
  let code = null;
  try { code = JSON.parse(text).code || null; } catch (_) { /* not JSON */ }
  return { text, code };
}

let _warnedNoTarget = false;

/**
 * Save rows to dovive_reviews over PostgREST.
 *   keyed rows   → POST ?on_conflict=keyword,asin,review_id, merge-duplicates
 *   unkeyed rows → plain POST (the old behaviour)
 * @returns {Promise<{sent:number, upserted:number, inserted:number, duplicatesInBatch:number, fellBackToInsert:boolean}>}
 */
async function saveReviewRows(rows, { fetchImpl, supabaseUrl, supabaseKey, log = console } = {}) {
  const { keyed, unkeyed, duplicatesInBatch } = partitionRows(rows);
  const base = `${supabaseUrl}/rest/v1/dovive_reviews`;
  const headers = (prefer) => ({
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
    Prefer: prefer,
  });
  const insert = async (batch) => {
    if (!batch.length) return 0;
    const res = await fetchImpl(base, { method: 'POST', headers: headers('return=minimal'), body: JSON.stringify(batch) });
    if (!res.ok) {
      const { text } = await readError(res);
      throw new Error(`Save failed: ${res.status} - ${text.substring(0, 200)}`);
    }
    return batch.length;
  };

  let upserted = 0;
  let fellBackToInsert = false;
  let insertNow = unkeyed;
  if (keyed.length) {
    const res = await fetchImpl(`${base}?on_conflict=${CONFLICT_TARGET}`, {
      method: 'POST',
      headers: headers('resolution=merge-duplicates,return=minimal'),
      body: JSON.stringify(keyed),
    });
    if (res.ok) {
      upserted = keyed.length;
    } else {
      const { text, code } = await readError(res);
      if (!MISSING_TARGET_CODES.has(code)) throw new Error(`Save failed: ${res.status} - ${text.substring(0, 200)}`);
      if (!_warnedNoTarget) {
        (log.warn || log.log).call(log, `   ⚠️ dovive_reviews has no (keyword, asin, review_id) unique index yet (migration 016 not applied, ${code}) — plain insert, duplicates still possible`);
        _warnedNoTarget = true;
      }
      fellBackToInsert = true;
      insertNow = [...keyed, ...unkeyed];
    }
  }
  const inserted = await insert(insertNow);
  return { sent: keyed.length + unkeyed.length, upserted, inserted, duplicatesInBatch, fellBackToInsert };
}

module.exports = {
  CONFLICT_TARGET,
  reviewIdOf,
  parseReviewDate,
  buildReviewRows,
  upsertKeyOf,
  partitionRows,
  saveReviewRows,
  _resetWarnings: () => { _warnedNoTarget = false; },
};
