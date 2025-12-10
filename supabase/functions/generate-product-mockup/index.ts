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

    // Extract design details for the prompt
    const primaryColor = designBrief?.primaryColor?.name || "deep blue";
    const primaryHex = designBrief?.primaryColor?.hex || "#1a365d";
    const secondaryColor = designBrief?.secondaryColor?.name || "white";
    const accentColor = designBrief?.accentColor?.name || "gold";
    const accentHex = designBrief?.accentColor?.hex || "#f6ad55";
    const primaryClaim = designBrief?.primaryClaim || "Premium Formula";
    const certifications = designBrief?.certifications?.slice(0, 3)?.join(", ") || "GMP, Non-GMO";
    const productType = designBrief?.productType || "supplement bottle";

    // Build a detailed prompt for product packaging mockup
    const prompt = `Professional product photography of a premium ${productType} supplement container on a clean studio background. 

Design specifications:
- Main bottle color: ${primaryColor} (${primaryHex})
- Label accent color: ${accentColor} (${accentHex})
- Clean, modern, pharmaceutical-grade aesthetic
- Premium supplement packaging with ${secondaryColor} label text
- Product name: "${primaryClaim}" prominently displayed
- Certification badges visible: ${certifications}
- Studio lighting, soft shadows, high-end product shot
- Photorealistic, commercial quality, 4K detail
- White or light gradient background
- Slight reflection on surface for premium feel

Style: Clean, trustworthy, health-focused, premium supplement brand photography.`;

    console.log("Generating product mockup with prompt:", prompt);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
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
      
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    console.log("AI response received");

    // Extract the generated image
    const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    const textResponse = data.choices?.[0]?.message?.content;

    if (!imageUrl) {
      console.error("No image in response:", JSON.stringify(data).substring(0, 500));
      throw new Error("No image generated");
    }

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