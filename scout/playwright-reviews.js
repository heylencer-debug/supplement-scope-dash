/**
 * playwright-reviews.js — Phase 3: Playwright-based Review Scraper
 * ─────────────────────────────────────────────────────────────────
 * Replaces apify-reviews.js (2026-08-27 user decision: Apify and Jungle
 * Scout are no longer valid data sources — Keepa, Bright Data (fallback),
 * and this pipeline's own Playwright scraping are the only ones left).
 *
 * Scrapes Amazon's own /product-reviews/{asin} pages directly with the same
 * stealth/context pattern as human-bsr.js (Phase 1) — no third-party actor,
 * no API key. Saves into the SAME dovive_reviews table/schema apify-reviews.js
 * used, so migrate-reviews-to-dash.js and every downstream phase (P6, P8,
 * competitive benchmarking) need zero changes.
 *
 * Same CLI contract as apify-reviews.js (positional keyword arg) so
 * run-pipeline.js only needed a one-line script-name swap for Phase 3.
 *
 * Bright Data fallback (2026-08-28): when Amazon bot-walls these requests
 * from a Cloud Run datacenter IP — same root cause confirmed on P1 — any
 * ASIN that Playwright got zero reviews for is retried via Bright Data's
 * Amazon Reviews dataset (bright-data-amazon.js:fetchAmazonReviews),
 * mirroring the P1 pattern in human-bsr.js (Playwright first, auto-fallback
 * when BRIGHTDATA_API_KEY/BRIGHTDATA is configured and real results are
 * missing). Batched 20 ASINs per Bright Data call (its own hard limit).
 *
 * Usage:
 *   node playwright-reviews.js                          — all ASINs
 *   node playwright-reviews.js "ashwagandha gummies"    — specific keyword
 */

require('dotenv').config();
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth');
chromium.use(stealth());
const fetch = require('node-fetch');
const brightData = require('./bright-data-amazon');
const { reportProgress } = require('./utils/job-heartbeat');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const KEYWORD_FILTER = process.argv[2] || null;
const MAX_ASINS = parseInt(process.env.REVIEWS_MAX_ASINS || '30', 10); // bound Cloud Run runtime
const MAX_PAGES_PER_ASIN = parseInt(process.env.REVIEWS_MAX_PAGES || '3', 10); // ~10 reviews/page

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
];
const VIEWPORTS = [{ width: 1366, height: 768 }, { width: 1440, height: 900 }, { width: 1536, height: 864 }];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pickRandom(arr) { return arr[rand(0, arr.length - 1)]; }

async function isBlocked(page) {
  const title = await page.title().catch(() => '');
  const bodyText = await page.locator('body').innerText({ timeout: 3000 }).catch(() => '');
  return /robot|captcha|automated/i.test(title) || /automated access|enter the characters/i.test(bodyText);
}

// ── Fetch ASINs from Supabase ─────────────────────────────────────────────────
async function getAsins() {
  // The verifier's P3 gate checks the top-20 products by DASH bsr_current
  // (Keepa-enriched, fresher than the scrape-time dovive_research.bsr).
  // The old ordering here was rank_position (search rank) first — a
  // different set entirely, so the capped MAX_ASINS batch kept scraping
  // products the gate never looks at while the true top-BSR sellers stayed
  // uncovered. Rank candidates by the SAME bsr_current the gate uses.
  let url = `${SUPABASE_URL}/rest/v1/dovive_research?select=asin,keyword,title,bsr,rank_position`;
  if (KEYWORD_FILTER) url += `&keyword=eq.${encodeURIComponent(KEYWORD_FILTER)}`;

  const res = await fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
  if (!res.ok) throw new Error(`Failed to fetch ASINs: ${res.status}`);
  const data = await res.json();

  const seen = new Set();
  const rows = data.filter(r => {
    if (seen.has(r.asin)) return false;
    seen.add(r.asin);
    return true;
  });

  // Pull bsr_current for these ASINs from the DASH products table and sort
  // by it (nulls last, falling back to scrape-time bsr, then rank_position).
  try {
    const DASH_URL_ = process.env.DASH_URL || SUPABASE_URL;
    const DASH_KEY_ = process.env.DASH_KEY || SUPABASE_KEY;
    const asinList = rows.map(r => r.asin).join(',');
    const dashRes = await fetch(`${DASH_URL_}/rest/v1/products?select=asin,bsr_current&asin=in.(${asinList})`, {
      headers: { apikey: DASH_KEY_, Authorization: `Bearer ${DASH_KEY_}` }
    });
    if (dashRes.ok) {
      const bsrByAsin = {};
      for (const p of await dashRes.json()) {
        if (p.bsr_current != null && (bsrByAsin[p.asin] == null || p.bsr_current < bsrByAsin[p.asin])) bsrByAsin[p.asin] = p.bsr_current;
      }
      const key = r => bsrByAsin[r.asin] ?? r.bsr ?? (r.rank_position != null ? 10000000 + r.rank_position : Infinity);
      rows.sort((a, b) => key(a) - key(b));
      console.log(`   ASIN order: DASH bsr_current (${Object.keys(bsrByAsin).length}/${rows.length} matched)`);
      return rows;
    }
  } catch (e) {
    console.warn(`   ⚠️ DASH bsr_current lookup failed (${e.message}) — falling back to scrape-time ordering`);
  }
  rows.sort((a, b) => (a.bsr ?? Infinity) - (b.bsr ?? Infinity) || (a.rank_position ?? Infinity) - (b.rank_position ?? Infinity));
  return rows;
}

// 2026-09-02: SESSION-ISOLATION FIX — dovive_reviews is plain append-only
// INSERT (no upsert/conflict target — aca2339's audit confirmed it never
// clobbers a sibling session's rows), so this used to fetch scraped ASINs
// GLOBALLY across every keyword/session ever run. For a fresh "#N" session
// with heavy ASIN overlap against sibling sessions (e.g. "electrolyte
// powder #4" vs #1/#2/#3), that meant every overlapping ASIN a SIBLING
// session had already reviewed was treated as "already have reviews" and
// excluded from THIS session's toScrape list — so THIS session never wrote
// its OWN dovive_reviews rows for those ASINs, undercounting
// migrate-reviews-to-dash.js's keyword-scoped read and the P3 verifier gate
// (both correctly `.eq('keyword', KEYWORD)`-scoped to this session, per the
// eca3061 lesson) even though review content genuinely exists elsewhere.
// Scoped to the SAME exact session keyword used to build the candidate ASIN
// list (getAsins()) whenever one is set — global-mode (`node
// playwright-reviews.js` with no keyword arg) keeps the old unscoped
// behavior, matching getAsins()'s own KEYWORD_FILTER-conditional pattern.
async function getScrapedAsins(keyword) {
  let url = `${SUPABASE_URL}/rest/v1/dovive_reviews?select=asin`;
  if (keyword) url += `&keyword=eq.${encodeURIComponent(keyword)}`;
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
  });
  if (!res.ok) return new Set();
  const data = await res.json();
  return new Set(data.map(r => r.asin));
}

// ── Parse one product-reviews page ─────────────────────────────────────────────
async function scrapeReviewPage(page, asin) {
  return page.evaluate((asin) => {
    const cards = Array.from(document.querySelectorAll('[data-hook="review"]'));
    return cards.map((card) => {
      const ratingText = card.querySelector('[data-hook="review-star-rating"] span, [data-hook="cmps-review-star-rating"] span')?.textContent || '';
      const ratingMatch = ratingText.match(/[\d.]+/);
      const title = card.querySelector('[data-hook="review-title"] span:last-child, [data-hook="review-title"]')?.textContent?.trim() || null;
      const body = card.querySelector('[data-hook="review-body"] span')?.textContent?.trim() || null;
      const reviewer = card.querySelector('.a-profile-name')?.textContent?.trim() || null;
      const dateText = card.querySelector('[data-hook="review-date"]')?.textContent?.trim() || null;
      const verified = !!card.querySelector('[data-hook="avp-badge"]');
      const helpfulText = card.querySelector('[data-hook="helpful-vote-statement"]')?.textContent || '';
      const helpfulMatch = helpfulText.match(/[\d,]+/);
      return {
        asin,
        rating: ratingMatch ? parseFloat(ratingMatch[0]) : null,
        title,
        body,
        reviewer_name: reviewer,
        date_text: dateText,
        verified_purchase: verified,
        helpful_votes: helpfulMatch ? parseInt(helpfulMatch[0].replace(/,/g, ''), 10) : 0,
      };
    });
  }, asin);
}

function parseReviewDate(dateText) {
  if (!dateText) return null;
  // Amazon format: "Reviewed in the United States on August 17, 2025"
  const m = dateText.match(/(\w+ \d+, \d{4})/);
  if (!m) return null;
  const d = new Date(m[1]);
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
}

// ── Save reviews to Supabase (same schema as apify-reviews.js) ────────────────
async function saveReviews(asin, keyword, rawReviews) {
  if (!rawReviews.length) return 0;

  const rows = rawReviews.map((r) => ({
    asin: r.asin || asin,
    keyword: keyword || null,
    reviewer_name: r.reviewer_name,
    rating: r.rating,
    title: r.title,
    body: r.body,
    review_date: parseReviewDate(r.date_text),
    verified_purchase: r.verified_purchase,
    helpful_votes: r.helpful_votes || 0,
    raw_json: r, // full scraped fields (dovive_reviews.raw_json — see migrations/004)
    scraped_at: new Date().toISOString(),
  }));

  const res = await fetch(`${SUPABASE_URL}/rest/v1/dovive_reviews`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Save failed: ${res.status} - ${errText.substring(0, 200)}`);
  }
  return rows.length;
}

// ── Scrape all review pages for one ASIN ────────────────────────────────────
async function scrapeAsinReviews(context, asin) {
  const page = await context.newPage();
  let total = 0;
  try {
    for (let pageNum = 1; pageNum <= MAX_PAGES_PER_ASIN; pageNum++) {
      const url = `https://www.amazon.com/product-reviews/${asin}/?sortBy=recent&pageNumber=${pageNum}`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await sleep(rand(1500, 3000));

      if (await isBlocked(page)) {
        console.log(`    ⚠ Blocked on page ${pageNum} for ${asin} — stopping this ASIN`);
        break;
      }

      const reviews = await scrapeReviewPage(page, asin);
      if (!reviews.length) {
        console.log(`    → No reviews on page ${pageNum} — done`);
        break;
      }

      total += reviews.length;
      console.log(`    → Page ${pageNum}: ${reviews.length} reviews`);
      // Return this page's reviews for saving by the caller (see main loop)
      // eslint-disable-next-line no-await-in-loop
      await saveReviewsWrapper(asin, reviews);

      if (reviews.length < 8) break; // last page (Amazon shows ~10/page)
      await sleep(rand(2000, 4000));
    }
  } finally {
    await page.close();
  }
  return total;
}

let _keywordForSave = null;
async function saveReviewsWrapper(asin, reviews) {
  await saveReviews(asin, _keywordForSave, reviews);
}

// ── Bright Data fallback (bot-wall recovery, mirrors P1's pattern) ────────────
async function runBrightDataFallback(zeroReviewRows) {
  if (!zeroReviewRows.length) return { saved: 0, asinsWithReviews: 0 };
  console.log(`\n🛰️  Bright Data reviews fallback engaged for ${zeroReviewRows.length} ASIN(s) that got 0 reviews via Playwright...`);

  let totalSaved = 0, asinsWithReviews = 0;
  const CHUNK = 20; // Bright Data reviews dataset hard limit per /trigger call
  for (let i = 0; i < zeroReviewRows.length; i += CHUNK) {
    const chunk = zeroReviewRows.slice(i, i + CHUNK);
    const asins = chunk.map(r => r.asin);
    // One retry on transient "snapshot still running" failures (2026-09-02):
    // bdTriggerAndAwait's 180s deadline is sometimes too short for a full
    // 20-ASIN reviews batch — Bright Data's own error text literally says
    // "try again in a minute" — but with zero retry the ENTIRE chunk was
    // silently dropped. Because zeroReviewRows preserves BSR-rank order
    // (toScrape iterates ASINs in rank order), the dropped chunk is always
    // the TOP-RANKED / best-selling ASINs — the worst possible ones to lose,
    // since they're exactly what the final verifier's top20 gates weight
    // most heavily. Confirmed live on "sugar free electrolytes"
    // (2026-09-02): batch 1 (top 20 by rank) timed out at 180s and was
    // dropped entirely, batch 2 (bottom 10) succeeded 2m7s later via the
    // same snapshot pipeline — it just needed a bit more patience, not a
    // permanent failure. A retry re-triggers a fresh snapshot + fresh 180s
    // deadline.
    let byAsin = null;
    for (let attempt = 1; attempt <= 2 && !byAsin; attempt++) {
      try {
        byAsin = await brightData.fetchAmazonReviews(asins);
      } catch (err) {
        console.error(`  ✗ Bright Data batch failed (${asins.length} ASINs, attempt ${attempt}/2): ${err.message}`);
        if (attempt < 2) console.log('  ↻ retrying chunk once...');
      }
    }
    if (!byAsin) continue;
    for (const row of chunk) {
      const reviews = byAsin.get(row.asin) || [];
      if (!reviews.length) continue;
      try {
        const saved = await saveReviews(row.asin, row.keyword || KEYWORD_FILTER, reviews);
        totalSaved += saved;
        asinsWithReviews++;
        console.log(`  ✓ [${row.asin}] ${saved} reviews saved via Bright Data`);
      } catch (err) {
        console.error(`  → Save failed for ${row.asin}: ${err.message}`);
      }
    }
  }
  console.log(`\n✅ Bright Data reviews fallback done. ${asinsWithReviews}/${zeroReviewRows.length} ASINs got reviews (${totalSaved} total).`);
  return { saved: totalSaved, asinsWithReviews };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n💬 Phase 3 — playwright-reviews.js`);
  console.log(`   Keyword filter: ${KEYWORD_FILTER || '(all)'}`);
  console.log(`   Max ASINs: ${MAX_ASINS} | Max pages/ASIN: ${MAX_PAGES_PER_ASIN}`);

  const asinRows = await getAsins();
  const scrapedAsins = await getScrapedAsins(KEYWORD_FILTER);
  const toScrape = asinRows.filter(r => !scrapedAsins.has(r.asin)).slice(0, MAX_ASINS);

  console.log(`   Found ${asinRows.length} ASINs | Already have reviews: ${scrapedAsins.size} | To scrape: ${toScrape.length}`);

  if (!toScrape.length) {
    console.log('   Nothing to do.');
    return;
  }

  const browser = await chromium.launch({ headless: process.platform !== 'win32' });
  const context = await browser.newContext({
    userAgent: pickRandom(USER_AGENTS),
    viewport: pickRandom(VIEWPORTS),
    locale: 'en-US',
    timezoneId: 'America/New_York',
    extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
  });

  let done = 0, failed = 0, totalReviews = 0;
  const zeroReviewRows = [];

  for (const row of toScrape) {
    _keywordForSave = row.keyword || KEYWORD_FILTER;
    console.log(`\n[${done + failed + 1}/${toScrape.length}] ${row.asin} — ${(row.title || '').slice(0, 55)}`);
    try {
      const count = await scrapeAsinReviews(context, row.asin);
      totalReviews += count;
      done++;
      console.log(`  ✓ ${count} reviews saved`);
      if (count === 0) zeroReviewRows.push(row);
    } catch (err) {
      failed++;
      console.error(`  ✗ ${err.message}`);
      zeroReviewRows.push(row);
    }

    // Mid-phase heartbeat (throttled internally to ~10 ASINs/60s) — see
    // scout/utils/job-heartbeat.js. Fail-open, never blocks the scrape.
    await reportProgress(done + failed, toScrape.length);

    await sleep(rand(2000, 5000));
  }

  await browser.close();

  console.log(`\n✅ Playwright pass done — ASINs: ${done} ok / ${failed} failed | Total reviews: ${totalReviews}`);
  if (zeroReviewRows.length > toScrape.length / 2) {
    console.warn('⚠ More than half the ASINs got 0 reviews — if these look like CAPTCHA/block pages,');
    console.warn('  this is likely a datacenter-IP block (see scout/DEPLOY_NOTES.md).');
  }

  if (zeroReviewRows.length && brightData.isBrightDataConfigured()) {
    const { saved } = await runBrightDataFallback(zeroReviewRows);
    totalReviews += saved;
  } else if (zeroReviewRows.length) {
    console.error(`  Bright Data fallback NOT engaged for ${zeroReviewRows.length} zero-review ASIN(s) — BRIGHTDATA_API_KEY/BRIGHTDATA is unset or still a placeholder.`);
  }

  console.log(`\n🏁 Phase 3 complete — total reviews saved (Playwright + Bright Data): ${totalReviews}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
