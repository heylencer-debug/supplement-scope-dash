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

test('fragmented multi-session (new "#6" before P1): candidates from the freshest sibling; nothing is reused until P1 exists', () => {
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
  // No DASH category for "#6" yet → the verifier cannot be measured, so even a
  // fully covered family is only a top-up here; the after-P1 plan decides.
  assert.equal(d.P3, 'top-up');
  assert.deepEqual(p.phases.P3.reuseSessions, ['electrolyte powder #4']);
  assert.equal(p.phases.P3.reuseAsins.length, 30);
  assert.equal(d.P4, 'top-up');
  assert.match(p.phases.P4.reason, /by ASIN \(any session\)/);
  assert.equal(d.P6, 'scrape');
  assert.match(p.phases.P6.reason, /family has 40\/40 fresh/);
  for (const k of ['P7', 'P9', 'P10', 'P11', 'P12', 'P13']) assert.equal(d[k], 'scrape', k);
  assert.match(p.phases.P9.reason, /electrolyte powder #3/);
  assert.deepEqual(p.syncOnly, []);
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
  assert.equal(p.phases.P4.coverage.reusable, 35);
  assert.equal(p.phases.P4.coverage.projectedBar.pass, true);
  assert.equal(p.phases.P4.projected.p4, 35);
  assert.ok(!p.phases.P4.reuseAsins.includes('B0ELEC0036'));
  // Reviews exist for 1–30, all in DASH → projected p3 30/35 run ASINs ≥ 50%
  assert.equal(p.phases.P3.decision, 'reuse');
  assert.equal(p.phases.P3.coverage.reusable, 30);
  assert.equal(p.phases.P3.projected.p3, 30);
  assert.deepEqual(p.phases.P3.reuseSessions, ['electrolyte powder #4']);
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

// ─── review round 1 ─────────────────────────────────────────────────────────
const { BARS, evaluateBars } = require('../utils/verifier-bars');
const fs = require('fs');
const path = require('path');

test('F1: the verifier bars are pinned (thresholds, boundaries, failure wording)', () => {
  assert.deepEqual({ ...BARS }, {
    P1_MIGRATION_MIN: 0.6, P2_MIN: 0.9, P3_MIN: 0.5, P3_TOP20_MIN: 15, P3_MIN_REVIEWS_TOTAL: 200,
    P4_MIN: 0.8, P4_TOP20_MIN: 15, P6_MIN: 0.9, P8_MIN: 0.9,
  });
  const base = { total: 134, runTotal: 131, runAsinsCount: 131, runAsinsAllCount: 144, p2: 118, p3: 66, p4: 108, p5: 6, p5Target: 8, p5Min: 6,
    p6: 121, p8: 118, p7: true, p9: true, p10: true, p11: true, p12: true, p13: true, top20P3: 0, top20P4: 0, reviewRowsTotal: 0 };
  const ok = (m, k) => evaluateBars({ ...base, ...m }).byPhase[k].pass;
  assert.equal(ok({}, 'P2'), true); assert.equal(ok({ p2: 117 }, 'P2'), false);          // 0.9 × 131 = 117.9
  assert.equal(ok({}, 'P3'), true); assert.equal(ok({ p3: 65 }, 'P3'), false);            // 0.5 × 131 = 65.5
  assert.equal(ok({ p3: 29, top20P3: 15, reviewRowsTotal: 200 }, 'P3'), true);            // top-20 path
  assert.equal(ok({ p3: 29, top20P3: 15, reviewRowsTotal: 199 }, 'P3'), false);           // own raw floor
  assert.equal(ok({ p3: 29, top20P3: 14, reviewRowsTotal: 3320 }, 'P3'), false);
  assert.equal(evaluateBars({ ...base, p3: 29, top20P3: 15, reviewRowsTotal: 3320 }).byPhase.P3.via, 'top20');
  assert.equal(ok({ p4: 107 }, 'P4'), false); assert.equal(ok({ p4: 10, top20P4: 15 }, 'P4'), true);
  assert.equal(ok({ p5: 5 }, 'P5'), false);
  assert.equal(ok({ p6: 120 }, 'P6'), false);                                             // whole category: 0.9 × 134
  assert.equal(ok({ p8: 117 }, 'P8'), false);
  assert.equal(ok({ runAsinsCount: 86 }, 'P1'), false);                                  // < 0.6 × 144
  assert.equal(ok({ p11: false }, 'P11'), false);
  const r = evaluateBars({ ...base, p2: 100, p3: 29, top20P3: 15, reviewRowsTotal: 10 }, [1, 2, 3, 4]);
  assert.deepEqual(r.failures, [
    'P2 100/131 (this run) < 90%',
    'P3 29/131 (this run) < 50% and Top20 15/20 (raw reviews=10, need top20>=15 and raw>=200)',
  ]);
});

test('F1: runFinalVerifier IS the shared helper (the plan and the verifier cannot drift)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'run-pipeline.js'), 'utf8');
  const body = src.slice(src.indexOf('async function runFinalVerifier'), src.indexOf('\n}\n', src.indexOf('async function runFinalVerifier')));
  assert.match(body, /measureVerifierMetrics\(/);
  assert.match(body, /evaluateBars\(m, scopePhases\)/);
  assert.doesNotMatch(body, /\* 0\.9|\* 0\.5|>= 15/, 'no thresholds may live in run-pipeline any more');
  assert.match(src, /resolveRunAsins\(\{ DOVIVE, DASH, keyword: KEYWORD, categoryId \}\)/);
});

test('F1: ashwagandha shape — top-40 looks complete but the verifier passes P3 only via top-20 while P2 re-ranks → not reuse', () => {
  const { plan: p } = plan(fx.ashwagandhaShape());
  assert.equal(p.phases.P2.decision, 'refresh');
  assert.notEqual(p.phases.P3.decision, 'reuse');
  assert.equal(p.phases.P3.decision, 'top-up');
  assert.match(p.phases.P3.reason, /top-20 path/);
  assert.equal(p.phases.P3.coverage.verifierBar.via, 'top20');
  // P4 passes on its coverage path (120/134 ≥ 80%) → ranking-proof → still reuse
  assert.equal(p.phases.P4.decision, 'reuse');
});

test('F1: with Keepa fresh (P2 skipped, ranking frozen) the same top-20 pass is safe; a failing bar never is', () => {
  assert.equal(plan(fx.ashwagandhaShape({ keepaAge: 1 })).plan.phases.P3.decision, 'reuse');
  const failing = plan(fx.ashwagandhaShape({ keepaAge: 1, top20P3: 14 })).plan.phases.P3;
  assert.equal(failing.decision, 'top-up');
  assert.match(failing.reason, /verifier would fail: P3 29\/131/);
  // category phases need their verifier bar too
  const raw = fx.fullyCovered(); raw.verifier.measured.p11 = false;
  const cp = plan(raw).plan.phases.P11;
  assert.equal(cp.decision, 'refresh');
  assert.match(cp.reason, /verifier would fail: P11/);
});

test('F3: products.*_updated_at never counts as freshness — only raw scraped_at / parsed_at / processed_at', () => {
  const { inv, plan: p } = plan(fx.stampedToday());
  const e = inv.products.B0FULL0002.phases;
  assert.equal(e.P3.ownAt, fx.ago(200));
  assert.equal(e.P2.ownAt, fx.ago(200));
  assert.equal(inv.products.B0FULL0001.phases.P2.ownAt, null); // monthly_sales but no Keepa row → unknown
  for (const k of ['P2', 'P3', 'P4']) assert.equal(p.phases[k].decision, 'refresh', k);
  // and the inventory never even selects those columns
  const src = fs.readFileSync(path.join(__dirname, '..', 'inventory.js'), 'utf8');
  const select = src.slice(src.indexOf("dash.from('products')"), src.indexOf(".in('category_id', ids)"));
  assert.doesNotMatch(select, /updated_at/);
  assert.doesNotMatch(src, /\|\|\s*p\.updated_at/);
});

test('F4: reuse list = fresh within the window only; stale-in-session ASINs are re-scraped', () => {
  const { plan: p } = plan(fx.staleOwnReviews());
  const d = p.phases.P3;
  assert.equal(d.decision, 'top-up');
  assert.equal(d.reuseAsins.length, 10);                      // #2 scraped 1–10 five days ago
  assert.ok(d.reuseAsins.every(a => a <= 'B0FULL0010'));
  assert.equal(d.rescrapeAsins.length, 30);                   // 11–40: only this session's 60-day-old copy
  assert.ok(!d.rescrapeAsins.some(a => d.reuseAsins.includes(a)));
  assert.deepEqual(d.reuseSessions, ['biotin gummies #2']);
});

test('F4: reviews migrate takes the fresher sibling for planned ASINs and keeps a fresher own copy', () => {
  const { siblingReviewNeed, mergeSiblingReviews } = require('../utils/reuse-asins');
  const byAsin = {
    A: [{ asin: 'A', keyword: 'k', scraped_at: '2026-07-01' }],      // stale own, planned
    B: [{ asin: 'B', keyword: 'k', scraped_at: '2026-09-20' }],      // fresh own
  };
  const need = siblingReviewNeed(['A', 'B', 'C'], byAsin, new Set(['A']));
  assert.deepEqual(need, ['A', 'C']);
  const sibling = [
    { asin: 'A', keyword: 'k #2', scraped_at: '2026-09-20' }, { asin: 'A', keyword: 'k #2', scraped_at: '2026-09-20' },
    { asin: 'A', keyword: 'k #3', scraped_at: '2026-09-01' },
    { asin: 'B', keyword: 'k #2', scraped_at: '2026-09-10' },
    { asin: 'C', keyword: 'k #3', scraped_at: '2026-09-15' },
  ];
  const n = mergeSiblingReviews(byAsin, sibling);
  assert.equal(n, 2);
  assert.deepEqual(byAsin.A.map(r => r.keyword), ['k #2', 'k #2']); // only the single freshest sibling
  assert.deepEqual(byAsin.B.map(r => r.keyword), ['k']);            // own is fresher → kept
  assert.deepEqual(byAsin.C.map(r => r.keyword), ['k #3']);
});
