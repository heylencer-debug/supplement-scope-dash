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
  design_impact: {
    overall_aesthetic: string;
    visual_strategy: string;
    color_psychology: string;
    shelf_impact: "low" | "medium" | "high";
    design_strengths: string[];
    design_weaknesses: string[];
    standout_elements: string[];
    dominant_colors: string[];
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

## 🎯 YOUR MISSION: EXTRACT COMPLETE PACKAGING ANALYSIS INCLUDING DESIGN IMPACT

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

### 3. DESIGN IMPACT (NEW - CRITICAL FOR COMPETITIVE STRATEGY):
Analyze the VISUAL DESIGN and AESTHETIC of the packaging:
- **overall_aesthetic**: Premium/Playful/Clinical/Natural/Bold/Minimalist/Scientific/Rustic/Modern
- **visual_strategy**: Minimalist/Busy-information-dense/Photo-centric/Illustration-based/Typography-driven/Icon-heavy
- **color_psychology**: What emotions/trust the colors evoke (e.g., "trust-building blues", "energetic oranges", "natural greens", "premium golds")
- **shelf_impact**: How much it stands out on shelf (low/medium/high)
- **design_strengths**: What makes this design effective (e.g., "clear hierarchy", "strong contrast", "memorable brand mark")
- **design_weaknesses**: What could be improved (e.g., "too cluttered", "weak typography", "generic look")
- **standout_elements**: What makes it visually memorable (e.g., "unique shape", "bold color blocking", "distinctive illustration")
- **dominant_colors**: The 2-3 main colors on the packaging AS HEX CODES (e.g., ["#DC143C", "#8B008B", "#FFFFFF"])

⚠️ CRITICAL COLOR EXTRACTION - PROVIDE EXACT HEX CODES:
- **primary_color_hex**: The SINGLE most dominant background/brand color as HEX CODE (e.g., "#DC143C" for cherry red, "#8B008B" for purple)
- **secondary_color_hex**: The second most prominent color (headlines, secondary elements) as HEX CODE
- **accent_color_hex**: Any accent/highlight color used for CTAs, emphasis, or decorative elements as HEX CODE
- YOU MUST PROVIDE ACTUAL HEX CODES, NOT COLOR NAMES. Analyze the actual pixel colors from the packaging image.

### 4. PRODUCT CONTENTS (the actual product visible inside/on packaging):
- type: (gummy/treat/soft chew/powder/capsule/etc)
- shape: (bear/bone/circle/square/heart/star/oval/irregular)
- colors: of the actual product
- color_pattern: (solid/multi-colored/swirled/layered)
- texture_appearance: (smooth/ridged/coated/sugar-coated)
- size_estimate: (small/medium/large)

### 5. PACKAGING:
- type, material, color, features

## ⚠️ CRITICAL INSTRUCTIONS:
1. READ EVERY WORD on the front of the packaging - do not skip anything
2. If you see "15-in-1" or "8 in 1" or any X-in-1 claim, capture it EXACTLY in x_in_1_claim
3. List ALL benefit claims separately - if it says "Hip & Joint • Skin & Coat • Immune • Digestive", list all 4
4. The all_visible_text array should contain EVERY text element - nothing should be missed
5. DESIGN IMPACT is critical - analyze what makes each design work or fail visually
6. Return analyses in the SAME ORDER as the images/products listed above

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
        model: "google/gemini-3-pro-preview",
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
                      design_impact: {
                        type: "object",
                        description: "Visual design and aesthetic analysis of the packaging WITH HEX COLOR CODES",
                        properties: {
                          overall_aesthetic: { type: "string", description: "Premium/Playful/Clinical/Natural/Bold/Minimalist/Scientific/Rustic/Modern" },
                          visual_strategy: { type: "string", description: "Minimalist/Busy-information-dense/Photo-centric/Illustration-based/Typography-driven/Icon-heavy" },
                          color_psychology: { type: "string", description: "What emotions/trust the colors evoke" },
                          shelf_impact: { type: "string", enum: ["low", "medium", "high"] },
                          design_strengths: { type: "array", items: { type: "string" }, description: "What makes this design effective" },
                          design_weaknesses: { type: "array", items: { type: "string" }, description: "What could be improved" },
                          standout_elements: { type: "array", items: { type: "string" }, description: "What makes it visually memorable" },
                          dominant_colors: { type: "array", items: { type: "string" }, description: "The 2-3 main colors as HEX CODES (e.g., #DC143C)" },
                          primary_color_hex: { type: "string", description: "EXACT HEX CODE of most dominant color (e.g., #DC143C)" },
                          secondary_color_hex: { type: "string", description: "EXACT HEX CODE of second color (e.g., #8B008B)" },
                          accent_color_hex: { type: "string", description: "EXACT HEX CODE of accent color (e.g., #FFD700)" }
                        },
                        required: ["overall_aesthetic", "visual_strategy", "color_psychology", "shelf_impact", "design_strengths", "standout_elements", "dominant_colors", "primary_color_hex", "secondary_color_hex"]
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
                    required: ["product_index", "label_content", "messaging_tone", "design_impact", "product_contents", "packaging"]
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
          design_impact: analysis.design_impact,
          product_contents: analysis.product_contents,
          packaging: analysis.packaging
        });
        
        // Update individual product
        await supabase.from("products").update({ 
          packaging_image_analysis: {
            label_content: analysis.label_content,
            messaging_tone: analysis.messaging_tone,
            design_impact: analysis.design_impact,
            product_contents: analysis.product_contents,
            packaging: analysis.packaging,
            analyzed_at: new Date().toISOString()
          }
        }).eq("id", product.id);
      }
    }

    // Save category-level results with retry logic and verification
    const imageAnalysisData = { competitor_analyses: enrichedAnalyses };
    
    console.log(`[analyze-packaging-images] ========== SAVING STEP 1 DATA ==========`);
    console.log(`[analyze-packaging-images] Category ID: ${categoryId}`);
    console.log(`[analyze-packaging-images] Analyses count: ${enrichedAnalyses.length}`);
    console.log(`[analyze-packaging-images] Data size: ${JSON.stringify(imageAnalysisData).length} bytes`);
    
    // Retry logic - try up to 3 times
    let saveSuccess = false;
    let lastError: any = null;
    
    for (let attempt = 1; attempt <= 3 && !saveSuccess; attempt++) {
      console.log(`[analyze-packaging-images] Save attempt ${attempt}/3`);
      
      try {
        // First check if record exists
        const { data: existingRecord, error: fetchError } = await supabase
          .from("packaging_analyses")
          .select("id, analysis, image_analysis")
          .eq("category_id", categoryId)
          .maybeSingle();
        
        if (fetchError) {
          console.error(`[analyze-packaging-images] Attempt ${attempt}: Error fetching existing record:`, fetchError);
          lastError = fetchError;
          continue;
        }

        console.log(`[analyze-packaging-images] Existing record found: ${!!existingRecord}`);
        if (existingRecord) {
          console.log(`[analyze-packaging-images] Existing analysis: ${existingRecord.analysis ? 'present' : 'null'}`);
          console.log(`[analyze-packaging-images] Existing image_analysis: ${existingRecord.image_analysis ? 'present' : 'null'}`);
        }

        if (existingRecord) {
          // UPDATE existing record - only update image_analysis column
          console.log(`[analyze-packaging-images] Attempt ${attempt}: Updating existing record...`);
          const { data: updateData, error: updateError } = await supabase
            .from("packaging_analyses")
            .update({ 
              image_analysis: imageAnalysisData, 
              updated_at: new Date().toISOString() 
            })
            .eq("category_id", categoryId)
            .select('id, image_analysis, analysis');
          
          if (updateError) {
            console.error(`[analyze-packaging-images] Attempt ${attempt}: Update error:`, updateError);
            lastError = updateError;
            continue;
          }
          
          console.log(`[analyze-packaging-images] Attempt ${attempt}: Update returned data:`, updateData ? 'yes' : 'no');
        } else {
          // INSERT new record
          console.log(`[analyze-packaging-images] Attempt ${attempt}: Inserting new record...`);
          const { data: insertData, error: insertError } = await supabase
            .from("packaging_analyses")
            .insert({ 
              category_id: categoryId, 
              analysis: {}, 
              image_analysis: imageAnalysisData 
            })
            .select('id, image_analysis, analysis');
          
          if (insertError) {
            console.error(`[analyze-packaging-images] Attempt ${attempt}: Insert error:`, insertError);
            lastError = insertError;
            continue;
          }
          
          console.log(`[analyze-packaging-images] Attempt ${attempt}: Insert returned data:`, insertData ? 'yes' : 'no');
        }

        // VERIFICATION: Re-fetch to confirm data was saved
        console.log(`[analyze-packaging-images] Attempt ${attempt}: Verifying save...`);
        const { data: verifyRecord, error: verifyError } = await supabase
          .from("packaging_analyses")
          .select("id, image_analysis, analysis, updated_at")
          .eq("category_id", categoryId)
          .maybeSingle();
        
        if (verifyError) {
          console.error(`[analyze-packaging-images] Attempt ${attempt}: Verification fetch error:`, verifyError);
          lastError = verifyError;
          continue;
        }
        
        if (!verifyRecord) {
          console.error(`[analyze-packaging-images] Attempt ${attempt}: VERIFICATION FAILED - no record found after save`);
          lastError = new Error('Record not found after save');
          continue;
        }
        
        const hasImageAnalysis = verifyRecord.image_analysis && 
          (verifyRecord.image_analysis as any)?.competitor_analyses?.length > 0;
        
        console.log(`[analyze-packaging-images] Attempt ${attempt}: VERIFICATION RESULT:`);
        console.log(`  - Record ID: ${verifyRecord.id}`);
        console.log(`  - image_analysis present: ${hasImageAnalysis}`);
        console.log(`  - image_analysis count: ${(verifyRecord.image_analysis as any)?.competitor_analyses?.length || 0}`);
        console.log(`  - analysis present: ${!!verifyRecord.analysis && Object.keys(verifyRecord.analysis as object).length > 0}`);
        console.log(`  - updated_at: ${verifyRecord.updated_at}`);
        
        if (hasImageAnalysis) {
          saveSuccess = true;
          console.log(`[analyze-packaging-images] ✅ SAVE VERIFIED SUCCESSFULLY on attempt ${attempt}`);
        } else {
          console.error(`[analyze-packaging-images] Attempt ${attempt}: image_analysis is empty after save!`);
          lastError = new Error('image_analysis empty after save');
        }
        
      } catch (attemptError) {
        console.error(`[analyze-packaging-images] Attempt ${attempt}: Exception:`, attemptError);
        lastError = attemptError;
      }
      
      // Wait before retry
      if (!saveSuccess && attempt < 3) {
        console.log(`[analyze-packaging-images] Waiting 1 second before retry...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    if (!saveSuccess) {
      console.error(`[analyze-packaging-images] ❌ FAILED TO SAVE after 3 attempts. Last error:`, lastError);
    }

    console.log(`[analyze-packaging-images] ========== STEP 1 SAVE COMPLETE ==========`);
  } catch (error) {
    console.error("[analyze-packaging-images] Fatal error:", error);
    console.error("[analyze-packaging-images] Stack:", error instanceof Error ? error.stack : 'N/A');
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
