import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type CategoryScore = Tables<"category_scores">;

export function useCategoryScores(categoryId?: string) {
  return useQuery({
    queryKey: ["category_scores", categoryId],
    queryFn: async () => {
      if (!categoryId) return null;
      
      const { data, error } = await supabase
        .from("category_scores")
        .select("*")
        .eq("category_id", categoryId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      return data as CategoryScore | null;
    },
    enabled: !!categoryId,
  });
}
