import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Product = Tables<"products">;

// Without a categoryId this used to return the top-100 rated products across
// ALL categories — so while a category was still resolving, creatine/collagen
// rows leaked into another category's competitor cards. Cross-category
// fetching is now an explicit opt-in (ProductExplorer's "All categories"
// filter); every other caller waits for a real categoryId.
export function useProducts(categoryId?: string, opts?: { allowAll?: boolean }) {
  const allowAll = opts?.allowAll ?? false;
  return useQuery({
    queryKey: ["products", categoryId ?? (allowAll ? "__all__" : "__none__")],
    enabled: !!categoryId || allowAll,
    queryFn: async () => {
      let query = supabase
        .from("products")
        .select("*")
        .order("rating", { ascending: false })
        .limit(100);

      if (categoryId) {
        query = query.eq("category_id", categoryId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as Product[];
    },
  });
}
