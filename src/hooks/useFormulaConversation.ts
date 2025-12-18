import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface FormulaConversation {
  id: string;
  category_id: string;
  messages: Message[];
  created_at: string;
  updated_at: string;
}

export function useFormulaConversation(categoryId?: string, versionId?: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["formula_conversation", categoryId, versionId],
    queryFn: async () => {
      if (!categoryId) return null;

      // Build query based on whether we have a versionId
      let queryBuilder = supabase
        .from("formula_conversations")
        .select("*");
      
      if (versionId) {
        // Query by specific version
        queryBuilder = queryBuilder.eq("formula_version_id", versionId);
      } else {
        // Query by category for original (no version)
        queryBuilder = queryBuilder
          .eq("category_id", categoryId)
          .is("formula_version_id", null);
      }
      
      const { data, error } = await queryBuilder
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      
      // Parse messages from jsonb
      if (data) {
        return {
          ...data,
          messages: (data.messages as unknown as Message[]) || []
        } as FormulaConversation;
      }
      return null;
    },
    enabled: !!categoryId,
  });

  const addMessageMutation = useMutation({
    mutationFn: async ({ 
      categoryId, 
      message,
      versionId 
    }: { 
      categoryId: string; 
      message: Message;
      versionId?: string;
    }) => {
      // Build query to check if conversation exists
      let queryBuilder = supabase
        .from("formula_conversations")
        .select("id, messages");
      
      if (versionId) {
        queryBuilder = queryBuilder.eq("formula_version_id", versionId);
      } else {
        queryBuilder = queryBuilder
          .eq("category_id", categoryId)
          .is("formula_version_id", null);
      }
      
      const { data: existing } = await queryBuilder.maybeSingle();

      if (existing) {
        // Update existing conversation
        const currentMessages = (existing.messages as unknown as Message[]) || [];
        const newMessages = [...currentMessages, message] as unknown as Json;
        
        const { data, error } = await supabase
          .from("formula_conversations")
          .update({ messages: newMessages })
          .eq("id", existing.id)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        // Create new conversation
        const messagesJson = [message] as unknown as Json;
        
        const insertData: {
          category_id: string;
          messages: Json;
          formula_version_id?: string;
        } = {
          category_id: categoryId,
          messages: messagesJson
        };
        
        if (versionId) {
          insertData.formula_version_id = versionId;
        }
        
        const { data, error } = await supabase
          .from("formula_conversations")
          .insert(insertData)
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["formula_conversation", categoryId, versionId] });
    }
  });

  const updateMessagesMutation = useMutation({
    mutationFn: async ({ 
      conversationId, 
      messages 
    }: { 
      conversationId: string; 
      messages: Message[];
    }) => {
      const { data, error } = await supabase
        .from("formula_conversations")
        .update({ messages: messages as unknown as Json })
        .eq("id", conversationId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["formula_conversation", categoryId, versionId] });
    }
  });

  const clearConversationMutation = useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await supabase
        .from("formula_conversations")
        .delete()
        .eq("id", conversationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["formula_conversation", categoryId, versionId] });
    }
  });

  return {
    conversation: query.data,
    isLoading: query.isLoading,
    addMessage: addMessageMutation.mutateAsync,
    updateMessages: updateMessagesMutation.mutateAsync,
    clearConversation: clearConversationMutation.mutateAsync,
    isAddingMessage: addMessageMutation.isPending
  };
}
