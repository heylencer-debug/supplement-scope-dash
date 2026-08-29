/**
 * formulaScores — shared P11/P12 score + completion parsing.
 *
 * Extracted verbatim from usePipelineStatus.ts's inline P11/P12 computation
 * so useFormulaJourney (Formula Journey tab / Passport) reads the same
 * fields the same way instead of re-deriving them. usePipelineStatus.ts now
 * calls this too — its output is unchanged, this is a pure refactor.
 */

export interface BenchmarkComplianceParsed {
  p11Score: number | null;
  p11Complete: boolean;
  p12Score: number | null;
  p12Complete: boolean;
}

export function parseBenchmarkAndCompliance(
  ingredients: Record<string, unknown> | null | undefined
): BenchmarkComplianceParsed {
  // P11: Competitive Benchmarking - check for sonnet_draft (or legacy grok_draft)
  const p11Benchmarking = ingredients?.competitive_benchmarking as Record<string, unknown> | null | undefined;
  const p11Complete = !!(
    ((p11Benchmarking?.sonnet_draft as string)?.length > 100) ||
    ((p11Benchmarking?.grok_draft as string)?.length > 100)
  );
  // Guard against historical bad extractions (e.g. "500" parsed out of
  // "500/1000mg" by an unanchored backend regex) — a real score is 0–10.
  const p11ScoreRaw = (p11Benchmarking?.formula_score as number) ?? null;
  const p11Score = p11ScoreRaw !== null && p11ScoreRaw >= 0 && p11ScoreRaw <= 10 ? p11ScoreRaw : null;

  // P12: FDA Compliance - check for opus_analysis
  const p12Compliance = ingredients?.fda_compliance as Record<string, unknown> | null | undefined;
  const p12Complete = !!((p12Compliance?.opus_analysis as string)?.length > 100);
  const p12ScoreRaw = (p12Compliance?.compliance_score as number) ?? null;
  const p12Score = p12ScoreRaw !== null && p12ScoreRaw >= 0 && p12ScoreRaw <= 100 ? p12ScoreRaw : null;

  return { p11Score, p11Complete, p12Score, p12Complete };
}
