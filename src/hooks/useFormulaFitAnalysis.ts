import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export interface FormulaFitAnalysis {
  overall_score: number;
  score_label: string;
  executive_summary: string;
  strengths: Array<{
    aspect: string;
    explanation: string;
    market_evidence: string;
  }>;
  weaknesses: Array<{
    aspect: string;
    explanation: string;
    impact: "high" | "medium" | "low";
  }>;
  trend_alignment: Array<{
    trend_name: string;
    alignment_score: number;
    notes: string;
  }>;
  pain_point_coverage: Array<{
    pain_point: string;
    addressed: boolean;
    how_addressed: string;
  }>;
  competitive_position: {
    price_position: string;
    feature_position: string;
    summary: string;
  };
  recommendations: Array<{
    priority: number;
    action: string;
    effort: "Easy" | "Medium" | "Hard";
    expected_impact: string;
  }>;
  gaps: Array<{
    gap: string;
    market_opportunity: string;
  }>;
}

interface FormulaFitRecord {
  id: string;
  category_id: string;
  status: string;
  analysis: Json | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export function useFormulaFitAnalysis(categoryId?: string) {
  const queryClient = useQueryClient();
  const [pollingStatus, setPollingStatus] = useState({
    isPolling: false,
    attempt: 0,
    maxAttempts: 60, // 10 minutes with 10 second intervals
  });

  // Query for existing analysis
  const {
    data: analysisRecord,
    isLoading: isLoadingFromDb,
    error: dbError,
    refetch,
  } = useQuery({
    queryKey: ["formula_fit_analysis", categoryId],
    queryFn: async () => {
      if (!categoryId) return null;

      const { data, error } = await supabase
        .from("formula_fit_analyses")
        .select("*")
        .eq("category_id", categoryId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as FormulaFitRecord | null;
    },
    enabled: !!categoryId,
    refetchInterval: pollingStatus.isPolling ? 10000 : false,
  });

  // Mutation to trigger new analysis
  const triggerAnalysisMutation = useMutation({
    mutationFn: async () => {
      if (!categoryId) throw new Error("No category ID");

      const { data, error } = await supabase.functions.invoke("analyze-formula-fit", {
        body: { categoryId },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      setPollingStatus({ isPolling: true, attempt: 0, maxAttempts: 60 });
      refetch();
    },
  });

  // Handle polling logic
  useEffect(() => {
    if (!pollingStatus.isPolling) return;

    if (analysisRecord?.status === "completed" || analysisRecord?.status === "error") {
      setPollingStatus((prev) => ({ ...prev, isPolling: false }));
      return;
    }

    if (pollingStatus.attempt >= pollingStatus.maxAttempts) {
      setPollingStatus((prev) => ({ ...prev, isPolling: false }));
      return;
    }

    setPollingStatus((prev) => ({ ...prev, attempt: prev.attempt + 1 }));
  }, [analysisRecord, pollingStatus.isPolling, pollingStatus.attempt, pollingStatus.maxAttempts]);

  // Parse the analysis data
  const analysis: FormulaFitAnalysis | null = analysisRecord?.analysis
    ? (analysisRecord.analysis as unknown as FormulaFitAnalysis)
    : null;

  const isProcessing =
    analysisRecord?.status === "pending" || analysisRecord?.status === "processing";
  const hasAnalysis = analysisRecord?.status === "completed" && !!analysis;
  const error = analysisRecord?.status === "error" ? analysisRecord.error : null;

  return {
    analysis,
    analysisRecord,
    isLoadingFromDb,
    isProcessing,
    hasAnalysis,
    error: dbError?.message || error,
    pollingStatus,
    triggerAnalysis: triggerAnalysisMutation.mutate,
    isTriggering: triggerAnalysisMutation.isPending,
    refetch,
  };
}
