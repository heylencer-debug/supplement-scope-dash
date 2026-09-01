/**
 * Manual types for the `scout_jobs` table (Cloud Run Job queue).
 *
 * NOT in the generated `src/integrations/supabase/types.ts` yet — the table
 * is created by `scout/migrations/004_consolidated_cloud.sql`, which has not
 * been applied to the live Supabase project yet (pending manual user action,
 * see scout/DEPLOY_NOTES.md). Once 004 is applied and types are regenerated,
 * this file can be deleted and callers switched to `Tables<"scout_jobs">`.
 *
 * Schema mirrors 004_consolidated_cloud.sql exactly — keep in sync if that
 * migration file changes before it's applied.
 */

export type ScoutJobStatus = "queued" | "claimed" | "running" | "complete" | "error";

export interface ScoutJobRow {
  id: string;
  keyword: string;
  status: ScoutJobStatus;
  force: boolean;
  from_phase: number | null;
  only_phases: string | null;
  use_ai: boolean;
  current_phase: number | null;
  current_phase_name: string | null;
  total_phases: number | null;
  claimed_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
  cloud_run_execution: string | null;
  created_at: string;
  updated_at: string;
  /** 2026-09-01 cost-ledger columns — null on rows from before the ledger existed. */
  total_cost_usd: number | null;
  total_prompt_tokens: number | null;
  total_completion_tokens: number | null;
  /** 2026-09-01: cheap engineering test mode (routes every AI call to Gemini Flash). */
  cheap_mode: boolean;
  /** 2026-09-01: surfaces a "TEST" chip — set automatically when cheap_mode is on. */
  is_test: boolean;
  /** 2026-09-02: mid-phase heartbeat (scout/migrations/008) — sub-progress
   * within the CURRENT phase (e.g. P4 OCR product 37 of 140), written by
   * scout/utils/job-heartbeat.js roughly every 10 products or 60s. Null on
   * rows from before this migration, or between heartbeat writes for phases
   * that don't report sub-progress (P2/P5/P7/P8-P13 run too fast/coarse to
   * need it) — always treat null as "no sub-progress available", not an
   * error. */
  phase_progress: { done: number; total: number } | null;
}

export interface ScoutJobInsert {
  keyword: string;
  status?: ScoutJobStatus;
  force?: boolean;
  from_phase?: number | null;
  only_phases?: string | null;
  use_ai?: boolean;
  cheap_mode?: boolean;
  is_test?: boolean;
}

/** Research-scope phases (P1 Amazon Scrape through P8 Packaging Intelligence) —
 * the default Launchpad submit scope as of the 2026-09-01 on-demand formula
 * chain change. The formula chain (P9-P13) runs only via "Generate formula
 * brief" or the explicit "Full analysis" toggle. */
export const RESEARCH_SCOPE_PHASES = [1, 2, 3, 4, 5, 6, 7, 8];
/** Formula-chain phases (P9 Formula Brief through P13 Final Sign-off) — run
 * as a continuation job from an existing research-scope category. */
export const FORMULA_CHAIN_FROM_PHASE = 9;

/** Human-readable phase names, matching run-pipeline.js's phase order (P1-P11/P12). */
export const SCOUT_PHASE_NAMES: Record<number, string> = {
  1: "Amazon Scrape",
  2: "Keepa Enrichment",
  3: "Review Analysis",
  4: "OCR / Formula Extraction",
  5: "Deep Research",
  6: "Product Intelligence",
  7: "Market Intelligence",
  8: "Packaging Intelligence",
  9: "Formula Brief",
  10: "Formula QA",
  11: "Competitive Benchmark",
  12: "FDA Compliance",
};
