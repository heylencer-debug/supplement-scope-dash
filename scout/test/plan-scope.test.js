// node --test scout/test   (or: cd scout && npm test)
const test = require('node:test');
const assert = require('node:assert/strict');

const { assembleInventory } = require('../inventory');
const { planScope, freshnessFromEnv, DEFAULT_FRESHNESS_DAYS } = require('../plan-scope');
const { familyNames, stripSession, isFamilyLabel, familyPrefixes } = require('../utils/phase-map');
const { reuseAsinsFromEnv, reuseKeywordsFromEnv } = require('../utils/reuse-asins');
const fx = require('./fixtures/raw-fixtures');

const plan = (raw, opts = {}) => {
  const inv = assembleInventory(raw, { now: fx.NOW });
  return { inv, plan: planScope(inv, { now: fx.NOW, ...opts }) };
};
const decisions = (p) => Object.fromEntries(Object.entries(p.phases).map(([k, v]) => [k, v.decision + (v.source === 'family' ? '/family' : '')]));

test('keyword family: strips #N, adds plural variants and aliases, rejects unrelated labels', () => {
  assert.equal(stripSession('Electrolyte Powder #12'), 'electrolyte powder');
  const names = familyNames('electrolyte powder #6', { aliases: ['hydration mix'] });
  assert.ok(names.includes('electrolyte powder'));
  assert.ok(names.includes('electrolytes powder'));
  assert.ok(names.includes('hydration mix'));
  assert.ok(isFamilyLabel('electrolyte powder #3', names));
  assert.ok(isFamilyLabel('Electrolytes Powder', names));
  assert.ok(!isFamilyLabel('electrolyte packets', names));
  assert.ok(!isFamilyLabel('electrolytes powder packets', names));
  assert.deepEqual(familyNames('magnesium gummies', { autoAliases: false }), ['magnesium gummies']);
  assert.deepEqual(familyPrefixes(familyNames('electrolyte powder')), ['electrolyte']);
});

test('fully-covered keyword: every phase reuses this session and is skipped', () => {
  const { inv, plan: p } = plan(fx.fullyCovered());
  assert.equal(inv.candidates.basis, 'own-session');
  assert.equal(inv.candidates.top40.length, 40);
  assert.equal(inv.phases.P4.top40.have, 40);
  assert.equal(inv.phases.P9.own.staleDays, 3);
  for (const [k, d] of Object.entries(decisions(p))) assert.equal(d, 'reuse', `${k} should be reuse`);
  assert.equal(p.skip.length, 13);
  assert.equal(p.estimate.aiUsd, 0);
  assert.equal(p.recommendation, null);
});

test('empty keyword (creatine gummies): nothing exists, everything scrapes, no candidates', () => {
  const { inv, plan: p } = plan(fx.emptyKeyword());
  assert.equal(inv.candidates.basis, 'none');
  assert.equal(inv.candidates.top40.length, 0);
  assert.equal(inv.phases.P1.top40.of, 0);
  assert.deepEqual(new Set(Object.values(decisions(p))), new Set(['scrape']));
  assert.match(p.phases.P1.reason, /full scrape/);
  assert.match(p.phases.P3.reason, /runs after P1/);
  assert.deepEqual(p.skip, []);
});

test('stale keyword: present but old → refresh, downstream synthesis refreshes too', () => {
  const { plan: p } = plan(fx.stale());
  for (const k of ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P8']) assert.equal(p.phases[k].decision, 'refresh', k);
  for (const k of ['P7', 'P9', 'P10', 'P11', 'P12', 'P13']) assert.equal(p.phases[k].decision, 'refresh', k);
  assert.match(p.phases.P3.reason, /older than 30d/);
  assert.deepEqual(p.skip, []);
  // cost: P4 has a family ledger → a full session's average is quoted
  assert.equal(p.phases.P4.cost.usd, 0.5);
});

test('freshness windows are configurable: a 365-day P4 window turns the stale OCR into reuse', () => {
  const { plan: p } = plan(fx.stale(), { freshnessDays: { P4: 365 } });
  assert.equal(p.phases.P4.decision, 'reuse');
  assert.equal(p.phases.P4.source, 'session');
});

test('fragmented multi-session (new "#6" before P1): candidates from the freshest sibling, P3/P4 reuse by reading', () => {
  const { inv, plan: p } = plan(fx.fragmented());
  assert.equal(inv.targetSession, 'electrolyte powder #6');
  assert.equal(inv.candidates.basis, 'freshest-sibling');
  assert.equal(inv.candidates.source, 'electrolyte powder #5');
  assert.deepEqual(inv.phases.P3.top40.sourceSessions, ['electrolyte powder #4']);
  assert.equal(inv.phases.P3.top40.have, 30);
  assert.equal(inv.phases.P3.top40.own, 0);

  const d = decisions(p);
  assert.equal(d.P1, 'scrape'); // fresh in #5 but P1 cannot be reused across sessions
  assert.match(p.phases.P1.reason, /cannot read across sessions/);
  assert.equal(d.P2, 'refresh'); // Keepa rows are 40 d old > 7 d
  assert.equal(d.P3, 'reuse/family');
  assert.deepEqual(p.phases.P3.reuseSessions, ['electrolyte powder #4']);
  assert.equal(p.phases.P3.reuseAsins.length, 30);
  assert.deepEqual(p.phases.P3.syncScripts, ['migrate-reviews-to-dash.js']);
  assert.equal(d.P4, 'reuse/family');
  assert.equal(d.P6, 'scrape');
  assert.match(p.phases.P6.reason, /family has 40\/40 fresh/);
  for (const k of ['P7', 'P9', 'P10', 'P11', 'P12', 'P13']) assert.equal(d[k], 'scrape', k);
  assert.match(p.phases.P9.reason, /electrolyte powder #3/);
  assert.deepEqual(p.syncOnly, ['P3', 'P4']);
  assert.match(p.recommendation, /electrolyte powder #3/);
});

test('fragmented, rebuilt after P1: only ASINs that landed in THIS session\'s DASH category count for sibling reuse', () => {
  const { inv, plan: p } = plan(fx.fragmented({ afterP1: true }));
  assert.equal(inv.candidates.basis, 'own-session');
  assert.equal(inv.products.B0ELEC0036.inOwnCategory, false);
  assert.equal(inv.products.B0ELEC0001.inOwnCategory, true);
  // OCR exists for all 40 but only 35 are in DASH → 35/40 usable (≥ 75%) → still a family reuse
  assert.equal(p.phases.P4.decision, 'reuse');
  assert.equal(p.phases.P4.source, 'family');
  assert.equal(p.phases.P4.coverage.familyUsable, 35);
  assert.ok(!p.phases.P4.reuseAsins.includes('B0ELEC0036'));
  // Reviews exist for 1–30, all in DASH
  assert.equal(p.phases.P3.coverage.familyUsable, 30);
  assert.equal(p.recommendation, null); // the session is no longer new
});

test('a stricter P4 bar turns the sibling reuse into a top-up that lists the missing ASINs', () => {
  const { plan: p } = plan(fx.fragmented({ afterP1: true }), { rules: { P4: { scope: 'top40', min: 0.95, top10: 1 } } });
  assert.equal(p.phases.P4.decision, 'top-up');
  assert.equal(p.phases.P4.work.asins, 5);
  assert.deepEqual(p.phases.P4.work.list, ['B0ELEC0036', 'B0ELEC0037', 'B0ELEC0038', 'B0ELEC0039', 'B0ELEC0040']);
  assert.equal(p.phases.P4.reuseAsins.length, 35);
});

test('freshnessFromEnv: defaults, JSON env, per-phase env, CLI (CLI wins)', () => {
  assert.deepEqual(freshnessFromEnv({}), DEFAULT_FRESHNESS_DAYS);
  const f = freshnessFromEnv({ SCOUT_FRESHNESS_DAYS: '{"P3":45,"P9":7}', SCOUT_FRESH_P4: '120' }, 'P3=10,p6=1');
  assert.equal(f.P3, 10);
  assert.equal(f.P4, 120);
  assert.equal(f.P6, 1);
  assert.equal(f.P9, 7);
  assert.equal(freshnessFromEnv({ SCOUT_FRESHNESS_DAYS: 'not json' }).P1, 14);
});

test('reuse env helpers: unset means nothing is skipped', () => {
  assert.equal(reuseAsinsFromEnv({}).size, 0);
  assert.deepEqual([...reuseAsinsFromEnv({ SCOUT_REUSE_ASINS: 'A1, A2,,' })], ['A1', 'A2']);
  assert.deepEqual(reuseKeywordsFromEnv({ SCOUT_REUSE_KEYWORDS: 'electrolyte powder #4' }), ['electrolyte powder #4']);
});
