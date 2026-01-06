import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const EdgeRuntime: {
  waitUntil: (promise: Promise<unknown>) => void;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// n8n-compatible interface structures
interface ExtractedNutrient {
  name: string;
  amount: number | null;
  unit: string | null;
  per_serving: boolean;
  daily_value_percent: number | null;
}

interface ActiveIngredient {
  name: string;
  amount: number | null;
  unit: string | null;
}

interface ProprietaryBlend {
  name: string;
  total_amount: number | null;
  unit: string | null;
  ingredients: string[];
}

interface ExtractionCompleteness {
  notes: string;
  image_quality: string;
  panel_fully_visible: boolean;
  total_nutrients_found: number;
}

interface ExtractionResult {
  found: boolean;
  confidence: "high" | "medium" | "low";
  panel_type: string;
  serving_size: string | null;
  servings_per_container: number | null;
  calories: number | null;
  all_nutrients: ExtractedNutrient[];
  active_ingredients: ActiveIngredient[];
  proprietary_blends: ProprietaryBlend[];
  other_ingredients: string | null;
  inactive_ingredients: string | null;
  warnings: string | null;
  directions: string | null;
  claims_on_label: string[];
  manufacturer: string | null;
  found_in_image: number | null;
  extraction_completeness: ExtractionCompleteness;
  guaranteed_analysis: Record<string, unknown>;
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
2. **Extract EXACT amounts**: For each nutrient, extract the EXACT numeric amount shown as a NUMBER (e.g., 500 not "500mg")
3. **Include units SEPARATELY**: mg, mcg, g, IU, etc. in the unit field
4. **Daily Values**: Extract % Daily Value as a NUMBER (e.g., 125 not "125%")
5. **Proprietary Blends**: If present, list the blend name, total amount as NUMBER, unit, and all ingredients
6. **Active Ingredients**: List nutrients that are the main active ingredients
7. **Claims on Label**: Extract all marketing claims visible on the product
8. **Be thorough**: Don't skip any nutrients, vitamins, minerals, or ingredients

## OUTPUT FORMAT REQUIREMENTS (IMPORTANT):
- amount: Must be a NUMBER or null (e.g., 500, 1000.5, 25) - NOT a string
- daily_value_percent: Must be a NUMBER or null (e.g., 125, 50, 100) - NOT "125%"
- per_serving: Always true for nutrients listed per serving
- panel_type: "supplement_facts" or "nutrition_facts"
- found_in_image: The image number (1-indexed) where the panel was found

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
            description: "Extract complete supplement facts panel data from product images in n8n-compatible format",
            parameters: {
              type: "object",
              properties: {
                found: { type: "boolean", description: "Whether a supplement/nutrition facts panel was found" },
                confidence: { type: "string", enum: ["high", "medium", "low"] },
                panel_type: { type: "string", description: "supplement_facts or nutrition_facts" },
                serving_size: { type: "string", nullable: true },
                servings_per_container: { type: "number", nullable: true },
                calories: { type: "number", nullable: true },
                all_nutrients: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      amount: { type: "number", nullable: true },
                      unit: { type: "string", nullable: true },
                      per_serving: { type: "boolean" },
                      daily_value_percent: { type: "number", nullable: true }
                    },
                    required: ["name", "per_serving"]
                  }
                },
                active_ingredients: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      amount: { type: "number", nullable: true },
                      unit: { type: "string", nullable: true }
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
                      total_amount: { type: "number", nullable: true },
                      unit: { type: "string", nullable: true },
                      ingredients: { type: "array", items: { type: "string" } }
                    },
                    required: ["name", "ingredients"]
                  }
                },
                other_ingredients: { type: "string", nullable: true },
                inactive_ingredients: { type: "string", nullable: true },
                warnings: { type: "string", nullable: true },
                directions: { type: "string", nullable: true },
                claims_on_label: { type: "array", items: { type: "string" } },
                manufacturer: { type: "string", nullable: true },
                found_in_image: { type: "number", nullable: true },
                extraction_completeness: {
                  type: "object",
                  properties: {
                    notes: { type: "string" },
                    image_quality: { type: "string", enum: ["high", "medium", "low"] },
                    panel_fully_visible: { type: "boolean" },
                    total_nutrients_found: { type: "number" }
                  },
                  required: ["notes", "image_quality", "panel_fully_visible", "total_nutrients_found"]
                },
                guaranteed_analysis: { type: "object" }
              },
              required: ["found", "confidence", "panel_type", "all_nutrients", "extraction_completeness"]
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

    // Build the complete n8n-compatible supplement_facts_complete structure
    const supplementFactsComplete = {
      found: result.found ?? true,
      confidence: result.confidence,
      panel_type: result.panel_type || "supplement_facts",
      serving_size: result.serving_size,
      servings_per_container: result.servings_per_container,
      calories: result.calories,
      all_nutrients: result.all_nutrients || [],
      active_ingredients: result.active_ingredients || [],
      proprietary_blends: result.proprietary_blends || [],
      other_ingredients: result.other_ingredients,
      inactive_ingredients: result.inactive_ingredients || result.other_ingredients,
      warnings: result.warnings,
      directions: result.directions,
      claims_on_label: result.claims_on_label || [],
      manufacturer: result.manufacturer,
      found_in_image: result.found_in_image,
      extraction_completeness: result.extraction_completeness || {
        notes: "Extracted via AI analysis",
        image_quality: result.confidence,
        panel_fully_visible: result.confidence === "high",
        total_nutrients_found: result.all_nutrients?.length || 0
      },
      guaranteed_analysis: result.guaranteed_analysis || {}
    };

    // Update the product in the database
    const updateData: Record<string, unknown> = {
      // Store complete n8n-compatible structure
      supplement_facts_complete: supplementFactsComplete,
      // Also update individual columns for backward compatibility
      all_nutrients: result.all_nutrients,
      ocr_confidence: result.confidence,
      ocr_extracted: true,
      extraction_notes: result.extraction_completeness?.notes,
      nutrients_count: result.all_nutrients?.length || 0,
      calories_per_serving: result.calories,
      claims_on_label: result.claims_on_label,
      updated_at: new Date().toISOString()
    };

    if (result.serving_size) updateData.serving_size = result.serving_size;
    if (result.servings_per_container) updateData.servings_per_container = result.servings_per_container;
    if (result.proprietary_blends && result.proprietary_blends.length > 0) {
      updateData.proprietary_blends = result.proprietary_blends;
      updateData.has_proprietary_blends = true;
    }
    if (result.other_ingredients) updateData.other_ingredients = result.other_ingredients;
    if (result.warnings) updateData.warnings = result.warnings;
    if (result.directions) updateData.directions = result.directions;

    await supabase.from("products").update(updateData).eq("id", productId);

    return { success: true, nutrients_count: result.all_nutrients?.length || 0 };
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
    await broadcastProgress(supabase, categoryId, { status: "error", error: "Failed to fetch products" });
    return;
  }

  // Filter to only products needing re-analysis
  const productsToAnalyze = products.filter(p => {
    if (p.ocr_confidence === 'low') return true;
    const nutrients = p.all_nutrients as Array<{ amount?: number | null }> | null;
    if (nutrients && nutrients.some(n => n.amount == null)) return true;
    if (!nutrients || nutrients.length === 0) return true;
    return false;
  });

  const total = productsToAnalyze.length;
  console.log(`[bulk-analyze] Found ${total} products needing analysis`);

  let completed = 0;
  let successCount = 0;
  let failCount = 0;

  // Broadcast initial status
  await broadcastProgress(supabase, categoryId, {
    status: "running",
    total,
    completed: 0,
    success: 0,
    failed: 0,
    currentProduct: null
  });

  for (const product of productsToAnalyze) {
    const allImages = [
      product.main_image_url,
      ...(product.image_urls ?? [])
    ].filter(Boolean) as string[];

    if (allImages.length === 0) {
      console.log(`[bulk-analyze] Skipping ${product.asin}: no images`);
      completed++;
      continue;
    }

    // Broadcast current product being analyzed
    await broadcastProgress(supabase, categoryId, {
      status: "running",
      total,
      completed,
      success: successCount,
      failed: failCount,
      currentProduct: product.title?.slice(0, 50) || product.asin
    });

    console.log(`[bulk-analyze] Analyzing ${product.asin}...`);
    
    const result = await analyzeProduct(supabase, openrouterApiKey, product.id, allImages);
    completed++;
    
    if (result.success) {
      successCount++;
      console.log(`[bulk-analyze] ✅ ${product.asin}: extracted ${result.nutrients_count} nutrients`);
    } else {
      failCount++;
      console.error(`[bulk-analyze] ❌ ${product.asin}: ${result.error}`);
    }

    // Broadcast progress update
    await broadcastProgress(supabase, categoryId, {
      status: "running",
      total,
      completed,
      success: successCount,
      failed: failCount,
      currentProduct: null
    });

    // Add delay between requests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Broadcast completion
  await broadcastProgress(supabase, categoryId, {
    status: "complete",
    total,
    completed,
    success: successCount,
    failed: failCount,
    currentProduct: null
  });

  console.log(`[bulk-analyze] Complete: ${successCount} success, ${failCount} failed`);
}

async function broadcastProgress(supabase: any, categoryId: string, progress: {
  status: "running" | "complete" | "error";
  total?: number;
  completed?: number;
  success?: number;
  failed?: number;
  currentProduct?: string | null;
  error?: string;
}) {
  try {
    const channel = supabase.channel(`bulk-analysis-${categoryId}`);
    await channel.send({
      type: "broadcast",
      event: "progress",
      payload: { ...progress, categoryId, timestamp: Date.now() }
    });
  } catch (e) {
    console.error("[bulk-analyze] Broadcast error:", e);
  }
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
      const nutrients = p.all_nutrients as Array<{ amount?: number | null }> | null;
      if (nutrients && nutrients.some(n => n.amount == null)) return true;
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
