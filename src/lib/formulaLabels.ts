/**
 * formulaLabels — display-only text rewrites for the "one formula, one
 * audit trail" IA. The pipeline's dual-AI drafts are internally still
 * called "Formula A"/"Formula B" in a few UI strings (a holdover from
 * before the canonical-formula resolver existed) — this makes them read
 * as working drafts, not peers of the canonical formula.
 *
 * IMPORTANT: only ever call this at JSX render sites. In
 * ManufacturerPortal.tsx / ManufacturerPortalInternal.tsx the raw label
 * string doubles as a functional key — it's written to
 * formula_brief_versions / manufacturer feedback comments as
 * `version_label` and matched on for "shared with manufacturer" /
 * comment-thread lookups. Rewriting the underlying value (not just its
 * display) would silently disconnect existing comment threads. Never
 * apply this to a label before it's used in a DB write, `.find()`/`===`
 * comparison, or `.in()` filter — display text only.
 */
export function displayFormulaLabel(raw: string | null | undefined): string {
  if (!raw) return raw ?? "";
  if (/^formula a\b/i.test(raw)) return "Working draft (Opus 5)";
  if (/^formula b\b/i.test(raw)) return "Working draft (Sonnet 5)";
  return raw;
}

export default displayFormulaLabel;
