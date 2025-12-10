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
          description: `Found ${data.analysis.ingredients?.length || 0} ingredients analyzed with ${data.analysis.actionable_insights?.length || 0} actionable insights.`,
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
