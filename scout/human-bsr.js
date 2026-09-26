/**
 * human-bsr.js — Phase 1 Scraper (v4 — Anti-Detection Enhanced)
 *
 * Improvements over v3:
 *  - Rotates User-Agent from a pool of real Chrome versions
 *  - Persists browser cookies across runs (avoids "new visitor" fingerprint)
 *  - Skips ASINs already in Supabase — resumes from where it left off
 *  - Retries product pages up to 3x on failure
 *  - Detects CAPTCHA/block pages and pauses with human-like delay before retry
 *  - Randomizes viewport size per run
 *  - Adds realistic Accept-Language and extra headers
 *  - Longer, more varied delays between product pages
 */

require('dotenv').config();
const { chromium } = require('playwright-extra');
const { launchBrowserContext } = require('./utils/bright-data-browser');
const stealth = require('puppeteer-extra-plugin-stealth');
chromium.use(stealth());

const fetch = require('node-fetch');
const fs   = require('fs');
const path = require('path');
const brightData = require('./bright-data-amazon');
const { createClient } = require('@supabase/supabase-js');
const { resolveCategory } = require('./utils/category-resolver');
const { reportProgress } = require('./utils/job-heartbeat');
const { buildQueryVariants } = require('./utils/query-variants');
const { buildCandidatePool, selectionSignalsFor } = require('./utils/serp-pool');

const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_KEY;
const KEYWORD_LABEL = process.argv[2] || 'magnesium gummies';
// Session suffix (" #2", " #3"...) isolates re-runs of the same keyword into
// separate workspaces — storage keys keep the FULL label; Amazon is searched
// with the clean words only.
const SEARCH_KEYWORD = KEYWORD_LABEL.replace(/\s*#\d+\s*$/, '');

// 2026-09-01: "top products" cap — the Bright Data fallback path already
// requested `limit: 40` from the Datasets API, but the primary Playwright
// SERP-scrape path had NO cap at all: it kept every relevance-matching
// organic result across all 3 scanned pages (up to ~144 for a
// high-volume keyword like "hydration powder" — found live during a
// validation run). Both paths now share one constant so a run's product
// count reflects the product's actual "top N by search rank" intent,
// not an accident of how many organic results Amazon happened to render.
//
// 2026-09-26 (competitor selection): P1 no longer picks the competitors — it
// builds the CANDIDATE POOL. It runs several searches per keyword
// (utils/query-variants.js: the base keyword, "best …", the audience and
// sugar-free splits — ≤5, no per-category lists), unions them with
// reciprocal-rank fusion (utils/serp-pool.js), never admits a sponsored
// placement, and keeps ~80 candidates. The 40 established competitors are
// chosen AFTER Keepa, once sales, variations and promotions are known
// (select-competitors.js, run from migrate-keepa-to-dash.js).
// Why 80, not 60 (dry-run simulation on real categories, 2026-09-26): about
// a third of listings fold into variation/product-line families, so a
// 60-ASIN pool left 39–41 eligible families — electrolyte powder #3 selected
// only 38 — while 80 left 55–56 (≈15 to spare). Cost: P1 page loads go
// ~44 → ~88 per run (homepage + 3 base + 4 variant SERP pages + 80 detail
// pages) and Keepa tokens ~2× (offers=20 is the expensive part of each ASIN).
// The base search's top 40 always get a slot (utils/serp-pool.js).
const P1_POOL_SIZE = parseInt(process.env.P1_POOL_SIZE || '80', 10);
const P1_MAX_QUERIES = parseInt(process.env.P1_MAX_QUERIES || '5', 10);
const P1_BASE_PAGES = 3;
// Variant searches read page 1 only: the "best …"/audience phrasings matter
// for what they rank FIRST, and each extra page is another 5–8 s of
// human-paced browsing (or another Bright Data search record batch).
const P1_VARIANT_PAGES = parseInt(process.env.P1_VARIANT_PAGES || '1', 10);
const SEARCH_QUERIES = buildQueryVariants(KEYWORD_LABEL, { maxQueries: P1_MAX_QUERIES });

// ── DASH live sync ────────────────────────────────────────────
const DASH_URL = process.env.DASH_URL || SUPABASE_URL;
const DASH_KEY = process.env.DASH_KEY || SUPABASE_KEY;
const DASH_CLIENT = createClient(DASH_URL, DASH_KEY);
let _dashCategoryId = null;

// 2026-08-28 (diagnose-first task): this used to do its OWN `ilike.*keyword*`
// name match + stale `total_products` column sort, and CREATE a new category
// on a miss — a THIRD, independent get-or-create path alongside
// migrate-p1-to-dash.js's (also since unified) and
// utils/category-resolver.js's resolveCategory() (used by every downstream
// phase + the final verifier). None of the three shared a DB unique
// constraint, so a lookup miss on any one of them could mint a fresh
// duplicate category row — confirmed root cause of two identical
// "Magnesium Gummies" (same name AND search_term) rows in DASH. Now
// delegates to the same resolveCategory() everyone else uses, so this
// live per-product sync (called during scraping, before migrate-p1-to-dash
// runs) can never again diverge from what P2/P3/P4/the verifier resolve to.
async function getDashCategoryId(keyword) {
  if (_dashCategoryId) return _dashCategoryId;
  try {
    const cat = await resolveCategory(DASH_CLIENT, keyword);
    _dashCategoryId = cat.id;
    return _dashCategoryId;
  } catch (e) {
    if (!/No category candidates found/i.test(e.message)) {
      // Ambiguous tie or DB error — don't silently create a duplicate.
      console.warn(`  ⚠️ getDashCategoryId resolve error for "${keyword}": ${e.message}`);
      return null;
    }
  }
  // Create category (only reached when resolveCategory() confirms none exists)
  const cr = await fetch(`${DASH_URL}/rest/v1/categories`, {
    method: 'POST',
    headers: { apikey: DASH_KEY, Authorization: `Bearer ${DASH_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ name: keyword.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' '), search_term: keyword, total_products: 0 })
  });
  const newCat = await cr.json();
  _dashCategoryId = Array.isArray(newCat) ? newCat[0]?.id : newCat?.id;
  return _dashCategoryId;
}

async function syncProductToDash(record) {
  try {
    const categoryId = await getDashCategoryId(record.keyword);
    if (!categoryId) return;
    const featureBullets = Array.isArray(record.bullet_points) ? record.bullet_points : null;
    const featureBulletsText = featureBullets ? featureBullets.join('\n') : null;
    const imageUrls = Array.isArray(record.images) ? record.images : null;
    const dashProduct = {
      asin: record.asin, category_id: categoryId, title: record.title || '',
      brand: record.brand || null, price: record.price || null,
      rating_value: record.rating || null, rating_count: record.review_count || null,
      bsr_current: record.bsr || null, feature_bullets: featureBullets,
      feature_bullets_text: featureBulletsText, specifications: record.specs || null,
      image_urls: imageUrls, main_image_url: record.main_image || null,
      updated_at: new Date().toISOString()
    };
    await fetch(`${DASH_URL}/rest/v1/products?on_conflict=asin,category_id`, {
      method: 'POST',
      headers: { apikey: DASH_KEY, Authorization: `Bearer ${DASH_KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify([dashProduct])
    });
    // Update category product count
    const { } = await fetch(`${DASH_URL}/rest/v1/rpc/increment_category_count`, { method: 'POST' }).catch(() => {});
  } catch (e) {
    // Non-fatal — don't crash scraper for DASH sync errors
  }
}

// ── Anti-detection config ─────────────────────────────────────
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0',
];

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1536, height: 864 },
];

const COOKIE_FILE = path.join(__dirname, '.amazon-cookies.json');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pickRandom(arr) { return arr[rand(0, arr.length - 1)]; }

// ── Human-like scroll ─────────────────────────────────────────
async function humanScroll(page) {
  const scrolls = rand(2, 5);
  for (let i = 0; i < scrolls; i++) {
    await page.mouse.move(rand(300, 900), rand(200, 600));
    await page.evaluate((px) => window.scrollBy(0, px), rand(200, 500));
    await sleep(rand(300, 700));
  }
}

// ── Check if page is blocked / CAPTCHA ───────────────────────
async function isBlocked(page) {
  const title = (await page.title()).toLowerCase();
  const url   = page.url().toLowerCase();
  if (title.includes('robot') || title.includes('captcha') || title.includes('sorry')) return true;
  if (url.includes('captcha') || url.includes('validatecaptcha')) return true;
  const captchaEl = await page.$('form[action*="captcha"], #captchacharacters');
  return !!captchaEl;
}

// ── Failure artifact capture (bot-wall diagnosis) ──────────────
// Cheap diagnosis for cloud runs: on scrape failure, save a snippet of
// page.content() (grepped for known bot-check/interstitial markers) and a
// base64 screenshot into the scratch dir + console logs, so Cloud Run logs /
// scout_jobs error detail show WHY the scrape failed (bot-wall vs. a real
// selector/timeout bug) without needing cloud storage wiring.
const BOT_WALL_MARKERS = [
  'enter the characters',
  'automated access',
  'captcha',
  'robot check',
  'to discuss automated access',
  'sorry, we just need to make sure',
  'api-services-support@amazon.com',
];
const ARTIFACT_DIR = path.join(__dirname, 'output', 'failure-artifacts');

async function captureFailureArtifact(page, label) {
  const result = { label, matchedMarkers: [], contentSnippet: '', screenshotPath: null, error: null };
  try {
    const content = (await page.content()) || '';
    const lower = content.toLowerCase();
    result.matchedMarkers = BOT_WALL_MARKERS.filter(m => lower.includes(m));
    result.contentSnippet = content.slice(0, 2000);

    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    const ts = Date.now();
    const safeLabel = label.replace(/[^a-z0-9_-]/gi, '_');
    const shotPath = path.join(ARTIFACT_DIR, `${safeLabel}-${ts}.png`);
    try {
      await page.screenshot({ path: shotPath, fullPage: false });
      result.screenshotPath = shotPath;
    } catch (shotErr) {
      result.error = `screenshot failed: ${shotErr.message}`;
    }

    console.log(`\n🚨 FAILURE ARTIFACT [${label}]`);
    console.log(`   Bot-wall markers matched: ${result.matchedMarkers.length ? result.matchedMarkers.join(', ') : 'none'}`);
    console.log(`   Page title: ${(await page.title().catch(() => '')).slice(0, 120)}`);
    console.log(`   Page URL: ${page.url()}`);
    console.log(`   Screenshot: ${result.screenshotPath || 'FAILED — ' + result.error}`);
    console.log(`   Content snippet (first 2KB):\n${result.contentSnippet}`);
  } catch (e) {
    result.error = e.message;
    console.log(`  ⚠ Failure artifact capture itself failed [${label}]: ${e.message}`);
  }
  return result;
}

// ── Cookie persistence ────────────────────────────────────────
async function loadCookies(context) {
  try {
    if (fs.existsSync(COOKIE_FILE)) {
      const cookies = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf8'));
      await context.addCookies(cookies);
      console.log(`  ✓ Loaded ${cookies.length} saved cookies`);
    }
  } catch (_) {}
}

async function saveCookies(context) {
  try {
    const cookies = await context.cookies('https://www.amazon.com');
    fs.writeFileSync(COOKIE_FILE, JSON.stringify(cookies, null, 2));
  } catch (_) {}
}

// ── Keyword registration ──────────────────────────────────────
async function ensureKeyword(keyword) {
  const checkRes = await fetch(
    `${SUPABASE_URL}/rest/v1/dovive_keywords?keyword=eq.${encodeURIComponent(keyword)}`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  const existing = await checkRes.json();
  if (existing.length > 0) {
    if (!existing[0].active) {
      await fetch(`${SUPABASE_URL}/rest/v1/dovive_keywords?keyword=eq.${encodeURIComponent(keyword)}`, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: true })
      });
      console.log(`  ✓ Keyword "${keyword}" re-activated`);
    } else {
      console.log(`  ✓ Keyword "${keyword}" already active`);
    }
  } else {
    await fetch(`${SUPABASE_URL}/rest/v1/dovive_keywords`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword, active: true })
    });
    console.log(`  ✓ Keyword "${keyword}" created`);
  }
}

// ── Get already-scraped ASINs for this keyword ────────────────
async function getAlreadyScraped(keyword) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/dovive_research?keyword=eq.${encodeURIComponent(keyword)}&select=asin`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  const rows = await res.json();
  return new Set(rows.map(r => r.asin));
}

// ── Upsert to Supabase ────────────────────────────────────────
// dovive_research.selection_signals comes from migration 011. Until it is
// applied PostgREST rejects any upsert naming it (PGRST204) — retry once
// without it and stop sending it, so P1 never fails on a missing column.
let _selectionSignalsColumn = true;
const stripSignals = (rows) => rows.map(({ selection_signals, ...rest }) => rest);
const isMissingSignalsColumn = (text) => /selection_signals/.test(text) && /PGRST204|42703|Could not find|does not exist/i.test(text);

async function upsertProducts(products) {
  if (!products.length) return;
  const post = (rows) => fetch(
    `${SUPABASE_URL}/rest/v1/dovive_research?on_conflict=asin,keyword`,
    {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(rows),
    }
  );
  let res = await post(_selectionSignalsColumn ? products : stripSignals(products));
  if (!res.ok) {
    const text = await res.text();
    if (_selectionSignalsColumn && isMissingSignalsColumn(text)) {
      _selectionSignalsColumn = false;
      console.warn('  ⚠ dovive_research.selection_signals missing — saving without search provenance (apply scout/migrations/011_competitor_selection.sql)');
      res = await post(stripSignals(products));
      if (!res.ok) throw new Error(`Upsert failed: ${res.status} ${await res.text()}`);
    } else {
      throw new Error(`Upsert failed: ${res.status} ${text}`);
    }
  }

  const historyRows = products.map(p => ({
    asin: p.asin, keyword: p.keyword, title: p.title, brand: p.brand,
    price: p.price, bsr: p.bsr, rating: p.rating, review_count: p.review_count,
    rank_position: p.rank_position, is_sponsored: p.is_sponsored,
    category: p.category, source: p.source, scraped_at: new Date().toISOString(),
  }));
  const res2 = await fetch(`${SUPABASE_URL}/rest/v1/dovive_history`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=minimal',
    },
    body: JSON.stringify(historyRows),
  });
  if (!res2.ok) console.warn(`History insert warning: ${res2.status}`);
}

// Pool members already scraped under this keyword (a resumed run) still get
// THIS run's search provenance, so selection can see which searches found them.
async function patchSelectionSignals(items) {
  if (!_selectionSignalsColumn || !items.length) return;
  for (const it of items) {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/dovive_research?asin=eq.${it.asin}&keyword=eq.${encodeURIComponent(KEYWORD_LABEL)}`,
        {
          method: 'PATCH',
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ selection_signals: selectionSignalsFor(it), is_sponsored: false }),
        }
      );
      if (!res.ok) {
        const text = await res.text();
        if (isMissingSignalsColumn(text)) { _selectionSignalsColumn = false; return; }
      }
    } catch (_) { /* provenance refresh is best-effort */ }
  }
}

// ── Scrape a product detail page with retry ───────────────────
async function scrapeProductDetail(context, asin, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const page = await context.newPage();
    try {
      await page.goto(`https://www.amazon.com/dp/${asin}`, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      await sleep(rand(1500, 3000));

      // Check for block/CAPTCHA
      if (await isBlocked(page)) {
        console.log(`  ⚠ Blocked on attempt ${attempt}. Waiting ${attempt * 15}s...`);
        await page.close();
        await sleep(attempt * 15000 + rand(3000, 8000));
        continue;
      }

      await humanScroll(page);

      const data = await page.evaluate(() => {
        const title = document.querySelector('#productTitle')?.textContent?.trim() || '';
        let brand = document.querySelector('#bylineInfo')?.textContent?.trim() || '';
        brand = brand.replace(/^(Brand:|Visit the)\s*/i, '').replace(/\s+Store$/i, '').trim();
        const price =
          document.querySelector('.a-price .a-offscreen')?.textContent?.trim() ||
          document.querySelector('#priceblock_ourprice')?.textContent?.trim() || '';
        const ratingText = document.querySelector('#acrPopover')?.getAttribute('title') || '';
        const rating = parseFloat(ratingText) || null;
        const reviewText = document.querySelector('#acrCustomerReviewText')?.textContent?.trim() || '';
        const reviewCount = parseInt(reviewText.replace(/[^0-9]/g, '')) || null;
        const bullet_points = Array.from(
          document.querySelectorAll('#feature-bullets li span.a-list-item')
        ).map(el => el.textContent.trim()).filter(t => t && !/make sure this fits/i.test(t));
        const specifications = {};
        document.querySelectorAll(
          '#productDetails_techSpec_section_1 tr, #productDetails_techSpec_section_2 tr, #productDetails_db_sections tr'
        ).forEach(row => {
          const key = row.querySelector('th')?.textContent?.trim();
          const val = row.querySelector('td')?.textContent?.trim().replace(/\s+/g, ' ');
          if (key && val) specifications[key] = val;
        });
        document.querySelectorAll('#detailBullets_feature_div li').forEach(el => {
          const bold = el.querySelector('.a-text-bold');
          if (bold) {
            const key = bold.textContent.replace(/[:\u200F\u200E]/g, '').trim();
            const val = bold.nextSibling?.textContent?.trim() || '';
            if (key && val) specifications[key] = val;
          }
        });
        const images = [];
        for (const script of document.querySelectorAll('script')) {
          const c = script.textContent || '';
          const m = c.match(/'colorImages'\s*:\s*\{\s*'initial'\s*:\s*(\[[\s\S]*?\])\s*[,}]/);
          if (m) {
            try {
              JSON.parse(m[1]).forEach(img => {
                const src = img.hiRes || img.large;
                if (src && !images.includes(src)) images.push(src);
              });
            } catch (_) {}
            if (images.length) break;
          }
        }
        if (!images.length) {
          const main = document.querySelector('#landingImage, #imgTagWrapperId img');
          const src = main?.getAttribute('data-old-hires') || main?.getAttribute('src') || '';
          if (src && !src.includes('transparent')) images.push(src);
          document.querySelectorAll('#altImages img').forEach(img => {
            const s = (img.getAttribute('src') || '').replace(/\._[A-Z0-9_,]+_\./, '.');
            if (s && !s.includes('transparent') && !images.includes(s)) images.push(s);
          });
        }
        return { title, brand, price, rating, reviewCount, bullet_points, specifications, images };
      });

      await page.close();
      return data;

    } catch (err) {
      console.error(`  [${asin}] Attempt ${attempt} error: ${err.message?.slice(0, 80)}`);
      try { await page.close(); } catch (_) {}
      if (attempt < retries) await sleep(rand(5000, 10000));
    }
  }
  return null;
}

// ── Bright Data fallback (bot-wall recovery) ───────────────────
// Writes to the SAME tables/columns as the Playwright path — dovive_research
// and dovive_keywords — plus raw_json (dovive_research) carrying the full
// raw Bright Data record, so every downstream phase (P2+) is unaffected.
async function runBrightDataFallback(alreadyScraped) {
  console.log('\n🛰️  Bright Data fallback engaged (BRIGHTDATA_API_KEY/BRIGHTDATA present)...');
  await ensureKeyword(KEYWORD_LABEL); // dovive_keywords — same call as the Playwright path

  // Same query set + pool rules as the Playwright path: search each phrasing
  // (discovery only), union, drop sponsored-only, keep ~P1_POOL_SIZE, then
  // hydrate just the pool. The base search must succeed; a failed variant
  // search is logged and skipped.
  const searches = [];
  for (let qi = 0; qi < SEARCH_QUERIES.length; qi++) {
    const query = SEARCH_QUERIES[qi];
    try {
      const found = await brightData.discoverAsinsByKeyword(query, { pages: qi === 0 ? P1_BASE_PAGES : P1_VARIANT_PAGES });
      searches.push({ query, items: found.map((d) => ({ asin: d.asin, title: d.title, position: d.position, sponsored: d.sponsored })) });
    } catch (err) {
      if (qi === 0) throw err;
      console.warn(`  ⚠ Bright Data search "${query}" failed (${err.message?.slice(0, 120)}) — continuing with the other searches`);
    }
  }
  const { pool, sponsoredOnly, totalUnique } = buildCandidatePool(searches, { poolSize: P1_POOL_SIZE, baseQuery: SEARCH_QUERIES[0] });
  console.log(`  ✓ ${searches.length} search(es) → ${totalUnique} organic ASINs (${sponsoredOnly.length} sponsored-only dropped) → pool of ${pool.length}`);

  const toHydrate = pool.filter(c => !alreadyScraped.has(c.asin));
  const skipped = pool.length - toHydrate.length;
  await patchSelectionSignals(pool.filter(c => alreadyScraped.has(c.asin)));
  console.log(`  ${toHydrate.length} to save | ${skipped} already in DB`);
  if (!toHydrate.length) {
    console.log(`\n✅ Bright Data fallback done. Nothing new to save. (${skipped} skipped — already in DB)`);
    return;
  }

  const products = await brightData.hydrateAsins(toHydrate.map(c => c.asin));
  if (!products.length) throw new Error(`Bright Data returned no usable products for ${toHydrate.length} pool ASINs`);
  const candByAsin = new Map(toHydrate.map(c => [c.asin, c]));

  let saved = 0;
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const c = candByAsin.get(p.asin);
    if (!c) continue;
    const rank = c.base_position ?? c.best_position;
    const record = {
      asin:          p.asin,
      keyword:       KEYWORD_LABEL,
      title:         p.title || c.title || '',
      brand:         p.brand || null,
      description:   null,
      bullet_points: p.bullet_points,
      specs:         p.specs,
      images:        p.images,
      main_image:    p.main_image,
      bsr:           p.bsRank || rank || null,
      rank_position: rank || null,
      rating:        p.rating,
      review_count:  p.review_count,
      price:         p.price,
      category:      p.category || null,
      // Pool members surfaced organically in at least one search by
      // construction (serp-pool drops sponsored-only ASINs).
      is_sponsored:  false,
      source:        'bright-data-fallback-v1',
      raw_json:      p.raw || null,
      selection_signals: selectionSignalsFor(c),
      scraped_at:    new Date().toISOString(),
    };
    try {
      await upsertProducts([record]);
      await syncProductToDash(record);
      saved++;
      console.log(`  ✓ [${record.asin}] ${(record.title || '').slice(0, 55)}`);
    } catch (err) {
      console.error(`  → Save failed for ${record.asin}: ${err.message}`);
    }

    // Mid-phase heartbeat (throttled internally to ~10 products/60s) — see
    // scout/utils/job-heartbeat.js. Fail-open, never blocks the fallback.
    await reportProgress(i + 1, products.length);
  }

  console.log(`\n✅ Bright Data fallback done. ${saved}/${toHydrate.length} new products saved. (${skipped} skipped — already in DB)`);
}

// ── One Amazon search: type the query, scan up to `maxPages` result pages ──
// Returns [{ asin, title, position, sponsored }]. Sponsored cards are
// RECORDED (flagged) rather than skipped, so utils/serp-pool.js can tell a
// sponsored-only ASIN from one that is an ad in one search and organic in
// another; they never become candidates either way.
const SEARCH_BOX_SELECTORS = ['#twotabsearchtextbox', '#nav-search-bar-form input[type="text"]', 'input[name="field-keywords"]'];

async function findSearchBox(page) {
  for (const sel of SEARCH_BOX_SELECTORS) {
    const el = await page.$(sel);
    if (el) return { el, sel };
  }
  return null;
}

async function searchAndCollect(page, context, query, maxPages, keywordTokens) {
  const box = await findSearchBox(page);
  if (!box) throw new Error('Search box not found');
  console.log(`\n→ Searching for "${query}" (up to ${maxPages} page${maxPages === 1 ? '' : 's'})...`);
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(rand(500, 1000));
  await box.el.scrollIntoViewIfNeeded();
  await sleep(rand(500, 800));
  await page.fill(box.sel, '');
  await page.type(box.sel, query, { delay: rand(60, 130) });
  await sleep(rand(700, 1200));
  await page.keyboard.press('Enter');
  await sleep(rand(4000, 6000));
  await saveCookies(context);
  console.log('  Search results:', await page.title());

  const collected = [];
  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    console.log(`\n→ Scanning page ${pageNum} of "${query}"...`);
    await humanScroll(page);

    const pageItems = await page.evaluate(({ pNum, tokens }) => {
      const results = [];
      const cards = document.querySelectorAll('[data-component-type="s-search-result"]');
      cards.forEach((card, i) => {
        const asin = card.getAttribute('data-asin');
        if (!asin) return;
        const sponsored = !!card.querySelector('.puis-sponsored-label-text, [aria-label="Sponsored"]');
        const titleEl = card.querySelector('h2 span, h2 a span');
        const title = titleEl?.textContent?.trim() || '';
        const t = title.toLowerCase();
        if (tokens.length === 0 || tokens.some(w => t.includes(w))) {
          results.push({ asin, title, position: (pNum - 1) * 48 + i + 1, sponsored });
        }
      });
      return results;
    }, { pNum: pageNum, tokens: keywordTokens });

    const organic = pageItems.filter(p => !p.sponsored);
    console.log(`  Found ${organic.length} relevant organic (+${pageItems.length - organic.length} sponsored) on page ${pageNum}`);
    organic.forEach(p => console.log(`    [${p.asin}] ${p.title.slice(0, 70)}`));
    collected.push(...pageItems);

    if (pageNum < maxPages) {
      // Scroll to bottom first to reveal the Next button
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await sleep(rand(1500, 2500));

      const nextBtn = await page.$('.s-pagination-next:not(.s-pagination-disabled)');
      if (!nextBtn) { console.log('  No more pages.'); break; }

      // Scroll Next button into view and click it naturally
      await nextBtn.scrollIntoViewIfNeeded();
      await sleep(rand(800, 1500));
      await nextBtn.click();

      // Wait for new page to fully load
      await page.waitForLoadState('domcontentloaded');
      await sleep(rand(5000, 8000));

      // Verify we actually got a new results page
      const newTitle = await page.title();
      const newCards = await page.evaluate(() =>
        document.querySelectorAll('[data-component-type="s-search-result"]').length
      );
      console.log(`  → Page ${pageNum + 1} loaded: "${newTitle}" | ${newCards} cards`);

      if (newCards === 0) {
        console.log('  → No results on next page — stopping pagination.');
        break;
      }
    }
  }
  return collected;
}

// ── Playwright gather attempt (homepage → search → collect ASINs) ──
// Returns { browser, context, toScrape, skipped } on success. On failure,
// captures a failure artifact (page content + screenshot) before closing the
// browser, then re-throws so the caller can retry / fall back.
async function attemptPlaywrightGather(attemptNum, alreadyScraped) {
  const userAgent = pickRandom(USER_AGENTS);
  const viewport  = pickRandom(VIEWPORTS);

  console.log(`\n📦 Phase 1 — human-bsr.js v4 (Playwright attempt ${attemptNum}/3)`);
  console.log(`   Keyword: "${KEYWORD_LABEL}"`);
  console.log(`   UA: ${userAgent.slice(0, 60)}...`);
  console.log(`   Viewport: ${viewport.width}x${viewport.height}`);

  // 2026-08-28: if BRIGHTDATA_BROWSER_WSS is set, connect over CDP to
  // Bright Data's Scraping Browser (real Chromium, residential IP pool) —
  // this is what actually unblocks Amazon from Cloud Run's datacenter IP.
  // Falls back to a local Playwright browser (with the same per-attempt
  // randomized UA/viewport fingerprint as before) if the env var is unset
  // or the CDP connect fails; the existing Bright Data Datasets API fallback
  // (attemptBrightDataFallback, below) remains a further fallback after that.
  const { browser, context, viaBrightData } = await launchBrowserContext({
    label: 'P1 browser',
    blockMedia: false, // Amazon page rendering relies on some image-based layout checks
    localContextOptions: {
      userAgent,
      viewport,
      locale: 'en-US',
      timezoneId: 'America/New_York',
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      },
    },
  });
  if (viaBrightData) console.log('   Network: Bright Data Scraping Browser (residential IP)');

  // Load saved cookies (return visitor fingerprint)
  await loadCookies(context);

  const page = await context.newPage();

  try {
    // ── Step 1: Amazon homepage ───────────────────────────────────
    console.log('→ Opening Amazon homepage...');
    await page.goto('https://www.amazon.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(rand(3000, 6000));
    await saveCookies(context);

    // Handle interstitial
    const continueBtn = await page.$('input[value="Continue shopping"], a:has-text("Continue shopping")');
    if (continueBtn) {
      console.log('  → Interstitial detected. Clicking "Continue shopping"...');
      await continueBtn.click();
      await sleep(rand(4000, 7000));
    }

    await humanScroll(page);
    await sleep(rand(1500, 3000));
    console.log('  Homepage loaded:', await page.title());

    // The search box is (re)located per query inside searchAndCollect().
    if (!(await findSearchBox(page))) throw new Error('Search box not found');

    // ── Step 2+3: run every query, collect organic + sponsored placements ──
    // The base query reads P1_BASE_PAGES pages (unchanged behaviour); each
    // variant reads P1_VARIANT_PAGES. Relevance filter (2026-08-28): keep a
    // result if its title contains ANY significant word (>3 chars) of the
    // BASE keyword — the variants' extra words ("best", "women") must not
    // widen what counts as on-topic.
    const keywordTokens = KEYWORD_LABEL.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const searches = [];
    for (let qi = 0; qi < SEARCH_QUERIES.length; qi++) {
      const query = SEARCH_QUERIES[qi];
      try {
        const items = await searchAndCollect(page, context, query, qi === 0 ? P1_BASE_PAGES : P1_VARIANT_PAGES, keywordTokens);
        searches.push({ query, items });
      } catch (err) {
        if (qi === 0) throw err; // the base search failing is a failed attempt, as before
        console.warn(`  ⚠ Search "${query}" failed (${err.message?.slice(0, 120)}) — continuing with the other searches`);
      }
      if (qi < SEARCH_QUERIES.length - 1) await sleep(rand(2500, 5000));
    }

    // Union the searches into one candidate pool (utils/serp-pool.js):
    // sponsored-only ASINs are never candidates, ordering is reciprocal-rank
    // fusion across searches, cut to P1_POOL_SIZE (~80). `rank` keeps its old
    // meaning — the SERP position, now for the base query when the ASIN
    // appeared there (else its best position in any query).
    const { pool, sponsoredOnly, totalUnique } = buildCandidatePool(searches, { poolSize: P1_POOL_SIZE, baseQuery: SEARCH_QUERIES[0] });
    const uniqueGummies = pool.map(c => ({ asin: c.asin, title: c.title, rank: c.base_position ?? c.best_position, candidate: c }));
    console.log(`\n  ${searches.length}/${SEARCH_QUERIES.length} searches ok · ${sponsoredOnly.length} sponsored-only ASINs dropped`);

    // Filter out already-scraped
    const toScrape = uniqueGummies.filter(p => !alreadyScraped.has(p.asin));
    const skipped  = uniqueGummies.length - toScrape.length;

    console.log(`\nTotal products: ${totalUnique} unique organic found | pooled to top ${uniqueGummies.length} by fused rank | ${skipped} already in DB | ${toScrape.length} to scrape`);
    await patchSelectionSignals(uniqueGummies.filter(p => alreadyScraped.has(p.asin)).map(p => p.candidate));

    // Zero-gathered guard (2026-08-28): if the search "succeeded" but yielded
    // NOTHING new and NOTHING was already in the DB, treat it as a FAILED
    // attempt — a real search for any live category never returns zero
    // products, so this is a filter/markup/soft-block problem. Throwing here
    // sends the run into the retry loop and ultimately the Bright Data
    // dataset fallback, instead of silently declaring "nothing to do" and
    // starving every downstream phase.
    if (toScrape.length === 0 && skipped === 0) {
      await captureFailureArtifact(page, `p1-attempt${attemptNum}-zero-results`);
      try { await browser.close(); } catch (_) {}
      throw new Error('P1 gathered 0 products with 0 already in DB — treating as failed attempt (triggers Bright Data fallback)');
    }

    return { browser, context, toScrape, skipped };
  } catch (err) {
    await captureFailureArtifact(page, `p1-attempt${attemptNum}`);
    try { await browser.close(); } catch (_) {}
    throw err;
  }
}

// ── Detail scrape + save (shared by every successful Playwright gather) ──
async function runDetailScrapeAndSave(context, toScrape, skipped) {
  if (!toScrape.length) {
    console.log('✅ All products already scraped. Nothing to do.');
    return;
  }

  let saved = 0;
  for (let i = 0; i < toScrape.length; i++) {
    const item = toScrape[i];
    console.log(`\n[${i + 1}/${toScrape.length}] ${item.asin} — ${item.title.slice(0, 60)}`);

    const detail = await scrapeProductDetail(context, item.asin);
    if (!detail) { console.log('  → Skipped (failed after retries)'); continue; }

    const priceNum  = parseFloat((detail.price || '').replace(/[^0-9.]/g, '')) || null;
    const mainImage = detail.images?.[0] || null;

    const record = {
      asin:          item.asin,
      keyword:       KEYWORD_LABEL,
      title:         detail.title || item.title,
      brand:         detail.brand || null,
      description:   null,
      bullet_points: detail.bullet_points?.length ? detail.bullet_points : null,
      specs:         Object.keys(detail.specifications || {}).length ? detail.specifications : null,
      images:        detail.images?.length ? detail.images : null,
      main_image:    mainImage,
      bsr:           item.rank,
      rank_position: item.rank,
      rating:        detail.rating || null,
      review_count:  detail.reviewCount || null,
      price:         priceNum,
      is_sponsored:  false, // pool members are organic by construction (utils/serp-pool.js)
      selection_signals: item.candidate ? selectionSignalsFor(item.candidate) : undefined,
      source:        'human-bsr-v4',
      scraped_at:    new Date().toISOString(),
    };

    console.log(`  ✓ ${record.title?.slice(0, 55)}`);
    console.log(`    Brand: ${record.brand} | Price: ${record.price} | ⭐ ${record.rating} (${record.review_count})`);
    console.log(`    Bullets: ${record.bullet_points?.length || 0} | Specs: ${Object.keys(detail.specifications || {}).length} | Images: ${record.images?.length || 0}`);

    try {
      await upsertProducts([record]);
      await syncProductToDash(record); // live sync to DASH dashboard
      console.log(`  → Saved ✓`);
      saved++;
    } catch (err) {
      console.error(`  → Save failed: ${err.message}`);
    }

    // Save cookies periodically
    if (i % 10 === 0) await saveCookies(context);

    // Mid-phase heartbeat (throttled internally to ~10 products/60s) — see
    // scout/utils/job-heartbeat.js. Fail-open, never blocks the scrape.
    await reportProgress(i + 1, toScrape.length);

    // Longer, randomized delay between products (key anti-detection measure)
    const delay = rand(3000, 6000);
    await sleep(delay);
  }

  await saveCookies(context);
  console.log(`\n✅ Done. ${saved}/${toScrape.length} new products saved. (${skipped} skipped — already in DB)`);
}

// ── Main orchestrator ────────────────────────────────────────────
// Playwright first (3 attempts, existing anti-detection behavior). On a
// bot-wall failure across all 3 attempts, fall back to Bright Data IF a real
// (non-placeholder) BRIGHTDATA_API_KEY/BRIGHTDATA key is present.
async function main() {
  console.log(`\n→ Registering keyword "${KEYWORD_LABEL}" in dashboard...`);
  await ensureKeyword(KEYWORD_LABEL);

  const alreadyScraped = await getAlreadyScraped(KEYWORD_LABEL);
  console.log(`  ✓ Already scraped: ${alreadyScraped.size} products (will skip these)`);

  let gathered = null;
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      gathered = await attemptPlaywrightGather(attempt, alreadyScraped);
      break;
    } catch (err) {
      lastErr = err;
      console.error(`  ✗ Playwright attempt ${attempt}/3 failed: ${err.message?.slice(0, 200)}`);
      if (attempt < 3) await sleep(rand(5000, 10000));
    }
  }

  if (gathered) {
    try {
      await runDetailScrapeAndSave(gathered.context, gathered.toScrape, gathered.skipped);
    } finally {
      try { await saveCookies(gathered.context); } catch (_) {}
      try { await gathered.browser.close(); } catch (_) {}
    }
    return;
  }

  console.error('\n❌ All 3 Playwright attempts failed — see FAILURE ARTIFACT logs above for bot-wall evidence.');

  if (brightData.isBrightDataConfigured()) {
    await runBrightDataFallback(alreadyScraped);
    return;
  }

  console.error('  Bright Data fallback NOT engaged — BRIGHTDATA_API_KEY/BRIGHTDATA is unset or still a placeholder.');
  throw lastErr || new Error('Playwright scrape failed and Bright Data is not configured');
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
