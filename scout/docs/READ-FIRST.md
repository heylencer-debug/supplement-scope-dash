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
| `reuse` (source `session`) | This session already holds the data. It is fresh (within the window) and complete (at or above the phase's bar). | Skips the phase (`status: skipped`). |
| `reuse` (source `family`) | A sibling session holds it fresh, and this phase can read it across sessions. | Runs only the no-cost migrate step: P2 `migrate-keepa-to-dash.js`, P3 `migrate-reviews-to-dash.js`, P4 `migrate-ocr-to-dash.js`. |
| `top-up` | Part of the data is fresh; the rest is missing or stale. `work.list` names the missing ASINs. | Runs the phase. P3 and P4 get `SCOUT_REUSE_ASINS`, so the producers skip ASINs that are fresh in a sibling. |
| `refresh` | Everything present is older than the window. For a category-level phase (P7, P9–P13) it can also mean that an upstream phase changes this run. | Runs the phase. |
| `scrape` | Nothing usable exists. For AI phases this means "generate". | Runs the phase. |

Freshness windows in days. Defaults: P1 14, P2 7, P3 30, P4 90, P5 60, P6 60, P7 30, P8 60, P9–P13 30. Three ways to override them:

- `SCOUT_FRESH_P3=45` (per phase)
- `SCOUT_FRESHNESS_DAYS='{"P3":45,"P4":120}'`
- `--fresh P3=45,P4=120` (the CLI wins over both)

The completeness bars in `DEFAULT_RULES` mirror the final verifier: P2 90%, P3 50% of the top 40 with at least 80% of the top 10, P4 75%, P5 75% of the top 10, P6 and P8 90%. That way a `reuse` skip cannot leave the verifier failing.

A category-level phase is reused only when three things hold: this session has it, it is fresh, and **every upstream phase is also a session reuse**. A sibling sync counts as an input change.

### How run-pipeline.js uses it

1. The plan is built at start, printed, and written to `scout_jobs.plan` when `SCOUT_JOB_ID` is set.
2. It is **rebuilt after P1**, because a new session only gets its own ASIN set and DASH category once P1 has run. The after-P1 plan is the one that decides P2 onwards.
3. It is honoured by default. It is advisory (printed but not acted on) with `--force`, with `--no-reuse`, with `SCOUT_PLAN_MODE=advisory`, and on hand-scoped runs (`--phases …` or `--from Pn>1`) unless `SCOUT_PLAN_MODE=honor` is set. `SCOUT_PLAN_MODE=off` skips the inventory entirely.
4. It fails open. If the inventory cannot be read, every phase runs exactly as before. The mid-run structural gates (before P5 and P9) and the final verifier are unchanged, so a wrong plan cannot bypass them.

### How top-up composes with the scripts' own skips

| Phase | The script's own skip | What the plan adds |
|---|---|---|
| P1 `human-bsr.js` | Detail pages already stored for (asin, **same keyword**). | Nothing: this file is out of scope for this change. |
| P2 `keepa-phase2.js` | None; it always re-fetches. | Family `reuse` runs `migrate-keepa-to-dash.js` only, which reads `dovive_keepa` by ASIN. A `top-up` runs the full phase, because Keepa has no ASIN-subset flag. |
| P3 `playwright-reviews.js` | ASINs that already have reviews **for this keyword**. | Also skips `SCOUT_REUSE_ASINS`. `migrate-reviews-to-dash.js` reads those ASINs' reviews from the freshest sibling session in `SCOUT_REUSE_KEYWORDS` (case-insensitive, within `SCOUT_REUSE_MAX_AGE_DAYS`). Nothing is copied. |
| P4 `phase4-text-extract.js`, `ocr-phase4.js` | ASINs already processed **for this keyword**. | Also skips `SCOUT_REUSE_ASINS`. `dovive_ocr` is UNIQUE(asin, image_index), and `migrate-ocr-to-dash.js` already reads by ASIN, so sibling facts land without a new vision pass. |
| P5 `phase5-deep-research.js` | Done (asin, pool) pairs **for this keyword**. | Runs as today; its top-up is its own skip. |
| P6 `phase6-product-intelligence.js` | Products in this category that already have `product_intelligence.analyzed_at`. | Runs as today. |
| P8 `phase7-packaging-intelligence.js` | None; it re-analyses its top-N every run. | Runs as today, so a P8 `top-up` redoes the whole top-N. The plan still reports the gap. |

## Cross-session reuse: what is wired and what is not

Cross-session reuse is implemented only where it can be done **by reading**:

- **P2**: `dovive_keepa` is keyed by ASIN.
- **P3**: the reviews migrate reads the sibling keyword.
- **P4**: `dovive_ocr` is keyed by ASIN.

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
