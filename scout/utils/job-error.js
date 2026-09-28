/**
 * utils/job-error.js — the text run-pipeline.js writes to scout_jobs.error at
 * the end of a run that did not pass.
 *
 * When a phase failed, the loop stops and the final verifier still runs. Its
 * failures are mostly a CONSEQUENCE of the phase that stopped (P6 missing
 * because P5 threw), so the phase's own error leads and the verifier follows:
 *   "P5 Deep Research: <msg> | verifier: <failures>"
 * That keeps the "P<n> <name>: <msg>" shape the dashboard already parses
 * (src/lib/jobErrorMessages.ts), so "Retry from" still points at the phase.
 * Without a phase failure the text is unchanged: "Verifier FAIL: <failures>".
 */
'use strict';

const MAX_LEN = 2000;

/**
 * @param {{ phase: number, name: string, error: string } | null | undefined} phaseFailure
 *   the results[] entry with status 'error', if any
 * @param {string[]} verifierFailures
 */
function composeJobError(phaseFailure, verifierFailures = []) {
  const verifier = (verifierFailures || []).filter(Boolean).join(' | ');
  if (!phaseFailure) return `Verifier FAIL: ${verifier}`.slice(0, MAX_LEN);
  const head = `P${phaseFailure.phase} ${phaseFailure.name}: ${phaseFailure.error || 'failed'}`;
  return (verifier ? `${head} | verifier: ${verifier}` : head).slice(0, MAX_LEN);
}

module.exports = { composeJobError };
