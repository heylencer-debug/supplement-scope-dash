/**
 * _shared/aiUsage.ts — edge-function counterpart of scout/utils/ai-usage.js.
 *
 * Same contract, same table (`ai_usage_log`), same fail-open guarantee: a
 * logging failure must NEVER break a chat/analysis response. See
 * scout/utils/ai-usage.js for the full design rationale (OpenRouter native
 * `usage: { include: true }` accounting preferred, PRICING map fallback,
 * raw token counts always stored).
 */

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

// $ per token — kept identical to scout/utils/ai-usage.js's PRICING map.
// Update both together when OpenRouter pricing changes.
const PRICING: Record<string, { prompt: number; completion: number; cacheRead?: number }> = {
  "anthropic/claude-sonnet-5": { prompt: 0.000002, completion: 0.00001, cacheRead: 0.0000002 },
  "anthropic/claude-opus-5": { prompt: 0.000005, completion: 0.000025, cacheRead: 0.0000005 },
  "google/gemini-flash-latest": { prompt: 0.00000075, completion: 0.00000375, cacheRead: 0.000000075 },
  "google/gemini-3.7-flash": { prompt: 0.00000075, completion: 0.00000375, cacheRead: 0.000000075 },
  "google/gemini-2.5-flash": { prompt: 0.0000003, completion: 0.0000025, cacheRead: 0.00000003 },
  "google/gemini-2.5-flash-lite": { prompt: 0.0000001, completion: 0.0000004, cacheRead: 0.00000001 },
};

function computeCostFromPricing(
  model: string,
  promptTokens: number,
  completionTokens: number,
  cachedTokens: number | null,
): number | null {
  const p = PRICING[model];
  if (!p) return null;
  const uncachedPrompt = Math.max(0, promptTokens - (cachedTokens || 0));
  const cachedCost = (cachedTokens || 0) * (p.cacheRead ?? p.prompt);
  return uncachedPrompt * p.prompt + cachedCost + completionTokens * p.completion;
}

/** Attach OpenRouter's native usage-accounting flag to a request body. */
// deno-lint-ignore no-explicit-any
export function withUsageTracking(body: Record<string, any>): Record<string, any> {
  return { ...body, usage: { include: true } };
}

export interface RecordAiUsageOpts {
  phase: string;
  model: string;
  // deno-lint-ignore no-explicit-any
  usage: any;
  categoryId?: string | null;
  keyword?: string | null;
  calls?: number;
}

/** Record one AI call's usage into ai_usage_log. FAIL-OPEN — never throws. */
export async function recordAiUsage(supabase: SupabaseClient, opts: RecordAiUsageOpts): Promise<void> {
  try {
    const { phase, model, usage } = opts;
    if (!usage) return;
    const promptTokens = usage.prompt_tokens ?? usage.input_tokens ?? 0;
    const completionTokens = usage.completion_tokens ?? usage.output_tokens ?? 0;
    const reasoningTokens = usage.completion_tokens_details?.reasoning_tokens ?? null;
    const cachedTokens = usage.prompt_tokens_details?.cached_tokens ?? null;
    const orCost = typeof usage.cost === "number" ? usage.cost : null;
    const costUsd = orCost != null ? orCost : computeCostFromPricing(model, promptTokens, completionTokens, cachedTokens);

    const row = {
      scout_job_id: null,
      category_id: opts.categoryId ?? null,
      keyword: opts.keyword ?? null,
      phase,
      model,
      calls: opts.calls ?? 1,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      reasoning_tokens: reasoningTokens,
      cached_tokens: cachedTokens,
      cost_usd: costUsd,
    };

    const { error } = await supabase.from("ai_usage_log").insert(row);
    if (error) {
      console.warn(`[ai-usage] insert failed (non-fatal, phase=${phase}, model=${model}): ${error.message}`);
    }
  } catch (e) {
    console.warn(`[ai-usage] recorder threw (non-fatal): ${(e as Error).message}`);
  }
}
