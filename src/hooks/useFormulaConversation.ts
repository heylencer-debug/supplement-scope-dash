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

export function useFormulaConversation(categoryId?: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["formula_conversation", categoryId],
    queryFn: async () => {
      if (!categoryId) return null;

      const { data, error } = await supabase
        .from("formula_conversations")
        .select("*")
        .eq("category_id", categoryId)
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
      message 
    }: { 
      categoryId: string; 
      message: Message;
    }) => {
      // Check if conversation exists
      const { data: existing } = await supabase
        .from("formula_conversations")
        .select("id, messages")
        .eq("category_id", categoryId)
        .maybeSingle();

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
        
        const { data, error } = await supabase
          .from("formula_conversations")
          .insert({
            category_id: categoryId,
            messages: messagesJson
          })
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["formula_conversation", categoryId] });
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
      queryClient.invalidateQueries({ queryKey: ["formula_conversation", categoryId] });
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
      queryClient.invalidateQueries({ queryKey: ["formula_conversation", categoryId] });
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
