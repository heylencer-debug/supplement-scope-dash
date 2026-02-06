import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface EnrichedProductData {
  title: string | null;
  brand: string | null;
  price: number | null;
  rating: number | null;
  reviews: number | null;
  monthly_sales: number | null;
  monthly_revenue: number | null;
  bsr_current: number | null;
  bsr_category: string | null;
  lqs: number | null;
  seller_name: string | null;
  seller_type: string | null;
  is_fba: boolean | null;
  date_first_available: string | null;
  main_image_url: string | null;
  image_urls: string[] | null;
  product_url: string | null;
  feature_bullets: string[] | null;
  dimensions: string | null;
  weight: string | null;
  price_30_days_avg: number | null;
  price_90_days_avg: number | null;
  bsr_30_days_avg: number | null;
  bsr_90_days_avg: number | null;
  estimated_revenue: number | null;
  estimated_monthly_sales: number | null;
  fees_estimate: number | null;
  variations_count: number | null;
  parent_asin: string | null;
  monthly_bsr_history: Record<string, number | null> | null;
  monthly_sales_history: Record<string, number | null> | null;
  fba_fees: number | null;
}

interface EnrichResponse {
  success: boolean;
  source: "jungle_scout" | "keepa" | "both" | "none";
  data: EnrichedProductData;
  error?: string;
}

export function useEnrichProduct() {
  return useMutation({
    mutationFn: async (asin: string): Promise<EnrichResponse> => {
      const { data, error } = await supabase.functions.invoke("enrich-product-asin", {
        body: { asin },
      });

      if (error) throw error;
      if (!data.success && data.source === "none") {
        throw new Error(data.error || "No data found for this ASIN");
      }
      return data as EnrichResponse;
    },
    onSuccess: (data) => {
      const sourceLabel = data.source === "both"
        ? "Jungle Scout + Keepa"
        : data.source === "jungle_scout"
        ? "Jungle Scout"
        : "Keepa";
      toast({
        title: "Product data found",
        description: `Enriched from ${sourceLabel}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "ASIN lookup failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
