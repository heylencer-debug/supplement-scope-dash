/**
 * trigger-scout-job — Edge Function entry point for kicking off the Scout
 * pipeline on Cloud Run.
 *
 * Two ways to call it:
 *   1. POST { keyword: "ashwagandha gummies", force?: bool, use_ai?: bool,
 *             from_phase?: number, only_phases?: string }
 *      -> INSERTs a new scout_jobs row (status 'queued'), then fires the
 *         Cloud Run execution with that row's id.
 *   2. POST { scout_job_id: "<uuid>" }
 *      -> fires the Cloud Run execution for an EXISTING queued row (e.g. a
 *         retry, or a row inserted by some other path / a DB trigger).
 *
 * This function is intentionally thin: all pipeline logic lives in
 * scout/run-pipeline.js inside the container. This function's only job is
 * "create/locate the queue row, then best-effort kick Cloud Run" — exactly
 * the getnoodle enqueue-render -> cloudRunTrigger.ts pattern.
 *
 * Deploy target: Dovive Lovable Supabase project (jwkitkfufigldpldqtbq) — that
 * is the project the Supabase CLI is linked to in this repo. IMPORTANT: the
 * `scout_jobs` queue table lives in the separate Scout pipeline DB
 * (fhfqjcvwcxizbioftvdw — see scout/.env SUPABASE_URL), NOT in this
 * function's own hosting project. Supabase auto-injects SUPABASE_URL /
 * SUPABASE_SERVICE_ROLE_KEY for the HOSTING project and those reserved names
 * can't be overridden via `secrets set` — so this function reads the Scout
 * DB's own creds from SCOUT_DB_URL / SCOUT_DB_SERVICE_ROLE_KEY instead (set
 * via `supabase secrets set`, see DEPLOY_NOTES.md).
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { triggerCloudRunScoutJob } from "../_shared/cloudRunTrigger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Scout pipeline DB (fhfqjcvwcxizbioftvdw) — where scout_jobs lives.
    // Deliberately NOT the auto-injected SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY,
    // which point at this function's own hosting project instead. See header.
    const supabaseUrl = Deno.env.get("SCOUT_DB_URL")!;
    const serviceRoleKey = Deno.env.get("SCOUT_DB_SERVICE_ROLE_KEY")!;
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "SCOUT_DB_URL / SCOUT_DB_SERVICE_ROLE_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    let jobId: string | null = body.scout_job_id || null;

    if (!jobId) {
      const keyword = (body.keyword || "").toString().trim();
      if (!keyword) {
        return new Response(
          JSON.stringify({ error: "keyword or scout_job_id is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const { data: inserted, error: insertErr } = await supabase
        .from("scout_jobs")
        .insert({
          keyword,
          force: !!body.force,
          use_ai: !!body.use_ai,
          from_phase: body.from_phase ?? null,
          only_phases: body.only_phases ?? null,
          // 2026-09-01: cheap_mode (routes every AI call to Gemini Flash —
          // engineering test runs only) + is_test (surfaces the "TEST" chip
          // in the frontend so cheap/test runs are never mistaken for real
          // analysis). Both default false/undefined-safe via !! — existing
          // callers that don't send these fields are unaffected.
          cheap_mode: !!body.cheap_mode,
          is_test: !!body.is_test,
          status: "queued",
        })
        .select("id")
        .single();

      if (insertErr) {
        console.error(`[trigger-scout-job] insert failed: ${insertErr.message}`);
        return new Response(
          JSON.stringify({ error: `insert failed: ${insertErr.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      jobId = inserted.id;
    }

    // Best-effort Cloud Run trigger. Never blocks the response — the row is
    // already queued, so a scheduled sweep or manual `gcloud run jobs execute`
    // can pick it up even if this fails (see cloudRunTrigger.ts header).
    const trigger = await triggerCloudRunScoutJob(jobId!);

    if (trigger.ok && trigger.execution) {
      await supabase
        .from("scout_jobs")
        .update({ cloud_run_execution: trigger.execution })
        .eq("id", jobId);
    }

    return new Response(
      JSON.stringify({ scout_job_id: jobId, cloud_run: trigger }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(`[trigger-scout-job] unhandled error: ${(e as Error).message}`);
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
