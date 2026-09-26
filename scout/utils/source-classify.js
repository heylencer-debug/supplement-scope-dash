/**
 * utils/source-classify.js — pure helpers for P5b web research: turn a fetched
 * HTML page into text, say what KIND of page it is, WHO is speaking (brand,
 * sponsor, affiliate, independent), and whether its text is a copy of another
 * page or of a competitor's own Amazon listing.
 *
 * Every verdict keeps the evidence that produced it (the matched marker and a
 * short snippet), so the dashboard can show WHY a source was labelled
 * affiliate or brand-owned instead of asking the reader to trust a badge.
 *
 * No network, no model. Tested in test/source-classify.test.js.
 */

'use strict';

// ─── URLs ───────────────────────────────────────────────────────────────────

const TRACKING_PARAMS = /^(utm_[a-z]+|fbclid|gclid|msclkid|mc_[a-z]+|ref_?|_ga|igshid|srsltid|spm)$/i;

/** Canonical form for identity/dedupe: https, lowercase host without www, no fragment, no tracking params, no trailing slash. */
function normalizeUrl(u) {
  let url;
  try { url = new URL(String(u || '').trim()); } catch { return null; }
  if (!/^https?:$/.test(url.protocol)) return null;
  url.protocol = 'https:';
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  url.hash = '';
  for (const k of [...url.searchParams.keys()]) if (TRACKING_PARAMS.test(k)) url.searchParams.delete(k);
  url.searchParams.sort();
  let s = url.toString();
  if (s.endsWith('/') && url.pathname !== '/') s = s.slice(0, -1);
  else if (url.pathname === '/' && !url.search) s = s.replace(/\/$/, '');
  return s;
}

function hostOf(u) {
  try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
}

const TWO_LEVEL_TLDS = new Set(['co.uk', 'org.uk', 'com.au', 'net.au', 'co.nz', 'co.jp', 'com.br', 'co.in', 'com.mx', 'co.za']);

/** "blog.brand.co.uk" → "brand.co.uk". Good enough for grouping, not a PSL. */
function registrableDomain(host) {
  const parts = String(host || '').toLowerCase().replace(/^www\./, '').split('.').filter(Boolean);
  if (parts.length <= 2) return parts.join('.');
  const last2 = parts.slice(-2).join('.');
  return TWO_LEVEL_TLDS.has(last2) ? parts.slice(-3).join('.') : last2;
}

function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

// ─── HTML → text ────────────────────────────────────────────────────────────

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘',
  rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…', trade: '™',
  reg: '®', copy: '©', deg: '°', micro: 'µ', middot: '·', bull: '•',
};

function decodeEntities(s) {
  return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    const v = ENTITIES[e.toLowerCase()];
    return v != null ? v : m;
  });
}

const BLOCK_TAGS = /<\/?(p|div|br|li|ul|ol|h[1-6]|tr|td|th|table|section|article|header|footer|blockquote|figcaption|dt|dd|main|aside|nav)\b[^>]*>/gi;

function htmlToText(html) {
  return decodeEntities(String(html || '')
    .replace(BLOCK_TAGS, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function stripNoise(html) {
  return String(html || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe|canvas)\b[\s\S]*?<\/\1>/gi, ' ');
}

function firstMatch(re, s) {
  const m = re.exec(s);
  return m ? m[1] : null;
}

function attr(tag, name) {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return m ? decodeEntities(m[2] ?? m[3] ?? m[4] ?? '') : null;
}

function metaContent(html, key) {
  const re = /<meta\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const k = (attr(tag, 'property') || attr(tag, 'name') || '').toLowerCase();
    if (k === key) return attr(tag, 'content');
  }
  return null;
}

function innerOf(html, tag) {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

/**
 * Parse a fetched page.
 * @returns {{ title, headings, meta_description, site_name, canonical, published,
 *   text, full_text, links: {href, text, rel}[], word_count }}
 *   `text` is the main content (article → main → body, chrome removed);
 *   `full_text` is the whole page (disclosures often live in the footer).
 */
function extractPage(html, url, { maxChars = 60000 } = {}) {
  const clean = stripNoise(html);
  const title = htmlToText(firstMatch(/<title\b[^>]*>([\s\S]*?)<\/title>/i, clean) || '').slice(0, 300);
  const headings = [...innerOf(clean, 'h1'), ...innerOf(clean, 'h2')].map((h) => htmlToText(h)).filter(Boolean).slice(0, 40);
  const canonicalTag = (/<link\b[^>]*rel\s*=\s*["']?canonical["']?[^>]*>/i.exec(clean) || [null])[0];
  let canonical = canonicalTag ? attr(canonicalTag, 'href') : null;
  if (canonical) { try { canonical = new URL(canonical, url).toString(); } catch { canonical = null; } }
  const published = metaContent(clean, 'article:published_time') || metaContent(clean, 'datepublished') || firstMatch(/"datePublished"\s*:\s*"([^"]+)"/i, clean);

  const links = [];
  const linkRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let lm;
  while ((lm = linkRe.exec(clean)) && links.length < 600) {
    const tag = `<a ${lm[1]}>`;
    let href = attr(tag, 'href');
    if (!href || /^(#|javascript:|mailto:|tel:)/i.test(href)) continue;
    try { href = new URL(href, url).toString(); } catch { continue; }
    links.push({ href, text: htmlToText(lm[2]).slice(0, 120), rel: (attr(tag, 'rel') || '').toLowerCase() });
  }

  const bodyHtml = firstMatch(/<body\b[^>]*>([\s\S]*)<\/body>/i, clean) || clean;
  const wordCount = (s) => (s.match(/[A-Za-z0-9]+/g) || []).length;
  const noChrome = (h) => h.replace(/<(nav|header|footer|aside|form)\b[\s\S]*?<\/\1>/gi, ' ');
  let main = null;
  for (const tag of ['article', 'main']) {
    const parts = innerOf(bodyHtml, tag);
    const best = parts.map((p) => htmlToText(noChrome(p))).sort((a, b) => wordCount(b) - wordCount(a))[0];
    if (best && wordCount(best) >= 150) { main = best; break; }
  }
  if (!main) main = htmlToText(noChrome(bodyHtml));
  const fullText = htmlToText(bodyHtml);
  return {
    title,
    headings,
    meta_description: (metaContent(clean, 'description') || metaContent(clean, 'og:description') || '').slice(0, 500),
    site_name: metaContent(clean, 'og:site_name'),
    canonical,
    published: published || null,
    text: main.slice(0, maxChars),
    full_text: fullText.slice(0, maxChars * 2),
    links,
    word_count: wordCount(main),
  };
}

// ─── Page type ──────────────────────────────────────────────────────────────

const RETAILER_HOSTS = /(^|\.)(amazon\.[a-z.]+|amzn\.to|walmart\.com|iherb\.com|target\.com|gnc\.com|vitaminshoppe\.com|cvs\.com|walgreens\.com|costco\.com|ebay\.com|thrivemarket\.com|samsclub\.com|kroger\.com|luckyvitamin\.com|swansonvitamins\.com|pipingrock\.com|bodybuilding\.com|vitacost\.com|riteaid\.com)$/i;
const FORUM_HOSTS = /(^|\.)(reddit\.com|quora\.com|stackexchange\.com|facebook\.com|discord\.com|tiktok\.com|youtube\.com|instagram\.com|x\.com|twitter\.com)$/i;
const NEWS_HOSTS = /(^|\.)(prnewswire\.com|businesswire\.com|globenewswire\.com|apnews\.com|reuters\.com|nytimes\.com|cnn\.com|nbcnews\.com|cbsnews\.com|foxnews\.com|usatoday\.com|washingtonpost\.com|theguardian\.com|bbc\.co\.uk|bbc\.com|nutraingredients\.com|nutraingredients-usa\.com|fooddive\.com)$/i;
// Specialist health / supplement publishers and testers (editorial by default).
const SPECIALIST_HOSTS = /(^|\.)(examine\.com|labdoor\.com|consumerlab\.com|healthline\.com|verywellhealth\.com|verywellfit\.com|medicalnewstoday\.com|webmd\.com|garagegymreviews\.com|barbend\.com|menshealth\.com|womenshealthmag\.com|health\.com|eatingwell\.com|clevelandclinic\.org|mayoclinic\.org|nih\.gov|ods\.od\.nih\.gov|ncbi\.nlm\.nih\.gov|pubmed\.ncbi\.nlm\.nih\.gov|nccih\.nih\.gov|sportsdietitians|precisionnutrition\.com|strongerbyscience\.com)$/i;

const EDITORIAL_TYPES = new Set(['review_article', 'comparison', 'category_guide', 'specialist_blog', 'forum', 'news']);

function brandHostMatch(host, brands = []) {
  const reg = registrableDomain(host);
  const hostSlug = slugify(reg.split('.')[0]);
  for (const b of brands) {
    if (b.domain && registrableDomain(b.domain) === reg) return { brand: b.brand, how: `domain ${reg} is ${b.brand}'s site` };
    const bs = slugify(b.brand);
    if (bs.length >= 4 && hostSlug.length >= 4 && (hostSlug === bs || hostSlug.startsWith(bs) || (bs.startsWith(hostSlug) && hostSlug.length >= 6))) {
      return { brand: b.brand, how: `domain ${reg} matches brand "${b.brand}"` };
    }
  }
  return null;
}

/**
 * @param {{url, title, headings, text}} page
 * @param {{brands?: {brand, domain?}[]}} opts
 * @returns {{ page_type, evidence }}
 */
function classifyPageType(page, { brands = [] } = {}) {
  const url = page.url || '';
  const host = hostOf(url);
  let path = '';
  try { path = decodeURIComponent(new URL(url).pathname).toLowerCase(); } catch { /* ignore */ }
  const titleCues = `${page.title || ''} \n ${path.replace(/[-_/]+/g, ' ')}`.toLowerCase();
  const headingCues = (page.headings || []).slice(0, 6).join(' \n ').toLowerCase();

  if (FORUM_HOSTS.test(host) || /(^|\.)forums?\.|\/(forum|forums|community|threads?)\//.test(`${host}${path}`)) return { page_type: 'forum', evidence: `forum host/path (${host})` };
  const brand = brandHostMatch(host, brands);
  if (brand) return { page_type: 'brand_page', evidence: brand.how };
  if (RETAILER_HOSTS.test(host)) return { page_type: 'retailer', evidence: `retailer host (${host})` };
  if (NEWS_HOSTS.test(host) || /\/(news|press|press-releases?)\//.test(path) || /\bpress release\b/.test(titleCues)) return { page_type: 'news', evidence: `news/press host or path (${host})` };
  // The title decides first; section headings ("How we compared them") only when the title is silent.
  const CUES = [
    ['comparison', /\b(vs\.?|versus|compared|comparison|compare|head[- ]to[- ]head)\b/],
    ['category_guide', /\b(buying guide|buyer'?s guide|how to choose|what to look for|guide to|complete guide|beginner'?s guide)\b/],
    ['review_article', /\b(best|reviews?|reviewed|tested|we tried|top \d+|ranked|rankings?)\b/],
  ];
  for (const [where, text] of [['title', titleCues], ['heading', headingCues]]) {
    for (const [type, re] of CUES) {
      const m = re.exec(text);
      if (m) return { page_type: type, evidence: `${where} cue "${m[1]}"` };
    }
  }
  if (SPECIALIST_HOSTS.test(host)) return { page_type: 'specialist_blog', evidence: `specialist health publisher (${host})` };
  if (/(^|\.)blog\.|\/blog\//.test(`${host}${path}`)) return { page_type: 'specialist_blog', evidence: 'blog host/path' };
  if (/\badd to (cart|bag)\b/i.test(page.text || '') && /\$\s?\d/.test(page.text || '')) return { page_type: 'retailer', evidence: 'add-to-cart + price on page' };
  return { page_type: 'other', evidence: 'no page-type cue matched' };
}

// ─── Ownership ──────────────────────────────────────────────────────────────

const AFFILIATE_LINK_PATTERNS = [
  [/\/\/(www\.)?amzn\.(to|com)\//i, 'amzn short link'],
  [/amazon\.[a-z.]+\/.*[?&]tag=/i, 'Amazon Associates tag='],
  [/[?&](affid|aff_id|affiliate_id|aff|afftrack|irclickid|clickid|subid)=/i, 'affiliate query parameter'],
  [/\/(go|recommends|out|refer|visit|goto|link)\/[^/]+/i, 'affiliate redirect path'],
  [/(shareasale\.com|awin1\.com|linksynergy\.com|anrdoezrs\.net|jdoqocy\.com|tkqlhce\.com|dpbolvw\.net|kqzyfj\.com|go\.skimresources\.com|skimlinks|prf\.hn|howl\.me|geni\.us|impact\.com|sjv\.io|pntra\.com|avantlink\.com|rakuten|pepperjam|refersion)/i, 'affiliate network link'],
];
const AFFILIATE_TEXT = /(we may (earn|receive) (a )?(small )?(commission|compensation)|earns? (us )?a (small )?commission|affiliate (disclosure|links?|commission)|as an amazon associate|commission from qualifying purchases|we (may )?get paid (when|if) you|at no (extra|additional) cost to you)/i;
const SPONSORED_TEXT = /(sponsored (post|content|article|by)|this (post|article|content|review|video) (is|was) sponsored|in (paid )?partnership with|paid partnership|partnered with|advertorial|paid promotion|#ad\b|#sponsored\b|this is a paid)/i;
const OUR_TEXT = /\b(our (formula|formulas|products?|gummies|supplements?|capsules|powders?|founder|mission|ingredients are|team of (scientists|formulators))|we (formulated|formulate|manufacture|make every|developed our|craft(ed)? our)|shop our)\b/i;

const NEGATION = /\b(no|not|never|don'?t|do not|does not|doesn'?t|without|zero|free of)\b[^.!?]{0,25}$/i;

/** First match of `re` whose preceding words are not a negation ("we do not use affiliate links"). */
function firstUnnegated(re, text) {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  let m;
  while ((m = g.exec(text))) {
    if (!NEGATION.test(text.slice(Math.max(0, m.index - 40), m.index))) return m;
    if (m[0].length === 0) g.lastIndex++;
  }
  return null;
}

function snippetAround(text, index, len) {
  const start = Math.max(0, index - 60);
  return text.slice(start, index + len + 60).replace(/\s+/g, ' ').trim();
}

/**
 * @param {{url, page_type, text, full_text, links}} page
 * @param {{brands?: {brand, domain?}[]}} opts
 * @returns {{ ownership: 'brand_owned'|'sponsored'|'affiliate'|'independent'|'unknown', brand?: string, markers: {kind, marker, snippet?}[] }}
 */
function classifyOwnership(page, { brands = [] } = {}) {
  const markers = [];
  const host = hostOf(page.url || '');
  const full = String(page.full_text || page.text || '');

  const bm = brandHostMatch(host, brands);
  if (bm) markers.push({ kind: 'brand_owned', marker: bm.how });
  const our = OUR_TEXT.exec(full);
  const editorialHost = RETAILER_HOSTS.test(host) || FORUM_HOSTS.test(host) || NEWS_HOSTS.test(host) || SPECIALIST_HOSTS.test(host);
  if (our && !editorialHost && page.page_type !== 'review_article' && page.page_type !== 'comparison') {
    markers.push({ kind: 'brand_owned', marker: `first-party language "${our[0]}"`, snippet: snippetAround(full, our.index, our[0].length) });
  }

  const sp = firstUnnegated(SPONSORED_TEXT, full);
  if (sp) markers.push({ kind: 'sponsored', marker: `"${sp[0]}"`, snippet: snippetAround(full, sp.index, sp[0].length) });

  const af = firstUnnegated(AFFILIATE_TEXT, full);
  if (af) markers.push({ kind: 'affiliate', marker: `"${af[0]}"`, snippet: snippetAround(full, af.index, af[0].length) });
  const seen = new Set();
  for (const l of page.links || []) {
    const lhost = hostOf(l.href);
    if (lhost === host) {
      // same-site /go/ redirects are affiliate cloaks; other same-site links are navigation
      if (!/\/(go|recommends|out|refer|visit|goto)\//i.test(l.href)) continue;
    }
    if (/\bsponsored\b/.test(l.rel || '') && !seen.has('rel')) { seen.add('rel'); markers.push({ kind: 'affiliate', marker: 'link rel="sponsored"', snippet: l.href.slice(0, 160) }); }
    for (const [re, label] of AFFILIATE_LINK_PATTERNS) {
      if (!seen.has(label) && re.test(l.href)) { seen.add(label); markers.push({ kind: 'affiliate', marker: label, snippet: l.href.slice(0, 160) }); }
    }
  }

  const has = (k) => markers.some((m) => m.kind === k);
  let ownership = 'unknown';
  if (has('brand_owned')) ownership = 'brand_owned';
  else if (has('sponsored')) ownership = 'sponsored';
  else if (has('affiliate')) ownership = 'affiliate';
  else if (EDITORIAL_TYPES.has(page.page_type) && full.length >= 200) ownership = 'independent';
  const out = { ownership, markers };
  if (bm) out.brand = bm.brand;
  return out;
}

// ─── Syndication (5-word shingles + Jaccard) ────────────────────────────────

function tokenize(text) {
  return String(text || '').toLowerCase().replace(/[‘’']/g, '').match(/[a-z0-9]+/g) || [];
}

function shingles(text, k = 5) {
  const t = Array.isArray(text) ? text : tokenize(text);
  const out = new Set();
  for (let i = 0; i + k <= t.length; i++) out.add(t.slice(i, i + k).join(' '));
  return out;
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  let inter = 0;
  for (const x of small) if (big.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Share of `a`'s shingles that also occur in `b`. */
function containment(a, b) {
  if (!a.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / a.size;
}

/**
 * Similarity used for the syndication verdict: Jaccard, or — when one text is
 * much shorter — the share of the SHORTER text found in the longer one
 * (a copied article with extra boilerplate around it). Tiny texts (< minShingles)
 * only ever use Jaccard, so a two-sentence quote cannot "copy" a page.
 */
function similarity(a, b, { minShingles = 40 } = {}) {
  const j = jaccard(a, b);
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  const c = small.size >= minShingles ? containment(small, big) : 0;
  return c > j ? { score: c, method: 'containment' } : { score: j, method: 'jaccard' };
}

const round2 = (x) => Math.round(x * 100) / 100;

/**
 * Mark syndicated copies among fetched pages and pages that copy a competitor's
 * own Amazon copy. Mutates nothing; returns a Map url → { duplicate_of, kind, similarity, method }.
 *
 * The page kept as the original is: an explicit rel=canonical target among the
 * fetched pages; else the earlier `published` date when both are known; else
 * the one found first (search order).
 *
 * @param {{url, text, canonical?, published?}[]} pages  in search order
 * @param {{asin, brand, text}[]} marketingTexts           competitor bullets + description
 */
function markSyndication(pages, marketingTexts = [], { threshold = 0.6 } = {}) {
  const out = new Map();
  const sh = pages.map((p) => shingles(p.text || ''));
  const byNorm = new Map(pages.map((p, i) => [normalizeUrl(p.url), i]));

  pages.forEach((p, i) => {
    const target = p.canonical ? normalizeUrl(p.canonical) : null;
    if (target && target !== normalizeUrl(p.url) && byNorm.has(target)) {
      out.set(p.url, { duplicate_of: pages[byNorm.get(target)].url, kind: 'canonical_link', similarity: null, method: 'rel=canonical' });
    }
  });

  const earlier = (i, j) => {
    const a = Date.parse(pages[i].published || '');
    const b = Date.parse(pages[j].published || '');
    if (Number.isFinite(a) && Number.isFinite(b) && a !== b) return a < b;
    return i < j;
  };
  for (let i = 0; i < pages.length; i++) {
    for (let j = i + 1; j < pages.length; j++) {
      if (!sh[i].size || !sh[j].size) continue;
      const s = similarity(sh[i], sh[j]);
      if (s.score < threshold) continue;
      const [orig, copy] = earlier(i, j) ? [i, j] : [j, i];
      if (out.has(pages[copy].url) || out.has(pages[orig].url)) continue;
      out.set(pages[copy].url, { duplicate_of: pages[orig].url, kind: 'syndicated_page', similarity: round2(s.score), method: s.method });
    }
  }

  const mk = marketingTexts.map((m) => ({ ...m, sh: shingles(m.text || '') })).filter((m) => m.sh.size);
  pages.forEach((p, i) => {
    if (out.has(p.url) || !sh[i].size) return;
    let best = null;
    for (const m of mk) {
      const j = jaccard(sh[i], m.sh);
      const c = sh[i].size >= 40 ? containment(sh[i], m.sh) : 0;
      const score = Math.max(j, c);
      if (score >= threshold && (!best || score > best.score)) best = { score, method: c > j ? 'containment' : 'jaccard', m };
    }
    if (best) out.set(p.url, { duplicate_of: `amazon:${best.m.asin}`, kind: 'amazon_listing_copy', brand: best.m.brand || null, similarity: round2(best.score), method: best.method });
  });
  return out;
}

/**
 * Is a quote copied from a competitor's own marketing? Quotes of ≥ 5 words:
 * ≥ threshold of the quote's 5-word shingles occur in one listing. Shorter
 * quotes: exact (normalised) substring of a listing.
 * @returns {null | {asin, brand, score}}
 */
function copiedMarketingMatch(quote, marketing, { threshold = 0.6 } = {}) {
  const toks = tokenize(quote);
  if (!toks.length) return null;
  if (toks.length < 5) {
    const q = toks.join(' ');
    const hit = marketing.find((m) => ` ${tokenize(m.text).join(' ')} `.includes(` ${q} `));
    return hit ? { asin: hit.asin, brand: hit.brand || null, score: 1 } : null;
  }
  const qs = shingles(toks);
  let best = null;
  for (const m of marketing) {
    const msh = m.sh || (m.sh = shingles(m.text || ''));
    const c = containment(qs, msh);
    if (c >= threshold && (!best || c > best.score)) best = { asin: m.asin, brand: m.brand || null, score: round2(c) };
  }
  return best;
}

module.exports = {
  normalizeUrl,
  hostOf,
  registrableDomain,
  slugify,
  decodeEntities,
  htmlToText,
  extractPage,
  classifyPageType,
  classifyOwnership,
  brandHostMatch,
  tokenize,
  shingles,
  jaccard,
  containment,
  similarity,
  markSyndication,
  copiedMarketingMatch,
  EDITORIAL_TYPES,
  RETAILER_HOSTS,
  FORUM_HOSTS,
};
