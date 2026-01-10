import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { categoryId, formulaBriefContent, categoryName, versionId } = await req.json();

    if (!categoryId || !formulaBriefContent) {
      return new Response(
        JSON.stringify({ error: "categoryId and formulaBriefContent are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!OPENROUTER_API_KEY) {
      return new Response(
        JSON.stringify({ error: "OpenRouter API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Check if prompts already exist for this category/version
    let existingQuery = supabase
      .from("formula_prompts")
      .select("id")
      .eq("category_id", categoryId);

    if (versionId) {
      existingQuery = existingQuery.eq("formula_version_id", versionId);
    } else {
      existingQuery = existingQuery.is("formula_version_id", null);
    }

    const { data: existingPrompts } = await existingQuery;

    if (existingPrompts && existingPrompts.length > 0) {
      return new Response(
        JSON.stringify({ message: "Prompts already exist", promptCount: existingPrompts.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Analyze the formula to determine supplement type and generate tailored prompts
    const analysisPrompt = `Analyze this supplement formula brief and generate 2 tailored evaluation prompts.

FORMULA BRIEF:
${formulaBriefContent.slice(0, 8000)}

CATEGORY: ${categoryName || "Unknown"}

YOUR TASK:
1. Determine if this is a HUMAN supplement or PET supplement (look for mentions of dogs, cats, pets, animals vs. humans, adults, children)
2. Identify the product form (powder, capsule, tablet, gummy, liquid, chew, soft chew, etc.)
3. Identify 3-5 key active ingredients mentioned
4. Identify the primary health focus (joint health, energy, immunity, digestion, etc.)

Based on your analysis, generate exactly 2 prompts:

PROMPT 1 - OPTIMIZATION PROMPT:
Create a comprehensive formula optimization prompt that covers:
- Ingredient dosage optimization (what to increase, decrease, remove)
- Form-specific considerations (palatability for powders, bioavailability for capsules, etc.)
- For PETS: include flavor strategy, palatability ranking, animal-specific dosing
- For HUMANS: include bioavailability enhancement, timing recommendations
- Pack size and unit economics
- Final optimization recommendations

PROMPT 2 - CRITICAL EVALUATION PROMPT:
Select the MOST relevant critical evaluation from these options based on the formula:
- "Red Team Attack" - find every reason this product could fail (good for complex formulas)
- "Expert Reality Check" - would a doctor/vet/nutritionist recommend this? (good for health claims)
- "Cost-to-Impact Analysis" - identify ingredients hurting margins without delivering results (good for expensive formulas)
- "Long-Term Daily Use Test" - evaluate 6-12 month daily use effects (good for formulas with accumulating ingredients)
- "Customer Review Prediction" - predict likely 1-star, 3-star, 5-star reviews (good for consumer products)
- "Minimalist Challenge" - rebuild with max 5 ingredients (good for complex formulas)

Return your response as valid JSON with this exact structure:
{
  "supplementType": "human" | "pet",
  "productForm": "string",
  "keyIngredients": ["ingredient1", "ingredient2", "ingredient3"],
  "healthFocus": "string",
  "prompts": [
    {
      "type": "optimization",
      "title": "Formula Optimization Review",
      "shortLabel": "Optimize Formula",
      "icon": "flask",
      "content": "Full prompt text here..."
    },
    {
      "type": "critical",
      "title": "Critical Evaluation Title",
      "shortLabel": "Short Button Label (2-3 words)",
      "icon": "shield-alert" | "stethoscope" | "dollar-sign" | "clock" | "star" | "minimize-2",
      "content": "Full prompt text here..."
    }
  ]
}

Make the prompts specific to the actual formula - mention real ingredients, dosages, and concerns from the brief.`;

    console.log("[generate-formula-prompts] Calling OpenRouter API...");

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-pro-preview",
        messages: [
          {
            role: "system",
            content: "You are an expert supplement formulation consultant. Return only valid JSON without markdown code blocks.",
          },
          {
            role: "user",
            content: analysisPrompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[generate-formula-prompts] OpenRouter error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "Failed to generate prompts", details: errorText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return new Response(
        JSON.stringify({ error: "No content in AI response" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[generate-formula-prompts] Raw AI response:", content.slice(0, 500));

    // Parse the JSON response
    let parsedResponse;
    try {
      // Remove potential markdown code blocks
      const cleanedContent = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsedResponse = JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error("[generate-formula-prompts] JSON parse error:", parseError);
      return new Response(
        JSON.stringify({ error: "Failed to parse AI response as JSON", rawContent: content.slice(0, 1000) }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert prompts into database
    const promptsToInsert = parsedResponse.prompts.map((prompt: any, index: number) => ({
      category_id: categoryId,
      formula_version_id: versionId || null,
      prompt_type: prompt.type,
      title: prompt.title,
      short_label: prompt.shortLabel,
      prompt_content: prompt.content,
      icon: prompt.icon,
      display_order: index,
    }));

    const { data: insertedPrompts, error: insertError } = await supabase
      .from("formula_prompts")
      .insert(promptsToInsert)
      .select();

    if (insertError) {
      console.error("[generate-formula-prompts] Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to save prompts", details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[generate-formula-prompts] Successfully generated and saved prompts:", insertedPrompts?.length);

    return new Response(
      JSON.stringify({
        success: true,
        supplementType: parsedResponse.supplementType,
        productForm: parsedResponse.productForm,
        keyIngredients: parsedResponse.keyIngredients,
        healthFocus: parsedResponse.healthFocus,
        promptCount: insertedPrompts?.length || 0,
        prompts: insertedPrompts,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[generate-formula-prompts] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
