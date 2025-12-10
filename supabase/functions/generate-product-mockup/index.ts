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
    const { designBrief } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Validate required design data
    if (!designBrief) {
      throw new Error("Design brief data is required");
    }

    // Extract design details from the actual AI analysis
    const primaryColorName = designBrief.primaryColor?.name;
    const primaryColorHex = designBrief.primaryColor?.hex;
    const secondaryColorName = designBrief.secondaryColor?.name;
    const secondaryColorHex = designBrief.secondaryColor?.hex;
    const accentColorName = designBrief.accentColor?.name;
    const accentColorHex = designBrief.accentColor?.hex;
    const primaryClaim = designBrief.primaryClaim;
    const certifications = designBrief.certifications;
    const bulletPoints = designBrief.bulletPoints;
    const callToAction = designBrief.callToAction;
    const headlineFont = designBrief.headlineFont;
    const bodyFont = designBrief.bodyFont;
    
    // NEW: Get the actual mock content text for the label
    const frontPanelText = designBrief.frontPanelText;
    const keyDifferentiators = designBrief.keyDifferentiators;
    const trustSignals = designBrief.trustSignals;

    // Build certification string
    const certBadges = certifications?.length > 0 
      ? certifications.slice(0, 4).join(", ")
      : null;

    // Build bullet points string
    const benefitsList = bulletPoints?.length > 0
      ? bulletPoints.slice(0, 3).join("; ")
      : null;

    // Build differentiators string
    const differentiatorsList = keyDifferentiators?.length > 0
      ? keyDifferentiators.slice(0, 4).join(", ")
      : null;

    // Build trust signals string  
    const trustSignalsList = trustSignals?.length > 0
      ? trustSignals.slice(0, 3).join(", ")
      : null;

    // Build a detailed, data-driven prompt using MOCK CONTENT
    const promptParts = [
      "Professional product photography of a premium supplement gummy bottle on a clean white studio background.",
      "",
      "EXACT LABEL TEXT TO DISPLAY (use this exact text on the bottle label):"
    ];

    // Use the front panel mock content if available - this is the PRIMARY source
    if (frontPanelText) {
      promptParts.push("");
      promptParts.push("--- FRONT LABEL TEXT (copy exactly) ---");
      promptParts.push(frontPanelText);
      promptParts.push("--- END FRONT LABEL ---");
    } else {
      // Fallback to individual fields if no mock content
      if (primaryClaim) {
        promptParts.push(`- Main headline: "${primaryClaim}"`);
      }
      if (benefitsList) {
        promptParts.push(`- Benefit bullets: ${benefitsList}`);
      }
      if (callToAction) {
        promptParts.push(`- Call to action: "${callToAction}"`);
      }
    }

    promptParts.push("");
    promptParts.push("DESIGN SPECIFICATIONS:");

    // Colors
    if (primaryColorName && primaryColorHex) {
      promptParts.push(`- Primary bottle/label color: ${primaryColorName} (${primaryColorHex})`);
    }
    if (secondaryColorName && secondaryColorHex) {
      promptParts.push(`- Secondary color for text/accents: ${secondaryColorName} (${secondaryColorHex})`);
    }
    if (accentColorName && accentColorHex) {
      promptParts.push(`- Accent color for highlights: ${accentColorName} (${accentColorHex})`);
    }

    // Typography
    if (headlineFont) {
      promptParts.push(`- Headline typography: ${headlineFont}`);
    }
    if (bodyFont) {
      promptParts.push(`- Body text: ${bodyFont}`);
    }

    // Badges and certifications
    if (certBadges) {
      promptParts.push(`- Certification badges: ${certBadges}`);
    }
    if (differentiatorsList) {
      promptParts.push(`- Key differentiator badges: ${differentiatorsList}`);
    }
    if (trustSignalsList) {
      promptParts.push(`- Trust signals: ${trustSignalsList}`);
    }

    promptParts.push("");
    promptParts.push("PHOTOGRAPHY REQUIREMENTS:");
    promptParts.push("- Photorealistic, commercial product photography");
    promptParts.push("- Clean white or light gradient studio background");
    promptParts.push("- Professional studio lighting with soft shadows");
    promptParts.push("- Premium supplement bottle with modern, clean label design");
    promptParts.push("- IMPORTANT: The label text must be legible and match the exact text provided above");
    promptParts.push("- High-end pharmaceutical aesthetic");
    promptParts.push("- 4K detail, sharp focus on product");
    promptParts.push("- Slight surface reflection for premium feel");

    const prompt = promptParts.join("\n");

    console.log("Generating product mockup with Nano Banana Pro model");
    console.log("Design brief received:", JSON.stringify(designBrief, null, 2));
    console.log("Generated prompt:", prompt);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-pro-image-preview",
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        modalities: ["image", "text"]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits in workspace settings." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`AI Gateway error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log("AI response received");

    // Extract the generated image
    const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    const textResponse = data.choices?.[0]?.message?.content;

    if (!imageUrl) {
      console.error("No image in response:", JSON.stringify(data).substring(0, 1000));
      throw new Error("No image generated in response");
    }

    console.log("Product mockup generated successfully");

    return new Response(
      JSON.stringify({ 
        imageUrl,
        message: textResponse || "Product mockup generated successfully"
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error generating product mockup:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Failed to generate mockup" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});