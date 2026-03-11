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
      const { data, error } = await supabase
        .from("formula_briefs")
        .select("ingredients")
        .eq("category_id", categoryId!)
        .not("ingredients", "is", null)
        .limit(1)
        .single();
      if (error || !data) return null;
      const ing = data.ingredients as any;
      if (!ing?.qa_report) return null;
      return ing as FormulaQAData;
    },
    enabled: !!categoryId,
    staleTime: 120_000,
  });
}
