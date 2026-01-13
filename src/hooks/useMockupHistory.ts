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
  pageSize?: number;
}

export function useMockupHistory({ categoryId, strategyType, formulaVersionId, pageSize = 20 }: UseMockupHistoryOptions) {
  const [history, setHistory] = useState<MockupHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const totalPages = Math.ceil(totalCount / pageSize);

  const fetchHistory = useCallback(async () => {
    if (!categoryId) return;
    
    setIsLoading(true);
    try {
      // First get total count
      let countQuery = supabase
        .from('packaging_mockup_history')
        .select('*', { count: 'exact', head: true })
        .eq('category_id', categoryId);
      
      if (strategyType) {
        countQuery = countQuery.eq('strategy_type', strategyType);
      }
      
      if (formulaVersionId) {
        countQuery = countQuery.eq('formula_version_id', formulaVersionId);
      }

      const { count } = await countQuery;
      setTotalCount(count || 0);

      // Then fetch paginated data
      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from('packaging_mockup_history')
        .select('*')
        .eq('category_id', categoryId)
        .order('created_at', { ascending: false })
        .range(from, to);
      
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
  }, [categoryId, strategyType, formulaVersionId, currentPage, pageSize]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [categoryId, strategyType, formulaVersionId]);

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
      
      // Add to local state immediately if on first page
      if (currentPage === 1) {
        setHistory(prev => [data as MockupHistoryItem, ...prev.slice(0, pageSize - 1)]);
      }
      setTotalCount(prev => prev + 1);
      
      return data;
    } catch (error) {
      console.error('Error saving mockup to history:', error);
      toast.error('Failed to save mockup to history');
      return null;
    }
  }, [categoryId, formulaVersionId, currentPage, pageSize]);

  const deleteMockupFromHistory = useCallback(async (id: string) => {
    try {
      const { error } = await supabase
        .from('packaging_mockup_history')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      setHistory(prev => prev.filter(item => item.id !== id));
      setTotalCount(prev => prev - 1);
      toast.success('Mockup deleted');
    } catch (error) {
      console.error('Error deleting mockup:', error);
      toast.error('Failed to delete mockup');
    }
  }, []);

  const goToPage = useCallback((page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  }, [totalPages]);

  const nextPage = useCallback(() => {
    if (currentPage < totalPages) {
      setCurrentPage(prev => prev + 1);
    }
  }, [currentPage, totalPages]);

  const prevPage = useCallback(() => {
    if (currentPage > 1) {
      setCurrentPage(prev => prev - 1);
    }
  }, [currentPage]);

  return {
    history,
    isLoading,
    saveMockupToHistory,
    deleteMockupFromHistory,
    refetch: fetchHistory,
    // Pagination
    currentPage,
    totalPages,
    totalCount,
    goToPage,
    nextPage,
    prevPage,
    hasNextPage: currentPage < totalPages,
    hasPrevPage: currentPage > 1
  };
}
