import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface FlatLayoutHistoryItem {
  id: string;
  category_id: string;
  formula_version_id: string | null;
  strategy_type: string;
  image_url: string;
  packaging_format: string | null;
  design_settings: {
    colors?: { primary?: string; secondary?: string; accent?: string };
    layout_mode?: 'full' | 'front_only';
  };
  created_at: string;
}

interface UseFlatLayoutHistoryOptions {
  categoryId: string | undefined;
  strategyType: 'match_leaders' | 'match_disruptors';
  formulaVersionId?: string | null;
}

export function useFlatLayoutHistory({ categoryId, strategyType, formulaVersionId }: UseFlatLayoutHistoryOptions) {
  const [history, setHistory] = useState<FlatLayoutHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Use flat_ prefix to differentiate from 3D mockups
  const flatStrategyType = `flat_${strategyType}`;

  const fetchHistory = useCallback(async () => {
    if (!categoryId) return;
    
    setIsLoading(true);
    try {
      let query = supabase
        .from('packaging_mockup_history')
        .select('*')
        .eq('category_id', categoryId)
        .eq('strategy_type', flatStrategyType)
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (formulaVersionId) {
        query = query.eq('formula_version_id', formulaVersionId);
      }

      const { data, error } = await query;
      
      if (error) throw error;
      setHistory((data || []) as FlatLayoutHistoryItem[]);
    } catch (error) {
      console.error('Error fetching flat layout history:', error);
    } finally {
      setIsLoading(false);
    }
  }, [categoryId, flatStrategyType, formulaVersionId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const saveFlatLayoutToHistory = useCallback(async (
    imageUrl: string,
    packagingFormat?: string,
    designSettings?: FlatLayoutHistoryItem['design_settings']
  ) => {
    if (!categoryId) return null;

    try {
      const { data, error } = await supabase
        .from('packaging_mockup_history')
        .insert({
          category_id: categoryId,
          formula_version_id: formulaVersionId || null,
          strategy_type: flatStrategyType,
          image_url: imageUrl,
          packaging_format: packagingFormat || null,
          design_settings: designSettings || {}
        })
        .select()
        .single();

      if (error) throw error;
      
      // Add to local state immediately
      setHistory(prev => [data as FlatLayoutHistoryItem, ...prev]);
      
      return data;
    } catch (error) {
      console.error('Error saving flat layout to history:', error);
      toast.error('Failed to save flat layout to history');
      return null;
    }
  }, [categoryId, formulaVersionId, flatStrategyType]);

  const deleteFlatLayoutFromHistory = useCallback(async (id: string) => {
    try {
      const { error } = await supabase
        .from('packaging_mockup_history')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      setHistory(prev => prev.filter(item => item.id !== id));
      toast.success('Flat layout deleted');
    } catch (error) {
      console.error('Error deleting flat layout:', error);
      toast.error('Failed to delete flat layout');
    }
  }, []);

  return {
    history,
    isLoading,
    saveFlatLayoutToHistory,
    deleteFlatLayoutFromHistory,
    refetch: fetchHistory
  };
}
