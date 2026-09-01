/**
 * useAiUsageCost — reads the AI cost ledger (scout/migrations/007_ai_usage_cost_ledger.sql,
 * `ai_usage_log`) for one category. Powers the Data Audit tab's cost card +
 * phase breakdown table.
 *
 * `ai_usage_log` rows are written for EVERY OpenRouter call across the
 * pipeline (P0-P13) and the Formulator Agent chat (phase='chat') — both are
 * tagged with the same `category_id`, so a single category-scoped query
 * naturally covers "this category's total AI cost" including chat, without
 * needing to distinguish individual scout_jobs runs.
 *
 * Tolerates the migration not being applied yet (or any transient query
 * failure) by returning an empty/zero result instead of throwing — the UI
 * renders a friendly "not tracked yet" empty state in that case.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const aiUsageLogTable = () => (supabase.from as unknown as (table: string) => any)("ai_usage_log");

export interface AiUsageRow {
  phase: string;
  model: string;
  calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd: number | null;
}

export interface AiUsageCostResult {
  /** true once we've confirmed the ledger table exists and is queryable. */
  ledgerAvailable: boolean;
  totalCostUsd: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalCalls: number;
  /** grouped by phase + model, sorted by cost descending. */
  breakdown: AiUsageRow[];
}

const EMPTY_RESULT: AiUsageCostResult = {
  ledgerAvailable: false,
  totalCostUsd: 0,
  totalPromptTokens: 0,
  totalCompletionTokens: 0,
  totalCalls: 0,
  breakdown: [],
};

export function useAiUsageCost(categoryId: string | null | undefined) {
  return useQuery({
    queryKey: ["ai_usage_cost", categoryId],
    queryFn: async (): Promise<AiUsageCostResult> => {
      if (!categoryId) return EMPTY_RESULT;

      const rows: Array<{ phase: string; model: string; calls: number; prompt_tokens: number; completion_tokens: number; cost_usd: number | null }> = [];
      let from = 0;
      for (;;) {
        const { data, error } = await aiUsageLogTable()
          .select("phase, model, calls, prompt_tokens, completion_tokens, cost_usd")
          .eq("category_id", categoryId)
          .range(from, from + 999);
        if (error) {
          // Table not migrated yet, or any other transient error — graceful empty state.
          return EMPTY_RESULT;
        }
        rows.push(...(data || []));
        if (!data || data.length < 1000) break;
        from += 1000;
      }

      const groups = new Map<string, AiUsageRow>();
      for (const r of rows) {
        const key = `${r.phase}::${r.model}`;
        const existing = groups.get(key) ?? { phase: r.phase, model: r.model, calls: 0, prompt_tokens: 0, completion_tokens: 0, cost_usd: 0 };
        existing.calls += r.calls || 1;
        existing.prompt_tokens += r.prompt_tokens || 0;
        existing.completion_tokens += r.completion_tokens || 0;
        existing.cost_usd = (existing.cost_usd || 0) + (r.cost_usd || 0);
        groups.set(key, existing);
      }

      const breakdown = Array.from(groups.values()).sort((a, b) => (b.cost_usd || 0) - (a.cost_usd || 0));

      return {
        ledgerAvailable: true,
        totalCostUsd: rows.reduce((sum, r) => sum + (r.cost_usd || 0), 0),
        totalPromptTokens: rows.reduce((sum, r) => sum + (r.prompt_tokens || 0), 0),
        totalCompletionTokens: rows.reduce((sum, r) => sum + (r.completion_tokens || 0), 0),
        totalCalls: rows.reduce((sum, r) => sum + (r.calls || 1), 0),
        breakdown,
      };
    },
    enabled: !!categoryId,
    staleTime: 10_000,
  });
}
