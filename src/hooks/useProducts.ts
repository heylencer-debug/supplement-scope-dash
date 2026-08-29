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
      // `rating`/`reviews` are legacy columns the pipeline mostly no longer
      // writes to (near-always null) — `rating_value`/`rating_count` are the
      // live ones. Ordering by the dead `rating` column meant this query was
      // effectively unordered (NULLS LAST puts ~7/8 of any category first in
      // insertion order). `.limit(100)` also silently dropped ~35-40% of any
      // category >100 products (Electrolyte Powder = 161, Hydration = 165) —
      // every category currently tracked is comfortably under 500.
      let query = supabase
        .from("products")
        .select("*")
        .order("rating_value", { ascending: false, nullsFirst: false })
        .limit(500);

      if (categoryId) {
        query = query.eq("category_id", categoryId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as Product[];
    },
  });
}
