import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Category = Tables<"categories">;

export function useCategoryByName(searchTerm?: string) {
  return useQuery({
    queryKey: ["category_by_name", searchTerm],
    queryFn: async () => {
      if (!searchTerm) return null;

      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .ilike("name", `%${searchTerm}%`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as Category | null;
    },
    enabled: !!searchTerm,
    refetchInterval: (query) => (query.state.data ? false : 30000), // Auto-refetch every 30s if no data
  });
}
