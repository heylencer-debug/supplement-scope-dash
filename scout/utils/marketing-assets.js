/**
 * utils/marketing-assets.js — pure core of P7b "Marketing assets".
 *
 * No I/O in this file (no Supabase, no fetch). Unit-tested in
 * scout/test/marketing-assets.test.js; the phase script
 * (phase7b-marketing-assets.js) does the reads, the vision calls and the
 * writes, and hands the data through these functions.
 *
 * What it answers (owner spec, 2026-09-26 — "analyze actual packaging and
 * marketing assets"):
 *   - which assets each competitor actually shows: gallery images, A+ module
 *     images, brand-story images, videos (buildInventory, buildAssetLedger);
 *   - from the PIXELS, not the title/bullets: target audience, the main
 *     promise, recurring messages, demonstrated use cases, what is on the
 *     pack, comparison-table claims, verbatim overlay copy (vision prompt +
 *     validateAnalysis — anything without a seen_on label or verbatim
 *     evidence is DROPPED, and the drop is counted);
 *   - category roll-up with counts (buildRollup);
 *   - which claimed benefits customers actually EXPERIENCE (P3b praise
 *     theme), which are only CLAIMED, and which reviews CONTRADICT
 *     (buildExperiencedVsClaimed). A match needs a named lexical rule —
 *     synonym group, a shared specific DOMAIN_LEXICON pattern, or topic-token
 *     overlap — and the rule is recorded on every match. Nothing is matched
 *     "by feel".
 *
 * WHAT THE DATA ACTUALLY HOLDS (read-only SELECTs, 2026-09-26/27):
 *   - products.image_urls: the listing gallery (main first), m.media-amazon
 *     /images/I/<id>.<size>.jpg. products.main_image_url sometimes null.
 *   - products.video_urls: [] on every row that has it (0 of 3,555 non-empty);
 *     products.video_count never > 0; products.has_a_plus_content is set only
 *     on legacy (Dec 2025 – Mar 2026) CSV-era rows. Neither is trusted alone.
 *   - dovive_research.raw_json (Bright Data, source 'bright-data-fallback-v1'):
 *       plus_content         boolean                (A+ present)
 *       product_description  [{url, type:'image'|'video'}] — A+ MODULE media
 *                            (aplus-media-library-service-media images; video
 *                            entries are HLS .m3u8 streams)
 *       from_the_brand       [url]  — brand-story carousel images (never
 *                            overlapping product_description in 400 rows)
 *       videos               [https://www.amazon.com/vdp/<id>] — video PAGES,
 *                            not media files; video_count alongside
 *       review_videos        customer videos (NOT marketing assets; counted only)
 *   - There is no frame-extraction or transcript path anywhere in the
 *     pipeline, so videos are INVENTORIED and reported as not analysed
 *     (videos_analyzed = 0 with the reason) — never described.
 */

'use strict';

const crypto = require('crypto');
const RS = require('./review-synthesis');

const PROMPT_VERSION = 'p7b-v1';

// ─── Benefit synonym groups (the explicit synonym list) ─────────────────────
// A claim and a review theme "mean the same benefit" when both hit the same
// group. experiential:false marks attributes a customer cannot feel (a
// certification, an origin, a free-from list) — those are rolled up but kept
// OUT of the experienced-vs-claimed table, because no review theme can
// confirm or contradict "Non-GMO".
const BENEFIT_GROUPS = [
  { group: 'sleep', label: 'Sleep', experiential: true, patterns: [/\bsleep(s|ing|y)?\b/, /\binsomnia\b/, /\brestful\b/, /\bfall(ing)? asleep\b/, /\bbedtime\b/, /\bnight ?time\b/, /\bwake up\b/] },
  { group: 'stress_calm', label: 'Stress & calm', experiential: true, patterns: [/\bstress(ed|ful)?\b/, /\bcalm(ing|er|ness)?\b/, /\brelax(ing|ed|ation)?\b/, /\banxi(ety|ous)\b/, /\bcortisol\b/, /\bunwind\b/] },
  { group: 'mood', label: 'Mood', experiential: true, patterns: [/\bmood\b/, /\bhappier\b/, /\birritab(le|ility)\b/] },
  { group: 'energy', label: 'Energy', experiential: true, patterns: [/\benerg(y|ized|izing|etic)\b/, /\bfatigue\b/, /\btired(ness)?\b/, /\bstamina\b/, /\bvitality\b/, /\bsluggish\b/, /\bcrash(es)?\b/] },
  { group: 'focus', label: 'Focus & cognition', experiential: true, patterns: [/\bfocus(ed)?\b/, /\bclarity\b/, /\bcogniti(ve|on)\b/, /\bbrain\b/, /\bmemory\b/, /\bconcentrat(e|ion)\b/, /\bbrain fog\b/] },
  { group: 'hydration', label: 'Hydration', experiential: true, patterns: [/\bhydrat(e|es|ed|ing|ion)\b/, /\bdehydrat(ed|ion)\b/, /\belectrolytes?\b/, /\bthirst(y)?\b/] },
  { group: 'cramps', label: 'Cramps', experiential: true, patterns: [/\bcramp(s|ing)?\b/, /\bspasms?\b/, /\btwitch(es|ing)?\b/, /\bcharley horse\b/, /\brestless legs?\b/] },
  { group: 'muscle_recovery', label: 'Muscle & recovery', experiential: true, patterns: [/\bmuscles?\b/, /\brecover(y|ed)?\b/, /\bsore(ness)?\b/, /\bworkouts?\b/, /\b(athletic|exercise) performance\b/, /\bstrength\b/, /\bendurance\b/, /\bpump\b/] },
  { group: 'digestion', label: 'Digestion & gut', experiential: true, patterns: [/\bdigest(ion|ive)?\b/, /\bgut\b/, /\bbloat(ed|ing)?\b/, /\bconstipat(ed|ion)\b/, /\bregular(ity)?\b/, /\bbowel\b/] },
  { group: 'gentle', label: 'Gentle / side effects', experiential: true, patterns: [/\bgentle\b/, /\bstomach\b/, /\bnause(a|ous)\b/, /\bside[- ]effects?\b/, /\bjitter(s|y)?\b/, /\bdiarrh?ea\b/, /\blaxative\b/] },
  { group: 'immune', label: 'Immune', experiential: true, patterns: [/\bimmun(e|ity)\b/, /\bdefen[cs]es?\b/, /\bsick less\b/] },
  { group: 'joint', label: 'Joints & mobility', experiential: true, patterns: [/\bjoints?\b/, /\bmobility\b/, /\bstiff(ness)?\b/, /\bcartilage\b/, /\bflexib(le|ility)\b/] },
  { group: 'skin_hair_nails', label: 'Skin, hair & nails', experiential: true, patterns: [/\bskin\b/, /\bhair\b/, /\bnails?\b/, /\bcomplexion\b/, /\bglow(ing)?\b/] },
  { group: 'heart', label: 'Heart & circulation', experiential: true, patterns: [/\bheart\b/, /\bcardio(vascular)?\b/, /\bblood pressure\b/, /\bcirculation\b/] },
  { group: 'bone', label: 'Bones', experiential: true, patterns: [/\bbones?\b/, /\bbone density\b/] },
  { group: 'weight', label: 'Weight & appetite', experiential: true, patterns: [/\bweight\b/, /\bappetite\b/, /\bmetabolism\b/, /\bcravings?\b/, /\bfat burn(ing|er)?\b/] },
  { group: 'headache', label: 'Headaches', experiential: true, patterns: [/\bheadaches?\b/, /\bmigraines?\b/] },
  { group: 'hangover', label: 'Hangover', experiential: true, patterns: [/\bhangovers?\b/] },
  { group: 'taste', label: 'Taste & flavour', experiential: true, patterns: [/\btast(e|es|y|ing)\b/, /\bflavou?r(s|ed|ful)?\b/, /\bdelicious\b/, /\byummy\b/, /\baftertaste\b/] },
  { group: 'ease_of_use', label: 'Easy to take / mix', experiential: true, patterns: [/\beasy to (swallow|take|mix|use)\b/, /\bmix(es)? (easily|well|instantly)\b/, /\bdissolv(e|es|ing)\b/, /\bchewable\b/, /\bon the go\b/, /\bno pills?\b/] },
  { group: 'absorption', label: 'Absorption', experiential: true, patterns: [/\babsor(b|bs|bed|ption|bable)\b/, /\bbioavailab(le|ility)\b/] },
  { group: 'value', label: 'Value for money', experiential: true, patterns: [/\bvalue\b/, /\bafford(able)?\b/, /\bper serving\b/, /\bbudget\b/, /\bprice\b/] },
  { group: 'sugar', label: 'Sugar / sweeteners', experiential: false, patterns: [/\bsugar[- ]free\b/, /\bzero sugar\b/, /\bno (added )?sugar\b/, /\blow sugar\b/, /\bsweeteners?\b/] },
  { group: 'clean_label', label: 'Clean label / free-from', experiential: false, patterns: [/\bnon[- ]?gmo\b/, /\borganic\b/, /\bno artificial\b/, /\bnatural\b/, /\bgluten[- ]free\b/, /\bvegan\b/, /\bplant[- ]based\b/, /\bdairy[- ]free\b/, /\bsoy[- ]free\b/, /\bkosher\b/, /\bclean\b/, /\bfree from\b/] },
  { group: 'quality_trust', label: 'Testing & trust signals', experiential: false, patterns: [/\bthird[- ]party\b/, /\blab[- ]tested\b/, /\bgmp\b/, /\bnsf\b/, /\bcertified\b/, /\bclinically\b/, /\bdoctor\b/, /\bpharmacist\b/, /\bmade in (the )?usa\b/, /\b#1\b/, /\bbest[- ]sell(er|ing)\b/] },
];

// DOMAIN_LEXICON patterns too generic to prove two texts are about the same
// thing ("helps", "works", "results" appear in every supplement claim and in
// half of all reviews). The lexicon rule ignores these.
const GENERIC_LEXICON_SOURCES = new Set([
  '\\bwork(s|ed|ing)?\\b', '\\beffective(ness)?\\b', '\\bineffective\\b', '\\bresults?\\b',
  '\\bnotic(e|ed|eable)\\b', '\\bdifference\\b', '\\bhelp(s|ed|ful|ing)?\\b',
  '\\bfeel (better|calmer|great|a difference|nothing|any)\\b', '\\breaction\\b', '\\bsymptoms?\\b',
  '\\bdos(e|es|age|ing)\\b', '\\bpoten(t|cy)\\b', '\\bplastic\\b', '\\blabel(s|ed|ing)?\\b',
  '\\bpackag(e|ing)\\b', '\\bmislead(ing)?\\b', '\\barriv(e|ed|al)\\b', '\\bdeliver(y|ed)\\b',
  '\\bshipp(ed|ing)\\b', '\\blate\\b', '\\bcompany\\b', '\\bmanufacturer\\b', '\\bresponded?\\b',
  '\\bcontacted\\b', '\\bworth\\b', '\\bdeal\\b', '\\bcost(s|ly)?\\b', '\\bvalue\\b',
]);

// Audience segments (for the roll-up). Unmatched "who" strings are clustered
// by token overlap instead.
const AUDIENCE_GROUPS = [
  { segment: 'women', patterns: [/\bwom(a|e)n\b/, /\bfemale\b/, /\bher\b/, /\bmoms?\b/, /\bmothers?\b/, /\bladies\b/] },
  { segment: 'men', patterns: [/\bm(a|e)n\b/, /\bmale\b/, /\bhim\b/, /\bdads?\b/] },
  { segment: 'kids & teens', patterns: [/\bkids?\b/, /\bchild(ren)?\b/, /\bteens?\b/, /\btoddlers?\b/] },
  { segment: 'older adults', patterns: [/\bseniors?\b/, /\b50\s?\+/, /\bover 50\b/, /\bolder adults?\b/, /\baging\b/, /\bmenopaus(e|al)\b/] },
  { segment: 'athletes & active', patterns: [/\bathlet(e|es|ic)\b/, /\bactive\b/, /\bfitness\b/, /\bgym\b/, /\bworkouts?\b/, /\brunners?\b/, /\bsports?\b/, /\bendurance\b/] },
  { segment: 'pregnancy & prenatal', patterns: [/\bpregnan(t|cy)\b/, /\bprenatal\b/, /\bnursing\b/, /\bbreastfeeding\b/] },
  { segment: 'diet-specific (keto / vegan)', patterns: [/\bketo\b/, /\blow[- ]carb\b/, /\bvegans?\b/, /\bplant[- ]based\b/, /\bpaleo\b/] },
  { segment: 'busy professionals', patterns: [/\bbusy\b/, /\bprofessionals?\b/, /\bwork(ing)? (day|life)\b/, /\boffice\b/, /\bcommut/] },
  { segment: 'travellers & outdoors', patterns: [/\btravel(l)?(ers?|ing)?\b/, /\bhik(e|ers|ing)\b/, /\boutdoors?\b/, /\bheat\b/] },
  { segment: 'adults (general)', patterns: [/\badults?\b/, /\beveryone\b/, /\bwhole family\b/, /\bfamily\b/] },
  { segment: 'pets', patterns: [/\bdogs?\b/, /\bcats?\b/, /\bpets?\b/, /\bpupp(y|ies)\b/] },
];

// ─── Small helpers ──────────────────────────────────────────────────────────

const lc = (s) => String(s || '').toLowerCase();
const clean = (s, max = 240) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max);
const normText = (s) => lc(s).replace(/[^a-z0-9%+#]+/g, ' ').replace(/\s+/g, ' ').trim();

function uniq(arr) { return [...new Set(arr)]; }

function groupsOf(text) {
  const t = lc(text);
  return BENEFIT_GROUPS.filter((g) => g.patterns.some((re) => re.test(t))).map((g) => g.group);
}

const GROUP_BY_KEY = Object.fromEntries(BENEFIT_GROUPS.map((g) => [g.group, g]));

/** Specific (non-generic) DOMAIN_LEXICON patterns a text hits: [{domain, source}]. */
function specificLexiconHits(text) {
  const t = lc(text);
  const out = [];
  for (const row of RS.DOMAIN_LEXICON) {
    for (const re of row.patterns) {
      if (GENERIC_LEXICON_SOURCES.has(re.source)) continue;
      if (re.test(t)) out.push({ domain: row.domain, source: re.source });
    }
  }
  return out;
}

/** Stable identity of an Amazon image URL: the /images/I/<id> or A+ media uuid, size codes ignored. */
function imageIdentity(url) {
  const u = String(url || '');
  const m = u.match(/\/images\/I\/([A-Za-z0-9+%-]+)\./) || u.match(/\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\./i);
  return m ? m[1] : u.replace(/\._[^/]*_\./, '.');
}

function asArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.trim().startsWith('[')) { try { const j = JSON.parse(v); return Array.isArray(j) ? j : []; } catch { return []; } }
  return [];
}

function isHttp(u) { return typeof u === 'string' && /^https?:\/\//i.test(u); }

// ─── 1. Asset inventory (no model) ──────────────────────────────────────────

/**
 * Pick the dovive_research row to read raw assets from: this keyword's row
 * first (case-insensitive), else the freshest row for the ASIN from any
 * session (dovive_research is UNIQUE(asin, keyword); raw_json is per scrape).
 */
function pickResearchRow(rows, keyword) {
  const list = (rows || []).filter(Boolean);
  if (!list.length) return null;
  const own = list.filter((r) => lc(r.keyword) === lc(keyword));
  const pool = own.length ? own : list;
  return pool.slice().sort((a, b) => String(b.scraped_at || '').localeCompare(String(a.scraped_at || '')))[0];
}

/**
 * Per-product asset inventory. `product` is a DASH products row; `research`
 * is the chosen dovive_research row with these select aliases (see
 * phase7b RESEARCH_SELECT): images, main_image, plus, pd, ftb, vids, vcount,
 * rvids. Every field is optional; missing ones are reported, never invented.
 */
function buildInventory(product, research = null) {
  const p = product || {};
  const r = research || {};
  const galleryUrls = [];
  const galleryFrom = asArray(p.image_urls).length ? 'products.image_urls' : asArray(r.images).length ? 'dovive_research.images' : null;
  const rawGallery = asArray(p.image_urls).length ? asArray(p.image_urls) : asArray(r.images);
  const main = [p.main_image_url, r.main_image].find(isHttp) || null;
  const seen = new Set();
  const push = (u) => { if (!isHttp(u)) return; const id = imageIdentity(u); if (seen.has(id)) return; seen.add(id); galleryUrls.push(u); };
  if (main) push(main);
  rawGallery.forEach(push);
  const gallery = galleryUrls.map((url, i) => ({ label: i === 0 ? 'main' : `gallery-${i + 1}`, url, kind: 'gallery' }));

  const pd = asArray(r.pd);
  const aplusImages = [];
  const aplusVideos = [];
  const aSeen = new Set();
  for (const x of pd) {
    const url = x && typeof x === 'object' ? x.url : x;
    const type = x && typeof x === 'object' ? x.type : 'image';
    if (!isHttp(url)) continue;
    if (type === 'video' || /\.m3u8(\?|$)/i.test(url)) { aplusVideos.push(url); continue; }
    const id = imageIdentity(url);
    if (aSeen.has(id)) continue;
    aSeen.add(id);
    aplusImages.push({ label: `a+-${aplusImages.length + 1}`, url, kind: 'a+' });
  }
  const brand = [];
  for (const url of asArray(r.ftb)) {
    if (!isHttp(url)) continue;
    const id = imageIdentity(url);
    if (aSeen.has(id)) continue;
    aSeen.add(id);
    brand.push({ label: `brand-${brand.length + 1}`, url, kind: 'brand' });
  }

  const listingVideos = asArray(r.vids).filter(isHttp);
  const legacyVideos = asArray(p.video_urls).filter(isHttp);
  const rawVideoCount = Number(r.vcount);
  const videosListing = Math.max(listingVideos.length + legacyVideos.length, Number.isFinite(rawVideoCount) ? rawVideoCount : 0, Number(p.video_count) || 0);

  let aPlus = null;
  let aPlusFrom = null;
  if (typeof r.plus === 'boolean') { aPlus = r.plus; aPlusFrom = 'dovive_research.raw_json.plus_content'; }
  else if (r.plus === 'true' || r.plus === 'false') { aPlus = r.plus === 'true'; aPlusFrom = 'dovive_research.raw_json.plus_content'; }
  if (aplusImages.length || aplusVideos.length) { aPlus = true; aPlusFrom = aPlusFrom || 'dovive_research.raw_json.product_description'; }
  if (aPlus == null && typeof p.has_a_plus_content === 'boolean') { aPlus = p.has_a_plus_content; aPlusFrom = 'products.has_a_plus_content (legacy)'; }

  return {
    asin: p.asin,
    title: clean(p.title, 200) || null,
    brand: p.brand || null,
    bsr: p.bsr_current ?? null,
    gallery,
    a_plus: { available: aPlus, source: aPlusFrom, images: aplusImages, videos: aplusVideos },
    brand_story: brand,
    videos: {
      listing_count: videosListing,
      listing_urls: uniq([...listingVideos, ...legacyVideos]).slice(0, 10),
      a_plus_streams: aplusVideos.length,
      review_videos: asArray(r.rvids).length,
      analyzed: 0,
      note: 'not analysed — listing videos are Amazon /vdp/ pages and A+ videos are HLS (.m3u8) streams; the pipeline has no frame-extraction or transcript path',
    },
    sources: {
      gallery: galleryFrom,
      research_keyword: r.keyword || null,
      research_scraped_at: r.scraped_at || null,
    },
  };
}

/**
 * Images for the ONE vision call per product, in order: main + gallery, then
 * A+ module images, then brand-story images. `maxAplus` slots are reserved
 * for A+/brand images when the product has them (A+ is where comparison
 * tables and use-case panels live); unused reserved slots go back to the
 * gallery and vice versa. Total never exceeds `maxImages`.
 */
function selectImagesForCall(inv, { maxImages = 8, maxAplus = 2 } = {}) {
  const gal = inv.gallery || [];
  const aplus = [...((inv.a_plus && inv.a_plus.images) || []), ...(inv.brand_story || [])];
  const max = Math.max(0, maxImages);
  const reserve = Math.min(Math.max(0, maxAplus), aplus.length, max);
  const galTake = Math.min(gal.length, max - reserve);
  const aTake = Math.min(aplus.length, max - galTake);
  return [...gal.slice(0, galTake), ...aplus.slice(0, aTake)];
}

/** Resume key: prompt version + the ordered image URL list. Model changes do NOT re-pay. */
function assetKey(images, { promptVersion = PROMPT_VERSION } = {}) {
  const list = (images || []).map((i) => `${i.label}=${i.url}`).join('\n');
  return crypto.createHash('sha1').update(`${promptVersion}\n${list}`).digest('hex');
}

/** Digest of the whole in-scope plan (asin:key), for the category skip-when-fresh check. */
function planDigest(entries) {
  const s = (entries || []).map((e) => `${e.asin}:${e.key || '-'}`).sort().join('|');
  return crypto.createHash('sha1').update(`${PROMPT_VERSION}|${s}`).digest('hex');
}

// ─── 2. Vision prompt + validation ─────────────────────────────────────────

function buildVisionPrompt({ keyword, product, images }) {
  const labels = images.map((i) => i.label);
  const kinds = images.map((i) => `${i.label} (${i.kind === 'gallery' ? (i.label === 'main' ? 'main listing image' : 'listing gallery image') : i.kind === 'a+' ? 'A+ content module' : 'brand-story image'})`).join(', ');
  return `You are a senior marketing strategist and packaging analyst studying a competitor on Amazon US in the "${keyword}" category.
Product: ${product.title || 'unknown title'}${product.brand ? ` — brand ${product.brand}` : ''} (ASIN ${product.asin}).

You are shown ${images.length} images, each preceded by its label: ${kinds}.
Read ONLY what is in these images — the pack, the overlay copy, the lifestyle scenes, the comparison tables. Do not use outside knowledge of the brand, and do not use the product title as evidence.

Return ONLY JSON, no prose, in exactly this shape:
{
  "target_audience": {"who": "...", "cues": ["verbatim text or concrete visual cue", "..."]},
  "main_promise": {"text": "...", "where_seen": "<one label>"},
  "recurring_messages": [{"message": "...", "seen_on": ["<label>", "..."], "verbatim": "exact overlay text if any"}],
  "demonstrated_use_cases": [{"use_case": "...", "evidence": "what is shown or written", "seen_on": ["<label>"]}],
  "packaging": {"format": "...", "colours": ["..."], "claims_on_pack": [{"claim": "verbatim", "seen_on": ["<label>"]}], "certifications_shown": [{"name": "...", "seen_on": ["<label>"]}]},
  "comparison_table_claims": [{"claim": "the advantage the table asserts", "vs_who": "who it is compared against as written (e.g. 'other brands', 'pills', a named brand)", "seen_on": ["<label>"]}],
  "text_seen": [{"label": "<label>", "text": "verbatim overlay copy on that image"}],
  "images_unreadable": ["<label>"]
}

Rules:
- Labels: use ONLY these exact labels: ${labels.join(', ')}. Every message, use case, claim and certification must list the label(s) of the image(s) where you saw it. Anything you cannot point to an image for, leave out.
- "target_audience.cues": the verbatim words ("for women 40+") or concrete visual cues ("runner on a trail", "mother with toddler") that tell you who it is for. No cues → "who": null and "cues": [].
- "main_promise": the single benefit the listing leads with, in a few words, and the label where it is most prominent. null if none is visible.
- "recurring_messages": benefits or reasons-to-buy the images repeat or give prominence to (a message on one image is fine; say where). Short canonical phrases ("Supports deep sleep", "Zero sugar", "3x better absorption").
- "demonstrated_use_cases": situations the images SHOW or state (before bed, post-workout, on a hike, mixed into water). "evidence" says what is shown.
- "packaging": the physical format (e.g. "gummies in a bottle", "stick packs", "tub with scoop"), dominant pack colours, claims printed ON THE PACK (verbatim), and certification seals actually visible.
- "comparison_table_claims": ONLY from comparison charts/tables (brand vs "others", vs pills, vs a named competitor). One entry per row the table claims as an advantage.
- "text_seen": verbatim overlay copy per image, exactly as printed (no paraphrase, no translation). Skip the supplement-facts panel numbers.
- "images_unreadable": labels you could not read (blank, broken, too small).
- Be literal. Do not invent statistics or claims that are not printed or shown.`;
}

/** OpenAI-shape multimodal content parts (the transport ocr-phase4.js uses on OpenRouter). */
function buildVisionMessages({ keyword, product, images }) {
  const content = [{ type: 'text', text: buildVisionPrompt({ keyword, product, images }) }];
  for (const img of images) {
    content.push({ type: 'text', text: `Image ${img.label}:` });
    content.push({ type: 'image_url', image_url: { url: img.url } });
  }
  return [{ role: 'user', content }];
}

function cleanLabels(v, allowed) {
  const out = [];
  for (const x of Array.isArray(v) ? v : (v == null ? [] : [v])) {
    const l = lc(String(x)).trim().replace(/^image\s+/, '').replace(/^a\+(\d)/, 'a+-$1');
    if (allowed.has(l) && !out.includes(l)) out.push(l);
  }
  return out;
}

/**
 * Validate one model response against the labels actually sent. Every
 * message / use case / claim / certification must carry at least one
 * seen_on label that was sent, or (for bare-string pack claims and
 * certifications) appear verbatim in the text read off the images. What
 * fails is DROPPED and counted in `validation.dropped`.
 */
function validateAnalysis(raw, sentLabels) {
  const allowed = new Set((sentLabels || []).map(lc));
  const dropped = { target_audience: 0, main_promise: 0, recurring_messages: 0, demonstrated_use_cases: 0, claims_on_pack: 0, certifications_shown: 0, comparison_table_claims: 0, text_seen: 0 };
  const o = raw && typeof raw === 'object' ? raw : {};

  const textSeen = [];
  for (const t of Array.isArray(o.text_seen) ? o.text_seen : []) {
    if (typeof t === 'string') {
      if (clean(t)) textSeen.push({ label: null, text: clean(t, 400) }); else dropped.text_seen++;
      continue;
    }
    const label = cleanLabels(t && t.label, allowed)[0] || null;
    const text = clean(t && t.text, 400);
    if (!text || (t && t.label != null && !label)) { dropped.text_seen++; continue; }
    textSeen.push({ label, text });
  }
  const corpus = normText(textSeen.map((t) => t.text).join(' \n '));
  const verbatimIn = (s) => { const n = normText(s); return n.length >= 3 && corpus.includes(n); };

  let audience = null;
  const ta = o.target_audience && typeof o.target_audience === 'object' ? o.target_audience : null;
  if (ta) {
    const cues = (Array.isArray(ta.cues) ? ta.cues : []).map((c) => clean(c, 160)).filter((c) => c.length >= 2);
    const who = clean(ta.who, 160);
    if (who && cues.length) audience = { who, cues: uniq(cues).slice(0, 8) };
    else if (who) dropped.target_audience++;
  }

  let promise = null;
  const mp = o.main_promise && typeof o.main_promise === 'object' ? o.main_promise : null;
  if (mp && clean(mp.text)) {
    const where = cleanLabels(mp.where_seen, allowed)[0];
    if (where) promise = { text: clean(mp.text, 200), where_seen: where };
    else dropped.main_promise++;
  }

  const messages = [];
  for (const m of Array.isArray(o.recurring_messages) ? o.recurring_messages : []) {
    const message = clean(m && m.message, 200);
    const seen = cleanLabels(m && m.seen_on, allowed);
    if (!message || !seen.length) { if (message || (m && m.seen_on)) dropped.recurring_messages++; continue; }
    const verbatim = clean(m.verbatim, 240) || null;
    messages.push({ message, seen_on: seen, ...(verbatim ? { verbatim } : {}) });
  }

  const useCases = [];
  for (const u of Array.isArray(o.demonstrated_use_cases) ? o.demonstrated_use_cases : []) {
    const useCase = clean(u && u.use_case, 160);
    const evidence = clean(u && u.evidence, 240);
    const seen = cleanLabels(u && u.seen_on, allowed);
    if (!useCase || evidence.length < 3 || (u && u.seen_on != null && !seen.length)) { if (useCase) dropped.demonstrated_use_cases++; continue; }
    useCases.push({ use_case: useCase, evidence, seen_on: seen });
  }

  const pk = o.packaging && typeof o.packaging === 'object' ? o.packaging : {};
  const evidenced = (items, key, bucket) => {
    const out = [];
    for (const it of Array.isArray(items) ? items : []) {
      if (typeof it === 'string') {
        // Bare string: kept only when it is printed verbatim on an image we read.
        if (verbatimIn(it)) out.push({ [key]: clean(it, 160), seen_on: [], evidence: 'verbatim in text_seen' });
        else dropped[bucket]++;
        continue;
      }
      const val = clean(it && it[key], 160);
      const seen = cleanLabels(it && it.seen_on, allowed);
      if (!val) continue;
      if (seen.length) out.push({ [key]: val, seen_on: seen });
      else if (verbatimIn(val)) out.push({ [key]: val, seen_on: [], evidence: 'verbatim in text_seen' });
      else dropped[bucket]++;
    }
    return out;
  };
  const packaging = {
    format: clean(pk.format, 120) || null,
    colours: uniq((Array.isArray(pk.colours) ? pk.colours : Array.isArray(pk.colors) ? pk.colors : []).map((c) => lc(clean(c, 40))).filter(Boolean)).slice(0, 6),
    claims_on_pack: evidenced(pk.claims_on_pack, 'claim', 'claims_on_pack'),
    certifications_shown: evidenced(pk.certifications_shown, 'name', 'certifications_shown'),
  };

  const comparisons = [];
  for (const c of Array.isArray(o.comparison_table_claims) ? o.comparison_table_claims : []) {
    const claim = clean(c && c.claim, 200);
    const seen = cleanLabels(c && c.seen_on, allowed);
    if (!claim || !seen.length) { if (claim) dropped.comparison_table_claims++; continue; }
    comparisons.push({ claim, vs_who: clean(c.vs_who, 120) || null, seen_on: seen });
  }

  const unreadable = cleanLabels(o.images_unreadable, allowed);
  const droppedTotal = Object.values(dropped).reduce((a, b) => a + b, 0);
  return {
    target_audience: audience,
    main_promise: promise,
    recurring_messages: messages,
    demonstrated_use_cases: useCases,
    packaging,
    comparison_table_claims: comparisons,
    text_seen: textSeen,
    images_unreadable: unreadable,
    validation: { dropped, dropped_total: droppedTotal },
  };
}

/** Parse + validate a raw model response. { ok:false } when there is no JSON object. */
function parseVisionResponse(text, sentLabels) {
  const parsed = RS.extractJson(text);
  if (!parsed || typeof parsed !== 'object') return { ok: false, analysis: null };
  return { ok: true, analysis: validateAnalysis(parsed, sentLabels) };
}

/** Per-image view for the dashboard thumbnails: the copy and messages seen on each image. */
function perImageView(images, analysis) {
  const a = analysis || {};
  return (images || []).map((img) => ({
    label: img.label,
    url: img.url,
    kind: img.kind,
    text_seen: (a.text_seen || []).filter((t) => t.label === img.label).map((t) => t.text),
    messages: (a.recurring_messages || []).filter((m) => m.seen_on.includes(img.label)).map((m) => m.message),
    comparison_claims: (a.comparison_table_claims || []).filter((c) => c.seen_on.includes(img.label)).map((c) => c.claim),
    unreadable: (a.images_unreadable || []).includes(img.label),
  }));
}

// ─── 3. Category roll-up (pure) ────────────────────────────────────────────

function bucketOf(label) {
  const l = lc(label);
  if (l === 'main') return 'main';
  if (l.startsWith('gallery')) return 'gallery';
  if (l.startsWith('a+')) return 'a+';
  if (l.startsWith('brand')) return 'brand';
  return 'other';
}

/**
 * One copy of an item per benefit group its text hits ("Deep sleep & less
 * stress" counts for Sleep AND Stress); items hitting no group keep group null
 * and are clustered by wording.
 */
function expandByGroup(items) {
  const out = [];
  for (const it of items) {
    if (it.group !== undefined) { out.push(it); continue; }
    const gs = groupsOf(it.text);
    if (!gs.length) out.push({ ...it, group: null });
    else for (const g of gs) out.push({ ...it, group: g });
  }
  return out;
}

/**
 * Seed-based clustering (never transitive, same rule as P3b mergeThemes).
 * Items carrying a benefit `group` cluster by that group; the rest are
 * visited in order of how many products carry the exact wording, and each
 * joins the cluster whose SEED wording it matches (label similarity ≥
 * threshold) or starts a new one. Product counts and the seen_on breakdown
 * count each product once per cluster.
 */
function clusterItems(items, { threshold = 0.5 } = {}) {
  const byText = new Map();
  for (const it of items) {
    const k = `${it.group || ''}|${normText(it.text)}`;
    if (!normText(it.text)) continue;
    if (!byText.has(k)) byText.set(k, { text: clean(it.text, 200), group: it.group || null, items: [] });
    byText.get(k).items.push(it);
  }
  const groups = [...byText.values()].sort((a, b) => new Set(b.items.map((x) => x.asin)).size - new Set(a.items.map((x) => x.asin)).size || a.text.localeCompare(b.text));
  const clusters = [];
  for (const g of groups) {
    let target = null;
    if (g.group) target = clusters.find((c) => c.key === g.group) || null;
    else {
      let best = 0;
      for (const c of clusters) {
        if (c.key) continue;
        const s = RS.labelSimilarity(c.seed, g.text);
        if (s >= threshold && s > best) { best = s; target = c; }
      }
    }
    if (!target) { target = { key: g.group, seed: g.text, variants: [], items: [] }; clusters.push(target); }
    if (!target.variants.includes(g.text)) target.variants.push(g.text);
    target.items.push(...g.items);
  }
  return clusters.map((c) => {
    const asins = uniq(c.items.map((x) => x.asin)).sort();
    const seenOn = { main: 0, gallery: 0, 'a+': 0, brand: 0 };
    const kinds = {};
    for (const a of asins) {
      const mine = c.items.filter((x) => x.asin === a);
      for (const b of new Set(mine.flatMap((x) => (x.seen_on || []).map(bucketOf)))) if (seenOn[b] != null) seenOn[b]++;
      for (const k of new Set(mine.map((x) => x.kind))) kinds[k] = (kinds[k] || 0) + 1;
    }
    return {
      key: c.key,
      label: c.key && GROUP_BY_KEY[c.key] ? GROUP_BY_KEY[c.key].label : c.seed,
      seed: c.seed,
      variants: c.variants.slice(0, 6),
      products: asins.length,
      asins,
      seen_on: seenOn,
      kinds,
      items: c.items,
    };
  }).sort((a, b) => b.products - a.products || a.label.localeCompare(b.label));
}

/** Deterministic benefit mentions in a product's bullets (one per group, with the sentence as evidence). */
function bulletClaims(asin, bulletsText) {
  const out = [];
  const seen = new Set();
  for (const sentence of RS.splitSentences(String(bulletsText || '').replace(/\n+/g, '. '))) {
    for (const g of groupsOf(sentence)) {
      if (seen.has(g)) continue;
      seen.add(g);
      out.push({ asin, text: GROUP_BY_KEY[g].label, group: g, kind: 'bullet', seen_on: [], evidence: clean(sentence, 200) });
    }
  }
  return out;
}

function audienceSegments(aud) {
  const t = lc([aud.who, ...(aud.cues || [])].join(' | '));
  return AUDIENCE_GROUPS.filter((g) => g.patterns.some((re) => re.test(t))).map((g) => g.segment);
}

const stripItems = (c) => { const { items, ...rest } = c; return rest; };

/**
 * Category roll-up over the analysed products. `products` =
 * [{ asin, analysis, bullets_text }] (analysis null → not analysed; its
 * bullets still count on the bullets side).
 */
function buildRollup(products) {
  const analysed = (products || []).filter((p) => p && p.analysis);
  const claimItems = [];
  const useItems = [];
  const promiseItems = [];
  const comparisonItems = [];
  const segCount = {};
  const segCues = {};
  const segAsins = {};
  const otherAudience = [];
  const formats = {};
  const colours = {};
  const certs = {};
  for (const p of analysed) {
    const a = p.analysis;
    for (const m of a.recurring_messages || []) claimItems.push({ asin: p.asin, text: m.message, kind: 'message', seen_on: m.seen_on });
    if (a.main_promise) {
      promiseItems.push({ asin: p.asin, text: a.main_promise.text, kind: 'promise', seen_on: [a.main_promise.where_seen] });
      claimItems.push({ asin: p.asin, text: a.main_promise.text, kind: 'promise', seen_on: [a.main_promise.where_seen] });
    }
    for (const c of (a.packaging && a.packaging.claims_on_pack) || []) claimItems.push({ asin: p.asin, text: c.claim, kind: 'pack_claim', seen_on: c.seen_on });
    for (const c of a.comparison_table_claims || []) {
      comparisonItems.push({ asin: p.asin, text: c.claim, kind: 'comparison', seen_on: c.seen_on, vs_who: c.vs_who });
    }
    for (const u of a.demonstrated_use_cases || []) useItems.push({ asin: p.asin, text: u.use_case, kind: 'use_case', seen_on: u.seen_on, evidence: u.evidence });
    if (a.target_audience) {
      const segs = audienceSegments(a.target_audience);
      if (segs.length) {
        for (const s of segs) {
          segCount[s] = (segCount[s] || 0) + 1;
          (segAsins[s] = segAsins[s] || []).push(p.asin);
          (segCues[s] = segCues[s] || []).push(...a.target_audience.cues.slice(0, 2));
        }
      } else {
        otherAudience.push({ asin: p.asin, text: a.target_audience.who, kind: 'audience', seen_on: [] });
      }
    }
    const pk = a.packaging || {};
    if (pk.format) formats[lc(pk.format)] = (formats[lc(pk.format)] || 0) + 1;
    for (const c of new Set(pk.colours || [])) colours[c] = (colours[c] || 0) + 1;
    for (const c of new Set((pk.certifications_shown || []).map((x) => lc(x.name)))) certs[c] = (certs[c] || 0) + 1;
  }
  const bulletItems = (products || []).flatMap((p) => bulletClaims(p.asin, p.bullets_text));

  const segments = Object.keys(segCount).map((s) => ({ segment: s, products: segCount[s], asins: uniq(segAsins[s]).sort(), example_cues: uniq(segCues[s]).slice(0, 4) }));
  for (const c of clusterItems(otherAudience.map((x) => ({ ...x, group: null })))) segments.push({ segment: c.label, products: c.products, asins: c.asins, example_cues: [], unmatched: true });
  segments.sort((a, b) => b.products - a.products || a.segment.localeCompare(b.segment));

  const top = (obj, n = 10) => Object.entries(obj).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([k, v]) => ({ value: k, products: v }));
  return {
    products_analyzed: analysed.length,
    // Image-derived messages: recurring messages + main promises + pack claims.
    recurring_messages: clusterItems(expandByGroup(claimItems)).map(stripItems),
    main_promises: clusterItems(expandByGroup(promiseItems)).map(stripItems),
    audience_segments: segments,
    use_cases: clusterItems(useItems.map((x) => ({ ...x, group: null }))).map((c) => ({ ...stripItems(c), evidence: uniq(c.items.map((x) => x.evidence)).slice(0, 3) })),
    comparison_table_claims: clusterItems(expandByGroup(comparisonItems)).map((c) => ({ ...stripItems(c), vs_who: uniq(c.items.map((x) => x.vs_who).filter(Boolean)).slice(0, 6) })),
    packaging: { formats: top(formats), colours: top(colours), certifications_shown: top(certs) },
    // Internal (not stored): every claim cluster incl. comparison tables and
    // bullets, which the experienced-vs-claimed join reads. publicRollup() drops it.
    _claims: clusterItems(expandByGroup([...claimItems, ...comparisonItems, ...bulletItems])),
  };
}

/** The roll-up as stored / shown (internal claim clusters removed). */
function publicRollup(rollup) {
  if (!rollup) return rollup;
  const { _claims, ...rest } = rollup;
  return rest;
}

// ─── 4. Experienced vs claimed (pure) ──────────────────────────────────────

/**
 * Does a claim text match a review-theme text? Returns the FIRST rule that
 * holds, or null. Rules, strongest first:
 *   synonym:<group>        both hit the same BENEFIT_GROUPS group
 *   lexicon:<domain>:<re>  both hit the same specific DOMAIN_LEXICON pattern
 *   token_overlap          topic tokens overlap (Jaccard ≥ 0.34, a shared token ≥ 4 chars)
 */
function matchRule(claimText, themeText) {
  const cg = new Set(groupsOf(claimText));
  for (const g of groupsOf(themeText)) if (cg.has(g)) return `synonym:${g}`;
  const cl = specificLexiconHits(claimText);
  if (cl.length) {
    const tl = new Set(specificLexiconHits(themeText).map((h) => `${h.domain}:${h.source}`));
    for (const h of cl) if (tl.has(`${h.domain}:${h.source}`)) return `lexicon:${h.domain}:${h.source}`;
  }
  const a = RS.topicTokens(claimText);
  const b = RS.topicTokens(themeText);
  let inter = 0; let long = false;
  for (const x of a) if (b.has(x)) { inter++; if (x.length >= 4) long = true; }
  const j = a.size + b.size - inter ? inter / (a.size + b.size - inter) : 0;
  if (long && j >= 0.34) return 'token_overlap';
  return null;
}

/** A claim cluster is a customer-experienceable BENEFIT (vs an attribute like "Non-GMO"). */
function isBenefitCluster(c) {
  if (c.key && GROUP_BY_KEY[c.key]) return GROUP_BY_KEY[c.key].experiential;
  const text = [c.seed, ...(c.variants || [])].join(' | ');
  if (groupsOf(text).some((g) => GROUP_BY_KEY[g].experiential)) return true;
  return specificLexiconHits(text).some((h) => h.domain === 'product_efficacy' || h.domain === 'taste_texture');
}

function claimSurface(c) {
  const kinds = new Set(c.items.map((x) => x.kind));
  const imageKinds = ['message', 'promise', 'pack_claim'].filter((k) => kinds.has(k));
  if (imageKinds.length) return 'shown_in_images';
  if (kinds.has('comparison') && kinds.has('bullet')) return 'comparison_table_and_bullets_only';
  if (kinds.has('comparison')) return 'comparison_table_only';
  return 'bullets_only';
}

/**
 * Join claimed benefits with P3b review themes.
 * @param {object} rollup     buildRollup() output (reads rollup._claims)
 * @param {object|null} synthesis  dovive_review_synthesis category row
 * @returns {{ available, items[], counts, excluded_attribute_claims, synthesis }}
 *
 * Verdicts:
 *   experienced      ≥1 matching praise theme, and matching complaint/unmet
 *                    reviews do not outnumber it (counter kept alongside)
 *   contradicted     matching complaint / unmet-need reviews ≥ praise reviews (> 0)
 *   claimed_only     the claiming products HAVE analysed reviews, but no
 *                    review theme matches the claim
 *   no_review_signal no synthesis, or none of the claiming products has
 *                    analysed reviews — silence proves nothing
 */
function buildExperiencedVsClaimed(rollup, synthesis) {
  const themes = synthesis && Array.isArray(synthesis.themes) ? synthesis.themes : [];
  const reviewed = new Set(((synthesis && synthesis.ledger && synthesis.ledger.distinct_asins) || []));
  if (!reviewed.size) for (const t of themes) for (const a of (t.distinct_products && t.distinct_products.asins) || []) reviewed.add(a);
  const claims = (rollup && rollup._claims) || [];
  const benefits = claims.filter(isBenefitCluster);
  const items = benefits.map((c) => {
    const claimText = [c.seed, ...c.variants].join(' | ');
    const matches = [];
    for (const t of themes) {
      const rule = matchRule(claimText, [t.label, ...(t.merged_labels || [])].join(' | '));
      if (!rule) continue;
      const tAsins = (t.distinct_products && t.distinct_products.asins) || [];
      matches.push({
        theme_label: t.label,
        polarity: t.polarity,
        domain: t.domain,
        review_count: t.review_count || 0,
        distinct_products: (t.distinct_products && t.distinct_products.count) || 0,
        on_claiming_products: tAsins.filter((a) => c.asins.includes(a)).length,
        scope: t.scope || null,
        rule,
      });
    }
    matches.sort((a, b) => b.review_count - a.review_count || a.theme_label.localeCompare(b.theme_label));
    const praise = matches.filter((m) => m.polarity === 'praise');
    const against = matches.filter((m) => m.polarity !== 'praise');
    const P = praise.reduce((s, m) => s + m.review_count, 0);
    const C = against.reduce((s, m) => s + m.review_count, 0);
    const claimingReviewed = c.asins.filter((a) => reviewed.has(a)).length;
    let verdict;
    if (!themes.length) verdict = 'no_review_signal';
    else if (C > 0 && C >= P) verdict = 'contradicted';
    else if (P > 0) verdict = 'experienced';
    else verdict = claimingReviewed ? 'claimed_only' : 'no_review_signal';
    const lead = verdict === 'contradicted' ? against[0] : praise[0] || against[0] || null;
    const kinds = {};
    for (const a of c.asins) for (const k of new Set(c.items.filter((x) => x.asin === a).map((x) => x.kind))) kinds[k] = (kinds[k] || 0) + 1;
    return {
      claim: c.label,
      benefit_group: c.key || null,
      variants: c.variants,
      products_claiming: c.products,
      asins: c.asins,
      claimed_via: kinds,
      claim_surface: claimSurface(c),
      seen_on: c.seen_on,
      claiming_products_with_reviews: claimingReviewed,
      review_support: lead ? {
        theme_label: lead.theme_label,
        review_count: lead.review_count,
        distinct_products: lead.distinct_products,
        on_claiming_products: lead.on_claiming_products,
        polarity: lead.polarity,
        rule: lead.rule,
      } : null,
      praise_reviews: P,
      complaint_reviews: C,
      matches: matches.slice(0, 6),
      verdict,
    };
  }).sort((a, b) => b.products_claiming - a.products_claiming || a.claim.localeCompare(b.claim));
  const counts = { experienced: 0, claimed_only: 0, contradicted: 0, no_review_signal: 0 };
  for (const i of items) counts[i.verdict]++;
  return {
    available: themes.length > 0,
    items,
    counts,
    excluded_attribute_claims: claims.length - benefits.length,
    synthesis: synthesis ? { keyword: synthesis.keyword || null, generated_at: synthesis.generated_at || null, status: synthesis.status || null, themes: themes.length, products_with_reviews: reviewed.size } : null,
  };
}

// ─── Ledger, status, cost ──────────────────────────────────────────────────

/**
 * Category coverage ledger. `entries` = [{ inv, images, result }] where
 * result is { ok, cached, attempted, analysis } or null (not attempted).
 */
function buildAssetLedger(entries, { scope = null } = {}) {
  const L = {
    products: entries.length,
    products_with_images: 0,
    products_analyzed: 0,
    products_cached: 0,
    products_failed: 0,
    products_not_attempted: 0,
    images_available: 0,
    gallery_images_available: 0,
    images_selected: 0,
    images_analyzed: 0,
    images_sent_this_run: 0,
    images_unreadable: 0,
    a_plus_available: 0,
    a_plus_unknown: 0,
    a_plus_analyzed: 0,
    a_plus_images_available: 0,
    a_plus_images_analyzed: 0,
    brand_story_images_available: 0,
    brand_story_images_analyzed: 0,
    videos_available: 0,
    products_with_videos: 0,
    a_plus_video_streams: 0,
    review_videos_seen: 0,
    videos_analyzed: 0,
    videos_note: 'Videos are inventoried, not analysed: listing videos are Amazon /vdp/ pages and A+ videos are HLS (.m3u8) streams, and the pipeline has no frame-extraction or transcript path.',
    claims_dropped_unevidenced: 0,
    scope,
  };
  for (const e of entries) {
    const inv = e.inv;
    const gal = inv.gallery.length;
    const ap = inv.a_plus.images.length;
    const br = inv.brand_story.length;
    L.gallery_images_available += gal;
    L.a_plus_images_available += ap;
    L.brand_story_images_available += br;
    L.images_available += gal + ap + br;
    if (gal + ap + br) L.products_with_images++;
    if (inv.a_plus.available === true) L.a_plus_available++;
    if (inv.a_plus.available == null) L.a_plus_unknown++;
    L.videos_available += inv.videos.listing_count + inv.videos.a_plus_streams;
    if (inv.videos.listing_count + inv.videos.a_plus_streams) L.products_with_videos++;
    L.a_plus_video_streams += inv.videos.a_plus_streams;
    L.review_videos_seen += inv.videos.review_videos;
    L.images_selected += (e.images || []).length;
    const r = e.result;
    if (r && r.ok) {
      L.products_analyzed++;
      if (r.cached) L.products_cached++;
      const imgs = e.images || [];
      const unread = new Set((r.analysis && r.analysis.images_unreadable) || []);
      L.images_unreadable += unread.size;
      L.images_analyzed += imgs.filter((i) => !unread.has(i.label)).length;
      if (!r.cached) L.images_sent_this_run += imgs.length;
      const aImgs = imgs.filter((i) => i.kind === 'a+' && !unread.has(i.label)).length;
      L.a_plus_images_analyzed += aImgs;
      L.brand_story_images_analyzed += imgs.filter((i) => i.kind === 'brand' && !unread.has(i.label)).length;
      if (aImgs) L.a_plus_analyzed++;
      L.claims_dropped_unevidenced += (r.analysis && r.analysis.validation && r.analysis.validation.dropped_total) || 0;
    } else if (r && r.attempted) {
      L.products_failed++;
      if (!r.cached) L.images_sent_this_run += (e.images || []).length;
    } else if ((e.images || []).length) {
      L.products_not_attempted++;
    }
  }
  return L;
}

/** complete | partial | inventory_only, from the ledger. */
function computeCategoryStatus(L) {
  if (!L.products_analyzed) return 'inventory_only';
  if (L.products_failed || L.products_not_attempted) return 'partial';
  return 'complete';
}

/** Tokens one image costs, by model family (stated assumption, not measured). */
function tokensPerImage(model, env = {}) {
  const o = Number(env.P7B_TOKENS_PER_IMAGE);
  if (Number.isFinite(o) && o > 0) return o;
  // Gemini 3 default media resolution ≈ 1,120 tokens per image; Claude
  // resizes to ≈ 1.15 MP → ≈ 1,600 tokens (w·h/750).
  return /^~?anthropic\//.test(String(model || '')) ? 1600 : 1120;
}

function pricingFor(model, pricing) {
  if (!pricing || !model) return null;
  return pricing[model] || pricing[String(model).replace(/^~/, '')] || null;
}

/**
 * Cost estimate (no calls): per product, the text prompt (chars/4) + images ×
 * tokensPerImage + completionPerCall (2,000 assumed — generous for this JSON).
 */
function estimateCost(plan, { model, pricing, env = {}, completionPerCall = 2000, promptChars = 4200 } = {}) {
  const tpi = tokensPerImage(model, env);
  let promptTokens = 0; let completion = 0; let calls = 0; let images = 0;
  for (const p of plan) {
    const n = p.images ? p.images.length : p;
    if (!n) continue;
    calls++;
    images += n;
    promptTokens += Math.ceil(promptChars / 4) + n * (tpi + 8);
    completion += completionPerCall;
  }
  const pr = pricingFor(model, pricing);
  const cost = pr ? promptTokens * pr.prompt + completion * pr.completion : null;
  return { calls, images, tokens_per_image: tpi, prompt_tokens: promptTokens, completion_tokens: completion, cost_usd: cost == null ? null : Math.round(cost * 10000) / 10000 };
}

// ─── Prompt block for P7 (market analysis) and P9 (formula brief) ──────────

const VERDICT_LABEL = { experienced: 'EXPERIENCED', claimed_only: 'CLAIMED ONLY', contradicted: 'CONTRADICTED', no_review_signal: 'NO REVIEW SIGNAL' };

function seenLine(s) {
  const parts = [['main', 'main'], ['gallery', 'gallery'], ['a+', 'A+'], ['brand', 'brand story']].filter(([k]) => s && s[k]).map(([k, l]) => `${l} ${s[k]}`);
  return parts.length ? parts.join(', ') : 'bullets / tables only';
}

/**
 * Text block for a prompt, from a dovive_marketing_assets category row.
 * Returns '' when there is nothing usable, so callers stay byte-identical.
 */
function formatMarketingAssetsForPrompt(row, { maxMessages = 14, maxEvc = 16, maxSegments = 8, maxUseCases = 8, maxComparisons = 8 } = {}) {
  if (!row || !row.rollup || !row.rollup.products_analyzed) return '';
  const L = row.ledger || {};
  const R = row.rollup;
  const E = row.experienced_vs_claimed || { items: [] };
  const lines = [];
  lines.push(`Coverage: vision read ${L.images_analyzed ?? '?'} images (${L.a_plus_images_analyzed ?? 0} A+) from ${L.products_analyzed ?? R.products_analyzed} of ${L.products ?? '?'} products${L.products_failed || L.products_not_attempted ? ` — ${L.products_failed || 0} failed, ${L.products_not_attempted || 0} not attempted, so counts are a lower bound` : ''}. Videos: ${L.videos_available ?? 0} available, 0 analysed (no frame/transcript path). Claims without an image label were dropped (${L.claims_dropped_unevidenced ?? 0}).`);
  lines.push('');
  lines.push('RECURRING MESSAGES ON THE IMAGES (products showing it · where seen):');
  const msgs = (R.recurring_messages || []).filter((m) => m.seen_on && (m.seen_on.main + m.seen_on.gallery + m.seen_on['a+'] + m.seen_on.brand) > 0).slice(0, maxMessages);
  lines.push(...(msgs.length ? msgs.map((m) => `- ${m.label}${m.variants && m.variants[0] && m.variants[0] !== m.label ? ` (e.g. "${m.variants[0]}")` : ''} — ${m.products} product${m.products === 1 ? '' : 's'} (${seenLine(m.seen_on)})`) : ['- none']));
  lines.push('');
  lines.push('MAIN PROMISES (what each listing leads with):');
  lines.push(...((R.main_promises || []).slice(0, 8).map((m) => `- ${m.label} — ${m.products} product${m.products === 1 ? '' : 's'}`)));
  lines.push('');
  lines.push('TARGET AUDIENCE SEGMENTS (from visual/verbatim cues):');
  lines.push(...((R.audience_segments || []).slice(0, maxSegments).map((s) => `- ${s.segment} — ${s.products} product${s.products === 1 ? '' : 's'}${s.example_cues && s.example_cues.length ? ` (cues: ${s.example_cues.slice(0, 2).map((c) => `"${c}"`).join(', ')})` : ''}`)));
  lines.push('');
  lines.push('DEMONSTRATED USE CASES:');
  lines.push(...((R.use_cases || []).slice(0, maxUseCases).map((u) => `- ${u.label} — ${u.products} product${u.products === 1 ? '' : 's'}`)));
  if ((R.comparison_table_claims || []).length) {
    lines.push('');
    lines.push('COMPARISON-TABLE CLAIMS (advantages asserted only in comparison charts):');
    lines.push(...R.comparison_table_claims.slice(0, maxComparisons).map((c) => `- ${c.label} — ${c.products} product${c.products === 1 ? '' : 's'}${c.vs_who && c.vs_who.length ? ` (vs ${c.vs_who.slice(0, 3).join(', ')})` : ''}`));
  }
  if (E.items && E.items.length) {
    lines.push('');
    lines.push(`EXPERIENCED vs CLAIMED (claimed benefit → P3b review evidence${E.available ? '' : ' — NO review synthesis available, nothing can be confirmed'}):`);
    for (const i of E.items.slice(0, maxEvc)) {
      const rs = i.review_support;
      const ev = rs ? `${rs.polarity} theme "${rs.theme_label}", ${rs.review_count} reviews across ${rs.distinct_products} products [${rs.rule}]` : i.verdict === 'claimed_only' ? `no matching review theme although ${i.claiming_products_with_reviews} claiming products have analysed reviews` : 'no review data for the claiming products';
      const surf = i.claim_surface !== 'shown_in_images' ? ` [${i.claim_surface.replace(/_/g, ' ')}]` : '';
      lines.push(`- ${VERDICT_LABEL[i.verdict]}: ${i.claim} — claimed by ${i.products_claiming} product${i.products_claiming === 1 ? '' : 's'}${surf}; ${ev}${i.verdict === 'experienced' && i.complaint_reviews ? `; ${i.complaint_reviews} reviews report the opposite` : ''}`);
    }
  }
  return lines.join('\n');
}

module.exports = {
  PROMPT_VERSION,
  BENEFIT_GROUPS,
  AUDIENCE_GROUPS,
  GENERIC_LEXICON_SOURCES,
  groupsOf,
  specificLexiconHits,
  imageIdentity,
  pickResearchRow,
  buildInventory,
  selectImagesForCall,
  assetKey,
  planDigest,
  buildVisionPrompt,
  buildVisionMessages,
  validateAnalysis,
  parseVisionResponse,
  perImageView,
  bucketOf,
  expandByGroup,
  clusterItems,
  bulletClaims,
  buildRollup,
  publicRollup,
  matchRule,
  isBenefitCluster,
  buildExperiencedVsClaimed,
  buildAssetLedger,
  computeCategoryStatus,
  tokensPerImage,
  pricingFor,
  estimateCost,
  formatMarketingAssetsForPrompt,
  isMissingTableError: RS.isMissingTableError,
};
