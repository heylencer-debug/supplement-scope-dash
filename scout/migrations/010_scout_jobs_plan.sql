-- 010_scout_jobs_plan.sql
-- Target project: jwkitkfufigldpldqtbq (the only live Supabase project).
-- NOT APPLIED by the branch that added it — apply deliberately.
--
-- Purpose: store the READ-FIRST plan (scout/plan-scope.js) that
-- run-pipeline.js builds before any scrape, so the dashboard / an operator
-- can see per phase what the job decided (reuse | top-up | refresh | scrape),
-- why, how many ASINs of work it expected and what it expected to spend.
-- Written twice per job: stage 'start' and stage 'after-P1' (the plan is
-- rebuilt once P1 has fixed the session's ASIN set). Latest write wins.
--
-- Until this is applied run-pipeline.js logs a non-fatal warning and carries
-- on — the plan is still printed to the job log and still honoured.
--
-- Additive only (ADD COLUMN IF NOT EXISTS) — no existing column touched.

ALTER TABLE public.scout_jobs
  ADD COLUMN IF NOT EXISTS plan jsonb;

COMMENT ON COLUMN public.scout_jobs.plan IS
  'READ-FIRST plan from scout/plan-scope.js: {stage, mode, phases:{P1..P13:{decision,source,reason,work,cost,...}}, skip, syncOnly, estimate, recommendation, sessions}.';
