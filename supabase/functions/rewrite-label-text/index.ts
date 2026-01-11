import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Comprehensive style definitions with headline examples
const stylePrompts: Record<string, { headline: string; body: string; examples: string }> = {
  professional: {
    headline: "2-3 clinical, authoritative words. Medical/pharmaceutical feel.",
    body: "Evidence-based language, regulatory-compliant claims, trustworthy",
    examples: "Clinical Focus | Neuro Support | Cognitive Elite | Pro Strength | MedGrade Plus"
  },
  playful: {
    headline: "2-3 friendly, warm words. OLLY-style approachable.",
    body: "Conversational, lifestyle-focused, emotionally connecting",
    examples: "Brain Buddy | Focus Friend | Happy Mind | Daily Boost | Feel Good"
  },
  premium: {
    headline: "2-3 sophisticated, luxury words. Boutique wellness feel.",
    body: "Elevated language, refined, understated elegance",
    examples: "Élite Focus | Luxe Mind | Noir Clarity | Refined | Prestige"
  },
  minimal: {
    headline: "1-2 essential words only. Apple-style reduction.",
    body: "Stripped down, no fluff, maximum clarity",
    examples: "Focus | Clarity | Mind | Pure | Essential"
  },
  bold: {
    headline: "2-3 POWER words. Assertive, action-oriented. ALL-CAPS OK.",
    body: "No hedging, direct benefit statements, maximum punch",
    examples: "FOCUS FUEL | MIND POWER | BRAIN BEAST | MAX FORCE | PURE POWER"
  },
  natural: {
    headline: "2-3 earthy, organic words. Farm-to-bottle feel.",
    body: "Plant-based emphasis, nature-inspired, authentic",
    examples: "Pure Focus | Earth Mind | Green Clarity | Nature's Gift | Rooted"
  },
  scientific: {
    headline: "2-3 tech/research words. Lab-backed precision.",
    body: "Data-driven, clinical study language, bioavailability mentions",
    examples: "NeuroMax | CogniCore | SynapseX | BioFocus | NeuroGen"
  },
  energetic: {
    headline: "2-3 high-energy words. Athletic, performance-focused.",
    body: "Speed/efficiency emphasis, results-focused",
    examples: "IGNITE | SURGE UP | POWER ON | GO MODE | ACTIVATE"
  },
  zen: {
    headline: "2-3 calm, peaceful words. Mindfulness-focused.",
    body: "Gentle language, balance, holistic approach",
    examples: "Still Mind | Clear Calm | Inner Focus | Zen State | Tranquil"
  },
  luxurious: {
    headline: "2-3 indulgent, exclusive words. Premium boutique.",
    body: "Rare, precious, hand-selected, bespoke",
    examples: "Noir Mind | Gold Reserve | Velvet | Opulent | Maison"
  },
  artisanal: {
    headline: "2-3 handcrafted, authentic words. Small-batch feel.",
    body: "Craft terminology, heritage, traditional methods",
    examples: "Batch Focus | Crafted Mind | Small Batch | Handmade | Heritage"
  },
  tech: {
    headline: "2-3 biohacker, futuristic words. Optimization-focused.",
    body: "Stack-friendly, protocol language, cutting-edge",
    examples: "NeuroStack | MindOS | CogHack | BioMod | SynapticX"
  }
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

    const styleConfig = stylePrompts[style] || stylePrompts.professional;

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
                content: `You are an expert packaging copywriter specializing in supplement labels. Transform the label text to match the "${style}" style.

=== HEADLINE TRANSFORMATION (LINE 1 - MOST CRITICAL) ===
${styleConfig.headline}

HEADLINE EXAMPLES for ${style} style:
${styleConfig.examples}

HEADLINE RULES:
- The headline MUST be exactly 2-3 words (or 1-2 for minimal style)
- The headline MUST be SHORT, PUNCHY, and MEMORABLE
- The headline MUST obviously reflect the ${style} tone
- NO long phrases like "Premium Cognitive Support Complex"
- YES short punches like the examples above
- This is the MOST important line - it sets the entire tone

=== BODY TEXT TRANSFORMATION ===
${styleConfig.body}

BODY RULES:
- Preserve all factual claims and ingredient information
- Transform the VOICE and WORD CHOICE to match ${style}
- Keep all certification claims (FDA, GMP, etc.) exactly as given
- Same benefits, completely different personality
- Keep checkmarks (✓) or bullets (•) for benefit lines
- Keep it concise - max 12 lines total
- Preserve any dosage or quantity information exactly

=== OUTPUT FORMAT ===
- Return ONLY the transformed text, no explanations
- Keep the same line-by-line structure
- First line = transformed headline (2-3 words)
- Following lines = transformed body content`
              },
              {
                role: "user",
                content: `Product context: ${productContext || 'Dietary supplement product'}

Current label text:
${currentText}

Transform this COMPLETELY to the ${style} style. The headline (first line) should be a SHORT 2-3 word punch that captures the ${style} personality. Examples: ${styleConfig.examples}`
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

    console.log("Label rewritten successfully with style:", style);

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
