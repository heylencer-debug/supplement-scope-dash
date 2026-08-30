/**
 * phase12-final-signoff.js — Final Formula Sign-off (pipeline P13)
 *
 * The step AFTER compliance (user directive 2026-08-30: "add 1 more Opus 5
 * after compliance"). P12 only CHECKS — it never edits the formula. This
 * phase closes that loop: Opus 5 acts as the chief formulator, takes the
 * QA-adjusted formula + P11 benchmarking findings + the full P12 compliance
 * report, APPLIES every required correction (doses over NIH ULs, non-DSHEA
 * claims), and issues the final, factory-ready verdict.
 *
 * Output → formula_briefs.ingredients.final_signoff:
 *   { opus_review, verdict: APPROVED | APPROVED WITH CORRECTIONS | REJECTED,
 *     corrections_applied, generated_at, model }
 *
 * Usage:
 *   node phase12-final-signoff.js --keyword "electrolyte powder" [--force]
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { resolveCategory } = require('./utils/category-resolver');

const DASH = createClient(
  process.env.DASH_URL || process.env.SUPABASE_URL,
  process.env.DASH_KEY || process.env.SUPABASE_KEY
);

const KEYWORD = process.argv.includes('--keyword')
  ? process.argv[process.argv.indexOf('--keyword') + 1]
  : 'ashwagandha gummies';
const FORCE = process.argv.includes('--force');

const VALIDATION_MODEL = process.env.VALIDATION_MODEL || 'anthropic/claude-opus-5';

// Form-aware serving language (same derivation as phase9-formula-qa.js).
const FORM = (() => {
  const k = KEYWORD.toLowerCase();
  if (/gumm/.test(k)) return 'gummy';
  if (/powder/.test(k)) return 'powder';
  if (/capsule/.test(k)) return 'capsule';
  if (/tablet/.test(k)) return 'tablet';
  if (/chewable|chew\b/.test(k)) return 'chewable';
  if (/liquid|drops/.test(k)) return 'liquid';
  if (/softgel/.test(k)) return 'softgel';
  return null;
})();
const SERVING_LABEL = {
  gummy: '2 gummies', powder: '1 stick pack / scoop', capsule: '2 capsules',
  tablet: '2 tablets', chewable: '2 chewables', liquid: '1 dropper / serving', softgel: '2 softgels',
}[FORM] || '1 serving';

function getOpenRouterKey() { return process.env.OPENROUTER_API_KEY || null; }

async function callOpusOnce(prompt, maxTokens, messagesOverride = null) {
  const key = getOpenRouterKey();
  if (!key) throw new Error('OPENROUTER_API_KEY not set');
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1800000);
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST', signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://dovive.com',
        'X-Title': 'DOVIVE Scout P13 Final Sign-off',
      },
      body: JSON.stringify({
        model: VALIDATION_MODEL,
        max_tokens: maxTokens,
        stream: true,
        reasoning: { enabled: false },
        messages: messagesOverride || [{ role: 'user', content: prompt }],
      }),
    });
    if (res.status === 402) {
      console.error('  ❌ P13 OpenRouter credits exhausted — top up at openrouter.ai');
      throw new Error('[ERROR: credits] OpenRouter credits exhausted (402)');
    }
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Opus error ${res.status}: ${errText.slice(0, 200)}`);
    }
    let output = '';
    let promptTokens = 0, completionTokens = 0, finishReason = null;
    const text = await res.text();
    for (const line of text.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') break;
      try {
        const j = JSON.parse(data);
        if (j.error) throw new Error(`Opus error: ${j.error.message || JSON.stringify(j.error)}`);
        const delta = j.choices?.[0]?.delta?.content;
        if (delta) output += delta;
        if (j.choices?.[0]?.finish_reason) finishReason = j.choices[0].finish_reason;
        if (j.usage) { promptTokens = j.usage.prompt_tokens || 0; completionTokens = j.usage.completion_tokens || 0; }
      } catch (e) {
        if (e.message.startsWith('Opus error')) throw e;
      }
    }
    if (promptTokens || completionTokens) console.log(`  Tokens: ${promptTokens}→${completionTokens} (finish: ${finishReason || 'unknown'})`);
    console.log(`  ✅ Opus done (${Math.round((Date.now() - start) / 1000)}s, ${output.length} chars)`);
    return { output, finishReason };
  } finally {
    clearTimeout(timeout);
  }
}

// Auto-continuation on the model's output ceiling (established pattern —
// NOT a retry: partial answer becomes context, generation continues).
async function callOpus(prompt, maxTokens = 64000) {
  let { output, finishReason } = await callOpusOnce(prompt, maxTokens);
  let segments = 0;
  while (finishReason === 'length' && (output || '').length > 500 && segments < 2) {
    segments++;
    console.log(`  ↪ output hit the model's token ceiling at ${output.length} chars — continuing (segment ${segments + 1})...`);
    const next = await callOpusOnce(null, maxTokens, [
      { role: 'user', content: prompt },
      { role: 'assistant', content: output },
      { role: 'user', content: 'Continue EXACTLY from where your previous message stopped, mid-sentence if necessary. Do not repeat anything, do not summarize, no preamble — output only the next characters of the document.' },
    ]);
    if (!next.output) break;
    output += next.output;
    finishReason = next.finishReason;
  }
  if ((output || '').length < 500) {
    console.warn('  ⚠ near-empty output — retrying once at same budget...');
    const retry = await callOpusOnce(prompt, maxTokens);
    if (retry.output) output = retry.output;
  }
  return output || null;
}

function real(t) { return typeof t === 'string' && t.trim().length > 500 && !t.trim().startsWith('[ERROR'); }

function buildPrompt(ing, keyword) {
  const finalBrief = ing.final_formula_brief || ing.ai_generated_brief || '';
  const adjusted = ing.adjusted_formula || '';
  const qaExcerpt = (ing.qa_report || '').slice(0, 30000);
  const cb = ing.competitive_benchmarking || {};
  const fc = ing.fda_compliance || {};
  return `You are the CHIEF FORMULATOR issuing the FINAL SIGN-OFF for a "${keyword}" supplement before it goes to the factory. You are the last quality gate. Everything below is real pipeline output — ground every statement in it; invent nothing.

## THE QA-ADJUSTED FORMULA (current candidate)
${adjusted ? adjusted.slice(0, 25000) : finalBrief.slice(0, 25000) || 'No formula found — say so and REJECT.'}

## QA REPORT (excerpt)
${qaExcerpt || 'Not available'}

## P11 COMPETITIVE BENCHMARKING (validated findings excerpt)
${(cb.opus_validation || cb.sonnet_draft || '').slice(0, 20000) || 'Not available'}

## P12 FDA/DSHEA COMPLIANCE REPORT (the findings you MUST act on)
${(fc.opus_analysis || '').slice(0, 30000) || 'Not available'}

## P12 ADVERSARIAL CROSS-CHECK
${(fc.sonnet_validation || '').slice(0, 15000) || 'Not available'}

# YOUR SIGN-OFF (write in this exact structure)

## 1. VERDICT
One line, exactly one of: **APPROVED** (zero compliance findings required changes) | **APPROVED WITH CORRECTIONS** (you applied fixes below) | **REJECTED** (an unfixable problem — explain).

## 2. FINAL FORMULA — Per Serving (${SERVING_LABEL})
The complete corrected formula table: | Ingredient | Amount | Form/Grade | %DV | Status |. Status = "unchanged" or "CORRECTED". Apply EVERY correction the compliance report requires (doses above NIH ULs reduced with the UL cited, ingredients with unverifiable safety data flagged or removed). State the total fill/serving weight and confirm it is physically manufacturable in this format.

## 3. CORRECTIONS APPLIED
One row per change: what changed, from → to, WHY (cite the exact compliance finding / NIH UL / DSHEA rule). If none: "None required."

## 4. APPROVED LABEL CLAIMS
The final list of structure/function claims that survive DSHEA review, each with its substantiation source. Then a short DO-NOT-USE list of claims the compliance report killed.

## 5. GO-TO-FACTORY NOTE
5-8 sentences for the manufacturer: what this product is, the non-negotiable specs (doses, forms, fill weight, testing requirements), and the one thing most likely to go wrong in production.

Be decisive and specific. Plain language. Every number must trace to the inputs above.`;
}

async function run() {
  console.log(`\n══════════════════════════════════════════════════════════════`);
  console.log(`P13: FINAL FORMULA SIGN-OFF — "${KEYWORD}"`);
  console.log(`══════════════════════════════════════════════════════════════`);

  const cat = await resolveCategory(DASH, KEYWORD);
  console.log(`  → Resolved category (${cat.method}): "${cat.name}" (${cat.id})`);

  const { data: fb } = await DASH.from('formula_briefs')
    .select('id, ingredients').eq('category_id', cat.id).limit(1).maybeSingle();
  if (!fb) throw new Error('No formula_briefs row — run P9-P12 first.');
  const ing = fb.ingredients || {};

  if (!FORCE) {
    const existing = ing.final_signoff;
    if (existing && real(existing.opus_review)) {
      console.log('✅ P13 final sign-off already exists (real content). Use --force to regenerate.');
      return;
    }
    if (existing) console.log('⚠️ P13 row exists but content is empty/partial — regenerating.');
  }
  if (!real(ing.fda_compliance?.opus_analysis)) {
    throw new Error('P12 compliance report missing/empty — sign-off needs it. Run P12 first.');
  }

  const prompt = buildPrompt(ing, KEYWORD);
  console.log(`Prompt: ${Math.round(prompt.length / 1000)}k chars`);
  console.log(`Calling ${VALIDATION_MODEL} via OpenRouter (chief-formulator sign-off)...`);
  const review = await callOpus(prompt, 64000);
  if (!review) throw new Error('Sign-off came back empty after retry.');

  const verdictMatch = review.match(/\b(APPROVED WITH CORRECTIONS|APPROVED|REJECTED)\b/);
  const verdict = verdictMatch ? verdictMatch[1] : 'UNKNOWN';
  console.log(`Verdict: ${verdict} | Review: ${Math.round(review.length / 1000)}k chars`);

  const updated = {
    ...ing,
    final_signoff: {
      opus_review: review,
      verdict,
      corrections_applied: verdict === 'APPROVED WITH CORRECTIONS',
      generated_at: new Date().toISOString(),
      model: VALIDATION_MODEL,
    },
  };
  const { error } = await DASH.from('formula_briefs').update({ ingredients: updated }).eq('id', fb.id);
  if (error) throw new Error(`Save failed: ${error.message}`);
  console.log(`✅ Saved to formula_briefs.ingredients.final_signoff`);
}

run().catch((e) => { console.error(`❌ P13 failed: ${e.message}`); process.exit(1); });
