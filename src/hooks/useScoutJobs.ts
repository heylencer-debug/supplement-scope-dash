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
      const keyword = params.keyword.trim();
      if (!keyword) throw new Error("Keyword is required");

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
    onSuccess: ({ triggerOk }) => {
      queryClient.invalidateQueries({ queryKey: ["scout_jobs"] });
      if (triggerOk) {
        toast({
          title: "Analysis queued",
          description: "Scout picked up the request and is starting the pipeline.",
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
      const { data, error } = await scoutJobsTable()
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      // Table not migrated yet (004 pending) -> treat as empty, not an error.
      if (error) {
        if (error.code === "42P01" || /relation .* does not exist/i.test(error.message ?? "")) {
          return [];
        }
        throw error;
      }
      return (data ?? []) as ScoutJobRow[];
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
