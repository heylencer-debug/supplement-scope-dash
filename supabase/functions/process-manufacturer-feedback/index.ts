import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

async function callClaude(messages: Array<{ role: string; content: unknown }>, maxTokens = 10000): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://dovive.com",
    },
    body: JSON.stringify({
      model: "anthropic/claude-sonnet-4-6",
      max_tokens: maxTokens,
      messages,
    }),
  });
  const j = await res.json();
  if (j.error) throw new Error(`Claude error: ${j.error.message}`);
  return j.choices?.[0]?.message?.content || "";
}

function buildEvaluationPrompt(keyword: string, currentFormula: string, feedbackText: string): string {
  return `You are a senior supplement formulator and scientific advisor for DOVIVE brand.

A manufacturer has submitted feedback on our current formula brief for **${keyword}**.
Your job is to evaluate each point of feedback objectively and decide:
- **ACCEPTED**: The change improves the formula (better clinical outcome, manufacturability, cost, or safety)
- **PARTIALLY ACCEPTED**: Some points are valid, others are not — apply the valid ones, push back on the rest
- **QUESTIONED**: The change needs justification — ask a specific, evidence-based question back to the manufacturer
- **REJECTED**: The change compromises clinical quality, safety, or lean formula principles — explain why with evidence

## CURRENT ACTIVE FORMULA BRIEF
${currentFormula}

---

## MANUFACTURER FEEDBACK
${feedbackText}

---

## YOUR EVALUATION RULES

1. **Clinical quality is non-negotiable** — do not accept changes that reduce doses below clinical minimums or swap bioavailable forms for inferior ones unless there is a hard manufacturing constraint
2. **Lean formula principle** — do not accept adding ingredients without clinical justification
3. **Manufacturing constraints are valid reasons to change** — if the manufacturer flags a real constraint (active load, heat stability, pH issue, sourcing problem), accept it and find the best clinical alternative
4. **Cost reduction is valid IF it doesn't compromise efficacy** — switching to a less expensive but equally bioavailable form is acceptable; switching to an inferior form to cut cost is not
5. **Be specific** — when questioning or rejecting, cite the clinical reason, the study, or the manufacturing principle. Do not give vague pushback.
6. **Format preservation is mandatory** — if changes are accepted, the updated formula MUST use the EXACT same markdown structure, heading hierarchy, table formats, section ordering, and layout as the current formula brief. Do NOT reorganize, rename sections, merge tables, or change the document structure. Only modify content affected by accepted changes.

---

## YOUR DELIVERABLE

Respond in this exact structure. Be CONCISE — max 2-3 sentences per reasoning cell. No essays.

## OVERALL VERDICT
[ACCEPTED / PARTIALLY ACCEPTED / QUESTIONED / REJECTED]

[Write 2-3 sentences summarizing the overall evaluation. Keep it brief.]

## FEEDBACK EVALUATION
| # | Feedback Point | Verdict | Reasoning |
|---|---------------|---------|-----------|
[One row per feedback point. Verdict: ACCEPTED/QUESTIONED/REJECTED. Reasoning MUST be 1-3 sentences max — cite the key clinical/manufacturing fact, not a paragraph. Be direct.]

## MANUFACTURER REPLY
[Write a professional, ready-to-send reply to the manufacturer. First person ("We/I"), respectful and collaborative. Cover:
- Thank them briefly
- Which changes accepted and why (1 line each)
- Questioned points: ask ONE clear follow-up question each
- Rejected points: give the key reason in 1-2 sentences
- End with next-step statement
Keep the entire reply under 300 words.]

## CHANGE SUMMARY
[One sentence for the version history label.]`;
}

async function processInBackground(feedbackId: string) {
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

  try {
    // Load the feedback row
    const { data: fb, error: fbErr } = await supabase
      .from("manufacturer_feedback")
      .select("*")
      .eq("id", feedbackId)
      .single();

    if (fbErr || !fb) {
      console.error("Feedback not found:", feedbackId);
      return;
    }

    // Mark as processing
    await supabase
      .from("manufacturer_feedback")
      .update({ status: "processing" })
      .eq("id", feedbackId);

    // Load current active formula brief
    const { data: activeVersion } = await supabase
      .from("formula_brief_versions")
      .select("*")
      .eq("category_id", fb.category_id)
      .eq("is_active", true)
      .maybeSingle();

    let currentFormula: string | null = null;
    let parentVersionId: string | null = null;

    if (activeVersion) {
      currentFormula = activeVersion.formula_brief_content;
      parentVersionId = activeVersion.id;
    } else {
      const { data: briefRow } = await supabase
        .from("formula_briefs")
        .select("ingredients")
        .eq("category_id", fb.category_id)
        .limit(1)
        .single();
      currentFormula =
        briefRow?.ingredients?.final_formula_brief ||
        briefRow?.ingredients?.adjusted_formula ||
        null;
    }

    if (!currentFormula) {
      await supabase
        .from("manufacturer_feedback")
        .update({ status: "pending", claude_response: "No formula brief found. Run P8 + P9 first." })
        .eq("id", feedbackId);
      return;
    }

    // Build feedback text — extract from images if present
    let fullFeedbackText = fb.feedback_text || "";
    if (fb.image_urls?.length > 0) {
      const imageContent = [
        {
          type: "text",
          text: `Extract all text and content from these manufacturer feedback images for a supplement formula.
Transcribe everything visible: ingredient names, doses, notes, comments, markups, diagrams, tables.
Format clearly with each distinct point on a new line.`,
        },
        ...fb.image_urls.map((url: string) => ({
          type: "image_url",
          image_url: { url },
        })),
      ];
      try {
        const extractedText = await callClaude([{ role: "user", content: imageContent }], 4000);
        fullFeedbackText = [fullFeedbackText, "\n\n[FROM IMAGES]\n" + extractedText].filter(Boolean).join("\n");
      } catch (e) {
        console.error("Image extraction failed:", e);
      }
    }

    if (!fullFeedbackText.trim()) {
      await supabase
        .from("manufacturer_feedback")
        .update({ status: "dismissed" })
        .eq("id", feedbackId);
      return;
    }

    // Evaluate with Claude
    const prompt = buildEvaluationPrompt(fb.keyword, currentFormula, fullFeedbackText);
    const evaluation = await callClaude([{ role: "user", content: prompt }], 10000);

    // Parse verdict
    const verdictMatch = evaluation.match(
      /##\s*OVERALL VERDICT\s*\n+\[?(ACCEPTED|PARTIALLY ACCEPTED|QUESTIONED|REJECTED)\]?/i
    );
    const verdictRaw = verdictMatch?.[1] || "questioned";
    const verdict = verdictRaw.toLowerCase().replace(" ", "_") as
      | "accepted"
      | "partially_accepted"
      | "questioned"
      | "rejected";

    // Parse updated formula
    const updatedFormulaMatch = evaluation.match(
      /##\s*UPDATED FORMULA\s*\n+([\s\S]*?)(?=\n##\s*COUNTER-ARGUMENTS|$)/i
    );
    const updatedFormula = updatedFormulaMatch?.[1]?.trim() || null;
    const hasChanges = updatedFormula && !updatedFormula.startsWith("No changes applied");

    // Parse change summary
    const changeSummaryMatch = evaluation.match(/##\s*CHANGE SUMMARY\s*\n+([\s\S]*?)(?=\n##|$)/i);
    const changeSummary =
      changeSummaryMatch?.[1]?.trim() || `Manufacturer feedback review — ${verdict}`;

    // Create new formula version if changes accepted
    let newVersionId: string | null = null;
    if (hasChanges && (verdict === "accepted" || verdict === "partially_accepted")) {
      await supabase
        .from("formula_brief_versions")
        .update({ is_active: false })
        .eq("category_id", fb.category_id);

      const { data: versions } = await supabase
        .from("formula_brief_versions")
        .select("version_number")
        .eq("category_id", fb.category_id)
        .order("version_number", { ascending: false })
        .limit(1);

      const nextVersion = versions?.[0]?.version_number ? versions[0].version_number + 1 : 1;

      const { data: newVersion } = await supabase
        .from("formula_brief_versions")
        .insert({
          category_id: fb.category_id,
          version_number: nextVersion,
          formula_brief_content: updatedFormula,
          change_summary: `[MFR FEEDBACK] ${changeSummary}`,
          parent_version_id: parentVersionId,
          is_active: true,
        })
        .select()
        .single();

      newVersionId = newVersion?.id || null;
    }

    // Save verdict back to feedback row
    await supabase
      .from("manufacturer_feedback")
      .update({
        status: "reviewed",
        reviewed_at: new Date().toISOString(),
        claude_verdict: verdict,
        claude_response: evaluation,
        resulting_version_id: newVersionId,
      })
      .eq("id", feedbackId);

    console.log(`Feedback ${feedbackId} processed: ${verdict}`);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error(`Error processing feedback ${feedbackId}:`, message);

    const supabaseErr = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    await supabaseErr
      .from("manufacturer_feedback")
      .update({ status: "pending", claude_response: `Error: ${message}` })
      .eq("id", feedbackId);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { feedbackId } = await req.json();

    if (!feedbackId) {
      return new Response(JSON.stringify({ error: "feedbackId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!OPENROUTER_API_KEY) {
      return new Response(JSON.stringify({ error: "OpenRouter API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use background task pattern to avoid timeout
    // @ts-ignore - EdgeRuntime is available in Supabase edge functions
    EdgeRuntime.waitUntil(processInBackground(feedbackId));

    return new Response(
      JSON.stringify({ success: true, status: "processing" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
