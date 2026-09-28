const test = require('node:test');
const assert = require('node:assert/strict');
const { parseRequeueArgs, forceClearsFor, requeueJob, formatRow } = require('../requeue-job');
const { recordingSupabase } = require('./helpers/recording-supabase');

const quiet = () => { const lines = []; return { lines, warn: (m) => lines.push(m), log: (m) => lines.push(m) }; };

// scout_jobs stand-in: the read returns `stored`; the update echoes the patch applied to it.
function jobsDb(stored) {
  return recordingSupabase((table, calls) => {
    const update = calls.find(([m]) => m === 'update');
    if (update) return { data: { ...stored, ...update[1] }, error: null };
    return { data: stored, error: null };
  });
}
const updatePayload = (db) => db.callsOn('scout_jobs').flat().find(([m]) => m === 'update')[1];

test('requeue args: force defaults to false and only the word true turns it on', () => {
  assert.equal(parseRequeueArgs(['job-1', '9']).force, false);
  assert.equal(parseRequeueArgs(['job-1', '9', 'false']).force, false);
  assert.equal(parseRequeueArgs(['job-1', '9', 'true']).force, true);
  assert.throws(() => parseRequeueArgs(['job-1', '9', 'yes']), /true or false/);
  assert.throws(() => parseRequeueArgs(['job-1', '9', '1']), /true or false/);
});

test('requeue args: --keep-scope, P-prefixed phase, and usage errors', () => {
  assert.deepEqual(parseRequeueArgs(['job-1', 'P4', '--keep-scope']), { id: 'job-1', fromPhase: 4, force: false, keepScope: true });
  assert.throws(() => parseRequeueArgs(['job-1']), /usage: node requeue-job\.js/);
  assert.throws(() => parseRequeueArgs(['job-1', '14']), /1-13/);
  assert.throws(() => parseRequeueArgs(['job-1', 'x']), /1-13/);
  assert.throws(() => parseRequeueArgs(['job-1', '3', 'false', 'extra']), /unexpected argument/);
  assert.throws(() => parseRequeueArgs(['job-1', '3', '--force']), /unknown flag --force/);
});

test('requeue: default run resets only_phases to NULL and writes force=false', async () => {
  const db = jobsDb({ id: 'job-1', keyword: 'magnesium gummies #2', status: 'error', only_phases: [1, 2, 3, 4, 5, 6, 7, 8] });
  const log = quiet();
  const row = await requeueJob(db, parseRequeueArgs(['job-1', '9']), log);
  const patch = updatePayload(db);
  assert.equal(patch.force, false);
  assert.equal(patch.only_phases, null);
  assert.equal(patch.from_phase, 9);
  assert.equal(patch.status, 'queued');
  assert.equal(row.only_phases, null);
  assert.equal(log.lines.length, 0, 'no force warning when force is off');
  const printed = formatRow(row);
  for (const want of ['job-1', 'magnesium gummies #2', 'from_phase  9', 'only_phases NULL', 'force       false']) assert.ok(printed.includes(want), want);
});

test('requeue --keep-scope leaves only_phases alone and warns when the scope runs nothing', async () => {
  const db = jobsDb({ id: 'job-1', keyword: 'k', status: 'error', only_phases: '1,2,3,4,5,6,7,8' });
  const log = quiet();
  await requeueJob(db, parseRequeueArgs(['job-1', '9', '--keep-scope']), log);
  assert.ok(!('only_phases' in updatePayload(db)));
  assert.ok(log.lines.some((l) => /execute NO phase/.test(l)));
});

test('requeue force=true prints what it will delete for the phases it reaches', async () => {
  const db = jobsDb({ id: 'job-1', keyword: 'k #3', status: 'error', only_phases: null });
  const log = quiet();
  await requeueJob(db, parseRequeueArgs(['job-1', '4', 'true']), log);
  assert.equal(updatePayload(db).force, true);
  const text = log.lines.join('\n');
  assert.match(text, /dovive_ocr/);
  assert.match(text, /dovive_phase5_research/);
  assert.doesNotMatch(text, /review_analysis/, 'P3 is before from_phase 4');
});

test('forceClearsFor honours only_phases', () => {
  assert.deepEqual(forceClearsFor(1, '3').map((l) => l.slice(0, 3)), ['P3:']);
  assert.deepEqual(forceClearsFor(9, [1, 2, 3, 4, 5, 6, 7, 8]), []);
  assert.equal(forceClearsFor(1, null).length, 9);
});

test('requeue refuses an unknown job id and surfaces a failed update', async () => {
  await assert.rejects(requeueJob(recordingSupabase(() => ({ data: null, error: null })), { id: 'nope', fromPhase: 3, force: false, keepScope: false }, quiet()), /no scout_jobs row/);
  const failing = recordingSupabase((t, calls) => (calls.some(([m]) => m === 'update')
    ? { data: null, error: { message: 'permission denied' } }
    : { data: { id: 'j', keyword: 'k', status: 'error', only_phases: null }, error: null }));
  await assert.rejects(requeueJob(failing, { id: 'j', fromPhase: 3, force: false, keepScope: false }, quiet()), /permission denied/);
});
