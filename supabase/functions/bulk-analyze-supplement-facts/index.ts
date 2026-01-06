import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const EdgeRuntime: {
  waitUntil: (promise: Promise<unknown>) => void;
};

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

async function analyzeProduct(
  supabase: any,
  openrouterApiKey: string,
  productId: string,
  imageUrls: string[]
): Promise<{ success: boolean; nutrients_count: number; error?: string }> {
  try {
    const imageContent = imageUrls.slice(0, 10).map((url) => ({
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

Use the extract_supplement_facts tool to return your analysis.`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openrouterApiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://lovable.dev",
        "X-Title": "Bulk Supplement Facts Extraction"
      },
      body: JSON.stringify({
        model: "google/gemini-3-pro-preview",
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
                serving_size: { type: "string", nullable: true },
                servings_per_container: { type: "number", nullable: true },
                nutrients: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      amount: { oneOf: [{ type: "number" }, { type: "string" }], nullable: true },
                      unit: { type: "string", nullable: true },
                      daily_value: { type: "string", nullable: true }
                    },
                    required: ["name"]
                  }
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
                extraction_notes: { type: "string" }
              },
              required: ["nutrients", "confidence", "extraction_notes"]
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "extract_supplement_facts" } }
      }),
    });

    if (!response.ok) {
      return { success: false, nutrients_count: 0, error: `API error: ${response.status}` };
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall) {
      return { success: false, nutrients_count: 0, error: "No tool call in response" };
    }

    const result: ExtractionResult = JSON.parse(toolCall.function.arguments);

    const allNutrients = result.nutrients.map(n => ({
      name: n.name,
      amount: n.amount !== null ? String(n.amount) : null,
      unit: n.unit,
      daily_value: n.daily_value
    }));

    const proprietaryBlends = result.proprietary_blends?.map(b => ({
      name: b.name,
      total_amount: b.total_amount,
      ingredients: b.ingredients
    })) ?? [];

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

    await supabase.from("products").update(updateData).eq("id", productId);

    return { success: true, nutrients_count: allNutrients.length };
  } catch (error) {
    return { success: false, nutrients_count: 0, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

async function processBulkAnalysis(
  categoryId: string,
  supabaseUrl: string,
  supabaseKey: string,
  openrouterApiKey: string
) {
  console.log(`[bulk-analyze] Starting bulk analysis for category: ${categoryId}`);
  
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Fetch products with low confidence or missing nutrient amounts
  const { data: products, error } = await supabase
    .from("products")
    .select("id, asin, title, main_image_url, image_urls, ocr_confidence, all_nutrients")
    .eq("category_id", categoryId)
    .not("main_image_url", "is", null)
    .order("monthly_sales", { ascending: false, nullsFirst: false });

  if (error || !products) {
    console.error("[bulk-analyze] Error fetching products:", error);
    return;
  }

  // Filter to only products needing re-analysis
  const productsToAnalyze = products.filter(p => {
    // Low confidence
    if (p.ocr_confidence === 'low') return true;
    
    // Check for missing amounts in nutrients
    const nutrients = p.all_nutrients as Array<{ amount?: string | null }> | null;
    if (nutrients && nutrients.some(n => n.amount == null || n.amount === '')) return true;
    
    // No nutrients at all
    if (!nutrients || nutrients.length === 0) return true;
    
    return false;
  });

  console.log(`[bulk-analyze] Found ${productsToAnalyze.length} products needing analysis`);

  let successCount = 0;
  let failCount = 0;

  for (const product of productsToAnalyze) {
    const allImages = [
      product.main_image_url,
      ...(product.image_urls ?? [])
    ].filter(Boolean) as string[];

    if (allImages.length === 0) {
      console.log(`[bulk-analyze] Skipping ${product.asin}: no images`);
      continue;
    }

    console.log(`[bulk-analyze] Analyzing ${product.asin}...`);
    
    const result = await analyzeProduct(supabase, openrouterApiKey, product.id, allImages);
    
    if (result.success) {
      successCount++;
      console.log(`[bulk-analyze] ✅ ${product.asin}: extracted ${result.nutrients_count} nutrients`);
    } else {
      failCount++;
      console.error(`[bulk-analyze] ❌ ${product.asin}: ${result.error}`);
    }

    // Add delay between requests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log(`[bulk-analyze] Complete: ${successCount} success, ${failCount} failed`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { categoryId } = await req.json();
    
    if (!categoryId) {
      return new Response(
        JSON.stringify({ error: "categoryId is required" }),
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

    // Count products needing analysis
    const { data: products } = await supabase
      .from("products")
      .select("id, ocr_confidence, all_nutrients")
      .eq("category_id", categoryId)
      .not("main_image_url", "is", null);

    const productsToAnalyze = (products ?? []).filter(p => {
      if (p.ocr_confidence === 'low') return true;
      const nutrients = p.all_nutrients as Array<{ amount?: string | null }> | null;
      if (nutrients && nutrients.some(n => n.amount == null || n.amount === '')) return true;
      if (!nutrients || nutrients.length === 0) return true;
      return false;
    });

    console.log(`[bulk-analyze] Starting background task for ${productsToAnalyze.length} products`);

    // Start background processing
    EdgeRuntime.waitUntil(
      processBulkAnalysis(categoryId, supabaseUrl, supabaseKey, openrouterApiKey)
    );

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Bulk analysis started",
        products_queued: productsToAnalyze.length
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[bulk-analyze] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
