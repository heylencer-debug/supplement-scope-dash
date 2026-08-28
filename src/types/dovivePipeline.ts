/**
 * Manual types for the raw Scout pipeline tables (dovive_research, dovive_keepa,
 * dovive_reviews, dovive_ocr, dovive_phase5_research, dovive_p5_sources).
 *
 * These are NOT in the generated `src/integrations/supabase/types.ts` — they
 * live on the same Supabase project (jwkitkfufigldpldqtbq) but are written
 * directly by the Scout pipeline scripts (scout/*.js), not through the
 * Lovable-managed schema. Mirrors the shape queried by
 * scout/../phase-audit.mjs (the proven-correct completeness audit script).
 *
 * Only the fields actually read by useDataCompleteness.ts are declared —
 * this is intentionally partial, not a full schema mirror.
 */

export interface DoviveResearchRow {
  asin: string;
  keyword: string;
  title: string | null;
  brand: string | null;
  bsr: number | null;
  images: string[] | null;
}

export interface DoviveKeepaRow {
  asin: string;
  keyword: string;
}

export interface DoviveReviewRow {
  asin: string;
  keyword: string;
}

export interface DoviveOcrRow {
  asin: string;
  keyword: string;
}

export interface DovivePhase5ResearchRow {
  asin: string;
  keyword: string;
  full_research: string | null;
  key_strengths: string | null;
  benefits: string[] | null;
  competitor_angle: string | null;
  researched_by: string | null;
}

export interface DoviveP5SourceRow {
  asin: string;
  keyword: string;
}

/** Minimal shape of formula_briefs.ingredients (jsonb) sub-keys used by the completeness audit. */
export interface FormulaBriefIngredientsShape {
  qa_report?: string | null;
  call2_raw_output?: string | null;
  competitor_notes_json?: unknown;
  flavor_qa?: unknown;
  competitive_benchmarking?: unknown;
  fda_compliance?: unknown;
  [key: string]: unknown;
}
