/**
 * cloud-worker.js — Cloud Run Job entrypoint for the Scout pipeline.
 *
 * Mirrors the noodle-render-worker pattern (~/noodle-render-worker/worker.js):
 * ONE container execution processes EXACTLY ONE scout_jobs row, then exits.
 * No interactive prompts, no polling loop — Cloud Run Jobs semantics.
 *
 * Modes:
 *   - SCOUT_JOB_ID env set  -> claim exactly that row (used by trigger-scout-job
 *     edge function, which fires a Cloud Run execution with this override).
 *   - SCOUT_JOB_ID unset    -> claim the oldest 'queued' row in scout_jobs.
 *
 * Claim is atomic via the claim_scout_job() Postgres function (queued -> claimed
 * UPDATE ... RETURNING), so a duplicate Cloud Run retry task can never double-run
 * the same job. If nothing is claimable, this logs NOT CLAIMED and exits 0 —
 * never a nonzero exit for "no work", since a Cloud Run Job retry on exit 0 is
 * a no-op but a retry on nonzero would re-trigger unnecessarily.
 *
 * The actual pipeline work is delegated to run-pipeline.js unchanged (spawned
 * as a child process, stdio inherited so logs land in Cloud Run Logging). That
 * script already writes progress back to scout_jobs via SCOUT_JOB_ID (see the
 * updateJobStatus() hook added there) and does its own retry/verification.
 *
 * Usage inside the container: `node cloud-worker.js` (see Dockerfile CMD).
 */

require('dotenv').config();
const { spawn } = require('child_process');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[cloud-worker] FATAL: SUPABASE_URL / SUPABASE_KEY not set');
  process.exit(1);
}

const DOVIVE = createClient(SUPABASE_URL, SUPABASE_KEY);
const SCOUT_DIR = __dirname;
const JOB_ID = process.env.SCOUT_JOB_ID || null;

function runPipeline(job) {
  return new Promise((resolve) => {
    const args = ['run-pipeline.js', '--keyword', job.keyword];
    if (job.force) args.push('--force');
    if (job.use_ai) args.push('--ai');
    if (job.from_phase) args.push('--from', `P${job.from_phase}`);
    // only_phases arrives from Supabase as an ARRAY — stringifying it naively
    // produced "--phases [10]", which run-pipeline parseInt'd to NaN and ran
    // ZERO phases while reporting success (silent no-op).
    if (job.only_phases) {
      const phasesArg = Array.isArray(job.only_phases)
        ? job.only_phases.join(',')
        : String(job.only_phases).replace(/[\[\]\s]/g, '');
      args.push('--phases', phasesArg);
    }

    console.log(`[cloud-worker] spawning: node ${args.join(' ')}`);
    const proc = spawn('node', args, {
      cwd: SCOUT_DIR,
      stdio: 'inherit',
      env: { ...process.env, SCOUT_JOB_ID: job.id },
    });
    proc.on('close', (code) => resolve(code));
    proc.on('error', (err) => {
      console.error(`[cloud-worker] failed to spawn run-pipeline.js: ${err.message}`);
      resolve(1);
    });
  });
}

async function main() {
  console.log(`[cloud-worker] starting — JOB_ID=${JOB_ID || '(claim oldest queued)'}`);
  console.log(`[cloud-worker] node=${process.version} SUPABASE_URL=${SUPABASE_URL}`);

  // One-time network diagnostic (DEBUG_NET=1) — helps distinguish "fetch
  // failed" caused by missing DNS/egress from a real Postgres/RPC error.
  if (process.env.DEBUG_NET) {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/`, { headers: { apikey: SUPABASE_KEY } });
      console.log(`[cloud-worker] DEBUG_NET: fetch ${SUPABASE_URL}/rest/v1/ -> ${r.status}`);
    } catch (e) {
      console.error(`[cloud-worker] DEBUG_NET: fetch failed: ${e.message} cause=${e.cause?.message || e.cause}`);
    }
  }

  const { data: claimed, error: claimErr } = await DOVIVE.rpc('claim_scout_job', {
    p_job_id: JOB_ID,
  });

  if (claimErr) {
    console.error(`[cloud-worker] claim_scout_job RPC failed: ${claimErr.message}`);
    console.error('[cloud-worker] make sure migrations/003_scout_jobs_cloud_run.sql has been run in the Dovive Supabase dashboard.');
    process.exit(1);
  }

  const job = Array.isArray(claimed) ? claimed[0] : claimed;
  if (!job) {
    console.log('[cloud-worker] NOT CLAIMED — no queued row matched (already claimed, or no queued rows). Exiting 0.');
    process.exit(0);
  }

  console.log(`[cloud-worker] claimed job ${job.id} — keyword="${job.keyword}"`);

  const exitCode = await runPipeline(job);

  if (exitCode === 0) {
    console.log(`[cloud-worker] run-pipeline.js exited 0 for job ${job.id}`);
    // run-pipeline.js already writes the terminal status (complete/error) via
    // updateJobStatus(). This is a safety net only, in case that write itself
    // failed silently (e.g. crash mid-write).
    const { data: row } = await DOVIVE.from('scout_jobs').select('status').eq('id', job.id).single();
    if (row && row.status !== 'complete' && row.status !== 'error') {
      await DOVIVE.from('scout_jobs').update({
        status: 'complete',
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', job.id);
    }
  } else {
    console.error(`[cloud-worker] run-pipeline.js exited ${exitCode} for job ${job.id}`);
    const { data: row } = await DOVIVE.from('scout_jobs').select('status').eq('id', job.id).single();
    if (row && row.status !== 'error') {
      await DOVIVE.from('scout_jobs').update({
        status: 'error',
        error: `worker: run-pipeline.js exited with code ${exitCode}`,
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', job.id);
    }
  }

  // Always exit 0: the job's terminal state lives in scout_jobs, not in the
  // Cloud Run Execution's own success/failure — a nonzero exit here would make
  // Cloud Run retry the WHOLE container (maxRetries: 1) for a pipeline failure
  // that is already recorded and will not be fixed by re-running blindly.
  process.exit(0);
}

main().catch((e) => {
  console.error(`[cloud-worker] FATAL uncaught error: ${e.stack || e.message}`);
  process.exit(1);
});
