'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { capGatePool, GATE_POOL_CAP } = require('../utils/verifier-bars');

test('capGatePool keeps the top N by bsr_current (nulls last), P1 order as the tie-break', () => {
  const live = ['A', 'B', 'C', 'D', 'E'];
  const rows = [{ asin: 'A', bsr_current: 500 }, { asin: 'B', bsr_current: 10 }, { asin: 'C', bsr_current: null }, { asin: 'D', bsr_current: 10 }];
  assert.deepEqual(capGatePool(live, rows, 3), ['B', 'D', 'A']);
  assert.deepEqual(capGatePool(['A', 'B'], rows, 3), ['A', 'B'], 'no cap below the limit');
});

test('default cap is the old P1 cap (40) unless SCOUT_GATE_POOL_CAP overrides it', () => {
  assert.equal(GATE_POOL_CAP, 40);
});

test('source pin: resolveRunAsins caps the live set only when no competitor selection is active', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'utils', 'verifier-bars.js'), 'utf8');
  assert.match(src, /if \(result\.live\.length > GATE_POOL_CAP\) \{\s*const sel = await loadSelection\(DASH, categoryId\);\s*if \(!sel\.active\)/);
});

test('source pin: the Bright Data reviews retry RESUMES a still-running snapshot instead of re-triggering', () => {
  const pr = fs.readFileSync(path.join(__dirname, '..', 'playwright-reviews.js'), 'utf8');
  assert.match(pr, /fetchAmazonReviews\(asins, resumeSnapshotId \? \{ resumeSnapshotId \} : \{\}\)/);
  const bd = fs.readFileSync(path.join(__dirname, '..', 'bright-data-amazon.js'), 'utf8');
  assert.match(bd, /err\.snapshotId = snapshotId;\s*err\.stillRunning = true;/);
  assert.match(bd, /opts\.resumeSnapshotId/);
  assert.match(bd, /BRIGHTDATA_REVIEWS_DEADLINE_MS \|\| '420000'/);
});
