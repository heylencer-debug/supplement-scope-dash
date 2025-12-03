import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CategorySales {
  category_name: string | null;
  total_products: number | null;
  total_monthly_sales: number | null;
  avg_monthly_sales: number | null;
  max_monthly_sales: number | null;
  total_monthly_revenue: number | null;
  avg_monthly_revenue: number | null;
  max_monthly_revenue: number | null;
  avg_price: number | null;
  sales_75th_percentile: number | null;
  sales_90th_percentile: number | null;
  products_above_2x_avg: number | null;
}

export function useCategorySales(categoryName?: string) {
  return useQuery({
    queryKey: ["category_sales", categoryName],
    queryFn: async () => {
      if (!categoryName) return null;
      
      const { data, error } = await supabase
        .from("v_category_sales")
        .select("*")
        .ilike("category_name", `%${categoryName}%`)
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      return data as CategorySales | null;
    },
    enabled: !!categoryName,
  });
}
