import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface CompetitiveAnalysis {
  summary: {
    overall_position: "Leader" | "Challenger" | "Follower" | "Niche";
    market_readiness_score: number;
    key_message: string;
    top_advantages: string[];
    critical_gaps: string[];
  };
  competitor_comparisons: Array<{
    competitor_brand: string;
    competitor_product: string;
    displacement_potential: number;
    where_we_win: Array<{
      area: string;
      our_advantage: string;
      impact: "high" | "medium" | "low";
    }>;
    where_they_win: Array<{
      area: string;
      their_advantage: string;
      how_to_match: string;
      difficulty: "easy" | "moderate" | "hard";
    }>;
    overall_verdict: string;
  }>;
  priority_improvements: Array<{
    rank: number;
    improvement: string;
    target_competitor: string;
    expected_impact: string;
    implementation_difficulty: "easy" | "moderate" | "hard";
  }>;
  strategic_recommendations: {
    positioning_strategy: string;
    messaging_focus: string[];
    differentiation_levers: string[];
    avoid_competing_on: string[];
  };
}

interface UseCompetitiveAnalysisResult {
  analysis: CompetitiveAnalysis | null;
  isLoading: boolean;
  isPolling: boolean;
  error: string | null;
  pollingAttempt: number;
  runAnalysis: () => Promise<void>;
  clearAnalysis: () => Promise<void>;
}

const MAX_POLLING_ATTEMPTS = 30; // 5 minutes with 10s intervals
const POLLING_INTERVAL = 10000; // 10 seconds

export function useCompetitiveAnalysis(categoryId: string | undefined): UseCompetitiveAnalysisResult {
  const [analysis, setAnalysis] = useState<CompetitiveAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pollingAttempt, setPollingAttempt] = useState(0);
  const { toast } = useToast();

  // Load existing analysis on mount
  const loadExistingAnalysis = useCallback(async () => {
    if (!categoryId) return;

    try {
      const { data, error: fetchError } = await supabase
        .from("competitive_analyses")
        .select("analysis")
        .eq("category_id", categoryId)
        .maybeSingle();

      if (fetchError) {
        console.error("Error loading competitive analysis:", fetchError);
        return;
      }

      if (data?.analysis) {
        setAnalysis(data.analysis as unknown as CompetitiveAnalysis);
      }
    } catch (err) {
      console.error("Error loading competitive analysis:", err);
    }
  }, [categoryId]);

  useEffect(() => {
    loadExistingAnalysis();
  }, [loadExistingAnalysis]);

  // Poll for results
  const pollForResults = useCallback(async () => {
    if (!categoryId) return false;

    const { data, error: fetchError } = await supabase
      .from("competitive_analyses")
      .select("analysis, updated_at")
      .eq("category_id", categoryId)
      .maybeSingle();

    if (fetchError) {
      console.error("Polling error:", fetchError);
      return false;
    }

    if (data?.analysis) {
      setAnalysis(data.analysis as unknown as CompetitiveAnalysis);
      return true;
    }

    return false;
  }, [categoryId]);

  // Run analysis
  const runAnalysis = useCallback(async () => {
    if (!categoryId) {
      toast({
        title: "Error",
        description: "No category selected",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setError(null);
    setPollingAttempt(0);

    try {
      // Call edge function
      const response = await fetch(
        `https://jwkitkfufigldpldqtbq.supabase.co/functions/v1/analyze-competitors`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3a2l0a2Z1ZmlnbGRwbGRxdGJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEwNDU2NDUsImV4cCI6MjA3NjYyMTY0NX0.VziSAuTdqcteRERIPCdrMy4vqQuHjeC3tvazE0E8nMM`,
          },
          body: JSON.stringify({ categoryId }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to start analysis");
      }

      setIsLoading(false);
      setIsPolling(true);

      // Start polling
      let attempts = 0;
      const pollInterval = setInterval(async () => {
        attempts++;
        setPollingAttempt(attempts);

        const found = await pollForResults();
        if (found) {
          clearInterval(pollInterval);
          setIsPolling(false);
          toast({
            title: "Analysis Complete",
            description: "Competitive analysis is ready",
          });
        } else if (attempts >= MAX_POLLING_ATTEMPTS) {
          clearInterval(pollInterval);
          setIsPolling(false);
          setError("Analysis timed out. Please try again.");
          toast({
            title: "Timeout",
            description: "Analysis took too long. Please try again.",
            variant: "destructive",
          });
        }
      }, POLLING_INTERVAL);
    } catch (err) {
      setIsLoading(false);
      setError(err instanceof Error ? err.message : "Unknown error");
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to run analysis",
        variant: "destructive",
      });
    }
  }, [categoryId, pollForResults, toast]);

  // Clear analysis
  const clearAnalysis = useCallback(async () => {
    if (!categoryId) return;

    try {
      await supabase
        .from("competitive_analyses")
        .delete()
        .eq("category_id", categoryId);

      setAnalysis(null);
      toast({
        title: "Cleared",
        description: "Competitive analysis cleared",
      });
    } catch (err) {
      console.error("Error clearing analysis:", err);
    }
  }, [categoryId, toast]);

  return {
    analysis,
    isLoading,
    isPolling,
    error,
    pollingAttempt,
    runAnalysis,
    clearAnalysis,
  };
}
