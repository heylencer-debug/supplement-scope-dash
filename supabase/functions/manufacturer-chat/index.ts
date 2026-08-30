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
const REVISION_MODEL = "anthropic/claude-opus-5";

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

// No-truncation policy (matches the scout pipeline): 64k budget — the model
// max — and when finish_reason=length with real content, the partial answer
// becomes assistant context and generation CONTINUES exactly where it
// stopped (max 2 extra segments). Never a blind retry, nothing discarded.
async function callClaudeOnce(
  messages: Array<{ role: string; content: unknown }>,
  maxTokens: number,
  model: string,
  reasoning: boolean = false,
): Promise<{ content: string; finishReason: string | null }> {
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
      reasoning: { enabled: reasoning },
      messages,
    }),
  });
  const j = await res.json();
  if (j.error) throw new Error(`Claude error: ${j.error.message || JSON.stringify(j.error)}`);
  return {
    content: j.choices?.[0]?.message?.content || "",
    finishReason: j.choices?.[0]?.finish_reason || null,
  };
}

async function callClaude(
  messages: Array<{ role: string; content: unknown }>,
  maxTokens = 64000,
  model = CHAT_MODEL,
  reasoning = false,
): Promise<string> {
  let { content, finishReason } = await callClaudeOnce(messages, maxTokens, model, reasoning);
  let segments = 0;
  while (finishReason === "length" && content.length > 500 && segments < 2) {
    segments++;
    const next = await callClaudeOnce(
      [
        ...messages,
        { role: "assistant", content },
        { role: "user", content: "Continue EXACTLY from where your previous message stopped, mid-sentence if necessary. Do not repeat anything, do not summarize, no preamble — output only the next characters." },
      ],
      maxTokens,
      model,
      reasoning,
    );
    if (!next.content) break;
    content += next.content;
    finishReason = next.finishReason;
  }
  return content;
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
    .select("ingredients, positioning, market_summary, target_customer")
    .eq("category_id", categoryId)
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  const ing = (briefRow?.ingredients || null) as Record<string, unknown> | null;
  const keyword = (ing?.keyword as string) || "this category";

  if (!briefRow || !ing) {
    return { text: "No formula brief has been generated for this category yet (run the pipeline through P8 first).", keyword, ingredients: null };
  }

  const finalSignoff = (ing.final_signoff || {}) as Record<string, unknown>;
  const competitiveBenchmarking = (ing.competitive_benchmarking || {}) as Record<string, unknown>;
  const fdaCompliance = (ing.fda_compliance || {}) as Record<string, unknown>;

  // UNTRUNCATED corpus (user directive 2026-08-30): the chat model is
  // Sonnet 5 with a 1M-token context — the ENTIRE workspace fits with
  // enormous headroom (all documents together run ~400-600k chars ≈
  // 100-150k tokens). The per-section caps below are pure safety fuses
  // against pathological rows, set far above every real document size
  // observed in production (largest: QA report ~150k chars).
  const FUSE = 400000;

  // Live product table — the workspace isn't only documents.
  let productsTable = "";
  try {
    const { data: prods } = await supabase
      .from("products")
      .select("brand, title, price, rating_value, rating_count, bsr_current, monthly_sales, monthly_revenue")
      .eq("category_id", categoryId)
      .not("bsr_current", "is", null)
      .order("bsr_current", { ascending: true })
      .limit(30);
    if (prods?.length) {
      productsTable = ["| # | Brand | Product | Price | Rating | BSR | Monthly sales | Monthly revenue |", "|---|---|---|---|---|---|---|---|"]
        .concat(prods.map((p: Record<string, unknown>, i: number) =>
          `| ${i + 1} | ${p.brand || "—"} | ${String(p.title || "").slice(0, 70)} | $${p.price ?? "—"} | ${p.rating_value ?? "—"} (${p.rating_count ?? "—"}) | #${p.bsr_current} | ${p.monthly_sales ?? "—"} | $${p.monthly_revenue ?? "—"} |`))
        .join("\n");
    }
  } catch (_e) { /* products table is a bonus — never fail the chat over it */ }

  // Formula version history — so the agent knows what has already changed.
  let versionsList = "";
  try {
    const { data: versions } = await supabase
      .from("formula_brief_versions")
      .select("version_number, change_summary, is_active, created_at")
      .eq("category_id", categoryId)
      .order("version_number", { ascending: false })
      .limit(20);
    if (versions?.length) {
      versionsList = versions.map((v: Record<string, unknown>) =>
        `- v${v.version_number}${v.is_active ? " (ACTIVE)" : ""} · ${String(v.change_summary || "").slice(0, 200)} · ${String(v.created_at).slice(0, 10)}`).join("\n");
    }
  } catch (_e) { /* optional */ }

  const sections = [
    ["P13 FINAL SIGN-OFF — chief formulator review, the CANONICAL formula (full document)", trunc(finalSignoff.opus_review, FUSE)],
    ["QA-ADJUSTED FORMULA (full)", trunc(ing.adjusted_formula, FUSE)],
    ["FINAL FORMULA BRIEF (full document)", trunc(ing.final_formula_brief, FUSE)],
    ["QA REPORT — P10 adjudication (full document)", trunc(ing.qa_report, FUSE)],
    ["QA SECONDARY OUTPUT (call 2 raw)", trunc(ing.call2_raw_output, FUSE)],
    ["COMPETITIVE BENCHMARKING — P11 draft (full)", trunc(competitiveBenchmarking.sonnet_draft, FUSE)],
    ["COMPETITIVE BENCHMARKING — P11 validation (full)", trunc(competitiveBenchmarking.opus_validation, FUSE)],
    ["FDA/DSHEA COMPLIANCE — P12 analysis (full)", trunc(fdaCompliance.opus_analysis, FUSE)],
    ["FDA/DSHEA COMPLIANCE — P12 cross-check (full)", trunc(fdaCompliance.sonnet_validation, FUSE)],
    ["MARKET INTELLIGENCE (full)", trunc(ing.market_intelligence, FUSE)],
    ["POSITIONING", trunc(briefRow?.positioning, FUSE)],
    ["MARKET SUMMARY", trunc(briefRow?.market_summary, FUSE)],
    ["TARGET CUSTOMER", trunc(briefRow?.target_customer, FUSE)],
    ["TOP 30 PRODUCTS BY BSR (live workspace data)", productsTable],
    ["FORMULA VERSION HISTORY", versionsList],
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
  return `You are the DOVIVE Formulator Agent — a senior supplement formulator and regulatory-savvy product strategist embedded in the DOVIVE "${keyword}" workspace. You speak with the DOVIVE founder (a non-native English speaker — plain, clear language always) and with contract manufacturers.

You have the COMPLETE workspace below, untruncated: the canonical signed-off formula, the QA adjudication, competitive benchmarking, FDA/DSHEA compliance review with its cross-check, market intelligence, live top-30 product data, and the formula version history. You are grounded ONLY in this corpus — never invent ingredients, doses, competitor data, studies, or claims that are not in it. If something isn't covered, say exactly that.

## ANSWER STYLE
- Lead with the direct answer in the first sentence; explanation after.
- Cite where the answer comes from ("per the QA report", "the P12 compliance review found...") so the reader can verify.
- Numbers must trace to the corpus verbatim — doses, prices, scores, competitor stats.
- Use a small table when comparing ingredients, doses, or competitors; otherwise short paragraphs. No filler, no hedging, no marketing fluff.
- When the corpus documents DISAGREE (e.g. a draft vs the sign-off), the precedence is: P13 sign-off > QA-adjusted formula > brief — say when you're resolving a conflict.
- If a question is about a competitor, use the live top-30 product table AND the benchmarking document together.

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
  body: {
    category_id: string;
    message: string;
    history_limit?: number;
    session_token?: string;
    // Manufacturer uploads: images (label photos) and PDFs (spec sheets,
    // COAs) as data URLs — forwarded to the model as multimodal parts.
    attachments?: Array<{ kind: "image" | "pdf"; filename?: string; data_url: string }>;
  },
): Promise<ChatMessageRow[]> {
  const { category_id, message } = body;
  const historyLimit = body.history_limit || 30;
  const sessionToken = body.session_token || "internal";
  const attachments = (body.attachments || []).filter((a) =>
    a?.data_url?.startsWith("data:") && a.data_url.length < 15_000_000
  ).slice(0, 5);

  if (!category_id || !message?.trim()) {
    throw new Error("category_id and message are required");
  }

  // 1. Store the incoming user message immediately (attachment names noted
  // in the stored text — the binary itself is not persisted).
  const attachNote = attachments.length
    ? `\n[attached: ${attachments.map((a) => a.filename || a.kind).join(", ")}]`
    : "";
  const userMessage = await insertMessage(supabase, {
    category_id,
    session_token: sessionToken,
    role: "user",
    content: message.trim() + attachNote,
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
  const conversation: Array<{ role: string; content: unknown }> = history.map((m) => ({
    role: m.role === "agent" ? "assistant" : "user",
    content: m.role === "user" ? m.content : m.role === "manufacturer" ? `[Manufacturer] ${m.content}` : m.content,
  }));

  // Current turn goes multimodal when attachments are present: images as
  // image_url parts, PDFs as OpenRouter file parts (Claude-native PDF).
  if (attachments.length && conversation.length) {
    const last = conversation[conversation.length - 1];
    last.content = [
      { type: "text", text: String(last.content || "") },
      ...attachments.map((a) =>
        a.kind === "pdf"
          ? { type: "file", file: { filename: a.filename || "document.pdf", file_data: a.data_url } }
          : { type: "image_url", image_url: { url: a.data_url } }
      ),
    ];
  }

  // Anthropic prompt caching via OpenRouter: the corpus is a large, stable
  // system prompt resent every turn — a cache_control breakpoint makes every
  // message after the first ~90% cheaper on input.
  const cachedSystem = {
    role: "system",
    content: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
  };

  const reply = await callClaude(
    [cachedSystem, ...conversation],
    64000,
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
  // Opus 5 with thinking enabled: the one call where deep reasoning earns
  // its latency. Full 64k budget + continuation (no truncation policy).
  const revisionPrompt = buildRevisionPrompt(keyword, currentFormula, complianceTemplate, row.change_card);
  let revisedFormula = await callClaude(
    [{ role: "user", content: revisionPrompt }],
    64000,
    REVISION_MODEL,
    true,
  );

  // VERIFY before anything is saved (user directive: verify changes before
  // making changes). A Sonnet 5 checker confirms the revision applied
  // EXACTLY the approved card — nothing more, nothing less, structure
  // intact. One corrective regeneration on FAIL; if still failing, the
  // version is NOT created and the card stays 'approved' (not 'applied').
  const buildVerifyPrompt = (doc: string) =>
    `You are a strict formula-revision auditor. Compare the APPROVED CHANGE CARD against the REVISED DOCUMENT.\n\n## APPROVED CHANGE CARD\n${JSON.stringify(row.change_card, null, 2)}\n\n## ORIGINAL DOCUMENT\n${currentFormula}\n\n## REVISED DOCUMENT\n${doc}\n\nAnswer with EXACTLY one line first: PASS or FAIL. Then bullet points: (a) was every change in the card applied precisely? (b) was ANYTHING else changed that the card did not authorize (doses, ingredients, claims, structure)? (c) is the document structure/sections intact? FAIL if any unauthorized change or missed change exists.`;
  let verification = await callClaude([{ role: "user", content: buildVerifyPrompt(revisedFormula) }], 8000, CHAT_MODEL);
  if (!/^\s*PASS/i.test(verification)) {
    const fix = await callClaude(
      [{ role: "user", content: `${revisionPrompt}\n\n## PREVIOUS ATTEMPT (REJECTED BY AUDIT)\n${revisedFormula}\n\n## AUDIT FINDINGS TO FIX\n${verification}\n\nRegenerate the complete revised document applying EXACTLY the approved card and fixing every audit finding.` }],
      64000,
      REVISION_MODEL,
      true,
    );
    if (fix) {
      revisedFormula = fix;
      verification = await callClaude([{ role: "user", content: buildVerifyPrompt(fix) }], 8000, CHAT_MODEL);
    }
  }
  if (!/^\s*PASS/i.test(verification)) {
    const failMsg = await insertMessage(supabase, {
      category_id,
      session_token: "agent",
      role: "agent",
      content: `I generated the revision but it did NOT pass the change-audit, so no new version was created. Audit findings:\n\n${verification.slice(0, 1500)}\n\nThe card remains approved — ask me to retry, or refine the request.`,
    });
    return [failMsg];
  }

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
