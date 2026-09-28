# Scout pipeline — phase reference

Read this instead of the thirteen phase scripts. It was written on 2026-09-29
from a read of `main` (at commit `c74458a`). No pipeline script was run and
nothing was written to the database while writing it.

Citations are `file:line`, relative to `scout/`. The formula-phase scripts
(`phase5-*` … `phase12-*`, `inventory.js`) were being edited when this was
written, so their line numbers can drift; `run-pipeline.js` and `utils/`
citations are stable. "Operations log" means the Scout session log kept at
`~/.claude/projects/-Users-doncarlos/memory/scout_memory.md`, which records
real run behaviour and spend; every number quoted from it carries its date.

For what each formula phase (P5–P13) reads and writes, column by column, see
[`FORMULA-INPUTS.md`](FORMULA-INPUTS.md). For the READ-FIRST plan in depth,
see [`READ-FIRST.md`](READ-FIRST.md). This document does not repeat either.

Contents

1. [Overview](#1-overview)
2. [Phase by phase](#2-phase-by-phase)
3. [Operations appendix](#3-operations-appendix)
4. [Where code and docs disagree](#4-where-code-and-docs-disagree)

---

## 1. Overview

### 1.1 The thirteen phases, in runner order

`run-pipeline.js` holds the phase list in its `PHASES` array
(`run-pipeline.js:542-632`). **Script filenames are one number behind the
phase number from P7 on**: P7 runs `phase6-market-analysis.js`, P9 runs
`phase8-formula-brief.js`, and so on (`utils/phase-map.js:5-9`). This
document always uses the runner's phase number.

| Phase | Name | Script(s) the runner spawns | Hook | Half | Model (env var) |
|---|---|---|---|---|---|
| P1 | Amazon Scrape | `human-bsr.js`, `migrate-p1-to-dash.js` (`:547,549`) | — | capture | none |
| P2 | Keepa Enrichment | `keepa-phase2.js`, `migrate-keepa-to-dash.js` (`:555,557`); the migrate step also runs the competitor selection | — | capture | none |
| P3 | Reviews | `playwright-reviews.js`, `migrate-reviews-to-dash.js`, `phase3b-review-synthesis.js` (`:566,568,573`) | P3b | capture | P3b: `REVIEW_SYNTHESIS_MODEL` |
| P4 | OCR / Formula Extraction | `phase4-text-extract.js`, `ocr-phase4.js`, `migrate-ocr-to-dash.js` (`:579,581,583`) | P7b after P4 (`:848,902`) | capture | `P4_MODEL`, `OCR_MODEL`; P7b: `P7B_MODEL` |
| P5 | Deep Research | `phase5-deep-research.js` (`:588`) | P5b after P5 (`:852,908`) | formula (still buys web data) | `P5_MODEL`; P5b: `P5B_MODEL` |
| P6 | Product Intelligence | `phase6-product-intelligence.js` (`:592`) | — | formula | `P6_MODEL` |
| P7 | Market Intelligence | `phase6-market-analysis.js` (`:596`) | — | formula | `ANALYSIS_MODEL` |
| P8 | Packaging Intelligence | `phase7-packaging-intelligence.js` (`:600`) | — | formula | none (rule-based) |
| P9 | Formula Brief | `phase8-formula-brief.js` (`:604`) | — | formula | `ANALYSIS_MODEL` + `VALIDATION_MODEL` |
| P10 | Formula QA | `phase9-formula-qa.js`, then `phase6-market-analysis.js --force`, then `seed-category-analysis.js` (`:612,615,617`) | — | formula | `ANALYSIS_MODEL` + `VALIDATION_MODEL` |
| P11 | Competitive Formula Benchmarking | `phase10-competitive-benchmarking.js` (`:622`) | — | formula | `ANALYSIS_MODEL` + `VALIDATION_MODEL` |
| P12 | FDA Compliance | `phase11-fda-compliance.js` (`:626`) | — | formula | `ANALYSIS_MODEL` + `VALIDATION_MODEL` |
| P13 | Final Sign-off | `phase12-final-signoff.js` (`:630`) | — | formula | `VALIDATION_MODEL` |

**Capture** (P1–P4 plus the P3b and P7b hooks) pays for outside data: Amazon
pages, Keepa, Bright Data, plus the two AI passes over what was captured
(review themes, gallery images). **Formula** (P5–P13) reasons over what capture
stored. P5 and its P5b hook sit on the boundary: they still buy outside data
(Perplexity, Bright Data), which is why `FORMULA-INPUTS.md` calls P5 the
boundary phase.

The dashboard's default "Analyze" submits the research scope, phases 1–8
(`submit-job.js:24,56`, `src/hooks/useScoutJobs.ts:121`). The formula chain
(P9–P13) is a separate continuation job with `from_phase = 9`
("Generate formula brief", `src/hooks/useScoutJobs.ts:225`).

Every OpenRouter model default is `anthropic/claude-sonnet-5`, except P4 and
P7b (`~google/gemini-flash-latest`) and P6 (`google/gemini-3.7-flash`). The
runner's phase descriptions still say "Claude Opus 5 validates"
(`run-pipeline.js:621,625,629`), but `VALIDATION_MODEL` has defaulted to
Sonnet 5 since 2026-09-01 (`phase8-formula-brief.js:66`,
`phase12-final-signoff.js:37`). Set `VALIDATION_MODEL=anthropic/claude-opus-5`
to get Opus back.

**Cheap mode.** `--cheap`, or `CHEAP_MODE=true`, sets both `ANALYSIS_MODEL` and
`VALIDATION_MODEL` to `CHEAP_MODE_MODEL` (default `google/gemini-3.7-flash`)
before any phase is spawned (`run-pipeline.js:118-124`). A phase with its own
env var picks that first, so `P4_MODEL`/`OCR_MODEL`, `P6_MODEL`, `P5_MODEL`,
`P5B_MODEL`, `P7B_MODEL` and `REVIEW_SYNTHESIS_MODEL`, if set, win over cheap
mode. A cheap run stamps its new category `is_test = true`
(`run-pipeline.js:885-888`).

### 1.2 Two Supabase clients, one database

Every script builds two clients (`run-pipeline.js:33-37`):

- `DOVIVE` from `SUPABASE_URL` / `SUPABASE_KEY`
- `DASH` from `DASH_URL || SUPABASE_URL` and `DASH_KEY || SUPABASE_KEY`

`DASH_URL` is not set anywhere, so **both clients point at the same project,
`jwkitkfufigldpldqtbq`**. This is recorded in `DEPLOY_NOTES.md` (Cloud Run job
repointed there) and in the operations log (2026-09-15). The old Scout DB
`fhfqjcvwcxizbioftvdw` is no longer used. The two names still say which role a
table plays:

| Role | Client | Tables |
|---|---|---|
| Raw capture | `DOVIVE` | `dovive_research` (UNIQUE `asin,keyword`), `dovive_keepa` (UNIQUE `asin`, shared across sessions), `dovive_reviews` (no unique key, append-only), `dovive_ocr` (UNIQUE `asin,image_index`, shared), `dovive_phase5_research` (UNIQUE `asin,keyword`), `dovive_p5_sources`, `dovive_packaging_intelligence` (UNIQUE `keyword`), `dovive_keywords`, `dovive_history`, `dovive_scout_config` (constraints: `migrations/004_consolidated_cloud.sql:128,217,251,278,287`) |
| Job queue | `DOVIVE` | `scout_jobs`, RPC `claim_scout_job` (`migrations/004_consolidated_cloud.sql:70-86`) |
| Dashboard | `DASH` | `categories`, `products`, `formula_briefs`, `ai_usage_log` (`utils/ai-usage.js:37-44`), `dovive_review_synthesis` (migration 012), `dovive_web_research` (014), `dovive_marketing_assets` (015), `category_analyses` (read by the dashboard; nothing in the pipeline writes it, see P10) |

Raw rows are keyed by the **session label**: the full keyword including any
`#N`, for example `electrolyte powder #6`. Dashboard rows are keyed by
`category_id`, which `utils/category-resolver.js` resolves from
`categories.search_term`. `dovive_keepa` and `dovive_ocr` are shared by ASIN
across sessions. Their `keyword` column is first-writer-wins attribution
(`keepa-phase2.js:315-330`).

### 1.3 How a job runs

```
Dashboard "Analyze" / node submit-job.js "<kw>"
  → INSERT scout_jobs (status 'queued', keyword "<kw> #N", only_phases '1,…,8' or NULL)
  → trigger-scout-job edge function (supabase/functions/trigger-scout-job)
      → Cloud Run Jobs :run on job dovive-scout, env override SCOUT_JOB_ID=<id>
         → container CMD: node cloud-worker.js                    (Dockerfile)
            → rpc claim_scout_job(p_job_id)  queued → claimed   (cloud-worker.js:92)
            → spawn node run-pipeline.js --keyword … [--force] [--ai] [--from Pn] [--phases a,b] [--cheap]
                                                                  (cloud-worker.js:43-68)
               → status 'running' (run-pipeline.js:749)
               → READ-FIRST plan (start) → P1 → re-plan (after-P1) → P2 … Pn
               → final verifier → status 'complete' | 'error'
            → safety net: rewrites status if run-pipeline left it non-terminal (cloud-worker.js:112-136)
            → always exit 0 (cloud-worker.js:138-142)
```

- **Session labels.** `submit-job.js` gives a re-submission of a keyword the
  next `#N` label, and each label gets its own `categories` row
  (`submit-job.js:41-51`). The double-submit guard refuses a keyword that is
  already queued, claimed or running, but ignores a queued row that was never
  claimed and is older than 15 minutes (`submit-job.js:28-39`).
- **Lock.** `run-pipeline.js` writes `.pipeline-lock-<keyword>`. A second run
  of the same keyword refuses to start while the lock is under 4 hours old
  (`run-pipeline.js:142-154`). This matters for local runs only: each Cloud
  Run container has a fresh filesystem.
- **Progress.** The runner writes `current_phase`, `current_phase_name`,
  `total_phases`, `status`, `error`, `started_at` and `finished_at`.
  Long per-product loops (P1, P3, P4, P6) also write
  `scout_jobs.phase_progress = {done,total}`, throttled to about every 10 items
  or 60 s (`utils/job-heartbeat.js`, migration 008).
- **Retry.** Each phase's `run()` is tried 3 times, waiting 0 s, 30 s and 60 s
  (`run-pipeline.js:194-215`). The retry covers **every script in the phase**:
  when P1's migrate step fails, the scrape runs again too. The P5b and P7b hooks
  are deliberately outside the retry (`:899-910`). P3b is inside P3's `run()`
  (`:573`), but it always exits 0, so it can never trigger a retry.
- **Stop on failure.** When a phase exhausts its retries, the runner writes
  `status='error'` and stops (`run-pipeline.js:911-918`).
- **Cost roll-up.** On every exit path, `rollupJobCost()` sums `ai_usage_log`
  for `scout_job_id` into `scout_jobs.total_cost_usd`,
  `total_prompt_tokens` and `total_completion_tokens`
  (`run-pipeline.js:63-91`).
- **Category refresh.** At the end, `categories.total_products`,
  `run_timestamp` and `last_scanned` are refreshed (`run-pipeline.js:937-958`).
- **Notifications.** Telegram messages go through the OpenClaw gateway when
  `OPENCLAW_GATEWAY` and `OPENCLAW_TOKEN` are set, and are silent otherwise
  (`run-pipeline.js:158-169`).

`checkPhaseStatus()` (`run-pipeline.js:363-538`) is **informational only**. It
prints "Partial data … RUNNING" or "Not started — RUNNING", and the phase then
runs anyway (`:858-864`). It has no case for P10. The only things that skip a
phase are the READ-FIRST plan, `--from` and `--phases`.

### 1.4 Gates: mid-run and final

Every bar lives in `utils/verifier-bars.js`. The final verifier, the mid-run
gates and the READ-FIRST plan all call the same `measureVerifierMetrics` and
`evaluateBars` (`verifier-bars.js:1-15`), so the plan can never skip a phase
the verifier would fail.

**Mid-run structural gates** run before a phase and are checked before the
retry loop, so a failed gate never uses up an attempt (`run-pipeline.js:675-678,811-825`):

| Before | Bars checked | Why here |
|---|---|---|
| P5 | P1, P2, P3, P4 | P5 is the first per-product AI phase |
| P9 | P1 through P8 | P9–P13 is the whole dual-AI formula chain |

The gates check the category's **current data**, however the run was invoked
(full run, `--phases`, or a `from_phase: 9` continuation). A failed gate writes
`status='error'` and `Structural gate FAIL before Pn: …`, then exits 2.

**Final verifier** (`run-pipeline.js:968`) runs `evaluateBars` scoped to the
phases this run attempted (`phasesToRun`), so a research-scope run is not
failed for a missing P9–P13.

| Phase | Bar (`verifier-bars.js:19-29,240-282`) | Measured over |
|---|---|---|
| P1 | live run ASINs ≥ 60% of the ASINs this session scraped (always checked, whatever the scope) | `dovive_research` for this label ∩ `products` of the category, **uncapped** pool |
| P2 | `monthly_sales` on ≥ 90% | run ASINs (capped, see below) |
| P3 | `review_analysis` on ≥ 50% of run ASINs, **or** top-20 ≥ `top20Need` **and** this label's own `dovive_reviews` rows ≥ 200 | run ASINs; top-20 by `bsr_current`, selection-scoped when active |
| P4 | `nutrients_count > 0` on ≥ 80% of the **whole category**, or top-20 ≥ `top20Need` | category; top-20 selection-scoped |
| P5 | rows with `full_research` ≥ min(target, max(6, ⌈0.75 × target⌉)), where target = `P5_TOP_COUNT` + `P5_NEW_COUNT` = 5 + 3 | `dovive_phase5_research` for this label |
| P6 | `marketing_analysis` on ≥ 90% | the selection when active, else the whole category |
| P7 | `formula_briefs.ingredients.market_intelligence.ai_market_analysis` exists | category brief row |
| P8 | `marketing_analysis->packaging_intelligence` on ≥ 90% | run ASINs |
| P9 | `ingredients.ai_generated_brief` | brief row |
| P10 | `ingredients.qa_report` | brief row |
| P11 | `competitive_benchmarking.sonnet_draft` **and** `.opus_validation` are real text (non-empty, not `[ERROR:`) | brief row |
| P12 | `fda_compliance.opus_analysis` **and** `.sonnet_validation` are real text | brief row |
| P13 | `final_signoff.opus_review` is real text | brief row |

`top20Need` is 15 without a selection. With a selection it is
min(15, ⌈0.75 × min(20, selection size)⌉) (`utils/selected-competitors.js:83-92`).

**Gate pool cap.** P1 keeps a pool of about 80 listings. With **no** active
competitor selection, the run-scoped bars (P2, P3, P8) measure only the pool's
top `SCOUT_GATE_POOL_CAP` ASINs by BSR (default 40), because that is the set P3
and P4 actually work through (`verifier-bars.js:41-61,85-98`). With a
selection active the cap is not applied, so `runTotal` is the whole live pool.
P3 then usually passes on its top-20 path rather than on 50% coverage.

The calibration history for each bar is in the comment block at
`verifier-bars.js:172-232`. Two of those notes explain limits you will meet:
Bright Data returns no reviews for about 15–20% of ASINs, and some brands
publish no facts panel at all.

### 1.5 READ-FIRST plan and its modes

Before P1, the runner reads what the keyword **family** already holds and plans
each phase (`inventory.js` + `plan-scope.js`, wired at `run-pipeline.js:680-724`).
The family is every `#N` session, the singular/plural variants and any aliases.
The plan is written to `scout_jobs.plan` (migration 010). It is rebuilt once
after P1 (`utils/apply-plan.js:59-62`). If that rebuild fails, the job
continues with **no** plan: every phase runs. Full detail is in
[`READ-FIRST.md`](READ-FIRST.md).

| Decision | What the runner does in `honor` mode (`utils/apply-plan.js:16-50`) |
|---|---|
| `reuse` / session | Skips the phase (`status: skipped`). Hooks still run: P3b after a skipped P3, P7b after P4, P5b after P5 (`run-pipeline.js:841-855`). |
| `reuse` / family | Runs only the phase's no-cost sync scripts: P2 `migrate-keepa-to-dash.js`; P3 `migrate-reviews-to-dash.js` + `phase3b-review-synthesis.js`; P4 `migrate-ocr-to-dash.js` (`utils/phase-map.js:28-33`). |
| `top-up` | Runs the phase with `SCOUT_REUSE_ASINS`, `SCOUT_RESCRAPE_ASINS`, `SCOUT_REUSE_KEYWORDS` and `SCOUT_REUSE_MAX_AGE_DAYS` set for that phase only. |
| `refresh` / `scrape` | Runs the phase as usual. |

**Mode** (`run-pipeline.js:696-698`):

- `off` — `SCOUT_PLAN_MODE=off`. No inventory is built.
- `advisory` — the plan is printed and stored but every phase runs. This is
  the mode with `--force`, with `--no-reuse`, with `SCOUT_PLAN_MODE=advisory`,
  and **on every hand-scoped run** (`--phases …`, or `--from Pn` with n > 1)
  unless `SCOUT_PLAN_MODE=honor` is set.
- `honor` — the default for an unscoped run from P1.

Dashboard research-scope jobs arrive as `--phases 1,…,8`, so **they run
advisory** unless the job environment sets `SCOUT_PLAN_MODE=honor`. The
operations log does not record whether that variable is set on the Cloud Run
job.

The plan's cost estimate covers AI phases only, from the family's
`ai_usage_log` averages. It leaves out P3b, P5b and P7b (operations log,
2026-09-27). Scrape and Keepa work is counted in ASINs, not dollars
(`plan-scope.js:112-127,254-262`).

### 1.6 Env contract

Secrets are named here, never valued.

| Variable | Read by | Meaning |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_KEY` | all | the project and service-role key (`DOVIVE` client, and `DASH` by fallback) |
| `DASH_URL`, `DASH_KEY` | all | optional; unset today |
| `SCOUT_JOB_ID` | runner, heartbeat, `ai-usage` | the job row; set by `cloud-worker.js` (`:67`) or as an execution override |
| `OPENROUTER_API_KEY` | every AI phase | OpenRouter |
| `KEEPA_API_KEY` | P2 (and P0) | Keepa; falls back to `dovive_scout_config.keepa_api_key` (`keepa-phase2.js:69-80`) |
| `BRIGHTDATA_API_KEY` or `BRIGHTDATA` | P1 fallback, P3 fallback, P5 | Bright Data Datasets API (`bright-data-amazon.js:28-35`) |
| `BRIGHTDATA_BROWSER_WSS` | P1, P5, P5b | Bright Data Scraping Browser over CDP; local Playwright when unset (`utils/bright-data-browser.js`) |
| `BRIGHTDATA_PROXY_SERVER` / `_USER` / `_PASS` | P5 raw-fetch retry | proxy for `launchBrowserAPIOnly` |
| `BRIGHTDATA_SERP_ZONE` / `BRIGHTDATA_ZONE` | P5 | SERP zone, default `serp_api1` (`phase5-deep-research.js:321`) |
| `PERPLEXITY_API_KEY`, `PERPLEXITY_MODEL` (default `sonar-pro`), `PERPLEXITY_SEARCH_PRICE_USD` | P5, P5b | `utils/perplexity.js` |
| `ANALYSIS_MODEL`, `VALIDATION_MODEL` | P3b, P4 fallback, P5, P5b, P7–P13, P7b fallback | model ids; cheap mode overrides both |
| `CHEAP_MODE`, `CHEAP_MODE_MODEL` | runner, P3b, P5b, P7b | test runs |
| `SCOUT_PLAN_MODE` (`honor`/`advisory`/`off`), `SCOUT_PLAN_TIMEOUT_MS` (90000), `SCOUT_KEYWORD_ALIASES`, `SCOUT_FRESHNESS_DAYS`, `SCOUT_FRESH_Pn` | runner, `inventory.js`, `plan-scope.js` | READ-FIRST |
| `SCOUT_REUSE_ASINS`, `SCOUT_RESCRAPE_ASINS`, `SCOUT_REUSE_KEYWORDS`, `SCOUT_REUSE_MAX_AGE_DAYS` | P3 and P4 producers, `migrate-reviews-to-dash.js`, P3b | set per phase by the plan; **do not export them by hand** unless you mean it (`utils/reuse-asins.js:1-25`) |
| `SCOUT_GATE_POOL_CAP` (40) | `verifier-bars.js` | gate cap without a selection |
| `P5_TOP_COUNT` (5), `P5_NEW_COUNT` (3) | P5 and the verifier | the P5 target |
| `SELECTION_*` | `utils/competitor-selection.js:61-78` | selection thresholds |
| `COHORT_*` | `utils/cohort.js:35-47` | established/emerging thresholds |
| `CERT_VERIFY` (off), `CERT_VERIFY_MAX_MS` (90000) | `verify-certifications.js` | registry lookups; the operations log (2026-09-27) says the Cloud Run job now sets `CERT_VERIFY=1` |
| `OPENCLAW_GATEWAY`, `OPENCLAW_TOKEN`, `TELEGRAM_CHAT_ID` | runner | notifications |
| `RND_SUPABASE_URL`, `RND_SUPABASE_ANON_KEY` | `utils/rnd-client.js` (added `c74458a`) | read-only RnD evidence client; not yet read by a phase |

Per-phase knobs are listed in each phase section below.

### 1.7 The 40-competitor selection

P1 builds a **candidate pool**; the competitors are picked after Keepa.

1. **P1** (`human-bsr.js:42-67`) runs up to `P1_MAX_QUERIES` (5) searches from
   `utils/query-variants.js`: the base keyword, "best …", audience splits and
   a sugar-free split. It merges them with reciprocal-rank fusion
   (k = 60) into a pool of `P1_POOL_SIZE` (80) (`utils/serp-pool.js`). The base
   search's top 40 organic results always get a slot. Sponsored placements are
   never candidates. Each ASIN's search provenance is stored in
   `dovive_research.selection_signals` (migration 011).
2. **P2** fetches Keepa for the whole pool. `migrate-keepa-to-dash.js` tags each
   product's cohort, then calls `runCompetitorSelection()`
   (`migrate-keepa-to-dash.js:197-206`, `select-competitors.js`).
3. **The selection itself** is pure code in `utils/competitor-selection.js`
   (steps documented at `:14-53`):
   - repair the rating×10 review-count corruption;
   - fold flavours and pack sizes into one family, by Keepa parent, variation
     lists and a same-brand product-line key;
   - flag reviews shared across variations and promotion-driven sales (a
     promotion takes ×0.75 off the sales score);
   - make ineligible anything sponsored-only, under 50 reviews or under 3.5★;
   - score 50% sales, 30% reviews, 20% rating (log-scaled);
   - cap each brand at 3 families, and take the top `SELECTION_TARGET_COUNT` (40).
4. **Writes** go to `products.selected`, `selection_rank`, `selection_reason`
   (jsonb with a readable `summary`), `promo_flag`, `shared_reviews_with`,
   `parent_asin` and `variations_count`. ASINs that dropped out get
   `selected=false` (`select-competitors.js:183-205`).
5. **Readers** go through `utils/selected-competitors.js`. When the columns are
   missing or no row is selected, the loader returns `{active:false}` and every
   caller keeps "top N by BSR" (`:1-10`).

| Phase | Reads the selection? |
|---|---|
| P3 | yes |
| P4 (text extraction and OCR) | yes |
| P5 | yes |
| P5b | yes |
| P6 | yes; market metrics still use the whole category |
| P7b | yes |
| P9 top-20 | yes |
| P7, P8, P9 new-winners and "all" sets, P10, P11 | no (`FORMULA-INPUTS.md` §2, gap 8) |

Recompute a selection without any Keepa or AI spend:

```bash
node select-competitors.js "<session label>" --dry-run   # print only
```

Dropping `--dry-run` writes `products`, which is a database write. Normal P2
runs do this for you.

---

## 2. Phase by phase

Each section uses the same headings. "Re-run" always means the Cloud Run
pattern in §3.2 unless it says otherwise. Local runs need the paid keys, and
the local `scout/.env` has none for Keepa, Bright Data or Perplexity
(operations log, 2026-09-27).

### P1 — Amazon Scrape

- **Purpose.** Build the session's candidate pool (about 80 listings) with
  detail-page data, and create the session's DASH category and `products` rows.
- **Scripts.** `human-bsr.js <label>` (positional argument), then
  `migrate-p1-to-dash.js <label>`.
- **Inputs.** Keyword label only. Searches Amazon with the label minus `#N`
  (`human-bsr.js:35-37`). Skips ASINs already stored for the same label
  (`getAlreadyScraped`, `human-bsr.js:281-288`). Env: `P1_POOL_SIZE` (80),
  `P1_MAX_QUERIES` (5), `P1_VARIANT_PAGES` (1).
- **External services.**
  - Amazon, three Playwright attempts with stealth and cookies. Over the
    Bright Data Scraping Browser when `BRIGHTDATA_BROWSER_WSS` is set
    (`human-bsr.js:644-666`).
  - Then the Bright Data Datasets fallback (search plus product hydration),
    **only** when a real `BRIGHTDATA_API_KEY` is present (`human-bsr.js:818-862`).
  - No AI.
  - Cost: the code comment estimates about 88 page loads per run (homepage,
    3 base SERP pages, 4 variant pages, 80 detail pages) (`human-bsr.js:59-61`,
    2026-09-26). No Bright Data per-record price is recorded in code or in the
    operations log.
- **Outputs.**
  - `dovive_research`, upserted on `(asin, keyword)`: title, brand, bullets,
    specs, images, rating, `review_count`, `rank_position`, `raw_json`, and
    `selection_signals`. When migration 011 is missing, the write is retried
    without that column.
  - `dovive_keywords` and `dovive_history`.
  - A live per-product sync into `products`, plus a category create
    (`human-bsr.js:84-130`).
  - The migrate step: `categories` (created through `resolveCategory`) and
    `products`, upserted on `(asin, category_id)` (`migrate-p1-to-dash.js:177-251`).
  - `products.bsr_current` is written **only** by P1 (`human-bsr.js:125`,
    `migrate-p1-to-dash.js:221`).
- **Gate.** P1 migration bar: live ≥ 60% of the scraped pool.
- **Skip/reuse.** Never family-reused (`utils/phase-map.js:26`). The plan can
  skip P1 only as a session reuse (plan freshness P1 = 14 days).
- **Known limits.**
  - Amazon bot-walls Cloud Run's datacenter IPs. Failure artifacts are logged
    (`human-bsr.js:184-230`).
  - Whether `BRIGHTDATA_BROWSER_WSS` is set on the Cloud Run job is not
    recorded. The 2026-08-28 log entry says the Scraping Browser zone still had
    to be created.
  - Legacy Bright Data rows had `is_sponsored` true on every row; this was
    fixed on 2026-09-26 and is read around in `select-competitors.js:44-55`.
  - `migrate-p1-to-dash.js` ends with `run().catch(console.error)`, so it
    **exits 0 on failure**. A failed migrate step shows up only in the P1 bar.
- **Re-run.** from_phase 1. A same-label P1 re-run only scrapes ASINs it does
  not already have.

### P2 — Keepa Enrichment (+ cohort + competitor selection)

- **Purpose.** Sales, BSR history, price, variations and promotions per ASIN.
  Then cohort tags and the 40-competitor selection.
- **Scripts.** `keepa-phase2.js <label>`, then `migrate-keepa-to-dash.js <label>`,
  which runs `select-competitors.js` in-process.
- **Inputs.** Every `dovive_research` ASIN for the label (`keepa-phase2.js:85-91`).
  Needs `KEEPA_API_KEY`.
- **External services.**
  - Keepa `/product` with `stats=180&history=1&offers=20&buybox=1`, in batches of
    up to 100 ASINs with 2–3 s between batches (`keepa-phase2.js:93-100,347-400`).
  - The script logs Keepa's `tokensLeft`. No per-ASIN token cost is recorded in
    code; the only note is that `offers=20` is "the expensive part" and that the
    80-listing pool roughly doubled token use (`human-bsr.js:61-62`, 2026-09-26).
  - No AI.
- **Outputs.**
  - `dovive_keepa`, upserted on `asin`: parsed fields, `raw_json`, and the
    migration-011 columns `parent_asin`, `variation_asins`,
    `review_count_history_90d`, `price_avg_90d`, `coupon`, `coupon_active`,
    `lightning_deal_active` and `sns_discount_pct`.
  - `dovive_research` for `(asin, keyword)`: title, brand, price, bsr, images,
    rating (`keepa-phase2.js:270-285`).
  - `dovive_keywords.last_keepa_run`.
  - The migrate step: `products.monthly_sales`, `monthly_revenue`,
    `bsr_30_days_avg`, `bsr_90_days_avg`, `cohort`, `parent_asin`,
    `variations_count`, `price_90_days_avg` and `historical_data`
    (`migrate-keepa-to-dash.js:155-179`), then the selection columns (§1.7).
- **Gate.** P2: `monthly_sales` on ≥ 90% of run ASINs.
- **Skip/reuse.**
  - Plan freshness is 7 days.
  - A family reuse runs `migrate-keepa-to-dash.js` only. `dovive_keepa` is keyed
    by ASIN, so a sibling's fresh rows land for free.
  - A `top-up` re-fetches the whole session: Keepa has no subset flag
    (`plan-scope.js:115-116`).
- **Known limits.**
  - Before 2026-09-26, `review_count` was read from `stats.current[16]` (the
    rating ×10). The real count is `[17]`. The corrupted counts are detected and
    ignored at read time; a repair UPDATE sits commented out in migration 011.
  - `migrate-keepa-to-dash.js` exits 0 on failure (`run().catch(console.error)`).
    Called with no keyword it now stops with a usage line; before 2026-09-29 it
    defaulted to `'ashwagandha gummies'`.
  - P2 does **not** update `products.bsr_current` (see P1).
- **Re-run.** from_phase 2. The migrate step and the selection alone are free:
  `node migrate-keepa-to-dash.js "<label>"` (a database write).

### P3 — Reviews (+ P3b review synthesis)

- **Purpose.** Collect customer reviews, build `products.review_analysis`, and
  (P3b) count themes over every review.
- **Scripts.** `playwright-reviews.js <label>`, `migrate-reviews-to-dash.js <label>`,
  `phase3b-review-synthesis.js --keyword <label> [--force]`.
- **Inputs.** The label's `dovive_research` ASINs:
  - ordered by the selection when it is active, else by DASH `bsr_current`
    (`playwright-reviews.js:64-122`);
  - minus ASINs that already have reviews for this label and minus
    `SCOUT_REUSE_ASINS`, plus `SCOUT_RESCRAPE_ASINS`;
  - capped at `REVIEWS_MAX_ASINS` (30), with `REVIEWS_MAX_PAGES` (3) per ASIN
    (`:44-45,333-345`).
- **External services.**
  - Amazon `/product-reviews/` pages through local Playwright. **It gets 0
    reviews from Cloud Run, because Amazon blocks it** (operations log,
    2026-09-27).
  - Every zero-review ASIN falls back to the Bright Data Reviews dataset
    (`gd_le8e811kzy4ggddlq`) via async `/trigger`, 20 ASINs per call
    (`playwright-reviews.js:270-330`).
  - A "still running" snapshot is **resumed, not re-triggered**. Up to
    `BRIGHTDATA_REVIEWS_ATTEMPTS` (3) attempts, each waiting
    `BRIGHTDATA_REVIEWS_DEADLINE_MS` (420000). Before this fix (2026-09-27),
    retries re-triggered paid snapshots and could end with 0 reviews for a
    whole category.
  - No Bright Data price is recorded.
  - Observed volume (operations log, 2026-09-27): magnesium 1,000 reviews across
    26 of 30 ASINs; creatine 1,128; electrolyte 1,524 own reviews after a top-up.
- **Outputs.**
  - `dovive_reviews` (plain POST, append-only).
  - `products.review_analysis` and `review_analysis_updated_at`. Duplicates are
    removed by Amazon review id before counting; the result carries a
    `review_evidence` block when P3b has run (`migrate-reviews-to-dash.js:1-33,245-270`).
- **Gate.** P3: 50% coverage, **or** top-20 ≥ `top20Need` with ≥ 200 of this
  label's own raw review rows.
- **Skip/reuse.**
  - Plan freshness is 30 days.
  - A family reuse runs the migrate step plus P3b. `migrate-reviews-to-dash.js`
    reads the freshest sibling session in `SCOUT_REUSE_KEYWORDS` for ASINs with
    no reviews here. Nothing is copied.
  - A skipped P3 still runs P3b (`run-pipeline.js:841-844`).
- **Known limits.**
  - **The collector still appends duplicate reviews.** `dovive_reviews` has no
    unique key (`migrations/004_consolidated_cloud.sql:161-175`). About 44–58% of
    rows are duplicates (operations log, 2026-09-26). The synthesis and the
    migrate step de-duplicate; the open fix is a unique `(keyword, review_id)`
    plus an upsert.
  - Bright Data returns nothing for about 15–20% of ASINs (`verifier-bars.js:193-209`).
  - `--force` clears `products.review_analysis` only (`run-pipeline.js:223-225`).
    Raw reviews stay.
- **Re-run.** from_phase 3. To re-scrape reviews without re-running later
  phases, set the job row's `only_phases` to `'3'` (§3.2). The operations log
  (2026-09-27) used exactly that for an electrolyte top-up.

#### P3b — review synthesis (`phase3b-review-synthesis.js`)

- **Purpose.** Evidence-counted themes (complaints, unmet needs, praise), each
  with review ids, distinct-product counts, a verified share, excerpts and
  counter-evidence. Plus a coverage ledger and a deterministic breakdown by
  issue domain (header `:1-67`).
- **Output.** `dovive_review_synthesis` (migration 012): one `category` row and
  one `product` row per ASIN, upserted on `(keyword, scope, asin_key)`. Also a
  `review_evidence` block merged into `products.review_analysis`. P6, P7 and P9
  prefer it over their old samples when it is fresher than the latest scrape.
- **Model and knobs.**
  - Model: `REVIEW_SYNTHESIS_MODEL`, else `ANALYSIS_MODEL`, else
    `CHEAP_MODE_MODEL` under `CHEAP_MODE`, else Sonnet 5.
  - `REVIEW_SYNTHESIS_BATCH`: 60 reviews per call.
  - `REVIEW_SYNTHESIS_MAX_TOKENS`: 16000.
  - Reasoning is off unless `REVIEW_SYNTHESIS_REASONING=1`.
  - `REVIEW_SYNTHESIS_MIN_SPLIT`: 20.
  - `REVIEW_SYNTHESIS_MAX_REVIEWS`: 12000.
- **Cost.**
  - Header estimate: about $0.47 (magnesium, 1,080 unique reviews) to $1.59
    (hydration powder, 3,760) on Sonnet.
  - Measured local re-runs on 2026-09-27: magnesium 1,460/1,466 reviews themed
    for $1.10; creatine 1,435/1,445 for $1.17.
- **Behaviour.**
  - Resumes per batch.
  - Pre-flight: stops at $0 when migration 012 is missing.
  - Always exits 0.
  - `--dry-run` and `--no-model` spend nothing.
- **Known failure (fixed 2026-09-27, `ce15ce8`).** Sonnet answered 100-review
  batches at exactly the 12,000-token cap, and the identical resend failed the
  same way: magnesium got 360 of 1,466 reviews themed, about $4 wasted. A
  truncated or unparseable batch now **splits** in half instead of being resent.
  Electrolyte needed `REVIEW_SYNTHESIS_MIN_SPLIT=10` to finish (2,080/2,099).
- **Re-run alone.** `node phase3b-review-synthesis.js --keyword "<label>" --force`.
  It needs `OPENROUTER_API_KEY` locally, and the operations log shows it was run
  locally on 2026-09-27. Start with `--dry-run`.

### P4 — OCR / Formula Extraction (+ label verification, + P7b)

- **Purpose.** Supplement facts per competitor from listing text and from the
  facts-panel image, resolved per field onto `products`. Certifications are
  checked against registries.
- **Scripts.**
  - `phase4-text-extract.js --keyword <label>`: bullet points → facts,
    `image_index = 99`.
  - `ocr-phase4.js <label>`: vision over up to `OCR_MAX_IMAGES` (5) gallery
    images of the top `OCR_TOP_N` (20) selected (or BSR) products, stopping at
    the first panel that matches this product (`ocr-phase4.js:1-41`).
  - `migrate-ocr-to-dash.js <label>`, which runs `verify-certifications.js`
    in-process.
- **Inputs.** `dovive_research.bullet_points` and `images` for the label. The
  selection (when active), `SCOUT_REUSE_ASINS` and `SCOUT_RESCRAPE_ASINS`.
  ASINs already processed for this label are skipped
  (`phase4-text-extract.js:212-242`).
- **External services.**
  - OpenRouter. Model `P4_MODEL` / `OCR_MODEL`, else `ANALYSIS_MODEL`, else
    `~google/gemini-flash-latest`. The leading `~` is required: the bare alias
    has returned 400 since 2026-09-15 (`phase4-text-extract.js:56`,
    `ocr-phase4.js:81`).
  - `P4_MAX_TOKENS` and `OCR_MAX_TOKENS`: 16000.
  - Registry GETs (NSF) only with `CERT_VERIFY=1`, which is free.
  - Measured (operations log, 2026-09-01, hydration powder, pre-selection):
    197 Flash calls, $0.8984.
- **Outputs.**
  - `dovive_ocr`: `supplement_facts`, `other_ingredients`, claims,
    certifications; `facts_v2` and `label_product_match` with migration 013.
  - The migrate step: `products.all_nutrients`, `nutrients_count`,
    `ocr_confidence`, `serving_size`, `servings_per_container`,
    `claims_on_label`; with migration 013 also `label_facts`, `label_sources`,
    `label_conflicts`, `label_product_match`, `claims_all_sources`
    (`migrate-ocr-to-dash.js:1-26`).
  - `products.certifications_verified` (`verify-certifications.js:1-25`).
- **Gate.** P4: ≥ 80% of the whole category, or top-20 ≥ `top20Need`. With an
  80-product pool and 20 OCR'd products, the top-20 path is the one that passes.
- **Skip/reuse.**
  - Plan freshness is 90 days.
  - A family reuse runs `migrate-ocr-to-dash.js` only. `dovive_ocr` is keyed by
    ASIN.
  - P7b still runs after a skipped or sync-only P4.
- **Known limits.**
  - Some brands (Goli, LMNT-style sticks) publish no facts in text or images.
    That is why the top-20 bar is 15, not 20 (`verifier-bars.js:213-223`).
  - Retry decisions key off whether the JSON parses, not off its length. This
    was fixed on 2026-09-01: compact valid JSON had been treated as truncated
    (`DEPLOY_NOTES.md`, 2026-09-01 entry).
  - The cloud migrate step re-runs `verify-certifications.js` and overwrites
    statuses with whatever `CERT_VERIFY` the job has. That is why the job now
    sets `CERT_VERIFY=1` (operations log, 2026-09-27).
  - `--force` **deletes** `dovive_ocr` rows for the label before re-running
    (`run-pipeline.js:226-231`).
  - Exit codes (2026-09-29, `utils/script-exit.js`): `phase4-text-extract.js`
    exits 1 when it fails as a whole or every product fails, so P4 retries and
    stops on it (it is the first script in the chain; nothing paid runs before
    it). `migrate-ocr-to-dash.js` still exits 0 on failure on purpose: it runs
    after the paid vision OCR, and a non-zero exit would re-run that OCR. It
    prints a `SYNC FAILED — migrate-ocr-to-dash.js: …` line instead, and the P4
    bar reports the missing data.
    All three stop with a usage line when called without a keyword (before
    2026-09-29 they defaulted to `'ashwagandha gummies'`).
- **Re-run.** from_phase 4. The label-v2 parse of already-stored OCR rows is
  free: `node backfill-facts-v2.js …` then `node migrate-ocr-to-dash.js --keyword "<label>"`
  (operations log, 2026-09-27). Both write to the database.

#### P7b — marketing assets (`phase7b-marketing-assets.js`), hooked after P4

- **Purpose.** A vision read of each competitor's gallery, A+ modules and
  brand-story images. The claimed benefits are then checked against the P3b
  review themes ("experienced vs claimed"). Videos are inventoried, never
  analysed (header `:1-83`).
- **Scope.** The selection, else the top `P7B_TOP_BSR` (20); capped at
  `P7B_MAX_PRODUCTS` (40).
- **Model and knobs.**
  - Model: `P7B_MODEL`, else `ANALYSIS_MODEL`, else `CHEAP_MODE_MODEL`, else
    `~google/gemini-flash-latest`.
  - **Pin `P7B_MODEL`** if the job sets `ANALYSIS_MODEL`. P7b inherits it, and
    it must be a vision-capable model.
  - `P7B_MAX_IMAGES_PER_PRODUCT`: 8.
  - `P7B_MAX_APLUS_IMAGES`: 2.
  - `P7B_MAX_TOKENS`: 16000.
  - `P7B_MODEL_TIMEOUT_MS`: 120000.
- **Output.** `dovive_marketing_assets` (migration 015), upserted per product as
  each completes plus a category row. A pointer is written to
  `products.marketing_asset_analysis`.
- **Cost.**
  - Header estimate: about $0.60 per keyword on Flash, $5.40 worst case.
  - Measured: about $0.90 per category, 40/40 products, about 300 images
    (operations log, 2026-09-27).
- **Behaviour.**
  - Resumes per product. An unchanged gallery is never re-paid.
  - Two failed attempts park a product until its gallery changes.
  - Pre-flight: stops at $0 when migration 015 is missing.
  - Always exits 0.
  - `--dry-run` and `--plan` spend nothing.

### P5 — Deep Research (+ P5b web research)

- **Purpose.** Grounded research briefs on 5 top established and 3
  emerging competitors, using stored Amazon data plus off-Amazon sources
  (header `:1-57`).
- **Script.** `phase5-deep-research.js --keyword <label> [--force]`.
  `--pool top10|newbrands` exists for manual runs.
- **Inputs.** Listed in `FORMULA-INPUTS.md` §2 (P5): `products` (selection,
  cohort), `dovive_research`, `dovive_ocr` (mismatched labels dropped),
  `dovive_reviews`, `dovive_keepa`.
- **External services.**
  - Perplexity Sonar (`PERPLEXITY_MODEL`, default `sonar-pro`) for off-Amazon
    discovery (`utils/perplexity.js`).
  - The Bright Data SERP zone or browser for raw fetches, with DuckDuckGo as the
    legacy fallback.
  - OpenRouter model `P5_MODEL`, else `ANALYSIS_MODEL`, else Sonnet 5.
    `P5_FAST_MODEL` and `P5_REASONING_MODEL` are legacy per-tier overrides.
  - `P5_CONCURRENCY`: 2.
  - Measured (operations log, 2026-09-01): 7 Sonnet calls, $0.3447.
- **Outputs.** `dovive_phase5_research` (upsert `(asin, keyword)`),
  `dovive_p5_sources`, `products.marketing_analysis.p5_research`. Columns are in
  `FORMULA-INPUTS.md`.
- **Gate.** The P5 content bar. The **mid-run gate before P5** checks P1–P4
  first.
- **Skip/reuse.**
  - The script skips `(asin, pool)` pairs it has already done for this label.
  - No family reuse (keyed by keyword; the TODO join is in `READ-FIRST.md`).
  - P5b runs after P5 whether P5 ran or was skipped.
- **Known limits.**
  - With `max_tokens` large and several calls in flight, OpenRouter credit
    reservations can hit 402; that is why concurrency is 2 (`:87-91`).
  - `--force` deletes the label's `dovive_phase5_research` rows
    (`run-pipeline.js:232-241`).
  - Local runs lack Perplexity and Bright Data keys.
- **Re-run.** from_phase 5. Resume P5b alone by setting `only_phases='5'`: P5
  skips finished products and the P5b hook resumes per page (operations log,
  2026-09-27).

#### P5b — category web research (`phase5b-web-research.js`), hooked after P5

- **Purpose.**
  - Up to `P5B_MAX_QUERIES` (12) Perplexity searches over the keyword and the
    selected brands.
  - Fetch up to `P5B_MAX_PAGES` (20) pages. Plain HTTP first; the browser only
    for network errors or JavaScript-only shells, at most
    `P5B_MAX_BROWSER_PAGES` (5), and never past a 403 or a bot wall.
  - Classify each page's type and **ownership**, and de-duplicate syndicated
    copies.
  - Extract quoted claims. Items whose quote is not in the page are dropped.
  - Count every claim by distinct website (header `:1-71`).
- **Output.** `dovive_web_research` (migration 014), one row per label. P7 and
  P9 prefer it when it exists.
- **Cost.**
  - Perplexity search costs $5 per 1,000 requests.
  - Header estimate: typical $0.43, maximum $0.92 on Sonnet (operations log,
    2026-09-27).
  - Measured: creatine 15/15 pages for $0.26, magnesium 13/13 for $0.15
    (2026-09-27).
- **Knobs.**
  - `P5B_MODEL`
  - `P5B_BATCH`: 4
  - `P5B_MAX_TOKENS`: 12000
  - Reasoning is off unless `P5B_REASONING=1`
  - `P5B_FRESH_DAYS`: 30
  - `P5B_RETRY_AFTER_DAYS`: 7
  - `P5B_VERIFY=1` turns on the PubMed and NSF checks
- **Known failure (fixed 2026-09-27, `3d284fe`).** On OpenRouter, Sonnet 5's
  **reasoning tokens count inside `max_tokens`**. Every 4-page extraction at
  6,000 tokens truncated, wasting $0.58. Reasoning is now off, the cap is higher,
  and a truncated multi-page batch splits into one call per page.
- **Behaviour.** Resumes per item. Pre-flight: stops at $0 when migration 014 is
  missing. Always exits 0. `--dry-run` and `--no-model` exist. It needs
  `PERPLEXITY_API_KEY`, so in practice it runs on Cloud Run only.

### P6 — Product Intelligence

- **Purpose.** Per-product AI scoring: extract type, dose, certifications,
  bonus ingredients, formula score, threat level, strengths and weaknesses. It
  is merged with locally computed market metrics such as velocity, price tier
  and revenue per review (header `:1-20`).
- **Script.** `phase6-product-intelligence.js --keyword <label> [--force]`.
  `--top N` and `--batch N` (default 5) exist for manual runs.
- **Inputs.** See `FORMULA-INPUTS.md` §2 (P6). The P3b product rows are
  preferred over a 5 + 5 review slice.
- **External services.** OpenRouter, model `P6_MODEL` (default
  `google/gemini-3.7-flash`, deliberately not `ANALYSIS_MODEL`,
  `:106-116`). Measured (operations log, 2026-09-01): 28 Flash calls, $0.5041
  for 140 products.
- **Outputs.** `products.marketing_analysis.product_intelligence` (merged into
  the existing jsonb).
- **Gate.** P6 ≥ 90% of the selection, or of the whole category without one.
- **Skip/reuse.** Skips products that already have
  `product_intelligence.analyzed_at` (`:562-567`). `--force` clears only the
  `product_intelligence` key (`run-pipeline.js:242-251`). No family reuse.
- **Known limits.**
  - Flash is measurably weaker than Sonnet at strict claim and certification
    extraction. It inferred "vegan" from missing ingredients and missed
    certifications (operations log, 2026-09-01).
  - The schema carries ashwagandha-specific keys that are null elsewhere
    (`FORMULA-INPUTS.md`, gap 7).
- **Re-run.** from_phase 6.

### P7 — Market Intelligence

- **Purpose.** One category-level market report: landscape, formula patterns,
  pricing, velocity leaders, pain points, gaps.
- **Script.** `phase6-market-analysis.js --keyword <label> [--force]`. It also
  runs a second time inside P10, always with `--force`.
- **Inputs.** See `FORMULA-INPUTS.md` §2 (P7): the whole category (not
  selection-scoped), the P3b category row, P5b and P7b.
- **External services.** One OpenRouter call, `ANALYSIS_MODEL` (Sonnet 5).
  Measured: $0.154 (2026-09-15), $0.2487 (2026-09-01), $0.252 (2026-09-02).
- **Outputs.** `formula_briefs.ingredients.market_intelligence`. It patches the
  existing row or inserts a row holding only that key. A research-scope run
  therefore leaves a `formula_briefs` row behind even though P9 never ran.
- **Gate.** P7 key present.
- **Skip/reuse.** Skips when the report already exists, unless `--force`.
- **Known limits.** Several empty reads listed in `FORMULA-INPUTS.md` §2 were
  fixed on 2026-09-29 (see §4). The Windows vault write is a no-op; on macOS it
  creates git-ignored files literally named `C:\SirPercival-Vault\…` inside
  `scout/`.
- **Re-run.** from_phase 7.

### P8 — Packaging Intelligence

- **Purpose.** A rule-based (keyword-matching) read of claims, badges, inferred
  colour signals and market gaps, plus a Dovive packaging recommendation. **No
  model call.**
- **Script.** `phase7-packaging-intelligence.js --keyword <label>`. `--top N`
  exists; there is no `--force` handling.
- **Inputs.** `products` of the whole category (not selection-scoped).
- **Outputs.** `products.marketing_analysis.packaging_intelligence`, and
  `dovive_packaging_intelligence` upserted on `keyword`.
- **Gate.** P8 ≥ 90% of run ASINs.
- **Skip/reuse.** None. It re-analyses every run. `--force` strips only the
  `packaging_intelligence` key first (`run-pipeline.js:254-263`).
- **Known limits.**
  - The category summary hard-codes `keyword: 'ashwagandha gummies'` and a
    KSM-66 headline (`FORMULA-INPUTS.md`, gap 7).
  - Exits 1 on failure, including when no product write lands (2026-09-29).
    It is the whole phase and makes no model call, so the runner's retry is
    free.
- **Re-run.** from_phase 8. It costs nothing.

### P9 — Formula Brief

- **Purpose.** Two independent drafts of the CMO-ready formula brief (Draft A
  on `VALIDATION_MODEL`, Draft B on `ANALYSIS_MODEL`). Since 2026-09-03 they
  carry three complete formulas (Proven / Edge / Recommended Blend)
  (`DEPLOY_NOTES.md`, 2026-09-03).
- **Script.** `phase8-formula-brief.js --keyword <label> [--force] [--ai]`.
  `--ai` is forwarded by the runner (`run-pipeline.js:604`) but **the script
  never reads it**; AI is always on.
- **Inputs.** See `FORMULA-INPUTS.md` §2 (P9).
- **External services.** OpenRouter, Sonnet 5 for both drafts by default.
  `XAI_API_KEY` is a legacy leftover and is not needed.
  - Measured: P9 $0.845 (2026-09-02).
  - A 2026-09-01/02 incident burned $2.16 on P9–P13 over broken P1–P8 data,
    which is why the gate before P9 exists (`run-pipeline.js:655-674`).
  - Pre-run estimate for the tri-formula P9–P13 chain: $5–8 (`DEPLOY_NOTES.md`,
    2026-09-03).
- **Outputs.** **Deletes and re-inserts** the category's `formula_briefs` row.
  It preserves `market_intelligence`, `competitive_benchmarking`,
  `fda_compliance` and `final_signoff`. Bumps `categories.updated_at`.
- **Gate.** The **mid-run gate before P9** checks P1–P8. Then the P9 key.
- **Skip/reuse.** Skips when `ai_generated_brief` exists, unless `--force`.
  `--force` first strips everything except `market_intelligence`
  (`run-pipeline.js:264-278`).
- **Known limits.** Long outputs are stitched from up to 5 continuation segments
  (`DEPLOY_NOTES.md`, 2026-09-03). The P5 read ignored a phantom column and
  silently returned no rows until 2026-09-01 (operations log).
- **Re-run.** from_phase 9, which is what the dashboard's "Generate formula
  brief" does.

### P10 — Formula QA (+ P7 refresh, + dead seed step)

- **Purpose.** QA adjudication of the two drafts into three QA-corrected
  formulas with dose analysis, a manufacturability check and a comparative
  verdict. Uses `formula-validator.js` for the gummy hard limits.
- **Scripts.**
  1. `phase9-formula-qa.js --keyword <label> [--force]`
  2. `phase6-market-analysis.js --keyword <label> --force`, which always spends
     one P7 call
  3. `seed-category-analysis.js <label>`. **This is a dead stub.** It defines a
     hard-coded ashwagandha demo record and never writes it. It also reads
     `--keyword`, not the positional argument the runner passes (operations log,
     2026-09-15; `seed-category-analysis.js:10,20`).
- **External services.** OpenRouter, `VALIDATION_MODEL` (adjudicator) and
  `ANALYSIS_MODEL`. Measured: $0.525 (2026-09-02).
- **Outputs.** `formula_briefs.ingredients.qa_report`, `adjusted_formula`,
  `final_formula_brief`, `formula_variants`, `comparative_verdict` and more,
  plus `products.marketing_analysis.qa_comparison_note` (`FORMULA-INPUTS.md` §2).
- **Gate.** P10: `qa_report` present. `checkPhaseStatus` has no P10 case.
- **Skip/reuse.** Skips when `qa_report` exists, unless `--force`
  (`phase9-formula-qa.js:1158`).
- **Known limits.** Truncation through reasoning tokens bit this phase on
  2026-08-28 (operations log). The top-40-by-BSR competitor set is not
  selection-scoped.
- **Re-run.** from_phase 10.

### P11 — Competitive Formula Benchmarking

- **Purpose.** Compare our formula ingredient by ingredient against every
  competitor that has extracted facts. Sonnet drafts; `VALIDATION_MODEL`
  critiques.
- **Script.** `phase10-competitive-benchmarking.js --keyword <label> [--force]`.
- **External services.** OpenRouter, streaming, reasoning off, 2 continuation
  segments. Measured: $0.337 (2026-09-15), $0.255 (2026-09-02).
- **Outputs.** `formula_briefs.ingredients.competitive_benchmarking`.
- **Gate.** The draft **and** the validation are real text. An `[ERROR: …]`
  placeholder fails.
- **Skip/reuse.** Skips when real content exists (`:539-550`), unless
  `--force`, which strips the key first.
- **Re-run.** from_phase 11.

### P12 — FDA Compliance

- **Purpose.** DSHEA/FDA compliance of the formula and claims, grounded in NIH
  ODS fact sheets fetched at runtime. Any dose limit that cannot be tied to a
  fetched URL is flagged `training_data_unverified`.
- **Script.** `phase11-fda-compliance.js --keyword <label> [--force]`.
- **External services.** NIH ODS pages from a hard-coded ingredient-to-URL map,
  plus OpenRouter (primary `ANALYSIS_MODEL`, validation `VALIDATION_MODEL`).
  Measured: $0.234 (2026-09-15), $0.476 (2026-09-02).
- **Outputs.** `formula_briefs.ingredients.fda_compliance`.
- **Gate.** The analysis **and** the validation are real text.
- **Skip/reuse.** Skips when real content exists, unless `--force`.
- **Known limits.** 0 NIH matches for herbal actives such as ashwagandha is
  expected: ODS has no fact sheet for them (operations log, 2026-09-15).
- **Re-run.** from_phase 12.

### P13 — Final Sign-off

- **Purpose.** Chief-formulator sign-off. Applies P12's required corrections
  and issues APPROVED / APPROVED WITH CORRECTIONS / REJECTED, per formula when
  `formula_variants` exists.
- **Script.** `phase12-final-signoff.js --keyword <label> [--force]`.
- **External services.** OpenRouter, `VALIDATION_MODEL` (Sonnet 5 by default,
  despite the "Opus" wording). Measured: $0.109 (2026-09-15), $0.100 (2026-09-02).
- **Outputs.** `formula_briefs.ingredients.final_signoff`.
- **Gate.** `opus_review` is real text.
- **Skip/reuse.** Skips when it exists, unless `--force`.
- **Re-run.** from_phase 13.

### Whole-run spend observed

From the operations log:

| Date | Run | OpenRouter spend | Note |
|---|---|---|---|
| 2026-09-01 | hydration powder #2, research scope | $1.996 | 233 calls |
| 2026-09-27 | creatine gummies #2, P1–P13 | $4.23 | pre-migration |
| 2026-09-27 | magnesium gummies #2, P1–P13 | $4.37 | pre-migration |
| 2026-09-27 | electrolyte powder #6, P1–P13 | $3.96 | pre-migration |
| 2026-09-27 | the same three, full v2 schema, cumulative | $13.48 / $13.81 / $12.74 | re-runs included |

Keepa, Bright Data and Perplexity spend is **not** in `ai_usage_log`. The only
exception is P5b's Perplexity searches, which are logged as phase `P5b`.

---

## 3. Operations appendix

### 3.1 Submitting a job

```bash
cd scout
node submit-job.js "magnesium gummies"            # research scope, P1–P8, new "#N" label
node submit-job.js "magnesium gummies" --full     # all 13 phases
node submit-job.js "magnesium gummies" --cheap    # all-Flash test run, is_test
```

- `submit-job.js` inserts the row, then invokes the `trigger-scout-job` edge
  function with `{scout_job_id}`. If the trigger call fails, the row stays
  `queued`.
- When the trigger call fails, the message prints the Cloud Run execute
  command from §3.2 with the new job id filled in (and `node drain-queue.js`
  as the alternative). Before 2026-09-29 it suggested `node submit-job.js
  trigger`, a mode that does not exist: that command queues a job for the
  keyword "trigger".

### 3.2 Re-running a job or a phase

```bash
node requeue-job.js <job-id> <from_phase>            # status→queued, from_phase set, force=false, only_phases=NULL
gcloud run jobs execute dovive-scout --region=us-central1 --project=noodle-worker \
  --update-env-vars SCOUT_JOB_ID=<job-id> --async     # the override applies to this execution only
```

This pattern is recorded in the operations log (2026-09-27). The script prints
the row as stored (id, keyword, from_phase, only_phases, force).

- **`force` is off unless the third argument is the word `true`**
  (`node requeue-job.js <job-id> <from_phase> true`); anything other than
  `true`/`false` is refused. Until 2026-09-29 it defaulted to **true**. Force
  runs `clearPhaseData`, which **deletes** `dovive_ocr` rows (P4) and
  `dovive_phase5_research` rows (P5) for the label, and strips the phase keys
  from `products` and `formula_briefs` (`run-pipeline.js:218-314`). It also
  makes the READ-FIRST plan advisory. With `true`, the script prints the clears
  the run will reach before it writes the row.
- **`only_phases` is reset to NULL**, so the run goes from `from_phase` to P13.
  Before 2026-09-29 it was left alone: a research-scope row
  (`only_phases = '1,…,8'`) requeued `from 9` ran **no** phase, and the final
  verifier, checking only P1–P8, could mark the job `complete` with nothing
  done. Pass `--keep-scope` to keep the row's `only_phases`; the script warns
  when that scope has no phase at or after `from_phase`.
  - For a single phase, set the row's `only_phases` (for example `'3'`) through
    the SQL editor or the dashboard, then requeue with `--keep-scope`. It is a
    database write.
- `--from Pn` and `--phases` combine: the runner runs `phasesToRun` minus the
  phases before `from` (`run-pipeline.js:746,787-790`).
- Hand-scoped runs are READ-FIRST **advisory** unless `SCOUT_PLAN_MODE=honor`
  (§1.5).
- The dashboard's "Rerun from here" inserts a `from_phase` continuation on the
  session's exact keyword (`src/hooks/useScoutJobs.ts:268-330`).

### 3.3 Watching a run

- **`scout_jobs`:**
  - `status`: `queued` → `claimed` → `running` → `complete` or `error`
  - `current_phase` and `current_phase_name`
  - `phase_progress`
  - `plan`
  - `error`
  - `total_cost_usd`
- **When a phase fails, `scout_jobs.error` leads with the phase's own error**,
  followed by the final verifier's failures:
  `P5 Deep Research: <msg> | verifier: <failures>` (`utils/job-error.js`). The
  loop still breaks and the verifier still runs. Before 2026-09-29 the
  verifier's `Verifier FAIL: …` write overwrote the phase error. A run with no
  phase failure still writes `Verifier FAIL: …`.
- **Cloud Run:**

  ```bash
  gcloud run jobs executions list --job=dovive-scout --region=us-central1 --project=noodle-worker
  gcloud logging read 'resource.type="cloud_run_job" AND resource.labels.job_name="dovive-scout"' \
    --project=noodle-worker --limit=50 --order=desc --format="value(textPayload)"
  ```

  The second command comes from `DEPLOY_NOTES.md`. Add a filter on
  `labels."run.googleapis.com/execution_name"` to follow one execution.
- **Cost:** one `ai_usage_log` row per AI call, with `scout_job_id`,
  `category_id`, `keyword`, `phase`, `model`, token counts and `cost_usd`
  (migration 007). The cost is OpenRouter's own `usage.cost` when present,
  otherwise the local `PRICING` map (`utils/ai-usage.js:46-68`). It is rolled up
  per job into `scout_jobs.total_*`.

### 3.4 Building and deploying the worker image

```bash
cd scout
gcloud builds submit --tag us-central1-docker.pkg.dev/noodle-worker/dovive-scout/worker:latest \
  --project noodle-worker --region us-central1 --timeout=1200s
gcloud run jobs update dovive-scout \
  --image us-central1-docker.pkg.dev/noodle-worker/dovive-scout/worker:latest \
  --region us-central1 --project noodle-worker
```

These commands come from `DEPLOY_NOTES.md`, section "1. Build + push the
image".

- **Image.** The base image is `mcr.microsoft.com/playwright:v1.58.2-jammy`, and
  the `CMD` is `node cloud-worker.js` (`Dockerfile`).
- **Job size.** Created at 4 GiB / 2 vCPU with `max-retries 1`. The task timeout
  was later confirmed at 10800 s (`DEPLOY_NOTES.md`).
- **Secrets.** Keys are Secret Manager references on the job: for example
  `KEEPA_API_KEY=scout-keepa-key:latest` and
  `BRIGHTDATA_API_KEY=scout-brightdata-key:latest`. Change them with
  `gcloud run jobs update --update-secrets` and never print them.

### 3.5 Standing rules

- **Never run a phase script locally without a no-spend flag.** The flags that
  exist:
  - `--dry-run`: P3b, P5b, P7b, `select-competitors.js`, `verify-certifications.js`
  - `--no-model`: P3b, P5b, P7b
  - `--plan`: P7b
  - `inventory.js` only reads

  P1, P2, P4 and P5–P13 have **no dry-run**. `--test` and `--limit` still spend.
  `run-pipeline.js` has no dry-run either.
- **Migrations are additive** (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT
  EXISTS`), and every reader tolerates a missing migration. Migrations 010–015
  were applied on 2026-09-27 with `npx supabase db query --linked -f <bundle>`
  (operations log). Apply new ones deliberately; the pipeline never applies them.
- **The review collector still appends duplicates** (P3). Count reviews by
  review id, not by row.
- **A missing keyword.** `migrate-reviews-to-dash.js`, `migrate-ocr-to-dash.js`,
  `migrate-keepa-to-dash.js`, `phase4-text-extract.js`, `ocr-phase4.js` and
  `phase7-packaging-intelligence.js` (P8) stop with a usage line
  (`utils/keyword-arg.js`, 2026-09-29). These still default to
  `'ashwagandha gummies'`: `phase5-deep-research.js`,
  `phase6-product-intelligence.js`, `phase6-market-analysis.js`,
  `phase8-formula-brief.js`, `phase9-formula-qa.js`,
  `phase10-competitive-benchmarking.js`, `phase11-fda-compliance.js`,
  `phase12-final-signoff.js` and `seed-category-analysis.js`. Always pass the
  full session label.
- **Exit codes on a script's own failure** (`utils/script-exit.js`). The runner
  re-runs a phase's WHOLE script chain on any non-zero exit (up to 3 times),
  then stops, so the exit code decides what gets re-run:
  - exit 1: `phase4-text-extract.js` and `phase7-packaging-intelligence.js`
    (P8), since 2026-09-29. Nothing paid runs before them in their chain.
  - exit 0 on purpose, with a loud `SYNC FAILED — <script>: …` line:
    `migrate-reviews-to-dash.js` (after the paid P3 scrape) and
    `migrate-ocr-to-dash.js` (after the paid P4 vision OCR). A non-zero exit
    there would re-run the paid step. The runner has no warnings channel, so
    the failure shows in the log and as the P3/P4 bar failure in
    `scout_jobs.error`, not as its own message.
  - exit 0 by accident, unchanged: `migrate-keepa-to-dash.js` and
    `migrate-p1-to-dash.js`. Both run after a paid step in their chain (Keepa,
    the P1 scrape), so the same reasoning as the two above applies.
  - exit 0 by design: P3b, P5b, P7b and `verify-certifications.js`.

  The phase bars are the real check.
- **Other scripts in `scout/`:**
  - `scout-agent.js`, `start.js`, `trigger-scout.js`, `pipeline-runner.js`,
    `add-to-queue.js` and `rerun-post-ocr.sh` belong to the pre-Cloud-Run setup.
    `scout/README.md` still documents that legacy agent.
  - `drain-queue.js` chains queued jobs through the edge function.
  - `run-queue.mjs` runs several keywords in sequence.
  - `phase0-market-opportunity.js` (`--phase0`) is a standalone category scan. It
    needs Keepa to score anything (operations log, 2026-09-15).
  - `phase-living-brief.js` is the manufacturer feedback loop, not a pipeline
    phase.
  - `cleanup-stale-products.js`, `dedupe-exact-products.js`,
    `consolidate-categories.js`, `backfill-cohort.js` and `backfill-facts-v2.js`
    are one-off repairs that write to the database.

---

## 4. Where code and docs disagree

| Where | Says | Code / log says |
|---|---|---|
| `run-pipeline.js:4,6,19` header (before this commit) | "Runs P1 → … → P10"; "Grok report"; `--ai` "enables AI for P8" | 13 phases; the model is `ANALYSIS_MODEL`; `--ai` reaches P9, which ignores it. **Fixed in this commit (comments only).** |
| `run-pipeline.js:621,625,629` phase descriptions | "Claude Opus 5 validates / primary" | `VALIDATION_MODEL` defaults to Sonnet 5 since 2026-09-01. Left as is: they are runtime strings, not comments. |
| `Dockerfile` last comment | "runs the full P1-P12 pipeline" | P1–P13 |
| `phase3b-review-synthesis.js` header | "NOT YET WIRED INTO run-pipeline.js" | wired at `run-pipeline.js:573,841-844` |
| P3b header, operations log | "100-review batches" | default 60 since `ce15ce8` |
| `READ-FIRST.md`, `phase5b` header, migrations 010–015 headers | "NOT applied" | applied 2026-09-27 (operations log) |
| `READ-FIRST.md` "A top-20-only pass is fragile … this run's Keepa refresh re-ranks `bsr_current`" | P2 changes `products.bsr_current` mid-run | P2 writes `dovive_research.bsr` and `dovive_keepa.bsr_current` only; `products.bsr_current` is written by P1 (§2, P1). The caution stays sensible, but it is not triggered by P2 within one run. |
| `READ-FIRST.md` "Turn this off with `--no-auto-aliases`" | runner flag | only `inventory.js` parses it; `run-pipeline.js` always auto-aliases |
| `FORMULA-INPUTS.md` §2 "Reads that silently return nothing", items 1, 2, 3, 5 | open gaps | fixed on 2026-09-29 in `daef995` (P9/P10 read P7's report), `871ed0a` (P7 `all_nutrients`), `c92cbc8` (P9 `serving_size`), `51c6bbd` (P10 `other_ingredients`) |
| `supabase/functions/trigger-scout-job/index.ts` header | `scout_jobs` lives in `fhfqjcvwcxizbioftvdw` | single project `jwkitkfufigldpldqtbq` (`DEPLOY_NOTES.md`, 2026-09-15 log) |
| `submit-job.js:70` | "retry: node submit-job.js trigger" | no such mode (§3.1). **Fixed 2026-09-29:** the hint prints the gcloud execute command for the job id. |
| `scout/README.md` | legacy `scout-agent.js` / `dovive_jobs` flow | the Cloud Run flow in §1.3 |
