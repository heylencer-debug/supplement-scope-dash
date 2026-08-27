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
}

export interface ScoutJobInsert {
  keyword: string;
  status?: ScoutJobStatus;
  force?: boolean;
  from_phase?: number | null;
  only_phases?: string | null;
  use_ai?: boolean;
}

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
