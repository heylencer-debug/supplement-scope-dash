import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FormulaBriefVersion {
  id: string;
  category_id: string;
  version_number: number;
  formula_brief_content: string;
  parent_version_id: string | null;
  created_from_message_id: string | null;
  change_summary: string | null;
  is_active: boolean;
  created_at: string;
}

export function useFormulaBriefVersions(categoryId?: string) {
  const queryClient = useQueryClient();

  const versionsQuery = useQuery({
    queryKey: ["formula_brief_versions", categoryId],
    queryFn: async () => {
      if (!categoryId) return [];

      const { data, error } = await supabase
        .from("formula_brief_versions")
        .select("*")
        .eq("category_id", categoryId)
        .order("version_number", { ascending: false });

      if (error) throw error;
      return data as FormulaBriefVersion[];
    },
    enabled: !!categoryId,
  });

  const activeVersionQuery = useQuery({
    queryKey: ["formula_brief_active_version", categoryId],
    queryFn: async () => {
      if (!categoryId) return null;

      const { data, error } = await supabase
        .from("formula_brief_versions")
        .select("*")
        .eq("category_id", categoryId)
        .eq("is_active", true)
        .maybeSingle();

      if (error) throw error;
      return data as FormulaBriefVersion | null;
    },
    enabled: !!categoryId,
  });

  const createVersionMutation = useMutation({
    mutationFn: async ({
      categoryId,
      formulaBriefContent,
      changeSummary,
      parentVersionId,
      messageId
    }: {
      categoryId: string;
      formulaBriefContent: string;
      changeSummary: string;
      parentVersionId?: string;
      messageId?: string;
    }) => {
      // Get the next version number
      const { data: existingVersions } = await supabase
        .from("formula_brief_versions")
        .select("version_number")
        .eq("category_id", categoryId)
        .order("version_number", { ascending: false })
        .limit(1);

      const nextVersionNumber = existingVersions && existingVersions.length > 0 
        ? existingVersions[0].version_number + 1 
        : 1;

      // Deactivate any currently active version
      await supabase
        .from("formula_brief_versions")
        .update({ is_active: false })
        .eq("category_id", categoryId)
        .eq("is_active", true);

      // Create new version as active
      const { data, error } = await supabase
        .from("formula_brief_versions")
        .insert({
          category_id: categoryId,
          version_number: nextVersionNumber,
          formula_brief_content: formulaBriefContent,
          change_summary: changeSummary,
          parent_version_id: parentVersionId || null,
          created_from_message_id: messageId || null,
          is_active: true
        })
        .select()
        .single();

      if (error) throw error;
      return data as FormulaBriefVersion;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["formula_brief_versions", categoryId] });
      queryClient.invalidateQueries({ queryKey: ["formula_brief_active_version", categoryId] });
      queryClient.invalidateQueries({ queryKey: ["category_analysis"] });
      // Reset analysis caches for this category to force re-analysis with new formula version
      queryClient.invalidateQueries({ queryKey: ["ingredient_analysis", categoryId] });
      queryClient.invalidateQueries({ queryKey: ["packaging_analysis", categoryId] });
      queryClient.invalidateQueries({ queryKey: ["competitive_analysis", categoryId] });
    }
  });

  const setActiveVersionMutation = useMutation({
    mutationFn: async (versionId: string | null) => {
      if (!categoryId) throw new Error("Category ID is required");

      // Deactivate all versions for this category
      await supabase
        .from("formula_brief_versions")
        .update({ is_active: false })
        .eq("category_id", categoryId);

      // If versionId is null, we're switching to original (no active version)
      if (!versionId) {
        return null;
      }

      // Activate the selected version
      const { data, error } = await supabase
        .from("formula_brief_versions")
        .update({ is_active: true })
        .eq("id", versionId)
        .select()
        .single();

      if (error) throw error;
      return data as FormulaBriefVersion;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["formula_brief_versions", categoryId] });
      queryClient.invalidateQueries({ queryKey: ["formula_brief_active_version", categoryId] });
      queryClient.invalidateQueries({ queryKey: ["category_analysis"] });
    }
  });

  return {
    versions: versionsQuery.data || [],
    activeVersion: activeVersionQuery.data,
    isLoading: versionsQuery.isLoading,
    isLoadingActive: activeVersionQuery.isLoading,
    createVersion: createVersionMutation.mutateAsync,
    setActiveVersion: setActiveVersionMutation.mutateAsync,
    isCreatingVersion: createVersionMutation.isPending,
    isSettingActive: setActiveVersionMutation.isPending
  };
}
