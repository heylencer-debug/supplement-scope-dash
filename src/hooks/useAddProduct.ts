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
