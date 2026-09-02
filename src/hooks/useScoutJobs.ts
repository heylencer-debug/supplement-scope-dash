import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { ScoutJobInsert, ScoutJobRow } from "@/types/scoutJobs";
import { RESEARCH_SCOPE_PHASES, FORMULA_CHAIN_FROM_PHASE } from "@/types/scoutJobs";

/**
 * scout_jobs isn't in the generated Supabase types yet (004 migration not
 * applied). `.from("scout_jobs" as any)` is intentional here — see
 * src/types/scoutJobs.ts for the manual row type and why.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const scoutJobsTable = () => (supabase.from as unknown as (table: string) => any)("scout_jobs");

/**
 * Submit a new keyword to the cloud Scout pipeline queue.
 *
 * The `scout_jobs` INSERT is the source of truth — a queued row means the
 * keyword WILL be picked up once a Cloud Run Job executes (either via the
 * trigger below, or by the next scheduled/manual run). The `trigger-scout-job`
 * edge function invoke is best-effort: if its secrets aren't configured yet
 * (cloud cutover still mid-rollout, see scout/DEPLOY_NOTES.md) or the
 * function isn't deployed, we swallow that error and still report success —
 * the row is queued either way.
 */
export function useSubmitScoutJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { keyword: string; force?: boolean; useAi?: boolean; fullAnalysis?: boolean; cheapMode?: boolean }) => {
      const base = params.keyword.trim().replace(/\s*#\d+\s*$/, "").toLowerCase();
      if (!base) throw new Error("Keyword is required");

      // DOUBLE-SUBMIT / DUPLICATE GUARD: refuse when any session of this
      // keyword is already queued or running (two rapid Enters used to
      // create two identical jobs).
      // 2026-09-01: a "queued" row that a Cloud Run execution never claimed
      // (trigger-scout-job invoke failed/dropped, or the execution crashed
      // before claiming) used to block this keyword FOREVER — found live
      // when a 5-day-old orphaned "queued" row from an earlier double-submit
      // incident silently blocked a brand-new real submission. A genuinely
      // in-flight job gets claimed within a couple minutes of being queued
      // (trigger-scout-job invokes the Cloud Run execution synchronously on
      // insert), so a still-"queued", never-claimed row older than this
      // window is dead, not in-flight — it no longer blocks new submissions
      // (the stale row itself is left alone, just excluded from the guard).
      const STALE_QUEUED_MS = 15 * 60 * 1000;
      const { data: inflight, error: inflightErr } = await scoutJobsTable()
        .select("id, keyword, status, created_at, claimed_at")
        .in("status", ["queued", "claimed", "running"])
        .ilike("keyword", `${base}%`);
      if (inflightErr) throw new Error("Could not verify queue state — try again in a moment.");
      const inflightHit = (inflight || []).find((j: { keyword: string; status: string; created_at: string; claimed_at: string | null }) => {
        if (j.keyword.toLowerCase().replace(/\s*#\d+\s*$/, "") !== base) return false;
        if (j.status === "queued" && !j.claimed_at) {
          const ageMs = Date.now() - new Date(j.created_at).getTime();
          if (ageMs > STALE_QUEUED_MS) return false; // orphaned, doesn't block
        }
        return true;
      });
      if (inflightHit) {
        throw new Error(`"${inflightHit.keyword}" is already ${inflightHit.status} — wait for it or cancel it first.`);
      }

      // SESSION ISOLATION: if this keyword already has a workspace (any
      // category whose search_term is the base or "base #N"), start a FRESH
      // session — "hydration powder #2" — instead of merging into the old
      // data. Storage/category keys carry the suffix end-to-end; the
      // pipeline searches Amazon/web with the clean words.
      let keyword = base;
      const { data: siblings } = await supabase
        .from("categories")
        .select("search_term, name")
        .or(`search_term.ilike.${base}%,name.ilike.${base}%`);
      const sessionNums = (siblings || [])
        .map((c) => (c.search_term || c.name || "").toLowerCase().trim())
        .filter((s) => s === base || new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*#\\d+$`).test(s))
        .map((s) => {
          const m = s.match(/#(\d+)\s*$/);
          return m ? parseInt(m[1], 10) : 1;
        });
      if (sessionNums.length) {
        keyword = `${base} #${Math.max(...sessionNums) + 1}`;
      }

      // 2026-09-01: default Launchpad submit = research scope only (P1-P8 —
      // scraping through Packaging Intelligence). The formula chain (P9
      // Formula Brief through P13 Final Sign-off, the phases that used to be
      // all-Opus) is expensive and now runs on-demand via "Generate formula
      // brief" on the category dashboard, or the explicit "Full analysis"
      // toggle here. only_phases is a comma-separated TEXT column (see
      // cloud-worker.js's job.only_phases handling) — the same plumbing that
      // already powers --phases for continuation/retry runs.
      const insertPayload: ScoutJobInsert = {
        keyword,
        status: "queued",
        force: params.force ?? false,
        use_ai: params.useAi ?? false,
        only_phases: params.fullAnalysis ? null : RESEARCH_SCOPE_PHASES.join(","),
        cheap_mode: params.cheapMode ?? false,
        is_test: params.cheapMode ?? false,
      };

      const { data: job, error: insertError } = await scoutJobsTable()
        .insert(insertPayload)
        .select()
        .single();

      if (insertError) throw insertError;

      // Best-effort trigger — insert above is already durable.
      let triggerOk = true;
      let triggerError: string | null = null;
      try {
        const { error: invokeError } = await supabase.functions.invoke("trigger-scout-job", {
          body: { scout_job_id: (job as ScoutJobRow).id },
        });
        if (invokeError) {
          triggerOk = false;
          triggerError = invokeError.message ?? "trigger-scout-job invoke failed";
        }
      } catch (err) {
        triggerOk = false;
        triggerError = err instanceof Error ? err.message : "trigger-scout-job unreachable";
      }

      return { job: job as ScoutJobRow, triggerOk, triggerError };
    },
    onSuccess: ({ job, triggerOk }) => {
      queryClient.invalidateQueries({ queryKey: ["scout_jobs"] });
      const isSession = /#\d+\s*$/.test(job.keyword);
      if (triggerOk) {
        toast({
          title: isSession ? `Fresh session: ${job.keyword}` : "Analysis queued",
          description: isSession
            ? "This keyword was analyzed before — starting a separate workspace so the runs don't mix."
            : "Scout picked up the request and is starting the pipeline.",
        });
      } else {
        toast({
          title: "Analysis queued",
          description: "Queued — cloud trigger pending setup. It will run once the Cloud Run cutover finishes.",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to queue analysis",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

/**
 * Queue a continuation job for a category's EXACT existing session keyword —
 * from_phase=9 (Formula Brief onward), never a new "#N" spawn. This is the
 * "Generate formula brief" action: the category already went through the
 * research scope (P1-P8); this picks up exactly where it left off on the
 * SAME category, respecting the session-isolation keyword-matching rules
 * already in place (exact keyword, no fuzzy fallback).
 */
export function useGenerateFormulaBrief() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { keyword: string }) => {
      const keyword = params.keyword.trim();
      if (!keyword) throw new Error("Keyword is required");

      // Double-submit guard — same pattern as useSubmitScoutJob, exact
      // keyword match only (this is a continuation of ONE specific session,
      // not a new base/sibling keyword).
      // Same staleness exclusion as useSubmitScoutJob's guard — a never-claimed
      // "queued" row older than 15 minutes is orphaned, not in-flight.
      const STALE_QUEUED_MS = 15 * 60 * 1000;
      const { data: inflight, error: inflightErr } = await scoutJobsTable()
        .select("id, keyword, status, created_at, claimed_at")
        .in("status", ["queued", "claimed", "running"])
        .eq("keyword", keyword);
      if (inflightErr) throw new Error("Could not verify queue state — try again in a moment.");
      const activeInflight = (inflight || []).filter((j: { status: string; created_at: string; claimed_at: string | null }) => {
        if (j.status === "queued" && !j.claimed_at) {
          const ageMs = Date.now() - new Date(j.created_at).getTime();
          if (ageMs > STALE_QUEUED_MS) return false;
        }
        return true;
      });
      if (activeInflight.length > 0) {
        throw new Error(`"${keyword}" already has a job ${activeInflight[0].status} — wait for it to finish first.`);
      }

      const insertPayload: ScoutJobInsert = {
        keyword,
        status: "queued",
        from_phase: FORMULA_CHAIN_FROM_PHASE,
      };

      const { data: job, error: insertError } = await scoutJobsTable()
        .insert(insertPayload)
        .select()
        .single();
      if (insertError) throw insertError;

      let triggerOk = true;
      try {
        const { error: invokeError } = await supabase.functions.invoke("trigger-scout-job", {
          body: { scout_job_id: (job as ScoutJobRow).id },
        });
        if (invokeError) triggerOk = false;
      } catch {
        triggerOk = false;
      }

      return { job: job as ScoutJobRow, triggerOk };
    },
    onSuccess: ({ triggerOk }) => {
      queryClient.invalidateQueries({ queryKey: ["scout_jobs"] });
      toast({
        title: "Formula brief queued",
        description: triggerOk
          ? "Generating the formula brief, QA, benchmarking, compliance, and sign-off — this'll show in the live strip."
          : "Queued — cloud trigger pending, will run on the next sweep.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to queue formula brief",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

/**
 * Queue a continuation job starting at an ARBITRARY phase (2026-09-02,
 * "Rerun from here" — PipelineStatus's per-phase rerun action). Same
 * from_phase continuation pattern as useGenerateFormulaBrief (SAME category's
 * EXACT existing session keyword, never a new "#N" spawn — session isolation
 * matches scout_jobs.keyword against categories.search_term VERBATIM), just
 * generalized to any phase number instead of being hardcoded to 9. Phases
 * before `fromPhase` are left untouched (run-pipeline.js's `phase.num <
 * FROM_PHASE` skip), and the 2026-09-02 mid-run structural gates (before P5,
 * before P9) still apply exactly as they would for any other invocation —
 * this button does not bypass them.
 */
export function useRerunFromPhase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { keyword: string; fromPhase: number }) => {
      const keyword = params.keyword.trim();
      if (!keyword) throw new Error("Keyword is required");
      if (!params.fromPhase || params.fromPhase < 1) throw new Error("Invalid phase number");

      // Double-submit guard — same pattern as useGenerateFormulaBrief.
      const STALE_QUEUED_MS = 15 * 60 * 1000;
      const { data: inflight, error: inflightErr } = await scoutJobsTable()
        .select("id, keyword, status, created_at, claimed_at")
        .in("status", ["queued", "claimed", "running"])
        .eq("keyword", keyword);
      if (inflightErr) throw new Error("Could not verify queue state — try again in a moment.");
      const activeInflight = (inflight || []).filter((j: { status: string; created_at: string; claimed_at: string | null }) => {
        if (j.status === "queued" && !j.claimed_at) {
          const ageMs = Date.now() - new Date(j.created_at).getTime();
          if (ageMs > STALE_QUEUED_MS) return false;
        }
        return true;
      });
      if (activeInflight.length > 0) {
        throw new Error(`"${keyword}" already has a job ${activeInflight[0].status} — wait for it to finish first.`);
      }

      const insertPayload: ScoutJobInsert = {
        keyword,
        status: "queued",
        from_phase: params.fromPhase,
      };

      const { data: job, error: insertError } = await scoutJobsTable()
        .insert(insertPayload)
        .select()
        .single();
      if (insertError) throw insertError;

      let triggerOk = true;
      try {
        const { error: invokeError } = await supabase.functions.invoke("trigger-scout-job", {
          body: { scout_job_id: (job as ScoutJobRow).id },
        });
        if (invokeError) triggerOk = false;
      } catch {
        triggerOk = false;
      }

      return { job: job as ScoutJobRow, triggerOk, fromPhase: params.fromPhase };
    },
    onSuccess: ({ triggerOk, fromPhase }) => {
      queryClient.invalidateQueries({ queryKey: ["scout_jobs"] });
      toast({
        title: `Rerunning from P${fromPhase}`,
        description: triggerOk
          ? "Queued — this'll show in the live strip and the phase tracker above."
          : "Queued — cloud trigger pending, will run on the next sweep.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to queue rerun",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

/**
 * List recent scout_jobs (queued/running/failed/complete), polled every 5s.
 * Also subscribes to Supabase Realtime so phase updates show up immediately
 * between polls, matching the pattern other Scout status hooks use
 * (see usePipelineStatus.ts for the polling precedent).
 */
export function useScoutJobs(limit: number = 20) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("scout_jobs_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "scout_jobs" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["scout_jobs"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: ["scout_jobs", limit],
    queryFn: async (): Promise<ScoutJobRow[]> => {
      // Order by last ACTIVITY, not creation date: requeued jobs keep their
      // old created_at, so an actively-running job could sit buried under
      // newer completed rows (user: "why don't I see it running in my UI?").
      // updated_at is bumped on every phase transition by the pipeline.
      const { data, error } = await scoutJobsTable()
        .select("*")
        .order("updated_at", { ascending: false, nullsFirst: false })
        .limit(limit);

      // Table not migrated yet (004 pending) -> treat as empty, not an error.
      if (error) {
        if (error.code === "42P01" || /relation .* does not exist/i.test(error.message ?? "")) {
          return [];
        }
        throw error;
      }
      // In-flight jobs always surface above finished ones, regardless of age.
      const rank = (s: string | null) => (s === "running" || s === "claimed" ? 0 : s === "queued" ? 1 : 2);
      return ([...(data ?? [])] as ScoutJobRow[]).sort((a, b) => rank(a.status) - rank(b.status));
    },
    refetchInterval: 5_000,
    staleTime: 3_000,
  });
}

/** Only the jobs still in flight (queued/claimed/running) — for a compact status strip. */
export function useActiveScoutJobs() {
  const { data, ...rest } = useScoutJobs(50);
  const active = (data ?? []).filter((j) => j.status === "queued" || j.status === "claimed" || j.status === "running");
  return { data: active, ...rest };
}
