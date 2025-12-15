import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const EdgeRuntime: {
  waitUntil: (promise: Promise<unknown>) => void;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CompetitorPackagingAnalysis {
  product_index: number;
  label_content: {
    main_title: string;
    subtitle: string | null;
    x_in_1_claim: string | null;
    benefit_claims: string[];
    serving_info: string | null;
    flavor_text: string | null;
    all_visible_text: string[];
    elements: string[];
    badges: string[];
    claims: string[];
    certifications: string[];
    supporting_claims: string[];
  };
  messaging_tone: {
    primary_tone: string;
    tone_descriptors: string[];
    urgency_level: "low" | "medium" | "high";
    emotional_appeal: string;
  };
  product_contents: {
    type: string;
    shape: string | null;
    colors: string[];
    color_pattern: string | null;
    texture_appearance: string | null;
    size_estimate: string | null;
  };
  packaging: {
    type: string;
    material: string;
    color: string;
    features: string[];
  };
}

async function analyzeImagesInBackground(
  categoryId: string,
  supabaseUrl: string,
  supabaseKey: string,
  openrouterApiKey: string
) {
  console.log(`[analyze-packaging-images] Starting background analysis for category: ${categoryId}`);
  
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("id, asin, brand, title, main_image_url, price")
      .eq("category_id", categoryId)
      .not("main_image_url", "is", null)
      .order("monthly_sales", { ascending: false, nullsFirst: false })
      .limit(15);

    if (productsError) throw productsError;
    if (!products || products.length === 0) return;

    console.log(`[analyze-packaging-images] Found ${products.length} products`);

    const imageContent = products.map((p) => ({
      type: "image_url" as const,
      image_url: { url: p.main_image_url, detail: "high" as const }
    }));

    const productList = products.map((p, idx) => 
      `Image ${idx + 1}: ${p.brand} - ${p.title} (ASIN: ${p.asin})`
    ).join("\n");

    const prompt = `You are analyzing ${products.length} product packaging images. The images are provided IN ORDER matching the list below.

CRITICAL: The images are provided in the EXACT same order as this list. Image 1 corresponds to the first product listed, Image 2 to the second, etc.

Product Image Order (match analysis by position):
${productList}

## 🎯 YOUR MISSION: EXTRACT EVERY SINGLE PIECE OF TEXT VISIBLE ON THE FRONT OF EACH PACKAGE

For EACH image (in order, 1 to ${products.length}), analyze and extract:

### 1. LABEL CONTENT - READ EVERY WORD ON THE PACKAGING
**DO NOT SUMMARIZE - CAPTURE EXACT TEXT AS IT APPEARS ON THE LABEL:**

- **main_title**: The primary headline/product name EXACTLY as written (e.g., "Premium Dog Vitamins", "Advanced Joint Support")
- **subtitle**: Any secondary headline/subtitle EXACTLY as written
- **x_in_1_claim**: The EXACT X-in-1 claim if present (e.g., "15-in-1", "8 in 1", "23-in-1 Complete") - THIS IS CRITICAL!
- **benefit_claims**: ALL benefit statements listed (e.g., "Hip & Joint", "Skin & Coat", "Digestive Health", "Immune Support") - list EVERY ONE
- **serving_info**: Serving count/quantity (e.g., "90 Soft Chews", "120 Count", "240 Treats")
- **flavor_text**: Any flavor mentions (e.g., "Salmon Flavor", "Chicken & Bacon", "Peanut Butter")
- **all_visible_text**: EVERY single text element on the front label as an array - include EVERYTHING you can read
- **elements**: Visual elements/icons present (e.g., "dog silhouette", "bone icon", "heart icon")
- **badges**: ALL badges/certifications visible with EXACT TEXT (e.g., "Made in USA", "Vet Formulated", "GMP Certified", "Non-GMO")
- **claims**: ALL marketing claims (e.g., "Human-Grade Ingredients", "No Fillers", "Grain-Free")
- **certifications**: Specific certification badges (e.g., "NASC Quality Seal", "FDA Registered Facility")
- **supporting_claims**: Secondary claims (e.g., "For Dogs of All Ages", "Great Taste Dogs Love")

### 2. MESSAGING TONE (COPY THIS STYLE):
- primary_tone: (clinical/playful/premium/aggressive/wellness/natural/scientific)
- tone_descriptors: 3-5 adjectives describing the overall feel
- urgency_level: (low/medium/high)
- emotional_appeal: (trust-building/fear-based/aspirational/nurturing/fun)

### 3. PRODUCT CONTENTS (the actual product visible inside/on packaging):
- type: (gummy/treat/soft chew/powder/capsule/etc)
- shape: (bear/bone/circle/square/heart/star/oval/irregular)
- colors: of the actual product
- color_pattern: (solid/multi-colored/swirled/layered)
- texture_appearance: (smooth/ridged/coated/sugar-coated)
- size_estimate: (small/medium/large)

### 4. PACKAGING:
- type, material, color, features

## ⚠️ CRITICAL INSTRUCTIONS:
1. READ EVERY WORD on the front of the packaging - do not skip anything
2. If you see "15-in-1" or "8 in 1" or any X-in-1 claim, capture it EXACTLY in x_in_1_claim
3. List ALL benefit claims separately - if it says "Hip & Joint • Skin & Coat • Immune • Digestive", list all 4
4. The all_visible_text array should contain EVERY text element - nothing should be missed
5. Return analyses in the SAME ORDER as the images/products listed above

Use the extract_packaging_analysis tool.`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openrouterApiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://lovable.dev",
        "X-Title": "Noodle Search Packaging Analysis"
      },
      body: JSON.stringify({
        model: "openai/gpt-4o",
        messages: [{ role: "user", content: [{ type: "text", text: prompt }, ...imageContent] }],
        tools: [{
          type: "function",
          function: {
            name: "extract_packaging_analysis",
            description: "Extract complete packaging analysis including ALL visible text from labels",
            parameters: {
              type: "object",
              properties: {
                analyses: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      product_index: { type: "number" },
                      label_content: {
                        type: "object",
                        properties: {
                          main_title: { type: "string", description: "Primary headline EXACTLY as written" },
                          subtitle: { type: "string", nullable: true, description: "Secondary headline if present" },
                          x_in_1_claim: { type: "string", nullable: true, description: "EXACT X-in-1 claim (e.g., '15-in-1', '8 in 1')" },
                          benefit_claims: { type: "array", items: { type: "string" }, description: "ALL benefit statements listed (Hip & Joint, Skin & Coat, etc.)" },
                          serving_info: { type: "string", nullable: true, description: "Serving count (e.g., '90 Soft Chews')" },
                          flavor_text: { type: "string", nullable: true, description: "Flavor mentions" },
                          all_visible_text: { type: "array", items: { type: "string" }, description: "EVERY text element visible on front label" },
                          elements: { type: "array", items: { type: "string" }, description: "Visual elements/icons" },
                          badges: { type: "array", items: { type: "string" }, description: "ALL badges with exact text" },
                          claims: { type: "array", items: { type: "string" }, description: "ALL marketing claims" },
                          certifications: { type: "array", items: { type: "string" }, description: "Certification badges" },
                          supporting_claims: { type: "array", items: { type: "string" }, description: "Secondary/supporting claims" }
                        },
                        required: ["main_title", "benefit_claims", "all_visible_text", "elements", "badges", "claims"]
                      },
                      messaging_tone: {
                        type: "object",
                        properties: {
                          primary_tone: { type: "string" },
                          tone_descriptors: { type: "array", items: { type: "string" } },
                          urgency_level: { type: "string", enum: ["low", "medium", "high"] },
                          emotional_appeal: { type: "string" }
                        },
                        required: ["primary_tone", "tone_descriptors", "urgency_level", "emotional_appeal"]
                      },
                      product_contents: {
                        type: "object",
                        properties: {
                          type: { type: "string" },
                          shape: { type: "string", nullable: true },
                          colors: { type: "array", items: { type: "string" } },
                          color_pattern: { type: "string", nullable: true },
                          texture_appearance: { type: "string", nullable: true },
                          size_estimate: { type: "string", nullable: true }
                        },
                        required: ["type", "colors"]
                      },
                      packaging: {
                        type: "object",
                        properties: {
                          type: { type: "string" },
                          material: { type: "string" },
                          color: { type: "string" },
                          features: { type: "array", items: { type: "string" } }
                        },
                        required: ["type", "material", "color", "features"]
                      }
                    },
                    required: ["product_index", "label_content", "messaging_tone", "product_contents", "packaging"]
                  }
                }
              },
              required: ["analyses"]
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "extract_packaging_analysis" } }
      }),
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in response");

    const analyses: CompetitorPackagingAnalysis[] = JSON.parse(toolCall.function.arguments).analyses;
    console.log(`[analyze-packaging-images] Parsed ${analyses.length} analyses`);

    const enrichedAnalyses = [];
    for (const analysis of analyses) {
      const productIdx = analysis.product_index - 1;
      if (productIdx >= 0 && productIdx < products.length) {
        const product = products[productIdx];
        
        enrichedAnalyses.push({
          brand: product.brand || "Unknown",
          title: product.title || "Unknown",
          asin: product.asin,
          image_url: product.main_image_url,
          label_content: analysis.label_content,
          messaging_tone: analysis.messaging_tone,
          product_contents: analysis.product_contents,
          packaging: analysis.packaging
        });
        
        // Update individual product
        await supabase.from("products").update({ 
          packaging_image_analysis: {
            label_content: analysis.label_content,
            messaging_tone: analysis.messaging_tone,
            product_contents: analysis.product_contents,
            packaging: analysis.packaging,
            analyzed_at: new Date().toISOString()
          }
        }).eq("id", product.id);
      }
    }

    // Save category-level results
    const { data: existingRecord } = await supabase
      .from("packaging_analyses")
      .select("id, analysis")
      .eq("category_id", categoryId)
      .maybeSingle();

    if (existingRecord) {
      await supabase.from("packaging_analyses")
        .update({ image_analysis: { competitor_analyses: enrichedAnalyses }, updated_at: new Date().toISOString() })
        .eq("category_id", categoryId);
    } else {
      await supabase.from("packaging_analyses")
        .insert({ category_id: categoryId, analysis: {}, image_analysis: { competitor_analyses: enrichedAnalyses } });
    }

    console.log(`[analyze-packaging-images] Saved ${enrichedAnalyses.length} analyses`);
  } catch (error) {
    console.error("[analyze-packaging-images] Error:", error);
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const openrouterApiKey = Deno.env.get("OPENROUTER_API_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Supabase configuration missing");
    }

    if (!openrouterApiKey) {
      throw new Error("OPENROUTER_API_KEY is not configured");
    }

    console.log(`[analyze-packaging-images] Starting analysis for category: ${categoryId}`);

    // Start background task
    EdgeRuntime.waitUntil(
      analyzeImagesInBackground(categoryId, supabaseUrl, supabaseKey, openrouterApiKey)
    );

    return new Response(
      JSON.stringify({ 
        status: "processing",
        message: "Packaging image analysis started in background"
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[analyze-packaging-images] Error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error",
        details: error instanceof Error ? error.stack : undefined
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
