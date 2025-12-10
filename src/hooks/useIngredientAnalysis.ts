import { useState, useCallback } from 'react';
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

const CACHE_KEY_PREFIX = 'ingredient_analysis_';
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

export function useIngredientAnalysis(categoryId?: string) {
  const [analysis, setAnalysis] = useState<IngredientAnalysis | null>(() => {
    // Try to load from cache on initial render
    if (categoryId) {
      try {
        const cached = localStorage.getItem(`${CACHE_KEY_PREFIX}${categoryId}`);
        if (cached) {
          const { data, timestamp } = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_TTL_MS) {
            return data;
          }
        }
      } catch (e) {
        console.error('Error loading cached analysis:', e);
      }
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

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
        
        // Cache the result
        try {
          localStorage.setItem(
            `${CACHE_KEY_PREFIX}${categoryId}`,
            JSON.stringify({ data: data.analysis, timestamp: Date.now() })
          );
        } catch (e) {
          console.error('Error caching analysis:', e);
        }

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

  const clearAnalysis = useCallback(() => {
    setAnalysis(null);
    setError(null);
    if (categoryId) {
      try {
        localStorage.removeItem(`${CACHE_KEY_PREFIX}${categoryId}`);
      } catch (e) {
        console.error('Error clearing cached analysis:', e);
      }
    }
  }, [categoryId]);

  return {
    analysis,
    isLoading,
    error,
    runAnalysis,
    clearAnalysis,
    hasAnalysis: !!analysis,
  };
}
