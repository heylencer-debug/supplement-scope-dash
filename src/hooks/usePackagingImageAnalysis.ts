import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface MessagingTone {
  primary_tone: string;
  tone_descriptors: string[];
  urgency_level: "low" | "medium" | "high";
  emotional_appeal: string;
}

export interface ProductContents {
  type: string;
  shape: string | null;
  colors: string[];
  color_pattern: string | null;
  texture_appearance: string | null;
  size_estimate: string | null;
}

export interface CompetitorPackagingAnalysis {
  brand: string;
  title: string;
  asin: string;
  image_url: string;
  label_content: {
    main_title: string;
    subtitle: string | null;
    elements: string[];
    badges: string[];
    claims: string[];
    // Enhanced extraction fields
    x_in_1_claim?: string | null;
    benefit_claims?: string[];
    serving_info?: string | null;
    flavor_text?: string | null;
    all_visible_text?: string[];
    certifications?: string[];
    supporting_claims?: string[];
  };
  messaging_tone: MessagingTone;
  product_contents: ProductContents;
  packaging: {
    type: string;
    material: string;
    color: string;
    features: string[];
  };
}

export interface PackagingImageAnalysis {
  competitor_analyses: CompetitorPackagingAnalysis[];
}

export function usePackagingImageAnalysis(categoryId?: string) {
  const [analysis, setAnalysis] = useState<PackagingImageAnalysis | null>(null);
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
  }>({ isPolling: false, attempt: 0, maxAttempts: 30, startedAt: null });
  const { toast } = useToast();

  // Reset state when categoryId changes
  useEffect(() => {
    setAnalysis(null);
    setUpdatedAt(null);
    setIsLoadingFromDb(true);
    setWasRestoredFromDb(false);
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
          .select('image_analysis, updated_at')
          .eq('category_id', categoryId)
          .maybeSingle();

        if (dbError) {
          console.error('Error loading packaging image analysis from DB:', dbError);
        } else if (data?.image_analysis) {
          setAnalysis(data.image_analysis as unknown as PackagingImageAnalysis);
          setUpdatedAt(new Date(data.updated_at));
          setWasRestoredFromDb(true);
        }
      } catch (e) {
        console.error('Error loading packaging image analysis from DB:', e);
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
      console.log('Calling analyze-packaging-images edge function');
      const { data, error: fnError } = await supabase.functions.invoke('analyze-packaging-images', {
        body: { categoryId }
      });

      if (fnError) {
        console.error('Edge function error:', fnError);
        throw new Error(fnError.message);
      }

      if (data?.error) {
        console.error('Analysis error:', data.error);
        throw new Error(data.error);
      }

      // Function returns immediately with status: 'processing'
      if (data?.status === 'processing') {
        toast({
          title: 'Image Analysis Started',
          description: 'AI is analyzing competitor packaging images. This may take 1-2 minutes...',
        });

        // Poll for results - check immediately, then poll every 5s for first 2 min, then 10s
        const maxAttempts = 30;
        let attempts = 0;
        const pollingStartedAt = new Date();
        
        setPollingStatus({ isPolling: true, attempt: 0, maxAttempts, startedAt: pollingStartedAt });
        
        const pollForResults = async (): Promise<PackagingImageAnalysis | null> => {
          while (attempts < maxAttempts) {
            attempts++;
            setPollingStatus(prev => ({ ...prev, attempt: attempts }));
            console.log(`Polling for image analysis results... attempt ${attempts}/${maxAttempts}`);
            
            // Check database FIRST, then wait
            const { data: dbData, error: dbError } = await supabase
              .from('packaging_analyses')
              .select('image_analysis, updated_at')
              .eq('category_id', categoryId)
              .maybeSingle();

            if (dbError) {
              console.error('Error polling for results:', dbError);
            } else if (dbData?.image_analysis) {
              // Accept if updated AFTER we started polling
              const updatedAt = new Date(dbData.updated_at);
              if (updatedAt >= pollingStartedAt) {
                setPollingStatus(prev => ({ ...prev, isPolling: false }));
                return dbData.image_analysis as unknown as PackagingImageAnalysis;
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
            title: 'Image Analysis Complete',
            description: `Analyzed packaging for ${result.competitor_analyses?.length || 0} competitor products.`,
          });
        } else {
          throw new Error('Analysis timed out. Please try again.');
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to analyze packaging images';
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
    setUpdatedAt(null);
    setWasRestoredFromDb(false);
    setError(null);
    
    if (categoryId) {
      try {
        // Update to null instead of deleting the whole record
        await supabase
          .from('packaging_analyses')
          .update({ image_analysis: null })
          .eq('category_id', categoryId);
      } catch (e) {
        console.error('Error clearing packaging image analysis from DB:', e);
      }
    }
  }, [categoryId]);

  return {
    analysis,
    updatedAt,
    isLoading,
    isLoadingFromDb,
    wasRestoredFromDb,
    error,
    pollingStatus,
    runAnalysis,
    clearAnalysis,
    hasAnalysis: !!analysis && (analysis.competitor_analyses?.length || 0) > 0,
  };
}
