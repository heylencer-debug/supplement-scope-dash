const test = require('node:test');
const assert = require('node:assert/strict');
const { fakeSupabase } = require('./helpers/fake-supabase');
const { runCertificationVerification } = require('../verify-certifications');

const quiet = { log() {}, warn() {} };

function dash(products, updateError = null) {
  const db = fakeSupabase({ products });
  const from = db.from;
  // add .not() used by the reader, and optional update failure
  db.from = (name) => {
    const q = from(name);
    q.not = function (c) { this.filters.push((r) => r[c] != null); return this; };
    if (updateError) { const upd = q.update.bind(q); q.update = (o) => { upd(o); q.exec = () => ({ data: null, error: updateError }); return q; }; }
    return q;
  };
  return db;
}

test('classifies every product\'s claims and stores them (lookups off: no HTTP)', async () => {
  const db = dash([
    { id: 'p1', category_id: 'c', asin: 'A', brand: 'Acme', title: 'Acme Gummies', claims_on_label: ['NSF Certified for Sport', 'Vegan'] },
    { id: 'p2', category_id: 'c', asin: 'B', brand: 'Zed', title: 'Zed', claims_on_label: null },
  ]);
  let fetched = 0;
  const s = await runCertificationVerification({ keyword: 'k', categoryId: 'c', dash: db, enabled: false, fetchImpl: async () => { fetched++; }, log: quiet });
  assert.equal(fetched, 0);
  assert.equal(s.products, 1);
  assert.equal(s.written, 1);
  const stored = db.tables.products[0].certifications_verified;
  assert.equal(stored.schema_version, 1);
  assert.equal(stored.lookups_enabled, false);
  assert.deepEqual(stored.results.map((r) => r.status), ['not_checked', 'no_registry']);
});

test('dry run writes nothing', async () => {
  const db = dash([{ id: 'p1', category_id: 'c', asin: 'A', brand: 'Acme', title: 'x', claims_on_label: ['Vegan'] }]);
  const s = await runCertificationVerification({ keyword: 'k', categoryId: 'c', dash: db, dryRun: true, enabled: false, log: quiet });
  assert.equal(s.written, 0);
  assert.equal(db.tables.products[0].certifications_verified, undefined);
});

test('column missing (migration 013) → stops after one warning, never throws', async () => {
  const db = dash([
    { id: 'p1', category_id: 'c', asin: 'A', brand: 'Acme', title: 'x', claims_on_label: ['Vegan'] },
    { id: 'p2', category_id: 'c', asin: 'B', brand: 'Acme', title: 'y', claims_on_label: ['Vegan'] },
  ], { code: 'PGRST204', message: "Could not find the 'certifications_verified' column" });
  const warnings = [];
  const s = await runCertificationVerification({ keyword: 'k', categoryId: 'c', dash: db, enabled: false, log: { log() {}, warn: (m) => warnings.push(m) } });
  assert.equal(s.skipped, 'column missing');
  assert.equal(warnings.length, 1);
});

test('reads claims_all_sources first; facility wording is never a product claim', async () => {
  const db = dash([{ id: 'p1', category_id: 'c', asin: 'A', brand: 'Acme', title: 'x', claims_on_label: ['Vegan'],
    claims_all_sources: [{ claim: 'Manufactured in an NSF Certified Facility', sources: [] }, { claim: 'Vegan', sources: [] }] }]);
  await runCertificationVerification({ keyword: 'k', categoryId: 'c', dash: db, enabled: false, log: quiet });
  const res = db.tables.products[0].certifications_verified.results;
  assert.deepEqual(res.map((r) => [r.claim_key, r.status]), [['facility_claim', 'no_registry'], [null, 'no_registry']]);
});

test('CERT_VERIFY_MAX_MS: once the budget is spent, remaining lookups are not_checked with the reason', async () => {
  const db = dash([{ id: 'p1', category_id: 'c', asin: 'A', brand: 'Acme', title: 'x', claims_on_label: ['NSF Contents Tested'] }]);
  let fetched = 0;
  await runCertificationVerification({ keyword: 'k', categoryId: 'c', dash: db, enabled: true, maxMs: -1, fetchImpl: async () => { fetched++; }, log: quiet });
  assert.equal(fetched, 0);
  const [r] = db.tables.products[0].certifications_verified.results;
  assert.equal(r.status, 'not_checked');
  assert.match(r.reason, /CERT_VERIFY_MAX_MS/);
});
