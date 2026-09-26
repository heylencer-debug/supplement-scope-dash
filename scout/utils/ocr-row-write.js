/**
 * utils/ocr-row-write.js — the dovive_ocr upsert shared by ocr-phase4.js and
 * phase4-text-extract.js, tolerant of migration 013 not being applied.
 *
 * Until scout/migrations/013_label_verification.sql is applied, PostgREST
 * rejects any write naming `facts_v2` / `label_product_match` (PGRST204, or
 * 42703 from Postgres). The first such rejection retries the same row without
 * those keys and every later write in the process skips them — the legacy
 * columns are written exactly as before, and the phase never fails on it.
 */

'use strict';

const MIGRATION_013_OCR_KEYS = ['facts_v2', 'label_product_match'];

function isMissingColumnError(error, keys = MIGRATION_013_OCR_KEYS) {
  if (!error) return false;
  const text = `${error.code || ''} ${error.message || ''} ${error.details || ''}`;
  if (!/PGRST204|42703|Could not find the .* column|column .* does not exist/i.test(text)) return false;
  return keys.some((k) => text.includes(k));
}

function createOcrWriter(client, { log = console } = {}) {
  const state = { v2Columns: true };
  const strip = (r) => { const o = { ...r }; for (const k of MIGRATION_013_OCR_KEYS) delete o[k]; return o; };
  async function upsert(record) {
    const body = state.v2Columns ? record : strip(record);
    let { error } = await client.from('dovive_ocr').upsert(body, { onConflict: 'asin,image_index' });
    if (error && state.v2Columns && isMissingColumnError(error)) {
      state.v2Columns = false;
      log.warn('  ⚠ dovive_ocr migration 013 columns missing — saving without facts_v2 / label_product_match (apply scout/migrations/013_label_verification.sql)');
      ({ error } = await client.from('dovive_ocr').upsert(strip(record), { onConflict: 'asin,image_index' }));
    }
    if (error) throw new Error('Save error: ' + error.message);
  }
  return { upsert, state };
}

module.exports = { createOcrWriter, isMissingColumnError, MIGRATION_013_OCR_KEYS };
