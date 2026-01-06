import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FormulaPrompt {
  id: string;
  category_id: string;
  formula_version_id: string | null;
  prompt_type: "optimization" | "critical";
  title: string;
  short_label: string;
  prompt_content: string;
  icon: string | null;
  display_order: number;
  created_at: string;
}

export function useFormulaPrompts(categoryId?: string, versionId?: string | null) {
  const [isGenerating, setIsGenerating] = useState(false);
  const queryClient = useQueryClient();

  const { data: prompts, isLoading, refetch } = useQuery({
    queryKey: ["formula_prompts", categoryId, versionId],
    queryFn: async () => {
      if (!categoryId) return [];

      // Query prompts that match categoryId and either have no version or match the versionId
      let query = supabase
        .from("formula_prompts")
        .select("*")
        .eq("category_id", categoryId)
        .order("display_order");

      // If we have a version, get prompts for that version or null version
      if (versionId) {
        query = query.or(`formula_version_id.is.null,formula_version_id.eq.${versionId}`);
      } else {
        query = query.is("formula_version_id", null);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data || []) as FormulaPrompt[];
    },
    enabled: !!categoryId,
  });

  const generatePrompts = async (formulaBriefContent: string, categoryName?: string) => {
    if (!categoryId || isGenerating) return;

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-formula-prompts", {
        body: {
          categoryId,
          formulaBriefContent,
          categoryName,
          versionId: versionId || null,
        },
      });

      if (error) throw error;

      // Invalidate and refetch prompts
      await queryClient.invalidateQueries({ queryKey: ["formula_prompts", categoryId] });
      await refetch();

      return data;
    } catch (error) {
      console.error("Error generating formula prompts:", error);
      throw error;
    } finally {
      setIsGenerating(false);
    }
  };

  return {
    prompts: prompts || [],
    isLoading,
    isGenerating,
    generatePrompts,
    refetch,
  };
}
