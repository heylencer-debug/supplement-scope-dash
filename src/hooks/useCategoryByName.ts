import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Category = Tables<"categories">;

export function useCategoryByName(searchTerm?: string) {
  return useQuery({
    queryKey: ["category_by_name", searchTerm],
    queryFn: async () => {
      if (!searchTerm) return null;

      // Be tolerant of bad inputs and historic data where category names were saved with a leading '='
      const cleaned = searchTerm.replace(/^=+/, "").trim();
      const escaped = cleaned.replace(/,/g, "\\,"); // supabase .or() uses comma separators

      // oldest first = the real scraped category (not empty duplicates created later)
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .or(`name.ilike.%${escaped}%,name.ilike.%=${escaped}%`)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as Category | null;
    },
    enabled: !!searchTerm,
    refetchInterval: (query) => (query.state.data ? false : 30000), // Auto-refetch every 30s if no data
  });
}
