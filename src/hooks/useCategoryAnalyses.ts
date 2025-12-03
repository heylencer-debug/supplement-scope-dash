import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type CategoryAnalysis = Tables<"category_analyses">;
export type Category = Tables<"categories">;

// Fetch recent categories (not analyses) - shows all created categories
export function useRecentCategories(limit: number = 20) {
  return useQuery({
    queryKey: ["recent_categories", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, search_term, total_products, created_at, last_scanned")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data as Category[];
    },
    refetchInterval: 10000,
    staleTime: 5000,
  });
}

// Keep for backwards compatibility - fetches analysis data
export function useCategoryAnalyses(limit: number = 20) {
  return useQuery({
    queryKey: ["category_analyses", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("category_analyses")
        .select("id, category_id, category_name, overall_score, opportunity_index, recommendation, products_analyzed, reviews_analyzed, executive_summary, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data as CategoryAnalysis[];
    },
    refetchInterval: 10000,
    staleTime: 5000,
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
