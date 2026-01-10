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
    
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) {
      throw new Error("OPENROUTER_API_KEY not configured");
    }

    const stylePrompts: Record<string, string> = {
      professional: "Slightly more clinical phrasing. Keep 95% of original wording. Only adjust 1-2 tone words to sound more authoritative and trustworthy.",
      playful: "OLLY-style: warm, friendly, approachable but still informative. Soften formal words without adding jokes or puns. Millennials/GenZ friendly tone. NOT childish or silly.",
      premium: "Refine word choice to feel more upscale. Replace casual words with sophisticated alternatives. Keep structure identical. Think boutique wellness brand.",
      minimal: "Tighten phrasing only - remove filler words but keep all claims and benefits intact. More direct, no fluff.",
      bold: "Strengthen key action words only. Keep claims factual but more assertive and confident. Power words where appropriate.",
    };

    const styleInstruction = stylePrompts[style] || stylePrompts.professional;

    // Add timeout and retry logic for reliability
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    let response;
    let retries = 2;
    
    while (retries >= 0) {
      try {
        response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://lovable.dev",
            "X-Title": "Label Text Rewriter",
          },
          body: JSON.stringify({
            model: "google/gemini-3-pro-preview",
            messages: [
              {
                role: "system",
                content: `You are an expert packaging copywriter specializing in supplement labels. Make a SUBTLE tone adjustment to the front panel label text.

${styleInstruction}

CRITICAL: This is a SUBTLE tone adjustment, NOT a rewrite.
- Keep 90-95% of the original wording intact
- Only adjust 1-2 words per line maximum
- DO NOT change benefit claims or product facts
- DO NOT reorder or restructure content
- Think "polish" not "rewrite"
- The reader should barely notice the difference
- Reference: OLLY brand style - warm but still informative, never childish

RULES:
- Keep the same general structure (brand name line, product name, claim, bullets, callouts)
- Maintain all certification claims (FDA, GMP, etc.) exactly as given
- DO NOT invent new health claims or benefits not in the original
- Keep it concise - max 12 lines total
- Preserve any dosage or quantity information exactly
- Return ONLY the adjusted text, no explanations or commentary
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
          signal: controller.signal,
        });
        break; // Success, exit retry loop
      } catch (fetchError) {
        console.error(`Fetch attempt failed (${retries} retries left):`, fetchError);
        if (retries === 0) throw fetchError;
        retries--;
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s before retry
      }
    }
    
    clearTimeout(timeoutId);

    if (!response || !response.ok) {
      const errorText = response ? await response.text() : 'No response';
      console.error("OpenRouter error:", response?.status, errorText);
      
      if (response?.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a few seconds." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response?.status === 402) {
        return new Response(
          JSON.stringify({ error: "API credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`OpenRouter error: ${response?.status || 'unknown'}`);
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
