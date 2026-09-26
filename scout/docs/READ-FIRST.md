# READ-FIRST: inventory, then plan, then scrape

Every Scout job starts by reading what the database already holds for the keyword. Only after that does it decide, phase by phase, what it needs to buy. This step is Phase −1, also called P0.5. It reads only: nothing is inserted, updated or deleted, and no phase script is spawned.

## Why

`submit-job.js` gives every re-submission of a keyword a new `#N` label. Each session is isolated on purpose: its own `categories` row, its own `dovive_research` / `dovive_reviews` / `dovive_phase5_research` rows. The result is that "electrolyte powder" now spans six sessions (`electrolyte powder`, `#2` … `#5`, `electrolytes powder`). Each one is partly complete, and a new `#6` run would buy all of it again. Separately, `run-pipeline.js` had stopped skipping any phase ("always run each phase"), so re-running a finished keyword also paid for work that was already done.

## The pieces

| File | What it does |
|---|---|
| `inventory.js` | `buildInventory({ keyword, db, dash, aliases })`. It reads the keyword family and returns per-phase coverage for the top-40 and top-10 candidate ASINs, a per-ASIN `products` map, the family's sessions and its AI-cost history. `fetchRaw` does all the reads; `assembleInventory` is a pure function. |
| `plan-scope.js` | `planScope(inventory, { freshnessDays, rules })`. This is a pure function. It gives each phase one decision with a one-line reason, an estimate of the work (ASIN counts) and a rough cost. |
| `utils/phase-map.js` | Phase metadata: runner numbering, completion markers, whether sibling reuse is possible and the sync scripts. Also the keyword-family helpers. |
| `utils/apply-plan.js` | How `run-pipeline.js` acts on a decision: skip, sync-only, or top-up env. |
| `utils/reuse-asins.js` | The env contract between the plan and the producers (see below). |
| `migrations/010_scout_jobs_plan.sql` | Adds `scout_jobs.plan jsonb`. **Not applied yet.** Until it is, the plan is still printed and still honoured; only the write to `scout_jobs.plan` is skipped, with a warning. |

### The keyword family

The family starts from the base keyword with any trailing `#N` stripped. It then adds:

- singular/plural variants of each word ("electrolyte powder" matches "electrolytes powder"). Turn this off with `--no-auto-aliases`.
- any explicit `--alias "…"`, or the comma-separated list in `SCOUT_KEYWORD_ALIASES`.

Every label found in `categories.search_term` or `dovive_research.keyword` that normalises to one of those names is a session of the family. Each label is resolved to its category with `utils/category-resolver.js`, the same resolver the phase scripts use. Labels that share the first word but are not in the family are printed as "related, NOT counted" (for example `electrolyte packets`). Pass `--alias` to include one.

### The candidate set

The candidate set is the target session's own P1 ASINs, if it has any. Otherwise it is the freshest non-test sibling session with P1 data, since that is the best predictor of what P1 will return. Candidates are ranked by best BSR, falling back to search rank, which matches how P3 and P4 choose their batches. The top 40 and top 10 are the scopes the plan measures against.

## Decisions

| Decision | Meaning | What run-pipeline does (`honor` mode) |
|---|---|---|
| `reuse` (source `session`) | This session already holds the data, fresh (within the window) on the candidate set, **and the final verifier's own bar for that phase already passes** (see below). | Skips the phase (`status: skipped`). |
| `reuse` (source `family`) | This session has a DASH category, a readable copy elsewhere is fresh, and the verifier's bar is **projected** to pass once that copy is synced in. | Runs only the no-cost migrate step: P2 `migrate-keepa-to-dash.js`, P3 `migrate-reviews-to-dash.js`, P4 `migrate-ocr-to-dash.js`. |
| `top-up` | Part of the data is fresh; the rest is missing or stale, or the verifier's bar does not (safely) pass yet. `work.list` names the missing ASINs. | Runs the phase. P3 and P4 get `SCOUT_REUSE_ASINS` (a readable copy elsewhere is fresh; skip it) and `SCOUT_RESCRAPE_ASINS` (this session holds only a stale copy and nothing fresh exists; redo it). |
| `refresh` | Everything present is older than the window. For a category-level phase (P7, P9–P13) it can also mean that an upstream phase changes this run. | Runs the phase. |
| `scrape` | Nothing usable exists. For AI phases this means "generate". | Runs the phase. |

Freshness windows in days. Defaults: P1 14, P2 7, P3 30, P4 90, P5 60, P6 60, P7 30, P8 60, P9–P13 30. Three ways to override them:

- `SCOUT_FRESH_P3=45` (per phase)
- `SCOUT_FRESHNESS_DAYS='{"P3":45,"P4":120}'`
- `--fresh P3=45,P4=120` (the CLI wins over both)

**Skipping is decided by the final verifier's own bars, not by top-40 coverage.** `utils/verifier-bars.js` holds the measurements and the thresholds, and `runFinalVerifier` (and so the mid-run gates before P5 and P9) now calls the same `measureVerifierMetrics` + `evaluateBars`. The inventory measures this session with that code, so the plan and the verifier cannot disagree:

| Phase | Verifier bar (this session) | Measured over |
|---|---|---|
| P1 | live run ASINs ≥ 60% of scraped run ASINs | `dovive_research` for this exact label ∩ this category |
| P2 | `monthly_sales` on ≥ 90% | the live run ASINs (e.g. 131 for ashwagandha), not the top 40 |
| P3 | `review_analysis` on ≥ 50%, **or** top-20 ≥ 15 **and** this session's **own** `dovive_reviews` rows ≥ 200 | live run ASINs; top-20 by `bsr_current`. Sibling-read reviews never count toward the 200. |
| P4 | `nutrients_count > 0` on ≥ 80%, or top-20 ≥ 15 | the **whole** category |
| P5 | ≥ min(target, max(6, ⌈0.75 × target⌉)) rows with content (target = `P5_TOP_COUNT` + `P5_NEW_COUNT`) | this exact label |
| P6 | `marketing_analysis` on ≥ 90% | the **whole** category |
| P8 | `packaging_intelligence` on ≥ 90% | the live run ASINs |
| P7, P9–P13 | the deliverable exists (P11/P12: draft **and** validation; P13: review) | the category's `formula_briefs` row (`.single()`) |

Two more conditions sit on top of the bar:

- **A top-20-only pass is fragile.** If P3 or P4 passes *only* on its top-20 path, and P2 is not itself being skipped, this run's Keepa refresh re-ranks `bsr_current`. A single ASIN moving is then enough to fail the P5 gate, with no P3/P4 run left to fill the gap. So such a phase becomes a `top-up`, not a `reuse`. This is the live ashwagandha case: P3 29/131, top-20 15/20.
- **The freshness floors in `DEFAULT_RULES` still apply** (P3 50% of the top 40 with 80% of the top 10, and so on). They are an extra condition on the candidate set. They never replace the bar.

**Freshness comes only from the raw rows.** That means `dovive_research.scraped_at`, `dovive_keepa.parsed_at`, `dovive_reviews.scraped_at`, `dovive_ocr.processed_at`, `dovive_phase5_research.researched_at`, the phases' own `analyzed_at` / `generated_at` stamps, and, for P9 only, the brief row's `created_at` (P9 re-inserts the row). It never comes from `products.*_updated_at` or `formula_briefs.updated_at`: migrate scripts stamp those with `now()` even when they sync a sibling's old rows. A missing timestamp counts as unknown, and unknown counts as stale.

A category-level phase is reused only when three things hold: this session has it, it is fresh, and **every upstream phase is also a session reuse**. A sibling sync counts as an input change.

### How run-pipeline.js uses it

1. The plan is built at start, printed, and written to `scout_jobs.plan` when `SCOUT_JOB_ID` is set.
2. It is **rebuilt after P1**, because a new session only gets its own ASIN set and DASH category once P1 has run. The after-P1 plan is the one that decides P2 onwards. **If that rebuild fails or times out, the job continues with no plan** (every phase runs as before). It never falls back to the start plan, which was built before the session had a category. Before P1 no phase can be a `reuse`: without a category there is nothing for the verifier to measure.
3. Timing: the plan is built only **after** the job is marked `running`. The reads are bounded by `SCOUT_PLAN_TIMEOUT_MS` (default 90000); a timeout counts as a failure, and the job fails open.
4. It is honoured by default. It is advisory (printed but not acted on) with `--force`, with `--no-reuse`, with `SCOUT_PLAN_MODE=advisory`, and on hand-scoped runs (`--phases …` or `--from Pn>1`) unless `SCOUT_PLAN_MODE=honor` is set. `SCOUT_PLAN_MODE=off` skips the inventory entirely.

   **Current behaviour for dashboard research-scope jobs:** these jobs submit `only_phases` 1–8. `cloud-worker.js` turns that into `--phases 1,…,8`, so **they run in advisory mode**: the plan is printed and stored, but every phase still runs. To have such jobs honour the plan, set `SCOUT_PLAN_MODE=honor` in the environment the pipeline runs with (the Cloud Run job's env vars, or the shell for a local run). With that set, `--phases` / `--from` runs honour it too.
5. It fails open. If the inventory cannot be read, every phase runs exactly as before. The mid-run structural gates (before P5 and P9) and the final verifier are unchanged, so a wrong plan cannot bypass them.

### How top-up composes with the scripts' own skips

| Phase | The script's own skip | What the plan adds |
|---|---|---|
| P1 `human-bsr.js` | Detail pages already stored for (asin, **same keyword**). | Nothing: this file is out of scope for this change. |
| P2 `keepa-phase2.js` | None; it always re-fetches. | Family `reuse` runs `migrate-keepa-to-dash.js` only, which reads `dovive_keepa` by ASIN. A `top-up` runs the full phase, because Keepa has no ASIN-subset flag. |
| P3 `playwright-reviews.js` | ASINs that already have reviews **for this keyword**. | Also skips `SCOUT_REUSE_ASINS`, which holds only copies that are fresh within the window. Re-scrapes `SCOUT_RESCRAPE_ASINS`, which this session holds only stale with no fresh copy anywhere. `migrate-reviews-to-dash.js` reads reviews from the single freshest sibling session in `SCOUT_REUSE_KEYWORDS` (case-insensitive, within `SCOUT_REUSE_MAX_AGE_DAYS`). It does this for ASINs with no reviews in this session, and for listed ASINs whose copy here is older than the sibling's. It also collapses duplicate reviews left by a re-scrape. Nothing is copied. |
| P4 `phase4-text-extract.js`, `ocr-phase4.js` | ASINs already processed **for this keyword**. | Also skips `SCOUT_REUSE_ASINS` and redoes `SCOUT_RESCRAPE_ASINS`. `dovive_ocr` is UNIQUE(asin, image_index), and `migrate-ocr-to-dash.js` already reads by ASIN, so sibling facts land without a new vision pass. |
| P5 `phase5-deep-research.js` | Done (asin, pool) pairs **for this keyword**. | Runs as today; its top-up is its own skip. |
| P6 `phase6-product-intelligence.js` | Products in this category that already have `product_intelligence.analyzed_at`. | Runs as today. |
| P8 `phase7-packaging-intelligence.js` | None; it re-analyses its top-N every run. | Runs as today, so a P8 `top-up` redoes the whole top-N. The plan still reports the gap. |

## Cross-session reuse: what is wired and what is not

Cross-session reuse is implemented only where it can be done **by reading**:

- **P2**: `dovive_keepa` is keyed by ASIN. The plan reports this as "by ASIN (any session)", because the row may have been written by any keyword's run, even one outside the family.
- **P3**: the reviews migrate reads the sibling keyword. This is the only keyword-keyed reuse, so it is the only phase that passes `SCOUT_REUSE_KEYWORDS`.
- **P4**: `dovive_ocr` is keyed by ASIN, and is reported the same way as P2.

It is **not** wired for the phases below. The plan says so in each reason ("… cannot read across sessions"), and each one still runs.

- **P1 (`dovive_research`, UNIQUE(asin, keyword)).** Every downstream reader resolves "this run's ASINs" as `dovive_research WHERE keyword = <session>`: `getRunAsins` in run-pipeline, P3/P4 candidate lists, `migrate-*`, and `migrate-p1-to-dash.js`. A new `#N` label therefore has no ASINs until its own rows exist, and creating them without scraping would mean copying rows. TODO: define the run's ASINs by reading the family instead:
  ```sql
  SELECT DISTINCT asin FROM dovive_research
  WHERE lower(keyword) = ANY(:family_labels) AND scraped_at >= now() - interval '14 days'
  ```
  This would feed `getRunAsins()`, `playwright-reviews.getAsins()`, `ocr-phase4`'s product list and `migrate-p1-to-dash.js` (which would then create the new category's `products` rows from the sibling's raw rows). The skip at `human-bsr.js:256` (`getAlreadyScraped`) needs the same `keyword = ANY(:family_labels)` change. Neither `human-bsr.js` nor the migrate scripts are touched here: another builder owns that selection logic.
- **P5 (`dovive_phase5_research`, keyed by keyword).** The skip (`phase5-deep-research.js` `getAlreadyResearched`) and both verifier gates count `ilike('keyword', KEYWORD)`. TODO join:
  ```sql
  SELECT r.* FROM dovive_phase5_research r
  WHERE r.asin = ANY(:run_asins) AND lower(r.keyword) = ANY(:family_labels)
    AND r.full_research IS NOT NULL AND r.researched_at >= now() - interval '60 days'
  ```
  This would go into `getAlreadyResearched`, `checkPhaseStatus` case 5 and `runFinalVerifier`'s P5 count. It is a read-only change, but it must move all three together or the gate disagrees with the skip.
- **P6 and P8 (`products.marketing_analysis.*`, one row per category).** The data lives on the sibling's `products` row. Reuse means either copying the JSON onto this session's row (a write) or having the dashboard read across categories:
  ```sql
  SELECT p2.marketing_analysis->'product_intelligence' FROM products p2
  WHERE p2.asin = :asin AND p2.category_id = ANY(:family_category_ids)
    AND p2.marketing_analysis ? 'product_intelligence' ORDER BY p2.marketing_analysis_updated_at DESC LIMIT 1
  ```
- **P7 and P9–P13 (`formula_briefs`, one row per category).** These are synthesis outputs of this session's inputs, so they are regenerated rather than reused. The plan does print which sibling holds a finished brief, plus a **recommendation** to re-run that session instead of starting a new `#N` when the new session has nothing yet.

## Running it (reads only)

```bash
cd scout
node inventory.js --keyword "magnesium gummies"                 # table + JSON
node inventory.js --keyword "electrolyte powder #6" --plan      # table + plan + JSON
node inventory.js --keyword "electrolyte powder" --json --plan  # JSON only
npm test                                                        # node --test, fixtures in test/fixtures
```

`inventory.js` loads `scout/.env` (`SUPABASE_URL`, `SUPABASE_KEY`, and optionally `DASH_URL`/`DASH_KEY`) and only issues `select`s. A run takes about 10–15 s for a six-session family.

## Looking at the DB from Claude Code or Codex (MCP)

The repo-root `.mcp.json` registers the official Supabase MCP server for project `jwkitkfufigldpldqtbq` in `--read-only` mode, under the name `scout-db`. The server takes the token from your environment. It is never committed:

```bash
export SUPABASE_ACCESS_TOKEN=…   # a personal access token from supabase.com/dashboard/account/tokens
claude                           # Claude Code reads .mcp.json; approve the project server when asked
```

Codex does not read `.mcp.json`. Add the same server to `~/.codex/config.toml`:

```toml
[mcp_servers.scout-db]
command = "npx"
args = ["-y", "@supabase/mcp-server-supabase@latest", "--read-only", "--project-ref=jwkitkfufigldpldqtbq"]
env_vars = ["SUPABASE_ACCESS_TOKEN"]
```

`env_vars` forwards the variable from your shell. If your Codex version does not recognise it, use `env = { SUPABASE_ACCESS_TOKEN = "…" }`. That file is in your home directory, not in the repo.

Before an agent session scrapes, submits a job or edits a phase, it should read first. Two ways to do that:

1. Run `node inventory.js --keyword "<kw>" --plan`. This is the same code path the pipeline uses.
2. Query through `scout-db`, for example:
   - `select search_term, total_products, created_at from categories where search_term ilike 'electrolyte%'`
   - `select keyword, count(*), max(scraped_at) from dovive_research where keyword ilike 'electrolyte powder%' group by 1`
   - `select id, keyword, status, plan->'phases'->'P3' from scout_jobs order by created_at desc limit 5` (once 010 is applied)

The server runs as a read-only Postgres user, so a stray `update` fails instead of landing. Schema changes still go through `scout/migrations/` and are applied deliberately.
