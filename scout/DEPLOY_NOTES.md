# Scout pipeline — Cloud Run Job deploy notes

## ⚠️ BLOCKER FOUND DURING TESTING: `fhfqjcvwcxizbioftvdw.supabase.co` does not resolve

Ran `dovive-scout` twice against the live Cloud Run Job (see "Current state"
below for what was built). Both runs failed identically:

```
[cloud-worker] DEBUG_NET: fetch failed: fetch failed cause=getaddrinfo ENOTFOUND fhfqjcvwcxizbioftvdw.supabase.co
```

Confirmed this is NOT a Cloud Run networking/egress problem (noodle-render's
Job in the same project, same region, same "no VPC connector" config reaches
external hosts fine) — it's that the hostname itself has **no DNS record**:

```bash
curl -s "https://dns.google/resolve?name=fhfqjcvwcxizbioftvdw.supabase.co&type=A"
# {"Status":3,...}   <- Status 3 = NXDOMAIN, from Google's own authoritative resolver
curl -s "https://dns.google/resolve?name=jwkitkfufigldpldqtbq.supabase.co&type=A"
# {"Status":0,"Answer":[...two Cloudflare IPs...]}   <- this one resolves fine
```

(A plain local `dig`/`nslookup` on this Mac returns `172.16.0.1` for the
`fhfqjcvwcxizbioftvdw` name instead of NXDOMAIN — that's a resolver on this
network silently answering failed lookups with a private-range placeholder,
which is misleading. The `dns.google` HTTPS lookup above bypasses that and is
the ground truth: genuine NXDOMAIN.)

**This means the Scout pipeline's `SUPABASE_URL` (`scout/.env`,
`scout/.env.example`, and everywhere `run-pipeline.js`/`cloud-worker.js`
default to) points at a Supabase project that is currently unreachable by
hostname** — paused, deleted, or the ref changed. This is not something I can
fix from here (no way to un-pause/recreate a Supabase project via CLI/gcloud).
Everything downstream of this — running `migrations/003_scout_jobs_cloud_run.sql`,
the SQL dashboard for that project, the pipeline writing to that DB at all —
is blocked until this project is confirmed reachable again (check the
Supabase dashboard project list for whether `fhfqjcvwcxizbioftvdw` is paused/
restorable, or whether the Scout pipeline should now point at a different
project ref).

**Everything else built this session (image, Cloud Run Job, secrets, edge
function code) is independent of this and does not need to be redone once the
DB is reachable** — just re-run `gcloud run jobs execute dovive-scout ...`
after the migration is applied.

## Current state (2026-08-27, this session)

DONE (built/deployed directly by Scout in this session):
- Artifact Registry repo `dovive-scout` created (`us-central1`, project `noodle-worker`).
- Image built + pushed: `us-central1-docker.pkg.dev/noodle-worker/dovive-scout/worker:latest`
  (via `gcloud builds submit` — no local Docker needed/available).
- 8 pipeline secrets created in Secret Manager (`scout-supabase-key`,
  `scout-openrouter-key`, `scout-xai-key`, `scout-openai-key`, `scout-apify-key`,
  `scout-openclaw-token`, `scout-amazon-email`, `scout-amazon-password`), values
  pulled from `~/Downloads/_env`, and the default compute service account
  (`557092350372-compute@developer.gserviceaccount.com`) granted
  `roles/secretmanager.secretAccessor` on each.
- Cloud Run Job `dovive-scout` created in `us-central1` (4Gi/2vCPU, task-timeout
  3600s, max-retries 1, tasks 1) wired to the image + secrets + plain env vars
  (`SUPABASE_URL`, `OPENCLAW_GATEWAY`, `TELEGRAM_CHAT_ID`, `TELEGRAM_BOT_TOKEN`).
- `run-pipeline.js` and `cloud-worker.js` written/edited (see below) and
  committed to the repo.
- `trigger-scout-job` edge function + `_shared/cloudRunTrigger.ts` written,
  adapted to read `SCOUT_DB_URL`/`SCOUT_DB_SERVICE_ROLE_KEY` (see note in that
  file — the Scout pipeline DB is a different Supabase project than whichever
  project hosts the function).

NOT DONE — blocked or intentionally left for the user:
- **`scout_jobs` table + `claim_scout_job()` function have NOT been created.**
  This is DDL and per this repo's standing rule needs the Supabase dashboard
  SQL editor (service-role JWT only works for DML). Run
  `scout/migrations/003_scout_jobs_cloud_run.sql` in the Dovive Scout project
  (`fhfqjcvwcxizbioftvdw`) dashboard SQL editor. **This blocks the end-to-end
  test in step 3 below** — the Cloud Run Job will error at
  `claim_scout_job()` until this table/function exists.
- **`npx supabase functions deploy` / `secrets set` were NOT run from this
  session**, despite being told CLI access was unblocked via
  `SUPABASE_ACCESS_TOKEN` in `~/Downloads/_env`. Every attempt (`projects
  list`, `functions deploy`) was refused by this session's own tool-permission
  classifier as soon as it saw the access token being read + piped into
  `npx supabase`, independent of the coordinator's instruction. This is a
  local sandbox policy, not a missing-access problem — the user should run
  the exact commands in step 4 below themselves (or grant that Bash pattern
  explicit permission and re-run Scout).
- End-to-end test execution (step 3) not yet run — needs the DDL above first.

Mirrors the noodle-render-worker cutover (`~/noodle-render-worker/README.md`).
Scout keeps Playwright scraping — this is the SAME pipeline, just running
inside a Cloud Run Job container instead of on this Mac.

## Where it runs

| | |
|---|---|
| GCP project | `noodle-worker` (reused — billing/SA already set up; no new project needed) |
| Region | `us-central1` |
| Artifact Registry repo | `dovive-scout` (created 2026-08-27) |
| Cloud Run Job | `dovive-scout` |
| Image | `us-central1-docker.pkg.dev/noodle-worker/dovive-scout/worker:latest` |
| Queue table | `scout_jobs` in the Dovive Scout Supabase project (`fhfqjcvwcxizbioftvdw`) — see `migrations/003_scout_jobs_cloud_run.sql` |

```
trigger-scout-job (edge fn, Dovive Supabase project)
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

Image is live at `us-central1-docker.pkg.dev/noodle-worker/dovive-scout/worker:latest`.
Rebuild after any pipeline code change with:

```bash
export PATH="$HOME/google-cloud-sdk/bin:$PATH"
cd /Users/doncarlos/supplement-scope-dash/scout
gcloud builds submit --tag us-central1-docker.pkg.dev/noodle-worker/dovive-scout/worker:latest \
  --project noodle-worker --region us-central1 --timeout=1200s
gcloud run jobs update dovive-scout \
  --image us-central1-docker.pkg.dev/noodle-worker/dovive-scout/worker:latest \
  --region us-central1 --project noodle-worker
```

## 2. Cloud Run Job + secrets — DONE

The 8 pipeline secrets exist in Secret Manager (`scout-supabase-key`,
`scout-openrouter-key`, `scout-xai-key`, `scout-openai-key`, `scout-apify-key`,
`scout-openclaw-token`, `scout-amazon-email`, `scout-amazon-password`), the
default compute SA has `secretAccessor` on all 8, and the `dovive-scout` Cloud
Run Job is created (4Gi/2vCPU, task-timeout 3600s, max-retries 1) with
`--set-env-vars SUPABASE_URL=https://fhfqjcvwcxizbioftvdw.supabase.co,OPENCLAW_GATEWAY=...,TELEGRAM_CHAT_ID=...,TELEGRAM_BOT_TOKEN=...`
and `--set-secrets` wired to those 8 secrets. Nothing further needed here
unless a credential rotates — then re-run `gcloud secrets versions add
<secret> --project noodle-worker --data-file=-` with the new value (the job
already references `:latest`).

## 3. Run once against a real / test job — BLOCKED on the DDL in step 0

The Cloud Run Job will run and immediately error out of `claim_scout_job()`
until `scout_jobs`/`claim_scout_job()` exist (they don't yet — see "NOT DONE"
above). Once that migration is run:

```bash
export PATH="$HOME/google-cloud-sdk/bin:$PATH"
gcloud run jobs execute dovive-scout --region us-central1 --project noodle-worker --wait
```

This claims the oldest `queued` row in `scout_jobs` (or does nothing and exits
0 if there isn't one — insert a test row first via the Supabase SQL editor or
`trigger-scout-job`).

To target one specific row:

```bash
gcloud run jobs execute dovive-scout --region us-central1 --project noodle-worker \
  --update-env-vars SCOUT_JOB_ID=<uuid> --wait
```

Watch logs:

```bash
gcloud beta run jobs executions logs read <execution-name> --region us-central1 --project noodle-worker
```

## 4. Deploy the `trigger-scout-job` edge function (Dovive Lovable Supabase project)

**Not done from this session, even though CLI access exists.** The Dovive
Lovable project (`jwkitkfufigldpldqtbq`) IS reachable via `npx supabase` +
`SUPABASE_ACCESS_TOKEN` (from `~/Downloads/_env`) — but this session's own
Bash tool-permission classifier refused every attempt to run `npx supabase`
once it saw the access token being read and passed to it (`projects list`,
`functions deploy` — both refused, independent of project or subcommand).
That is a local sandbox policy on this session, not a real access gap. Run
these yourself:

```bash
export SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN' ~/Downloads/_env | cut -d= -f2)
cd /Users/doncarlos/supplement-scope-dash
npx --yes supabase functions deploy trigger-scout-job --project-ref jwkitkfufigldpldqtbq

# Secrets the function needs — SCOUT_DB_URL/SCOUT_DB_SERVICE_ROLE_KEY are the
# Scout pipeline DB creds (fhfqjcvwcxizbioftvdw, from scout/.env), deliberately
# NOT the auto-injected SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY (those point at
# jwkitkfufigldpldqtbq, which does not have scout_jobs — see index.ts header):
npx --yes supabase secrets set --project-ref jwkitkfufigldpldqtbq \
  SCOUT_DB_URL=https://fhfqjcvwcxizbioftvdw.supabase.co \
  SCOUT_DB_SERVICE_ROLE_KEY="<scout/.env SUPABASE_KEY>" \
  GCP_SA_KEY="$(cat /path/to/scout-invoker-key.json)" \
  GCP_PROJECT=noodle-worker \
  GCP_REGION=us-central1 \
  CLOUD_RUN_JOB=dovive-scout
```

All other Dovive secrets (Anthropic, Keepa, JungleScout, OpenRouter, XAI,
service-role) are already present on the `jwkitkfufigldpldqtbq` project per
the coordinator's confirmation — only the four `GCP_*`/`SCOUT_DB_*` ones above
are new and specific to this Cloud Run trigger.

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

### Service account for GCP_SA_KEY

Create a dedicated invoker SA (don't reuse a broad one):

```bash
export PATH="$HOME/google-cloud-sdk/bin:$PATH"
gcloud iam service-accounts create scout-invoker --project noodle-worker \
  --display-name "Dovive Scout Cloud Run invoker (edge function)"
gcloud run jobs add-iam-policy-binding dovive-scout \
  --region us-central1 --project noodle-worker \
  --member="serviceAccount:scout-invoker@noodle-worker.iam.gserviceaccount.com" \
  --role="roles/run.invoker"
gcloud iam service-accounts keys create scout-invoker-key.json \
  --iam-account=scout-invoker@noodle-worker.iam.gserviceaccount.com --project noodle-worker
```

Then base64/raw-paste the contents of `scout-invoker-key.json` into
`GCP_SA_KEY` above and delete the local key file.

## 5. Wire the Lovable frontend

Once the edge function is deployed, "New Analysis" (or wherever a keyword is
submitted) should POST to `trigger-scout-job` with `{ keyword }` instead of
relying on a human running `node run-pipeline.js` on this Mac. That frontend
change is NOT included here — it's a small follow-up once the edge function
is live and step 3's test run has been confirmed to write real data.

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

1. **Run `migrations/003_scout_jobs_cloud_run.sql`** in the Dovive Scout
   Supabase dashboard SQL editor (`fhfqjcvwcxizbioftvdw`) — creates
   `scout_jobs` + `claim_scout_job()`. This is the one hard blocker; nothing
   downstream can be tested until it exists.
2. **Run the `npx supabase functions deploy` + `secrets set` commands in
   step 4** — CLI access exists (`SUPABASE_ACCESS_TOKEN` in `~/Downloads/_env`)
   but this session's sandbox refused to run them itself.
3. Create the `scout-invoker` GCP service account + `GCP_SA_KEY` per step 4's
   sub-section, for the edge function's Cloud Run auth.
4. After 1-3: `gcloud run jobs execute dovive-scout --region us-central1
   --project noodle-worker --wait` against a real test row (insert one via the
   SQL editor, e.g. `insert into scout_jobs (keyword) values ('test keyword');`)
   to do the actual end-to-end test — not run yet in this session.
5. Decide/confirm which Lovable UI action should call `trigger-scout-job`
   (small frontend follow-up, not yet built).
