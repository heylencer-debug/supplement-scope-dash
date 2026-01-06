import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (categoryId: string) => {
      const { data, error } = await supabase.functions.invoke("delete-category", {
        body: { categoryId },
      });

      if (error) {
        throw new Error(error.message || "Failed to delete category");
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      return data;
    },
    onSuccess: () => {
      // Invalidate queries to refresh the list
      queryClient.invalidateQueries({ queryKey: ["recent_categories"] });
      queryClient.invalidateQueries({ queryKey: ["category_analyses"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      
      toast({
        title: "Category deleted",
        description: "The category and all related data have been removed.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
