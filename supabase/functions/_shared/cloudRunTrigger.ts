/**
 * cloudRunTrigger — best-effort, non-blocking trigger for the Cloud Run Job
 * that runs the Scout pipeline worker (scout/cloud-worker.js + Dockerfile).
 *
 * Cloned from ~/getnoodle/supabase/functions/_shared/cloudRunTrigger.ts
 * (the noodle-render Cloud Run migration) — same OAuth-from-service-account
 * pattern, adapted to the Dovive scout_jobs queue instead of render_jobs.
 *
 * On a newly-enqueued scout_jobs row we ask Cloud Run to execute the
 * `dovive-scout` Job with an env override `SCOUT_JOB_ID=<jobId>` so that one
 * execution processes exactly that row.
 *
 * IMPORTANT — this is a SAFETY-NET trigger, not a hard dependency:
 *   - It must NEVER throw into the caller. All failures are caught + logged
 *     and the function resolves to `{ ok:false }`. The job row is already
 *     queued in scout_jobs, so a scheduled sweep (or manual `gcloud run jobs
 *     execute`) can still process it if the trigger itself fails.
 *
 * Auth: mint a Google OAuth access token from a service-account key
 * (GCP_SA_KEY Supabase secret, JSON key for a scout-invoker@ service account
 * with roles/run.invoker on the dovive-scout Job). Build a signed JWT (RS256),
 * exchange it at oauth2.googleapis.com/token for a bearer token scoped to
 * cloud-platform, then POST the Jobs v2 :run endpoint.
 */

interface SaKey {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

function b64url(input: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array;
  if (typeof input === "string") {
    bytes = new TextEncoder().encode(input);
  } else if (input instanceof Uint8Array) {
    bytes = input;
  } else {
    bytes = new Uint8Array(input);
  }
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Convert a PEM PKCS#8 private key into a CryptoKey for RS256 signing. */
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return await crypto.subtle.importKey(
    "pkcs8",
    der.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

/** Mint a short-lived Google OAuth access token from the SA key. */
async function mintAccessToken(sa: SaKey): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = sa.token_uri || "https://oauth2.googleapis.com/token";
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${
    b64url(JSON.stringify(claims))
  }`;
  const key = await importPrivateKey(sa.private_key);
  const sig = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    new TextEncoder().encode(signingInput),
  );
  const assertion = `${signingInput}.${b64url(sig)}`;

  const resp = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!resp.ok) {
    throw new Error(`token exchange ${resp.status}: ${await resp.text()}`);
  }
  const tok = await resp.json() as { access_token?: string };
  if (!tok.access_token) throw new Error("no access_token in response");
  return tok.access_token;
}

/**
 * Fire a Cloud Run Job execution for `scoutJobId` (a scout_jobs.id).
 * Best-effort: never throws. Returns { ok, execution? } for logging.
 *
 * Reads GCP_SA_KEY, GCP_PROJECT, GCP_REGION, CLOUD_RUN_JOB from env
 * (Supabase secrets — see DEPLOY_NOTES.md for the exact `secrets set` calls).
 */
export async function triggerCloudRunScoutJob(
  scoutJobId: string,
): Promise<{ ok: boolean; execution?: string; error?: string }> {
  try {
    const rawKey = Deno.env.get("GCP_SA_KEY") || "";
    const project = Deno.env.get("GCP_PROJECT") || "";
    const region = Deno.env.get("GCP_REGION") || "";
    const jobName = Deno.env.get("CLOUD_RUN_JOB") || "";
    if (!rawKey || !project || !region || !jobName) {
      return { ok: false, error: "cloud-run env not configured" };
    }

    const sa = JSON.parse(rawKey) as SaKey;
    const accessToken = await mintAccessToken(sa);

    const url =
      `https://run.googleapis.com/v2/projects/${project}/locations/${region}/jobs/${jobName}:run`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        overrides: {
          containerOverrides: [
            { env: [{ name: "SCOUT_JOB_ID", value: scoutJobId }] },
          ],
        },
      }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      console.error(
        `[cloudRunTrigger] :run failed ${resp.status} for scout job ${scoutJobId}: ${body}`,
      );
      return { ok: false, error: `run ${resp.status}` };
    }
    const lro = await resp.json().catch(() => ({})) as {
      name?: string;
      metadata?: { name?: string };
    };
    const execution = lro?.metadata?.name || lro?.name;
    console.log(
      `[cloudRunTrigger] fired Cloud Run execution for scout job ${scoutJobId}${
        execution ? ` (${execution})` : ""
      }`,
    );
    return { ok: true, execution };
  } catch (e) {
    console.error(
      `[cloudRunTrigger] best-effort trigger errored for scout job ${scoutJobId}: ${
        (e as Error).message
      }`,
    );
    return { ok: false, error: (e as Error).message };
  }
}
