-- 005_products_unique_constraint.sql
-- Precondition (DONE 2026-08-29): cleanup-stale-products.js retired 188
-- stale duplicate-category rows and dedupe-exact-products.js removed the
-- remaining 314 exact (asin, category_id) duplicates — the table is clean.
-- This constraint makes migrate-p1-to-dash's native .upsert(onConflict)
-- atomic and prevents any future duplicate product rows at the DB level.

ALTER TABLE products
  ADD CONSTRAINT products_asin_category_unique UNIQUE (asin, category_id);
