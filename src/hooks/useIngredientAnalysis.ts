import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface IngredientAnalysis {
  summary: {
    overall_assessment: 'Strong' | 'Moderate' | 'Weak';
    key_strengths: string[];
    key_gaps: string[];
    recommendation: string;
  };
  ingredients: Array<{
    name: string;
    our_dosage: string | null;
    avg_competitor_dosage: string | null;
    gap_status: 'leading' | 'matching' | 'trailing' | 'missing' | 'unique';
    gap_percentage: number | null;
    clinical_note: string;
    priority: 'high' | 'medium' | 'low';
  }>;
  charts: {
    dosage_comparison: Array<{
      ingredient: string;
      our_amount: number;
      competitor_avg: number;
      unit: string;
    }>;
    coverage_score: number;
    uniqueness_score: number;
    efficacy_score: number;
  };
  actionable_insights: Array<{
    type: 'add' | 'increase' | 'decrease' | 'remove' | 'keep';
    ingredient: string;
    reason: string;
    impact: 'high' | 'medium' | 'low';
  }>;
  customer_insights?: {
    pain_point_solutions: Array<{
      pain_point: string;
      solving_ingredient: string;
      confidence: 'high' | 'medium' | 'low';
      evidence: string;
    }>;
    unaddressed_complaints: Array<{
      complaint: string;
      suggested_solution: string;
      ingredient_recommendation: string;
    }>;
  };
  competitive_matrix?: {
    advantages: Array<{
      category: string;
      our_position: string;
      vs_competitors: string;
      impact: 'high' | 'medium' | 'low';
    }>;
    vulnerabilities: Array<{
      category: string;
      risk_description: string;
      mitigation: string;
    }>;
  };
  clinical_analysis?: {
    dosage_adequacy: Array<{
      ingredient: string;
      our_dosage: string;
      clinical_range: string;
      adequacy: 'optimal' | 'adequate' | 'suboptimal' | 'insufficient';
      research_note: string;
    }>;
    synergy_pairs: Array<{
      ingredients: string[];
      synergy_type: string;
      present_in_formula: boolean;
    }>;
  };
  swot?: {
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
    threats: string[];
  };
  priority_roadmap?: Array<{
    phase: 1 | 2 | 3;
    action: string;
    ingredient: string;
    expected_impact: string;
    complexity: 'easy' | 'moderate' | 'complex';
    timeline: string;
  }>;
  // NEW: AI-Generated Ingredient Comparison Table
  ingredient_comparison_table?: {
    our_concept_name: string;
    competitors: Array<{
      brand: string;
      product_name: string;
    }>;
    rows: Array<{
      ingredient: string;
      category: 'primary_active' | 'secondary_active' | 'tertiary_active' | 'excipient' | 'other';
      our_concept: {
        amount: string | null;
        form: string | null;
      };
      competitor_1: { amount: string | null; present: boolean };
      competitor_2: { amount: string | null; present: boolean };
      competitor_3: { amount: string | null; present: boolean };
      status: 'in_all' | 'unique_to_us' | 'missing_from_us' | 'partial';
      comparison_note: string;
    }>;
    summary: {
      total_our_ingredients: number;
      total_competitor_avg: number;
      overlap_count: number;
      unique_to_us_count: number;
      missing_from_us_count: number;
      overall_assessment: string;
    };
  };
}

export function useIngredientAnalysis(categoryId?: string) {
  const [analysis, setAnalysis] = useState<IngredientAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingFromDb, setIsLoadingFromDb] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Load from database on mount
  useEffect(() => {
    async function loadFromDb() {
      if (!categoryId) {
        setIsLoadingFromDb(false);
        return;
      }

      try {
        const { data, error: dbError } = await supabase
          .from('ingredient_analyses')
          .select('analysis')
          .eq('category_id', categoryId)
          .maybeSingle();

        if (dbError) {
          console.error('Error loading analysis from DB:', dbError);
        } else if (data?.analysis) {
          setAnalysis(data.analysis as unknown as IngredientAnalysis);
        }
      } catch (e) {
        console.error('Error loading analysis from DB:', e);
      } finally {
        setIsLoadingFromDb(false);
      }
    }

    loadFromDb();
  }, [categoryId]);

  const runAnalysis = useCallback(async () => {
    if (!categoryId) {
      toast({
        title: 'Error',
        description: 'No category selected',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('analyze-ingredients', {
        body: { categoryId }
      });

      if (fnError) {
        throw new Error(fnError.message);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      if (data?.analysis) {
        setAnalysis(data.analysis);

        toast({
          title: 'Analysis Complete',
          description: `Comprehensive analysis with ${data.analysis.ingredients?.length || 0} ingredients, SWOT, clinical insights, and roadmap generated.`,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to analyze ingredients';
      setError(message);
      toast({
        title: 'Analysis Failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [categoryId, toast]);

  const clearAnalysis = useCallback(async () => {
    setAnalysis(null);
    setError(null);
    
    // Delete from database
    if (categoryId) {
      try {
        await supabase
          .from('ingredient_analyses')
          .delete()
          .eq('category_id', categoryId);
      } catch (e) {
        console.error('Error clearing analysis from DB:', e);
      }
    }
  }, [categoryId]);

  return {
    analysis,
    isLoading,
    isLoadingFromDb,
    error,
    runAnalysis,
    clearAnalysis,
    hasAnalysis: !!analysis,
  };
}
