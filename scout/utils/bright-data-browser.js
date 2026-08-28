/**
 * bright-data-browser.js — shared Bright Data Scraping Browser (CDP) helper
 *
 * 2026-08-28: real Playwright scraping from Cloud Run gets blocked by
 * datacenter-IP detection on both search engines (P5's DuckDuckGo search)
 * and Amazon itself (P1). Bright Data's "Scraping Browser" product exposes
 * a real remote Chromium over CDP, routed through Bright Data's residential
 * IP pool — connecting Playwright to it via `chromium.connectOverCDP()`
 * keeps the exact live browser behavior (real SERP order, sponsored-listing
 * flags, session/cookie state) while unblocking the IP.
 *
 * Env-gated: BRIGHTDATA_BROWSER_WSS must be a full CDP websocket URL, e.g.
 *   wss://brd-customer-<id>-zone-<zone>:<password>@brd.superproxy.io:9222
 * Credentials are pending from the user as of 2026-08-28 — this helper is
 * wired to be ready the moment the env var/secret is set, and degrades
 * gracefully (falls back to local Playwright) if it's unset or the CDP
 * connect attempt fails, so nothing breaks before then.
 *
 * Used by: phase5-deep-research.js (off-Amazon search + brand-page scrape),
 * human-bsr.js (P1 Amazon scrape, with the existing Bright Data Datasets
 * API kept as a further fallback if this browser path also errors).
 */

const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth');
chromium.use(stealth());

const LOCAL_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36';

function getBrightDataBrowserWSS() {
  const wss = process.env.BRIGHTDATA_BROWSER_WSS || null;
  return (wss && /^wss:\/\//i.test(wss)) ? wss : null;
}

/**
 * Returns { browser, context, viaBrightData, close() }.
 * - If BRIGHTDATA_BROWSER_WSS is set: connects over CDP to Bright Data's
 *   Scraping Browser (residential IP), blocks image/media/font requests to
 *   control per-GB cost, and uses generous timeouts (first byte is slower
 *   on Scraping Browser sessions than local Chromium).
 * - Otherwise (or if the CDP connect throws): falls back to a local
 *   headless Playwright browser exactly as before, so behavior is
 *   unchanged until credentials are provisioned.
 */
async function launchBrowserContext({ label = 'browser', blockMedia = true, localContextOptions = {} } = {}) {
  const wss = getBrightDataBrowserWSS();

  if (wss) {
    try {
      console.log(`  [${label}] connecting via Bright Data Scraping Browser (CDP, residential IP)...`);
      const browser = await chromium.connectOverCDP(wss, { timeout: 60000 });
      const context = browser.contexts()[0] || await browser.newContext();
      context.setDefaultTimeout(45000);
      context.setDefaultNavigationTimeout(45000);
      if (blockMedia) {
        await context.route('**/*', (route) => {
          const type = route.request().resourceType();
          if (type === 'image' || type === 'media' || type === 'font') return route.abort();
          return route.continue();
        });
      }
      console.log(`  [${label}] connected via Bright Data Scraping Browser ✓`);
      return {
        browser, context, viaBrightData: true,
        close: async () => { try { await browser.close(); } catch (_) {} },
      };
    } catch (err) {
      console.log(`  [${label}] Bright Data Scraping Browser connect FAILED (${err.message}) — falling back to local Playwright`);
    }
  } else {
    console.log(`  [${label}] BRIGHTDATA_BROWSER_WSS not set — using local Playwright`);
  }

  const browser = await chromium.launch({ headless: process.platform !== 'win32' });
  const context = await browser.newContext({
    userAgent: LOCAL_UA,
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
    ...localContextOptions,
  });
  return {
    browser, context, viaBrightData: false,
    close: async () => { try { await browser.close(); } catch (_) {} },
  };
}

module.exports = { launchBrowserContext, getBrightDataBrowserWSS };
