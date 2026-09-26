#!/usr/bin/env node
/**
 * submit-job.js — CLI equivalent of the Launchpad "Analyze" click.
 * Replicates useSubmitScoutJob exactly: double-submit guard (with the
 * 15-min stale-queued exclusion), "#N" session-isolation labeling,
 * research-scope default (only_phases 1-8), then trigger-scout-job invoke.
 *
 * Usage:  node submit-job.js "sugar free electrolytes" [--full] [--cheap]
 *   --full   run all 13 phases (formula chain included) instead of research scope
 *   --cheap  cheap_mode test run (all-Flash, is_test tagged)
 */
require('dotenv').config();
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) { console.error('Missing SUPABASE_URL / SUPABASE_KEY in scout/.env'); process.exit(1); }

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith('--')));
const raw = args.filter(a => !a.startsWith('--')).join(' ').trim();
const base = raw.replace(/\s*#\d+\s*$/, '').toLowerCase();
if (!base) { console.error('Usage: node submit-job.js "<keyword>" [--full] [--cheap]'); process.exit(1); }

const RESEARCH_SCOPE = '1,2,3,4,5,6,7,8';
const STALE_QUEUED_MS = 15 * 60 * 1000;

(async () => {
  // 1. Double-submit guard (same rules as the app)
  const inflightRes = await fetch(
    `${URL_}/rest/v1/scout_jobs?select=id,keyword,status,created_at,claimed_at&status=in.(queued,claimed,running)&keyword=ilike.${encodeURIComponent(base)}%25`,
    { headers: H });
  const inflight = await inflightRes.json();
  const hit = (inflight || []).find(j => {
    if (j.keyword.toLowerCase().replace(/\s*#\d+\s*$/, '') !== base) return false;
    if (j.status === 'queued' && !j.claimed_at &&
        Date.now() - new Date(j.created_at).getTime() > STALE_QUEUED_MS) return false;
    return true;
  });
  if (hit) { console.error(`✗ "${hit.keyword}" is already ${hit.status} — wait or cancel first.`); process.exit(1); }

  // 2. Session-isolation label (same regex rules as the app)
  const sibRes = await fetch(
    `${URL_}/rest/v1/categories?select=search_term,name&or=(search_term.ilike.${encodeURIComponent(base)}%25,name.ilike.${encodeURIComponent(base)}%25)`,
    { headers: H });
  const sibs = await sibRes.json();
  const esc = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const nums = (sibs || [])
    .map(c => (c.search_term || c.name || '').toLowerCase().trim())
    .filter(s => s === base || new RegExp(`^${esc}\\s*#\\d+$`).test(s))
    .map(s => { const m = s.match(/#(\d+)\s*$/); return m ? parseInt(m[1], 10) : 1; });
  const keyword = nums.length ? `${base} #${Math.max(...nums) + 1}` : base;

  // 3. Insert the job (research scope by default, same as the app)
  const payload = {
    keyword, status: 'queued', force: false, use_ai: false,
    only_phases: flags.has('--full') ? null : RESEARCH_SCOPE,
    cheap_mode: flags.has('--cheap'), is_test: flags.has('--cheap'),
  };
  const insRes = await fetch(`${URL_}/rest/v1/scout_jobs`, {
    method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(payload) });
  const ins = await insRes.json();
  if (!insRes.ok || !ins?.[0]?.id) { console.error('✗ Insert failed:', JSON.stringify(ins)); process.exit(1); }
  const job = ins[0];
  console.log(`✓ Queued "${job.keyword}" (job ${job.id}) — scope: ${job.only_phases || 'FULL 13 phases'}${job.cheap_mode ? ' [CHEAP TEST]' : ''}`);

  // 4. Trigger the Cloud Run execution (best-effort, insert is durable)
  const trigRes = await fetch(`${URL_}/functions/v1/trigger-scout-job`, {
    method: 'POST', headers: H, body: JSON.stringify({ scout_job_id: job.id }) });
  if (trigRes.ok) console.log('✓ trigger-scout-job invoked — Cloud Run execution starting.');
  else console.error(`⚠ trigger invoke failed (${trigRes.status}) — job stays queued; retry: node submit-job.js trigger, or use the app.`);
})();
