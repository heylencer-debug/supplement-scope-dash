const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { failAndExit, toleratedFailure } = require('../utils/script-exit');

const sink = () => { const lines = []; return { lines, error: (m) => lines.push(m) }; };

test('failAndExit: exit code 1 and the error message logged', () => {
  const log = sink(); const proc = {};
  failAndExit('phase4-text-extract.js', new Error('No OPENROUTER_API_KEY'), { log, proc });
  assert.equal(proc.exitCode, 1);
  assert.match(log.lines.join('\n'), /phase4-text-extract\.js FAILED: No OPENROUTER_API_KEY/);
});

test('toleratedFailure: exit code stays 0, the failure is loud and greppable', () => {
  const log = sink(); const proc = {};
  toleratedFailure('migrate-ocr-to-dash.js', new Error('Products fetch error: timeout'), { phase: 'P4', log, proc });
  assert.equal(proc.exitCode, 0);
  const text = log.lines.join('\n');
  assert.match(text, /SYNC FAILED — migrate-ocr-to-dash\.js: Products fetch error: timeout/);
  assert.match(text, /re-run the paid P4 step/);
});

test('toleratedFailure never masks an exit code something else already set', () => {
  const proc = { exitCode: 2 };
  toleratedFailure('x.js', 'boom', { log: sink(), proc });
  assert.equal(proc.exitCode, 2);
});

// Which scripts use which policy is the whole point of the helper — pin it.
const src = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
test('exit policy per script: phase own-work fails the phase, post-producer syncs are tolerated', () => {
  for (const f of ['phase4-text-extract.js', 'phase7-packaging-intelligence.js']) {
    assert.match(src(f), /\.catch\(\(e\) => failAndExit\(/, f);
    assert.doesNotMatch(src(f), /\.catch\(console\.error\)\s*;?\s*$/m, f);
  }
  for (const f of ['migrate-reviews-to-dash.js', 'migrate-ocr-to-dash.js']) {
    assert.match(src(f), /\.catch\(\(e\) => toleratedFailure\(/, f);
    assert.doesNotMatch(src(f), /\.catch\(console\.error\)\s*;?\s*$/m, f);
  }
  // migrate-ocr used to `return` after a failed read, which never reached any handler.
  assert.doesNotMatch(src('migrate-ocr-to-dash.js'), /fetch error:', \w+\.message\); return;/);
});
