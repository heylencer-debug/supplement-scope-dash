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
  brand: string;
  title: string;
  asin: string;
  image_url: string;
  label_content: {
    main_title: string;
    subtitle: string | null;
    elements: string[];
    badges: string[];
    claims: string[];
  };
  product_form: {
    type: string;
    shape: string | null;
    colors: string[];
    texture_notes: string | null;
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
  lovableApiKey: string
) {
  console.log(`[analyze-packaging-images] Starting background analysis for category: ${categoryId}`);
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  try {
    // Fetch top 15 competitors with images
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('asin, brand, title, main_image_url, image_urls, monthly_sales')
      .eq('category_id', categoryId)
      .not('main_image_url', 'is', null)
      .order('monthly_sales', { ascending: false, nullsFirst: false })
      .limit(15);

    if (productsError) {
      console.error('[analyze-packaging-images] Error fetching products:', productsError);
      throw new Error(`Failed to fetch products: ${productsError.message}`);
    }

    if (!products || products.length === 0) {
      console.log('[analyze-packaging-images] No products with images found');
      throw new Error('No products with images found in this category');
    }

    console.log(`[analyze-packaging-images] Found ${products.length} products with images`);

    // Build image content for Gemini Vision
    const imageContents = products.map((product, idx) => {
      const imageUrl = product.main_image_url || (product.image_urls && product.image_urls[0]);
      return {
        type: "image_url" as const,
        image_url: { url: imageUrl }
      };
    });

    // Add text prompt
    const productListText = products.map((p, i) => 
      `Product ${i + 1}: ${p.brand || 'Unknown Brand'} - ${p.title || 'Unknown Title'} (ASIN: ${p.asin})`
    ).join('\n');

    const prompt = `Analyze the product packaging in these ${products.length} images. For each product image (in order), extract the following structured information:

Product List (in order of images):
${productListText}

For EACH product, analyze:

1. **Label Content**: 
   - Main title text visible on the packaging
   - Subtitle/tagline if present
   - Key elements (serving size, quantity, weight, etc.)
   - Certification badges (Non-GMO, USDA Organic, GMP Certified, etc.)
   - Health/benefit claims visible on the label

2. **Product Form** (if visible):
   - Type: gummy, powder, softgel, capsule, tablet, liquid, soft chew, treat, etc.
   - Shape: bear, bone, round, oval, cube, irregular, etc. (for gummies/treats)
   - Colors of the actual product (if visible through packaging)
   - Texture notes: smooth, ribbed, coated, etc.

3. **Packaging**:
   - Type: bottle, pouch, jar, box, sachet, tube, etc.
   - Material: plastic, glass, foil, cardboard, etc.
   - Primary color of packaging
   - Features: flip-top lid, resealable, child-resistant, pump, dropper, etc.

Respond with your analysis using the extract_packaging_analysis tool.`;

    console.log('[analyze-packaging-images] Calling Gemini Vision API...');
    
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              ...imageContents
            ]
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_packaging_analysis",
              description: "Extract structured packaging analysis for each competitor product image",
              parameters: {
                type: "object",
                properties: {
                  competitor_analyses: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        product_index: { 
                          type: "number", 
                          description: "1-indexed position matching the product list order" 
                        },
                        label_content: {
                          type: "object",
                          properties: {
                            main_title: { type: "string", description: "Main product title visible on packaging" },
                            subtitle: { type: "string", description: "Tagline or subtitle if present" },
                            elements: { 
                              type: "array", 
                              items: { type: "string" },
                              description: "Key info elements: serving size, quantity, weight, etc."
                            },
                            badges: { 
                              type: "array", 
                              items: { type: "string" },
                              description: "Certification badges: Non-GMO, USDA Organic, GMP, etc."
                            },
                            claims: { 
                              type: "array", 
                              items: { type: "string" },
                              description: "Health/benefit claims on the label"
                            }
                          },
                          required: ["main_title", "elements", "badges", "claims"]
                        },
                        product_form: {
                          type: "object",
                          properties: {
                            type: { type: "string", description: "gummy, powder, softgel, capsule, tablet, liquid, soft chew, treat, etc." },
                            shape: { type: "string", description: "Shape if visible: bear, bone, round, oval, etc." },
                            colors: { 
                              type: "array", 
                              items: { type: "string" },
                              description: "Product colors if visible"
                            },
                            texture_notes: { type: "string", description: "Texture description if visible" }
                          },
                          required: ["type"]
                        },
                        packaging: {
                          type: "object",
                          properties: {
                            type: { type: "string", description: "bottle, pouch, jar, box, sachet, tube, etc." },
                            material: { type: "string", description: "plastic, glass, foil, cardboard, etc." },
                            color: { type: "string", description: "Primary packaging color" },
                            features: { 
                              type: "array", 
                              items: { type: "string" },
                              description: "Features: flip-top, resealable, child-resistant, etc."
                            }
                          },
                          required: ["type", "material", "color"]
                        }
                      },
                      required: ["product_index", "label_content", "product_form", "packaging"]
                    }
                  }
                },
                required: ["competitor_analyses"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "extract_packaging_analysis" } }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[analyze-packaging-images] Gemini API error:', response.status, errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const aiData = await response.json();
    console.log('[analyze-packaging-images] AI response received');

    // Extract tool call result
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function.name !== 'extract_packaging_analysis') {
      console.error('[analyze-packaging-images] No valid tool call in response');
      throw new Error('AI did not return expected structured output');
    }

    const analysisResult = JSON.parse(toolCall.function.arguments);
    
    // Merge with product data
    const enrichedAnalyses: CompetitorPackagingAnalysis[] = analysisResult.competitor_analyses.map((analysis: any) => {
      const productIdx = analysis.product_index - 1;
      const product = products[productIdx];
      
      if (!product) {
        console.warn(`[analyze-packaging-images] No product found for index ${analysis.product_index}`);
        return null;
      }
      
      return {
        brand: product.brand || 'Unknown Brand',
        title: product.title || 'Unknown Product',
        asin: product.asin,
        image_url: product.main_image_url || (product.image_urls && product.image_urls[0]),
        label_content: {
          main_title: analysis.label_content?.main_title || '',
          subtitle: analysis.label_content?.subtitle || null,
          elements: analysis.label_content?.elements || [],
          badges: analysis.label_content?.badges || [],
          claims: analysis.label_content?.claims || []
        },
        product_form: {
          type: analysis.product_form?.type || 'unknown',
          shape: analysis.product_form?.shape || null,
          colors: analysis.product_form?.colors || [],
          texture_notes: analysis.product_form?.texture_notes || null
        },
        packaging: {
          type: analysis.packaging?.type || 'unknown',
          material: analysis.packaging?.material || 'unknown',
          color: analysis.packaging?.color || 'unknown',
          features: analysis.packaging?.features || []
        }
      };
    }).filter(Boolean);

    console.log(`[analyze-packaging-images] Processed ${enrichedAnalyses.length} competitor analyses`);

    // Save to database
    const { error: upsertError } = await supabase
      .from('packaging_analyses')
      .upsert(
        {
          category_id: categoryId,
          image_analysis: { competitor_analyses: enrichedAnalyses },
          updated_at: new Date().toISOString()
        },
        { onConflict: 'category_id' }
      );

    if (upsertError) {
      console.error('[analyze-packaging-images] Error saving to DB:', upsertError);
      throw new Error(`Failed to save analysis: ${upsertError.message}`);
    }

    console.log('[analyze-packaging-images] Analysis saved successfully');
    
  } catch (error) {
    console.error('[analyze-packaging-images] Background task error:', error);
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
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Supabase configuration missing");
    }

    if (!lovableApiKey) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log(`[analyze-packaging-images] Starting analysis for category: ${categoryId}`);

    // Start background task
    EdgeRuntime.waitUntil(
      analyzeImagesInBackground(categoryId, supabaseUrl, supabaseKey, lovableApiKey)
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
