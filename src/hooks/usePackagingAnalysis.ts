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

// Structure for dual mockup URLs
export interface MockupImages {
  match_leaders: string | null;
  match_disruptors: string | null;
}

export function usePackagingAnalysis(categoryId?: string, formulaVersionId?: string | null) {
  const [analysis, setAnalysis] = useState<PackagingDesignAnalysis | null>(null);
  const [mockupImageUrl, setMockupImageUrl] = useState<string | null>(null);
  // Dual mockup URLs for Match Leaders and Match Disruptors
  const [mockupImages, setMockupImages] = useState<MockupImages>({
    match_leaders: null,
    match_disruptors: null,
  });
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingFromDb, setIsLoadingFromDb] = useState(true);
  const [wasRestoredFromDb, setWasRestoredFromDb] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pollingStatus, setPollingStatus] = useState<{
    isPolling: boolean;
    attempt: number;
    maxAttempts: number;
    startedAt: Date | null;
  }>({ isPolling: false, attempt: 0, maxAttempts: 60, startedAt: null });
  const { toast } = useToast();

  // Reset state when categoryId or formulaVersionId changes
  useEffect(() => {
    setAnalysis(null);
    setMockupImageUrl(null);
    setMockupImages({ match_leaders: null, match_disruptors: null });
    setUpdatedAt(null);
    setIsLoadingFromDb(true);
    setWasRestoredFromDb(false);
    setError(null);
  }, [categoryId, formulaVersionId]);

  // Load from database on mount/when categoryId changes
  useEffect(() => {
    async function loadFromDb() {
      if (!categoryId) {
        setIsLoadingFromDb(false);
        return;
      }

      try {
        let query = supabase
          .from('packaging_analyses')
          .select('analysis, mockup_image_url, updated_at')
          .eq('category_id', categoryId);
        
        // Filter by formula version - null means original analysis
        if (formulaVersionId) {
          query = query.eq('formula_version_id', formulaVersionId);
        } else {
          query = query.is('formula_version_id', null);
        }

        const { data, error: dbError } = await query.maybeSingle();

        if (dbError) {
          console.error('Error loading packaging analysis from DB:', dbError);
        } else if (data) {
          if (data.analysis) {
            setAnalysis(data.analysis as unknown as PackagingDesignAnalysis);
            setWasRestoredFromDb(true);
          }
          // Handle legacy single mockup URL
          if (data.mockup_image_url) {
            // Check if it's a JSON object (new format) or string (legacy format)
            if (typeof data.mockup_image_url === 'string') {
              try {
                const parsed = JSON.parse(data.mockup_image_url);
                if (parsed && typeof parsed === 'object') {
                  setMockupImages({
                    match_leaders: parsed.match_leaders || null,
                    match_disruptors: parsed.match_disruptors || null,
                  });
                  // Set legacy URL to leaders for backwards compatibility
                  setMockupImageUrl(parsed.match_leaders || null);
                } else {
                  // It was a string, not JSON
                  setMockupImageUrl(data.mockup_image_url);
                }
              } catch {
                // Not JSON, use as legacy URL
                setMockupImageUrl(data.mockup_image_url);
              }
            }
          }
          if (data.updated_at) {
            setUpdatedAt(new Date(data.updated_at));
          }
        }
      } catch (e) {
        console.error('Error loading packaging analysis from DB:', e);
      } finally {
        setIsLoadingFromDb(false);
      }
    }

    loadFromDb();
  }, [categoryId, formulaVersionId]);

  // Save mockup image to database - now supports strategy type
  const saveMockupImage = useCallback(async (imageUrl: string, strategyType?: 'match_leaders' | 'match_disruptors') => {
    if (!categoryId) return;

    try {
      // Update local state
      if (strategyType) {
        const newMockupImages = {
          ...mockupImages,
          [strategyType]: imageUrl,
        };
        setMockupImages(newMockupImages);
        
        // Also update legacy field for backwards compatibility
        if (strategyType === 'match_leaders') {
          setMockupImageUrl(imageUrl);
        }

        // Save as JSON string to the mockup_image_url column
        const { error: updateError } = await supabase
          .from('packaging_analyses')
          .update({ mockup_image_url: JSON.stringify(newMockupImages) })
          .eq('category_id', categoryId);

        if (updateError) {
          console.error('Error saving mockup to DB:', updateError);
        }
      } else {
        // Legacy behavior - save single URL
        setMockupImageUrl(imageUrl);
        const { error: updateError } = await supabase
          .from('packaging_analyses')
          .update({ mockup_image_url: imageUrl })
          .eq('category_id', categoryId);

        if (updateError) {
          console.error('Error saving mockup to DB:', updateError);
        }
      }
    } catch (e) {
      console.error('Error saving mockup to DB:', e);
    }
  }, [categoryId, mockupImages]);

  const runAnalysis = useCallback(async (copyStyle?: string) => {
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
      // Clear only the analysis column for this version, preserve image_analysis from Step 1
      console.log('Clearing Step 2 analysis before regeneration (preserving Step 1 image_analysis)...');
      let updateQuery = supabase
        .from('packaging_analyses')
        .update({ analysis: null, mockup_image_url: null })
        .eq('category_id', categoryId);
      
      if (formulaVersionId) {
        updateQuery = updateQuery.eq('formula_version_id', formulaVersionId);
      } else {
        updateQuery = updateQuery.is('formula_version_id', null);
      }
      
      await updateQuery;
      
      setAnalysis(null);
      setMockupImages({ match_leaders: null, match_disruptors: null });

      console.log('Calling analyze-packaging edge function with style:', copyStyle);
      const { data, error: fnError } = await supabase.functions.invoke('analyze-packaging', {
        body: { categoryId, copyStyle, formulaVersionId }
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
          title: copyStyle ? `Regenerating with "${copyStyle}" Style` : 'Packaging Analysis Started',
          description: 'AI design analysis is running in background. This may take 1-2 minutes...',
        });

        // Poll for results - check immediately, then poll every 5s for first 2 min, then 10s
        const maxAttempts = 60;
        let attempts = 0;
        const pollingStartedAt = new Date();
        
        setPollingStatus({ isPolling: true, attempt: 0, maxAttempts, startedAt: pollingStartedAt });
        
        const pollForResults = async (): Promise<PackagingDesignAnalysis | null> => {
          while (attempts < maxAttempts) {
            attempts++;
            setPollingStatus(prev => ({ ...prev, attempt: attempts }));
            console.log(`Polling for packaging results... attempt ${attempts}/${maxAttempts}`);
            
            // Check database FIRST, then wait
            let pollQuery = supabase
              .from('packaging_analyses')
              .select('analysis, updated_at')
              .eq('category_id', categoryId);
            
            if (formulaVersionId) {
              pollQuery = pollQuery.eq('formula_version_id', formulaVersionId);
            } else {
              pollQuery = pollQuery.is('formula_version_id', null);
            }

            const { data: dbData, error: dbError } = await pollQuery.maybeSingle();

            if (dbError) {
              console.error('Error polling for results:', dbError);
            } else if (dbData?.analysis) {
              // Accept if updated AFTER we started polling
              const updatedAt = new Date(dbData.updated_at);
              if (updatedAt >= pollingStartedAt) {
                setPollingStatus(prev => ({ ...prev, isPolling: false }));
                return dbData.analysis as unknown as PackagingDesignAnalysis;
              }
            }
            
            // Use faster polling (5s) for first 2 minutes, then slow to 10s
            const elapsedMs = Date.now() - pollingStartedAt.getTime();
            const pollInterval = elapsedMs < 120000 ? 5000 : 10000;
            await new Promise(resolve => setTimeout(resolve, pollInterval));
          }
          setPollingStatus(prev => ({ ...prev, isPolling: false }));
          return null;
        };

        const result = await pollForResults();
        
        if (result) {
          setAnalysis(result);
          setUpdatedAt(new Date());
          setWasRestoredFromDb(false);
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
  }, [categoryId, formulaVersionId, toast]);

  const clearAnalysis = useCallback(async () => {
    setAnalysis(null);
    setMockupImageUrl(null);
    setMockupImages({ match_leaders: null, match_disruptors: null });
    setUpdatedAt(null);
    setWasRestoredFromDb(false);
    setError(null);
    
    // Delete from database for this version
    if (categoryId) {
      try {
        let deleteQuery = supabase
          .from('packaging_analyses')
          .delete()
          .eq('category_id', categoryId);
        
        if (formulaVersionId) {
          deleteQuery = deleteQuery.eq('formula_version_id', formulaVersionId);
        } else {
          deleteQuery = deleteQuery.is('formula_version_id', null);
        }
        
        await deleteQuery;
      } catch (e) {
        console.error('Error clearing packaging analysis from DB:', e);
      }
    }
  }, [categoryId, formulaVersionId]);

  return {
    analysis,
    mockupImageUrl,
    mockupImages,
    updatedAt,
    saveMockupImage,
    isLoading,
    isLoadingFromDb,
    wasRestoredFromDb,
    error,
    pollingStatus,
    runAnalysis,
    clearAnalysis,
    hasAnalysis: !!analysis,
  };
}
