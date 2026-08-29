/**
 * drain-queue.js — portal-proof job chain.
 *
 * Polls scout_jobs; whenever nothing is running and jobs are queued, triggers
 * the next execution via the trigger-scout-job edge function (server-side
 * OAuth → Cloud Run Jobs :run), so it works even when local HTTPS to Google
 * APIs is broken (captive-portal certificate hijack). Exits when the queue is
 * empty and nothing is running, or after MAX_MINUTES.
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const D = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const FN_URL = `${process.env.SUPABASE_URL}/functions/v1/trigger-scout-job`;
const MAX_MINUTES = parseInt(process.env.DRAIN_MAX_MINUTES || '420', 10);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const t0 = Date.now();
  let lastTriggered = null;
  while ((Date.now() - t0) / 60000 < MAX_MINUTES) {
    let jobs = null;
    try {
      const { data, error } = await D.from('scout_jobs')
        .select('id, keyword, status, current_phase_name, created_at')
        .in('status', ['queued', 'running'])
        .order('created_at', { ascending: true });
      if (error) throw error;
      jobs = data || [];
    } catch (e) {
      console.log(new Date().toLocaleTimeString('en-GB'), `poll failed (${e.message}) — retrying`);
      await sleep(60000);
      continue;
    }

    const running = jobs.filter(j => j.status === 'running');
    const queued = jobs.filter(j => j.status === 'queued');
    console.log(new Date().toLocaleTimeString('en-GB'),
      `running: ${running.map(j => `${j.keyword}@${j.current_phase_name || '?'}`).join(', ') || 'none'} | queued: ${queued.length}`);

    if (!running.length && !queued.length) { console.log('=== QUEUE EMPTY ==='); break; }

    if (!running.length && queued.length) {
      const next = queued[0];
      if (lastTriggered === next.id) {
        // Triggered it last round and it's still queued — execution may not
        // have claimed it yet; give it one more poll before re-triggering.
        lastTriggered = null;
      } else {
        try {
          const res = await fetch(FN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SUPABASE_KEY}`, apikey: process.env.SUPABASE_KEY },
            body: JSON.stringify({ scout_job_id: next.id }),
          });
          const txt = (await res.text()).slice(0, 200);
          console.log(`  → triggered "${next.keyword}" (${next.id.slice(0, 8)}): HTTP ${res.status} ${txt}`);
          lastTriggered = next.id;
        } catch (e) {
          console.log(`  → trigger failed (${e.message}) — will retry`);
        }
      }
    }
    await sleep(300000);
  }
})();
