import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type FormulaBrief = Tables<"formula_briefs">;

export function useFormulaBrief(categoryId?: string) {
  return useQuery({
    queryKey: ["formula_brief", categoryId],
    queryFn: async () => {
      if (!categoryId) return null;
      
      const { data, error } = await supabase
        .from("formula_briefs")
        .select("*")
        .eq("category_id", categoryId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      return data as FormulaBrief | null;
    },
    enabled: !!categoryId,
  });
}
