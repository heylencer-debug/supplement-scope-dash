# Scout pipeline — Cloud Run Job deploy notes

## 2026-08-27 update: Bright Data fallback wired for P1 bot-wall recovery

**Trigger**: the first real end-to-end Cloud Run execution (job
`dovive-scout-s2zjx`, keyword "magnesium glycinate gummies") failed in Phase 1
(`human-bsr.js`) — homepage loaded, search box found, but
`elementHandle.scrollIntoViewIfNeeded` timed out (element never became
visible) across all 3 retry attempts, so no products were ever written and
the pipeline correctly failed downstream with `Verifier FAIL: category not
resolved`. Working hypothesis going in: Amazon bot-walls Cloud Run's
datacenter egress IPs after the search request (Google Cloud IPs read as
datacenter, not residential, to Amazon's bot detection) — same risk flagged
in the "Playwright vs Amazon IP blocks" section below, now hit for real.
**Not re-confirmed this session** — diagnosis is still the working hypothesis
from the timeout signature; the job was NOT re-run (Bright Data key is still
a placeholder, see below), so no fresh failure-artifact evidence (screenshot/
page-content bot-wall markers) exists yet. That evidence will show up in
Cloud Run logs automatically the next time P1 fails, now that the logging
below ships.

**1. Failure-artifact logging (`scout/human-bsr.js`)** — on any Playwright
gather failure, `captureFailureArtifact(page, label)` now logs: matched
bot-wall markers (grepped from `page.content()` against a list including
"enter the characters", "automated access", "captcha", "robot check", "sorry,
we just need to make sure", "api-services-support@amazon.com"), a 2KB content
snippet, page title/URL, and saves a screenshot to
`scout/output/failure-artifacts/p1-attempt<N>-<ts>.png` (local disk — no
cloud storage wiring, logging to Cloud Run stdout is the minimum bar per
task scope). Fires from `attemptPlaywrightGather()`'s catch block before the
browser closes.

**2. `scout/bright-data-amazon.js` (new file)** — Node/CommonJS port of
`~/getnoodle/supabase/functions/bright-data-amazon-product/index.ts`'s
keyword-search + hydration logic (that function's Deno-only bits — `Deno.serve`,
CORS headers, JWT auth lockdown, `chargeUserOrLog` billing — are irrelevant
here and were dropped; the scrape/normalize logic is ported close to 1:1).
Exports `isBrightDataConfigured()`, `getApiKey()`,
`searchAmazonByKeyword(keyword, { locale, limit, pages })`. Two-call flow,
same as getnoodle: (a) `SEARCH_DATASET` (`gd_lwdb4vjm1ehb499uxs`) for keyword
discovery → ASINs in Amazon relevance order, (b) `PRODUCTS_DATASET`
(`gd_l7q7dkf244hwjntr0`) to hydrate each ASIN to full product data (images,
bullets/features, specs, rating, price, bsRank). getnoodle does NOT have a
third/separate call for images/bullets — the Products dataset's own hydrate
response carries those fields, so this port does the same (no extra dataset
call invented). Reads the key via
`process.env.BRIGHTDATA_API_KEY || process.env.BRIGHTDATA` so both secret
names resolve. `isBrightDataConfigured()` returns false for unset AND for any
value still matching `/^REPLACE_ME/i` (the placeholder pattern used below),
so the fallback never fires against a fake key.

**3. Fallback wiring in `scout/human-bsr.js`** — `main()` restructured:
  - `attemptPlaywrightGather(attemptNum, alreadyScraped)` now wraps the
    existing homepage→search→paginate→collect-ASINs flow (unchanged
    anti-detection behavior — UA rotation, cookie persistence, human scroll,
    CAPTCHA detection) in a try/catch. On failure it calls
    `captureFailureArtifact()` then closes the browser and re-throws.
  - `main()` retries this 3x (same retry count as before, now explicit
    rather than implicit inside the old monolithic function), sleeping
    5-10s between attempts.
  - `runDetailScrapeAndSave(context, toScrape, skipped)` — the old Step 4
    per-product detail scrape + `dovive_research`/`dovive_history` upsert +
    DASH sync, extracted unchanged so both the Playwright success path and
    (implicitly, via its own save loop) the Bright Data path share the same
    `upsertProducts()`/`syncProductToDash()` calls.
  - If all 3 Playwright attempts fail AND `brightData.isBrightDataConfigured()`
    is true, `runBrightDataFallback(alreadyScraped)` runs: calls
    `ensureKeyword()` (same `dovive_keywords` upsert as the Playwright path),
    `searchAmazonByKeyword(KEYWORD_LABEL, { limit: 40, pages: 3 })`, maps each
    normalized product to the exact `dovive_research` column set (`asin`,
    `keyword`, `title`, `brand`, `bullet_points`, `specs`, `images`,
    `main_image`, `bsr`, `rank_position`, `rating`, `review_count`, `price`,
    `category`, `is_sponsored`, `source: 'bright-data-fallback-v1'`,
    `raw_json: <full raw Bright Data record>`), then calls the SAME
    `upsertProducts()` + `syncProductToDash()` functions the Playwright path
    uses. **No downstream phase (P2+) needs any change** — they only ever
    read `dovive_research`/`dovive_history` rows and don't know which scrape
    method wrote them.
  - If all 3 Playwright attempts fail AND Bright Data is not configured
    (unset or placeholder), behavior is unchanged from before: the script
    throws and exits non-zero, same as today.

**4. Schema — `raw_json` column added to `dovive_research`**
(`scout/migrations/004_consolidated_cloud.sql`): added to the `CREATE TABLE`
definition plus a defensive `ALTER TABLE dovive_research ADD COLUMN IF NOT
EXISTS raw_json jsonb;` right after it (idempotent — safe to re-run against a
DB that already has the table without this column). **Still NOT applied** —
same DDL policy as always (dashboard SQL editor only, see the "Still NOT
applied" section further down). The Bright Data fallback path writes
`raw_json`; until 004 is (re-)run with this column, a live fallback save
would 400 on that field — not a concern yet since Bright Data hasn't been
exercised end-to-end (placeholder key, job not re-run this session).

**5. GCP Secret Manager — `scout-brightdata-key`** created in project
`noodle-worker` (same pattern as `scout-keepa-key`), currently holds
`REPLACE_ME_WITH_REAL_BRIGHTDATA_KEY`. Default compute service account
(`557092350372-compute@developer.gserviceaccount.com`) granted
`roles/secretmanager.secretAccessor`. `dovive-scout` Cloud Run Job updated
with `--update-secrets=BRIGHTDATA_API_KEY=scout-brightdata-key:latest` — this
is now the 8th pipeline secret bound to the Job. **User action required** —
the real key already exists as the Dovive Supabase project's edge function
secret `BRIGHTDATA` (not readable from this session); paste it into GCP
Secret Manager the same way the Keepa key placeholder gets replaced:
```bash
gcloud secrets versions add scout-brightdata-key --project=noodle-worker --data-file=-
```
(paste the real Bright Data key, then Ctrl-D). No Cloud Run Job update needed
after that — it always reads `:latest`.

**6. Image rebuilt + Cloud Run Job updated** — `gcloud builds submit` (per
the standing "no local Docker" note below) rebuilt
`us-central1-docker.pkg.dev/noodle-worker/dovive-scout/worker:latest` with
`bright-data-amazon.js` + the `human-bsr.js` changes baked in (build ID
`cd714ca7-c36e-42fb-8f8a-3151e8bf142b`, new image digest
`sha256:979e0905db8d72ac208b445108e0571865167c1e3d4a1cfe9ed82fe1cfd24425`),
pushed, and `gcloud run jobs update dovive-scout --image ...:latest` run to
point the Job at it. Shipped regardless of the placeholder key — the code is
live in the image; the fallback simply won't engage (falls straight through
to the pre-existing throw/exit-1 behavior) until the real key is pasted in.

**Per task scope: the cloud job was NOT re-run this session.** Running it now
with a placeholder Bright Data key would either fail identically (if Amazon
still bot-walls) with no new information, or silently prove nothing about the
fallback path. Next real test, once the user pastes the real key:
```bash
gcloud run jobs execute dovive-scout --region=us-central1 --project=noodle-worker --wait
```
watch for either "🚨 FAILURE ARTIFACT" log lines confirming the bot-wall
diagnosis, or (if Playwright succeeds this time) no fallback engagement at
all — both are useful signal.

## 2026-08-27 update: Apify dropped; Jungle Scout KEPT (reversed mid-session)

User decision, final: **Keepa, Jungle Scout, Bright Data (fallback), and this
pipeline's own Playwright scraping are the valid data sources. Apify is the
only one actually dropped.**

This reverses an earlier version of the decision made mid-session (Jungle
Scout was briefly removed from `enrich-product-asin`, then restored once the
user saw that JS's Sales Estimates endpoint — daily units-sold — and Keyword
Scout (Amazon keyword search volume/ranking) have no Keepa or Bright Data
equivalent, and daily unit estimates matter for the user's analysis). Net
effect on this repo:

- `supabase/functions/enrich-product-asin/index.ts` and
  `src/hooks/useEnrichProduct.ts` are **unchanged** — `fetchJungleScout()` and
  the Keepa+JS merge logic are exactly as they were before this session.
  `JUNGLE_SCOUT_API_KEY` is still set in the Dovive Supabase project's own
  secrets (per the coordinator) — nothing to do there. **No scout/ pipeline
  script calls Jungle Scout** (grepped — it's only ever referenced from the
  frontend/edge-function side, not from anything `run-pipeline.js` runs), so
  there was nothing to add to the Cloud Run Job's Secret Manager set either.
- **Apify IS still removed** — this part of the original decision stands.
  `scout/apify-reviews.js` **deleted**, replaced by `scout/playwright-reviews.js`
  — scrapes Amazon's own `/product-reviews/{asin}` pages directly with the
  same stealth/context pattern as `human-bsr.js` (Phase 1), no API key. Saves
  into the exact same `dovive_reviews` schema (plus a new `raw_json` column),
  so `migrate-reviews-to-dash.js` and everything downstream needed zero
  changes. `run-pipeline.js` Phase 3 updated to call it.
  - **This is the minimum viable version, not a hardened one**: bounded to
    `REVIEWS_MAX_ASINS` (default 30) and `REVIEWS_MAX_PAGES` (default 3) per
    run to keep Cloud Run runtime sane, and it does not retry/paginate as
    aggressively as `human-bsr.js` does for products. If Amazon blocks it from
    the Cloud Run IP (see the Amazon-block risk section below — the same risk
    applies to P1's scraper), the documented fix is porting to **Bright
    Data's Amazon reviews dataset**, not more stealth tweaks — flagged as a
    follow-up, not done here per the "minimum to keep functional" scope.
  - `APIFY_KEY` removed everywhere: `scout/.env`, `scout/.env.example`,
    `~/Downloads/_env` (commented out with a note), the `dovive-scout` Cloud
    Run Job's secret binding (`--remove-secrets=APIFY_KEY`), and the
    `scout-apify-key` Secret Manager secret itself (deleted). **Only 7
    pipeline secrets remain now**, not 8.

### Roadmap note: keyword-ranking analysis (future)

User wants keyword-ranking analysis (search volume, ASIN keyword rank) in the
app later. Jungle Scout's **Keywords by ASIN** and **Keyword Scout** endpoints
are the intended source for that — not built in this session, just flagged
here since it came up alongside the Sales Estimates discussion above. Would
likely slot in as a new Scout phase or an extension of `enrich-product-asin`,
writing to a new table (not yet designed).

## 2026-08-27 update: consolidated onto the live dashboard Supabase project

The old separate Scout pipeline DB (`fhfqjcvwcxizbioftvdw`) is **permanently
gone** — confirmed via Google's own authoritative DNS resolver
(`https://dns.google/resolve?name=fhfqjcvwcxizbioftvdw.supabase.co&type=A`
returns `"Status":3` = NXDOMAIN; `jwkitkfufigldpldqtbq` resolves fine by
contrast). Decision: **consolidate everything onto the live dashboard project
`jwkitkfufigldpldqtbq`** — one Supabase project for both the dashboard tables
(`products`, `categories`, `formula_briefs`, ...) and the pipeline's raw
scrape tables (`dovive_*`). `SUPABASE_URL` and `LOVABLE_SUPABASE_URL` are now
literally the same URL.

**Repointed (done this session):**
- Google Secret Manager secret `scout-supabase-key` (used by the Cloud Run
  Job) — new version added with the `jwkitkfufigldpldqtbq` service-role key
  (the value already committed in `scout/human-bsr.js` lines 29-30 — reused
  here rather than inventing a new key; **the user should rotate this key
  eventually since it's sitting in plaintext in a committed file**).
- Cloud Run Job `dovive-scout`'s plain `SUPABASE_URL` env var → 
  `https://jwkitkfufigldpldqtbq.supabase.co`.
- `~/Downloads/_env` lines 5-6 and `scout/.env` lines 5-6 (local runs) — same
  swap, both files annotated with the change.
- `scout/.env.example` — updated + annotated.

**Data-completeness requirement (new, 2026-08-27):** every phase's output
must land in a queryable Supabase table, not just a local file/log, since
future UI/analysis features will be built on top of these tables. Audited all
12 phases while writing `004_consolidated_cloud.sql`:
- P1/P2/P3/P4/P5/P7 already wrote to `dovive_*` tables — carried forward as-is,
  plus a new `raw_json` jsonb column added to `dovive_keepa`
  (`keepa-phase2.js`) and `dovive_reviews` (`apify-reviews.js`) so the raw
  source payload survives next to the normalized columns. `dovive_research`
  and `dovive_ocr` already carried enough raw jsonb (bullet_points/specs/
  images/raw_text) to not need one.
- P6/P8/P9/P10/P11 already save their FULL raw text/JSON (not just parsed
  summaries) into `formula_briefs.ingredients` / `products.marketing_analysis`
  — confirmed by reading each phase's save call, no changes needed.
- **P0 (market opportunity scanner) was the one real gap**: it only ever wrote
  its ranked category scan to a local markdown file
  (`scout/output/*-phase0-opportunities.md`), never to Supabase. Fixed: added
  `dovive_market_opportunities` table + a `saveOpportunitiesToSupabase()` call
  at the end of `phase0-market-opportunity.js`.

**One migration file now, not two**: `scout/migrations/004_consolidated_cloud.sql`
supersedes `003_scout_jobs_cloud_run.sql` — it's the complete, single paste
for `jwkitkfufigldpldqtbq` (includes `scout_jobs`/`claim_scout_job()` from 003
plus every `dovive_*` table). **003 is now historical only** (it targeted the
dead project) — don't run it, run 004.

**Still NOT applied** — DDL cannot be run from any automated session against
this project (standing policy, unchanged by the consolidation). **Run
`scout/migrations/004_consolidated_cloud.sql` in the `jwkitkfufigldpldqtbq`
Supabase dashboard SQL editor.** This is the one remaining hard blocker before
any real pipeline data can flow. Re-tested the Cloud Run Job after the
SUPABASE_URL repoint above (`gcloud run jobs execute dovive-scout --wait`) —
confirmed the DNS/networking issue is gone (now reaches the live project
cleanly) and the only remaining error is exactly what's expected:
`Could not find the function public.claim_scout_job(p_job_id) in the schema cache`.

**`dovive_scout_config.keepa_api_key` starts empty** — the Keepa API key that
used to live in the dead project's config table is not recoverable from this
repo. Re-enter it manually after running 004:
```sql
insert into dovive_scout_config (config_key, config_value)
values ('keepa_api_key', '<the real Keepa key>')
on conflict (config_key) do update set config_value = excluded.config_value;
```

**`trigger-scout-job` edge function is already deployed** (done by the
coordinator, not this session) to `jwkitkfufigldpldqtbq`. It still needs its
5 secrets set (see step 4 below) — `SCOUT_DB_URL`/`SCOUT_DB_SERVICE_ROLE_KEY`
now literally equal `SUPABASE_URL`/service-role for `jwkitkfufigldpldqtbq`
since consolidation (no longer a separate project).

**`scout-invoker` GCP service account created this session** (for the edge
function's Cloud Run auth): `scout-invoker@noodle-worker.iam.gserviceaccount.com`,
granted `roles/run.invoker` on the `dovive-scout` Job. **The JSON key itself
was NOT generated** — this session's tool-permission classifier consistently
refused `gcloud iam service-accounts keys create` (a private-key-download
command, reasonably flagged). The user needs to run this themselves:
```bash
export PATH="$HOME/google-cloud-sdk/bin:$PATH"
gcloud iam service-accounts keys create scout-invoker-key.json \
  --iam-account=scout-invoker@noodle-worker.iam.gserviceaccount.com --project=noodle-worker
```
Then paste the file's contents into the `GCP_SA_KEY` secret (step 4) and
delete the local key file.

---

## Current state (2026-08-27)

Mirrors the noodle-render-worker cutover (`~/noodle-render-worker/README.md`).
Scout keeps Playwright scraping — this is the SAME pipeline, just running
inside a Cloud Run Job container instead of on this Mac.

DONE:
- Artifact Registry repo `dovive-scout`, image built + pushed:
  `us-central1-docker.pkg.dev/noodle-worker/dovive-scout/worker:latest`.
- 7 pipeline secrets in Secret Manager (`scout-apify-key` deleted; `scout-supabase-key`
  now points at the live project, see above), default compute SA granted
  `secretAccessor` on each.
- Cloud Run Job `dovive-scout` (4Gi/2vCPU, task-timeout 3600s, max-retries 1,
  `us-central1`), `SUPABASE_URL` now `jwkitkfufigldpldqtbq`, `APIFY_KEY`
  secret binding removed.
- `scout-invoker` GCP service account + `run.invoker` binding on the Job.
- `run-pipeline.js`, `cloud-worker.js`, `phase0-market-opportunity.js`,
  `keepa-phase2.js` written/edited; `apify-reviews.js` deleted and replaced by
  `playwright-reviews.js`. Jungle Scout in `enrich-product-asin/index.ts` /
  `useEnrichProduct.ts` was briefly removed then restored unchanged — see
  the top of this file. All committed.
- `trigger-scout-job` edge function code + `_shared/cloudRunTrigger.ts`
  written here; **function itself deployed by the coordinator** to
  `jwkitkfufigldpldqtbq`.
- `scout/migrations/004_consolidated_cloud.sql` — the one migration to run.

NOT DONE — blocked or left for the user:
- **004 migration not yet applied** (DDL, dashboard SQL editor only) — the
  one hard blocker.
- **Edge function secrets not set** (`SCOUT_DB_URL`, `SCOUT_DB_SERVICE_ROLE_KEY`,
  `GCP_SA_KEY`, `GCP_PROJECT`, `GCP_REGION`, `CLOUD_RUN_JOB`) — needs
  `npx supabase secrets set`, which this session's classifier refuses to run
  itself (see step 4).
- **`GCP_SA_KEY` value doesn't exist yet** — `keys create` refused by the
  classifier (see above); user runs it.
- **`dovive_scout_config.keepa_api_key` needs re-entering** (see above).
- End-to-end pipeline test not run — blocked on the migration.

## Where it runs

| | |
|---|---|
| GCP project | `noodle-worker` (reused — billing/SA already set up) |
| Region | `us-central1` |
| Artifact Registry repo | `dovive-scout` |
| Cloud Run Job | `dovive-scout` |
| Image | `us-central1-docker.pkg.dev/noodle-worker/dovive-scout/worker:latest` |
| Supabase project (single, consolidated) | `jwkitkfufigldpldqtbq` — both dashboard + `dovive_*`/`scout_jobs` tables |

```
trigger-scout-job (edge fn, jwkitkfufigldpldqtbq — already deployed)
  -> insert scout_jobs row (status 'queued')
  -> _shared/cloudRunTrigger.ts fires ONE Cloud Run Job execution with
     env override SCOUT_JOB_ID=<row id>
       -> container runs `node cloud-worker.js`
            -> claim_scout_job() atomic UPDATE (queued -> claimed)
            -> spawns `node run-pipeline.js --keyword "..."` (unchanged,
               phases P1-P12), which writes current_phase/status back to
               scout_jobs after every phase
            -> writes terminal status (complete/error) as a safety net
```

## 1. Build + push the image — DONE

```bash
export PATH="$HOME/google-cloud-sdk/bin:$PATH"
cd /Users/doncarlos/supplement-scope-dash/scout
gcloud builds submit --tag us-central1-docker.pkg.dev/noodle-worker/dovive-scout/worker:latest \
  --project noodle-worker --region us-central1 --timeout=1200s
gcloud run jobs update dovive-scout \
  --image us-central1-docker.pkg.dev/noodle-worker/dovive-scout/worker:latest \
  --region us-central1 --project noodle-worker
```

## 2. Cloud Run Job + secrets — DONE (repointed to jwkitkfufigldpldqtbq)

```bash
export PATH="$HOME/google-cloud-sdk/bin:$PATH"
gcloud run jobs update dovive-scout --region=us-central1 --project=noodle-worker \
  --update-env-vars SUPABASE_URL=https://jwkitkfufigldpldqtbq.supabase.co
# scout-supabase-key secret already updated to the jwkitkfufigldpldqtbq service-role key.
```

## 3. Run once against a real / test job — BLOCKED on the migration

```bash
export PATH="$HOME/google-cloud-sdk/bin:$PATH"
gcloud run jobs execute dovive-scout --region=us-central1 --project=noodle-worker --wait
```

Currently fails cleanly (network/DNS confirmed fine) with:
`Could not find the function public.claim_scout_job(p_job_id) in the schema cache`
— run `004_consolidated_cloud.sql` first, then insert a test row and re-run:

```sql
insert into scout_jobs (keyword) values ('test keyword');
```

To target one specific row:
```bash
gcloud run jobs execute dovive-scout --region=us-central1 --project=noodle-worker \
  --update-env-vars SCOUT_JOB_ID=<uuid> --wait
```

Watch logs:
```bash
gcloud logging read 'resource.type="cloud_run_job" AND resource.labels.job_name="dovive-scout"' \
  --project=noodle-worker --limit=50 --order=desc --format="value(textPayload)"
```

## 4. Finish wiring the `trigger-scout-job` edge function (already deployed)

The function itself is live on `jwkitkfufigldpldqtbq`. It still needs its
secrets set — this session's classifier refuses to run `npx supabase secrets
set` (blocks on `SUPABASE_ACCESS_TOKEN` being read + passed to `npx supabase`,
any subcommand). Run yourself:

```bash
export SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN' ~/Downloads/_env | cut -d= -f2)
npx --yes supabase secrets set --project-ref jwkitkfufigldpldqtbq \
  SCOUT_DB_URL=https://jwkitkfufigldpldqtbq.supabase.co \
  SCOUT_DB_SERVICE_ROLE_KEY="<the jwkitkfufigldpldqtbq service-role key — same one in scout/human-bsr.js line 30>" \
  GCP_SA_KEY="$(cat scout-invoker-key.json)" \
  GCP_PROJECT=noodle-worker \
  GCP_REGION=us-central1 \
  CLOUD_RUN_JOB=dovive-scout
```

(`GCP_SA_KEY` needs the key file from the "still NOT applied" section above —
generate it first with `gcloud iam service-accounts keys create`.)

### Bright Data fallback (future, not wired yet)

The user has already added a Bright Data key to the Dovive project's secrets
under the name `BRIGHTDATA` (not `BRIGHTDATA_API_KEY`, which is what getnoodle
uses). Per the task scope this is NOT built now — human-bsr.js/scout-agent.js
still scrape via Playwright only. If/when Amazon blocks the Cloud Run job's
IPs (see risk section below) and Bright Data gets wired into a Dovive edge
function or into the worker directly, read
`Deno.env.get("BRIGHTDATA_API_KEY") ?? Deno.env.get("BRIGHTDATA")` (edge
function) or `process.env.BRIGHTDATA_API_KEY || process.env.BRIGHTDATA`
(worker) so both secret names resolve.

## 5. Wire the Lovable frontend — DONE (frontend side; go-live still pending)

`src/pages/NewAnalysis.tsx` now has a real keyword-submission form. On submit:
1. Inserts a row into `scout_jobs` (status `'queued'`) — this insert is the
   source of truth regardless of whether the trigger below succeeds.
2. Calls `supabase.functions.invoke("trigger-scout-job", { body: { job_id, keyword } })`
   best-effort. If the function isn't deployed yet or its secrets aren't set
   (see step 4 above — still pending), the invoke error is swallowed and the
   UI shows "Queued — cloud trigger pending setup" instead of an error toast,
   since the row is still durably queued and will run once the cutover
   finishes (or a job is picked up by the next manual `execute --wait`).

Progress UI: same card polls `scout_jobs` every 5s (`useScoutJobs` hook) plus
a Supabase Realtime subscription on the table for immediate updates between
polls (mirrors the `usePipelineStatus.ts` polling precedent). Shows
queued/claimed/running/complete/error badges, and for running jobs a
"Phase X/12 — <phase name>" line + progress bar sourced from
`current_phase`/`current_phase_name`/`total_phases` (written by
`run-pipeline.js`'s `updateJobStatus()` hook, already built in the prior
Cloud Run session).

New files:
- `src/types/scoutJobs.ts` — manual `ScoutJobRow`/`ScoutJobInsert` types +
  `SCOUT_PHASE_NAMES` map, since `scout_jobs` isn't in the generated
  `src/integrations/supabase/types.ts` (004 migration unapplied). Delete this
  file and switch to `Tables<"scout_jobs">` once 004 lands and types are
  regenerated.
- `src/hooks/useScoutJobs.ts` — `useSubmitScoutJob()` (insert + best-effort
  invoke), `useScoutJobs()` (polling + realtime list), `useActiveScoutJobs()`
  (filtered to in-flight jobs only, for a compact status strip elsewhere if
  needed).

**Still gated on the user's manual steps** (unchanged from above — this
frontend work does NOT depend on them, it degrades gracefully until they're
done): the table query in `useScoutJobs` treats a missing-relation error
(migration not applied) as an empty list rather than throwing, so the page
renders fine today. Once 004 is applied + edge function secrets are set,
submitting a keyword will actually queue a real Cloud Run execution with zero
frontend changes needed.

**Frontend go-live still requires the user's Lovable Publish** — this commit
lands the code on `main`; it does not deploy the live Lovable app by itself.

## Playwright vs Amazon IP blocks — the known risk

Amazon frequently blocks datacenter/cloud IP ranges (GCP included) for
automated traffic, independent of how good the stealth plugin is. If the test
run in step 3 fails at the scrape step (P1 human-bsr.js) with CAPTCHA pages,
empty result sets, or connection resets where a local run would succeed,
**that is very likely a datacenter-IP block, not a bug** — don't spend time on
more stealth tweaks. The fix in that case is routing the scrape through
**Bright Data** (already used elsewhere in this account —
`~/getnoodle/supabase/functions/bright-data-amazon-product/index.ts` is the
reference implementation) as a residential-proxy layer in front of Playwright,
or swapping human-bsr.js's Amazon fetch for Bright Data's Amazon product API
outright. Not built here — flagged as the next step if/when the Cloud Run
scrape gets blocked.

## What's left for the user

1. **Run `scout/migrations/004_consolidated_cloud.sql`** in the
   `jwkitkfufigldpldqtbq` Supabase dashboard SQL editor — the one hard
   blocker. (Do NOT run `003_scout_jobs_cloud_run.sql` — superseded, targeted
   the dead project.) This migration also RLS-locks `dovive_scout_config` to
   service-role only — see Security section below.
2. **Paste the real Keepa API key** — two places, both currently
   placeholders (see Security section below for why the DB table is no
   longer the answer):
   - `gcloud secrets versions add scout-keepa-key --project=noodle-worker --data-file=-`
     (paste the key, Ctrl-D) — this is what the Cloud Run Job reads.
   - `KEEPA_API_KEY=` line in `scout/.env` (and `~/Downloads/_env`) — for
     local runs.
3. `gcloud iam service-accounts keys create scout-invoker-key.json ...` (see
   above) — this session's sandbox refused to generate it.
4. `npx --yes supabase secrets set` for the 5 edge-function secrets (step 4
   above) — this session's sandbox refused to run `npx supabase` at all.
5. After 1-4: `gcloud run jobs execute dovive-scout --region=us-central1
   --project=noodle-worker --wait` against a real test row for the actual
   end-to-end test — not completed this session.
6. **Rotate the `jwkitkfufigldpldqtbq` service_role key** — it's in git
   history (was hardcoded in 15 files, all fixed this session — see Security
   section) so history rewrite won't fully solve it; rotating the key itself
   in the Supabase dashboard is the real fix. Nothing in code needs to change
   afterward — every read is `process.env.SUPABASE_KEY` (or `DASH_KEY`
   falling back to it) now, so just: rotate in dashboard → update the value
   in `scout/.env`, `~/Downloads/_env`, and the `scout-supabase-key` Secret
   Manager secret (`gcloud secrets versions add scout-supabase-key
   --project=noodle-worker --data-file=-`).
7. Decide/confirm which Lovable UI action should call `trigger-scout-job`
   (small frontend follow-up, not yet built).

## Security hardening pass (2026-08-27)

Audited every credential in `scout/*.js`, `scout/utils/*.js`,
`supabase/functions/`, and `src/` for hardcoded keys, DB-stored secrets, or
keys committed in plaintext. Findings and fixes:

- **`dovive_scout_config` (Keepa key in a DB table, readable via anon key
  before this pass)** — `004_consolidated_cloud.sql` now excludes this table
  from the `anon` RLS policy loop (service-role only). `keepa-phase2.js` and
  `phase0-market-opportunity.js` now read `process.env.KEEPA_API_KEY` first;
  the table read is a legacy fallback that's effectively dead once the env
  var is set (and can't be reached by the anon/frontend key regardless).
  `KEEPA_API_KEY=` placeholder lines added to `scout/.env`,
  `~/Downloads/_env`, and `scout/.env.example`.
- **`jwkitkfufigldpldqtbq` service_role key hardcoded in plaintext across 15
  files**: `scout/human-bsr.js`, `migrate-ocr-to-dash.js`,
  `migrate-keepa-to-dash.js`, `migrate-p1-to-dash.js`,
  `migrate-reviews-to-dash.js`, `phase5-deep-research.js`,
  `phase7-packaging-intelligence.js`, `phase10-competitive-benchmarking.js`,
  `phase11-fda-compliance.js`, `phase8-formula-brief.js`,
  `phase6-market-analysis.js`, `phase6-product-intelligence.js`,
  `run-pipeline.js`, `phase9-formula-qa.js`, `seed-category-analysis.js`
  (this last one's copy of the key even had a typo'd `ref` — harmless bug,
  now moot). All fixed the same way: the hardcoded `DASH_URL`/`DASH_KEY`
  literal pair is now `process.env.DASH_URL || process.env.SUPABASE_URL` /
  `process.env.DASH_KEY || process.env.SUPABASE_KEY`. Since the Scout DB and
  the Lovable/DASH DB were consolidated onto the same project earlier this
  session, `SUPABASE_URL`/`SUPABASE_KEY` (already in `scout/.env`) cover this
  with zero new env vars required; `DASH_URL`/`DASH_KEY` remain available as
  an explicit override if the two ever need to diverge again.
- **Frontend (`src/`)**: only the `anon`/publishable key appears (in
  `src/integrations/supabase/client.ts`, plus two components that duplicate
  the literal instead of importing the constant — `MarketTrendsChat.tsx`,
  `useCompetitiveAnalysis.ts`). The anon key is meant to be public
  (RLS-gated), so this is not a security issue — left as-is, out of scope for
  this pass (would be a small duplication cleanup, not a security fix).
- **`supabase/functions/`**: no hardcoded credentials found (edge functions
  already read `Deno.env.get(...)`).
- **Other env-based secrets already correct**: `XAI_API_KEY`,
  `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `AMAZON_EMAIL`/`AMAZON_PASSWORD`,
  `OPENCLAW_TOKEN`, `MEM0_API_KEY` — all read from `process.env`, never
  hardcoded in any `scout/*.js` file. `JUNGLE_SCOUT_API_KEY` lives in the
  Dovive Supabase project's own function secrets (not touched, not a DB
  table).
- **New: `scout-keepa-key` GCP Secret Manager secret** created in project
  `noodle-worker` (currently holds a placeholder value,
  `REPLACE_ME_WITH_REAL_KEEPA_KEY`), the default compute service account
  granted `roles/secretmanager.secretAccessor` on it, and the `dovive-scout`
  Cloud Run Job updated (`--update-secrets=KEEPA_API_KEY=scout-keepa-key:latest`)
  so `KEEPA_API_KEY` is now injected the same way the other 7 pipeline
  secrets already are. **User action required**: paste the real Keepa key —
  `gcloud secrets versions add scout-keepa-key --project=noodle-worker
  --data-file=-` (paste key, then Ctrl-D), or via the GCP Secret Manager
  console (Secret Manager → `scout-keepa-key` → New Version).
- Net result: after this pass, the only remaining credential exposure is the
  service_role key sitting in **git history** from before this fix — see item
  6 above. Nothing in the *current* tree reads a secret from anywhere but
  `process.env` (worker/local) or GCP Secret Manager (Cloud Run) or
  `Deno.env` (edge functions).
