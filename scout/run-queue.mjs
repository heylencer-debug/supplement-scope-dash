#!/usr/bin/env node
/**
 * run-queue.mjs — sequential multi-keyword pipeline orchestrator.
 * For each keyword: submit a research-scope run (replicating the Launchpad
 * hook: #N session labels, double-submit guard), poll to terminal state,
 * then run the formula chain (from_phase 9) and poll again.
 * Progress + results append to run-queue.log next to this script.
 *
 * Usage: node run-queue.mjs   (keywords are defined below)
 */
import { appendFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';
const HERE = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(HERE, '.env') });

const KEYWORDS = [
  'electrolytes',
  'electrolyte packets',
  'electrolytes powder packets',
  'electrolytes powder',
  'hydration packets',
  'electrolyte powder',
  'instant hydration packets',
  'electrolyte drink',
  'hydration powder',
];

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const LOG = path.join(HERE, 'run-queue.log');
const log = (msg) => {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  appendFileSync(LOG, line + '\n');
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const RESEARCH_SCOPE = '1,2,3,4,5,6,7,8';
const POLL_MS = 90_000;           // 90s between polls
const RESEARCH_TIMEOUT_MS = 3 * 3600_000;
const FORMULA_TIMEOUT_MS = 90 * 60_000;

async function rest(pathq) {
  const r = await fetch(`${URL_}/rest/v1/${pathq}`, { headers: H });
  if (!r.ok) throw new Error(`REST ${r.status} on ${pathq.slice(0, 80)}`);
  return r.json();
}

async function sessionLabel(base) {
  const sibs = await rest(`categories?select=search_term,name&or=(search_term.ilike.${encodeURIComponent(base)}%25,name.ilike.${encodeURIComponent(base)}%25)`);
  const esc = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const nums = (sibs || [])
    .map((c) => (c.search_term || c.name || '').toLowerCase().trim())
    .filter((s) => s === base || new RegExp(`^${esc}\\s*#\\d+$`).test(s))
    .map((s) => { const m = s.match(/#(\d+)\s*$/); return m ? parseInt(m[1], 10) : 1; });
  return nums.length ? `${base} #${Math.max(...nums) + 1}` : base;
}

async function guardClear(base) {
  const rows = await rest(`scout_jobs?select=keyword,status,created_at,claimed_at&status=in.(queued,claimed,running)&keyword=ilike.${encodeURIComponent(base)}%25`);
  return !(rows || []).some((j) => {
    if (j.keyword.toLowerCase().replace(/\s*#\d+\s*$/, '') !== base) return false;
    if (j.status === 'queued' && !j.claimed_at && Date.now() - new Date(j.created_at).getTime() > 15 * 60_000) return false;
    return true;
  });
}

async function insertJob(payload) {
  const r = await fetch(`${URL_}/rest/v1/scout_jobs`, {
    method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(payload) });
  const j = await r.json();
  if (!r.ok || !j?.[0]?.id) throw new Error(`insert failed: ${JSON.stringify(j).slice(0, 200)}`);
  return j[0];
}

async function trigger(jobId) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(`${URL_}/functions/v1/trigger-scout-job`, {
        method: 'POST', headers: H, body: JSON.stringify({ scout_job_id: jobId }) });
      if (r.ok) return true;
      log(`  trigger attempt ${i + 1} HTTP ${r.status}`);
    } catch (e) { log(`  trigger attempt ${i + 1} error: ${e.message}`); }
    await sleep(30_000);
  }
  return false;
}

async function pollJob(jobId, timeoutMs, label) {
  const t0 = Date.now();
  let last = '';
  while (Date.now() - t0 < timeoutMs) {
    await sleep(POLL_MS);
    try {
      const rows = await rest(`scout_jobs?id=eq.${jobId}&select=status,current_phase,total_phases,current_phase_name,error,total_cost_usd`);
      const j = rows?.[0];
      if (!j) { log(`  ${label}: job row vanished?!`); continue; }
      const state = `${j.status} P${j.current_phase ?? '-'} /${j.total_phases} ${j.current_phase_name ?? ''}`;
      if (state !== last) { log(`  ${label}: ${state}`); last = state; }
      if (j.status === 'complete' || j.status === 'error') return j;
    } catch (e) { log(`  ${label}: poll error ${e.message}`); }
  }
  return { status: 'timeout' };
}

const results = [];
for (const base of KEYWORDS) {
  log(`=== KEYWORD: "${base}" ===`);
  try {
    if (!(await guardClear(base))) { log(`  SKIP: a job for "${base}" is already in flight`); results.push({ base, outcome: 'skipped-inflight' }); continue; }
    const keyword = await sessionLabel(base);
    log(`  session label: "${keyword}"`);

    // Phase 1: research scope
    const rj = await insertJob({ keyword, status: 'queued', force: false, use_ai: false, only_phases: RESEARCH_SCOPE, cheap_mode: false, is_test: false });
    log(`  research job ${rj.id} queued`);
    if (!(await trigger(rj.id))) { log(`  TRIGGER FAILED for research — moving on`); results.push({ base, keyword, outcome: 'trigger-failed' }); continue; }
    const rDone = await pollJob(rj.id, RESEARCH_TIMEOUT_MS, 'research');
    if (rDone.status !== 'complete') {
      log(`  RESEARCH ${rDone.status}${rDone.error ? ': ' + rDone.error : ''} — cost $${rDone.total_cost_usd ?? '?'} — skipping formula chain`);
      results.push({ base, keyword, outcome: `research-${rDone.status}`, error: rDone.error, cost: rDone.total_cost_usd });
      continue;
    }
    log(`  research COMPLETE — cost $${rDone.total_cost_usd ?? '?'}`);

    // Phase 2: formula chain (fresh session — no force needed)
    const fj = await insertJob({ keyword, status: 'queued', from_phase: 9, only_phases: null });
    log(`  formula job ${fj.id} queued`);
    if (!(await trigger(fj.id))) { log(`  TRIGGER FAILED for formula chain`); results.push({ base, keyword, outcome: 'formula-trigger-failed', researchCost: rDone.total_cost_usd }); continue; }
    const fDone = await pollJob(fj.id, FORMULA_TIMEOUT_MS, 'formula');
    log(`  formula chain ${fDone.status}${fDone.error ? ': ' + fDone.error : ''} — cost $${fDone.total_cost_usd ?? '?'}`);
    results.push({ base, keyword, outcome: fDone.status === 'complete' ? 'DONE' : `formula-${fDone.status}`, error: fDone.error, researchCost: rDone.total_cost_usd, formulaCost: fDone.total_cost_usd });
  } catch (e) {
    log(`  FATAL for "${base}": ${e.message} — continuing with next keyword`);
    results.push({ base, outcome: 'fatal', error: e.message });
  }
}

log('=== QUEUE FINISHED ===');
for (const r of results) log(`RESULT ${r.base} -> ${r.outcome}${r.keyword ? ` (${r.keyword})` : ''}${r.error ? ` | ${String(r.error).slice(0, 120)}` : ''} | research $${r.researchCost ?? '-'} formula $${r.formulaCost ?? '-'}`);
