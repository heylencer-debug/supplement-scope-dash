/**
 * utils/cert-registry.js — verify a certification claim with the certifying
 * organisation, not with the logo in a picture.
 *
 * The OCR and the listing text tell us a CLAIM ("NSF Certified for Sport").
 * This module asks the organisation's own public listing whether the brand /
 * product is on it. It never marks a claim `verified` without a registry hit.
 *
 * Per claim result:
 *   { claim, claim_key, registry, scope, status, checked_at, evidence_url, match, reason }
 *   status  verified              the registry lists this brand's product (or, for
 *                                 operation-level registries, the brand's operation)
 *           not_found             the registry answered, recognisably, and it is not there
 *           registry_unavailable  no usable answer: HTTP error, bot wall, unrecognised
 *                                 page, or a registry with no queryable public endpoint
 *           no_registry           the claim has no registry (Vegan, Gluten-Free, GMP,
 *                                 plain "Non-GMO", "Third-Party Tested", …)
 *           not_checked           it has a registry, but verification is off (CERT_VERIFY != 1)
 *                                 or the run's CERT_VERIFY_MAX_MS budget ran out first
 *   claim_key 'facility_claim'    "Manufactured in an NSF Certified Facility" — about the
 *                                 factory, never looked up as a product certification
 *
 * Registries and their public endpoints (probed 2026-09-27 from a residential
 * connection; the parsers below were written against the live markup where it
 * answered):
 *   NSF Contents Tested & Certified (NSF/ANSI 173)
 *     https://info.nsf.org/Certified/Dietary/Listings.asp?TradeName=<q>&Standard=173
 *     200, server-rendered. Company rows `<font size='+2'>Company&nbsp;</font>`,
 *     product rows `<td … width="28%">Trade Designation</td>`,
 *     empty result "No Matching Products Found".
 *   NSF Certified for Sport
 *     https://www.nsfsport.com/certified-products/search-results.php?search=<q>
 *     200, returns the whole catalogue (~2.2 MB) and filters in the browser;
 *     each product is `<li class="listng-results__item …">` with
 *     `results__product-name` / `results__company-name` and a
 *     `listing-detail.php?id=` link. Fetched once per run (cached).
 *   USP Verified         https://www.quality-supplements.org/verified-products/verified-products-listings   (403 to scripts)
 *   Informed Sport       https://sport.wetestyoutrust.com/supplement-search?search=<q>                       (403 to scripts)
 *   Informed Choice      https://choice.wetestyoutrust.com/supplement-search?search=<q>                      (403 to scripts)
 *   Non-GMO Project      https://www.nongmoproject.org/find-non-gmo/search-participating-products/?search=<q>
 *     (301 then a 200 JavaScript shell: the results load in the browser, so the
 *     HTML never contains them — review round 2026-09-27)
 *     These four are parsed GENERICALLY and conservatively: they can VERIFY
 *     (a block naming the brand and product) and say `not_found` only on an
 *     explicit no-results sentence; any other page is `registry_unavailable`.
 *   USDA Organic (NOP Organic Integrity Database)
 *     https://organic.ams.usda.gov/integrity/ — an ASP.NET form postback with no
 *     documented GET query, so it is reported `registry_unavailable` with that
 *     page as the evidence_url for a manual check. Organic certification is of
 *     the OPERATION (brand/manufacturer), not the product.
 */

'use strict';

const { extractFlavors } = require('./label-variant');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

// ── claims → registry ───────────────────────────────────────────────────

/** Canonical registry key for a printed claim, or null when no registry covers it. */
function classifyClaim(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  // "Manufactured in an NSF Certified Facility", "Made in a GMP facility":
  // a statement about the factory, never a certification of this product.
  if (/facilit|manufactured\s+in|produced\s+in|made\s+in\s+an?\b|(?:registered|certified|inspected|manufacturing)\s+plant\b/i.test(s)) return 'facility_claim';
  if (/certified\s*for\s*sport/i.test(s)) return 'nsf_sport';
  if (/\bnsf\b/i.test(s)) {
    if (/gmp|facility|registered/i.test(s)) return null; // facility GMP registration is not a product certification
    if (/contents\s*tested|173/i.test(s)) return 'nsf_contents';
    return 'nsf_any';
  }
  if (/\busp\b/i.test(s)) return /verified|verification/i.test(s) ? 'usp_verified' : null; // "USP grade" is an ingredient spec
  if (/informed[\s-]*sport/i.test(s)) return 'informed_sport';
  if (/informed[\s-]*choice/i.test(s)) return 'informed_choice';
  if (/non[\s-]*gmo\s*project/i.test(s)) return 'non_gmo_project';
  if (/\borganic\b/i.test(s) && !/non[\s-]*organic/i.test(s)) return 'usda_organic';
  return null;
}

function enc(s) { return encodeURIComponent(String(s || '').trim()); }
function norm(s) {
  return String(s || '').toLowerCase()
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#39;|&rsquo;|’/g, "'")
    .replace(/[®™©]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function collapse(s) { return norm(s).replace(/ /g, ''); }
function stripTags(h) { return String(h || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }

// ── adapters ────────────────────────────────────────────────────────────

const ADAPTERS = {
  nsf_contents: {
    registry: 'NSF Contents Tested & Certified (NSF/ANSI 173)',
    scope: 'product',
    url: ({ brand }) => `https://info.nsf.org/Certified/Dietary/Listings.asp?TradeName=${enc(brand)}&Standard=173`,
    parse(html) {
      if (/No Matching Products Found/i.test(html)) return { recognised: true, listings: [] };
      const listings = [];
      // company header, then rows: Trade Designation | Product ID | Product Form | Serving
      const re = /<font size='\+2'>([^<]*?)(?:&nbsp;)?<\/font>|<td align="left" valign="top" width="28%">([^<]+)<\/td>\s*<td[^>]*>[^<]*<\/td>\s*<td[^>]*>([^<]*)<\/td>/gi;
      let company = null;
      let m;
      while ((m = re.exec(html))) {
        if (m[1] != null) company = m[1].replace(/&nbsp;/g, ' ').trim();
        else listings.push({ company, product: m[2].trim(), form: formOf(m[3]), url: null });
      }
      return { recognised: listings.length > 0 || /NSF Product and Service Listings/i.test(html), listings };
    },
  },
  nsf_sport: {
    registry: 'NSF Certified for Sport',
    scope: 'product',
    // The page ignores the query and returns the whole catalogue; one fetch serves every product.
    url: () => 'https://www.nsfsport.com/certified-products/search-results.php',
    parse(html) {
      const listings = [];
      const re = /<li class="listng-results__item([^"]*)">([\s\S]*?)<\/li>/gi;
      let m;
      while ((m = re.exec(html))) {
        const block = m[2];
        const form = formOf(m[1]); // the class list carries the form ("… 173 Powder Hydration …")
        const product = (block.match(/results__product-name">([^<]*)</) || [])[1];
        const company = (block.match(/results__company-name">([^<]*)</) || [])[1];
        const href = (block.match(/href="(\/certified-products\/listing-detail\.php\?id=\d+)"/) || [])[1];
        if (product || company) listings.push({ company: company ? company.trim() : null, product: product ? product.trim() : null, form, url: href ? `https://www.nsfsport.com${href}` : null });
      }
      return { recognised: listings.length >= 20, listings };
    },
  },
  usp_verified: genericAdapter('USP Verified', 'product', () => 'https://www.quality-supplements.org/verified-products/verified-products-listings'),
  informed_sport: genericAdapter('Informed Sport', 'product', ({ brand }) => `https://sport.wetestyoutrust.com/supplement-search?search=${enc(brand)}`, { noResults: /no (?:products|results) (?:were )?found/i }),
  informed_choice: genericAdapter('Informed Choice', 'product', ({ brand }) => `https://choice.wetestyoutrust.com/supplement-search?search=${enc(brand)}`, { noResults: /no (?:products|results) (?:were )?found/i }),
  non_gmo_project: genericAdapter('Non-GMO Project Verified', 'product', ({ brand }) => `https://www.nongmoproject.org/find-non-gmo/search-participating-products/?search=${enc(brand)}`, { noResults: /no (?:products|results) (?:were )?found|0 results/i }),
  usda_organic: {
    registry: 'USDA Organic (NOP Organic Integrity Database)',
    scope: 'operation',
    manualUrl: 'https://organic.ams.usda.gov/integrity/',
    url: null,
    parse: null,
  },
};

/**
 * A registry whose markup we could not observe (it refused scripted requests,
 * or answered with a JavaScript shell whose results load later — the Non-GMO
 * Project does, and its 4 navigation <li>s once passed for "results").
 * It can VERIFY (a block naming the brand and the product), and it can say
 * NOT FOUND only on an explicit no-results sentence. Anything else is
 * `registry_unavailable`.
 */
function genericAdapter(registry, scope, url, { noResults = null } = {}) {
  return {
    registry,
    scope,
    url,
    parse(html) {
      const explicitNone = !!(noResults && noResults.test(stripTags(html)));
      const blocks = String(html).split(/<(?:tr|li|article)\b/i).slice(1).map((b) => stripTags(b.split(/<\/(?:tr|li|article)>/i)[0])).filter((t) => t.length > 3 && t.length < 400);
      return { recognised: explicitNone, listings: explicitNone ? [] : blocks.map((t) => ({ company: null, product: t, form: formOf(t), url: null })) };
    },
  };
}

// ── matching ────────────────────────────────────────────────────────────

// Words that say nothing about WHICH product this is.
const GENERIC = new Set(['supplement', 'supplements', 'dietary', 'drink', 'mix', 'vitamin', 'vitamins', 'with', 'and', 'for', 'the', 'of', 'plus',
  'mg', 'mcg', 'iu', 'count', 'ct', 'pack', 'flavor', 'flavored', 'natural', 'organic', 'vegan', 'free', 'sugar', 'men', 'women', 'adult', 'adults',
  'kids', 'canada', 'usa', 'formula', 'support', 'extra', 'strength', 'high', 'potency', 'daily', 'all', 'new', 'size', 'oz', 'fl', 'g']);

// Dosage forms: compared separately — a gummy is not a capsule.
const FORMS = [
  [/\bgumm(?:y|ies)\b/, 'gummy'], [/\bsoft\s*gels?\b|\bsoftgels?\b/, 'softgel'], [/\b(?:veg(?:gie)?\s*)?cap(?:sule)?s?\b|\bvcaps?\b/, 'capsule'],
  [/\btab(?:let)?s?\b|\bcaplets?\b/, 'tablet'], [/\bpowders?\b/, 'powder'], [/\bstick\s*packs?\b|\bsticks?\b|\bstickpacks?\b/, 'stick'],
  [/\bpackets?\b|\bsachets?\b/, 'packet'], [/\bchews?\b|\bchewables?\b/, 'chew'], [/\bliquids?\b|\bshots?\b/, 'liquid'], [/\bbars?\b/, 'bar'],
];
const FORM_WORDS = /^(gumm(y|ies)|softgels?|soft|gels?|caps?|capsules?|veggie|vcaps?|tab|tabs|tablets?|caplets?|powders?|sticks?|stickpacks?|packets?|sachets?|chews?|chewables?|liquids?|shots?|bars?)$/;

// Powders sold in sticks or packets are the same product form.
const FORM_FAMILY = { stick: 'powder', packet: 'powder' };

/** The first dosage form named in the text, as a comparable family. */
function formOf(s) {
  const t = norm(s);
  if (!t) return null;
  let best = null;
  for (const [re, f] of FORMS) {
    const m = re.exec(t);
    if (m && (!best || m.index < best.index)) best = { index: m.index, form: f };
  }
  return best ? (FORM_FAMILY[best.form] || best.form) : null;
}

/** [start, end) of the run of whole words that collapses to the brand, or null. */
function brandSpan(words, brand) {
  const want = collapse(brand);
  if (!want || want.length < 3) return null;
  for (let i = 0; i < words.length; i++) {
    let acc = '';
    for (let j = i; j < words.length && acc.length < want.length; j++) {
      acc += words[j];
      if (acc === want) return [i, j + 1];
    }
  }
  return null;
}

/** Brand on word boundaries: "Liquid I.V." ~ "Liquid IV", but "Olly" ≁ "Jolly Rancher". */
function brandIn(text, brand) {
  return !!brandSpan(norm(text).split(' ').filter(Boolean), brand);
}

/** The text's words with every run spelling the brand removed ("Liquid I.V." is not a liquid). */
function withoutBrand(s, brand) {
  let words = norm(s).split(' ').filter(Boolean);
  for (let span = brandSpan(words, brand); span; span = brandSpan(words, brand)) words = [...words.slice(0, span[0]), ...words.slice(span[1])];
  return words;
}

/** Distinctive product words, de-duplicated, without the brand, generic or form words. */
function productTokens(s, brand) {
  return [...new Set(withoutBrand(s, brand).filter((t) => t.length > 1 && !GENERIC.has(t) && !FORM_WORDS.test(t) && !/^\d+[a-z]*$/.test(t)))];
}

/**
 * Is this brand (and, for product-level registries, this product) on the listing?
 * Product level needs EVERY distinctive word of the listing's product name in
 * the title (so "Magnesium Bisglycinate" never verifies "Magnesium CitraMate"),
 * at least one such word, and the dosage form to agree when both state one.
 * @returns {{ listing, quality: 'product'|'brand' } | null}
 */
function matchListing(listings, { brand, title }, scope = 'product') {
  if (!brand || collapse(brand).length < 3) return null;
  const want = new Set(productTokens(title, brand));
  const titleForm = formOf(withoutBrand(title, brand).join(' '));
  const titleFlavors = extractFlavors(title);
  let best = null;
  for (const l of listings || []) {
    if (!brandIn(`${l.company || ''} ${l.product || ''}`, brand)) continue;
    if (scope === 'operation') return { listing: l, quality: 'brand' };
    const have = productTokens(l.product, brand);
    if (!have.length) continue;
    if (!have.every((t) => want.has(t))) continue;
    const listingForm = l.form || formOf(withoutBrand(l.product, brand).join(' '));
    if (titleForm && listingForm && titleForm !== listingForm) continue;
    // NSF lists per flavour: when both name one, the flavour phrases must agree
    // ("DripDrop® Lemon" is not "DripDrop … Lemon Lime").
    const lf = extractFlavors(l.product);
    if (lf.length && titleFlavors.length && !lf.some((f) => titleFlavors.includes(f))) continue;
    // most distinctive words wins; on a tie the plainest name ("… CitraMate" over "… CitraMate (Canada)")
    const score = have.length * 1000 - norm(l.product).length;
    if (!best || score > best.score) best = { listing: l, quality: 'product', score };
  }
  return best ? { listing: best.listing, quality: best.quality } : null;
}

// ── orchestration ───────────────────────────────────────────────────────

/** At most `n` requests in flight per registry (host), shared across products. */
function limiter(n) {
  let active = 0;
  const queue = [];
  const next = () => { if (active < n && queue.length) { active++; queue.shift()(); } };
  return (fn) => new Promise((resolve, reject) => {
    queue.push(() => fn().then(resolve, reject).finally(() => { active--; next(); }));
    next();
  });
}

async function fetchPage(url, { fetchImpl, cache, limiters, concurrency = 2, timeoutMs = 20000 }) {
  if (cache && cache.has(url)) return cache.get(url);
  const host = (() => { try { return new URL(url).host; } catch (_) { return url; } })();
  if (limiters && !limiters.has(host)) limiters.set(host, limiter(concurrency));
  const run = limiters ? limiters.get(host) : (fn) => fn();
  const p = run(async () => {
    try {
      const res = await fetchImpl(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' }, timeout: timeoutMs, redirect: 'follow' });
      const body = await res.text();
      return { ok: res.ok, status: res.status, body };
    } catch (e) {
      return { ok: false, status: null, body: '', error: e.message };
    }
  });
  if (cache) cache.set(url, p);
  return p;
}

async function checkOne(key, { brand, title }, opts) {
  const a = ADAPTERS[key];
  const base = { claim_key: key, registry: a.registry, scope: a.scope };
  if (!a.url) return { ...base, status: 'registry_unavailable', evidence_url: a.manualUrl || null, match: null, reason: 'no public query endpoint — check manually at evidence_url' };
  if (!brand) return { ...base, status: 'registry_unavailable', evidence_url: null, match: null, reason: 'no brand to search the registry with' };
  const url = a.url({ brand, title });
  if (opts.deadline && Date.now() > opts.deadline && !(opts.cache && opts.cache.has(url))) {
    return { ...base, status: 'not_checked', evidence_url: null, match: null, reason: 'CERT_VERIFY_MAX_MS reached before this lookup' };
  }
  const page = await fetchPage(url, opts);
  if (!page.ok) return { ...base, status: 'registry_unavailable', evidence_url: url, match: null, reason: page.error ? `request failed: ${page.error}` : `HTTP ${page.status}` };
  const parsed = a.parse(page.body);
  const hit = matchListing(parsed.listings, { brand, title }, a.scope);
  if (hit) return { ...base, status: 'verified', evidence_url: hit.listing.url || url, match: { company: hit.listing.company, product: hit.listing.product, form: hit.listing.form || null, quality: hit.quality }, reason: null };
  if (!parsed.recognised) return { ...base, status: 'registry_unavailable', evidence_url: url, match: null, reason: 'registry page not recognised — no explicit "no results" and no listing for this brand (layout change, JavaScript-rendered results or bot wall)' };
  return { ...base, status: 'not_found', evidence_url: url, match: null, reason: `no ${a.scope === 'operation' ? 'operation' : 'product'} listed for brand "${brand}" matching this product` };
}

/**
 * @param {object} p        { claims: string[], brand, title }
 * @param {object} [opts]   { enabled (default CERT_VERIFY === '1'), fetchImpl, cache: Map, limiters: Map,
 *                            deadline: epoch ms after which no new request is made, now: Date }
 * @returns {Promise<Array<object>>} one result per distinct printed claim
 */
async function verifyCertifications({ claims, brand, title } = {}, opts = {}) {
  const enabled = opts.enabled ?? process.env.CERT_VERIFY === '1';
  const checked_at = (opts.now || new Date()).toISOString();
  const fetchImpl = opts.fetchImpl || require('node-fetch');
  const cache = opts.cache || new Map();
  const limiters = opts.limiters || new Map();
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(claims) ? claims : []) {
    const claim = String(raw || '').trim();
    if (!claim || seen.has(claim.toLowerCase())) continue;
    seen.add(claim.toLowerCase());
    const key = classifyClaim(claim);
    if (key === 'facility_claim') { out.push({ claim, claim_key: key, registry: null, scope: 'facility', status: 'no_registry', checked_at, evidence_url: null, match: null, reason: 'a statement about the manufacturing facility, not a certification of this product' }); continue; }
    if (!key) { out.push({ claim, claim_key: null, registry: null, scope: null, status: 'no_registry', checked_at, evidence_url: null, match: null, reason: 'no certifying registry for this claim' }); continue; }
    const keys = key === 'nsf_any' ? ['nsf_contents', 'nsf_sport'] : [key];
    if (!enabled) {
      out.push({ claim, claim_key: key, registry: keys.map((k) => ADAPTERS[k].registry).join(' / '), scope: ADAPTERS[keys[0]].scope, status: 'not_checked', checked_at, evidence_url: null, match: null, reason: 'registry lookup is off (set CERT_VERIFY=1)' });
      continue;
    }
    let result = null;
    const tried = [];
    for (const k of keys) {
      const r = await checkOne(k, { brand, title }, { fetchImpl, cache, limiters, concurrency: opts.concurrency, timeoutMs: opts.timeoutMs, deadline: opts.deadline });
      tried.push(r);
      if (r.status === 'verified') { result = r; break; }
    }
    if (!result) result = (tried.every((t) => t.status === 'not_found') && tried[0]) || tried.find((r) => r.status === 'registry_unavailable') || tried.find((r) => r.status === 'not_checked') || tried[0];
    out.push({ claim, ...result, claim_key: key, checked_at });
  }
  return out;
}

module.exports = { classifyClaim, matchListing, verifyCertifications, formOf, ADAPTERS };
