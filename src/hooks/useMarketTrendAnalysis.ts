import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface MarketTrendSections {
  marketOverview: {
    globalMarketSize: string;
    usMarketSize: string;
    growthDrivers: string[];
    amazonContext: string;
  };
  keyMarketTrends: {
    trends: Array<{
      trendName: string;
      description: string;
      statistics?: string;
    }>;
  };
  topProducts: {
    products: Array<{
      rank: number;
      brandProductName: string;
      priceUsd: number;
      averageRating: number;
      numberOfReviews: number;
      keyFeatures: string;
      notableTrendsFromReviews: string;
    }>;
    summaryInsights: string;
  };
  competitiveLandscape: {
    brandRankings: Array<{
      brandName: string;
      amazonRevenue: number;
      yoyChange: number;
      strengths: string;
    }>;
    marketShareInsights: string;
  };
  consumerInsights: {
    useCases: string[];
    praisesComplaints: string;
    preferredAttributes: string[];
    emergingBehaviors: string;
  };
  futureOutlook: {
    projectedCagr: string;
    timeframe: string;
    growthRegions: string[];
    innovations: string;
    opportunities: string;
    externalFactors: string;
  };
}

export interface MarketTrendAnalysis {
  id: string;
  category_id: string;
  category_name: string;
  product_type: string | null;
  status: 'pending' | 'processing' | 'completed' | 'error';
  error: string | null;
  analysis: {
    sections: MarketTrendSections;
    citations: Array<{ url: string; title: string }>;
    generatedAt: string;
  } | null;
  created_at: string;
  updated_at: string;
}

export function useMarketTrendAnalysis(categoryId?: string) {
  const [analysis, setAnalysis] = useState<MarketTrendAnalysis | null>(null);
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

  // Load from database on mount
  useEffect(() => {
    async function loadFromDb() {
      if (!categoryId) {
        setIsLoadingFromDb(false);
        return;
      }

      try {
        const { data, error: dbError } = await supabase
          .from('market_trend_analyses')
          .select('*')
          .eq('category_id', categoryId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (dbError) {
          console.error('[useMarketTrendAnalysis] DB load error:', dbError);
        } else if (data) {
          console.log('[useMarketTrendAnalysis] Loaded analysis from DB:', data.status);
          
          // Type the data properly
          const typedData = data as unknown as MarketTrendAnalysis;
          setAnalysis(typedData);
          
          // If still processing, start polling
          if (typedData.status === 'pending' || typedData.status === 'processing') {
            pollForResults(categoryId);
          }
        }
      } catch (e) {
        console.error('[useMarketTrendAnalysis] DB load error:', e);
      } finally {
        setIsLoadingFromDb(false);
      }
    }

    loadFromDb();
  }, [categoryId]);

  const pollForResults = useCallback(async (catId: string) => {
    if (pollingRef.current) return;
    
    pollingRef.current = true;
    const maxAttempts = 60;
    let attempts = 0;
    
    setPollingStatus({ isPolling: true, attempt: 0, maxAttempts, startedAt: new Date() });
    
    while (attempts < maxAttempts && pollingRef.current) {
      attempts++;
      setPollingStatus(prev => ({ ...prev, attempt: attempts }));
      
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const { data, error: dbError } = await supabase
        .from('market_trend_analyses')
        .select('*')
        .eq('category_id', catId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (dbError) {
        console.error('[useMarketTrendAnalysis] Polling error:', dbError);
        continue;
      }
      
      if (data) {
        const typedData = data as unknown as MarketTrendAnalysis;
        setAnalysis(typedData);
        
        if (typedData.status === 'completed') {
          console.log('[useMarketTrendAnalysis] Analysis completed!');
          setPollingStatus(prev => ({ ...prev, isPolling: false }));
          pollingRef.current = false;
          setIsLoading(false);
          toast({
            title: 'Market Trend Analysis Complete',
            description: 'Your market analysis is ready to view.',
          });
          return;
        }
        
        if (typedData.status === 'error') {
          console.error('[useMarketTrendAnalysis] Analysis failed:', typedData.error);
          setPollingStatus(prev => ({ ...prev, isPolling: false }));
          pollingRef.current = false;
          setIsLoading(false);
          setError(typedData.error || 'Analysis failed');
          toast({
            title: 'Analysis Failed',
            description: typedData.error || 'Unknown error occurred',
            variant: 'destructive',
          });
          return;
        }
      }
    }
    
    // Timeout
    setPollingStatus(prev => ({ ...prev, isPolling: false }));
    pollingRef.current = false;
    setIsLoading(false);
    setError('Analysis timed out. Please try again.');
    toast({
      title: 'Analysis Timeout',
      description: 'The analysis is taking too long. Please try again.',
      variant: 'destructive',
    });
  }, [toast]);

  const runAnalysis = useCallback(async (categoryName: string, productType?: string) => {
    if (!categoryId) {
      toast({
        title: 'Error',
        description: 'No category selected',
        variant: 'destructive',
      });
      return;
    }

    if (pollingRef.current) {
      console.log('[useMarketTrendAnalysis] Already polling, skipping');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log('[useMarketTrendAnalysis] Starting analysis...');
      
      const { data, error: fnError } = await supabase.functions.invoke('analyze-market-trends', {
        body: { categoryId, categoryName, productType }
      });

      if (fnError) {
        console.error('[useMarketTrendAnalysis] Edge function error:', fnError);
        throw new Error(fnError.message);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      toast({
        title: 'Analysis Started',
        description: 'Market trend analysis is running. This takes 2-4 minutes...',
      });

      // Start polling
      pollForResults(categoryId);

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to analyze market trends';
      setError(message);
      setIsLoading(false);
      toast({
        title: 'Analysis Failed',
        description: message,
        variant: 'destructive',
      });
    }
  }, [categoryId, pollForResults, toast]);

  const refreshAnalysis = useCallback(async (categoryName: string, productType?: string) => {
    // Delete existing analysis first
    if (categoryId) {
      await supabase
        .from('market_trend_analyses')
        .delete()
        .eq('category_id', categoryId);
      setAnalysis(null);
    }
    
    await runAnalysis(categoryName, productType);
  }, [categoryId, runAnalysis]);

  return {
    analysis,
    isLoading,
    isLoadingFromDb,
    error,
    pollingStatus,
    runAnalysis,
    refreshAnalysis,
    hasAnalysis: analysis?.status === 'completed' && !!analysis?.analysis,
    isProcessing: analysis?.status === 'pending' || analysis?.status === 'processing',
  };
}
