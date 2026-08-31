/**
 * useFormulaQA
 * Loads P9 QA report from formula_briefs.ingredients.qa_report
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface QAVerdict {
  verdict: "APPROVED" | "APPROVED WITH ADJUSTMENTS" | "NEEDS MAJOR REVISION" | string;
  score: number | null;
  summary: string;
}

export interface FormulaQAData {
  qa_report: string;
  qa_verdict: QAVerdict;
  adjusted_formula: string | null;
  adjustments_table: string | null;
  qa_generated_at: string;
  ai_generated_brief: string;
  comprehensive_comparison: string | null;
  flavor_qa: string | null;
  final_formula_brief: string | null;
}

export function useFormulaQA(categoryId?: string) {
  return useQuery({
    queryKey: ["formula_qa", categoryId],
    queryFn: async (): Promise<FormulaQAData | null> => {
      // maybeSingle(), not single(): a category with no formula_briefs row
      // yet (P9 hasn't run — the normal state for an in-progress pipeline
      // run) is expected, not an error. single() throws a noisy 406 on
      // every poll for exactly that case even though the catch below
      // already treats it as "no QA yet"; maybeSingle() returns null data
      // with no error instead, same handled outcome, no console spam.
      const { data, error } = await supabase
        .from("formula_briefs")
        .select("ingredients")
        .eq("category_id", categoryId!)
        .not("ingredients", "is", null)
        .limit(1)
        .maybeSingle();
      if (error || !data) return null;
      const ing = data.ingredients as any;
      if (!ing?.qa_report) return null;
      return ing as FormulaQAData;
    },
    enabled: !!categoryId,
    staleTime: 120_000,
  });
}
