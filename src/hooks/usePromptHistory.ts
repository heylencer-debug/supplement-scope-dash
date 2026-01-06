import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PromptHistoryEntry {
  id: string;
  category_id: string;
  formula_version_id: string | null;
  prompt_id: string;
  prompt_title: string;
  prompt_content: string;
  response_summary: string | null;
  created_at: string;
}

export function usePromptHistory(categoryId?: string) {
  const queryClient = useQueryClient();

  const { data: history, isLoading } = useQuery({
    queryKey: ["prompt_history", categoryId],
    queryFn: async () => {
      if (!categoryId) return [];

      const { data, error } = await supabase
        .from("formula_prompt_history")
        .select("*")
        .eq("category_id", categoryId)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      return (data || []) as PromptHistoryEntry[];
    },
    enabled: !!categoryId,
  });

  const { mutateAsync: savePromptUsage, isPending: isSaving } = useMutation({
    mutationFn: async ({
      categoryId,
      versionId,
      promptId,
      promptTitle,
      promptContent,
      responseSummary,
    }: {
      categoryId: string;
      versionId?: string | null;
      promptId: string;
      promptTitle: string;
      promptContent: string;
      responseSummary?: string;
    }) => {
      const { data, error } = await supabase
        .from("formula_prompt_history")
        .insert({
          category_id: categoryId,
          formula_version_id: versionId || null,
          prompt_id: promptId,
          prompt_title: promptTitle,
          prompt_content: promptContent,
          response_summary: responseSummary || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prompt_history", categoryId] });
    },
  });

  const { mutateAsync: updateResponseSummary } = useMutation({
    mutationFn: async ({
      historyId,
      responseSummary,
    }: {
      historyId: string;
      responseSummary: string;
    }) => {
      const { error } = await supabase
        .from("formula_prompt_history")
        .update({ response_summary: responseSummary })
        .eq("id", historyId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prompt_history", categoryId] });
    },
  });

  return {
    history: history || [],
    isLoading,
    isSaving,
    savePromptUsage,
    updateResponseSummary,
  };
}
