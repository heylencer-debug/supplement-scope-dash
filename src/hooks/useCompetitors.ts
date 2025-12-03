import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Competitor = Tables<"competitors">;

export function useCompetitors(productIds?: string[]) {
  return useQuery({
    queryKey: ["competitors", productIds],
    queryFn: async () => {
      let query = supabase
        .from("competitors")
        .select("*")
        .order("reviews_per_day", { ascending: false });
      
      if (productIds && productIds.length > 0) {
        query = query.in("product_id", productIds);
      }
      
      const { data, error } = await query.limit(50);
      
      if (error) throw error;
      return data as Competitor[];
    },
  });
}

export function useCompetitorsByCategory(categoryId?: string) {
  return useQuery({
    queryKey: ["competitors_by_category", categoryId],
    queryFn: async () => {
      if (!categoryId) return [];
      
      // First get product IDs for this category
      const { data: products, error: productsError } = await supabase
        .from("products")
        .select("id")
        .eq("category_id", categoryId);
      
      if (productsError) throw productsError;
      if (!products || products.length === 0) return [];
      
      const productIds = products.map(p => p.id);
      
      // Then get competitors for those products
      const { data, error } = await supabase
        .from("competitors")
        .select("*")
        .in("product_id", productIds)
        .order("reviews_per_day", { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data as Competitor[];
    },
    enabled: !!categoryId,
  });
}
