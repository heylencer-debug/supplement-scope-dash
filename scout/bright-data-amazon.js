/**
 * bright-data-amazon.js — Bright Data Amazon fallback for Phase 1 (human-bsr.js)
 *
 * Ported from the working Deno edge function at
 * ~/getnoodle/supabase/functions/bright-data-amazon-product/index.ts (keyword
 * mode + product hydration), rewritten as plain Node/CommonJS for use inside
 * the Scout pipeline worker. Used ONLY as a fallback when Amazon blocks the
 * Cloud Run Job's Playwright scraper (bot-wall / CAPTCHA / datacenter-IP
 * block) — see scout/human-bsr.js for the branch logic.
 *
 * Reads the API key from either BRIGHTDATA_API_KEY (getnoodle's name) or
 * BRIGHTDATA (the name the user already set as a Dovive Supabase edge
 * function secret) so both env var names resolve.
 */

const BD_SCRAPE_BASE = 'https://api.brightdata.com/datasets/v3/scrape';

// Bright Data dataset IDs — same as getnoodle's bright-data-amazon-product fn.
const PRODUCTS_DATASET = 'gd_l7q7dkf244hwjntr0';   // Products by URL (sync /scrape, full media)
const SEARCH_DATASET   = 'gd_lwdb4vjm1ehb499uxs';  // Products Search by URL (sync /scrape, listings)

function getApiKey() {
  return process.env.BRIGHTDATA_API_KEY || process.env.BRIGHTDATA || null;
}

/** True only when a real (non-placeholder) key is present. */
function isBrightDataConfigured() {
  const key = getApiKey();
  return !!key && !/^REPLACE_ME/i.test(key);
}

function extractAsin(input) {
  const t = String(input || '').trim();
  if (/^[A-Z0-9]{10}$/i.test(t)) return t.toUpperCase();
  const m = t.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
  return m ? m[1].toUpperCase() : null;
}

function productUrl(asin, locale) {
  const tld = locale === 'UK' ? 'co.uk' : 'com';
  return `https://www.amazon.${tld}/dp/${asin}`;
}

function searchUrl(keyword, locale) {
  const tld = locale === 'UK' ? 'co.uk' : 'com';
  return `https://www.amazon.${tld}/s?k=${encodeURIComponent(keyword)}`;
}

function parseRecords(text) {
  try { return JSON.parse(text); } catch (_) {
    return text.split('\n').filter(Boolean).map((l) => {
      try { return JSON.parse(l); } catch (_e) { return null; }
    }).filter(Boolean);
  }
}

/**
 * Async fallback per Bright Data docs: when the sync /scrape endpoint can't
 * finish inside its window it responds 202 with { snapshot_id } instead of
 * records. Poll /datasets/v3/progress/{id} until ready, then pull
 * /datasets/v3/snapshot/{id}?format=json. Ported 1:1 from the getnoodle fn.
 */
async function bdAwaitSnapshot(snapshotId, apiKey, deadlineMs) {
  const deadline = Date.now() + deadlineMs;
  const POLL_MS = 4000;
  console.log('[bright-data] sync window exceeded — polling snapshot', snapshotId);
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    let progressStatus = '';
    try {
      const pRes = await fetch(`https://api.brightdata.com/datasets/v3/progress/${snapshotId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (pRes.ok) {
        const pJson = await pRes.json().catch(() => null);
        progressStatus = String(pJson?.status || '').toLowerCase();
      }
    } catch (_) { /* transient — keep polling */ }
    if (progressStatus === 'failed' || progressStatus === 'error') {
      throw new Error(`Bright Data snapshot ${snapshotId} failed (status=${progressStatus}).`);
    }
    if (progressStatus && !['ready', 'completed', 'collected'].includes(progressStatus)) {
      continue;
    }
    const sRes = await fetch(`https://api.brightdata.com/datasets/v3/snapshot/${snapshotId}?format=json`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const sText = await sRes.text();
    if (sRes.status === 202) continue;
    if (!sRes.ok) throw new Error(`Bright Data snapshot fetch failed [${sRes.status}]: ${sText.slice(0, 300)}`);
    const parsed = parseRecords(sText);
    return Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.data) ? parsed.data : [parsed]);
  }
  throw new Error(`Amazon scrape is still running on Bright Data (snapshot ${snapshotId}). Try again in a minute.`);
}

async function bdScrape(datasetId, input, apiKey, timeoutMs = 120000) {
  const url = `${BD_SCRAPE_BASE}?dataset_id=${datasetId}&include_errors=true&format=json`;
  const controller = new AbortController();
  const syncAbortMs = Math.min(75000, timeoutMs);
  const timeoutId = setTimeout(() => controller.abort(), syncAbortMs);
  let text = '';
  let status = 0;
  let ok = false;
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ input }),
      signal: controller.signal,
    });
    status = res.status;
    ok = res.ok;
    text = await res.text();
  } finally {
    clearTimeout(timeoutId);
  }
  if (status === 202 || (ok && /"snapshot_id"/.test(text) && !/"title"|"asin"/.test(text))) {
    const snap = (() => { try { return JSON.parse(text); } catch (_) { return null; } })();
    const snapshotId = snap?.snapshot_id || snap?.snapshotId || snap?.id;
    if (snapshotId) {
      const remaining = Math.max(20000, timeoutMs - (Date.now() - t0));
      return await bdAwaitSnapshot(String(snapshotId), apiKey, remaining);
    }
  }
  if (!ok) throw new Error(`Bright Data /scrape failed [${status}]: ${text.slice(0, 400)}`);
  const parsed = parseRecords(text);
  return Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.data) ? parsed.data : [parsed]);
}

/**
 * Normalize a raw Bright Data Products-dataset record into the shape
 * human-bsr.js's dovive_research upsert expects (same field names it already
 * fills from Playwright: title, brand, bullet_points, specs, images,
 * main_image, rating, review_count, price).
 */
function normaliseProduct(p) {
  const imageSet = new Set();
  if (Array.isArray(p?.images)) {
    for (const u of p.images) if (typeof u === 'string' && u) imageSet.add(u);
  }
  for (const k of ['image', 'image_url', 'main_image']) {
    const v = p?.[k];
    if (typeof v === 'string' && v) imageSet.add(v);
  }
  const images = Array.from(imageSet);

  const specs = {};
  if (p?.product_details && typeof p.product_details === 'object' && !Array.isArray(p.product_details)) {
    Object.assign(specs, p.product_details);
  }
  if (Array.isArray(p?.specifications)) {
    for (const s of p.specifications) {
      if (s && typeof s === 'object' && s.name && s.value) specs[s.name] = s.value;
    }
  }

  const asin = String(p?.asin || '').toUpperCase();
  const price = typeof p?.final_price === 'number' ? p.final_price
    : (typeof p?.initial_price === 'number' ? p.initial_price : null);

  return {
    asin,
    title: String(p?.title || ''),
    brand: p?.brand || null,
    bullet_points: Array.isArray(p?.features) ? p.features.filter((f) => typeof f === 'string') : null,
    specs: Object.keys(specs).length ? specs : null,
    images: images.length ? images : null,
    main_image: images[0] || null,
    rating: typeof p?.rating === 'number' ? p.rating : null,
    review_count: typeof p?.reviews_count === 'number' ? p.reviews_count : null,
    price,
    bsRank: typeof p?.bs_rank === 'number' ? p.bs_rank : (typeof p?.root_bs_rank === 'number' ? p.root_bs_rank : null),
    category: typeof p?.bs_category === 'string' ? p.bs_category : null,
    sponsored: !!(p?.sponsored ?? p?.sponsered),
    raw: p,
  };
}

/**
 * Keyword search + product hydration, mirroring the getnoodle edge function's
 * `mode: 'keyword'` path. Returns an array of normalized products in Amazon
 * search-result order, each carrying `searchRank` (1-based position) and the
 * full raw Bright Data record under `.raw` for downstream `raw_json` storage.
 *
 * @param {string} keyword
 * @param {{ locale?: string, limit?: number, pages?: number }} opts
 */
async function searchAmazonByKeyword(keyword, opts = {}) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('BRIGHTDATA_API_KEY / BRIGHTDATA not set');

  const locale = String(opts.locale || 'US').toUpperCase();
  const limit = Math.max(1, Math.min(Number(opts.limit) || 20, 50));
  const pages = Math.max(1, Math.min(Number(opts.pages) || 3, 3));

  // Step 1: keyword discovery via Search dataset.
  const searchInput = [{ keyword, url: searchUrl(keyword, locale), pages_to_search: pages }];
  const searchRecords = await bdScrape(SEARCH_DATASET, searchInput, apiKey);
  console.log(`[bright-data] search "${keyword}" ${locale} pages=${pages} → ${searchRecords.length} records`);

  const seen = new Set();
  const discovered = [];
  for (const r of searchRecords) {
    const a = (r?.asin && /^[A-Z0-9]{10}$/i.test(String(r.asin)))
      ? String(r.asin).toUpperCase()
      : extractAsin(String(r?.url || ''));
    if (!a || seen.has(a)) continue;
    seen.add(a);
    const title = typeof r?.title === 'string' ? r.title : (typeof r?.name === 'string' ? r.name : undefined);
    discovered.push({
      asin: a,
      position: discovered.length + 1,
      sponsored: !!(r?.sponsored ?? r?.sponsered),
      title,
      raw: r,
    });
  }

  const asins = discovered.slice(0, limit).map((d) => d.asin);
  if (!asins.length) {
    throw new Error(`No products found for "${keyword}" on Amazon ${locale} via Bright Data.`);
  }

  // Step 2: hydrate ASINs to full product data (media, bullets, specs) via Products dataset.
  const hydrateInput = asins.map((a) => ({ url: productUrl(a, locale) }));
  const rawProducts = await bdScrape(PRODUCTS_DATASET, hydrateInput, apiKey);
  const products = rawProducts
    .filter((p) => p && typeof p === 'object' && !p.error && (p.title || p.asin || p.url))
    .map((p) => normaliseProduct(p));

  if (!products.length) {
    const sample = rawProducts?.[0] ? JSON.stringify(rawProducts[0]).slice(0, 300) : 'empty';
    throw new Error(`Bright Data returned no usable products for ${asins.join(', ')}. Sample: ${sample}`);
  }

  // Restore search order + stamp searchRank/sponsored (hydration completes out of order).
  const orderIndex = new Map(asins.map((a, i) => [a, i]));
  products.sort((a, b) => (orderIndex.get(a.asin) ?? Number.MAX_SAFE_INTEGER) - (orderIndex.get(b.asin) ?? Number.MAX_SAFE_INTEGER));
  const byAsin = new Map(discovered.map((d) => [d.asin, d]));
  for (const p of products) {
    const d = byAsin.get(p.asin);
    if (!d) continue;
    p.searchRank = d.position;
    if (d.sponsored && !p.sponsored) p.sponsored = true;
  }

  return products;
}

module.exports = {
  isBrightDataConfigured,
  getApiKey,
  searchAmazonByKeyword,
};
