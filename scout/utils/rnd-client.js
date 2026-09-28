/**
 * utils/rnd-client.js — READ-ONLY client for the RnD evidence database.
 *
 * Built from RND_SUPABASE_URL + RND_SUPABASE_ANON_KEY (the anon key: RnD's
 * RLS grants anon SELECT only). Used by utils/evidence-source.js when
 * SCOUT_EVIDENCE_SOURCE=rnd, and by inventory.js for its advisory "RnD
 * coverage" section. NEVER used for writes: the object handed out exposes
 * `.from(table).select(...)` and nothing else — insert / update / upsert /
 * delete / rpc are not reachable through it, so a write can not be issued
 * even by mistake.
 *
 * Missing or malformed configuration is not an error here: createRndClient()
 * returns null (it never throws) and rndClientReason() says why in one line. Callers decide what that means
 * (evidence-source throws in rnd mode; inventory prints the reason).
 * Env VALUES are never logged — only which variable is missing.
 */

'use strict';

const REQUIRED = ['RND_SUPABASE_URL', 'RND_SUPABASE_ANON_KEY'];

/** True when `v` parses as an http(s) URL — the check supabase-js createClient throws on. */
function isHttpUrl(v) {
  try {
    const u = new URL(String(v).trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * One-line reason the RnD client can not be built, or null when it can.
 * A set-but-malformed RND_SUPABASE_URL is a reason too: supabase-js
 * createClient THROWS on it, and the inventory / READ-FIRST plan must never
 * fail because of the advisory RnD line. The value itself is never echoed.
 */
function rndClientReason(env = process.env) {
  const missing = REQUIRED.filter((k) => !env || !String(env[k] || '').trim());
  if (missing.length) return `RnD client unavailable: ${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} not set`;
  if (!isHttpUrl(env.RND_SUPABASE_URL)) return 'RnD client unavailable: RND_SUPABASE_URL is not a valid http(s) URL';
  return null;
}

/**
 * Wrap a supabase-js client so only reads are possible:
 * `from(t)` → `{ select(...) }`. Anything else is simply absent.
 */
function readOnly(client) {
  return {
    readOnly: true,
    from(table) {
      const qb = client.from(table);
      return { select: (...args) => qb.select(...args) };
    },
  };
}

/**
 * @param {object} [env=process.env]
 * @param {object} [deps]  { createClient } — injectable for tests
 * @returns {{ readOnly: true, from(table: string): { select(...args): any } } | null}
 */
function createRndClient(env = process.env, deps = {}) {
  if (rndClientReason(env)) return null;
  const createClient = deps.createClient || require('@supabase/supabase-js').createClient;
  let client;
  try {
    client = createClient(String(env.RND_SUPABASE_URL).trim(), String(env.RND_SUPABASE_ANON_KEY).trim(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  } catch {
    // Never throws: callers (inventory, run-pipeline's READ-FIRST plan, the
    // evidence layer) treat null as "unavailable" — the evidence layer then
    // refuses rnd mode, the inventory prints the reason.
    return null;
  }
  return readOnly(client);
}

module.exports = { createRndClient, rndClientReason, readOnly, isHttpUrl, REQUIRED };
