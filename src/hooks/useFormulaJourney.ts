/**
 * useFormulaJourney — derives the 5-stage "Formula Journey" state machine
 * (Formulation → QA Review → Competitive Benchmark → FDA/DSHEA Compliance →
 * Factory Handoff) from formula_briefs + manufacturer_feedback.
 *
 * Reuses the same formula_briefs.ingredients shape that useFormulaBrief and
 * useFormulaQA read, plus the shared P11/P12 parser (src/lib/formulaScores.ts)
 * so scores here always match the Compliance tab / pipeline status.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { parseBenchmarkAndCompliance } from "@/lib/formulaScores";
import { getCanonicalFormula, type CanonicalFormula } from "@/lib/canonicalFormula";

export type JourneyStageId = "formulation" | "qa" | "benchmark" | "compliance" | "factory";
export type JourneyStageState = "done" | "current" | "pending";

export interface JourneyStage {
  id: JourneyStageId;
  label: string;
  state: JourneyStageState;
  headline: string;
  score?: string;
}

export interface FormulaJourneyResult {
  stages: JourneyStage[];
  hasAnyData: boolean;
  p11Score: number | null;
  p12Score: number | null;
  /** P13 chief-formulator sign-off — the compliance-corrected final formula document. */
  finalSignoff: { opus_review?: string; verdict?: string; generated_at?: string; model?: string } | null;
  /** The ONE canonical formula for this category — see src/lib/canonicalFormula.ts. */
  canonicalFormula: CanonicalFormula;
  isLoading: boolean;
  error: unknown;
}

interface JourneyRaw {
  ingredients: Record<string, unknown> | null;
  feedbackCount: number;
}

async function fetchJourneyData(categoryId: string): Promise<JourneyRaw> {
  const [briefRes, feedbackRes] = await Promise.all([
    supabase
      .from("formula_briefs")
      .select("ingredients")
      .eq("category_id", categoryId)
      .maybeSingle(),
    supabase
      .from("manufacturer_feedback")
      .select("id", { count: "exact", head: true })
      .eq("category_id", categoryId),
  ]);

  if (briefRes.error) throw briefRes.error;

  return {
    ingredients: (briefRes.data?.ingredients as Record<string, unknown> | null) ?? null,
    // Feedback count is a nice-to-have signal for the Factory stage — don't
    // fail the whole journey if this secondary query errors (e.g. RLS).
    feedbackCount: feedbackRes.error ? 0 : feedbackRes.count ?? 0,
  };
}

export function useFormulaJourney(categoryId?: string): FormulaJourneyResult {
  const query = useQuery({
    queryKey: ["formula_journey", categoryId],
    queryFn: () => fetchJourneyData(categoryId!),
    enabled: !!categoryId,
    staleTime: 30_000,
  });

  const ing = query.data?.ingredients ?? null;
  const feedbackCount = query.data?.feedbackCount ?? 0;
  const hasAnyData = !!ing;

  const formulationDone = !!(
    ((ing?.final_formula_brief as string)?.length) ||
    ((ing?.ai_generated_brief_grok as string)?.length) ||
    ((ing?.ai_generated_brief_claude as string)?.length)
  );
  const qaDone = !!((ing?.qa_report as string)?.length);
  const { p11Score, p11Complete: benchmarkDone, p12Score, p12Complete: complianceDone } =
    parseBenchmarkAndCompliance(ing);
  const factoryDone = feedbackCount > 0;

  const doneFlags = [formulationDone, qaDone, benchmarkDone, complianceDone, factoryDone];
  const firstPendingIdx = doneFlags.findIndex((d) => !d);

  const stateFor = (idx: number, done: boolean): JourneyStageState => {
    if (!hasAnyData) return "pending"; // fresh category — nothing has run yet
    if (done) return "done";
    if (idx === firstPendingIdx) return "current";
    return "pending";
  };

  const qaVerdict = ing?.qa_verdict as { verdict?: string } | null | undefined;
  const hasAdjustments = !!(ing?.adjustments_table || (ing?.adjusted_formula as string)?.length);

  const stages: JourneyStage[] = [
    {
      id: "formulation",
      label: "Formulation",
      state: stateFor(0, formulationDone),
      headline: hasAnyData
        ? (formulationDone
          ? "Dual drafts (Opus 5 + Sonnet 5) → final brief"
          : "Waiting on P8 formula brief")
        : "Run the pipeline first",
    },
    {
      id: "qa",
      label: "QA Review",
      state: stateFor(1, qaDone),
      headline: hasAnyData
        ? (qaDone
          ? `${(qaVerdict?.verdict || "Reviewed").replace(/\*+/g, "").trim()}${hasAdjustments ? " · adjustments applied" : ""}`
          : "Waiting on P9 QA review")
        : "Run the pipeline first",
    },
    {
      id: "benchmark",
      label: "Competitive Benchmark",
      state: stateFor(2, benchmarkDone),
      headline: hasAnyData
        ? (benchmarkDone
          ? `Benchmark score ${p11Score != null ? `${p11Score}/10` : "—"}`
          : "Waiting on P11 benchmarking")
        : "Run the pipeline first",
      score: p11Score != null ? `${p11Score}/10` : undefined,
    },
    {
      id: "compliance",
      label: "FDA / DSHEA Compliance",
      state: stateFor(3, complianceDone),
      headline: hasAnyData
        ? (complianceDone
          ? `FDA compliance score ${p12Score != null ? `${p12Score}/100` : "—"}`
          : "Waiting on P12 FDA compliance")
        : "Run the pipeline first",
      score: p12Score != null ? `${p12Score}/100` : undefined,
    },
    {
      id: "factory",
      label: "Factory Handoff",
      state: !hasAnyData ? "pending" : !complianceDone ? "pending" : stateFor(4, factoryDone),
      headline: !hasAnyData
        ? "Run the pipeline first"
        : !complianceDone
        ? "Waiting on compliance"
        : factoryDone
        ? `${feedbackCount} manufacturer touchpoint${feedbackCount === 1 ? "" : "s"}`
        : "Ready to generate manufacturer link",
    },
  ];

  // P13 Final Sign-off — the corrected, factory-ready formula document.
  const signoff = ing?.final_signoff as { opus_review?: string; verdict?: string; generated_at?: string; model?: string } | null | undefined;
  const finalSignoff = signoff && (signoff.opus_review?.length ?? 0) > 500 ? signoff : null;

  const canonicalFormula = getCanonicalFormula(ing);

  return {
    stages,
    hasAnyData,
    p11Score,
    p12Score,
    finalSignoff,
    canonicalFormula,
    isLoading: query.isLoading,
    error: query.error,
  };
}
