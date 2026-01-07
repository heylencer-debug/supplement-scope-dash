import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface MockupHistoryItem {
  id: string;
  category_id: string;
  formula_version_id: string | null;
  strategy_type: 'match_leaders' | 'match_disruptors';
  image_url: string;
  packaging_format: string | null;
  design_settings: {
    colors?: { primary?: string; accent?: string; background?: string };
    fonts?: { headline?: string; body?: string };
    text?: { headline?: string; subheadline?: string; claims?: string[] };
  };
  created_at: string;
}

interface UseMockupHistoryOptions {
  categoryId: string | undefined;
  strategyType?: 'match_leaders' | 'match_disruptors';
  formulaVersionId?: string | null;
}

export function useMockupHistory({ categoryId, strategyType, formulaVersionId }: UseMockupHistoryOptions) {
  const [history, setHistory] = useState<MockupHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchHistory = useCallback(async () => {
    if (!categoryId) return;
    
    setIsLoading(true);
    try {
      let query = supabase
        .from('packaging_mockup_history')
        .select('*')
        .eq('category_id', categoryId)
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (strategyType) {
        query = query.eq('strategy_type', strategyType);
      }
      
      if (formulaVersionId) {
        query = query.eq('formula_version_id', formulaVersionId);
      }

      const { data, error } = await query;
      
      if (error) throw error;
      setHistory((data || []) as MockupHistoryItem[]);
    } catch (error) {
      console.error('Error fetching mockup history:', error);
    } finally {
      setIsLoading(false);
    }
  }, [categoryId, strategyType, formulaVersionId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const saveMockupToHistory = useCallback(async (
    imageUrl: string,
    strategy: 'match_leaders' | 'match_disruptors',
    packagingFormat?: string,
    designSettings?: MockupHistoryItem['design_settings']
  ) => {
    if (!categoryId) return null;

    try {
      const { data, error } = await supabase
        .from('packaging_mockup_history')
        .insert({
          category_id: categoryId,
          formula_version_id: formulaVersionId || null,
          strategy_type: strategy,
          image_url: imageUrl,
          packaging_format: packagingFormat || null,
          design_settings: designSettings || {}
        })
        .select()
        .single();

      if (error) throw error;
      
      // Add to local state immediately
      setHistory(prev => [data as MockupHistoryItem, ...prev]);
      
      return data;
    } catch (error) {
      console.error('Error saving mockup to history:', error);
      toast.error('Failed to save mockup to history');
      return null;
    }
  }, [categoryId, formulaVersionId]);

  const deleteMockupFromHistory = useCallback(async (id: string) => {
    try {
      const { error } = await supabase
        .from('packaging_mockup_history')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      setHistory(prev => prev.filter(item => item.id !== id));
      toast.success('Mockup deleted');
    } catch (error) {
      console.error('Error deleting mockup:', error);
      toast.error('Failed to delete mockup');
    }
  }, []);

  return {
    history,
    isLoading,
    saveMockupToHistory,
    deleteMockupFromHistory,
    refetch: fetchHistory
  };
}
