import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BreakoutCompetitor {
  asin: string | null;
  title: string | null;
  brand: string | null;
  category_name: string | null;
  price: number | null;
  rating: number | null;
  reviews: number | null;
  current_reviews: number | null;
  initial_reviews: number | null;
  reviews_gained: number | null;
  reviews_per_day: number | null;
  review_growth_rate: number | null;
  days_tracked: number | null;
  age_months: number | null;
}

export function useBreakoutCompetitors(categoryName?: string, limit: number = 5) {
  return useQuery({
    queryKey: ["breakout_competitors", categoryName, limit],
    queryFn: async () => {
      if (!categoryName) return [];
      
      const { data, error } = await supabase
        .from("v_breakout_competitors")
        .select("*")
        .ilike("category_name", `%${categoryName}%`)
        .order("reviews_per_day", { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      return data as BreakoutCompetitor[];
    },
    enabled: !!categoryName,
  });
}
