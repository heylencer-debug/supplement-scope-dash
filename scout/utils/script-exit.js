/**
 * utils/script-exit.js — how a phase script ends when it fails on its own.
 *
 * run-pipeline.js runs a phase as a chain of scripts (runScript rejects on any
 * non-zero exit) and runPhaseWithRetry re-runs the WHOLE chain up to three
 * times, then stops the pipeline. So the exit code of a script decides two
 * things at once: whether the failure is seen, and what gets re-run.
 *
 *   failAndExit       — the script is the phase's own work (or its first step)
 *                       and nothing paid runs before it in the chain: exit 1,
 *                       so the runner retries it and stops on it.
 *   toleratedFailure  — the script is a sync step AFTER a paid producer in the
 *                       same chain (migrate-reviews after the P3 scrape,
 *                       migrate-ocr after the P4 vision OCR). A non-zero exit
 *                       there would re-run the paid step and then stop a run
 *                       that the gate/verifier would judge on the data itself.
 *                       It exits 0 and says so, loudly, on stderr, with a
 *                       fixed "SYNC FAILED" prefix to grep the logs for.
 */
'use strict';

function messageOf(err) {
  return (err && (err.message || String(err))) || 'unknown error';
}

/** For main().catch(...) in a script whose failure must stop the phase. */
function failAndExit(script, err, { log = console, proc = process } = {}) {
  log.error(`\n❌ ${script} FAILED: ${messageOf(err)}`);
  if (err && err.stack) log.error(err.stack.split('\n').slice(1, 4).join('\n'));
  proc.exitCode = 1;
}

/** For a sync step whose non-zero exit would re-run a paid producer. Exit code stays 0. */
function toleratedFailure(script, err, { phase, log = console, proc = process } = {}) {
  log.error(`\n❌ SYNC FAILED — ${script}: ${messageOf(err)}`);
  log.error(`   Exit code stays 0 on purpose: a non-zero exit would make run-pipeline.js re-run the paid ${phase || 'producer'} step before it.`);
  log.error(`   The ${phase || 'phase'} bar (mid-run gate / final verifier) reports the data that did not land; re-run this script alone to repair it.`);
  if (proc.exitCode == null) proc.exitCode = 0;
}

module.exports = { failAndExit, toleratedFailure };
