require('dotenv').config({ path: '/Users/doncarlos/supplement-scope-dash/scout/.env' });
const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const IDS = process.argv.slice(2);
const seen = {};
(async () => {
  while (true) {
    let rows = [];
    try { rows = (await db.from('scout_jobs').select('id,keyword,status,current_phase,current_phase_name,error,total_cost_usd,finished_at').in('id', IDS)).data || []; } catch {}
    let done = 0;
    for (const r of rows) {
      const key = `${r.status}|${r.current_phase}`;
      if (seen[r.id] !== key) { seen[r.id] = key; console.log(`${r.keyword}: ${r.status} P${r.current_phase ?? '-'} ${r.current_phase_name ?? ''} cost=$${Number(r.total_cost_usd || 0).toFixed(2)}${r.error ? ' ERROR: ' + String(r.error).slice(0, 200) : ''}`); }
      if (['complete', 'error'].includes(r.status)) done++;
    }
    if (rows.length && done === rows.length) { console.log('ALL JOBS TERMINAL'); process.exit(0); }
    await new Promise(r => setTimeout(r, 60000));
  }
})();
