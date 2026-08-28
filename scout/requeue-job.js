// Requeue a scout job from a given phase (used after cancelling a stale execution).
// Usage: node requeue-job.js <job-id> <from_phase>
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const D = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

(async () => {
  const [id, fromPhase] = process.argv.slice(2);
  if (!id || !fromPhase) { console.error('usage: node requeue-job.js <job-id> <from_phase>'); process.exit(1); }
  const { error } = await D.from('scout_jobs').update({
    status: 'queued',
    from_phase: parseInt(fromPhase, 10),
    force: true,
    error: null,
    current_phase: null,
    current_phase_name: null,
    finished_at: null,
  }).eq('id', id);
  if (error) { console.error('ERR', error.message); process.exit(1); }
  console.log(`Job ${id} requeued from phase ${fromPhase} (force=true)`);
})();
