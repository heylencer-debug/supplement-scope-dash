import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type CategoryAnalysis = Tables<"category_analyses">;

export function useCategoryAnalyses() {
  const queryClient = useQueryClient();

  // Subscribe to real-time changes for instant updates
  useEffect(() => {
    const channel = supabase
      .channel('category-analyses-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'category_analyses'
        },
        () => {
          // Invalidate and refetch when any change occurs
          queryClient.invalidateQueries({ queryKey: ['category_analyses'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

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
    refetchInterval: 30000, // Fallback polling every 30 seconds
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
