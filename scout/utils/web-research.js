/**
 * utils/web-research.js — pure core of P5b category web research
 * (phase5b-web-research.js). No network, no database, no model.
 *
 *   buildQueryPlan         ≤ max searches across intents (best-of, review,
 *                          comparison, brand-vs-brand, buying guide, forum,
 *                          third-party testing, brand sites)
 *   normalizeSearchResults Perplexity Search API / Sonar shapes → {url,title,snippet,date}
 *   selectPagesToFetch     round-robin across queries, URL-deduped, capped
 *   parseRobots / robotsAllows
 *   buildExtractionPrompt / parseExtractionResponse / validateExtraction
 *                          verbatim-quote extraction; an item whose quote is
 *                          not in the page is DROPPED and counted
 *   buildRollup            claims / criteria / strengths / weaknesses counted
 *                          by distinct source domain, split by ownership;
 *                          syndicated pages and copied marketing text never
 *                          count as independent
 *   buildVerificationTargets, buildLedger, webEvidenceText, isFresh, estimateCost
 *
 * Tested in test/web-research.test.js.
 */

'use strict';

const SC = require('./source-classify');
const CR = require('./cert-registry-web');

const PROMPT_VERSION = 'p5b-v1';
const OWNERSHIPS = ['independent', 'brand_owned', 'affiliate', 'sponsored', 'unknown'];

// ─── Query plan ─────────────────────────────────────────────────────────────

function cleanKeyword(keyword) {
  return String(keyword || '').replace(/\s*#\d+\s*$/, '').trim();
}

/**
 * Unique, usable competitor brands in rank order.
 * @param {{brand, domain?, asin?}[]} brands
 */
function uniqueBrands(brands = []) {
  const out = [];
  const seen = new Set();
  for (const b of brands) {
    const name = String((b && b.brand) || '').trim();
    const slug = SC.slugify(name);
    if (slug.length < 2 || /^(unknown|generic|na|none|amazonbasics|amazon)$/.test(slug) || seen.has(slug)) continue;
    seen.add(slug);
    out.push({ brand: name, domain: b.domain || null, asin: b.asin || null });
  }
  return out;
}

/**
 * @param {{ keyword, brands?: {brand, domain?}[], year?: number, max?: number }} args
 * @returns {{ id, intent, query, display, domain_filter?, brands? }[]}
 */
function buildQueryPlan({ keyword, brands = [], year = new Date().getFullYear(), max = 12 } = {}) {
  const kw = cleanKeyword(keyword);
  if (!kw || max <= 0) return [];
  const bs = uniqueBrands(brands);
  const q = (intent, query, extra = {}) => ({ intent, query, display: extra.display || query, ...extra });
  const vs = [];
  for (let i = 0; i + 1 < bs.length && vs.length < 2; i += 2) {
    vs.push(q('brand_vs_brand', `${bs[i].brand} vs ${bs[i + 1].brand} ${kw}`, { brands: [bs[i].brand, bs[i + 1].brand] }));
  }
  const site = bs.slice(0, 4).map((b) => (b.domain
    ? q('brand_site', `${b.brand} ${kw}`, { domain_filter: [SC.registrableDomain(b.domain)], display: `${b.brand} ${kw} site:${SC.registrableDomain(b.domain)}`, brands: [b.brand] })
    : q('brand_site', `${b.brand} ${kw} official site`, { brands: [b.brand] })));
  // Priority order so a smaller cap still spans intents.
  const ordered = [
    q('best_of', `best ${kw} ${year}`),
    q('review', `${kw} review`),
    q('comparison', `${kw} comparison`),
    vs[0],
    site[0],
    q('buying_guide', `${kw} buying guide`),
    q('forum', `${kw} reddit`),
    q('third_party_tested', `${kw} third party tested`),
    vs[1],
    site[1],
    site[2],
    site[3],
  ].filter(Boolean);
  return ordered.slice(0, max).map((x, i) => ({ id: `Q${i + 1}`, ...x }));
}

// ─── Search results ────────────────────────────────────────────────────────

/** Perplexity Search API ({results}) or Sonar ({search_results, citations}) → rows. */
function normalizeSearchResults(json) {
  if (!json || typeof json !== 'object') return [];
  const rows = Array.isArray(json.results) ? json.results
    : Array.isArray(json.search_results) ? json.search_results
      : Array.isArray(json.citations) ? json.citations.map((c) => (typeof c === 'string' ? { url: c } : c)) : [];
  const out = [];
  const seen = new Set();
  for (const r of rows) {
    const url = r && (r.url || r.link);
    const norm = SC.normalizeUrl(url);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    out.push({ url, title: (r.title || '').slice(0, 300) || null, snippet: (r.snippet || '').slice(0, 1000) || null, date: r.date || r.last_updated || null });
  }
  return out;
}

const SKIP_FETCH = [
  [/(^|\.)(amazon\.[a-z.]+|amzn\.to)$/i, 'amazon (listing data already collected by P1)'],
  [/(^|\.)(youtube\.com|youtu\.be|tiktok\.com|instagram\.com|facebook\.com|x\.com|twitter\.com|pinterest\.com)$/i, 'social/video page (no article text)'],
];

/**
 * @param {{ query_id, intent, results: {url,title,snippet,date}[] }[]} runs  in plan order
 * @returns {{ sources: object[], toFetch: object[] }}  sources = every unique URL found
 */
function selectPagesToFetch(runs, { maxPages = 20 } = {}) {
  const byNorm = new Map();
  const sources = [];
  const depth = Math.max(0, ...runs.map((r) => (r.results || []).length));
  for (let rank = 0; rank < depth; rank++) {
    for (const run of runs) {
      const r = (run.results || [])[rank];
      if (!r) continue;
      const norm = SC.normalizeUrl(r.url);
      if (!norm) continue;
      if (byNorm.has(norm)) {
        const s = byNorm.get(norm);
        if (!s.found_by.includes(run.query_id)) s.found_by.push(run.query_id);
        continue;
      }
      const s = { url: r.url, norm_url: norm, domain: SC.registrableDomain(SC.hostOf(norm)), title: r.title, snippet: r.snippet, date: r.date, found_by: [run.query_id], intent: run.intent, search_rank: rank + 1 };
      byNorm.set(norm, s);
      sources.push(s);
    }
  }
  const toFetch = [];
  for (const s of sources) {
    const host = SC.hostOf(s.norm_url);
    const skip = SKIP_FETCH.find(([re]) => re.test(host));
    if (skip) { s.fetch_status = 'skipped'; s.skip_reason = skip[1]; continue; }
    if (/\.pdf($|\?)/i.test(s.norm_url)) { s.fetch_status = 'skipped'; s.skip_reason = 'pdf'; continue; }
    if (toFetch.length >= maxPages) { s.fetch_status = 'not_fetched'; s.skip_reason = `P5B_MAX_PAGES cap (${maxPages})`; continue; }
    s.fetch_status = 'pending';
    toFetch.push(s);
  }
  return { sources, toFetch };
}

/** Reddit serves readable HTML on old.reddit.com; everything else is fetched as-is. */
function fetchUrlFor(url) {
  try {
    const u = new URL(url);
    if (/(^|\.)reddit\.com$/i.test(u.hostname)) { u.hostname = 'old.reddit.com'; return u.toString(); }
  } catch { /* ignore */ }
  return url;
}

// ─── robots.txt ─────────────────────────────────────────────────────────────

/** Rules for the given UA token, else for '*'. Returns [{allow: bool, path}] */
function parseRobots(txt, ua = 'dovivescout') {
  const groups = [];
  let cur = null;
  let lastWasAgent = false;
  for (const raw of String(txt || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === 'user-agent') {
      if (!lastWasAgent || !cur) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (!cur) continue;
      if (key === 'disallow' && val) cur.rules.push({ allow: false, path: val });
      else if (key === 'allow' && val) cur.rules.push({ allow: true, path: val });
    }
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== '*' && ua.toLowerCase().includes(a)));
  const pick = mine.length ? mine : groups.filter((g) => g.agents.includes('*'));
  return pick.flatMap((g) => g.rules);
}

function robotsPatternToRe(p) {
  const anchored = p.endsWith('$');
  const body = (anchored ? p.slice(0, -1) : p).split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`);
}

/** Longest matching rule wins; ties go to allow (Google's rule). */
function robotsAllows(rules, pathAndQuery) {
  let best = null;
  for (const r of rules || []) {
    if (!robotsPatternToRe(r.path).test(pathAndQuery)) continue;
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
  }
  return !best || best.allow;
}

// ─── Extraction ─────────────────────────────────────────────────────────────

const FIELDS = ['products_mentioned', 'comparison_criteria', 'ingredient_claims', 'strengths', 'weaknesses', 'pricing', 'evidence_links'];

function buildExtractionPrompt(pages, { keyword, brands = [], pageChars = 12000 } = {}) {
  const kw = cleanKeyword(keyword);
  const brandLine = uniqueBrands(brands).slice(0, 40).map((b) => b.asin ? `${b.brand} (${b.asin})` : b.brand).join('; ');
  const body = pages.map((p) => `=== PAGE ${p.id} ===
URL: ${p.url}
TITLE: ${p.title || ''}
TEXT:
${String(p.text || '').slice(0, pageChars)}
=== END PAGE ${p.id} ===`).join('\n\n');
  return `You extract evidence about the "${kw}" supplement category from web pages. Read each page and report ONLY what the page itself says.

Known Amazon competitors in this category (brand (ASIN)): ${brandLine || 'none listed'}

For EVERY item you report, "quote" must be copied VERBATIM from that page's TEXT (exact words, 5-300 characters, no paraphrase, no stitching sentences together). An item without a verbatim quote will be discarded. Do not use outside knowledge. If a page has nothing for a field, return an empty array.

Return ONE JSON object and nothing else:
{"pages":[{"id":"P1",
  "products_mentioned":[{"brand":"","product":"","asin":null,"quote":""}],
  "comparison_criteria":[{"criterion":"what buyers are told to compare, e.g. 'dose per serving'","quote":""}],
  "ingredient_claims":[{"claim":"short restatement of the claim","ingredient":"","product":null,"quote":""}],
  "strengths":[{"product":"brand/product or null for the category","point":"","quote":""}],
  "weaknesses":[{"product":"brand/product or null for the category","point":"","quote":""}],
  "pricing":[{"product":"","price_text":"exactly as written, e.g. $24.99 or $0.83/serving","quote":""}],
  "evidence_links":[{"url":"a link on the page that the page cites as evidence (study, registry, lab test)","supports":"what it is cited for","quote":""}]
}]}
Include one object per page id: ${pages.map((p) => p.id).join(', ')}.

${body}`;
}

function parseExtractionResponse(content, pageIds) {
  const RS = require('./review-synthesis');
  const parsed = RS.extractJson(content);
  if (!parsed || !Array.isArray(parsed.pages)) return { ok: false, pages: {}, unknown_ids: 0 };
  const ids = new Set(pageIds);
  const pages = {};
  let unknown = 0;
  for (const p of parsed.pages) {
    if (!p || !ids.has(p.id)) { unknown++; continue; }
    pages[p.id] = p;
  }
  return { ok: true, pages, unknown_ids: unknown };
}

function normForMatch(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[‘’‛′`]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Is `quote` verbatim in `text`? Ellipses split the quote into parts that must appear in order. */
function quoteFound(quote, text) {
  const q = normForMatch(quote).replace(/^["']+|["']+$/g, '');
  if (q.length < 5 || (q.match(/[a-z0-9]+/g) || []).length < 2) return false;
  const t = normForMatch(text);
  const parts = q.split(/\s*(?:\.\.\.|…|\[\.\.\.\])\s*/).map((x) => x.trim()).filter(Boolean);
  if (!parts.length || parts.some((p) => p.length < 3)) return false;
  let at = 0;
  for (const p of parts) {
    const i = t.indexOf(p, at);
    if (i < 0) return false;
    at = i + p.length;
  }
  return true;
}

const str = (v, n = 300) => (v == null ? null : String(v).trim().slice(0, n) || null);

/**
 * Keep only items whose quote is verbatim in the page; count what was dropped.
 * @param {object} raw    one page object from the model
 * @param {{text, links?}} page
 * @param {{brands?: {brand, asin?}[]}} opts
 */
function validateExtraction(raw, page, { brands = [] } = {}) {
  const dropped = {};
  const drop = (f) => { dropped[f] = (dropped[f] || 0) + 1; };
  const text = page.text || '';
  const out = {};
  const keep = (field, item, shaped) => {
    if (!item || typeof item !== 'object' || !quoteFound(item.quote, text)) { drop(field); return; }
    out[field].push({ ...shaped, quote: str(item.quote, 400) });
  };
  for (const f of FIELDS) out[f] = [];
  const arr = (f) => (Array.isArray(raw && raw[f]) ? raw[f].slice(0, 60) : []);
  const brandBySlug = new Map(uniqueBrands(brands).map((b) => [SC.slugify(b.brand), b]));

  for (const it of arr('products_mentioned')) {
    if (!it || !str(it.brand) && !str(it.product)) { drop('products_mentioned'); continue; }
    let asin = /^B0[A-Z0-9]{8}$/.test(String(it.asin || '')) ? it.asin : null;
    let asinSource = asin ? 'page' : null;
    if (asin && !text.includes(asin)) { asin = null; asinSource = null; }
    const known = brandBySlug.get(SC.slugify(it.brand));
    if (!asin && known && known.asin) { asin = known.asin; asinSource = 'brand_match'; }
    keep('products_mentioned', it, { brand: str(it.brand, 80), product: str(it.product, 160), asin, asin_source: asinSource });
  }
  for (const it of arr('comparison_criteria')) {
    if (!str(it && it.criterion)) { drop('comparison_criteria'); continue; }
    keep('comparison_criteria', it, { criterion: str(it.criterion, 160) });
  }
  for (const it of arr('ingredient_claims')) {
    if (!str(it && it.claim)) { drop('ingredient_claims'); continue; }
    keep('ingredient_claims', it, { claim: str(it.claim, 240), ingredient: str(it.ingredient, 80), product: str(it.product, 120) });
  }
  for (const f of ['strengths', 'weaknesses']) {
    for (const it of arr(f)) {
      if (!str(it && it.point)) { drop(f); continue; }
      keep(f, it, { product: str(it.product, 120), point: str(it.point, 240) });
    }
  }
  for (const it of arr('pricing')) {
    const price = str(it && it.price_text, 60);
    const digits = price ? price.replace(/[^0-9.]/g, '') : '';
    // the price must actually be in the quote, not just somewhere near it
    if (!price || !digits || !normForMatch(it.quote).replace(/[^0-9.]/g, '').includes(digits)) { drop('pricing'); continue; }
    keep('pricing', it, { product: str(it.product, 120), price_text: price });
  }
  const linkSet = new Set((page.links || []).map((l) => SC.normalizeUrl(l.href)).filter(Boolean));
  for (const it of arr('evidence_links')) {
    const norm = SC.normalizeUrl(it && it.url);
    if (!norm || !linkSet.has(norm)) { drop('evidence_links'); continue; }
    const quote = quoteFound(it.quote, text) ? str(it.quote, 400) : null;
    out.evidence_links.push({ url: it.url, supports: str(it.supports, 200), quote });
  }
  return { extraction: out, dropped };
}

// ─── Roll-up ────────────────────────────────────────────────────────────────

const STOPWORDS = new Set(('a an and or the of to for in on with by from is are was were be been it its this that these those as at ' +
  'can may might will more most very than also has have had not no do does your you they their our we which who what how per ' +
  'product products supplement supplements formula brand').split(' '));

function contentTokens(s) {
  return new Set((String(s || '').toLowerCase().match(/[a-z0-9]+/g) || []).filter((t) => t.length > 2 && !STOPWORDS.has(t)));
}

function setJaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let i = 0;
  for (const x of a) if (b.has(x)) i++;
  return i / (a.size + b.size - i);
}

const KINDS = {
  ingredient_claims: { text: (i) => i.claim, key: (i) => SC.slugify(i.ingredient) },
  comparison_criteria: { text: (i) => i.criterion, key: () => '' },
  strengths: { text: (i) => i.point, key: (i) => SC.slugify(i.product) },
  weaknesses: { text: (i) => i.point, key: (i) => SC.slugify(i.product) },
};

const OWNER_RANK = { independent: 0, affiliate: 1, sponsored: 2, unknown: 3, brand_owned: 4 };

/**
 * @param {{ url, domain, ownership, page_type, duplicate_of?, extraction }[]} pages
 * @param {{ marketing?: {asin, brand, text}[], mergeThreshold?: number }} opts
 */
function buildRollup(pages, { marketing = [], mergeThreshold = 0.5 } = {}) {
  const rollup = {};
  let copiedQuotes = 0;
  const copiedCache = new Map();
  const isCopied = (quote) => {
    if (!copiedCache.has(quote)) copiedCache.set(quote, SC.copiedMarketingMatch(quote, marketing));
    return copiedCache.get(quote);
  };

  for (const [kind, spec] of Object.entries(KINDS)) {
    const groups = [];
    for (const p of pages) {
      for (const item of (p.extraction && p.extraction[kind]) || []) {
        const label = spec.text(item);
        const tokens = contentTokens(label);
        const key = spec.key(item);
        let excluded = null;
        if (p.duplicate_of) excluded = 'duplicate';
        else if (p.ownership !== 'brand_owned') {
          const c = isCopied(item.quote);
          if (c) { excluded = 'copied_marketing'; copiedQuotes++; item.copied_from = `amazon:${c.asin}`; }
        }
        const entry = { item, label, url: p.url, domain: p.domain, ownership: p.ownership, excluded };
        let g = groups.find((x) => x.key === key && setJaccard(x.tokens, tokens) >= mergeThreshold);
        if (!g) { g = { key, tokens, entries: [] }; groups.push(g); }
        else for (const t of tokens) g.tokens.add(t);
        g.entries.push(entry);
      }
    }
    rollup[kind] = groups.map((g) => {
      const counted = g.entries.filter((e) => !e.excluded);
      const domainsBy = (o) => new Set(counted.filter((e) => e.ownership === o).map((e) => e.domain)).size;
      const labelCounts = new Map();
      for (const e of g.entries) labelCounts.set(e.label, (labelCounts.get(e.label) || 0) + 1);
      const label = [...labelCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0][0];
      const products = [...new Set(g.entries.map((e) => e.item.product).filter(Boolean))].slice(0, 12);
      const quotes = [...g.entries]
        .sort((a, b) => (!!a.excluded - !!b.excluded) || (OWNER_RANK[a.ownership] - OWNER_RANK[b.ownership]))
        .slice(0, 5)
        .map((e) => ({ url: e.url, domain: e.domain, ownership: e.ownership, quote: e.item.quote, ...(e.excluded ? { excluded: e.excluded } : {}) }));
      const row = {
        label,
        independent_sources: domainsBy('independent'),
        brand_owned_sources: domainsBy('brand_owned'),
        affiliate_sources: domainsBy('affiliate'),
        sponsored_sources: domainsBy('sponsored'),
        unknown_sources: domainsBy('unknown'),
        total_sources: new Set(counted.map((e) => e.domain)).size,
        duplicate_sources_excluded: new Set(g.entries.filter((e) => e.excluded === 'duplicate').map((e) => e.url)).size,
        copied_marketing_excluded: new Set(g.entries.filter((e) => e.excluded === 'copied_marketing').map((e) => e.url)).size,
        products,
        quotes,
      };
      if (kind === 'ingredient_claims') row.ingredient = g.entries.find((e) => e.item.ingredient)?.item.ingredient || null;
      if (kind === 'strengths' || kind === 'weaknesses') row.product = g.entries[0].item.product || null;
      return row;
    }).sort((a, b) => b.independent_sources - a.independent_sources || b.total_sources - a.total_sources || a.label.localeCompare(b.label));
  }

  // Pricing — observations grouped by product (not counted as "evidence").
  const pricing = new Map();
  for (const p of pages) {
    if (p.duplicate_of) continue;
    for (const it of (p.extraction && p.extraction.pricing) || []) {
      const k = SC.slugify(it.product) || 'category';
      if (!pricing.has(k)) pricing.set(k, { product: it.product || null, observations: [] });
      pricing.get(k).observations.push({ price_text: it.price_text, url: p.url, domain: p.domain, ownership: p.ownership, quote: it.quote });
    }
  }
  rollup.pricing = [...pricing.values()].sort((a, b) => b.observations.length - a.observations.length).slice(0, 40);

  // Products discussed — distinct domains per ownership.
  const prods = new Map();
  for (const p of pages) {
    if (p.duplicate_of) continue;
    for (const it of (p.extraction && p.extraction.products_mentioned) || []) {
      const k = SC.slugify(it.brand) || SC.slugify(it.product);
      if (!k) continue;
      if (!prods.has(k)) prods.set(k, { brand: it.brand || null, product: it.product || null, asin: it.asin || null, domains: {} });
      const e = prods.get(k);
      if (!e.asin && it.asin) e.asin = it.asin;
      (e.domains[p.ownership] = e.domains[p.ownership] || new Set()).add(p.domain);
    }
  }
  rollup.products_discussed = [...prods.values()].map((e) => ({
    brand: e.brand, product: e.product, asin: e.asin,
    independent_sources: e.domains.independent ? e.domains.independent.size : 0,
    brand_owned_sources: e.domains.brand_owned ? e.domains.brand_owned.size : 0,
    affiliate_sources: e.domains.affiliate ? e.domains.affiliate.size : 0,
    sponsored_sources: e.domains.sponsored ? e.domains.sponsored.size : 0,
    total_sources: new Set(Object.values(e.domains).flatMap((s) => [...s])).size,
  })).sort((a, b) => b.independent_sources - a.independent_sources || b.total_sources - a.total_sources).slice(0, 60);

  rollup.copied_marketing_quotes = copiedQuotes;
  return rollup;
}

// ─── Verification targets ───────────────────────────────────────────────────

function buildVerificationTargets(rollup, { brands = [], max = 25 } = {}) {
  const bs = uniqueBrands(brands);
  const brandOf = (names) => {
    for (const n of names || []) {
      const s = SC.slugify(n);
      const b = bs.find((x) => { const bslug = SC.slugify(x.brand); return bslug.length >= 3 && (s === bslug || s.startsWith(bslug)); });
      if (b) return b.brand;
    }
    return null;
  };
  const out = [];
  const seen = new Set();
  const groups = [
    ...(rollup.ingredient_claims || []).map((g) => ({ g, kind: 'ingredient_claims' })),
    ...(rollup.strengths || []).map((g) => ({ g, kind: 'strengths' })),
  ];
  for (const { g, kind } of groups) {
    const text = `${g.label} ${(g.quotes || []).map((q) => q.quote).join(' ')}`;
    for (const d of CR.detectVerifiableClaim(text)) {
      const brand = brandOf([...(g.products || []), g.product].filter(Boolean));
      let t;
      if (d.kind === 'registry') {
        const key = `registry:${d.registry || 'any'}:${brand || ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        t = { kind: 'registry', registry: d.registry, brand, lookups: CR.registryLookup(d.registry, brand) };
      } else {
        const ingredient = g.ingredient || null;
        const pubmed = CR.pubmedSearch(ingredient, g.label);
        const key = `literature:${pubmed ? pubmed.term : g.label}`;
        if (seen.has(key)) continue;
        seen.add(key);
        t = { kind: 'literature', claim_type: d.claim_type, ingredient, pubmed };
        if (!pubmed) t.note = 'No ingredient named — nothing to search.';
      }
      out.push({
        ...t,
        claim: g.label,
        matched: d.matched,
        from: kind,
        sources: { independent: g.independent_sources, brand_owned: g.brand_owned_sources, affiliate: g.affiliate_sources, sponsored: g.sponsored_sources },
        example: (g.quotes || [])[0] || null,
        status: 'not_checked',
        evidence_url: null,
      });
      if (out.length >= max) return out;
    }
  }
  return out;
}

// ─── Ledger, freshness, cost ────────────────────────────────────────────────

function countBy(arr, f) {
  const o = {};
  for (const x of arr) { const k = f(x); if (k != null) o[k] = (o[k] || 0) + 1; }
  return o;
}

function buildLedger({ plan = [], searchRuns = [], sources = [], pages = [], extraction = {}, rollup = {}, cost = {}, model = null, searchEngine = null, verification = [] } = {}) {
  const fetched = pages.filter((p) => p.fetch_status === 'fetched');
  const classified = fetched.filter((p) => p.page_type);
  const extracted = fetched.filter((p) => p.extraction_status === 'ok');
  const counted = classified.filter((p) => !p.duplicate_of);
  const round = (x) => (x == null ? null : Math.round(x * 1e6) / 1e6);
  return {
    prompt_version: PROMPT_VERSION,
    search_engine: searchEngine,
    model,
    queries_planned: plan.length,
    queries_run: searchRuns.filter((r) => r.ok).length,
    queries_failed: searchRuns.filter((r) => !r.ok && r.attempted).length,
    queries_not_attempted: plan.length - searchRuns.filter((r) => r.attempted).length,
    sources_found: sources.length,
    sources_skipped: countBy(sources.filter((s) => s.fetch_status === 'skipped' || s.fetch_status === 'not_fetched'), (s) => s.skip_reason),
    fetch_attempted: pages.filter((p) => p.fetch_status && p.fetch_status !== 'pending').length,
    fetched: fetched.length,
    fetch_failed: pages.filter((p) => p.fetch_status === 'failed').length,
    robots_disallowed: pages.filter((p) => p.fetch_status === 'robots_disallowed').length,
    classified: classified.length,
    extracted: extracted.length,
    extraction_failed: fetched.filter((p) => p.extraction_status === 'failed').length,
    extraction_not_attempted: fetched.filter((p) => !p.extraction_status || p.extraction_status === 'not_attempted').length,
    extraction_skipped: countBy(fetched.filter((p) => /^skipped_/.test(p.extraction_status || '')), (p) => p.extraction_status.replace('skipped_', '')),
    extraction_batches: extraction.batches || null,
    items_kept: extraction.kept || {},
    items_dropped_unquoted: extraction.dropped || {},
    duplicates_removed: classified.filter((p) => p.duplicate_of).length,
    duplicates_by_kind: countBy(classified.filter((p) => p.duplicate_of), (p) => p.duplicate_kind),
    copied_marketing_quotes: rollup.copied_marketing_quotes || 0,
    counted_sources: counted.length,
    by_page_type: countBy(classified, (p) => p.page_type),
    by_ownership: countBy(counted, (p) => p.ownership),
    verification_targets: verification.length,
    verification_checked: verification.filter((v) => v.status && v.status !== 'not_checked').length,
    cost_usd: { search: round(cost.search || 0), extraction: round(cost.extraction || 0), verification: 0, total: round((cost.search || 0) + (cost.extraction || 0)) },
  };
}

function isFresh(row, days, now = Date.now()) {
  if (!row || !row.generated_at || row.status !== 'complete') return false;
  const t = Date.parse(row.generated_at);
  return Number.isFinite(t) && now - t <= days * 86400000;
}

/**
 * Rough per-keyword cost (no calls). Search: flat per request. Extraction:
 * chars/4 tokens; completion assumed 1,200 tokens per page (generous).
 */
function estimateCost({ queries, pages, pageChars = 12000, batchSize = 4, model, pricing = {}, searchPricePerRequest = 0.005, completionPerPage = 1200 }) {
  const calls = Math.ceil(pages / Math.max(1, batchSize));
  const promptTokens = Math.round(pages * (pageChars + 400) / 4 + calls * 700);
  const completionTokens = pages * completionPerPage;
  const p = pricing[model];
  const extraction = p ? promptTokens * p.prompt + completionTokens * p.completion : null;
  const search = queries * searchPricePerRequest;
  return { queries, pages, extraction_calls: calls, prompt_tokens: promptTokens, completion_tokens: completionTokens, search_usd: search, extraction_usd: extraction, total_usd: extraction == null ? null : search + extraction };
}

// ─── Consumer text (P7 / P8) ────────────────────────────────────────────────

function countWords(g) {
  const parts = [`${g.independent_sources} independent`, `${g.brand_owned_sources} brand-owned`];
  if (g.affiliate_sources) parts.push(`${g.affiliate_sources} affiliate`);
  if (g.sponsored_sources) parts.push(`${g.sponsored_sources} sponsored`);
  if (g.unknown_sources) parts.push(`${g.unknown_sources} unlabelled`);
  let s = parts.join(' / ');
  const ex = (g.duplicate_sources_excluded || 0) + (g.copied_marketing_excluded || 0);
  if (ex) s += `; ${ex} copied/syndicated not counted`;
  return s;
}

function firstQuote(g) {
  const q = (g.quotes || []).find((x) => !x.excluded) || (g.quotes || [])[0];
  return q ? ` e.g. "${String(q.quote).slice(0, 180)}" (${q.domain}, ${q.ownership.replace('_', '-')})` : '';
}

/**
 * Compact, source-labelled block for the P7 / P8 prompts. '' when the row is
 * missing or has nothing counted — consumers then leave their prompt unchanged.
 */
function webEvidenceText(row, { max = 15 } = {}) {
  if (!row || !row.rollup) return '';
  const r = row.rollup;
  const l = row.ledger || {};
  const nonEmpty = ['ingredient_claims', 'comparison_criteria', 'strengths', 'weaknesses'].some((k) => (r[k] || []).length);
  if (!nonEmpty) return '';
  const own = l.by_ownership || {};
  const lines = [];
  lines.push(`Coverage: ${l.queries_run ?? '?'} web searches → ${l.sources_found ?? '?'} sources, ${l.fetched ?? '?'} pages read, ${l.extracted ?? '?'} extracted; ${l.duplicates_removed || 0} syndicated/copied pages and ${l.copied_marketing_quotes || 0} quotes copied from Amazon listings NOT counted. Counted pages by owner: ${OWNERSHIPS.map((o) => `${own[o] || 0} ${o.replace('_', '-')}`).join(', ')}.`);
  lines.push('Counts are DISTINCT WEBSITES per owner type. Treat a claim backed only by brand-owned, affiliate or sponsored sources as marketing, not evidence.');
  const section = (title, rows, fmt) => {
    if (!rows || !rows.length) return;
    lines.push(`\n${title}`);
    for (const g of rows.slice(0, max)) lines.push(fmt(g));
  };
  section('Ingredient claims (n independent / n brand-owned sources):', r.ingredient_claims, (g) => `- "${g.label}"${g.ingredient ? ` [${g.ingredient}]` : ''} — ${countWords(g)}.${firstQuote(g)}`);
  section('Comparison criteria reviewers tell buyers to use:', r.comparison_criteria, (g) => `- ${g.label} — ${countWords(g)}.`);
  section('Strengths reported:', r.strengths, (g) => `- ${g.product ? `${g.product}: ` : ''}${g.label} — ${countWords(g)}.${firstQuote(g)}`);
  section('Weaknesses reported:', r.weaknesses, (g) => `- ${g.product ? `${g.product}: ` : ''}${g.label} — ${countWords(g)}.${firstQuote(g)}`);
  const ver = (row.verification || []).filter((v) => v.status && v.status !== 'not_checked');
  if (ver.length) {
    lines.push('\nClaim checks against original sources:');
    for (const v of ver.slice(0, 10)) lines.push(`- "${v.claim}" → ${v.status}${v.evidence_url ? ` (${v.evidence_url})` : ''}${v.note ? ` — ${v.note}` : ''}`);
  }
  return lines.join('\n');
}

module.exports = {
  PROMPT_VERSION,
  OWNERSHIPS,
  FIELDS,
  cleanKeyword,
  uniqueBrands,
  buildQueryPlan,
  normalizeSearchResults,
  selectPagesToFetch,
  fetchUrlFor,
  parseRobots,
  robotsAllows,
  buildExtractionPrompt,
  parseExtractionResponse,
  normForMatch,
  quoteFound,
  validateExtraction,
  contentTokens,
  buildRollup,
  buildVerificationTargets,
  buildLedger,
  isFresh,
  estimateCost,
  webEvidenceText,
};
