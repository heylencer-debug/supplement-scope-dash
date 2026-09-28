'use strict';
// utils/rnd-client.js — read-only client for the RnD evidence database.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRndClient, rndClientReason, readOnly } = require('../utils/rnd-client');

const ENV = { RND_SUPABASE_URL: 'https://rnd.example.supabase.co', RND_SUPABASE_ANON_KEY: 'anon-key-value' };

function fakeCreateClient() {
  const seen = [];
  const create = (url, key, opts) => {
    seen.push({ url, key, opts });
    const writes = [];
    const qb = (table) => ({
      select: (...a) => ({ table, select: a }),
      insert: () => writes.push(['insert', table]),
      update: () => writes.push(['update', table]),
      upsert: () => writes.push(['upsert', table]),
      delete: () => writes.push(['delete', table]),
    });
    return { from: qb, rpc: () => writes.push(['rpc']), writes };
  };
  return { create, seen };
}

test('rndClientReason names each missing variable in one line, never a value', () => {
  assert.equal(rndClientReason(ENV), null);
  assert.equal(rndClientReason({}), 'RnD client unavailable: RND_SUPABASE_URL and RND_SUPABASE_ANON_KEY are not set');
  assert.equal(rndClientReason({ RND_SUPABASE_URL: 'x' }), 'RnD client unavailable: RND_SUPABASE_ANON_KEY is not set');
  assert.equal(rndClientReason({ RND_SUPABASE_URL: '  ', RND_SUPABASE_ANON_KEY: 'k' }), 'RnD client unavailable: RND_SUPABASE_URL is not set');
  const r = rndClientReason({ RND_SUPABASE_URL: 'https://secret-host' });
  assert.doesNotMatch(r, /secret-host/);
  assert.doesNotMatch(r, /\n/);
});

test('createRndClient returns null when either variable is missing', () => {
  const f = fakeCreateClient();
  assert.equal(createRndClient({}, { createClient: f.create }), null);
  assert.equal(createRndClient({ RND_SUPABASE_URL: ENV.RND_SUPABASE_URL }, { createClient: f.create }), null);
  assert.equal(createRndClient({ RND_SUPABASE_ANON_KEY: 'k' }, { createClient: f.create }), null);
  assert.equal(f.seen.length, 0);
});

test('createRndClient builds from the RnD env with no persisted session', () => {
  const f = fakeCreateClient();
  const c = createRndClient(ENV, { createClient: f.create });
  assert.ok(c && c.readOnly);
  assert.equal(f.seen.length, 1);
  assert.equal(f.seen[0].url, ENV.RND_SUPABASE_URL);
  assert.equal(f.seen[0].key, ENV.RND_SUPABASE_ANON_KEY);
  assert.deepEqual(f.seen[0].opts.auth, { persistSession: false, autoRefreshToken: false });
  assert.deepEqual(c.from('v_formula_roster').select('asin'), { table: 'v_formula_roster', select: ['asin'] });
});

test('the RnD client can only read: no insert/update/upsert/delete/rpc', () => {
  const f = fakeCreateClient();
  const c = createRndClient(ENV, { createClient: f.create });
  const qb = c.from('v_formula_products');
  for (const m of ['insert', 'update', 'upsert', 'delete']) assert.equal(qb[m], undefined, `${m} is reachable`);
  assert.equal(c.rpc, undefined);
  assert.deepEqual(Object.keys(qb), ['select']);
  assert.deepEqual(Object.keys(readOnly({ from: () => ({}) })).sort(), ['from', 'readOnly']);
});

test('a malformed RND_SUPABASE_URL is a reason, and createRndClient returns null instead of throwing', () => {
  const bad = { RND_SUPABASE_URL: 'rnd.example.supabase.co', RND_SUPABASE_ANON_KEY: 'k' };
  assert.equal(rndClientReason(bad), 'RnD client unavailable: RND_SUPABASE_URL is not a valid http(s) URL');
  assert.doesNotMatch(rndClientReason(bad), /rnd\.example/);
  // the real supabase-js createClient throws on this URL; the RnD client must not
  assert.doesNotThrow(() => createRndClient(bad));
  assert.equal(createRndClient(bad), null);
  // any other construction failure also yields null, never an exception
  const boom = () => { throw new Error('Invalid supabaseUrl'); };
  assert.equal(createRndClient(ENV, { createClient: boom }), null);
});

test('inventory / run-pipeline: a malformed RnD URL cannot fail READ-FIRST (client null, reason printed)', async () => {
  const { fetchRndCoverage, formatRndCoverage } = require('../inventory');
  const bad = { RND_SUPABASE_URL: 'not a url', RND_SUPABASE_ANON_KEY: 'k' };
  const cov = await fetchRndCoverage(createRndClient(bad), ['B01'], { reason: rndClientReason(bad) });
  assert.deepEqual(cov, { available: false, reason: 'RnD client unavailable: RND_SUPABASE_URL is not a valid http(s) URL' });
  assert.match(formatRndCoverage(cov), /not checked — RnD client unavailable: RND_SUPABASE_URL is not a valid http\(s\) URL$/);
});
