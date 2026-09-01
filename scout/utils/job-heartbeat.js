/**
 * scout/utils/job-heartbeat.js — lightweight mid-phase progress heartbeat.
 *
 * Long phases (P1 detail-scrape, P3 reviews, P4 OCR/text-extract, P6 product
 * intelligence) iterate per-product for 20-40 minutes with no scout_jobs
 * update between phase boundaries — the Launchpad live strip shows a frozen
 * phase for the whole duration (has fooled the user twice into thinking a
 * run had stalled). reportProgress(done, total) writes
 * scout_jobs.phase_progress ({"done":N,"total":M}) and touches updated_at,
 * throttled to roughly every 10 products or 60s (whichever comes first).
 *
 * FAIL-OPEN BY DESIGN: never throws. A heartbeat failure (missing env,
 * network error, table/column missing on an old DB) must never break the
 * phase it's reporting for — every failure path is caught and logged as a
 * non-fatal warning, same pattern as run-pipeline.js's own updateJobStatus().
 *
 * No-op outside Cloud Run one-shot mode (SCOUT_JOB_ID unset — e.g. local
 * `node phase6-product-intelligence.js --keyword "..."` runs).
 *
 * Usage (inside a phase script's per-product loop):
 *   const { reportProgress } = require('./utils/job-heartbeat');
 *   ...
 *   for (let i = 0; i < list.length; i++) {
 *     ...
 *     await reportProgress(i + 1, list.length);
 *   }
 */

let _client = null;
function getClient() {
  if (_client) return _client;
  try {
    const { createClient } = require('@supabase/supabase-js');
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) return null;
    _client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  } catch (e) {
    return null;
  }
  return _client;
}

const MIN_STEP = 10;            // report at least every 10 items...
const MIN_INTERVAL_MS = 60000;  // ...or every 60s, whichever comes first

let _lastDone = -1;
let _lastReportAt = 0;

async function reportProgress(done, total) {
  const jobId = process.env.SCOUT_JOB_ID;
  if (!jobId) return; // local/non-Cloud-Run run — nothing to report to

  const isFirst = _lastDone === -1;
  const isFinal = total > 0 && done >= total;
  const stepDue = done - _lastDone >= MIN_STEP;
  const timeDue = Date.now() - _lastReportAt >= MIN_INTERVAL_MS;

  if (!isFirst && !isFinal && !stepDue && !timeDue) return;

  try {
    const supabase = getClient();
    if (!supabase) return;
    const { error } = await supabase
      .from('scout_jobs')
      .update({ phase_progress: { done, total }, updated_at: new Date().toISOString() })
      .eq('id', jobId);
    if (error) {
      console.warn(`⚠ heartbeat update failed (non-fatal): ${error.message}`);
      return;
    }
    _lastDone = done;
    _lastReportAt = Date.now();
  } catch (e) {
    console.warn(`⚠ heartbeat update failed (non-fatal): ${e.message}`);
  }
}

module.exports = { reportProgress };
