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
  pageSize?: number;
}

export function useFlatLayoutHistory({ categoryId, strategyType, formulaVersionId, pageSize = 20 }: UseFlatLayoutHistoryOptions) {
  const [history, setHistory] = useState<FlatLayoutHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  
  // Use flat_ prefix to differentiate from 3D mockups
  const flatStrategyType = `flat_${strategyType}`;
  const totalPages = Math.ceil(totalCount / pageSize);

  const fetchHistory = useCallback(async () => {
    if (!categoryId) return;
    
    setIsLoading(true);
    try {
      // First get total count
      let countQuery = supabase
        .from('packaging_mockup_history')
        .select('*', { count: 'exact', head: true })
        .eq('category_id', categoryId)
        .eq('strategy_type', flatStrategyType);
      
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
        .eq('strategy_type', flatStrategyType)
        .order('created_at', { ascending: false })
        .range(from, to);
      
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
  }, [categoryId, flatStrategyType, formulaVersionId, currentPage, pageSize]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [categoryId, strategyType, formulaVersionId]);

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
      
      // Add to local state immediately if on first page
      if (currentPage === 1) {
        setHistory(prev => [data as FlatLayoutHistoryItem, ...prev.slice(0, pageSize - 1)]);
      }
      setTotalCount(prev => prev + 1);
      
      return data;
    } catch (error) {
      console.error('Error saving flat layout to history:', error);
      toast.error('Failed to save flat layout to history');
      return null;
    }
  }, [categoryId, formulaVersionId, flatStrategyType, currentPage, pageSize]);

  const deleteFlatLayoutFromHistory = useCallback(async (id: string) => {
    try {
      const { error } = await supabase
        .from('packaging_mockup_history')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      setHistory(prev => prev.filter(item => item.id !== id));
      setTotalCount(prev => prev - 1);
      toast.success('Flat layout deleted');
    } catch (error) {
      console.error('Error deleting flat layout:', error);
      toast.error('Failed to delete flat layout');
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
    saveFlatLayoutToHistory,
    deleteFlatLayoutFromHistory,
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
