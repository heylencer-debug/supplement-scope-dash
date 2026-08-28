/**
 * phase10-competitive-benchmarking.js — Competitive Formula Benchmarking (P11)
 *
 * Takes our final adjusted formula (from P10 QA) and compares it
 * ingredient-by-ingredient against every competitor formula we have OCR data for.
 *
 * Anti-hallucination architecture:
 *   1. All competitor data from DB (P4 OCR — real scraped formulas, not AI memory)
 *   2. Claude (via OpenRouter) drafts the benchmarking analysis grounded in provided data
 *   3. Claude (via OpenRouter) validates/critiques — finds unsupported claims, wrong doses
 *   4. Every comparison backed by actual OCR text from DB; unverifiable = flagged
 *   5. Structured output with mandatory evidence fields
 *
 * Output:
 *   - formula_briefs.ingredients.competitive_benchmarking (JSON + markdown)
 *   - Vault: C:\SirPercival-Vault\07_ai-systems\agents\scout\competitive-benchmarking\
 *
 * Usage:
 *   node phase10-competitive-benchmarking.js --keyword "biotin gummies"
 *   node phase10-competitive-benchmarking.js --keyword "biotin gummies" --force
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { resolveCategory } = require('./utils/category-resolver');
const fs = require('fs');
const path = require('path');

const DASH = createClient(
  process.env.DASH_URL || process.env.SUPABASE_URL,
  process.env.DASH_KEY || process.env.SUPABASE_KEY
);

// DOVIVE client — P5's off-Amazon research (dovive_phase5_research / dovive_p5_sources)
// lives here, same as phase5-deep-research.js/phase8-formula-brief.js.
const DOVIVE = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const KEYWORD = process.argv.includes('--keyword')
  ? process.argv[process.argv.indexOf('--keyword') + 1]
  : 'ashwagandha gummies';
const FORCE = process.argv.includes('--force');

// ─── API Helpers ───────────────────────────────────────────────────────────────

function getOpenRouterKey()   { return process.env.OPENROUTER_API_KEY || null; }

// Analysis model — configurable without a rebuild. Default: Claude Sonnet 5 via OpenRouter.
// 2026-08-28: RESTORED independent-model validation per explicit follow-up
// instruction. callClaudeOpus (Call 2, the validation tier) now points at
// VALIDATION_MODEL (Opus 5, a genuinely different model) instead of
// ANALYSIS_MODEL — draft (Call 1, Sonnet 5) and validation (Call 2, Opus 5)
// are independent models again, so the validation step can actually catch
// the draft's hallucinations/arithmetic errors with a fresh perspective
// instead of the same model checking itself.
const ANALYSIS_MODEL = process.env.ANALYSIS_MODEL || 'anthropic/claude-sonnet-5';
const VALIDATION_MODEL = process.env.VALIDATION_MODEL || 'anthropic/claude-opus-5';

async function callClaudeSonnet(prompt, maxTokens = 32000) {
  const key = getOpenRouterKey();
  if (!key) throw new Error('OPENROUTER_API_KEY not set');
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 600000);
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST', signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://dovive.com',
        'X-Title': 'DOVIVE Scout P11 Benchmarking',
      },
      body: JSON.stringify({
        model: ANALYSIS_MODEL,
        max_tokens: maxTokens,
        stream: true,
        // 2026-08-28 FIX: root cause of the previously-empty draft
        // (`27510→16000 finish_reason:length, 0k chars`, TWICE, on a 40-
        // competitor exhaustive ingredient table) — the completion budget
        // was fully consumed with zero visible `delta.content` text, which
        // only happens when a model spends its whole budget on hidden
        // reasoning/thinking tokens before ever emitting the answer.
        // Explicitly disable extended thinking for this deterministic,
        // data-driven tabular task (no benefit from chain-of-thought here,
        // every fact must come from the provided OCR data verbatim) so the
        // full token budget goes to visible output.
        reasoning: { enabled: false },
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Claude Sonnet error ${res.status}: ${errText.slice(0, 200)}`);
    }
    let output = '';
    let reasoning = '';
    let promptTokens = 0, completionTokens = 0, finishReason = null;
    const text = await res.text();
    for (const line of text.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') break;
      try {
        const j = JSON.parse(data);
        if (j.error) throw new Error(`Claude Sonnet error: ${j.error.message || JSON.stringify(j.error)}`);
        const delta = j.choices?.[0]?.delta?.content;
        if (delta) output += delta;
        // Diagnostic only — reasoning/thinking deltas (if the provider still
        // emits them despite reasoning:{enabled:false}) are NOT counted as
        // real output but are logged so a future empty-output case is
        // immediately diagnosable instead of a silent mystery.
        const reasoningDelta = j.choices?.[0]?.delta?.reasoning || j.choices?.[0]?.delta?.reasoning_content;
        if (reasoningDelta) reasoning += reasoningDelta;
        if (j.choices?.[0]?.finish_reason) finishReason = j.choices[0].finish_reason;
        if (j.usage) { promptTokens = j.usage.prompt_tokens || 0; completionTokens = j.usage.completion_tokens || 0; }
      } catch (e) {
        if (e.message.startsWith('Claude Sonnet error')) throw e;
      }
    }
    if (promptTokens || completionTokens) console.log(`  Tokens: ${promptTokens}→${completionTokens}${finishReason ? ` (finish_reason: ${finishReason})` : ''}`);
    console.log(`  ✅ Claude Sonnet done (${Math.round((Date.now()-start)/1000)}s, ${Math.round(output.length/1000)}k chars)`);
    if (!output) {
      console.warn(`  ⚠ Claude Sonnet returned EMPTY output (finish_reason: ${finishReason || 'unknown'}, completion_tokens: ${completionTokens}, reasoning_chars: ${reasoning.length}) — likely max_tokens too low or all budget consumed before content. NOT coercing to null silently.`);
    }
    // Never silently coerce empty-but-real responses to null — an empty string is diagnosable,
    // null looks identical to "never called". Caller decides how to handle empties.
    return output;
  } finally {
    clearTimeout(timeout);
  }
}

async function callClaudeOpus(prompt, maxTokens = 16000) {
  const key = getOpenRouterKey();
  if (!key) throw new Error('OPENROUTER_API_KEY not set');
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 600000);
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST', signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://dovive.com',
        'X-Title': 'DOVIVE Scout P11 Benchmarking',
      },
      body: JSON.stringify({
        model: VALIDATION_MODEL,
        max_tokens: maxTokens,
        stream: true,
        // 2026-08-28: same fix applied here for consistency/safety — see
        // callClaudeSonnet's comment above for the observed root cause.
        reasoning: { enabled: false },
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Claude Opus error ${res.status}: ${errText.slice(0, 200)}`);
    }
    let output = '';
    let reasoning = '';
    let promptTokens = 0, completionTokens = 0, finishReason = null;
    const text = await res.text();
    for (const line of text.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') break;
      try {
        const j = JSON.parse(data);
        if (j.error) throw new Error(`Claude Opus error: ${j.error.message || JSON.stringify(j.error)}`);
        const delta = j.choices?.[0]?.delta?.content;
        if (delta) output += delta;
        const reasoningDelta = j.choices?.[0]?.delta?.reasoning || j.choices?.[0]?.delta?.reasoning_content;
        if (reasoningDelta) reasoning += reasoningDelta;
        if (j.choices?.[0]?.finish_reason) finishReason = j.choices[0].finish_reason;
        if (j.usage) { promptTokens = j.usage.prompt_tokens || 0; completionTokens = j.usage.completion_tokens || 0; }
      } catch (e) {
        if (e.message.startsWith('Claude Opus error')) throw e;
      }
    }
    if (promptTokens || completionTokens) console.log(`  Tokens: ${promptTokens}→${completionTokens}${finishReason ? ` (finish_reason: ${finishReason})` : ''}`);
    console.log(`  ✅ Claude Opus done (${Math.round((Date.now()-start)/1000)}s, ${Math.round(output.length/1000)}k chars)`);
    if (!output) {
      console.warn(`  ⚠ Claude Opus returned EMPTY output (finish_reason: ${finishReason || 'unknown'}, completion_tokens: ${completionTokens}, reasoning_chars: ${reasoning.length})`);
    }
    return output;
  } finally {
    clearTimeout(timeout);
  }
}

// 2026-08-28 FIX (audit item #2): P10 never surfaced P5's off-Amazon research
// (live retail pricing, official brand-site claims/certifications) anywhere,
// even though the phase's own "Market claim we can make" / value-proposition
// fields are necessarily Amazon-listing-price-only without it. Pulls a thin,
// clearly-labeled reference slice — NOT used for ingredient-dose verdicts
// (those stay strictly OCR-grounded per the existing anti-hallucination
// design), only for pricing-position/claims context. Never throws.
async function fetchP5OffAmazonData(asins, keyword) {
  if (!asins.length) return {};
  try {
    const firstWord = keyword.split(' ')[0].toLowerCase();
    const [researchRes, sourcesRes] = await Promise.all([
      DOVIVE.from('dovive_phase5_research')
        .select('asin, competitor_angle, key_strengths, key_weaknesses, certifications')
        .in('asin', asins)
        .or(`keyword.ilike.%${firstWord}%,keyword.ilike.%${keyword}%`),
      DOVIVE.from('dovive_p5_sources')
        .select('asin, source_url, source_type, extracted')
        .in('asin', asins),
    ]);
    const byAsin = {};
    for (const r of (researchRes.data || [])) {
      byAsin[r.asin] = { ...(byAsin[r.asin] || {}), research: r };
    }
    for (const s of (sourcesRes.data || [])) {
      byAsin[s.asin] = { ...(byAsin[s.asin] || {}), source: s };
    }
    return byAsin;
  } catch (e) {
    console.warn('  ⚠️ P5 off-Amazon data fetch failed (non-fatal, P10 continues OCR-only):', e.message);
    return {};
  }
}

function formatP5OffAmazonBlock(p5Entry) {
  if (!p5Entry) return null;
  const parts = [];
  if (p5Entry.source) {
    const ex = p5Entry.source.extracted || {};
    parts.push(`Off-Amazon retail price: ${ex.retail_price || 'N/A'} | Off-Amazon certifications: ${(ex.certifications || []).join(', ') || 'N/A'} | Source: ${p5Entry.source.source_url || 'N/A'} (${p5Entry.source.source_type || 'brand/retail page'})`);
  }
  if (p5Entry.research) {
    const r = p5Entry.research;
    if (r.competitor_angle) parts.push(`P5 competitive angle: ${r.competitor_angle.slice(0, 400)}`);
    if (r.key_strengths?.length) parts.push(`P5 key strengths: ${r.key_strengths.slice(0, 3).join('; ')}`);
    if (r.key_weaknesses?.length) parts.push(`P5 key weaknesses: ${r.key_weaknesses.slice(0, 3).join('; ')}`);
  }
  return parts.length ? parts.join('\n') : null;
}

// ─── Build Sonnet Draft Prompt ─────────────────────────────────────────────────

function buildSonnetDraftPrompt(adjustedFormula, competitors, keyword, p5Data = {}) {
  const compSection = competitors.map((c, i) => {
    const nutrients = c.all_nutrients
      ? (typeof c.all_nutrients === 'string' ? c.all_nutrients : JSON.stringify(c.all_nutrients, null, 2))
      : null;
    const sf = c.supplement_facts_raw || '';
    const hasFormula = nutrients || sf;
    const p5Block = formatP5OffAmazonBlock(p5Data[c.asin]);
    const p5Section = p5Block ? `\nOff-Amazon Intelligence (P5, reference only — do NOT use for ingredient-dose verdicts, only for pricing/claims context):\n${p5Block}\n` : '';
    if (!hasFormula) return `### COMPETITOR ${i+1}: ${c.brand || 'Unknown'} [${c.asin}]\nBSR: ${c.bsr_current} | $${c.price} | $${(c.monthly_revenue||0).toLocaleString()}/mo\n⚠ NO FORMULA DATA — skip comparison, list as "Formula not extracted"\n${p5Section}`;
    return `### COMPETITOR ${i+1}: ${c.brand || 'Unknown'} [${c.asin}]
BSR: ${c.bsr_current?.toLocaleString()} | Price: $${c.price} | Revenue: $${(c.monthly_revenue||0).toLocaleString()}/mo
Rating: ${c.rating_value}⭐ (${(c.rating_count||0).toLocaleString()} reviews)
Serving: ${c.serving_size || 'N/A'} | Servings/container: ${c.servings_per_container || 'N/A'}

Supplement Facts (OCR extracted):
${sf.slice(0, 2500) || 'Not available'}

Structured nutrients:
${nutrients ? nutrients.slice(0, 2000) : 'Not available'}
${p5Section}`;
  }).join('\n---\n');

  return `You are a senior supplement formulator with expertise in competitive formula analysis.

## CRITICAL RULES — READ BEFORE PROCEEDING
1. Use ONLY the competitor data provided below. NEVER invent doses, ingredients, or formulas.
2. If a competitor has no formula data, mark them as "No OCR data — cannot compare" and move on.
3. Every dose you cite MUST appear in the provided supplement facts text above it.
4. If you are unsure about a comparison, write "NEEDS_VERIFICATION: [reason]" instead of guessing.
5. Do NOT use your training knowledge of what a product "typically contains" — only use the data here.
6. "Off-Amazon Intelligence (P5)" blocks, where present, are reference-only context for pricing/claims — never use them as a source for an ingredient dose comparison; doses come exclusively from the OCR Supplement Facts / Structured nutrients above them.

## DOVIVE FINAL FORMULA (from P10 QA — this is the ground truth)
${adjustedFormula || 'ERROR: No adjusted formula found. Cannot benchmark.'}

## COMPETITOR FORMULAS (${competitors.length} competitors with OCR data)
${compSection}

---

## YOUR DELIVERABLE

Produce this exact structure:

# P11 COMPETITIVE FORMULA BENCHMARKING — ${keyword.toUpperCase()}
*Data source: P4 OCR extraction + P10 adjusted formula*
*Benchmarking model: Claude (${ANALYSIS_MODEL}) (draft) — to be validated by Claude (${VALIDATION_MODEL})*

## EXECUTIVE SUMMARY
| Metric | Value |
|---|---|
| Competitors analyzed | [only those with OCR formula data] |
| Competitors skipped (no OCR data) | [count] |
| Ingredients where DOVIVE wins | [count] |
| Ingredients where competitors win | [count] |
| Tie / Within 20% | [count] |
| Unique DOVIVE ingredients | [count — ingredients competitors don't have] |
| Missing vs competitors | [count — ingredients competitors have that we don't] |
| Overall competitive position | STRONG / COMPETITIVE / NEEDS WORK |

## INGREDIENT-BY-INGREDIENT COMPARISON
(Only include rows where at least one competitor has data for that ingredient)

| Ingredient | DOVIVE Dose | Best Competitor Dose | Market Average | Verdict | Evidence Source |
|---|---|---|---|---|---|
[One row per active ingredient. Verdict: DOVIVE WINS / COMPETITOR WINS / TIE / NEEDS_VERIFICATION]
[Evidence Source: "ASIN B0XXXXXXXX supplement_facts_raw" — cite the actual source]

## PER-COMPETITOR BREAKDOWN
(Only for competitors WITH formula data)

For each competitor with OCR data:
### vs [Brand] — BSR [X] | $[price] | [ASIN]
**Formula coverage**: [X/Y ingredients we could compare]
**Where DOVIVE wins**: [bullet list with specific doses]
**Where competitor wins**: [bullet list with specific doses]
**Unique to DOVIVE**: [ingredients we have that they don't]
**Unique to competitor**: [ingredients they have that we don't — should we add?]
**Can we beat them?**: [Yes/No/Partial + one-line reason based on data]
**Market claim we can make**: ["More X than [Brand]" or "First to include Y at clinical dose"]

## DOVIVE ADVANTAGES SUMMARY
(Evidence-backed claims we can make on the label or in marketing)
| Claim | vs Which Competitor | Evidence | Confidence |
|---|---|---|---|
[Only claims directly supported by the comparison data above]

## COMPETITIVE GAPS — SHOULD WE ADD THESE?
(Ingredients multiple competitors have that we're missing)
| Ingredient | How Many Competitors Have It | Avg Competitor Dose | Add to DOVIVE? | Reason |
|---|---|---|---|---|

## FORMULA STRENGTH SCORE
IMPORTANT: Every score below MUST be a number from 0.0 to 10.0. Do NOT write words like STRONG, WEAK, or MODERATE — write the number only (e.g. 7.5).
| Dimension | Score (0-10) | Rationale |
|---|---|---|
| Dose superiority (vs market) | [number/10] | [one line, evidence-based] |
| Ingredient uniqueness | [number/10] | [one line] |
| Certifications & quality signals | [number/10] | [one line] |
| Value proposition at target price | [number/10] | [one line] |
| Overall formula competitiveness | [number/10] | [one line] |

## DATA QUALITY FLAGS
List every instance where you wrote NEEDS_VERIFICATION and why:
- [ingredient/claim]: [what's unverifiable and why]

---
Be surgical and data-driven. If you can't verify a claim from the data provided, flag it. This report will be reviewed by Claude (via OpenRouter) which will check every number against the source data.`;
}

// ─── Build Claude Opus Validation Prompt ──────────────────────────────────────

function buildOpusValidationPrompt(adjustedFormula, competitors, grokDraft, keyword) {
  // Build a compact competitor reference for verification
  const compRef = competitors.slice(0, 50).map(c => {
    const sf = (c.supplement_facts_raw || '').slice(0, 1200);
    return `[${c.asin}] ${c.brand}: ${sf || 'No OCR data'}`;
  }).join('\n');

  return `You are a pharmaceutical QA expert and fact-checker. Your ONLY job is to validate the competitive benchmarking report below for accuracy.

## VALIDATION RULES
1. Check every dose cited for DOVIVE against the formula anchor
2. Check every dose cited for competitors against the competitor data provided
3. Flag any claim NOT directly supported by the data
4. Correct any wrong numbers you find
5. Approve sections that are accurate

## DOVIVE FORMULA ANCHOR (ground truth — all DOVIVE doses must match this)
${adjustedFormula || 'Not available'}

## COMPETITOR DATA (OCR source — all competitor doses must come from this)
${compRef}

## GROK BENCHMARKING DRAFT (to validate)
${grokDraft?.slice(0, 40000) || 'No draft available'}
${grokDraft && grokDraft.length > 40000 ? '\n[Draft continues — key sections shown]\n' : ''}

---

## YOUR DELIVERABLE

Produce a validation report in this exact format:

# P11 VALIDATION REPORT — Claude (via OpenRouter)
*Reviewing Claude (via OpenRouter) benchmarking draft for ${keyword}*

## VALIDATION SUMMARY
| | Count |
|---|---|
| Sections verified (accurate) | [N] |
| Errors found (wrong numbers) | [N] |
| Unsupported claims flagged | [N] |
| NEEDS_VERIFICATION items confirmed | [N] |
| Overall validation result | PASS / PASS WITH CORRECTIONS / FAIL |

## ERRORS FOUND
(Wrong numbers that must be corrected)
| # | Location in Draft | Error | Correct Value | Source |
|---|---|---|---|---|
[If none: "✅ No factual errors found in competitor dose comparisons."]

## UNSUPPORTED CLAIMS
(Claims in the draft that can't be verified from the provided data)
| # | Claim | Why Unsupported | Recommendation |
|---|---|---|---|
[If none: "✅ All claims are supported by provided data."]

## CONFIRMED NEEDS_VERIFICATION ITEMS
(Items Claude Sonnet correctly flagged as unverifiable)
[List each — confirm they are indeed unverifiable from provided data]

## ADDITIONAL GAPS SONNET MISSED
(Competitor advantages or DOVIVE weaknesses that Claude Sonnet didn't flag)
[Be specific — cite ASIN and dose]

## VALIDATED ADVANTAGES
(Claims from the draft that ARE fully supported by the data — safe to use in marketing)
| Claim | Verified Against | Confidence |
|---|---|---|

## FINAL VERDICT
**Validation result**: [PASS / PASS WITH CORRECTIONS / FAIL]
**Summary**: [2-3 sentences — is this benchmarking report reliable? What's the main caveat?]
**Recommended action**: [Use as-is / Apply corrections above and use / Regenerate draft]`;
}

// ─── Parse overall score ───────────────────────────────────────────────────────

function parseScore(draft) {
  if (!draft) return null;
  // 1. Numeric X/10 anywhere near "competitiveness"
  const m = draft.match(/Overall formula competitiveness\s*\|?\s*(\d+(?:\.\d+)?)\s*\/\s*10/i)
         || draft.match(/Overall.*?competitiveness.*?(\d+(?:\.\d+)?)\s*\/\s*10/i)
         || draft.match(/competitiveness.*?(\d+(?:\.\d+)?)\s*\/\s*10/i)
         || draft.match(/FORMULA STRENGTH SCORE[\s\S]{0,500}(\d+(?:\.\d+)?)\s*\/\s*10/i);
  if (m) return parseFloat(m[1]);
  // 2. Any X/10 in the doc as last resort
  const any = draft.match(/(\d+(?:\.\d+)?)\s*\/\s*10/);
  if (any) return parseFloat(any[1]);
  // 3. Qualitative text → numeric fallback
  if (/\bSTRONG\b/i.test(draft)) return 7.5;
  if (/\bVERY STRONG\b/i.test(draft)) return 9.0;
  if (/\bMODERATE\b/i.test(draft)) return 5.5;
  if (/\bWEAK\b/i.test(draft)) return 3.0;
  return null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`\n${'═'.repeat(62)}`);
  console.log(`P11: COMPETITIVE FORMULA BENCHMARKING — "${KEYWORD}"`);
  console.log(`${'═'.repeat(62)}\n`);

  // Resolve category
  let CAT_ID, catName;
  try {
    const cat = await resolveCategory(DASH, KEYWORD);
    CAT_ID = cat.id;
    catName = cat.name;
    console.log(`  → Resolved category (${cat.method}): "${cat.name}" (${cat.id})`);
  } catch (e) {
    console.error(`ERROR: ${e.message}`);
    setTimeout(() => process.exit(1), 100);
    return;
  }

  // Skip if already done
  if (!FORCE) {
    const { data: existing } = await DASH.from('formula_briefs')
      .select('ingredients').eq('category_id', CAT_ID).limit(1).single();
    if (existing?.ingredients?.competitive_benchmarking) {
      console.log(`✅ P11 benchmarking already exists. Use --force to regenerate.`);
      return;
    }
  }

  // Load adjusted formula from P10
  console.log(`Loading P10 adjusted formula...`);
  const { data: briefRow } = await DASH.from('formula_briefs')
    .select('id, ingredients').eq('category_id', CAT_ID).not('ingredients', 'is', null).limit(1).single();
  const adjustedFormula = briefRow?.ingredients?.adjusted_formula
    || briefRow?.ingredients?.final_formula_brief
    || briefRow?.ingredients?.ai_generated_brief;
  if (!adjustedFormula) {
    console.error('ERROR: No formula found in formula_briefs. Run P9/P10 first.');
    setTimeout(() => process.exit(1), 100);
    return;
  }
  console.log(`  ✅ Formula loaded (${Math.round(adjustedFormula.length / 1000)}k chars)`);

  // Load competitors with formula data
  console.log(`Loading competitor formulas from DASH...`);
  const { data: allProducts } = await DASH.from('products')
    .select(`asin, brand, title, bsr_current, price, monthly_revenue, monthly_sales,
             rating_value, rating_count, serving_size, servings_per_container,
             supplement_facts_raw, all_nutrients, nutrients_count, marketing_analysis`)
    .eq('category_id', CAT_ID)
    .not('bsr_current', 'is', null)
    .order('bsr_current', { ascending: true })
    .limit(50);

  const withFormula = (allProducts || []).filter(p => p.nutrients_count > 0 || p.supplement_facts_raw);
  const withoutFormula = (allProducts || []).filter(p => !p.nutrients_count && !p.supplement_facts_raw);
  console.log(`  Total products: ${allProducts?.length || 0}`);
  console.log(`  With formula data (OCR): ${withFormula.length}`);
  console.log(`  Without formula data: ${withoutFormula.length}`);

  if (withFormula.length === 0) {
    console.error('ERROR: No competitors have formula data. Run P4 first.');
    setTimeout(() => process.exit(1), 100);
    return;
  }

  // ── Call 1: Claude Sonnet drafts the benchmarking ─────────────────────────
  // ROOT CAUSE (2026-08-28): this call used max_tokens=10000, too low for a full
  // competitor-by-competitor draft across up to 50 products — the model's completion
  // budget ran out before/without producing content, callClaudeSonnet returned an
  // empty string which got coerced to `null` (`output || null`) and persisted as
  // literal null in sonnet_draft/formula_score, even though the downstream Opus
  // validation call (smaller task, smaller budget) succeeded fine. Same class of bug
  // as the P9 Call2 truncation fix (6000→16000 tokens, commit 59cf9a3). Fix: raise the
  // budget to 16000 (matching P9's proven ceiling) and retry once on empty output
  // before giving up — never let the raw draft silently end up null.
  console.log(`Fetching P5 off-Amazon intelligence (reference-only pricing/claims context)...`);
  const p5Data = await fetchP5OffAmazonData(withFormula.map(c => c.asin), KEYWORD);
  console.log(`  ${Object.keys(p5Data).length} competitors have P5 off-Amazon data\n`);

  console.log(`\nCall 1: Claude (via OpenRouter) drafting ingredient comparison (${withFormula.length} competitors with OCR data)...`);
  const sonnetPrompt = buildSonnetDraftPrompt(adjustedFormula, withFormula, KEYWORD, p5Data);
  console.log(`  Prompt: ${Math.round(sonnetPrompt.length / 1000)}k chars`);
  // 2026-08-28 FIX: 16000/20000 both failed with the FULL budget consumed
  // and ZERO visible output chars (see callClaudeSonnet's reasoning:false
  // fix above) — raised to 32000/48000, well inside Sonnet 5's confirmed
  // 128000 max_completion_tokens, as a belt-and-suspenders safety net on
  // top of disabling reasoning tokens.
  let sonnetDraft = await callClaudeSonnet(sonnetPrompt, 32000);
  if (!sonnetDraft) {
    console.warn(`  ⚠ Sonnet draft came back empty — retrying once with a larger token budget (48000)...`);
    sonnetDraft = await callClaudeSonnet(sonnetPrompt, 48000);
  }
  if (!sonnetDraft) {
    console.error(`  ❌ Sonnet draft still empty after retry — persisting explicit error marker instead of null so this is diagnosable, not silently lost.`);
    sonnetDraft = '[ERROR: Claude Sonnet returned empty output for the competitive benchmarking draft after 2 attempts — check OpenRouter logs / token budget / finish_reason above.]';
  }

  // ── Call 2: Claude Opus validates ─────────────────────────────────────────
  console.log(`\nCall 2: Claude (via OpenRouter) validating Sonnet's analysis...`);
  const opusPrompt = buildOpusValidationPrompt(adjustedFormula, withFormula, sonnetDraft, KEYWORD);
  console.log(`  Prompt: ${Math.round(opusPrompt.length / 1000)}k chars`);
  let opusValidation = await callClaudeOpus(opusPrompt, 12000);
  if (!opusValidation) {
    console.warn(`  ⚠ Opus validation came back empty — retrying once with a larger token budget (16000)...`);
    opusValidation = await callClaudeOpus(opusPrompt, 16000);
  }
  if (!opusValidation) {
    opusValidation = '[ERROR: Claude Opus returned empty output for the competitive benchmarking validation after 2 attempts — check OpenRouter logs / token budget / finish_reason above.]';
  }

  // ── Parse scores ──────────────────────────────────────────────────────────
  const formulaScore = parseScore(sonnetDraft);
  const validationPassMatch = opusValidation?.match(/Overall validation result.*?(PASS WITH CORRECTIONS|PASS|FAIL)/i);
  const validationResult = validationPassMatch?.[1]?.trim() || 'UNKNOWN';
  console.log(`\nFormula competitiveness score: ${formulaScore}/10`);
  console.log(`Validation result: ${validationResult}`);

  // ── Save to formula_briefs ────────────────────────────────────────────────
  console.log(`\nSaving to Supabase...`);
  const benchmarkingData = {
    sonnet_draft: sonnetDraft,
    opus_validation: opusValidation,
    formula_score: formulaScore,
    validation_result: validationResult,
    competitors_with_formula: withFormula.length,
    competitors_without_formula: withoutFormula.length,
    generated_at: new Date().toISOString(),
    models_used: { draft: ANALYSIS_MODEL, validation: VALIDATION_MODEL },
  };

  const updatedIngredients = {
    ...(briefRow.ingredients || {}),
    competitive_benchmarking: benchmarkingData,
  };
  const { error: saveErr } = await DASH.from('formula_briefs')
    .update({ ingredients: updatedIngredients })
    .eq('id', briefRow.id);
  if (saveErr) console.error(`  ❌ Save error: ${saveErr.message}`);
  else {
    console.log(`  ✅ Saved to formula_briefs.ingredients.competitive_benchmarking`);
    await DASH.from('categories').update({ updated_at: new Date().toISOString() }).eq('id', CAT_ID);
    console.log('  ✅ Category updated_at bumped');
  }

  // ── Save to vault ─────────────────────────────────────────────────────────
  console.log(`\nSaving to vault...`);
  const date = new Date().toISOString().split('T')[0];
  const slug = KEYWORD.replace(/\s+/g, '-').toLowerCase();
  const vaultDir = 'C:\\SirPercival-Vault\\07_ai-systems\\agents\\scout\\competitive-benchmarking';
  try {
    if (!fs.existsSync(vaultDir)) fs.mkdirSync(vaultDir, { recursive: true });
    const vaultPath = path.join(vaultDir, `${date}-${slug}-benchmarking.md`);
    fs.writeFileSync(vaultPath, [
      `# P11 Competitive Formula Benchmarking — ${KEYWORD}`,
      `Generated: ${new Date().toISOString()}`,
      `Formula score: ${formulaScore}/10 | Validation: ${validationResult}`,
      `Competitors with formula data: ${withFormula.length} | Without: ${withoutFormula.length}`,
      `Models: ${ANALYSIS_MODEL} (draft) + ${VALIDATION_MODEL} (validation)`,
      ``,
      `---`,
      ``,
      `## CLAUDE SONNET 4.6 DRAFT`,
      sonnetDraft || 'Not available',
      ``,
      `---`,
      ``,
      `## CLAUDE OPUS 4.6 VALIDATION`,
      opusValidation || 'Not available',
    ].join('\n'));
    console.log(`  ✅ ${vaultPath}`);
  } catch (e) {
    console.warn(`  ⚠ Vault save failed (non-fatal): ${e.message}`);
    // Save to scout/output instead
    const outDir = path.join(__dirname, 'output');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, `${date}-${slug}-competitive-benchmarking.md`);
    fs.writeFileSync(outPath, [sonnetDraft, '\n\n---\n\n', opusValidation].join(''));
    console.log(`  ✅ Saved to ${outPath}`);
  }

  console.log(`\n${'═'.repeat(62)}`);
  console.log(`P11 COMPLETE`);
  console.log(`Formula competitiveness: ${formulaScore}/10`);
  console.log(`Validation: ${validationResult}`);
  console.log(`${withFormula.length} competitors benchmarked | ${withoutFormula.length} skipped (no OCR)`);
  console.log(`${'═'.repeat(62)}\n`);
}

run()
  .then(() => setTimeout(() => process.exit(0), 500))
  .catch(e => {
    console.error(e.message);
    setTimeout(() => process.exit(1), 500);
  });
