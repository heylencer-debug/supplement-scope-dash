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
  // 2026-09-03: tri-formula fields (Proven/Edge/Recommended Blend), present
  // whenever P9 wrote `ingredients.formula_variants` — independent of which
  // maturity tier above resolved (signoff/qa_adjusted/brief), since P9
  // always runs before P13. Absent (undefined) on any pre-tri-formula
  // brief, so callers render the single `inlineExcerpt`/`fullDocument` as
  // they always have — the graceful-fallback path.
  variants?: { proven: string | null; edge: string | null; recommended: string | null };
  /** Per-formula P13 sign-off verdicts — only populated when source === "signoff" AND variants exist. */
  perFormulaSignoff?: {
    proven?: { verdict: string };
    edge?: { verdict: string };
    recommended?: { verdict: string };
  };
  /** P9's "## COMPARATIVE VERDICT — WHEN TO LAUNCH WHICH" section, verbatim markdown. */
  comparativeVerdict?: string | null;
}

const EMPTY: CanonicalFormula = {
  source: null,
  maturityLabel: "",
  fullDocument: "",
  inlineExcerpt: "",
};

// 2026-09-03: attaches tri-formula fields to whichever maturity tier
// resolved below — deterministic (no heading-regex matching against the
// tri-formula P13 structure, which no longer emits a single "## 2. FINAL
// FORMULA" heading). Recommended Blend replaces inlineExcerpt when variants
// exist, since it's the canonical formula either way.
function attachVariants(result: CanonicalFormula, ingredients: Record<string, unknown>): CanonicalFormula {
  const variantsRaw = ingredients.formula_variants as
    | { proven?: string | null; edge?: string | null; recommended?: string | null }
    | null
    | undefined;
  if (!variantsRaw || !(variantsRaw.proven || variantsRaw.edge || variantsRaw.recommended)) return result;
  const variants = {
    proven: variantsRaw.proven || null,
    edge: variantsRaw.edge || null,
    recommended: variantsRaw.recommended || null,
  };
  const signoff = ingredients.final_signoff as { per_formula?: CanonicalFormula["perFormulaSignoff"] } | null | undefined;
  return {
    ...result,
    variants,
    perFormulaSignoff: result.source === "signoff" ? signoff?.per_formula : undefined,
    comparativeVerdict: (ingredients.comparative_verdict as string | null) || undefined,
    inlineExcerpt: variants.recommended || result.inlineExcerpt,
  };
}

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
    return attachVariants({
      source: "signoff",
      maturityLabel: "Signed off",
      fullDocument,
      inlineExcerpt: extractInlineExcerpt(fullDocument),
      verdict: signoff.verdict,
      generatedAt: signoff.generated_at,
    }, ingredients);
  }

  // 2. QA-adjusted formula — P9 adjudicator's corrected spec, pre sign-off.
  const adjustedFormula = ingredients.adjusted_formula as string | null | undefined;
  if (adjustedFormula && adjustedFormula.trim().length > 0) {
    return attachVariants({
      source: "qa_adjusted",
      maturityLabel: "QA-adjusted — sign-off pending",
      fullDocument: adjustedFormula,
      inlineExcerpt: extractInlineExcerpt(adjustedFormula),
    }, ingredients);
  }

  // 3. Draft brief — the pre-QA formula brief (final_formula_brief preferred,
  //    ai_generated_brief is the legacy single-model fallback).
  const brief =
    (ingredients.final_formula_brief as string | null | undefined) ||
    (ingredients.ai_generated_brief as string | null | undefined);
  if (brief && brief.trim().length > 0) {
    return attachVariants({
      source: "brief",
      maturityLabel: "Draft brief — QA pending",
      fullDocument: brief,
      inlineExcerpt: extractInlineExcerpt(brief),
    }, ingredients);
  }

  return EMPTY;
}

// 2026-09-03 follow-up: text-based tri-formula extraction for surfaces that
// only have a raw markdown blob (e.g. a `formula_brief_versions` snapshot,
// or the Manufacturer Portal's `formula_brief_content`/`formula_text`
// strings) instead of the structured `ingredients.formula_variants` column.
// Mirrors `scout/phase9-formula-qa.js`'s `extractFormulaVariant()` regex
// exactly (same dash-tolerant, heading-level-tolerant pattern) so a document
// containing the "### FORMULA -- PROVEN/EDGE/RECOMMENDED BLEND" subsections
// splits identically wherever it's read from. Returns null when none of the
// three headings are found — callers keep rendering the flat document.
export interface RawFormulaVariants {
  proven: string | null;
  edge: string | null;
  recommended: string | null;
}

function extractVariantSection(text: string, label: string, nextLabels: string[]): string | null {
  if (!text) return null;
  const dash = "[-\\u2013\\u2014]+";
  const next = nextLabels.length
    ? `(?:\\n#{2,4}\\s*FORMULA\\s*${dash}\\s*(?:${nextLabels.join("|")})|\\n##\\s|$)`
    : "(?:\\n##\\s|$)";
  const re = new RegExp(`#{2,4}\\s*FORMULA\\s*${dash}\\s*${label}[^\\n]*\\n([\\s\\S]*?)${next}`, "i");
  return text.match(re)?.[1]?.trim() || null;
}

export function extractFormulaVariantsFromText(text: string | null | undefined): RawFormulaVariants | null {
  if (!text) return null;
  const proven = extractVariantSection(text, "PROVEN", ["EDGE", "RECOMMENDED"]);
  const edge = extractVariantSection(text, "EDGE", ["RECOMMENDED"]);
  const recommended = extractVariantSection(text, "RECOMMENDED", []);
  if (!proven && !edge && !recommended) return null;
  return { proven, edge, recommended };
}

/** Number of populated variant slots — drives the "N formulas" badge. */
export function countFormulaVariants(
  variants: { proven?: string | null; edge?: string | null; recommended?: string | null } | null | undefined
): number {
  if (!variants) return 0;
  return [variants.proven, variants.edge, variants.recommended].filter(Boolean).length;
}

export default getCanonicalFormula;
