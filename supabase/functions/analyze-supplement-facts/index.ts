import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ExtractedNutrient {
  name: string;
  amount: number | string | null;
  unit: string | null;
  daily_value: string | null;
}

interface ExtractionResult {
  serving_size: string | null;
  servings_per_container: number | null;
  nutrients: ExtractedNutrient[];
  proprietary_blends: Array<{
    name: string;
    total_amount: string | null;
    ingredients: string[];
  }>;
  other_ingredients: string | null;
  warnings: string | null;
  directions: string | null;
  confidence: "high" | "medium" | "low";
  extraction_notes: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { productId } = await req.json();
    
    if (!productId) {
      return new Response(
        JSON.stringify({ error: "productId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openrouterApiKey = Deno.env.get("OPENROUTER_API_KEY");

    if (!openrouterApiKey) {
      return new Response(
        JSON.stringify({ error: "OPENROUTER_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch product with images
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id, asin, title, brand, main_image_url, image_urls")
      .eq("id", productId)
      .single();

    if (productError || !product) {
      return new Response(
        JSON.stringify({ error: "Product not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Collect all images
    const allImages = [
      product.main_image_url,
      ...(product.image_urls ?? [])
    ].filter(Boolean) as string[];

    if (allImages.length === 0) {
      return new Response(
        JSON.stringify({ error: "No images available for this product" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[analyze-supplement-facts] Analyzing ${allImages.length} images for product ${product.asin}`);

    // Build image content for GPT-4o vision
    const imageContent = allImages.slice(0, 10).map((url) => ({
      type: "image_url" as const,
      image_url: { url, detail: "high" as const }
    }));

    const prompt = `You are a supplement facts panel extraction specialist. Analyze the provided product images and extract ALL information from the Supplement Facts / Nutrition Facts panel.

## YOUR MISSION:
Find the Supplement Facts or Nutrition Facts panel in these images and extract EVERY piece of data with complete accuracy.

## CRITICAL INSTRUCTIONS:
1. **Find the panel**: Look through ALL images for the Supplement Facts or Nutrition Facts panel
2. **Extract EXACT amounts**: For each nutrient, extract the EXACT numeric amount shown (e.g., "500" not just the unit)
3. **Include units**: mg, mcg, g, IU, etc.
4. **Daily Values**: Extract % Daily Value where shown
5. **Proprietary Blends**: If present, list the blend name, total amount, and all ingredients
6. **Be thorough**: Don't skip any nutrients, vitamins, minerals, or ingredients

## EXPECTED OUTPUT FORMAT:
- serving_size: The serving size as written (e.g., "2 Soft Chews")
- servings_per_container: Number of servings
- nutrients: Array with name, amount (NUMBER or string), unit, daily_value
- proprietary_blends: Array with name, total_amount, ingredients array
- other_ingredients: Full list of other/inactive ingredients
- warnings: Any warning statements
- directions: Usage directions if visible
- confidence: "high" if panel clearly visible, "medium" if partially visible, "low" if extracted from partial/unclear images
- extraction_notes: Any notes about the extraction quality

## IMPORTANT:
- If you can see "Vitamin D 25mcg (1000 IU)", extract as: { name: "Vitamin D", amount: "25", unit: "mcg", daily_value: "125%" }
- For blends like "Joint Support Complex 500mg", extract the total amount
- Extract ALL nutrients you can see, even if the panel is partially visible
- If amount is unclear but unit is visible, still include what you can see

Use the extract_supplement_facts tool to return your analysis.`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openrouterApiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://lovable.dev",
        "X-Title": "Supplement Facts Extraction"
      },
      body: JSON.stringify({
        model: "openai/gpt-4o",
        messages: [{ 
          role: "user", 
          content: [{ type: "text", text: prompt }, ...imageContent] 
        }],
        tools: [{
          type: "function",
          function: {
            name: "extract_supplement_facts",
            description: "Extract complete supplement facts panel data from product images",
            parameters: {
              type: "object",
              properties: {
                serving_size: { type: "string", nullable: true, description: "Serving size as written on label" },
                servings_per_container: { type: "number", nullable: true, description: "Number of servings per container" },
                nutrients: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string", description: "Nutrient name" },
                      amount: { 
                        oneOf: [{ type: "number" }, { type: "string" }],
                        nullable: true, 
                        description: "Numeric amount (e.g., 500, 1000, 25)" 
                      },
                      unit: { type: "string", nullable: true, description: "Unit (mg, mcg, g, IU, etc.)" },
                      daily_value: { type: "string", nullable: true, description: "% Daily Value" }
                    },
                    required: ["name"]
                  },
                  description: "All nutrients with their amounts"
                },
                proprietary_blends: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      total_amount: { type: "string", nullable: true },
                      ingredients: { type: "array", items: { type: "string" } }
                    },
                    required: ["name", "ingredients"]
                  }
                },
                other_ingredients: { type: "string", nullable: true },
                warnings: { type: "string", nullable: true },
                directions: { type: "string", nullable: true },
                confidence: { type: "string", enum: ["high", "medium", "low"] },
                extraction_notes: { type: "string", description: "Notes about extraction quality" }
              },
              required: ["nutrients", "confidence", "extraction_notes"]
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "extract_supplement_facts" } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[analyze-supplement-facts] API error: ${response.status}`, errorText);
      return new Response(
        JSON.stringify({ error: `AI API error: ${response.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall) {
      console.error("[analyze-supplement-facts] No tool call in response");
      return new Response(
        JSON.stringify({ error: "Failed to extract supplement facts" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result: ExtractionResult = JSON.parse(toolCall.function.arguments);
    console.log(`[analyze-supplement-facts] Extracted ${result.nutrients.length} nutrients with confidence: ${result.confidence}`);

    // Convert nutrients to the format used in all_nutrients
    const allNutrients = result.nutrients.map(n => ({
      name: n.name,
      amount: n.amount !== null ? String(n.amount) : null,
      unit: n.unit,
      daily_value: n.daily_value
    }));

    // Convert proprietary blends
    const proprietaryBlends = result.proprietary_blends?.map(b => ({
      name: b.name,
      total_amount: b.total_amount,
      ingredients: b.ingredients
    })) ?? [];

    // Update the product in the database
    const updateData: Record<string, unknown> = {
      all_nutrients: allNutrients,
      ocr_confidence: result.confidence,
      ocr_extracted: true,
      extraction_notes: result.extraction_notes,
      nutrients_count: allNutrients.length,
      updated_at: new Date().toISOString()
    };

    if (result.serving_size) updateData.serving_size = result.serving_size;
    if (result.servings_per_container) updateData.servings_per_container = result.servings_per_container;
    if (proprietaryBlends.length > 0) {
      updateData.proprietary_blends = proprietaryBlends;
      updateData.has_proprietary_blends = true;
    }
    if (result.other_ingredients) updateData.other_ingredients = result.other_ingredients;
    if (result.warnings) updateData.warnings = result.warnings;
    if (result.directions) updateData.directions = result.directions;

    const { error: updateError } = await supabase
      .from("products")
      .update(updateData)
      .eq("id", productId);

    if (updateError) {
      console.error("[analyze-supplement-facts] Update error:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to save extraction results" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[analyze-supplement-facts] Successfully updated product ${product.asin}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        nutrients_count: allNutrients.length,
        confidence: result.confidence,
        extraction_notes: result.extraction_notes
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[analyze-supplement-facts] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
