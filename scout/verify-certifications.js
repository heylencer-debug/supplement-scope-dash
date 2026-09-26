/**
 * verify-certifications.js — check each product's certification claims with
 * the certifying organisation (utils/cert-registry.js) and store the result in
 * products.certifications_verified (migration 013).
 *
 * Runs in-process at the end of migrate-ocr-to-dash.js (so it follows every
 * P4 sync, including the no-cost READ-FIRST family reuse), or by hand:
 *
 *   node verify-certifications.js "<keyword>"             classify + write
 *   node verify-certifications.js "<keyword>" --dry-run   classify + print, no writes
 *   CERT_VERIFY=1 node verify-certifications.js "<keyword>"   also query the registries
 *
 * Without CERT_VERIFY=1 no HTTP request is made: registry-backed claims are
 * stored as `not_checked`, everything else as `no_registry`. With it, each
 * distinct registry page is fetched once per run (the NSF Certified for Sport
 * catalogue is one ~2 MB page shared by every product). No AI calls, ever.
 *
 * Fail-open: any failure logs and returns; the CLI always exits 0.
 */

'use strict';

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { resolveCategory } = require('./utils/category-resolver');
const { verifyCertifications } = require('./utils/cert-registry');

const isMissingColumn = (error) => !!error && (error.code === '42703' || error.code === 'PGRST204' || /column .* does not exist|Could not find the .* column/i.test(error.message || ''));

function dashClient() {
  return createClient(process.env.DASH_URL || process.env.SUPABASE_URL, process.env.DASH_KEY || process.env.SUPABASE_KEY);
}

/**
 * @param {object} p  { keyword, categoryId?, dash?, dryRun?, enabled?, fetchImpl?, log? }
 * @returns {Promise<{ products: number, written: number, verified: number, statuses: object, skipped?: string }>}
 */
async function runCertificationVerification({ keyword, categoryId, dash, dryRun = false, enabled, fetchImpl, log = console } = {}) {
  const DASH = dash || dashClient();
  const summary = { products: 0, written: 0, verified: 0, statuses: {} };
  let catId = categoryId;
  if (!catId) {
    try { catId = (await resolveCategory(DASH, keyword)).id; } catch (e) { log.warn(`  ⚠ cert verification: category not resolved (${e.message})`); return { ...summary, skipped: 'no category' }; }
  }
  const lookups = enabled ?? process.env.CERT_VERIFY === '1';
  const { data, error } = await DASH.from('products').select('id, asin, brand, title, claims_on_label').eq('category_id', catId).not('claims_on_label', 'is', null).limit(1000);
  if (error) { log.warn(`  ⚠ cert verification: products read failed (${error.message})`); return { ...summary, skipped: 'read failed' }; }
  const rows = (data || []).filter((r) => Array.isArray(r.claims_on_label) && r.claims_on_label.length);
  log.log(`\n→ Certification claims: ${rows.length} products with claims (registry lookups ${lookups ? 'ON' : 'off — set CERT_VERIFY=1 to query registries'})`);

  const cache = new Map();
  for (const r of rows) {
    summary.products++;
    const results = await verifyCertifications({ claims: r.claims_on_label, brand: r.brand, title: r.title }, { enabled: lookups, fetchImpl, cache });
    for (const x of results) {
      summary.statuses[x.status] = (summary.statuses[x.status] || 0) + 1;
      if (x.status === 'verified') summary.verified++;
      if (lookups && x.status !== 'no_registry') log.log(`  ${r.asin} · ${x.claim} → ${x.status}${x.reason ? ` (${x.reason})` : ''}`);
    }
    if (dryRun) continue;
    const payload = { schema_version: 1, checked_at: new Date().toISOString(), lookups_enabled: lookups, results };
    const { error: upErr } = await DASH.from('products').update({ certifications_verified: payload }).eq('id', r.id);
    if (upErr) {
      if (isMissingColumn(upErr)) { log.warn('  ⚠ products.certifications_verified missing (migration 013) — not stored'); return { ...summary, skipped: 'column missing' }; }
      log.warn(`  ⚠ ${r.asin}: certification write failed (${upErr.message})`);
      continue;
    }
    summary.written++;
  }
  log.log(`  Certification statuses: ${Object.entries(summary.statuses).map(([k, v]) => `${k} ${v}`).join(' · ') || 'none'}${dryRun ? ' (dry run — nothing written)' : ''}`);
  return summary;
}

module.exports = { runCertificationVerification };

if (require.main === module) {
  const args = process.argv.slice(2);
  const kwIdx = args.indexOf('--keyword');
  const keyword = kwIdx > -1 ? args[kwIdx + 1] : args.find((a) => !a.startsWith('--'));
  if (!keyword) { console.log('Usage: node verify-certifications.js "<keyword>" [--dry-run]'); process.exit(0); }
  runCertificationVerification({ keyword, dryRun: args.includes('--dry-run') })
    .catch((e) => console.warn(`  ⚠ certification verification failed: ${e.message}`))
    .finally(() => process.exit(0));
}
