import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { currentText, style, productContext } = await req.json();
    
    console.log("Rewriting label text with style:", style);
    console.log("Product context:", productContext);
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const stylePrompts: Record<string, string> = {
      professional: "Use sophisticated, clinical language that builds trust. Focus on efficacy and science-backed claims. Think pharmaceutical-quality messaging.",
      playful: "Use fun, energetic language with personality. Make it approachable, memorable, and engaging. Add some creative flair.",
      premium: "Use elegant, luxurious language that conveys exclusivity and high quality. Think high-end boutique supplement brands.",
      minimal: "Be extremely concise and direct. Remove all fluff, keep only essential selling points. Less is more.",
      bold: "Use power words and strong, confident statements. Be assertive and impactful. Make bold claims that stand out.",
    };

    const styleInstruction = stylePrompts[style] || stylePrompts.professional;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-pro-preview",
        messages: [
          {
            role: "system",
            content: `You are an expert packaging copywriter specializing in supplement labels. Rewrite the front panel label text with a ${style} tone.

${styleInstruction}

RULES:
- Keep the same general structure (brand name line, product name, claim, bullets, callouts)
- Maintain all certification claims (FDA, GMP, etc.) exactly as given
- DO NOT invent new health claims or benefits not in the original
- Keep it concise - max 12 lines total
- Preserve any dosage or quantity information exactly
- Return ONLY the rewritten text, no explanations or commentary
- Keep the same line-by-line format`
          },
          {
            role: "user",
            content: `Product context: ${productContext || 'Dietary supplement product'}

Current label text:
${currentText}

Rewrite this label text in a ${style} tone while maintaining the structure and key information.`
          }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a few seconds." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "API credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const rewrittenText = data.choices?.[0]?.message?.content;

    if (!rewrittenText) {
      throw new Error("No response from AI");
    }

    console.log("Label rewritten successfully");

    return new Response(
      JSON.stringify({ rewrittenText: rewrittenText.trim() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Label rewrite error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Failed to rewrite label" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
