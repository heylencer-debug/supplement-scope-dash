import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { taskId } = await req.json();

    if (!taskId) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: taskId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Fetch task status
    const { data: task, error } = await supabase
      .from('formula_generation_tasks')
      .select('id, status, result, error, created_at, updated_at')
      .eq('id', taskId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching task:', error);
      throw new Error('Failed to fetch task status');
    }

    if (!task) {
      return new Response(
        JSON.stringify({ error: 'Task not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate elapsed time
    const createdAt = new Date(task.created_at);
    const elapsedMs = Date.now() - createdAt.getTime();
    const elapsedSeconds = Math.floor(elapsedMs / 1000);

    // Check for timeout (3 minutes = 180 seconds)
    const TIMEOUT_SECONDS = 180;
    if (task.status === 'pending' || task.status === 'processing') {
      if (elapsedSeconds > TIMEOUT_SECONDS) {
        // Mark as failed due to timeout
        await supabase
          .from('formula_generation_tasks')
          .update({ 
            status: 'failed', 
            error: 'Generation timed out after 3 minutes',
            updated_at: new Date().toISOString()
          })
          .eq('id', taskId);

        return new Response(
          JSON.stringify({
            status: 'failed',
            error: 'Generation timed out after 3 minutes. Please try again.',
            elapsedSeconds
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Return task status
    const response: Record<string, unknown> = {
      status: task.status,
      elapsedSeconds
    };

    // Don't include the full content in the response (it can be very large and may get truncated).
    // The client will fetch the result directly from the DB when status === 'completed'.
    if (task.status === 'completed' && task.result) {
      response.hasResult = true;
    }
    if (task.status === 'failed' && task.error) {
      response.error = task.error;
    }

    console.log(`[Status Check] Task ${taskId}: ${task.status} (${elapsedSeconds}s elapsed)`);

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in check-generation-status:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
