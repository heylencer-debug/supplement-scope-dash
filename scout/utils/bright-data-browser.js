/**
 * bright-data-browser.js — shared Bright Data browser helper
 *
 * 2026-08-28: real Playwright scraping from Cloud Run gets blocked by
 * datacenter-IP detection on search engines + brand sites (P5's off-Amazon
 * scrape). Two Bright Data unblock paths, used ONLY by opted-in non-Amazon
 * callers (useProxy:true — currently just P5):
 *   1) ISP/residential PROXY (primary — cheap): local Chromium routed through
 *      Bright Data's residential IP. Env: BRIGHTDATA_PROXY_SERVER/USER/PASS.
 *   2) Browser API / Scraping Browser (fallback — robust): a remote Chromium
 *      over CDP with built-in unlocking + CAPTCHA solving on residential IPs.
 *      Env: BRIGHTDATA_BROWSER_WSS (wss://brd-customer-<id>-zone-<zone>:<pw>@brd.superproxy.io:9222).
 *   3) plain local Playwright (final fallback).
 *
 * Amazon (P1) intentionally does NOT use either path (useProxy defaults false):
 * a single ISP IP is bot-walled by Amazon, and P1 already has the Bright Data
 * Datasets API as its working path (in human-bsr.js). P1 → plain local → its
 * own dataset-API fallback.
 */

const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth');
chromium.use(stealth());

const LOCAL_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36';

function getBrightDataBrowserWSS() {
  const wss = process.env.BRIGHTDATA_BROWSER_WSS || null;
  return (wss && /^wss:\/\//i.test(wss)) ? wss : null;
}

function getBrightDataProxy() {
  const server = process.env.BRIGHTDATA_PROXY_SERVER || null;
  const username = process.env.BRIGHTDATA_PROXY_USER || null;
  const password = process.env.BRIGHTDATA_PROXY_PASS || null;
  if (!server || !username || !password) return null;
  const normalized = /^https?:\/\//i.test(server) ? server : `http://${server}`;
  return { server: normalized, username, password };
}

function applyBlockMedia(context) {
  return context.route('**/*', (route) => {
    const type = route.request().resourceType();
    if (type === 'image' || type === 'media' || type === 'font') return route.abort();
    return route.continue();
  });
}

/**
 * Returns { browser, context, viaBrightData, close() }.
 * For useProxy callers (P5): ISP proxy → Browser API (CDP) → local, in order.
 * For non-proxy callers (P1): straight to local Playwright.
 */
async function launchBrowserContext({ label = 'browser', blockMedia = true, useProxy = false, localContextOptions = {} } = {}) {
  if (useProxy) {
    // 1) ISP/residential proxy — primary, cheap.
    const proxy = getBrightDataProxy();
    if (proxy) {
      try {
        console.log(`  [${label}] launching local Playwright via Bright Data ISP proxy (${proxy.server})...`);
        const browser = await chromium.launch({
          headless: process.platform !== 'win32',
          proxy: { server: proxy.server, username: proxy.username, password: proxy.password },
        });
        const context = await browser.newContext({
          userAgent: LOCAL_UA, viewport: { width: 1440, height: 900 }, locale: 'en-US',
          ...localContextOptions,
        });
        context.setDefaultTimeout(45000);
        context.setDefaultNavigationTimeout(45000);
        if (blockMedia) await applyBlockMedia(context);
        console.log(`  [${label}] using Bright Data ISP proxy ✓`);
        return { browser, context, viaBrightData: true, close: async () => { try { await browser.close(); } catch (_) {} } };
      } catch (err) {
        console.log(`  [${label}] ISP proxy launch FAILED (${err.message}) — trying Browser API fallback`);
      }
    }

    // 2) Browser API / Scraping Browser over CDP — robust fallback.
    const wss = getBrightDataBrowserWSS();
    if (wss) {
      try {
        console.log(`  [${label}] connecting via Bright Data Browser API (CDP, residential IP + unlocking)...`);
        const browser = await chromium.connectOverCDP(wss, { timeout: 60000 });
        const context = browser.contexts()[0] || await browser.newContext();
        context.setDefaultTimeout(45000);
        context.setDefaultNavigationTimeout(45000);
        if (blockMedia) await applyBlockMedia(context);
        console.log(`  [${label}] connected via Bright Data Browser API ✓`);
        return { browser, context, viaBrightData: true, close: async () => { try { await browser.close(); } catch (_) {} } };
      } catch (err) {
        console.log(`  [${label}] Browser API connect FAILED (${err.message}) — falling back to plain local Playwright`);
      }
    }
  }

  // 3) Plain local Playwright (P1's normal path, and P5's last resort).
  const browser = await chromium.launch({ headless: process.platform !== 'win32' });
  const context = await browser.newContext({
    userAgent: LOCAL_UA, viewport: { width: 1440, height: 900 }, locale: 'en-US',
    ...localContextOptions,
  });
  return { browser, context, viaBrightData: false, close: async () => { try { await browser.close(); } catch (_) {} } };
}

/**
 * Force-connect via the Browser API (CDP/WSS) specifically, skipping the ISP
 * proxy. Used as an explicit retry path (e.g. P5's raw citation-page fetch:
 * ISP proxy fetch returned empty/blocked, retry the SAME url via the more
 * robust Scraping Browser before giving up). Returns null if
 * BRIGHTDATA_BROWSER_WSS isn't set or the connect fails — callers should
 * treat null as "no retry path available".
 */
async function launchBrowserAPIOnly({ label = 'browser', blockMedia = true, localContextOptions = {} } = {}) {
  const wss = getBrightDataBrowserWSS();
  if (!wss) return null;
  try {
    console.log(`  [${label}] retry: connecting via Bright Data Browser API (CDP)...`);
    const browser = await chromium.connectOverCDP(wss, { timeout: 60000 });
    const context = browser.contexts()[0] || await browser.newContext(localContextOptions);
    context.setDefaultTimeout(45000);
    context.setDefaultNavigationTimeout(45000);
    if (blockMedia) await applyBlockMedia(context);
    console.log(`  [${label}] retry connected via Bright Data Browser API ✓`);
    return { browser, context, viaBrightData: true, close: async () => { try { await browser.close(); } catch (_) {} } };
  } catch (err) {
    console.log(`  [${label}] retry Browser API connect FAILED (${err.message})`);
    return null;
  }
}

module.exports = { launchBrowserContext, launchBrowserAPIOnly, getBrightDataBrowserWSS, getBrightDataProxy };
