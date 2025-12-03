import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useCategoryDashboard() {
  return useQuery({
    queryKey: ["category_dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_category_dashboard")
        .select("*")
        .order("opportunity_index", { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });
}
