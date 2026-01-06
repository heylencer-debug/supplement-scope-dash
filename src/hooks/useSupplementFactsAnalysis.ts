import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface AnalysisResult {
  success: boolean;
  nutrients_count: number;
  confidence: string;
  extraction_notes: string;
}

export function useSupplementFactsAnalysis() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const { toast } = useToast();

  const analyzeProduct = async (productId: string): Promise<AnalysisResult | null> => {
    setIsAnalyzing(true);
    
    try {
      const { data, error } = await supabase.functions.invoke("analyze-supplement-facts", {
        body: { productId }
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data.error) {
        throw new Error(data.error);
      }

      toast({
        title: "Analysis Complete",
        description: `Extracted ${data.nutrients_count} nutrients with ${data.confidence} confidence.`,
      });

      return data as AnalysisResult;
    } catch (error) {
      console.error("Supplement facts analysis error:", error);
      toast({
        title: "Analysis Failed",
        description: error instanceof Error ? error.message : "Failed to analyze supplement facts",
        variant: "destructive",
      });
      return null;
    } finally {
      setIsAnalyzing(false);
    }
  };

  return { analyzeProduct, isAnalyzing };
}
