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
const { withUsageTracking, extractUsageFromSSE, recordAiUsage } = require('./utils/ai-usage');

// Set once run() resolves the category — read by callOpusOnce() below.
let _categoryId = null;

const DASH = createClient(
  process.env.DASH_URL || process.env.SUPABASE_URL,
  process.env.DASH_KEY || process.env.SUPABASE_KEY
);

const KEYWORD = process.argv.includes('--keyword')
  ? process.argv[process.argv.indexOf('--keyword') + 1]
  : 'ashwagandha gummies';
const FORCE = process.argv.includes('--force');

const VALIDATION_MODEL = process.env.VALIDATION_MODEL || 'anthropic/claude-sonnet-5'; // 2026-09-01: Opus->Sonnet 5 default swap (cost); override via env to restore Opus

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
      body: JSON.stringify(withUsageTracking({
        model: VALIDATION_MODEL,
        max_tokens: maxTokens,
        stream: true,
        stream_options: { include_usage: true },
        reasoning: { enabled: false },
        messages: messagesOverride || [{ role: 'user', content: prompt }],
      })),
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
    recordAiUsage({ phase: 'P13', model: VALIDATION_MODEL, usage: extractUsageFromSSE(text), categoryId: _categoryId, keyword: KEYWORD }).catch(() => {});
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
// Segment cap raised 2→5 on 2026-09-03: the sign-off deliverable now
// covers THREE formulas (Proven/Edge/Recommended Blend) instead of one,
// each with its own verdict + corrected formula table + corrections list.
async function callOpus(prompt, maxTokens = 64000) {
  let { output, finishReason } = await callOpusOnce(prompt, maxTokens);
  let segments = 0;
  while (finishReason === 'length' && (output || '').length > 500 && segments < 5) {
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

// 2026-09-03: tolerant per-formula section extraction from the tri-formula
// sign-off output (heading-level/case drift tolerant, same pattern used by
// P9's extractFormulaVariant).
function extractSignoffBlock(text, label, nextLabels) {
  if (!text) return null;
  const next = nextLabels.length ? `(?:\\n##\\s*(?:${nextLabels.join('|')})|$)` : '$';
  const re = new RegExp(`##\\s*${label}[^\\n]*\\n([\\s\\S]*?)${next}`, 'i');
  return text.match(re)?.[1]?.trim() || null;
}

function parseBlockVerdict(block) {
  if (!block) return 'UNKNOWN';
  const m = block.match(/\*\*(APPROVED WITH CORRECTIONS|APPROVED|REJECTED)\*\*/) || block.match(/\b(APPROVED WITH CORRECTIONS|APPROVED|REJECTED)\b/);
  return m ? m[1] : 'UNKNOWN';
}

// 2026-09-03: dispatches to the tri-formula sign-off when P9 produced
// `ingredients.formula_variants` (Proven/Edge/Recommended Blend), else
// falls back UNCHANGED to the legacy single-formula sign-off — an older
// brief generated before the tri-formula upgrade renders exactly as it
// always has, per the graceful-fallback requirement.
function buildPrompt(ing, keyword) {
  const variants = ing.formula_variants;
  if (variants && real(variants.recommended)) {
    return buildTriFormulaPrompt(ing, keyword, variants);
  }
  return buildLegacyPrompt(ing, keyword);
}

function buildLegacyPrompt(ing, keyword) {
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

// Tri-formula sign-off (2026-09-03): P9 adjudicated three complete formulas
// (Proven/Edge/Recommended Blend) — each needs its own verdict, since they
// may legitimately differ (e.g. Proven APPROVED outright while Edge is
// APPROVED WITH CORRECTIONS because one emerging-bet ingredient needed a
// dose cut to clear an NIH UL). Only the Recommended Blend — the canonical,
// shipping formula — gets the shared Approved Label Claims + Go-to-Factory
// Note, since that's the one document manufacturing/marketing actually use.
function buildTriFormulaPrompt(ing, keyword, variants) {
  const qaExcerpt = (ing.qa_report || '').slice(0, 30000);
  const cb = ing.competitive_benchmarking || {};
  const fc = ing.fda_compliance || {};
  const complianceReport = (fc.opus_analysis || '').slice(0, 30000) || 'Not available';
  const crossCheck = (fc.sonnet_validation || '').slice(0, 15000) || 'Not available';
  const benchmarking = (cb.opus_validation || cb.sonnet_draft || '').slice(0, 20000) || 'Not available';
  return `You are the CHIEF FORMULATOR issuing the FINAL SIGN-OFF for a "${keyword}" supplement before it goes to the factory. You are the last quality gate. P9 QA adjudicated THREE complete formulas — Proven, Edge, and Recommended Blend. You must sign off on ALL THREE independently; they may receive different verdicts. Everything below is real pipeline output — ground every statement in it; invent nothing.

## FORMULA — PROVEN (Established Consensus)
${(variants.proven || 'Not available — P9 did not produce a Proven formula for this run.').slice(0, 15000)}

## FORMULA — EDGE (Established Floor + Emerging Bets)
${(variants.edge || 'Not available — P9 did not produce an Edge formula for this run.').slice(0, 15000)}

## FORMULA — RECOMMENDED BLEND (Provenance-Labeled Hybrid — canonical, ships today)
${variants.recommended.slice(0, 20000)}

## QA REPORT (excerpt — includes the per-formula dose analysis and comparative verdict)
${qaExcerpt || 'Not available'}

## P11 COMPETITIVE BENCHMARKING (validated findings excerpt)
${benchmarking}

## P12 FDA/DSHEA COMPLIANCE REPORT (the findings you MUST act on — applies to all three formulas independently)
${complianceReport}

## P12 ADVERSARIAL CROSS-CHECK
${crossCheck}

# YOUR SIGN-OFF (write in this exact structure — three formula blocks, then shared sections)

## PROVEN — SIGN-OFF
### 1. Verdict
One line, exactly one of: **APPROVED** | **APPROVED WITH CORRECTIONS** | **REJECTED** (explain if rejected).
### 2. Final Formula — Per Serving (${SERVING_LABEL})
| Ingredient | Amount | Form/Grade | %DV | Status |
|---|---|---|---|---|
Status = "unchanged" or "CORRECTED". Apply every correction the compliance report requires for THIS formula.
### 3. Corrections Applied
One row per change, or "None required."

## EDGE — SIGN-OFF
### 1. Verdict
One line, exactly one of: **APPROVED** | **APPROVED WITH CORRECTIONS** | **REJECTED** (explain if rejected).
### 2. Final Formula — Per Serving (${SERVING_LABEL})
| Ingredient | Amount | Form/Grade | %DV | Status |
|---|---|---|---|---|
Status = "unchanged" or "CORRECTED". Apply every correction the compliance report requires for THIS formula — pay special attention to emerging-bet ingredients that may lack established safety margin.
### 3. Corrections Applied
One row per change, or "None required."

## RECOMMENDED BLEND — SIGN-OFF (canonical — this is what ships)
### 1. Verdict
One line, exactly one of: **APPROVED** | **APPROVED WITH CORRECTIONS** | **REJECTED** (explain if rejected).
### 2. Final Formula — Per Serving (${SERVING_LABEL})
The complete corrected formula table: | Ingredient | Amount | Form/Grade | %DV | Status |. State the total fill/serving weight and confirm it is physically manufacturable in this format.
### 3. Corrections Applied
One row per change: what changed, from → to, WHY (cite the exact compliance finding / NIH UL / DSHEA rule). If none: "None required."

## APPROVED LABEL CLAIMS (Recommended Blend only — this is the formula that ships)
The final list of structure/function claims that survive DSHEA review, each with its substantiation source. Then a short DO-NOT-USE list of claims the compliance report killed.

## GO-TO-FACTORY NOTE (Recommended Blend only)
5-8 sentences for the manufacturer: what this product is, the non-negotiable specs (doses, forms, fill weight, testing requirements), and the one thing most likely to go wrong in production.

## THREE-FORMULA COMPARATIVE NOTE
2-3 sentences: do the three verdicts agree or diverge, and what does that tell DOVIVE about which formula(s) are safest to greenlight right now.

Be decisive and specific. Plain language. Every number must trace to the inputs above.`;
}

async function run() {
  console.log(`\n══════════════════════════════════════════════════════════════`);
  console.log(`P13: FINAL FORMULA SIGN-OFF — "${KEYWORD}"`);
  console.log(`══════════════════════════════════════════════════════════════`);

  const cat = await resolveCategory(DASH, KEYWORD);
  console.log(`  → Resolved category (${cat.method}): "${cat.name}" (${cat.id})`);
  _categoryId = cat.id;

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

  const usedTriFormula = !!(ing.formula_variants && real(ing.formula_variants.recommended));
  const prompt = buildPrompt(ing, KEYWORD);
  console.log(`Prompt: ${Math.round(prompt.length / 1000)}k chars (${usedTriFormula ? 'tri-formula' : 'legacy single-formula'} sign-off)`);
  console.log(`Calling ${VALIDATION_MODEL} via OpenRouter (chief-formulator sign-off)...`);
  const review = await callOpus(prompt, 64000);
  if (!review) throw new Error('Sign-off came back empty after retry.');

  // 2026-09-03: per-formula verdict parsing when P9 produced three
  // formulas — a legacy/older brief without formula_variants keeps the
  // EXACT single-verdict parse it always had (no `per_formula` field at
  // all), so nothing about how an old brief renders changes.
  let verdict, perFormula = null, comparativeNote = null;
  if (usedTriFormula) {
    const provenBlock = extractSignoffBlock(review, 'PROVEN', ['EDGE', 'RECOMMENDED BLEND', 'APPROVED LABEL CLAIMS']);
    const edgeBlock = extractSignoffBlock(review, 'EDGE', ['RECOMMENDED BLEND', 'APPROVED LABEL CLAIMS']);
    const blendBlock = extractSignoffBlock(review, 'RECOMMENDED BLEND', ['APPROVED LABEL CLAIMS']);
    perFormula = {
      proven: { verdict: parseBlockVerdict(provenBlock), review: provenBlock },
      edge: { verdict: parseBlockVerdict(edgeBlock), review: edgeBlock },
      recommended: { verdict: parseBlockVerdict(blendBlock), review: blendBlock },
    };
    // Top-level verdict/opus_review stay backward-compatible: they resolve
    // to the RECOMMENDED BLEND (canonical formula) so every existing
    // downstream reader of final_signoff.verdict keeps working unchanged.
    verdict = perFormula.recommended.verdict;
    comparativeNote = extractSignoffBlock(review, 'THREE-FORMULA COMPARATIVE NOTE', []);
    console.log(`Verdicts — Proven: ${perFormula.proven.verdict} | Edge: ${perFormula.edge.verdict} | Recommended (canonical): ${perFormula.recommended.verdict} | Review: ${Math.round(review.length / 1000)}k chars`);
  } else {
    const verdictMatch = review.match(/\b(APPROVED WITH CORRECTIONS|APPROVED|REJECTED)\b/);
    verdict = verdictMatch ? verdictMatch[1] : 'UNKNOWN';
    console.log(`Verdict: ${verdict} | Review: ${Math.round(review.length / 1000)}k chars`);
  }

  const updated = {
    ...ing,
    final_signoff: {
      opus_review: review,
      verdict,
      corrections_applied: verdict === 'APPROVED WITH CORRECTIONS',
      generated_at: new Date().toISOString(),
      model: VALIDATION_MODEL,
      // Additive-only fields (null on legacy/single-formula runs) — the
      // tri-formula UI reads these; every existing consumer of the four
      // fields above is untouched.
      ...(perFormula ? { per_formula: perFormula, comparative_note: comparativeNote } : {}),
    },
  };
  const { error } = await DASH.from('formula_briefs').update({ ingredients: updated }).eq('id', fb.id);
  if (error) throw new Error(`Save failed: ${error.message}`);
  console.log(`✅ Saved to formula_briefs.ingredients.final_signoff`);
}

run().catch((e) => { console.error(`❌ P13 failed: ${e.message}`); process.exit(1); });
