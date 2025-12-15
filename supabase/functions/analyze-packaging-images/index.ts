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
    elements: string[];
    badges: string[];
    claims: string[];
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
      `Product ${idx + 1}: ${p.brand} - ${p.title} (ASIN: ${p.asin})`
    ).join("\n");

    const prompt = `Analyze these ${products.length} product packaging images.

Products:
${productList}

For EACH product, extract:
1. **Label Content**: Main title, subtitle, elements, badges/certifications, claims
2. **Messaging Tone**: primary_tone (clinical/playful/premium/aggressive/wellness/natural/scientific), tone_descriptors (3-5 adjectives), urgency_level (low/medium/high), emotional_appeal (trust-building/fear-based/aspirational/nurturing/fun)
3. **Product Contents** (the actual product inside): type (gummy/treat/soft chew/powder/capsule/etc), shape (bear/bone/circle/square/heart/star/oval/irregular), colors, color_pattern (solid/multi-colored/swirled/layered), texture_appearance (smooth/ridged/coated/sugar-coated), size_estimate (small/medium/large)
4. **Packaging**: type, material, color, features

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
            description: "Extract packaging analysis",
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
                          main_title: { type: "string" },
                          subtitle: { type: "string", nullable: true },
                          elements: { type: "array", items: { type: "string" } },
                          badges: { type: "array", items: { type: "string" } },
                          claims: { type: "array", items: { type: "string" } }
                        },
                        required: ["main_title", "elements", "badges", "claims"]
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
