const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { keywordFromArgv, requireKeyword } = require('../utils/keyword-arg');

const argv = (...a) => ['node', 'script.js', ...a];

test('keyword arg: --keyword or the first positional, never a flag', () => {
  assert.equal(keywordFromArgv(argv('--keyword', 'electrolyte powder #6')), 'electrolyte powder #6');
  assert.equal(keywordFromArgv(argv('electrolyte powder #6', '--test')), 'electrolyte powder #6');
  assert.equal(keywordFromArgv(argv('--test', '--keyword', 'k #2')), 'k #2');
  assert.equal(keywordFromArgv(argv()), null);
  assert.equal(keywordFromArgv(argv('--test')), null, 'a flag is not a keyword (ocr-phase4 used to take "--test" as one)');
  assert.equal(keywordFromArgv(argv('--keyword')), null);
  assert.equal(keywordFromArgv(argv('--keyword', '--force')), null);
  assert.equal(keywordFromArgv(argv('   ')), null);
});

test('requireKeyword: a missing keyword prints the usage line and exits 1 — no ashwagandha fallback', () => {
  const lines = []; const exits = [];
  const k = requireKeyword('node x.js "<session label>"', { argv: argv(), log: { error: (m) => lines.push(m) }, exit: (c) => exits.push(c) });
  assert.equal(k, null);
  assert.deepEqual(exits, [1]);
  assert.match(lines.join('\n'), /usage: node x\.js "<session label>"/);
  assert.equal(requireKeyword('u', { argv: argv('magnesium gummies'), exit: () => assert.fail('must not exit') }), 'magnesium gummies');
});

const SCRIPTS = ['migrate-reviews-to-dash.js', 'migrate-ocr-to-dash.js', 'migrate-keepa-to-dash.js',
  'phase4-text-extract.js', 'ocr-phase4.js', 'phase7-packaging-intelligence.js'];
test('keyword arg: the scripts that used to default to "ashwagandha gummies" now require one', () => {
  for (const f of SCRIPTS) {
    const s = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    assert.match(s, /requireKeyword\(/, f);
    assert.doesNotMatch(s, /:\s*'ashwagandha gummies'\)?;/, `${f} still falls back to ashwagandha gummies`);
    assert.doesNotMatch(s, /\|\|\s*'ashwagandha gummies'/, `${f} still falls back to ashwagandha gummies`);
  }
});

test('migrate-reviews-to-dash stays requirable without a keyword (tests import buildReviewAnalysis)', () => {
  assert.equal(typeof require('../migrate-reviews-to-dash').buildReviewAnalysis, 'function');
});
