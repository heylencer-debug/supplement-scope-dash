/**
 * utils/cert-registry-web.js — claim-verification hooks for P5b web research.
 *
 * OVERLAP NOTE: another builder (feat/label-verification) is writing
 * utils/cert-registry.js for LABEL certifications. That file had not landed
 * when this was written (2026-09-27), so this module stands alone and only
 * covers what web claims need: spotting a verifiable claim, building the
 * registry / PubMed lookup, and parsing the answer. When cert-registry.js
 * lands, registryLookup() here should delegate to it and this file should
 * keep only the web-claim detection and the PubMed half.
 *
 * Honesty rule: a target is 'supported' ONLY when a fetched page/API response
 * contains a hit. Anything not fetched is 'not_checked'; a fetched miss is
 * 'not_found'; a registry page that did not return its listing format (error
 * page, redesign) is 'registry_unavailable' — never 'not_found'. A literature
 * search is only ever run with an OUTCOME term (ingredient alone proves
 * nothing), and negated claims ("no studies show…") are not targets. Registries whose listing pages are not server-rendered (or
 * whose URL scheme we have not confirmed) are never fetched — they carry a
 * human lookup URL and stay 'not_checked'.
 */

'use strict';

// Confirmed 2026-09-27: server-rendered, "Number of matching Products is N".
const NSF_DIETARY = (brand) => `https://info.nsf.org/Certified/Dietary/Listings.asp?Company=&TradeName=${encodeURIComponent(brand)}`;

const REGISTRIES = {
  'NSF': { lookup: NSF_DIETARY, checkable: true, parser: 'nsf_listing' },
  // Landing pages only — searched in-browser, not fetchable as plain HTML.
  'NSF Certified for Sport': { lookup: () => 'https://www.nsfsport.com/certified-products/', checkable: false },
  'USP': { lookup: () => 'https://www.quality-supplements.org/verified-products', checkable: false },
  'Informed Sport': { lookup: () => 'https://sport.wetestyoutrust.com/search', checkable: false },
  'Informed Choice': { lookup: () => 'https://choice.wetestyoutrust.com/search', checkable: false },
  'BSCG': { lookup: () => 'https://www.bscg.org/certified-drug-free/', checkable: false },
};

const CLAIM_PATTERNS = [
  { re: /\bnsf[- ]certified for sport\b|\bcertified for sport\b/i, kind: 'registry', registry: 'NSF Certified for Sport' },
  { re: /\bnsf\b(?![- ]certified for sport)/i, kind: 'registry', registry: 'NSF' },
  { re: /\busp[- ]verified\b|\busp\b.{0,20}\bverified\b/i, kind: 'registry', registry: 'USP' },
  { re: /\binformed[- ]sport\b/i, kind: 'registry', registry: 'Informed Sport' },
  { re: /\binformed[- ]choice\b/i, kind: 'registry', registry: 'Informed Choice' },
  { re: /\bbscg\b/i, kind: 'registry', registry: 'BSCG' },
  { re: /\b(third[- ]party|3rd[- ]party|independent(ly)?)[- ](lab[- ])?(tested|testing|verified|certified)\b/i, kind: 'registry', registry: null },
  { re: /\bclinically[- ](proven|studied|tested|shown|backed|validated|researched)\b/i, kind: 'literature', claim_type: 'clinically_proven' },
  { re: /\b(studies|research|trials?) (show|shows|showed|suggest|suggests|found|find|have shown|demonstrate[sd]?)\b|\bbacked by (science|research|studies)\b|\b(randomi[sz]ed|placebo[- ]controlled|double[- ]blind)\b/i, kind: 'literature', claim_type: 'studied' },
];

const STATUSES = ['supported', 'not_found', 'not_checked', 'registry_unavailable'];

// "no studies show", "not clinically proven", "isn't third-party tested", "lack of research"
const NEGATED = /\b(no|not|never|isn'?t|aren'?t|wasn'?t|without|lacks?|lacking|zero|unproven|few|little)\b[^.!?]{0,20}$/i;

/** First match of `re` in `text` that is not negated by the few words before it. */
function unnegatedMatch(re, text) {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  let m;
  while ((m = g.exec(text))) {
    if (!NEGATED.test(text.slice(Math.max(0, m.index - 30), m.index))) return m;
  }
  return null;
}

/** Which verification kinds does a claim sentence call for? (may be several; negated claims excluded) */
function detectVerifiableClaim(text) {
  const out = [];
  const seen = new Set();
  for (const p of CLAIM_PATTERNS) {
    const m = unnegatedMatch(p.re, String(text || ''));
    if (!m) continue;
    const key = `${p.kind}:${p.registry || p.claim_type || 'any'}`;
    if (seen.has(key)) continue;
    // a named NSF-for-Sport claim should not ALSO produce plain NSF
    if (p.registry === 'NSF' && seen.has('registry:NSF Certified for Sport')) continue;
    seen.add(key);
    out.push({ kind: p.kind, registry: p.registry ?? null, claim_type: p.claim_type ?? null, matched: m[0] });
  }
  return out;
}

function registryLookup(registry, brand) {
  if (!registry) {
    return Object.entries(REGISTRIES)
      .filter(([name]) => ['NSF', 'USP', 'Informed Sport'].includes(name))
      .map(([name, r]) => ({ registry: name, url: r.lookup(brand || ''), checkable: !!(r.checkable && brand) }));
  }
  const r = REGISTRIES[registry];
  if (!r) return [];
  return [{ registry, url: r.lookup(brand || ''), checkable: !!(r.checkable && brand) }];
}

const STOP = new Set(('a an and are as at be been by can clinically proven studied tested shown backed validated researched study studies research ' +
  'trial trials show shows showed suggest suggests found find have has demonstrated demonstrate demonstrates science randomized randomised placebo ' +
  'controlled double blind to of for in on the this that with from your you it its is was were helps help may support supports supporting ' +
  'improve improves reduce reduces promote promotes boost boosts daily per mg dose doses formula product products supplement supplements ' +
  'our we more most than also other into over up out not no only just very highly shown effective effectively').split(' '));

/** Outcome words of a claim, minus claim boilerplate and the ingredient itself. */
function outcomeTerms(claim, ingredient, max = 2) {
  const ing = new Set(String(ingredient || '').toLowerCase().match(/[a-z0-9]+/g) || []);
  const toks = (String(claim || '').toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) || []).filter((t) => !STOP.has(t) && !ing.has(t));
  return [...new Set(toks)].slice(0, max);
}

/**
 * PubMed E-utilities esearch for "<ingredient> AND <outcome> AND (RCT OR clinical trial)".
 * Returns { api_url, human_url, term, outcomes } or null when there is no
 * ingredient OR no outcome term — a search on the ingredient alone would
 * "support" any claim about it.
 */
function pubmedSearch(ingredient, claim) {
  const ing = String(ingredient || '').trim();
  if (!ing) return null;
  const outcomes = outcomeTerms(claim, ing);
  if (!outcomes.length) return null;
  const parts = [`"${ing}"[Title/Abstract]`, ...outcomes.map((o) => `${o}[Title/Abstract]`), '(randomized controlled trial[pt] OR clinical trial[pt])'];
  const term = parts.join(' AND ');
  return {
    term,
    outcomes,
    api_url: `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=5&sort=relevance&term=${encodeURIComponent(term)}`,
    human_url: `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(term)}`,
  };
}

/** esearch JSON → { count, ids }. Anything malformed → count 0. */
function parsePubmedResult(json) {
  const r = json && json.esearchresult;
  const ids = Array.isArray(r && r.idlist) ? r.idlist.filter((x) => /^\d+$/.test(String(x))) : [];
  const count = Number(r && r.count) || 0;
  return { count, ids };
}

/**
 * NSF dietary listing page → hit? Supported only when the page reports ≥ 1
 * matching product AND the brand name appears in it.
 */
function parseNsfListing(html, brand) {
  const text = String(html || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ');
  const m = /Number of matching Products is\s+(\d+)/i.exec(text);
  // No listing counter → not the listing page we know (error page, redesign, block).
  if (!m) return { available: false, products: 0, hit: false };
  const products = Number(m[1]);
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const brandHit = !!brand && norm(text).includes(norm(brand));
  return { available: true, products, hit: products > 0 && brandHit };
}

/**
 * Run the checks (only called when P5B_VERIFY=1).
 * @param {object[]} targets             from buildVerificationTargets
 * @param {{ fetchText: (url) => Promise<{ok, status, text}>, maxChecks?: number, log? }} deps
 * @returns {Promise<object[]>} the same targets with status/evidence filled
 */
async function runVerification(targets, { fetchText, maxChecks = 20, log = () => {} } = {}) {
  let checks = 0;
  const cache = new Map();
  const get = async (url) => {
    if (cache.has(url)) return cache.get(url);
    checks++;
    const p = fetchText(url).catch((e) => ({ ok: false, status: 0, text: '', error: e.message }));
    cache.set(url, p);
    return p;
  };
  const out = [];
  for (const t of targets) {
    const r = { ...t };
    if (t.kind === 'literature' && (!t.pubmed || !(t.pubmed.outcomes || []).length)) {
      r.status = 'not_checked';
      r.note = t.ingredient ? 'No outcome to search — an ingredient-only search proves nothing.' : 'No ingredient named — nothing to search.';
    } else if (t.kind === 'literature' && checks < maxChecks) {
      const res = await get(t.pubmed.api_url);
      if (!res.ok) { r.status = 'not_checked'; r.note = `PubMed request failed (${res.status || res.error || 'error'})`; }
      else {
        let json = null;
        try { json = JSON.parse(res.text); } catch { /* malformed */ }
        const { count, ids } = parsePubmedResult(json);
        r.checked_at = new Date().toISOString();
        r.hits = count;
        if (!json || !json.esearchresult) {
          r.status = 'not_checked';
          r.note = 'PubMed returned no parseable result — nothing concluded.';
        } else if (count > 0 && ids.length) {
          r.status = 'supported';
          r.evidence_url = `https://pubmed.ncbi.nlm.nih.gov/${ids[0]}/`;
          r.evidence_ids = ids;
          r.note = 'Ingredient-level trial literature exists for this outcome; this does not verify the product itself.';
        } else {
          r.status = 'not_found';
          r.evidence_url = null;
          r.note = 'No randomized/clinical trial found for this ingredient + outcome on PubMed.';
        }
      }
    } else if (t.kind === 'registry') {
      const checkable = (t.lookups || []).filter((l) => l.checkable);
      if (!checkable.length || checks >= maxChecks) {
        r.status = 'not_checked';
        r.note = r.note || (t.brand ? 'Registry is not machine-checkable; use the lookup link.' : 'No brand named; nothing to look up.');
      } else {
        let found = null;
        let miss = false;
        let unavailable = false;
        for (const l of checkable) {
          const res = await get(l.url);
          if (!res.ok) { unavailable = true; continue; }
          const p = parseNsfListing(res.text, t.brand);
          if (!p.available) { unavailable = true; continue; }
          if (p.hit) { found = { url: l.url, products: p.products, registry: l.registry }; break; }
          miss = true;
        }
        r.checked_at = new Date().toISOString();
        const onlyPart = !t.registry; // a generic "third-party tested" claim: only NSF was looked at
        if (found) {
          r.status = 'supported';
          r.evidence_url = found.url;
          r.note = `${found.registry} listing shows ${found.products} product(s) for ${t.brand} (brand-level, not this exact product).`;
        } else if (miss && onlyPart) {
          r.status = 'not_checked';
          r.evidence_url = null;
          r.note = `Not in the ${checkable.map((l) => l.registry).join('/')} listing; other testing labs (USP, Informed Sport, private labs) were not looked at.`;
        } else if (miss) {
          r.status = 'not_found';
          r.evidence_url = null;
          r.note = `No ${checkable.map((l) => l.registry).join('/')} listing found for ${t.brand}.`;
        } else {
          r.status = unavailable ? 'registry_unavailable' : 'not_checked';
          r.evidence_url = null;
          r.note = 'Registry did not return its listing page (error or changed format) — nothing concluded.';
        }
      }
    } else if (r.status == null) {
      r.status = 'not_checked';
    }
    out.push(r);
  }
  log(`  verification: ${checks} lookup request(s)`);
  return out;
}

module.exports = {
  REGISTRIES,
  STATUSES,
  detectVerifiableClaim,
  registryLookup,
  outcomeTerms,
  pubmedSearch,
  parsePubmedResult,
  parseNsfListing,
  runVerification,
};
