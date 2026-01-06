import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface BulkAnalysisResult {
  success: boolean;
  message: string;
  products_queued: number;
}

export function useBulkSupplementAnalysis() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const { toast } = useToast();

  const startBulkAnalysis = async (categoryId: string): Promise<BulkAnalysisResult | null> => {
    setIsAnalyzing(true);
    
    try {
      const { data, error } = await supabase.functions.invoke("bulk-analyze-supplement-facts", {
        body: { categoryId }
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data.error) {
        throw new Error(data.error);
      }

      toast({
        title: "Bulk Analysis Started",
        description: `${data.products_queued} products queued for re-analysis. This may take a few minutes.`,
      });

      return data as BulkAnalysisResult;
    } catch (error) {
      console.error("Bulk analysis error:", error);
      toast({
        title: "Analysis Failed",
        description: error instanceof Error ? error.message : "Failed to start bulk analysis",
        variant: "destructive",
      });
      return null;
    } finally {
      setIsAnalyzing(false);
    }
  };

  return { startBulkAnalysis, isAnalyzing };
}
