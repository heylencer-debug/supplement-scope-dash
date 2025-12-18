import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type CategoryAnalysis = Tables<"category_analyses">;
export type Category = Tables<"categories">;

export interface CategoryWithImages extends Category {
  product_images?: string[];
}

// Fetch recent categories (not analyses) - shows all created categories with product images
export function useRecentCategories(limit: number = 20) {
  return useQuery({
    queryKey: ["recent_categories", limit],
    queryFn: async () => {
      // Fetch categories
      const { data: categories, error } = await supabase
        .from("categories")
        .select("id, name, search_term, total_products, created_at, last_scanned")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      
      // Fetch top 4 product images and count for each category
      const categoriesWithImages = await Promise.all(
        (categories || []).map(async (cat) => {
          // Get total product count
          const { count } = await supabase
            .from("products")
            .select("*", { count: "exact", head: true })
            .eq("category_id", cat.id);
          
          // Get product images (limit 4)
          const { data: products } = await supabase
            .from("products")
            .select("main_image_url")
            .eq("category_id", cat.id)
            .not("main_image_url", "is", null)
            .limit(4);
          
          return {
            ...cat,
            total_products: count || 0,
            product_images: products?.map(p => p.main_image_url).filter(Boolean) || []
          } as CategoryWithImages;
        })
      );

      return categoriesWithImages;
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
