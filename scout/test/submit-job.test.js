const test = require('node:test');
const assert = require('node:assert/strict');
const { triggerRetryHint } = require('../submit-job');

test('submit-job retry hint names a real command for the queued row, never "submit-job.js trigger"', () => {
  const hint = triggerRetryHint('0f0e-job');
  assert.doesNotMatch(hint, /submit-job\.js trigger/);
  assert.match(hint, /gcloud run jobs execute dovive-scout .*--update-env-vars SCOUT_JOB_ID=0f0e-job --async/);
  assert.match(hint, /drain-queue\.js/);
});
