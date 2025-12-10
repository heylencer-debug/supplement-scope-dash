import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface PackagingDesignAnalysis {
  summary: {
    design_strategy: string;
    key_differentiators: string[];
    target_shelf_positioning: string;
  };
  visual_design: {
    primary_color: { hex: string; name: string; psychology: string };
    secondary_color: { hex: string; name: string; psychology: string };
    accent_color: { hex: string; name: string; psychology: string };
    color_rationale: string;
    typography: {
      headline_font: string;
      body_font: string;
      font_rationale: string;
    };
    imagery_style: string;
    overall_aesthetic: string;
  };
  front_panel: {
    layout_structure: string;
    visual_hierarchy: string[];
    primary_claim: string;
    secondary_claims: string[];
    brand_positioning_statement: string;
    required_elements: string[];
  };
  trust_signals: {
    recommended_certifications: Array<{
      badge: string;
      importance: 'critical' | 'high' | 'medium';
      rationale: string;
    }>;
    trust_building_elements: string[];
  };
  copy_content: {
    headline: string;
    subheadline: string;
    bullet_points: string[];
    call_to_action: string;
    back_panel_copy: string;
  };
  conversion_triggers: Array<{
    trigger: string;
    placement: string;
    psychological_principle: string;
  }>;
  competitive_positioning: {
    vs_leader: { competitor: string; our_advantage: string };
    market_gap_filled: string;
    differentiation_elements: string[];
  };
  competitor_comparison: Array<{
    competitor: string;
    their_approach: string;
    our_counter_strategy: string;
    advantage_score: 'strong' | 'moderate' | 'weak';
  }>;
  implementation_priorities: Array<{
    priority: 1 | 2 | 3;
    element: string;
    impact: string;
    complexity: 'easy' | 'moderate' | 'complex';
  }>;
  mock_content: {
    front_panel_text: string;
    back_panel_text: string;
    side_panel_suggestions: string[];
  };
}

export function usePackagingAnalysis(categoryId?: string) {
  const [analysis, setAnalysis] = useState<PackagingDesignAnalysis | null>(null);
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

  // Reset state when categoryId changes
  useEffect(() => {
    setAnalysis(null);
    setIsLoadingFromDb(true);
    setError(null);
  }, [categoryId]);

  // Load from database on mount/when categoryId changes
  useEffect(() => {
    async function loadFromDb() {
      if (!categoryId) {
        setIsLoadingFromDb(false);
        return;
      }

      try {
        const { data, error: dbError } = await supabase
          .from('packaging_analyses')
          .select('analysis')
          .eq('category_id', categoryId)
          .maybeSingle();

        if (dbError) {
          console.error('Error loading packaging analysis from DB:', dbError);
        } else if (data?.analysis) {
          setAnalysis(data.analysis as unknown as PackagingDesignAnalysis);
        }
      } catch (e) {
        console.error('Error loading packaging analysis from DB:', e);
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
      // First, delete any existing stale analysis to force a fresh one
      console.log('Clearing existing packaging analysis before refresh...');
      await supabase
        .from('packaging_analyses')
        .delete()
        .eq('category_id', categoryId);
      
      setAnalysis(null);

      console.log('Calling analyze-packaging edge function...');
      const { data, error: fnError } = await supabase.functions.invoke('analyze-packaging', {
        body: { categoryId }
      });

      if (fnError) {
        console.error('Edge function error:', fnError);
        throw new Error(fnError.message);
      }

      if (data?.error) {
        console.error('Analysis error:', data.error, data.details);
        throw new Error(data.error + (data.details ? `: ${data.details}` : ''));
      }

      // Function returns immediately with status: 'processing'
      // Poll database for results
      if (data?.status === 'processing') {
        toast({
          title: 'Packaging Analysis Started',
          description: 'AI design analysis is running in background. This may take 1-2 minutes...',
        });

        // Poll for results every 10 seconds, up to 10 minutes
        const maxAttempts = 60;
        let attempts = 0;
        
        setPollingStatus({ isPolling: true, attempt: 0, maxAttempts, startedAt: new Date() });
        
        const pollForResults = async (): Promise<PackagingDesignAnalysis | null> => {
          while (attempts < maxAttempts) {
            attempts++;
            setPollingStatus(prev => ({ ...prev, attempt: attempts }));
            console.log(`Polling for packaging results... attempt ${attempts}/${maxAttempts}`);
            
            await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
            
            const { data: dbData, error: dbError } = await supabase
              .from('packaging_analyses')
              .select('analysis, updated_at')
              .eq('category_id', categoryId)
              .maybeSingle();

            if (dbError) {
              console.error('Error polling for results:', dbError);
              continue;
            }

            if (dbData?.analysis) {
              // Check if this is a fresh analysis (updated within last 5 minutes)
              const updatedAt = new Date(dbData.updated_at);
              const now = new Date();
              const diffMinutes = (now.getTime() - updatedAt.getTime()) / (1000 * 60);
              
              if (diffMinutes < 5) {
                setPollingStatus(prev => ({ ...prev, isPolling: false }));
                return dbData.analysis as unknown as PackagingDesignAnalysis;
              }
            }
          }
          setPollingStatus(prev => ({ ...prev, isPolling: false }));
          return null;
        };

        const result = await pollForResults();
        
        if (result) {
          setAnalysis(result);
          toast({
            title: 'Packaging Analysis Complete',
            description: 'AI has generated your winning packaging design strategy.',
          });
        } else {
          throw new Error('Analysis timed out. Please try again.');
        }
      } else if (data?.analysis) {
        // Legacy path - direct response
        setAnalysis(data.analysis);
        toast({
          title: 'Packaging Analysis Complete',
          description: 'AI has generated your winning packaging design strategy.',
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to analyze packaging';
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
          .from('packaging_analyses')
          .delete()
          .eq('category_id', categoryId);
      } catch (e) {
        console.error('Error clearing packaging analysis from DB:', e);
      }
    }
  }, [categoryId]);

  return {
    analysis,
    isLoading,
    isLoadingFromDb,
    error,
    pollingStatus,
    runAnalysis,
    clearAnalysis,
    hasAnalysis: !!analysis,
  };
}
