/**
 * canonicalFormula — resolves the ONE formula a user should see for a
 * category, from the several documents the pipeline produces along the
 * way (dual-AI drafts → QA-adjusted formula → P13 chief-formulator
 * sign-off). Everything that isn't the canonical object is audit trail.
 *
 * Priority (highest maturity wins):
 *   1. P13 sign-off        — formula_briefs.ingredients.final_signoff.opus_review
 *   2. QA-adjusted formula — formula_briefs.ingredients.adjusted_formula
 *   3. Draft brief         — formula_briefs.ingredients.final_formula_brief
 *                             or ai_generated_brief (legacy)
 *   4. None
 *
 * Read-only: this only reads fields off the `ingredients` object already
 * fetched elsewhere (e.g. useFormulaJourney, useFormulaBrief) — it never
 * queries Supabase itself and never writes anything.
 */

export type CanonicalFormulaSource = "signoff" | "qa_adjusted" | "brief" | null;

export interface CanonicalFormula {
  source: CanonicalFormulaSource;
  /** Human-readable maturity chip text, e.g. "Signed off". Empty when source is null. */
  maturityLabel: string;
  /** The complete underlying document — feed this to DocumentModal / MarkdownDoc for "Open full document". */
  fullDocument: string;
  /** A shorter excerpt (ideally just the ingredient table) to render inline with zero clicks. */
  inlineExcerpt: string;
  /** P13 verdict text (e.g. "APPROVED WITH CORRECTIONS") — only set when source === "signoff". */
  verdict?: string;
  /** ISO timestamp — only set when source === "signoff". */
  generatedAt?: string;
}

const EMPTY: CanonicalFormula = {
  source: null,
  maturityLabel: "",
  fullDocument: "",
  inlineExcerpt: "",
};

const INLINE_EXCERPT_FALLBACK_CHARS = 4000;

// Matches the P13 sign-off prompt's "## 2. FINAL FORMULA — Per Serving (...)"
// heading (see scout/phase12-final-signoff.js) — tolerant of trailing text
// on the same line (the serving-size suffix).
const SECTION_2_HEADING_RE = /^##\s*2\.\s*FINAL FORMULA\b.*$/im;

/**
 * Extracts the "## 2. FINAL FORMULA" section (heading through the next
 * "## " heading) from a document. Falls back to the first 4k characters
 * when the heading isn't found — keeps short QA-adjusted tables/draft
 * briefs intact (they're rarely longer than that) while still bounding
 * huge documents for inline display.
 */
function extractInlineExcerpt(fullDocument: string): string {
  const headingMatch = fullDocument.match(SECTION_2_HEADING_RE);
  if (headingMatch && headingMatch.index != null) {
    const startIdx = headingMatch.index;
    const afterHeadingIdx = startIdx + headingMatch[0].length;
    const rest = fullDocument.slice(afterHeadingIdx);
    const nextHeadingMatch = rest.match(/\n##\s/);
    const endIdx = nextHeadingMatch && nextHeadingMatch.index != null
      ? afterHeadingIdx + nextHeadingMatch.index
      : fullDocument.length;
    return fullDocument.slice(startIdx, endIdx).trim();
  }
  return fullDocument.length > INLINE_EXCERPT_FALLBACK_CHARS
    ? fullDocument.slice(0, INLINE_EXCERPT_FALLBACK_CHARS).trim()
    : fullDocument.trim();
}

export function getCanonicalFormula(
  ingredients: Record<string, unknown> | null | undefined
): CanonicalFormula {
  if (!ingredients) return EMPTY;

  // 1. P13 chief-formulator sign-off — outranks everything.
  const signoff = ingredients.final_signoff as
    | { opus_review?: string; verdict?: string; generated_at?: string; model?: string }
    | null
    | undefined;
  if (signoff && (signoff.opus_review?.length ?? 0) > 500) {
    const fullDocument = signoff.opus_review as string;
    return {
      source: "signoff",
      maturityLabel: "Signed off",
      fullDocument,
      inlineExcerpt: extractInlineExcerpt(fullDocument),
      verdict: signoff.verdict,
      generatedAt: signoff.generated_at,
    };
  }

  // 2. QA-adjusted formula — P9 adjudicator's corrected spec, pre sign-off.
  const adjustedFormula = ingredients.adjusted_formula as string | null | undefined;
  if (adjustedFormula && adjustedFormula.trim().length > 0) {
    return {
      source: "qa_adjusted",
      maturityLabel: "QA-adjusted — sign-off pending",
      fullDocument: adjustedFormula,
      inlineExcerpt: extractInlineExcerpt(adjustedFormula),
    };
  }

  // 3. Draft brief — the pre-QA formula brief (final_formula_brief preferred,
  //    ai_generated_brief is the legacy single-model fallback).
  const brief =
    (ingredients.final_formula_brief as string | null | undefined) ||
    (ingredients.ai_generated_brief as string | null | undefined);
  if (brief && brief.trim().length > 0) {
    return {
      source: "brief",
      maturityLabel: "Draft brief — QA pending",
      fullDocument: brief,
      inlineExcerpt: extractInlineExcerpt(brief),
    };
  }

  return EMPTY;
}

export default getCanonicalFormula;
