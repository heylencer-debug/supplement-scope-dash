/**
 * useFormulaBrief — fetches formula_briefs data for a category
 * Powers P9BenchmarkOverview and P9DoseAnalysis with real, category-specific data
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface IngredientRow {
  name: string;
  amount_mg: number;
  raw: string;
}

export interface FormulaBriefData {
  category_id: string;
  positioning: string | null;
  target_customer: string | null;
  form_type: string | null;
  flavor_profile: string | null;
  servings_per_container: number | null;
  target_price: number | null;
  certifications: string[] | null;
  key_differentiators: string[] | null;
  risk_factors: string[] | null;
  opportunity_insights: string | null;
  market_summary: string | null;
  consumer_pain_points: string[] | null;
  ingredients: {
    ai_generated_brief?: string;
    ai_generated_brief_grok?: string;
    ai_generated_brief_claude?: string;
    adjusted_formula?: string;        // markdown table from P10
    comprehensive_comparison?: string; // competitor comparison markdown
    qa_verdict?: {
      score: number | null;
      summary: string;
    };
    qa_report?: string;
    final_formula_brief?: string;
    // 2026-09-03: tri-formula fields — additive, null/absent on any brief
    // generated before this shipped (FormulaBriefTab falls back to the
    // single-formula render when formula_variants is absent).
    formula_variants?: {
      proven: string | null;
      edge: string | null;
      recommended: string | null;
    } | null;
    comparative_verdict?: string | null;
    final_signoff?: {
      opus_review: string;
      verdict: string;
      corrections_applied: boolean;
      generated_at: string;
      model: string;
      per_formula?: {
        proven?: { verdict: string; review?: string | null };
        edge?: { verdict: string; review?: string | null };
        recommended?: { verdict: string; review?: string | null };
      };
      comparative_note?: string | null;
    } | null;
    formula_validation?: {
      valid: boolean;
      errors: string[];
      warnings: string[];
      ingredients: Array<{ name: string; amount_mg: number; raw: string }>;
    };
    flavor_qa?: string;
    market_intelligence?: {
      ai_market_analysis: string;
      products_analyzed: number;
    };
    data_sources?: {
      top5_used: number;
      new_winners_used: number;
      pain_points_used: number;
      ingredients_analyzed: number;
    };
    keyword?: string;
  } | null;
}

async function fetchFormulaBrief(categoryId: string): Promise<FormulaBriefData | null> {
  const { data, error } = await supabase
    .from("formula_briefs")
    .select("category_id, positioning, target_customer, form_type, flavor_profile, servings_per_container, target_price, key_differentiators, risk_factors, opportunity_insights, market_summary, consumer_pain_points, ingredients")
    .eq("category_id", categoryId)
    .maybeSingle();

  if (error) throw error;
  return data as FormulaBriefData | null;
}

export function useFormulaBrief(categoryId?: string) {
  return useQuery({
    queryKey: ["formula_brief", categoryId],
    queryFn: () => fetchFormulaBrief(categoryId!),
    enabled: !!categoryId,
    staleTime: 5 * 60_000,
  });
}
