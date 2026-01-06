import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface BulkAnalysisResult {
  success: boolean;
  message: string;
  products_queued: number;
}

export interface BulkAnalysisProgress {
  status: "idle" | "running" | "complete" | "error";
  total: number;
  completed: number;
  success: number;
  failed: number;
  currentProduct: string | null;
  error?: string;
}

export function useBulkSupplementAnalysis(categoryId?: string) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState<BulkAnalysisProgress>({
    status: "idle",
    total: 0,
    completed: 0,
    success: 0,
    failed: 0,
    currentProduct: null
  });
  const { toast } = useToast();

  // Subscribe to progress updates
  useEffect(() => {
    if (!categoryId) return;

    const channel = supabase.channel(`bulk-analysis-${categoryId}`)
      .on("broadcast", { event: "progress" }, (payload) => {
        const data = payload.payload as BulkAnalysisProgress & { categoryId: string };
        
        setProgress({
          status: data.status,
          total: data.total ?? 0,
          completed: data.completed ?? 0,
          success: data.success ?? 0,
          failed: data.failed ?? 0,
          currentProduct: data.currentProduct ?? null,
          error: data.error
        });

        if (data.status === "complete") {
          setIsAnalyzing(false);
          toast({
            title: "Bulk Analysis Complete",
            description: `Successfully analyzed ${data.success} products. ${data.failed} failed.`,
          });
          // Reset progress after showing completion
          setTimeout(() => {
            setProgress(prev => prev.status === "complete" ? { ...prev, status: "idle" } : prev);
          }, 5000);
        } else if (data.status === "error") {
          setIsAnalyzing(false);
          toast({
            title: "Analysis Error",
            description: data.error || "An error occurred during bulk analysis",
            variant: "destructive",
          });
        } else if (data.status === "running") {
          setIsAnalyzing(true);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [categoryId, toast]);

  const startBulkAnalysis = useCallback(async (targetCategoryId: string): Promise<BulkAnalysisResult | null> => {
    setIsAnalyzing(true);
    setProgress({
      status: "running",
      total: 0,
      completed: 0,
      success: 0,
      failed: 0,
      currentProduct: null
    });
    
    try {
      const { data, error } = await supabase.functions.invoke("bulk-analyze-supplement-facts", {
        body: { categoryId: targetCategoryId }
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data.error) {
        throw new Error(data.error);
      }

      setProgress(prev => ({
        ...prev,
        total: data.products_queued,
        status: "running"
      }));

      toast({
        title: "Bulk Analysis Started",
        description: `${data.products_queued} products queued for re-analysis.`,
      });

      return data as BulkAnalysisResult;
    } catch (error) {
      console.error("Bulk analysis error:", error);
      setIsAnalyzing(false);
      setProgress(prev => ({ ...prev, status: "error", error: error instanceof Error ? error.message : "Unknown error" }));
      toast({
        title: "Analysis Failed",
        description: error instanceof Error ? error.message : "Failed to start bulk analysis",
        variant: "destructive",
      });
      return null;
    }
  }, [toast]);

  const resetProgress = useCallback(() => {
    setProgress({
      status: "idle",
      total: 0,
      completed: 0,
      success: 0,
      failed: 0,
      currentProduct: null
    });
    setIsAnalyzing(false);
  }, []);

  return { startBulkAnalysis, isAnalyzing, progress, resetProgress };
}
