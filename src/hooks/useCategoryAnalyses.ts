import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type CategoryAnalysis = Tables<"category_analyses">;

export function useCategoryAnalyses() {
  return useQuery({
    queryKey: ["category_analyses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("category_analyses")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data as CategoryAnalysis[];
    },
  });
}

export function useCategoryAnalysis(categoryId?: string) {
  return useQuery({
    queryKey: ["category_analysis", categoryId],
    queryFn: async () => {
      if (!categoryId) return null;
      
      const { data, error } = await supabase
        .from("category_analyses")
        .select("*")
        .eq("category_id", categoryId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      
      if (error && error.code !== "PGRST116") throw error;
      return data as CategoryAnalysis | null;
    },
    enabled: !!categoryId,
  });
}
