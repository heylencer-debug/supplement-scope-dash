import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TopProduct {
  asin: string | null;
  title: string | null;
  brand: string | null;
  category_name: string | null;
  rating: number | null;
  reviews: number | null;
  price: number | null;
  rank: number | null;
  amazon_choice: boolean | null;
  bestseller: boolean | null;
  is_young_competitor: boolean | null;
  reviews_per_month: number | null;
}

export function useTopProducts(categoryName?: string, limit: number = 5) {
  return useQuery({
    queryKey: ["top_products", categoryName, limit],
    queryFn: async () => {
      if (!categoryName) return [];
      
      const { data, error } = await supabase
        .from("v_top_products")
        .select("*")
        .ilike("category_name", `%${categoryName}%`)
        .order("reviews", { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      return data as TopProduct[];
    },
    enabled: !!categoryName,
  });
}
