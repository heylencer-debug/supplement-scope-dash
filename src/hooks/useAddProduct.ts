import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface ProductFormData {
  asin: string;
  title: string;
  brand: string;
  price: number | null;
  rating: number | null;
  reviews: number | null;
  serving_size: string;
  servings_per_container: number | null;
  other_ingredients: string;
  directions: string;
  warnings: string;
  claims_on_label: string[];
  category_id: string;
  ingredients: Array<{
    name: string;
    amount: string;
    unit: string;
    daily_value: string;
  }>;
  // Enrichment fields from Jungle Scout / Keepa
  monthly_sales?: number | null;
  monthly_revenue?: number | null;
  bsr_current?: number | null;
  bsr_category?: string | null;
  lqs?: number | null;
  seller_name?: string | null;
  seller_type?: string | null;
  is_fba?: boolean | null;
  date_first_available?: string | null;
  main_image_url?: string | null;
  image_urls?: string[] | null;
  product_url?: string | null;
  feature_bullets?: string[] | null;
  dimensions?: string | null;
  weight?: string | null;
  price_30_days_avg?: number | null;
  price_90_days_avg?: number | null;
  bsr_30_days_avg?: number | null;
  bsr_90_days_avg?: number | null;
  estimated_revenue?: number | null;
  estimated_monthly_sales?: number | null;
  fees_estimate?: number | null;
  variations_count?: number | null;
  parent_asin?: string | null;
}

export function useAddProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: ProductFormData) => {
      // Build supplement_facts_complete structure
      const supplementFactsComplete = {
        active_ingredients: data.ingredients.map(ing => ({
          name: ing.name,
          amount: ing.amount,
          unit: ing.unit,
          daily_value_percent: ing.daily_value || null,
        })),
        serving_size: data.serving_size,
        servings_per_container: data.servings_per_container,
        directions: data.directions,
        warnings: data.warnings,
        claims_on_label: data.claims_on_label,
      };

      // Build all_nutrients for compatibility
      const allNutrients = data.ingredients.map(ing => ({
        name: ing.name,
        amount: `${ing.amount}${ing.unit}`,
        daily_value: ing.daily_value || null,
      }));

      const { data: product, error } = await supabase
        .from("products")
        .insert({
          asin: data.asin,
          title: data.title,
          brand: data.brand,
          price: data.price,
          rating: data.rating,
          reviews: data.reviews,
          serving_size: data.serving_size,
          servings_per_container: data.servings_per_container,
          other_ingredients: data.other_ingredients,
          directions: data.directions,
          warnings: data.warnings,
          claims_on_label: data.claims_on_label,
          category_id: data.category_id,
          supplement_facts_complete: supplementFactsComplete,
          all_nutrients: allNutrients,
          nutrients_count: data.ingredients.length,
          ocr_extracted: false,
          ocr_confidence: "manual",
          is_available: true,
          // Enrichment fields
          monthly_sales: data.monthly_sales ?? null,
          monthly_revenue: data.monthly_revenue ?? null,
          bsr_current: data.bsr_current ?? null,
          bsr_category: data.bsr_category ?? null,
          lqs: data.lqs ?? null,
          seller_name: data.seller_name ?? null,
          seller_type: data.seller_type ?? null,
          is_fba: data.is_fba ?? null,
          date_first_available: data.date_first_available ?? null,
          main_image_url: data.main_image_url ?? null,
          image_urls: data.image_urls ?? null,
          product_url: data.product_url ?? null,
          feature_bullets: data.feature_bullets ?? null,
          dimensions: data.dimensions ?? null,
          weight: data.weight ?? null,
          price_30_days_avg: data.price_30_days_avg ?? null,
          price_90_days_avg: data.price_90_days_avg ?? null,
          bsr_30_days_avg: data.bsr_30_days_avg ?? null,
          bsr_90_days_avg: data.bsr_90_days_avg ?? null,
          estimated_revenue: data.estimated_revenue ?? null,
          estimated_monthly_sales: data.estimated_monthly_sales ?? null,
          fees_estimate: data.fees_estimate ?? null,
          variations_count: data.variations_count ?? null,
          parent_asin: data.parent_asin ?? null,
        })
        .select()
        .single();

      if (error) throw error;
      return product;
    },
    onSuccess: (product) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast({
        title: "Product added",
        description: `${product.title} has been added successfully.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error adding product",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
