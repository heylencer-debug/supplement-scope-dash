-- 008_phase_progress_heartbeat.sql
-- Target project: jwkitkfufigldpldqtbq (the only live Supabase project).
--
-- Purpose: long phases (P1 detail-scrape, P3 reviews, P4 OCR/text-extract,
-- P6 product intelligence) iterate per-product for 20-40 minutes with no
-- scout_jobs update between phase boundaries — the Launchpad live strip
-- shows a frozen phase for the whole duration, which has fooled the user
-- twice into thinking a run had stalled. `scout_jobs.phase_progress` lets
-- each phase script report lightweight sub-progress ({"done":N,"total":M})
-- via scout/utils/job-heartbeat.js, throttled to roughly every 10 products
-- or 60s (whichever first), fail-open by design.
--
-- Additive only (ADD COLUMN IF NOT EXISTS) — no existing column touched.
-- Old scout_jobs rows (pre-migration runs) simply have phase_progress = NULL,
-- which the frontend must treat as "no sub-progress available" rather than
-- an error.

ALTER TABLE scout_jobs ADD COLUMN IF NOT EXISTS phase_progress JSONB;
