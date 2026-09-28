// Fix A (2026-09-29): Phase 3 upserts dovive_reviews on (keyword, asin,
// review_id) instead of appending a copy on every re-scrape. Pure logic +
// a mocked PostgREST fetch; nothing here touches a network or a database.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  CONFLICT_TARGET, reviewIdOf, buildReviewRows, upsertKeyOf, partitionRows, saveReviewRows, _resetWarnings,
} = require('../utils/review-rows');
const { normaliseReview } = require('../bright-data-amazon');

const NOW = '2026-09-29T12:00:00.000Z';
const URL = 'https://example.supabase.co';

// Bright Data records the way the reviews dataset returns them.
const bdRecord = (asin, rid, text, extra = {}) => ({
  asin, review_id: rid, rating: 5, review_header: `h ${rid}`, review_text: text,
  review_posted_date: 'Reviewed in the United States on August 17, 2025', author_name: 'A', is_verified: true, helpful_count: 2, ...extra,
});

function mockFetch(responses = []) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, method: init.method, prefer: init.headers.Prefer, body: JSON.parse(init.body) });
    const r = responses.shift() || { ok: true, status: 201, body: '' };
    return { ok: r.ok, status: r.status, text: async () => r.body || '' };
  };
  fn.calls = calls;
  return fn;
}
const quiet = { warn() {}, log() {} };

test('buildReviewRows keeps the normalised Bright Data object as raw_json (review_id stays at raw_json.raw.review_id)', () => {
  const n = normaliseReview(bdRecord('B0AAAAAAAA', 'R1AAAAAAAAAAAA', 'Great taste'), null);
  const [row] = buildReviewRows('B0AAAAAAAA', 'kw', [n], { now: NOW });
  assert.equal(row.raw_json, n);
  assert.equal(row.raw_json.raw.review_id, 'R1AAAAAAAAAAAA');
  assert.equal(row.review_date, '2025-08-17');
  assert.equal(row.scraped_at, NOW);
  assert.equal(upsertKeyOf(row), 'kw|B0AAAAAAAA|R1AAAAAAAAAAAA');
});

test('a Playwright review carries its card id at the top level; it is mirrored to raw_json.raw.review_id', () => {
  const pw = { asin: 'B0PPPPPPPP', review_id: 'R2PPPPPPPPPPPP', rating: 4, title: 't', body: 'b', date_text: 'Reviewed on May 1, 2025', helpful_votes: 0 };
  const [row] = buildReviewRows('B0PPPPPPPP', 'kw', [pw], { now: NOW });
  assert.equal(row.raw_json.raw.review_id, 'R2PPPPPPPPPPPP');
  assert.equal(row.raw_json.title, 't', 'the scraped fields stay in raw_json');
  assert.equal(reviewIdOf(row.raw_json), 'R2PPPPPPPPPPPP');
  const [noId] = buildReviewRows('B0PPPPPPPP', 'kw', [{ ...pw, review_id: null }], { now: NOW });
  assert.equal(noId.raw_json.raw, undefined, 'no id → raw_json unchanged');
  assert.equal(upsertKeyOf(noId), null);
});

test('upsert call shape: POST ?on_conflict=keyword,asin,review_id with merge-duplicates', async () => {
  const rows = buildReviewRows('B0AAAAAAAA', 'kw', [
    normaliseReview(bdRecord('B0AAAAAAAA', 'R1', 'one'), null),
    normaliseReview(bdRecord('B0AAAAAAAA', 'R2', 'two'), null),
  ], { now: NOW });
  const f = mockFetch();
  const r = await saveReviewRows(rows, { fetchImpl: f, supabaseUrl: URL, supabaseKey: 'k', log: quiet });
  assert.equal(CONFLICT_TARGET, 'keyword,asin,review_id');
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, `${URL}/rest/v1/dovive_reviews?on_conflict=keyword,asin,review_id`);
  assert.equal(f.calls[0].method, 'POST');
  assert.equal(f.calls[0].prefer, 'resolution=merge-duplicates,return=minimal');
  assert.equal(f.calls[0].body.length, 2);
  assert.ok(f.calls[0].body.every((b) => !('review_id' in b)), 'review_id is a generated column — never sent');
  assert.deepEqual(r, { sent: 2, upserted: 2, inserted: 0, duplicatesInBatch: 0, fellBackToInsert: false });
});

test('fallback: rows with no review_id are plain-inserted, in a second call', async () => {
  const rows = [
    ...buildReviewRows('B0AAAAAAAA', 'kw', [normaliseReview(bdRecord('B0AAAAAAAA', 'R1', 'one'), null)], { now: NOW }),
    ...buildReviewRows('B0AAAAAAAA', 'kw', [{ asin: 'B0AAAAAAAA', rating: 3, body: 'no id', date_text: null }], { now: NOW }),
  ];
  const f = mockFetch();
  const r = await saveReviewRows(rows, { fetchImpl: f, supabaseUrl: URL, supabaseKey: 'k', log: quiet });
  assert.equal(f.calls.length, 2);
  assert.match(f.calls[0].url, /on_conflict=/);
  assert.equal(f.calls[1].url, `${URL}/rest/v1/dovive_reviews`);
  assert.equal(f.calls[1].prefer, 'return=minimal');
  assert.equal(f.calls[1].body[0].body, 'no id');
  assert.deepEqual([r.upserted, r.inserted], [1, 1]);

  const g = mockFetch();
  const onlyUnkeyed = await saveReviewRows([rows[1]], { fetchImpl: g, supabaseUrl: URL, supabaseKey: 'k', log: quiet });
  assert.equal(g.calls.length, 1);
  assert.doesNotMatch(g.calls[0].url, /on_conflict/);
  assert.equal(onlyUnkeyed.inserted, 1);
});

test('before migration 016 is applied (42P10 / 42703) the save falls back to a plain insert instead of losing reviews', async () => {
  for (const code of ['42P10', '42703']) {
    _resetWarnings();
    const warned = [];
    const rows = buildReviewRows('B0AAAAAAAA', 'kw', [normaliseReview(bdRecord('B0AAAAAAAA', 'R1', 'one'), null)], { now: NOW });
    const f = mockFetch([{ ok: false, status: 400, body: JSON.stringify({ code, message: 'no' }) }]);
    const r = await saveReviewRows(rows, { fetchImpl: f, supabaseUrl: URL, supabaseKey: 'k', log: { warn: (m) => warned.push(m) } });
    assert.equal(f.calls.length, 2);
    assert.doesNotMatch(f.calls[1].url, /on_conflict/);
    assert.equal(f.calls[1].body.length, 1);
    assert.equal(r.fellBackToInsert, true);
    assert.equal(r.inserted, 1);
    assert.match(warned[0], /migration 016/);
  }
  // Any other failure still throws (the old behaviour).
  const f = mockFetch([{ ok: false, status: 500, body: JSON.stringify({ code: 'XX000' }) }]);
  const rows = buildReviewRows('B0AAAAAAAA', 'kw', [normaliseReview(bdRecord('B0AAAAAAAA', 'R1', 'one'), null)], { now: NOW });
  await assert.rejects(saveReviewRows(rows, { fetchImpl: f, supabaseUrl: URL, supabaseKey: 'k', log: quiet }), /Save failed: 500/);
});

test('a re-scrape of the same reviews produces one row\'s worth of upsert keys per review', async () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'reviews-rescrape.json'), 'utf8'));
  const keys = [];
  const upsertBodies = [];
  let unkeyedSent = 0;
  const f = async (url, init) => {
    const body = JSON.parse(init.body);
    if (url.includes('on_conflict=')) { upsertBodies.push(body); for (const b of body) keys.push(upsertKeyOf(b)); } else unkeyedSent += body.length;
    return { ok: true, status: 201, text: async () => '' };
  };
  // Scrape 1, then scrape 2 of the SAME reviews (Bright Data re-returns them,
  // one page even repeats a review inside the batch).
  for (const scrape of fixture.scrapes) {
    for (const [asin, recs] of Object.entries(scrape)) {
      const rows = buildReviewRows(asin, fixture.keyword, recs.map((x) => normaliseReview(x, null)), { now: NOW });
      await saveReviewRows(rows, { fetchImpl: f, supabaseUrl: URL, supabaseKey: 'k', log: quiet });
    }
  }
  assert.equal(unkeyedSent, 0);
  const unique = new Set(keys);
  // One key per (asin, review): R1–R3 on the parent, R3 again on the variation
  // child (variation-shared review keeps its per-ASIN row), R4 on the child.
  assert.deepEqual([...unique].sort(), [
    'magnesium gummies|B0CHILD001|R3SHAREDREVIEW',
    'magnesium gummies|B0CHILD001|R4CHILDONLY001',
    'magnesium gummies|B0PARENT01|R1PARENTONLY01',
    'magnesium gummies|B0PARENT01|R2PARENTONLY02',
    'magnesium gummies|B0PARENT01|R3SHAREDREVIEW',
  ]);
  // Every statement is free of repeated keys (ON CONFLICT DO UPDATE requires it) …
  for (const body of upsertBodies) assert.equal(new Set(body.map(upsertKeyOf)).size, body.length);
  // … and the second scrape sent exactly the keys the first one did: once
  // the unique index exists, the table holds one row per key, not two.
  const half = keys.length / 2;
  assert.deepEqual(new Set(keys.slice(half)), new Set(keys.slice(0, half)));
});

test('partitionRows: first copy of a key wins; rows without keyword/asin/review_id are unkeyed', () => {
  const mk = (asin, rid, body) => ({ asin, keyword: 'kw', body, raw_json: rid ? { raw: { review_id: rid } } : { body } });
  const p = partitionRows([mk('A', 'R1', 'first'), mk('A', 'R1', 'second'), mk('B', 'R1', 'other asin'), mk('A', null, 'no id'), { ...mk('A', 'R9', 'no kw'), keyword: null }]);
  assert.deepEqual(p.keyed.map((r) => r.body), ['first', 'other asin']);
  assert.deepEqual(p.unkeyed.map((r) => r.body), ['no id', 'no kw']);
  assert.equal(p.duplicatesInBatch, 1);
});

test('migration 016 matches the key the collector upserts on', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '016_reviews_unique.sql'), 'utf8');
  assert.match(sql, /GENERATED ALWAYS AS \(raw_json -> 'raw' ->> 'review_id'\) STORED/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS dovive_reviews_keyword_asin_review_id_key\s+ON dovive_reviews \(keyword, asin, review_id\)/);
  assert.doesNotMatch(sql, /UNIQUE INDEX[^;]*WHERE/, 'a partial index cannot be an ON CONFLICT target for PostgREST');
});
