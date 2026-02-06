import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ExtractedIngredient {
  name: string;
  amount: string;
  unit: string;
  daily_value: string | null;
}

interface ExtractionResult {
  serving_size: string | null;
  servings_per_container: number | null;
  ingredients: ExtractedIngredient[];
  other_ingredients: string | null;
  directions: string | null;
  warnings: string | null;
  claims_on_label: string[];
}

const extractionTool = {
  type: "function",
  function: {
    name: "extract_supplement_facts",
    description:
      "Extract structured supplement facts data from a product label image. Extract all visible ingredients with their amounts, units, and daily values.",
    parameters: {
      type: "object",
      properties: {
        serving_size: {
          type: "string",
          description: "The serving size as shown on the label (e.g., '1 stick (16g)', '2 capsules')",
        },
        servings_per_container: {
          type: "number",
          description: "Number of servings per container",
        },
        ingredients: {
          type: "array",
          description: "Array of active ingredients from the Supplement Facts panel",
          items: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "Ingredient name exactly as shown on label",
              },
              amount: {
                type: "string",
                description: "Numeric amount (e.g., '500', '1.5')",
              },
              unit: {
                type: "string",
                description: "Unit of measurement (mg, g, mcg, IU, ml, %)",
              },
              daily_value: {
                type: "string",
                description: "Percent daily value if shown (e.g., '22%'), or null if not listed",
              },
            },
            required: ["name", "amount", "unit"],
          },
        },
        other_ingredients: {
          type: "string",
          description: "Other/inactive ingredients listed below the supplement facts panel",
        },
        directions: {
          type: "string",
          description: "Usage directions if visible on the label",
        },
        warnings: {
          type: "string",
          description: "Warning text if visible on the label",
        },
        claims_on_label: {
          type: "array",
          items: { type: "string" },
          description: "Marketing claims visible on the label (e.g., 'Non-GMO', 'Gluten Free', 'Vegan')",
        },
        confidence: {
          type: "string",
          enum: ["high", "medium", "low"],
          description: "Confidence level in the extraction accuracy",
        },
        extraction_notes: {
          type: "string",
          description: "Any notes about unclear or partially visible text",
        },
      },
      required: ["ingredients", "confidence"],
    },
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { imageBase64, mimeType } = await req.json();

    if (!imageBase64) {
      return new Response(
        JSON.stringify({ success: false, error: "imageBase64 is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) {
      console.error("OPENROUTER_API_KEY not configured");
      return new Response(
        JSON.stringify({ success: false, error: "API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const validMimeType = mimeType || "image/jpeg";
    
    console.log("Sending image to Gemini Pro 3 for supplement facts extraction...");

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://supplement-scope-dash.lovable.app",
        "X-Title": "Supplement Scope - Image Extraction",
      },
      body: JSON.stringify({
        model: "google/gemini-3-pro-preview",
        messages: [
          {
            role: "system",
            content: `You are an expert at reading supplement facts panels from product images. 
Your task is to extract all structured data from the Supplement Facts panel including:
- Serving size and servings per container
- All active ingredients with exact amounts, units, and % daily values
- Other/inactive ingredients
- Any visible directions, warnings, or marketing claims

Be precise with numbers and units. If text is partially obscured, note it in extraction_notes.
Extract ingredients in the order they appear on the label.`,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Please extract all supplement facts data from this product label image. Use the extract_supplement_facts tool to return the structured data.",
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${validMimeType};base64,${imageBase64}`,
                },
              },
            ],
          },
        ],
        tools: [extractionTool],
        tool_choice: { type: "function", function: { name: "extract_supplement_facts" } },
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenRouter API error:", response.status, errorText);
      return new Response(
        JSON.stringify({ success: false, error: `AI service error: ${response.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await response.json();
    console.log("Gemini response received:", JSON.stringify(result).slice(0, 500));

    // Extract the tool call arguments
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function.name !== "extract_supplement_facts") {
      console.error("No valid tool call in response:", result);
      return new Response(
        JSON.stringify({ success: false, error: "AI did not return structured extraction" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const extractedData = JSON.parse(toolCall.function.arguments);
    console.log(`Extracted ${extractedData.ingredients?.length || 0} ingredients with confidence: ${extractedData.confidence}`);

    // Format the response
    const formattedResponse = {
      success: true,
      confidence: extractedData.confidence || "medium",
      data: {
        serving_size: extractedData.serving_size || null,
        servings_per_container: extractedData.servings_per_container || null,
        ingredients: (extractedData.ingredients || []).map((ing: any) => ({
          name: ing.name || "",
          amount: String(ing.amount || ""),
          unit: ing.unit || "mg",
          daily_value: ing.daily_value || null,
        })),
        other_ingredients: extractedData.other_ingredients || null,
        directions: extractedData.directions || null,
        warnings: extractedData.warnings || null,
        claims_on_label: extractedData.claims_on_label || [],
      },
      extraction_notes: extractedData.extraction_notes || "",
    };

    return new Response(JSON.stringify(formattedResponse), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in extract-supplement-image:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
