import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface IngredientRow {
  ingredient: string;
  amount_mg?: number | null;
  amount_mcg?: number | null;
  amount_iu?: number | null;
  elemental_mg?: number | null;
  form?: string;
  function?: string;
  supplier?: string;
  rationale?: string;
  grade?: string;
  dv_percent?: string;
}

export interface FormulaBriefData {
  id: string;
  category_id: string;
  positioning: string | null;
  target_customer: string | null;
  form_type: string | null;
  form_rationale: string | null;
  flavor_profile: string | null;
  flavor_importance: string | null;
  flavor_development_needed: boolean | null;
  servings_per_container: number | null;
  target_price: number | null;
  packaging_type: string | null;
  packaging_recommendations: string | null;
  testing_requirements: string[] | null;
  certifications: string[] | null;
  key_differentiators: string[] | null;
  market_summary: any;
  consumer_pain_points: any[];
  opportunity_insights: any;
  ingredients: {
    master_formula_per_serving?: {
      serving_size?: string;
      servings_per_container?: number;
      total_count?: number;
      primary_actives?: IngredientRow[];
      secondary_actives?: IngredientRow[];
      tertiary_actives?: IngredientRow[];
      excipients?: IngredientRow[];
      formula_summary?: {
        primary_mg: number;
        secondary_mg: number;
        tertiary_mg: number;
        excipients_mg: number;
        total_mg: number;
        per_gummy_mg: number;
      };
    };
    supplement_facts?: string;
    other_ingredients?: string;
    directions?: string;
    warnings?: string;
    claims?: string[];
    variants?: Array<{
      name: string;
      flavor: string;
      target: string;
      changes: string;
      rationale: string;
    }>;
    synergies?: string[];
    pricing?: Array<{ format: string; msrp?: number; per_sv: number }>;
    physical?: {
      shape?: string;
      unit_mg?: number;
      aw?: string;
      moisture?: string;
      hardness?: string;
    };
    stability?: {
      shelf_months?: number;
      overages?: Array<{
        name: string;
        label?: number;
        label_mcg?: number;
        overage_pct: number;
        target?: number;
        target_mcg?: number;
      }>;
    };
  } | null;
  regulatory_notes: string | null;
  risk_factors: string[] | null;
  created_at: string;
  updated_at: string;
}

async function fetchFormulaBrief(categoryId: string): Promise<FormulaBriefData | null> {
  const { data, error } = await supabase
    .from("formula_briefs")
    .select("*")
    .eq("category_id", categoryId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as FormulaBriefData | null;
}

export function useFormulaBrief(categoryId?: string) {
  return useQuery({
    queryKey: ["formula_brief", categoryId],
    queryFn: () => fetchFormulaBrief(categoryId!),
    enabled: !!categoryId,
    staleTime: 10 * 60_000,
  });
}
