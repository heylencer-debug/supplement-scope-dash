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

      // Fetch all matching categories, then pick the one with the most products
      const { data: matches, error } = await supabase
        .from("categories")
        .select("*")
        .or(`name.ilike.%${escaped}%,name.ilike.%=${escaped}%`)
        .order("created_at", { ascending: true }); // oldest first = the real scraped one

      if (error) throw error;
      if (!matches?.length) return null;
      if (matches.length === 1) return matches[0] as Category;

      // Multiple matches — pick the one with the most products
      const counts = await Promise.all(
        matches.map(async (cat) => {
          const { count } = await supabase
            .from("products")
            .select("*", { count: "exact", head: true })
            .eq("category_id", cat.id);
          return { cat, count: count ?? 0 };
        })
      );
      counts.sort((a, b) => b.count - a.count);
      return counts[0].cat as Category;
    },
    enabled: !!searchTerm,
    refetchInterval: (query) => (query.state.data ? false : 30000), // Auto-refetch every 30s if no data
  });
}
