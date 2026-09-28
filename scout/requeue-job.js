// Requeue a scout job from a given phase (used after cancelling a stale execution).
//
// Usage: node requeue-job.js <job-id> <from_phase> [true|false] [--keep-scope]
//
//   force (3rd argument) defaults to FALSE. Only the literal word `true` turns
//     it on, because a forced run DELETES data (see FORCE_CLEARS below) and
//     re-spends every phase it reaches.
//   only_phases is reset to NULL (the run goes from <from_phase> to P13), so a
//     research-scope row ('1,…,8') requeued from 9 actually runs P9–P13
//     instead of running nothing and being marked complete. Pass
//     --keep-scope to leave the row's only_phases as it is.
//
// This only rewrites the scout_jobs row; start the execution afterwards with
// the gcloud command in docs/PIPELINE.md §3.2.
require('dotenv').config();

const USAGE = 'usage: node requeue-job.js <job-id> <from_phase 1-13> [true|false] [--keep-scope]';

// What run-pipeline.js does when the job carries force=true, per phase
// (clearPhaseData in run-pipeline.js, plus --force handed to each script).
// Kept here so the operator sees it BEFORE requeuing, not in the run log.
const FORCE_CLEARS = {
  3: 'products.review_analysis set to NULL for the whole category',
  4: "DELETE FROM dovive_ocr WHERE keyword = <label> (the label's OCR / text-extract rows)",
  5: 'DELETE FROM dovive_phase5_research WHERE keyword ILIKE <label>',
  6: 'marketing_analysis.product_intelligence stripped from every product in the category',
  8: 'marketing_analysis.packaging_intelligence stripped from every product in the category',
  9: 'formula_briefs.ingredients stripped down to market_intelligence only',
  11: 'formula_briefs.ingredients.competitive_benchmarking removed',
  12: 'formula_briefs.ingredients.fda_compliance removed',
  13: 'formula_briefs.ingredients.final_signoff removed',
};

function usageError(msg) {
  return new Error(`${msg}\n${USAGE}`);
}

/** argv without `node script` → { id, fromPhase, force, keepScope }. Throws a usage error. */
function parseRequeueArgs(argv) {
  const keepScope = argv.includes('--keep-scope');
  const unknownFlag = argv.find((a) => a.startsWith('--') && a !== '--keep-scope');
  if (unknownFlag) throw usageError(`unknown flag ${unknownFlag}`);
  const [id, fromArg, forceArg, extra] = argv.filter((a) => !a.startsWith('--'));
  if (!id || !fromArg) throw usageError('missing <job-id> or <from_phase>');
  if (extra !== undefined) throw usageError(`unexpected argument "${extra}"`);
  const fromPhase = Number(String(fromArg).replace(/^P/i, ''));
  if (!Number.isInteger(fromPhase) || fromPhase < 1 || fromPhase > 13) throw usageError(`from_phase must be 1-13, got "${fromArg}"`);
  if (forceArg !== undefined && forceArg !== 'true' && forceArg !== 'false') {
    throw usageError(`force must be the word true or false, got "${forceArg}"`);
  }
  return { id, fromPhase, force: forceArg === 'true', keepScope };
}

/** only_phases as stored (int[] or '1,2,3') → number[], or null when unset. */
function scopeList(onlyPhases) {
  if (onlyPhases == null) return null;
  const list = Array.isArray(onlyPhases) ? onlyPhases : String(onlyPhases).replace(/[[\]\s]/g, '').split(',');
  return list.map((p) => parseInt(String(p).replace(/^P/i, ''), 10)).filter(Number.isInteger);
}

/** The force clears the run will actually reach: phases >= fromPhase, inside only_phases when set. */
function forceClearsFor(fromPhase, onlyPhases) {
  const scope = scopeList(onlyPhases);
  return Object.entries(FORCE_CLEARS)
    .map(([n, what]) => [Number(n), what])
    .filter(([n]) => n >= fromPhase && (!scope || scope.includes(n)))
    .map(([n, what]) => `P${n}: ${what}`);
}

/**
 * Rewrites the scout_jobs row and returns the row as stored.
 * `db` is a supabase-js client; `log` gets the operator-facing warnings.
 */
async function requeueJob(db, { id, fromPhase, force, keepScope }, log = console) {
  const { data: before, error: readErr } = await db.from('scout_jobs')
    .select('id, keyword, status, only_phases').eq('id', id).maybeSingle();
  if (readErr) throw new Error(`read scout_jobs ${id}: ${readErr.message}`);
  if (!before) throw new Error(`no scout_jobs row with id ${id}`);
  if (['claimed', 'running'].includes(before.status)) {
    log.warn(`⚠ job ${id} is ${before.status} — requeuing it does not stop the execution that holds it.`);
  }

  const onlyPhases = keepScope ? before.only_phases : null;
  if (force) {
    const clears = forceClearsFor(fromPhase, onlyPhases);
    log.warn(`⚠ force=true: before re-running each phase the run will clear, for "${before.keyword}":`);
    for (const c of clears.length ? clears : ['(nothing — no phase in scope has a force clear)']) log.warn(`    ${c}`);
    log.warn('  and every phase script gets --force (re-spends even when its output exists; the READ-FIRST plan becomes advisory).');
  }
  const scope = scopeList(onlyPhases);
  if (scope && !scope.some((p) => p >= fromPhase)) {
    log.warn(`⚠ only_phases ${scope.join(',')} has no phase >= ${fromPhase}: this run will execute NO phase. Drop --keep-scope to run P${fromPhase}-P13.`);
  }

  const { data: row, error } = await db.from('scout_jobs').update({
    status: 'queued',
    from_phase: fromPhase,
    force,
    ...(keepScope ? {} : { only_phases: null }),
    error: null,
    current_phase: null,
    current_phase_name: null,
    finished_at: null,
  }).eq('id', id).select('id, keyword, from_phase, only_phases, force').single();
  if (error) throw new Error(`update scout_jobs ${id}: ${error.message}`);
  return row;
}

function formatRow(row) {
  const scope = scopeList(row.only_phases);
  return [
    'Job requeued:',
    `  id          ${row.id}`,
    `  keyword     ${row.keyword}`,
    `  from_phase  ${row.from_phase}`,
    `  only_phases ${scope ? scope.join(',') : 'NULL (every phase from from_phase to P13)'}`,
    `  force       ${row.force}`,
  ].join('\n');
}

async function main(argv = process.argv.slice(2)) {
  let opts;
  try { opts = parseRequeueArgs(argv); } catch (e) { console.error(e.message); process.exit(1); }
  const { createClient } = require('@supabase/supabase-js');
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  try {
    console.log(formatRow(await requeueJob(db, opts)));
  } catch (e) {
    console.error('ERR', e.message);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { parseRequeueArgs, forceClearsFor, requeueJob, formatRow, FORCE_CLEARS };
