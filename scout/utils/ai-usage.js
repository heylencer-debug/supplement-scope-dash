/**
 * utils/ai-usage.js — shared AI cost-ledger recorder.
 *
 * Every OpenRouter chat-completions response includes a `usage` object
 * (prompt_tokens, completion_tokens, and when present
 * completion_tokens_details.reasoning_tokens / prompt_tokens_details.cached_tokens)
 * that the pipeline used to discard entirely. This module:
 *   1. Attaches OpenRouter's native usage-accounting flag (`usage: { include: true }`)
 *      to request bodies so the response carries OpenRouter's OWN computed
 *      `usage.cost` (in USD) — no extra HTTP round-trip to
 *      GET /api/v1/generation. Works for both streaming and non-streaming
 *      calls per OpenRouter's Usage Accounting docs.
 *   2. Extracts usage from either a parsed JSON response or a raw SSE text
 *      body (the last chunk that carries a `usage` field wins).
 *   3. Computes cost_usd — prefers OpenRouter's own `usage.cost` when
 *      present; falls back to the local PRICING map (kept easy to update)
 *      when it isn't. Raw token counts are ALWAYS stored regardless, so
 *      cost can be recomputed later if pricing changes.
 *   4. Inserts one row per call into `ai_usage_log` (see
 *      scout/migrations/007_ai_usage_cost_ledger.sql). FAIL-OPEN: any
 *      recorder failure (missing table, network error, bad row) is
 *      console.warn'd and NEVER thrown — a logging failure must never break
 *      a phase.
 *
 * Usage at a call site:
 *   const { withUsageTracking, recordAiUsage } = require('./utils/ai-usage');
 *   const body = withUsageTracking({ model, max_tokens, messages });
 *   const res = await fetch(url, { ..., body: JSON.stringify(body) });
 *   const j = await res.json();
 *   recordAiUsage({ phase: 'P9', model, usage: j.usage, categoryId, keyword: KEYWORD });
 *   // for streaming (SSE) responses, parse chunks yourself, then:
 *   recordAiUsage({ phase: 'P8', model, usage: extractUsageFromSSE(rawSseText), categoryId, keyword: KEYWORD });
 */

const { createClient } = require('@supabase/supabase-js');

let _client = null;
function getClient() {
  if (_client) return _client;
  const url = process.env.DASH_URL || process.env.SUPABASE_URL;
  const key = process.env.DASH_KEY || process.env.SUPABASE_KEY;
  if (!url || !key) return null;
  _client = createClient(url, key);
  return _client;
}

// ─── Pricing map ────────────────────────────────────────────────────────────
// $ per token (NOT per million — matches OpenRouter's own /api/v1/models
// pricing shape so these can be pasted straight from there). Update this map
// whenever OpenRouter/model pricing changes — cost_usd is recomputed from
// stored raw token counts if you ever need to backfill after a price change.
// Pulled live from GET https://openrouter.ai/api/v1/models on 2026-09-01.
const PRICING = {
  'anthropic/claude-sonnet-5':   { prompt: 0.000002,   completion: 0.00001,    cacheRead: 0.0000002 },
  'anthropic/claude-opus-5':     { prompt: 0.000005,   completion: 0.000025,   cacheRead: 0.0000005 },
  'google/gemini-flash-latest':  { prompt: 0.00000075, completion: 0.00000375, cacheRead: 0.000000075 },
  'google/gemini-3.7-flash':     { prompt: 0.00000075, completion: 0.00000375, cacheRead: 0.000000075 },
  'google/gemini-2.5-flash':     { prompt: 0.0000003,  completion: 0.0000025,  cacheRead: 0.00000003 },
  'google/gemini-2.5-flash-lite':{ prompt: 0.0000001,  completion: 0.0000004,  cacheRead: 0.00000001 },
};

function computeCostFromPricing(model, promptTokens, completionTokens, cachedTokens) {
  const p = PRICING[model];
  if (!p) return null; // unknown model — cost stays null, tokens are still stored
  const uncachedPrompt = Math.max(0, (promptTokens || 0) - (cachedTokens || 0));
  const cachedCost = (cachedTokens || 0) * (p.cacheRead ?? p.prompt);
  const promptCost = uncachedPrompt * p.prompt;
  const completionCost = (completionTokens || 0) * p.completion;
  return promptCost + cachedCost + completionCost;
}

/**
 * Attach OpenRouter's native usage-accounting flag to a request body.
 * Safe to call on both streaming and non-streaming bodies — OpenRouter
 * returns the populated `usage` (incl. `cost`) on the final response/chunk
 * either way. Never mutates the input.
 */
function withUsageTracking(body) {
  return { ...body, usage: { include: true } };
}

/**
 * Pull the LAST `usage` object out of a raw OpenRouter SSE stream body
 * (string). OpenRouter emits `usage` on the final content chunk (or a
 * trailing chunk with empty choices) right before `data: [DONE]` when
 * `usage: { include: true }` is set on the request.
 */
function extractUsageFromSSE(rawText) {
  if (!rawText) return null;
  let usage = null;
  for (const line of rawText.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    const data = line.slice(6).trim();
    if (data === '[DONE]') continue;
    try {
      const j = JSON.parse(data);
      if (j.usage) usage = j.usage;
    } catch {
      // ignore malformed/partial SSE lines
    }
  }
  return usage;
}

/**
 * Record one AI call's usage into ai_usage_log. FAIL-OPEN — never throws.
 *
 * @param {object} opts
 * @param {string} opts.phase        - e.g. 'P8', 'P9', 'chat'
 * @param {string} opts.model        - model id actually used for this call
 * @param {object} opts.usage        - raw usage object from the OpenRouter response (may be null/undefined)
 * @param {string|null} [opts.scoutJobId]  - defaults to process.env.SCOUT_JOB_ID
 * @param {string|null} [opts.categoryId]
 * @param {string|null} [opts.keyword]
 * @param {number}      [opts.calls] - number of underlying model calls this row represents (default 1)
 */
async function recordAiUsage(opts = {}) {
  try {
    const { phase, model, usage } = opts;
    if (!usage) return null; // nothing to record (e.g. call failed before a response)
    const scoutJobId = opts.scoutJobId ?? process.env.SCOUT_JOB_ID ?? null;
    const categoryId = opts.categoryId ?? null;
    const keyword = opts.keyword ?? null;
    const calls = opts.calls ?? 1;

    const promptTokens = usage.prompt_tokens ?? usage.input_tokens ?? 0;
    const completionTokens = usage.completion_tokens ?? usage.output_tokens ?? 0;
    const reasoningTokens = usage.completion_tokens_details?.reasoning_tokens ?? null;
    const cachedTokens = usage.prompt_tokens_details?.cached_tokens ?? null;

    // Prefer OpenRouter's own computed cost (present when the request body
    // was built with withUsageTracking()). Falls back to the local map.
    const orCost = typeof usage.cost === 'number' ? usage.cost : null;
    const costUsd = orCost != null
      ? orCost
      : computeCostFromPricing(model, promptTokens, completionTokens, cachedTokens);

    const row = {
      scout_job_id: scoutJobId,
      category_id: categoryId,
      keyword,
      phase,
      model,
      calls,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      reasoning_tokens: reasoningTokens,
      cached_tokens: cachedTokens,
      cost_usd: costUsd,
    };

    const client = getClient();
    if (!client) {
      console.warn('[ai-usage] no Supabase client configured — skipping log (non-fatal)');
      return row;
    }
    const { error } = await client.from('ai_usage_log').insert(row);
    if (error) {
      console.warn(`[ai-usage] insert failed (non-fatal, phase=${phase}, model=${model}): ${error.message}`);
    } else {
      const costStr = costUsd != null ? `$${costUsd.toFixed(6)}` : 'cost unknown';
      console.log(`  💰 [ai-usage] ${phase} ${model}: ${promptTokens}in/${completionTokens}out tok, ${costStr}`);
    }
    return row;
  } catch (e) {
    console.warn(`[ai-usage] recorder threw (non-fatal): ${e.message}`);
    return null;
  }
}

module.exports = {
  PRICING,
  withUsageTracking,
  extractUsageFromSSE,
  recordAiUsage,
  computeCostFromPricing,
};
