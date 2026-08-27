# Scout pipeline — Cloud Run Job deploy notes

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

## 5. Wire the Lovable frontend

Once the edge function's secrets are set and step 3's test run has confirmed
real data lands correctly, "New Analysis" (or wherever a keyword is
submitted) should POST to `trigger-scout-job` with `{ keyword }` instead of
relying on a human running `node run-pipeline.js` on this Mac. Not built yet.

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
   the dead project.)
2. Re-enter the Keepa API key into `dovive_scout_config` (see SQL above).
3. `gcloud iam service-accounts keys create scout-invoker-key.json ...` (see
   above) — this session's sandbox refused to generate it.
4. `npx --yes supabase secrets set` for the 5 edge-function secrets (step 4
   above) — this session's sandbox refused to run `npx supabase` at all.
5. After 1-4: `gcloud run jobs execute dovive-scout --region=us-central1
   --project=noodle-worker --wait` against a real test row for the actual
   end-to-end test — not completed this session.
6. Rotate the `jwkitkfufigldpldqtbq` service-role key eventually — it's been
   sitting in plaintext in a committed file (`scout/human-bsr.js`) for a
   while, and this session added two more places it's now duplicated
   (`scout/.env`, the `scout-supabase-key` Secret Manager secret). Not urgent,
   but worth doing since it's committed.
7. Decide/confirm which Lovable UI action should call `trigger-scout-job`
   (small frontend follow-up, not yet built).
