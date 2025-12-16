import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type IngredientAnalysisType = 'new_winners' | 'top_performers';

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
  // Raw competitor formulation details
  competitor_details?: Array<{
    brand: string;
    title: string;
    price: number | null;
    monthly_sales: number | null;
    age_months: number | null;
    supplement_facts_complete: {
      serving_size: string | null;
      active_ingredients: any[] | null;
      all_nutrients: any[] | null;
      proprietary_blends: any[] | null;
      claims_on_label: string[] | null;
      directions: string | null;
      warnings: string | null;
      manufacturer: string | null;
    } | null;
    other_ingredients: string | null;
    specifications: string | null;
    important_information: string | null;
    ingredients: string | null;
  }>;
  // Error state fields
  status?: string;
  error?: boolean;
  message?: string;
}

export function useIngredientAnalysis(categoryId?: string, type: IngredientAnalysisType = 'top_performers') {
  const [analysis, setAnalysis] = useState<IngredientAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingFromDb, setIsLoadingFromDb] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pollingStatus, setPollingStatus] = useState<{
    isPolling: boolean;
    attempt: number;
    maxAttempts: number;
    startedAt: Date | null;
  }>({ isPolling: false, attempt: 0, maxAttempts: 60, startedAt: null });
  const { toast } = useToast();
  const pollingRef = useRef<boolean>(false);

  // Check if analysis data is valid (not in-progress or error)
  const isValidAnalysis = (data: any): boolean => {
    if (!data) return false;
    if (data.status === 'in_progress') return false;
    if (data.error === true) return false;
    if (!data.summary) return false;
    return true;
  };

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
          .eq('type', type)
          .maybeSingle();

        if (dbError) {
          console.error(`[useIngredientAnalysis:${type}] DB load error:`, dbError);
        } else if (data?.analysis && isValidAnalysis(data.analysis)) {
          console.log(`[useIngredientAnalysis:${type}] Loaded valid analysis from DB`);
          setAnalysis(data.analysis as unknown as IngredientAnalysis);
        } else if (data?.analysis) {
          console.log(`[useIngredientAnalysis:${type}] Found analysis but invalid/in-progress:`, data.analysis);
        }
      } catch (e) {
        console.error(`[useIngredientAnalysis:${type}] DB load error:`, e);
      } finally {
        setIsLoadingFromDb(false);
      }
    }

    loadFromDb();
  }, [categoryId, type]);

  const runAnalysis = useCallback(async () => {
    if (!categoryId) {
      toast({
        title: 'Error',
        description: 'No category selected',
        variant: 'destructive',
      });
      return;
    }

    if (pollingRef.current) {
      console.log(`[useIngredientAnalysis:${type}] Already polling, skipping`);
      return;
    }

    setIsLoading(true);
    setError(null);
    pollingRef.current = true;

    try {
      // Clear existing analysis for this type
      console.log(`[useIngredientAnalysis:${type}] Clearing existing analysis...`);
      await supabase
        .from('ingredient_analyses')
        .delete()
        .eq('category_id', categoryId)
        .eq('type', type);
      
      setAnalysis(null);

      // Call edge function with type parameter
      console.log(`[useIngredientAnalysis:${type}] Invoking edge function...`);
      const { data, error: fnError } = await supabase.functions.invoke('analyze-ingredients', {
        body: { categoryId, type }
      });

      if (fnError) {
        console.error(`[useIngredientAnalysis:${type}] Edge function error:`, fnError);
        throw new Error(fnError.message);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      const typeLabel = type === 'new_winners' ? 'New Winners' : 'Top Performers';
      toast({
        title: 'Analysis Started',
        description: `AI analysis for ${typeLabel} running in background. This takes 2-4 minutes...`,
      });

      // Poll for results
      const maxAttempts = 60; // 60 * 5s = 5 minutes max
      let attempts = 0;
      
      setPollingStatus({ isPolling: true, attempt: 0, maxAttempts, startedAt: new Date() });
      
      while (attempts < maxAttempts && pollingRef.current) {
        attempts++;
        setPollingStatus(prev => ({ ...prev, attempt: attempts }));
        
        console.log(`[useIngredientAnalysis:${type}] Polling attempt ${attempts}/${maxAttempts}`);
        
        await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second intervals
        
        const { data: dbData, error: dbError } = await supabase
          .from('ingredient_analyses')
          .select('analysis, updated_at')
          .eq('category_id', categoryId)
          .eq('type', type)
          .maybeSingle();

        if (dbError) {
          console.error(`[useIngredientAnalysis:${type}] Polling error:`, dbError);
          continue;
        }

        if (dbData?.analysis) {
          const analysisData = dbData.analysis as any;
          
          // Check for error state
          if (analysisData.error === true) {
            console.error(`[useIngredientAnalysis:${type}] Analysis failed:`, analysisData.message);
            setPollingStatus(prev => ({ ...prev, isPolling: false }));
            pollingRef.current = false;
            throw new Error(analysisData.message || 'Analysis failed');
          }
          
          // Check for in-progress state
          if (analysisData.status === 'in_progress') {
            console.log(`[useIngredientAnalysis:${type}] Analysis still in progress...`);
            continue;
          }
          
          // Check for valid analysis
          if (isValidAnalysis(analysisData)) {
            console.log(`[useIngredientAnalysis:${type}] Valid analysis received!`);
            setPollingStatus(prev => ({ ...prev, isPolling: false }));
            pollingRef.current = false;
            setAnalysis(analysisData as unknown as IngredientAnalysis);
            
            toast({
              title: 'Analysis Complete',
              description: `Found ${analysisData.ingredients?.length || 0} ingredients analyzed for ${typeLabel}.`,
            });
            setIsLoading(false);
            return;
          }
        }
      }
      
      // Timeout
      setPollingStatus(prev => ({ ...prev, isPolling: false }));
      pollingRef.current = false;
      throw new Error('Analysis timed out. Please try again.');
      
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
      pollingRef.current = false;
    }
  }, [categoryId, type, toast]);

  const clearAnalysis = useCallback(async () => {
    setAnalysis(null);
    setError(null);
    pollingRef.current = false;
    setPollingStatus({ isPolling: false, attempt: 0, maxAttempts: 60, startedAt: null });
    
    if (categoryId) {
      try {
        await supabase
          .from('ingredient_analyses')
          .delete()
          .eq('category_id', categoryId)
          .eq('type', type);
      } catch (e) {
        console.error(`[useIngredientAnalysis:${type}] Error clearing analysis:`, e);
      }
    }
  }, [categoryId, type]);

  return {
    analysis,
    isLoading,
    isLoadingFromDb,
    error,
    pollingStatus,
    runAnalysis,
    clearAnalysis,
    hasAnalysis: !!analysis && isValidAnalysis(analysis),
    type,
  };
}
