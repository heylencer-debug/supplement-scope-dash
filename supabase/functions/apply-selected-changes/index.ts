import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

async function callClaude(messages: Array<{ role: string; content: string }>, maxTokens = 12000): Promise<string> {
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

function getComplianceTemplateFromIngredients(ingredients: unknown): string | null {
  if (!ingredients || typeof ingredients !== "object") return null;

  const record = ingredients as Record<string, unknown>;
  const candidates = [
    record.final_formula_brief,
    record.adjusted_formula,
    record.compliance_formula,
    record.final_pdf_version,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

function extractTemplateFlavorBlock(content: string | null): string {
  if (!content) return "";

  const match =
    content.match(/###\s*Flavor[\s\S]*?(?=\n---\n\n###\s*Pricing|\n###\s*Pricing|$)/i) ??
    content.match(/###\s*Flavor[\s\S]*?(?=\n###\s*Pricing|$)/i);

  return match?.[0]?.trim() || "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { feedbackId, categoryId, keyword, selectedPoints } = await req.json();

    if (!feedbackId || !categoryId || !selectedPoints?.length) {
      return new Response(
        JSON.stringify({ error: "feedbackId, categoryId, and selectedPoints are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Get current active formula
    const { data: activeVersion } = await supabase
      .from("formula_brief_versions")
      .select("*")
      .eq("category_id", categoryId)
      .eq("is_active", true)
      .maybeSingle();

    let currentFormula: string | null = null;
    let parentVersionId: string | null = null;

    const { data: briefRow } = await supabase
      .from("formula_briefs")
      .select("ingredients")
      .eq("category_id", categoryId)
      .limit(1)
      .maybeSingle();

    const complianceTemplate = getComplianceTemplateFromIngredients(briefRow?.ingredients);
    const complianceFlavorBlock = extractTemplateFlavorBlock(complianceTemplate);

    if (activeVersion) {
      currentFormula = activeVersion.formula_brief_content;
      parentVersionId = activeVersion.id;
    } else {
      currentFormula = complianceTemplate;
    }

    if (!currentFormula) {
      return new Response(
        JSON.stringify({ error: "No formula brief found. Run formula generation first." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the original feedback's claude_response for context
    const { data: fb } = await supabase
      .from("manufacturer_feedback")
      .select("claude_response, feedback_text")
      .eq("id", feedbackId)
      .single();

    const prompt = `You are a senior supplement formulator for DOVIVE brand.

The user has reviewed manufacturer feedback for **${keyword}** and manually selected which changes to apply to the formula brief — even if our AI previously rejected some of them.

## CURRENT ACTIVE FORMULA CONTENT
${currentFormula}

---

## LOCKED P12 COMPLIANCE TEMPLATE (FORMAT + FLAVOR SOURCE OF TRUTH)
${complianceTemplate || currentFormula}

---

## LOCKED P12 FLAVOR / VARIANT REFERENCE
${complianceFlavorBlock || "No dedicated flavor block found in the compliance template."}

---

## ORIGINAL AI EVALUATION
${fb?.claude_response || "Not available"}

---

## USER-SELECTED CHANGES TO APPLY
The user has selected these specific manufacturer feedback points to apply:
${selectedPoints.map((p: string, i: number) => `${i + 1}. ${p}`).join("\n")}

---

## YOUR TASK
Apply ALL of the selected changes to the formula brief. The user has overridden the AI's verdict — respect their decision.

1. Use the LOCKED P12 COMPLIANCE TEMPLATE as the exact source of truth for section order, heading hierarchy, markdown layout, table structure, and flavor / variant coverage
2. Carry forward the already-accepted business content from the CURRENT ACTIVE FORMULA CONTENT
3. Apply each selected change to the relevant content
4. Mark each newly changed item with [UPDATED] inline
5. If the current active formula drifted away from the P12 structure, restore the P12 structure in the output

**CRITICAL — RECOMMENDED FLAVORS ARE AUTHORITATIVE:**
- The recommended flavors and variant lineup from the P12 compliance template came from earlier market-analysis phases and MUST stay visible
- Preserve every flavor name and flavor option named anywhere in the P12 compliance template unless a selected change explicitly removes or replaces it
- Do NOT collapse the recommendation into a single currently selected flavor
- When selected changes are not flavor-related, keep the P12 flavor / variant coverage intact

**FORMAT RULES:**
- Keep the same heading levels and section order as P12
- Keep the same table column structure as P12
- Keep the same bullet point and numbering style as P12
- Do NOT add new sections or remove P12 sections unless a selected change explicitly requires it

Respond in this structure:

## UPDATED FORMULA BRIEF
[Complete updated formula brief using the exact P12 structure, carrying forward the active-version content, preserving the full P12 flavor lineup, and marking only the newly changed items with [UPDATED]]

## CHANGE SUMMARY
[One sentence describing what was changed]`;

    const result = await callClaude([{ role: "user", content: prompt }]);

    // Extract updated formula
    const formulaMatch = result.match(/##\s*UPDATED FORMULA BRIEF\s*\n+([\s\S]*?)(?=\n##\s*CHANGE SUMMARY|$)/i);
    const updatedFormula = formulaMatch?.[1]?.trim() || result;

    const summaryMatch = result.match(/##\s*CHANGE SUMMARY\s*\n+([\s\S]*?)$/i);
    const changeSummary = summaryMatch?.[1]?.trim() || `Applied ${selectedPoints.length} user-selected change(s)`;

    // Deactivate current versions
    await supabase
      .from("formula_brief_versions")
      .update({ is_active: false })
      .eq("category_id", categoryId);

    // Get next version number
    const { data: versions } = await supabase
      .from("formula_brief_versions")
      .select("version_number")
      .eq("category_id", categoryId)
      .order("version_number", { ascending: false })
      .limit(1);

    const nextVersion = versions?.[0]?.version_number ? versions[0].version_number + 1 : 1;

    // Create new version
    const { data: newVersion } = await supabase
      .from("formula_brief_versions")
      .insert({
        category_id: categoryId,
        version_number: nextVersion,
        formula_brief_content: updatedFormula,
        change_summary: `[USER OVERRIDE] ${changeSummary}`,
        parent_version_id: parentVersionId,
        is_active: true,
      })
      .select()
      .single();

    // Update feedback row with resulting version
    await supabase
      .from("manufacturer_feedback")
      .update({ resulting_version_id: newVersion?.id })
      .eq("id", feedbackId);

    return new Response(
      JSON.stringify({ success: true, versionId: newVersion?.id, versionNumber: nextVersion }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("apply-selected-changes error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
