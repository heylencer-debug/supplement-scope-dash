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
 *   Non-GMO Project      https://www.nongmoproject.org/find-non-gmo/search-participating-products/?search=<q> (403 to scripts)
 *     These four answered 403 (bot protection) to a scripted request, so their
 *     parsers are GENERIC and conservative: a page they cannot recognise is
 *     `registry_unavailable`, never `not_found`.
 *   USDA Organic (NOP Organic Integrity Database)
 *     https://organic.ams.usda.gov/integrity/ — an ASP.NET form postback with no
 *     documented GET query, so it is reported `registry_unavailable` with that
 *     page as the evidence_url for a manual check. Organic certification is of
 *     the OPERATION (brand/manufacturer), not the product.
 */

'use strict';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

// ── claims → registry ───────────────────────────────────────────────────

/** Canonical registry key for a printed claim, or null when no registry covers it. */
function classifyClaim(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
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
      const re = /<font size='\+2'>([^<]*?)(?:&nbsp;)?<\/font>|<td align="left" valign="top" width="28%">([^<]+)<\/td>/gi;
      let company = null;
      let m;
      while ((m = re.exec(html))) {
        if (m[1] != null) company = m[1].replace(/&nbsp;/g, ' ').trim();
        else listings.push({ company, product: m[2].trim(), url: null });
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
      const re = /<li class="listng-results__item[^"]*">([\s\S]*?)<\/li>/gi;
      let m;
      while ((m = re.exec(html))) {
        const block = m[1];
        const product = (block.match(/results__product-name">([^<]*)</) || [])[1];
        const company = (block.match(/results__company-name">([^<]*)</) || [])[1];
        const href = (block.match(/href="(\/certified-products\/listing-detail\.php\?id=\d+)"/) || [])[1];
        if (product || company) listings.push({ company: company ? company.trim() : null, product: product ? product.trim() : null, url: href ? `https://www.nsfsport.com${href}` : null });
      }
      return { recognised: listings.length >= 20, listings };
    },
  },
  usp_verified: genericAdapter('USP Verified', 'product', () => 'https://www.quality-supplements.org/verified-products/verified-products-listings', { minBlocks: 20 }),
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
 * A registry whose markup we could not observe (it refused scripted requests).
 * It recognises a results page only by a known "no results" sentence or by
 * enough repeated result blocks; anything else is unavailable, not not-found.
 */
function genericAdapter(registry, scope, url, { noResults = null, minBlocks = 3 } = {}) {
  return {
    registry,
    scope,
    url,
    parse(html) {
      if (noResults && noResults.test(stripTags(html))) return { recognised: true, listings: [] };
      const blocks = String(html).split(/<(?:tr|li|article)\b/i).slice(1).map((b) => stripTags(b.split(/<\/(?:tr|li|article)>/i)[0])).filter((t) => t.length > 3 && t.length < 400);
      return { recognised: blocks.length >= minBlocks, listings: blocks.map((t) => ({ company: null, product: t, url: null })) };
    },
  };
}

// ── matching ────────────────────────────────────────────────────────────

const GENERIC = new Set(['supplement', 'supplements', 'dietary', 'powder', 'drink', 'mix', 'gummies', 'gummy', 'capsules', 'capsule', 'tablets', 'softgels',
  'with', 'and', 'for', 'the', 'of', 'mg', 'mcg', 'iu', 'count', 'ct', 'pack', 'flavor', 'flavored', 'natural', 'organic', 'vegan', 'free', 'sugar', 'men', 'women']);

function productTokens(s, brand) {
  const b = new Set(norm(brand).split(' '));
  return norm(s).split(' ').filter((t) => t.length > 1 && !GENERIC.has(t) && !b.has(t) && !/^\d+$/.test(t));
}

/**
 * Is this brand (and, for product-level registries, this product) on the listing?
 * @returns {{ listing, quality: 'product'|'brand' } | null}
 */
function matchListing(listings, { brand, title }, scope = 'product') {
  const b = collapse(brand);
  if (!b || b.length < 3) return null;
  const want = productTokens(title, brand);
  let best = null;
  for (const l of listings || []) {
    const hay = collapse(`${l.company || ''} ${l.product || ''}`);
    if (!hay.includes(b)) continue;
    if (scope === 'operation') return { listing: l, quality: 'brand' };
    const have = new Set(productTokens(l.product, brand));
    const shared = want.filter((t) => have.has(t)).length;
    const need = Math.min(2, have.size);
    if (have.size && shared >= need) {
      const score = shared / have.size;
      if (!best || score > best.score) best = { listing: l, quality: 'product', score };
    }
  }
  return best ? { listing: best.listing, quality: best.quality } : null;
}

// ── orchestration ───────────────────────────────────────────────────────

async function fetchPage(url, { fetchImpl, cache, timeoutMs = 20000 }) {
  if (cache && cache.has(url)) return cache.get(url);
  const p = (async () => {
    try {
      const res = await fetchImpl(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' }, timeout: timeoutMs, redirect: 'follow' });
      const body = await res.text();
      return { ok: res.ok, status: res.status, body };
    } catch (e) {
      return { ok: false, status: null, body: '', error: e.message };
    }
  })();
  if (cache) cache.set(url, p);
  return p;
}

async function checkOne(key, { brand, title }, opts) {
  const a = ADAPTERS[key];
  const base = { claim_key: key, registry: a.registry, scope: a.scope };
  if (!a.url) return { ...base, status: 'registry_unavailable', evidence_url: a.manualUrl || null, match: null, reason: 'no public query endpoint — check manually at evidence_url' };
  if (!brand) return { ...base, status: 'registry_unavailable', evidence_url: null, match: null, reason: 'no brand to search the registry with' };
  const url = a.url({ brand, title });
  const page = await fetchPage(url, opts);
  if (!page.ok) return { ...base, status: 'registry_unavailable', evidence_url: url, match: null, reason: page.error ? `request failed: ${page.error}` : `HTTP ${page.status}` };
  const parsed = a.parse(page.body);
  const hit = matchListing(parsed.listings, { brand, title }, a.scope);
  if (hit) return { ...base, status: 'verified', evidence_url: hit.listing.url || url, match: { company: hit.listing.company, product: hit.listing.product, quality: hit.quality }, reason: null };
  if (!parsed.recognised) return { ...base, status: 'registry_unavailable', evidence_url: url, match: null, reason: 'registry page not recognised (layout change or bot wall)' };
  return { ...base, status: 'not_found', evidence_url: url, match: null, reason: `no ${a.scope === 'operation' ? 'operation' : 'product'} listed for brand "${brand}"` };
}

/**
 * @param {object} p        { claims: string[], brand, title }
 * @param {object} [opts]   { enabled (default CERT_VERIFY === '1'), fetchImpl, cache: Map, now: Date }
 * @returns {Promise<Array<object>>} one result per distinct printed claim
 */
async function verifyCertifications({ claims, brand, title } = {}, opts = {}) {
  const enabled = opts.enabled ?? process.env.CERT_VERIFY === '1';
  const checked_at = (opts.now || new Date()).toISOString();
  const fetchImpl = opts.fetchImpl || require('node-fetch');
  const cache = opts.cache || new Map();
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(claims) ? claims : []) {
    const claim = String(raw || '').trim();
    if (!claim || seen.has(claim.toLowerCase())) continue;
    seen.add(claim.toLowerCase());
    const key = classifyClaim(claim);
    if (!key) { out.push({ claim, claim_key: null, registry: null, scope: null, status: 'no_registry', checked_at, evidence_url: null, match: null, reason: 'no certifying registry for this claim' }); continue; }
    const keys = key === 'nsf_any' ? ['nsf_contents', 'nsf_sport'] : [key];
    if (!enabled) {
      out.push({ claim, claim_key: key, registry: keys.map((k) => ADAPTERS[k].registry).join(' / '), scope: ADAPTERS[keys[0]].scope, status: 'not_checked', checked_at, evidence_url: null, match: null, reason: 'registry lookup is off (set CERT_VERIFY=1)' });
      continue;
    }
    let result = null;
    const tried = [];
    for (const k of keys) {
      const r = await checkOne(k, { brand, title }, { fetchImpl, cache, timeoutMs: opts.timeoutMs });
      tried.push(r);
      if (r.status === 'verified') { result = r; break; }
    }
    if (!result) result = tried.find((r) => r.status === 'not_found' && tried.every((t) => t.status === 'not_found')) || tried.find((r) => r.status === 'registry_unavailable') || tried[0];
    out.push({ claim, ...result, claim_key: key, checked_at });
  }
  return out;
}

module.exports = { classifyClaim, matchListing, verifyCertifications, ADAPTERS };
