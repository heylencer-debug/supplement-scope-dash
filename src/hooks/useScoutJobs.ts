import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { ScoutJobInsert, ScoutJobRow } from "@/types/scoutJobs";

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
    mutationFn: async (params: { keyword: string; force?: boolean; useAi?: boolean }) => {
      const base = params.keyword.trim().replace(/\s*#\d+\s*$/, "").toLowerCase();
      if (!base) throw new Error("Keyword is required");

      // DOUBLE-SUBMIT / DUPLICATE GUARD: refuse when any session of this
      // keyword is already queued or running (two rapid Enters used to
      // create two identical jobs).
      const { data: inflight } = await scoutJobsTable()
        .select("id, keyword, status")
        .in("status", ["queued", "claimed", "running"])
        .ilike("keyword", `${base}%`);
      const inflightHit = (inflight || []).find(
        (j: { keyword: string }) => j.keyword.toLowerCase().replace(/\s*#\d+\s*$/, "") === base
      );
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

      const insertPayload: ScoutJobInsert = {
        keyword,
        status: "queued",
        force: params.force ?? false,
        use_ai: params.useAi ?? false,
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
          body: { job_id: (job as ScoutJobRow).id, keyword },
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
