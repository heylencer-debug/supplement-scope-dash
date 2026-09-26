// P7b pure core: inventory, image selection, validation, roll-up,
// experienced-vs-claimed, resume keys, cost estimate, prompt block.
// No network, no credits, no database.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const MA = require('../utils/marketing-assets');
const { PRICING } = require('../utils/ai-usage');

const IMG = (id, size = '_AC_SL1500_') => `https://m.media-amazon.com/images/I/${id}.${size}.jpg`;
const APLUS = (uuid) => `https://m.media-amazon.com/images/S/aplus-media-library-service-media/${uuid}.__CR0,0,1464,600_PT0_SX1464_V1___.jpg`;
const U = (n) => `0000000${n}-aaaa-bbbb-cccc-dddddddddddd`.slice(-36).replace(/^.{8}/, `0000000${n}`.slice(-8));

// Real-shaped rows (field names verified read-only against the live DB).
const product = {
  id: 'p1', asin: 'B0TEST0001', title: 'Magnesium Glycinate Gummies', brand: 'Acme', bsr_current: 17,
  main_image_url: IMG('61MAIN', '_AC_SL1000_'),
  image_urls: [IMG('61MAIN'), IMG('51GAL2'), IMG('51GAL3'), IMG('51GAL2', '_AC_SX300_')],
  has_a_plus_content: null, video_urls: [], video_count: null,
  feature_bullets_text: 'SUPPORTS RESTFUL SLEEP: wake up refreshed.\nNON-GMO and gluten free.\nAbsorbs better than tablets.',
};
const researchOwn = {
  asin: 'B0TEST0001', keyword: 'magnesium gummies', scraped_at: '2026-09-01T00:00:00Z',
  images: [IMG('61MAIN')], main_image: IMG('61MAIN'), plus: true,
  pd: [{ url: APLUS(U(1)), type: 'image' }, { url: APLUS(U(2)), type: 'image' }, { url: 'https://m.media-amazon.com/images/S/vse-vms-transcoding-artifact-us-east-1-prod/x/default.jobtemplate.hls.m3u8', type: 'video' }],
  ftb: [APLUS(U(3))],
  vids: ['https://www.amazon.com/vdp/08f5590ad3b7426d8bc8c363f0e7f299'], vcount: 1, rvids: ['https://x/review.m3u8'],
};
const researchOther = { ...researchOwn, keyword: 'magnesium gummies #2', scraped_at: '2026-09-20T00:00:00Z', pd: [] };

test('pickResearchRow prefers this keyword over a fresher sibling row', () => {
  assert.equal(MA.pickResearchRow([researchOther, researchOwn], 'Magnesium Gummies').keyword, 'magnesium gummies');
  assert.equal(MA.pickResearchRow([researchOther], 'magnesium gummies').keyword, 'magnesium gummies #2');
  assert.equal(MA.pickResearchRow([], 'x'), null);
});

test('buildInventory: gallery deduped by image id, A+ / brand / videos read from the Bright Data payload', () => {
  const inv = MA.buildInventory(product, researchOwn);
  assert.deepEqual(inv.gallery.map((g) => g.label), ['main', 'gallery-2', 'gallery-3']);
  assert.equal(inv.gallery[0].url, product.main_image_url);
  assert.equal(inv.a_plus.available, true);
  assert.equal(inv.a_plus.source, 'dovive_research.raw_json.plus_content');
  assert.deepEqual(inv.a_plus.images.map((i) => i.label), ['a+-1', 'a+-2']);
  assert.equal(inv.a_plus.videos.length, 1, 'the .m3u8 A+ entry is a video stream, not an image');
  assert.deepEqual(inv.brand_story.map((i) => i.label), ['brand-1']);
  assert.equal(inv.videos.listing_count, 1);
  assert.equal(inv.videos.a_plus_streams, 1);
  assert.equal(inv.videos.review_videos, 1);
  assert.equal(inv.videos.analyzed, 0);
  assert.match(inv.videos.note, /no frame-extraction or transcript path/);
});

test('buildInventory: no research row → legacy A+ flag, nothing invented', () => {
  const inv = MA.buildInventory({ ...product, has_a_plus_content: true }, null);
  assert.equal(inv.a_plus.available, true);
  assert.equal(inv.a_plus.source, 'products.has_a_plus_content (legacy)');
  assert.equal(inv.a_plus.images.length, 0);
  assert.equal(inv.videos.listing_count, 0);
  const none = MA.buildInventory({ asin: 'B0X', image_urls: null }, null);
  assert.equal(none.gallery.length, 0);
  assert.equal(none.a_plus.available, null, 'unknown stays unknown');
});

test('selectImagesForCall reserves A+ slots, gives unused slots back, never exceeds the cap', () => {
  const inv = MA.buildInventory({ ...product, image_urls: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map((x) => IMG(`71${x}`)) }, researchOwn);
  const sel = MA.selectImagesForCall(inv, { maxImages: 8, maxAplus: 2 });
  assert.equal(sel.length, 8);
  assert.deepEqual(sel.slice(-2).map((i) => i.label), ['a+-1', 'a+-2']);
  const noAplus = MA.buildInventory({ ...product, image_urls: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map((x) => IMG(`71${x}`)) }, null);
  assert.equal(MA.selectImagesForCall(noAplus, { maxImages: 8, maxAplus: 2 }).filter((i) => i.kind === 'gallery').length, 8);
  const shortGallery = MA.buildInventory(product, researchOwn); // 3 gallery + 2 A+ + 1 brand
  assert.deepEqual(MA.selectImagesForCall(shortGallery, { maxImages: 8, maxAplus: 2 }).map((i) => i.label), ['main', 'gallery-2', 'gallery-3', 'a+-1', 'a+-2', 'brand-1']);
  assert.equal(MA.selectImagesForCall(shortGallery, { maxImages: 2, maxAplus: 2 }).length, 2);
});

test('selectImagesForCall prefers the LAST A+ modules (comparison tables sit late) and gives brand story one slot when A+ has ≤ 1 image', () => {
  const nine = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map((x) => IMG(`71${x}`));
  const manyAplus = { ...researchOwn, pd: [1, 2, 3, 4, 5].map((k) => ({ url: APLUS(U(k)), type: 'image' })), ftb: [APLUS(U(9))] };
  const sel = MA.selectImagesForCall(MA.buildInventory({ ...product, image_urls: nine }, manyAplus), { maxImages: 8, maxAplus: 2 });
  assert.deepEqual(sel.map((i) => i.label), ['main', 'gallery-2', 'gallery-3', 'gallery-4', 'gallery-5', 'gallery-6', 'a+-4', 'a+-5']);
  const oneAplus = { ...researchOwn, pd: [{ url: APLUS(U(1)), type: 'image' }], ftb: [APLUS(U(8)), APLUS(U(9))] };
  const sel1 = MA.selectImagesForCall(MA.buildInventory({ ...product, image_urls: nine }, oneAplus), { maxImages: 8, maxAplus: 2 });
  assert.deepEqual(sel1.slice(-2).map((i) => i.label), ['a+-1', 'brand-1']);
  const noAplus = { ...researchOwn, pd: [], ftb: [APLUS(U(8)), APLUS(U(9))] };
  const sel0 = MA.selectImagesForCall(MA.buildInventory({ ...product, image_urls: nine }, noAplus), { maxImages: 8, maxAplus: 2 });
  assert.deepEqual(sel0.map((i) => i.kind).filter((k) => k !== 'gallery'), ['brand'], 'one brand slot; the other goes back to the gallery');
  assert.equal(sel0.length, 8);
});

test('validateAnalysis drops every claim without a seen_on label or verbatim evidence, and counts it', () => {
  const labels = ['main', 'gallery-2', 'a+-1'];
  const out = MA.validateAnalysis({
    target_audience: { who: 'Adults with poor sleep', cues: [] },
    main_promise: { text: 'Deep, restful sleep', where_seen: 'gallery-9' },
    recurring_messages: [
      { message: 'Supports restful sleep', seen_on: ['main', 'Image gallery-2'] },
      { message: 'Invented claim', seen_on: [] },
      { message: 'Wrong label', seen_on: ['a+-7'] },
    ],
    demonstrated_use_cases: [{ use_case: 'Before bed', evidence: 'woman in bed holding gummies', seen_on: ['gallery-2'] }, { use_case: 'No evidence', evidence: '' }, { use_case: 'Post-workout', evidence: 'gym bag', seen_on: [] }],
    packaging: {
      format: 'Gummies in a bottle', colours: ['Purple', 'white'],
      claims_on_pack: ['Sugar Free', 'Doctor formulated', { claim: 'Non-GMO', seen_on: ['main'] }],
      certifications_shown: [{ name: 'NSF', seen_on: [] }, 'GMP Certified'],
    },
    comparison_table_claims: [{ claim: '3x better absorption', vs_who: 'other brands', seen_on: ['a+-1'] }, { claim: 'Cheaper than others', vs_who: 'others' }],
    text_seen: [{ label: 'main', text: 'SUGAR FREE · 500 mg' }, { label: 'gallery-2', text: 'GMP certified facility' }, { label: 'nope', text: 'x' }, 'DOCTOR FORMULATED'],
    images_unreadable: ['a+-1', 'zzz'],
  }, labels);
  assert.equal(out.target_audience, null);
  assert.equal(out.main_promise, null);
  assert.deepEqual(out.recurring_messages, [{ message: 'Supports restful sleep', seen_on: ['main', 'gallery-2'] }]);
  assert.equal(out.demonstrated_use_cases.length, 1);
  assert.deepEqual(out.packaging.claims_on_pack.map((c) => c.claim), ['Sugar Free', 'Non-GMO'], 'bare "Sugar Free" is printed on main; "Doctor formulated" appears only in an UNLABELLED text entry → dropped');
  assert.deepEqual(out.packaging.claims_on_pack[0].seen_on, ['main'], 'a verbatim match inherits the label of the text it was read on');
  assert.deepEqual(out.text_seen.map((t) => t.label), ['main', 'gallery-2'], 'unknown-label and bare-string text are dropped');
  assert.deepEqual(out.packaging.certifications_shown.map((c) => c.name), ['GMP Certified']);
  assert.equal(out.packaging.colours.join(','), 'purple,white');
  assert.deepEqual(out.comparison_table_claims.map((c) => c.claim), ['3x better absorption']);
  assert.deepEqual(out.images_unreadable, ['a+-1']);
  assert.deepEqual(out.validation.dropped, {
    target_audience: 1, main_promise: 1, recurring_messages: 2, demonstrated_use_cases: 2,
    claims_on_pack: 1, certifications_shown: 1, comparison_table_claims: 1, text_seen: 2,
  });
  assert.equal(out.validation.dropped_total, 11);
});

test('parseVisionResponse tolerates fences and rejects non-JSON', () => {
  assert.equal(MA.parseVisionResponse('sorry, cannot', ['main']).ok, false);
  const r = MA.parseVisionResponse('```json\n{"recurring_messages":[{"message":"Zero sugar","seen_on":["main"]}]}\n```', ['main']);
  assert.equal(r.ok, true);
  assert.equal(r.analysis.recurring_messages[0].message, 'Zero sugar');
});

function analysis({ messages = [], promise = null, audience = null, uses = [], comps = [], pack = [] } = {}) {
  return MA.validateAnalysis({
    target_audience: audience, main_promise: promise, recurring_messages: messages,
    demonstrated_use_cases: uses, comparison_table_claims: comps,
    packaging: { format: 'gummies in a bottle', colours: ['purple'], claims_on_pack: pack, certifications_shown: [] },
    text_seen: [],
  }, ['main', 'gallery-2', 'gallery-3', 'a+-1']);
}

const PRODUCTS = [
  { asin: 'A1', bullets_text: 'Helps you fall asleep.', analysis: analysis({
    messages: [{ message: 'Supports deep sleep', seen_on: ['main', 'gallery-2'] }, { message: 'Gentle on the stomach', seen_on: ['gallery-3'] }, { message: 'Non-GMO', seen_on: ['main'] }],
    promise: { text: 'Deep sleep', where_seen: 'main' },
    audience: { who: 'Busy women', cues: ['for women', 'office worker at desk'] },
    uses: [{ use_case: 'Before bed', evidence: 'nightstand scene', seen_on: ['gallery-2'] }],
    comps: [{ claim: '3x better absorption', vs_who: 'tablets', seen_on: ['a+-1'] }],
  }) },
  { asin: 'A2', bullets_text: 'Great tasting berry flavor.', analysis: analysis({
    messages: [{ message: 'Better sleep & less stress', seen_on: ['a+-1'] }, { message: 'Gentle on stomach', seen_on: ['main'] }],
    promise: { text: 'Sleep better tonight', where_seen: 'main' },
    audience: { who: 'Women 40+', cues: ['for women over 40'] },
    uses: [{ use_case: 'before bed', evidence: 'bedroom', seen_on: ['gallery-2'] }],
    comps: [{ claim: '3x better absorption', vs_who: 'other brands', seen_on: ['a+-1'] }],
  }) },
  { asin: 'A3', bullets_text: 'Helps with joint mobility.', analysis: null }, // not analysed → its bullets do not count
];

test('buildRollup counts products once per cluster, with the seen_on breakdown', () => {
  const r = MA.buildRollup(PRODUCTS);
  assert.equal(r.products_analyzed, 2);
  const sleep = r.recurring_messages.find((m) => m.key === 'sleep');
  assert.equal(sleep.products, 2);
  assert.deepEqual(sleep.asins, ['A1', 'A2']);
  assert.deepEqual(sleep.seen_on, { main: 2, gallery: 1, 'a+': 1, brand: 0 }, 'A1: main (message + promise) + gallery; A2: main (promise) + A+');
  const stress = r.recurring_messages.find((m) => m.key === 'stress_calm');
  assert.equal(stress.products, 1, '"Better sleep & less stress" counts for Stress too');
  assert.equal(r.recurring_messages.find((m) => m.key === 'gentle').products, 2);
  assert.equal(r.main_promises.find((m) => m.key === 'sleep').products, 2);
  assert.equal(r.use_cases[0].label.toLowerCase(), 'before bed');
  assert.equal(r.use_cases[0].products, 2);
  const women = r.audience_segments.find((s) => s.segment === 'women');
  assert.equal(women.products, 2);
  assert.equal(r.audience_segments.find((s) => s.segment === 'busy professionals').products, 1);
  const abs = r.comparison_table_claims.find((c) => c.key === 'absorption');
  assert.equal(abs.products, 2);
  assert.deepEqual(abs.vs_who.sort(), ['other brands', 'tablets']);
  assert.deepEqual(r.packaging.formats, [{ value: 'gummies in a bottle', products: 2 }]);
  assert.ok(!('_claims' in MA.publicRollup(r)), 'internal claim clusters are not stored');
});

function synthesis(themes, distinctAsins) {
  return {
    keyword: 'magnesium gummies', generated_at: '2026-09-26T00:00:00Z', status: 'complete',
    ledger: { distinct_asins: distinctAsins },
    themes: themes.map(([label, polarity, count, asins, domain = 'product_efficacy']) => ({ label, polarity, domain, review_count: count, distinct_products: { count: asins.length, asin_count: asins.length, asins }, scope: 'multi_product' })),
  };
}

test('experienced vs claimed: experienced, contradicted, claimed_only, no_review_signal — every match names its rule', () => {
  const r = MA.buildRollup(PRODUCTS);
  const syn = synthesis([
    ['Helps with sleep', 'praise', 120, ['A1', 'A2']],
    ["Still can't sleep through the night", 'complaint', 20, ['A2']],
    ['Upset stomach and nausea', 'complaint', 45, ['A1', 'A2']],
    ['Settles stomach', 'praise', 10, ['A1']],
    ['Great berry taste', 'praise', 80, ['A2', 'A3'], 'taste_texture'],
  ], ['A1', 'A2', 'A3']);
  const e = MA.buildExperiencedVsClaimed(r, syn);
  const by = Object.fromEntries(e.items.map((i) => [i.benefit_group || i.claim, i]));

  assert.equal(by.sleep.verdict, 'experienced');
  assert.equal(by.sleep.review_support.theme_label, 'Helps with sleep');
  assert.equal(by.sleep.review_support.rule, 'synonym:sleep');
  assert.equal(by.sleep.complaint_reviews, 20, 'the counter-evidence is kept alongside');
  assert.equal(by.sleep.products_claiming, 2);

  assert.equal(by.gentle.verdict, 'contradicted', '45 complaint reviews ≥ 3 and ≥ 1.5 × 10 praise, on a claiming product');
  assert.equal(by.gentle.review_support.theme_label, 'Upset stomach and nausea');
  assert.equal(by.gentle.review_support.rule, 'synonym:gentle');

  assert.equal(by.absorption.verdict, 'claimed_only', 'claiming products have reviews, no theme mentions absorption');
  assert.equal(by.absorption.claim_surface, 'comparison_table_only', 'only asserted in the A+ comparison charts');
  assert.equal(by.absorption.review_support, null);

  assert.equal(by.taste.verdict, 'experienced');
  assert.equal(by.taste.claim_surface, 'bullets_only');
  assert.equal(by.taste.products_claiming, 1);
  assert.ok(!by.joint, 'bullets of a product the vision pass did not analyse are not counted');

  assert.ok(!e.items.some((i) => i.benefit_group === 'clean_label'), 'Non-GMO is an attribute, not an experienced benefit');
  assert.ok(e.excluded_attribute_claims >= 1);
  assert.equal(e.counts.contradicted, 1);
  assert.equal(e.counts.claimed_only, 2, 'absorption + stress');
  assert.equal(e.counts.experienced, 2, 'sleep + taste');
  for (const i of e.items) for (const m of i.matches) assert.match(m.rule, /^(synonym:|lexicon:|token_overlap$)/);
});

test('experienced vs claimed: no synthesis, or claiming products without reviews → no_review_signal', () => {
  const r = MA.buildRollup(PRODUCTS);
  const none = MA.buildExperiencedVsClaimed(r, null);
  assert.equal(none.available, false);
  assert.ok(none.items.length > 0);
  assert.ok(none.items.every((i) => i.verdict === 'no_review_signal'));
  const unrelated = MA.buildExperiencedVsClaimed(r, synthesis([['Arrived melted', 'complaint', 9, ['Z9'], 'shipping_condition']], ['Z9']));
  const abs = unrelated.items.find((i) => i.benefit_group === 'absorption');
  assert.equal(abs.verdict, 'no_review_signal', 'none of the claiming products has analysed reviews');
});

test('experienced vs claimed: a tie, or too few reviews, is mixed_weak — never experienced or contradicted', () => {
  const r = MA.buildRollup(PRODUCTS);
  const tie = MA.buildExperiencedVsClaimed(r, synthesis([
    ['Helps with sleep', 'praise', 10, ['A1']],
    ["Still can't sleep", 'complaint', 10, ['A2']],
  ], ['A1', 'A2']));
  const sleep = tie.items.find((i) => i.benefit_group === 'sleep');
  assert.equal(sleep.verdict, 'mixed_weak', '10 vs 10: C < 1.5 × P, and P is not > C');
  const few = MA.buildExperiencedVsClaimed(r, synthesis([["Still can't sleep", 'complaint', 2, ['A1']]], ['A1', 'A2']));
  assert.equal(few.items.find((i) => i.benefit_group === 'sleep').verdict, 'mixed_weak', '2 complaints < 3');
  assert.equal(tie.counts.mixed_weak >= 1, true);
  const text = MA.formatMarketingAssetsForPrompt({ ledger: { products_analyzed: 2, products: 2 }, rollup: MA.publicRollup(r), experienced_vs_claimed: tie });
  assert.match(text, /MIXED \/ TOO FEW REVIEWS TO JUDGE: Sleep/);
});

test('experienced vs claimed: themes only on NON-claiming products never confirm or contradict', () => {
  const r = MA.buildRollup(PRODUCTS);
  const e = MA.buildExperiencedVsClaimed(r, synthesis([
    ['Helps with sleep', 'praise', 200, ['Z1', 'Z2']],
    ['Upset stomach', 'complaint', 90, ['Z1']],
  ], ['A1', 'A2', 'Z1', 'Z2']));
  const sleep = e.items.find((i) => i.benefit_group === 'sleep');
  assert.equal(sleep.verdict, 'mixed_weak');
  assert.equal(sleep.review_support.on_claiming_products, 0);
  assert.equal(e.items.find((i) => i.benefit_group === 'gentle').verdict, 'mixed_weak', '90 complaints, but on 0 claiming products');
});

test('experienced vs claimed: a keyed cluster matches only its own group (no cross-group hit through a variant)', () => {
  const r = MA.buildRollup(PRODUCTS);
  // The Sleep cluster carries the variant "Better sleep & less stress"; a
  // stress-only theme must not attach to it.
  const e = MA.buildExperiencedVsClaimed(r, synthesis([['Feel less stressed and anxious', 'praise', 60, ['A2']]], ['A1', 'A2']));
  const sleep = e.items.find((i) => i.benefit_group === 'sleep');
  assert.equal(sleep.matches.length, 0);
  assert.equal(sleep.verdict, 'claimed_only');
  const stress = e.items.find((i) => i.benefit_group === 'stress_calm');
  assert.equal(stress.verdict, 'experienced');
  assert.equal(stress.review_support.rule, 'synonym:stress_calm');
});

test('generic stems never join topics: "stress relief" ≠ "relief from leg cramps", "chewable" ≠ "chewy texture"', () => {
  assert.equal(MA.matchRule('Fast relief', 'Relief from leg cramps'), null);
  assert.equal(MA.matchRule('Chewable tablets', 'Too chewy'), null);
  assert.equal(MA.matchRule('Glass bottle', 'Bottle arrived broken'), null);
  const sources = new Set(require('../utils/review-synthesis').DOMAIN_LEXICON.flatMap((row) => row.patterns.map((re) => re.source)));
  for (const g of MA.GENERIC_LEXICON_SOURCES) assert.ok(sources.has(g), `generic source ${g} must exist in DOMAIN_LEXICON`);
});

test('matchRule never invents a match; each rule is named', () => {
  assert.equal(MA.matchRule('3x better absorption', 'Great taste'), null);
  assert.equal(MA.matchRule('Travel-friendly stick packs', 'Arrived melted'), null);
  assert.equal(MA.matchRule('Supports restful sleep', 'Helps me fall asleep faster'), 'synonym:sleep');
  assert.equal(MA.matchRule('Resealable pouch', 'Pouch zipper breaks'), 'lexicon:packaging:\\bpouch(es)?\\b');
  assert.equal(MA.matchRule('Collagen boost', 'Collagen boost noticeable'), 'token_overlap');
  // Generic lexicon words ("helps", "works") alone never match.
  assert.equal(MA.matchRule('Works fast', 'Helps a lot'), null);
});

test('resume key: stable for the same ordered image list, changes when any URL changes, ignores the model', () => {
  const imgs = [{ label: 'main', url: IMG('61A') }, { label: 'gallery-2', url: IMG('61B') }];
  const k = MA.assetKey(imgs);
  assert.equal(k, MA.assetKey(imgs.map((x) => ({ ...x }))));
  assert.notEqual(k, MA.assetKey([imgs[0], { label: 'gallery-2', url: IMG('61C') }]));
  assert.notEqual(k, MA.assetKey(imgs, { promptVersion: 'p7b-v0' }));
  assert.equal(MA.planDigest([{ asin: 'B', key: '2' }, { asin: 'A', key: '1' }]), MA.planDigest([{ asin: 'A', key: '1' }, { asin: 'B', key: '2' }]));
  // Phase entries carry the ASIN on inv; scopes that differ only in no-image
  // products (key null) must hash differently.
  const e = (asin, key) => ({ inv: { asin }, key });
  assert.notEqual(MA.planDigest([e('A', '1'), e('B', null)]), MA.planDigest([e('A', '1'), e('C', null)]));
  assert.notEqual(MA.planDigest([e('A', '1')]), MA.planDigest([e('A', '1'), e('B', null)]));
});

test('estimateCost: 40 products × 8 images on Gemini Flash ≈ $0.60, Sonnet ≈ $1.91, unknown model → null', () => {
  const plan = Array(40).fill(8);
  const flash = MA.estimateCost(plan, { model: '~google/gemini-flash-latest', pricing: PRICING });
  assert.equal(flash.tokens_per_image, 1120);
  assert.equal(flash.images, 320);
  assert.ok(flash.cost_usd > 0.55 && flash.cost_usd < 0.65, String(flash.cost_usd));
  const sonnet = MA.estimateCost(plan, { model: 'anthropic/claude-sonnet-5', pricing: PRICING });
  assert.equal(sonnet.tokens_per_image, 1600);
  assert.ok(sonnet.cost_usd > 1.8 && sonnet.cost_usd < 2.0, String(sonnet.cost_usd));
  assert.equal(MA.estimateCost(plan, { model: 'x/unknown', pricing: PRICING }).cost_usd, null);
  assert.equal(MA.estimateCost([0, 0], { model: 'x', pricing: PRICING }).calls, 0);
  const worst = MA.estimateWorstCase(plan, { model: '~google/gemini-flash-latest', pricing: PRICING, maxTokens: 16000, attempts: 2 });
  assert.equal(worst.calls, 80);
  assert.equal(worst.completion_tokens, 80 * 16000);
  assert.ok(worst.cost_usd > 5 && worst.cost_usd < 6, String(worst.cost_usd));
});

test('buildAssetLedger + status: honest counts, videos never analysed', () => {
  const inv = MA.buildInventory(product, researchOwn);
  const images = MA.selectImagesForCall(inv, { maxImages: 8, maxAplus: 2 });
  const ok = { ok: true, cached: false, attempted: true, analysis: { images_unreadable: ['a+-2'], validation: { dropped_total: 3 } } };
  const L = MA.buildAssetLedger([{ inv, images, result: ok }, { inv, images, result: null }, { inv, images, result: { ok: false, attempted: true } }]);
  assert.equal(L.products, 3);
  assert.equal(L.products_analyzed, 1);
  assert.equal(L.products_not_attempted, 1);
  assert.equal(L.products_failed, 1);
  assert.equal(L.images_analyzed, images.length - 1);
  assert.equal(L.images_unreadable, 1);
  assert.equal(L.a_plus_images_analyzed, 1);
  assert.equal(L.a_plus_analyzed, 1);
  assert.equal(L.videos_available, 6);
  assert.equal(L.videos_analyzed, 0);
  assert.equal(L.claims_dropped_unevidenced, 3);
  assert.equal(MA.computeCategoryStatus(L), 'partial');
  assert.equal(MA.computeCategoryStatus({ products_analyzed: 0 }), 'inventory_only');
});

test('formatMarketingAssetsForPrompt: empty → "" (consumers stay byte-identical); populated → counted sections', () => {
  assert.equal(MA.formatMarketingAssetsForPrompt(null), '');
  assert.equal(MA.formatMarketingAssetsForPrompt({ rollup: { products_analyzed: 0 } }), '');
  const r = MA.buildRollup(PRODUCTS);
  const e = MA.buildExperiencedVsClaimed(r, synthesis([['Helps with sleep', 'praise', 120, ['A1', 'A2']]], ['A1', 'A2', 'A3']));
  const text = MA.formatMarketingAssetsForPrompt({ ledger: { images_analyzed: 12, a_plus_images_analyzed: 2, products_analyzed: 2, products: 3, videos_available: 4 }, rollup: MA.publicRollup(r), experienced_vs_claimed: e });
  assert.match(text, /RECURRING MESSAGES ON THE IMAGES/);
  assert.match(text, /- Sleep \(e\.g\. "[^"]+"\) — 2 products \(main 2, gallery 1, A\+ 1\)/);
  assert.match(text, /EXPERIENCED: Sleep — claimed by 2 products; praise theme "Helps with sleep", 120 reviews across 2 products, on 2 of the claiming products \[synonym:sleep\]/);
  assert.match(text, /CLAIMED ONLY: Absorption/);
  assert.match(text, /Videos: 4 available, 0 analysed/);
});
