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
 * Fallback note: if Amazon blocks these requests from a Cloud Run IP
 * (see scout/DEPLOY_NOTES.md — datacenter IPs get blocked more than
 * residential ones), the documented next step is Bright Data's Amazon
 * reviews dataset, not more stealth tweaks here. Not built yet — this file
 * is the "minimum to keep the pipeline functional" version; a full Bright
 * Data reviews port is a follow-up if this doesn't get through reliably.
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
  let url = `${SUPABASE_URL}/rest/v1/dovive_research?select=asin,keyword,title&order=scraped_at.desc`;
  if (KEYWORD_FILTER) url += `&keyword=eq.${encodeURIComponent(KEYWORD_FILTER)}`;

  const res = await fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
  if (!res.ok) throw new Error(`Failed to fetch ASINs: ${res.status}`);
  const data = await res.json();

  const seen = new Set();
  return data.filter(r => {
    if (seen.has(r.asin)) return false;
    seen.add(r.asin);
    return true;
  });
}

async function getScrapedAsins() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/dovive_reviews?select=asin`, {
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

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n💬 Phase 3 — playwright-reviews.js`);
  console.log(`   Keyword filter: ${KEYWORD_FILTER || '(all)'}`);
  console.log(`   Max ASINs: ${MAX_ASINS} | Max pages/ASIN: ${MAX_PAGES_PER_ASIN}`);

  const asinRows = await getAsins();
  const scrapedAsins = await getScrapedAsins();
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

  for (const row of toScrape) {
    _keywordForSave = row.keyword || KEYWORD_FILTER;
    console.log(`\n[${done + failed + 1}/${toScrape.length}] ${row.asin} — ${(row.title || '').slice(0, 55)}`);
    try {
      const count = await scrapeAsinReviews(context, row.asin);
      totalReviews += count;
      done++;
      console.log(`  ✓ ${count} reviews saved`);
    } catch (err) {
      failed++;
      console.error(`  ✗ ${err.message}`);
    }
    await sleep(rand(2000, 5000));
  }

  await browser.close();

  console.log(`\n✅ Done — ASINs: ${done} ok / ${failed} failed | Total reviews: ${totalReviews}`);
  if (failed > toScrape.length / 2) {
    console.warn('⚠ More than half the ASINs failed — if these look like CAPTCHA/block pages,');
    console.warn('  this is likely a datacenter-IP block (see scout/DEPLOY_NOTES.md).');
    console.warn('  Bright Data\'s Amazon reviews dataset is the documented fallback, not more stealth tweaks.');
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
