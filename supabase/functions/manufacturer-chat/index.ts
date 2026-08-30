import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.0";

/**
 * manufacturer-chat — real running conversation over a category's full
 * document corpus (formula brief, QA report, P11 benchmarking, P12
 * compliance, P13 sign-off, market intelligence). Additive to, and
 * completely independent of, the one-shot manufacturer_feedback +
 * process-manufacturer-feedback flow — that flow is untouched.
 *
 * Gateway/model reused verbatim from process-manufacturer-feedback/index.ts
 * (the closest existing sibling): OpenRouter, OPENROUTER_API_KEY secret,
 * same fetch shape. Model bumped to anthropic/claude-sonnet-5 — the slug
 * already live across the P8-P12 pipeline (scout/phase-living-brief.js
 * ANALYSIS_MODEL default) and P13 (VALIDATION_MODEL claude-opus-5 family).
 *
 * Two request shapes (both POST):
 *   1. { category_id, message, history_limit?, session_token? }
 *      → stores the user message, assembles the document corpus, calls the
 *        model, parses an optional ```change-card fenced block out of the
 *        reply, stores + returns the agent message(s).
 *   2. { action: "decide", category_id, message_id, decision }
 *      → decision "rejected": marks the card rejected, returns a short
 *        acknowledgement message.
 *      → decision "approved": marks the card approved, generates the
 *        revised formula document with a second model call, creates a NEW
 *        formula_brief_versions row using the EXACT mechanism/shape
 *        process-manufacturer-feedback uses (same table, same
 *        deactivate-then-insert-active pattern, change_summary tagged
 *        "[MFR CHAT] <card title>"), marks the card applied, and returns a
 *        confirmation message naming the new version number. NEVER writes
 *        to formula_briefs.ingredients.final_signoff or any formula_briefs
 *        column — revisions land only as new formula_brief_versions rows.
 *
 * Table `manufacturer_chat_messages` is created by
 * scout/migrations/006_manufacturer_chat.sql, which must be applied before
 * this function will work. If the table doesn't exist yet, every DB call
 * here fails (PostgREST reports this as PGRST205 "Could not find the table
 * ... in the schema cache", the Postgres-level equivalent of 42P01
 * "relation does not exist") — normalized to `code: "TABLE_MISSING"` in the
 * JSON body (HTTP 200, not 500) so the frontend can show a clean "migration
 * pending" panel instead of a raw crash.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const CHAT_MODEL = "anthropic/claude-sonnet-5";
const REVISION_MODEL = "anthropic/claude-sonnet-5";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ChangeCardChange {
  target: string;
  from: string;
  to: string;
  reason: string;
}

interface ChangeCard {
  title: string;
  rationale: string;
  changes: ChangeCardChange[];
  impact: string;
  risk_level: "low" | "medium" | "high";
}

interface ChatMessageRow {
  id: string;
  category_id: string;
  session_token: string | null;
  role: "user" | "manufacturer" | "agent";
  content: string | null;
  change_card: ChangeCard | null;
  card_status: "proposed" | "approved" | "rejected" | "applied" | null;
  created_at: string;
}

// ─── OpenRouter call (verbatim gateway/shape from process-manufacturer-feedback) ──

async function callClaude(
  messages: Array<{ role: string; content: unknown }>,
  maxTokens = 4000,
  model = CHAT_MODEL,
): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://dovive.com",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages,
    }),
  });
  const j = await res.json();
  if (j.error) throw new Error(`Claude error: ${j.error.message || JSON.stringify(j.error)}`);
  return j.choices?.[0]?.message?.content || "";
}

// ─── Corpus assembly ────────────────────────────────────────────────────────

function trunc(value: unknown, maxChars: number): string {
  if (value === null || value === undefined) return "";
  const str = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  if (!str.trim()) return "";
  return str.length > maxChars ? str.slice(0, maxChars) + "\n...[truncated]" : str;
}

// Same fallback logic as process-manufacturer-feedback's
// getComplianceTemplateFromIngredients — the P12/QA-adjusted formula is the
// most-authoritative "current formula" text when no chat/feedback version
// has been promoted to active yet.
function getComplianceTemplate(ingredients: Record<string, unknown> | null): string | null {
  if (!ingredients) return null;
  const candidates = [
    ingredients.final_formula_brief,
    ingredients.adjusted_formula,
    ingredients.compliance_formula,
    ingredients.final_pdf_version,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

interface Corpus {
  text: string;
  keyword: string;
  ingredients: Record<string, unknown> | null;
}

async function loadCorpus(supabase: ReturnType<typeof createClient>, categoryId: string): Promise<Corpus> {
  const { data: briefRow, error } = await supabase
    .from("formula_briefs")
    .select("ingredients, positioning, market_summary, target_customer, keyword")
    .eq("category_id", categoryId)
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  const ing = (briefRow?.ingredients || null) as Record<string, unknown> | null;
  const keyword = (briefRow as Record<string, unknown> | null)?.keyword as string || (ing?.keyword as string) || "this category";

  if (!briefRow || !ing) {
    return { text: "No formula brief has been generated for this category yet (run the pipeline through P8 first).", keyword, ingredients: null };
  }

  const finalSignoff = (ing.final_signoff || {}) as Record<string, unknown>;
  const competitiveBenchmarking = (ing.competitive_benchmarking || {}) as Record<string, unknown>;
  const fdaCompliance = (ing.fda_compliance || {}) as Record<string, unknown>;

  const sections = [
    ["P13 FINAL SIGN-OFF (chief formulator review — locked/canonical)", trunc(finalSignoff.opus_review, 8000)],
    ["QA-ADJUSTED FORMULA (current active ingredient list)", trunc(ing.adjusted_formula, 6000)],
    ["FINAL FORMULA BRIEF (full compliance-formatted document)", trunc(ing.final_formula_brief, 20000)],
    ["QA REPORT EXCERPT (P9 adjudication)", trunc(ing.qa_report, 15000)],
    ["COMPETITIVE BENCHMARKING EXCERPT (P10/P11)", trunc(competitiveBenchmarking.opus_validation || competitiveBenchmarking.sonnet_draft, 12000)],
    ["FDA/DSHEA COMPLIANCE EXCERPT (P12)", trunc(fdaCompliance.opus_analysis, 12000)],
    ["MARKET INTELLIGENCE EXCERPT", trunc(ing.market_intelligence, 8000)],
    ["POSITIONING", trunc(briefRow?.positioning, 1000)],
    ["MARKET SUMMARY", trunc(briefRow?.market_summary, 2000)],
  ].filter(([, body]) => body && body.trim());

  const text = sections.map(([label, body]) => `## ${label}\n${body}`).join("\n\n---\n\n");

  return { text, keyword, ingredients: ing };
}

// ─── Change-card parsing ────────────────────────────────────────────────────

function parseChangeCard(reply: string): { prose: string; card: ChangeCard | null } {
  const match = reply.match(/```change-card\s*\n([\s\S]*?)\n```/i);
  if (!match) return { prose: reply.trim(), card: null };

  const prose = (reply.slice(0, match.index) + reply.slice((match.index || 0) + match[0].length)).trim();

  try {
    const parsed = JSON.parse(match[1].trim());
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.changes)) {
      return { prose, card: null };
    }
    const card: ChangeCard = {
      title: String(parsed.title || "Proposed formula change"),
      rationale: String(parsed.rationale || ""),
      changes: parsed.changes.map((c: Record<string, unknown>) => ({
        target: String(c.target || ""),
        from: String(c.from || ""),
        to: String(c.to || ""),
        reason: String(c.reason || ""),
      })),
      impact: String(parsed.impact || ""),
      risk_level: (["low", "medium", "high"].includes(parsed.risk_level) ? parsed.risk_level : "medium") as ChangeCard["risk_level"],
    };
    return { prose, card };
  } catch {
    return { prose, card: null };
  }
}

// ─── System prompt ──────────────────────────────────────────────────────────

function buildSystemPrompt(keyword: string, corpus: string): string {
  return `You are the DOVIVE Manufacturer Liaison Agent — an expert supplement formulation liaison speaking with the DOVIVE team and its contract manufacturer about the "${keyword}" formula.

You are grounded ONLY in the DOCUMENT CORPUS below — the category's real pipeline research, QA adjudication, competitive benchmarking, FDA/DSHEA compliance review, and final sign-off. Never invent ingredients, doses, competitor data, or claims that are not in the corpus. If something isn't covered, say so plainly instead of guessing.

## DOCUMENT CORPUS

${corpus || "(No corpus data available for this category yet.)"}

## NON-NEGOTIABLE FORMULA PRINCIPLES (never violate these when discussing or proposing changes)
- Lean formula: 8–12 clinically dosed actives, not 14+ diluted ingredients
- Bioavailable forms only: chelated/methylated over inorganic/synthetic
- Never suggest a dose below the clinical minimum studied dose — no marketing inflation
- Solve manufacturer pain points (heat stability, flow, cost, sourcing) via excipients/forms, not by adding more actives
- The P12/P13 compliance structure (section order, heading hierarchy, flavor/variant lineup) is the locked source of truth for any revised document

## CRITICAL — you never silently apply a change
When the user asks for, or clearly implies, a change to the formula (swap an ingredient, adjust a dose, change a form, add or remove something), do NOT describe it as already done. Instead:
1. Reply with 1-3 sentences of plain conversational context.
2. Then append EXACTLY ONE fenced block, and nothing after it:

\`\`\`change-card
{"title": "short title", "rationale": "why this change makes sense", "changes": [{"target": "ingredient or section", "from": "current state", "to": "proposed state", "reason": "specific reason"}], "impact": "what this changes for cost/manufacturing/clinical outcome", "risk_level": "low"}
\`\`\`

The change card is a PROPOSAL ONLY — a human must approve it before anything is applied to the formula. Never emit a change-card unless a change is genuinely being requested or implied. Plain questions (status, rationale, "why did we choose X", ingredient lookups) get a plain-text answer with no change-card.`;
}

function buildRevisionPrompt(keyword: string, currentFormula: string, complianceTemplate: string, card: ChangeCard): string {
  return `You are the DOVIVE chief formulator. A change to the "${keyword}" formula has just been APPROVED by the DOVIVE team. Apply it and output the complete revised formula document.

## CURRENT FORMULA DOCUMENT
${currentFormula}

---

## LOCKED P12 COMPLIANCE STRUCTURE (format/section-order/flavor source of truth — preserve exactly)
${complianceTemplate || currentFormula}

---

## APPROVED CHANGE CARD
Title: ${card.title}
Rationale: ${card.rationale}
Impact: ${card.impact}
Risk: ${card.risk_level}

Changes to apply:
${card.changes.map((c, i) => `${i + 1}. ${c.target}: "${c.from}" → "${c.to}" — ${c.reason}`).join("\n")}

## YOUR TASK
Apply ONLY the changes listed above. Keep everything else — every other ingredient, dose, section, and the exact P12 structure/heading hierarchy/flavor lineup — unchanged. Do not add commentary, headers like "Here is the revised formula", or anything outside the document itself. Output ONLY the complete revised formula document, ready to save as the new active version.`;
}

// ─── DB helpers ──────────────────────────────────────────────────────────────

async function insertMessage(
  supabase: ReturnType<typeof createClient>,
  row: Partial<ChatMessageRow> & { category_id: string; role: string },
): Promise<ChatMessageRow> {
  const { data, error } = await supabase
    .from("manufacturer_chat_messages")
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as ChatMessageRow;
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async function handleMessage(
  supabase: ReturnType<typeof createClient>,
  body: { category_id: string; message: string; history_limit?: number; session_token?: string },
): Promise<ChatMessageRow[]> {
  const { category_id, message } = body;
  const historyLimit = body.history_limit || 30;
  const sessionToken = body.session_token || "internal";

  if (!category_id || !message?.trim()) {
    throw new Error("category_id and message are required");
  }

  // 1. Store the incoming user message immediately.
  const userMessage = await insertMessage(supabase, {
    category_id,
    session_token: sessionToken,
    role: "user",
    content: message.trim(),
  });

  // 2. Load recent history (including the message we just inserted).
  const { data: historyRows, error: historyErr } = await supabase
    .from("manufacturer_chat_messages")
    .select("*")
    .eq("category_id", category_id)
    .order("created_at", { ascending: false })
    .limit(historyLimit);
  if (historyErr) throw historyErr;

  const history = ((historyRows || []) as unknown as ChatMessageRow[]).slice().reverse();

  // 3. Assemble the document corpus.
  const corpus = await loadCorpus(supabase, category_id);

  // 4. Build the conversation for the model.
  const systemPrompt = buildSystemPrompt(corpus.keyword, corpus.text);
  const conversation = history.map((m) => ({
    role: m.role === "agent" ? "assistant" : "user",
    content: m.role === "user" ? m.content : m.role === "manufacturer" ? `[Manufacturer] ${m.content}` : m.content,
  }));

  const reply = await callClaude(
    [{ role: "system", content: systemPrompt }, ...conversation],
    4000,
    CHAT_MODEL,
  );

  const { prose, card } = parseChangeCard(reply);

  // 5. Store + return the agent's reply.
  const agentMessage = await insertMessage(supabase, {
    category_id,
    session_token: "agent",
    role: "agent",
    content: prose || "(no response)",
    change_card: card,
    card_status: card ? "proposed" : null,
  });

  return [userMessage, agentMessage];
}

async function handleDecide(
  supabase: ReturnType<typeof createClient>,
  body: { category_id: string; message_id: string; decision: "approved" | "rejected" },
): Promise<ChatMessageRow[]> {
  const { category_id, message_id, decision } = body;
  if (!category_id || !message_id || !["approved", "rejected"].includes(decision)) {
    throw new Error("category_id, message_id, and a valid decision are required");
  }

  const { data: cardMessage, error: fetchErr } = await supabase
    .from("manufacturer_chat_messages")
    .select("*")
    .eq("id", message_id)
    .single();
  if (fetchErr) throw fetchErr;
  const row = cardMessage as unknown as ChatMessageRow;
  if (!row.change_card) throw new Error("This message has no change card to decide on");

  if (decision === "rejected") {
    const { error: updErr } = await supabase
      .from("manufacturer_chat_messages")
      .update({ card_status: "rejected" })
      .eq("id", message_id);
    if (updErr) throw updErr;

    const ack = await insertMessage(supabase, {
      category_id,
      session_token: "agent",
      role: "agent",
      content: `Understood — "${row.change_card.title}" was rejected. I'll leave the current formula as-is.`,
    });
    return [ack];
  }

  // decision === "approved"
  const { error: approveErr } = await supabase
    .from("manufacturer_chat_messages")
    .update({ card_status: "approved" })
    .eq("id", message_id);
  if (approveErr) throw approveErr;

  // Load the canonical current formula EXACTLY like process-manufacturer-feedback:
  // prefer the active formula_brief_versions row, fall back to the P12/QA
  // compliance template from formula_briefs.ingredients.
  const { data: activeVersion } = await supabase
    .from("formula_brief_versions")
    .select("*")
    .eq("category_id", category_id)
    .eq("is_active", true)
    .maybeSingle();

  const { data: briefRow } = await supabase
    .from("formula_briefs")
    .select("ingredients")
    .eq("category_id", category_id)
    .limit(1)
    .maybeSingle();

  const ingredients = (briefRow?.ingredients || null) as Record<string, unknown> | null;
  const complianceTemplate = getComplianceTemplate(ingredients) || "";
  const keyword = (ingredients?.keyword as string) || "this category";

  let currentFormula: string | null = null;
  let parentVersionId: string | null = null;
  if (activeVersion) {
    currentFormula = (activeVersion as Record<string, unknown>).formula_brief_content as string;
    parentVersionId = (activeVersion as Record<string, unknown>).id as string;
  } else {
    currentFormula = complianceTemplate || null;
  }

  if (!currentFormula) {
    const errMsg = await insertMessage(supabase, {
      category_id,
      session_token: "agent",
      role: "agent",
      content: "I couldn't find a formula document to revise (no active version and no P9/P12 formula brief yet). Run the pipeline through P8/P9 first.",
    });
    return [errMsg];
  }

  // Second model call — apply the approved card to the canonical formula.
  const revisionPrompt = buildRevisionPrompt(keyword, currentFormula, complianceTemplate, row.change_card);
  const revisedFormula = await callClaude(
    [{ role: "user", content: revisionPrompt }],
    16000,
    REVISION_MODEL,
  );

  // Create the new formula_brief_versions row — SAME mechanism/shape as
  // process-manufacturer-feedback: deactivate all, insert new active version.
  await supabase
    .from("formula_brief_versions")
    .update({ is_active: false })
    .eq("category_id", category_id);

  const { data: versions } = await supabase
    .from("formula_brief_versions")
    .select("version_number")
    .eq("category_id", category_id)
    .order("version_number", { ascending: false })
    .limit(1);
  const currentMaxVersion = versions?.[0] ? ((versions[0] as Record<string, unknown>).version_number as number) : 0;
  const nextVersion = currentMaxVersion + 1;

  const { data: newVersion, error: insertVersionErr } = await supabase
    .from("formula_brief_versions")
    .insert({
      category_id,
      version_number: nextVersion,
      formula_brief_content: revisedFormula.trim(),
      change_summary: `[MFR CHAT] ${row.change_card.title}`,
      parent_version_id: parentVersionId,
      created_from_message_id: message_id,
      is_active: true,
    })
    .select()
    .single();
  if (insertVersionErr) throw insertVersionErr;

  const { error: appliedErr } = await supabase
    .from("manufacturer_chat_messages")
    .update({ card_status: "applied" })
    .eq("id", message_id);
  if (appliedErr) throw appliedErr;

  const confirmMessage = await insertMessage(supabase, {
    category_id,
    session_token: "agent",
    role: "agent",
    content: `Applied — created Formula v${(newVersion as Record<string, unknown>).version_number} ("${row.change_card.title}"). It's now the active version.`,
  });

  return [confirmMessage];
}

// ─── Entry point ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!OPENROUTER_API_KEY) {
    return new Response(JSON.stringify({ error: "OpenRouter API key not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

  try {
    const body = await req.json();

    const messages = body?.action === "decide"
      ? await handleDecide(supabase, body)
      : await handleMessage(supabase, body);

    return new Response(JSON.stringify({ messages }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: unknown) {
    const err = e as { message?: string; code?: string };
    const message = err?.message || "Unknown error";
    // Migration 006 not applied yet → table missing. supabase-js goes
    // through PostgREST, which reports this as PGRST205 ("Could not find
    // the table ... in the schema cache"), not the raw Postgres 42P01
    // SQLSTATE — check for both plus a message-text fallback so this is
    // robust either way, and normalize to "TABLE_MISSING" for the frontend.
    const isTableMissing =
      err?.code === "42P01" ||
      err?.code === "PGRST205" ||
      message.includes("42P01") ||
      message.toLowerCase().includes("schema cache") ||
      message.toLowerCase().includes("does not exist");
    const code = isTableMissing ? "TABLE_MISSING" : err?.code;
    console.error("manufacturer-chat error:", message);
    return new Response(JSON.stringify({ error: message, code }), {
      status: isTableMissing ? 200 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
