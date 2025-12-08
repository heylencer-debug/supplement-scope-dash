import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AnalysisPhase {
  name: string;
  completed: number;
  total: number;
  percentage: number;
  weight: number;
}

export interface AnalysisProgress {
  overallPercentage: number;
  phases: AnalysisPhase[];
  isComplete: boolean;
  estimatedMinutesRemaining: number;
}

interface ProductStats {
  total: number;
  withImages: number;
  withOcr: number;
  withMarketing: number;
  withReviews: number;
}

export function useAnalysisProgress(
  categoryId: string | undefined,
  hasCategory: boolean,
  hasAnalysis: boolean,
  hasScores: boolean,
  hasFormulaBrief: boolean
) {
  const { data: productStats, isLoading } = useQuery({
    queryKey: ["analysis_progress", categoryId],
    queryFn: async (): Promise<ProductStats> => {
      if (!categoryId) {
        return { total: 0, withImages: 0, withOcr: 0, withMarketing: 0, withReviews: 0 };
      }

      // Get total products and completion counts
      const { data: products, error } = await supabase
        .from("products")
        .select("id, main_image_url, ocr_extracted, marketing_analysis, review_analysis")
        .eq("category_id", categoryId);

      if (error) throw error;

      const total = products?.length || 0;
      const withImages = products?.filter(p => p.main_image_url).length || 0;
      const withOcr = products?.filter(p => p.ocr_extracted === true).length || 0;
      const withMarketing = products?.filter(p => p.marketing_analysis !== null).length || 0;
      const withReviews = products?.filter(p => p.review_analysis !== null).length || 0;

      return { total, withImages, withOcr, withMarketing, withReviews };
    },
    enabled: !!categoryId,
    refetchInterval: 5000, // Poll every 5 seconds during active analysis
    staleTime: 3000,
  });

  // Calculate phases with weights
  // Products scraped phase: consider complete once we have products (even if < 100)
  // We determine "complete" by checking if subsequent phases have started (OCR, marketing, reviews)
  const scrapedProducts = productStats?.total || 0;
  const productsWithImages = productStats?.withImages || 0;
  const hasOcrStarted = (productStats?.withOcr || 0) > 0;
  const hasMarketingStarted = (productStats?.withMarketing || 0) > 0;
  const hasReviewsStarted = (productStats?.withReviews || 0) > 0;
  
  // If downstream analysis has started, products scraping is complete
  const isScrapingComplete = scrapedProducts > 0 && (hasOcrStarted || hasMarketingStarted || hasReviewsStarted || hasAnalysis);
  const scrapingTotal = isScrapingComplete ? scrapedProducts : Math.max(scrapedProducts, 100);
  const scrapingPercentage = isScrapingComplete ? 100 : (scrapedProducts > 0 ? Math.min(95, Math.round((scrapedProducts / 100) * 100)) : 0);

  const phases: AnalysisPhase[] = [
    {
      name: "Category Created",
      completed: hasCategory ? 1 : 0,
      total: 1,
      percentage: hasCategory ? 100 : 0,
      weight: 5,
    },
    {
      name: "Products Scraped",
      completed: scrapedProducts,
      total: scrapingTotal,
      percentage: scrapingPercentage,
      weight: 25,
    },
    {
      name: "Visual Analysis",
      completed: productStats?.withOcr || 0,
      total: productsWithImages || scrapedProducts || 1,
      percentage: productsWithImages > 0 
        ? Math.round(((productStats?.withOcr || 0) / productsWithImages) * 100)
        : 0,
      weight: 20,
    },
    {
      name: "Marketing Analysis",
      completed: productStats?.withMarketing || 0,
      total: scrapedProducts || 1,
      percentage: scrapedProducts > 0 
        ? Math.round(((productStats?.withMarketing || 0) / scrapedProducts) * 100)
        : 0,
      weight: 20,
    },
    {
      name: "Review Analysis",
      completed: productStats?.withReviews || 0,
      total: scrapedProducts || 1,
      percentage: scrapedProducts > 0 
        ? Math.round(((productStats?.withReviews || 0) / scrapedProducts) * 100)
        : 0,
      weight: 20,
    },
    {
      name: "Final Synthesis",
      completed: hasAnalysis ? 1 : 0,
      total: 1,
      percentage: hasAnalysis ? 100 : 0,
      weight: 10,
    },
  ];

  // Calculate overall weighted percentage
  const overallPercentage = Math.round(
    phases.reduce((sum, phase) => sum + (phase.percentage * phase.weight), 0) / 100
  );

  // Estimate remaining time (roughly 30 seconds per incomplete product analysis step)
  const incompleteSteps = phases.reduce((sum, phase) => {
    if (phase.percentage < 100) {
      const remaining = phase.total - phase.completed;
      return sum + remaining;
    }
    return sum;
  }, 0);
  
  const estimatedMinutesRemaining = Math.max(1, Math.round(incompleteSteps * 0.5 / 60));

  const isComplete = overallPercentage >= 100;

  return {
    progress: {
      overallPercentage,
      phases,
      isComplete,
      estimatedMinutesRemaining,
    },
    isLoading,
  };
}
