const test = require('node:test');
const assert = require('node:assert/strict');
const { composeJobError } = require('../utils/job-error');

test('job error: a failed phase leads and the verifier follows', () => {
  const msg = composeJobError(
    { phase: 5, name: 'Deep Research', status: 'error', error: 'Script exited with code 1' },
    ['P5 0/20 researched', 'P6 product_intelligence 0/40'],
  );
  assert.equal(msg, 'P5 Deep Research: Script exited with code 1 | verifier: P5 0/20 researched | P6 product_intelligence 0/40');
  // The dashboard parser reads "P<n> <name>: <msg>" — the phase must still be recoverable from it.
  const m = msg.match(/^P(\d+)\s+([^:]+):\s*([\s\S]*)$/);
  assert.equal(m[1], '5');
  assert.equal(m[2], 'Deep Research');
});

test('job error: no phase failure keeps the old "Verifier FAIL:" text', () => {
  assert.equal(composeJobError(undefined, ['P3 10/40 < 50%']), 'Verifier FAIL: P3 10/40 < 50%');
  assert.equal(composeJobError(null, ['a', 'b']), 'Verifier FAIL: a | b');
});

test('job error: a failed phase with a passing verifier is not reported as an empty verifier failure', () => {
  assert.equal(composeJobError({ phase: 8, name: 'Packaging Intelligence', error: 'boom' }, []), 'P8 Packaging Intelligence: boom');
});

test('job error: capped at 2000 chars with the phase error kept at the front', () => {
  const msg = composeJobError({ phase: 4, name: 'OCR / Formula Extraction', error: 'timeout' }, ['x'.repeat(5000)]);
  assert.equal(msg.length, 2000);
  assert.ok(msg.startsWith('P4 OCR / Formula Extraction: timeout | verifier: '));
});
