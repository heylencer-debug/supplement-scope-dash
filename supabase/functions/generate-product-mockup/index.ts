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
    
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) {
      throw new Error("OPENROUTER_API_KEY is not configured");
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
    
    // Get recommended packaging format (e.g., "Resealable Stand-Up Pouch", "Wide-Mouth Jar", "Bottle")
    const packagingFormat = designBrief.packagingFormat || "supplement bottle";

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

    // Detect target market from the data for imagery
    const isDogProduct = primaryClaim?.toLowerCase().includes('dog') || 
                         frontPanelText?.toLowerCase().includes('dog') ||
                         packagingFormat?.toLowerCase().includes('dog');
    const isCatProduct = primaryClaim?.toLowerCase().includes('cat') || 
                         frontPanelText?.toLowerCase().includes('cat');
    const isPetProduct = isDogProduct || isCatProduct;
    
    // Build a PREMIUM design prompt with essential content
    const promptParts = [
      `Premium ${packagingFormat} product photography. Modern, professional packaging design that balances elegance with clear product information.`,
      "",
      "DESIGN PHILOSOPHY: Premium and professional, but informative. Think Ritual, AG1, or high-end pet brands like Open Farm or Ollie.",
      ""
    ];

    // Colors
    promptParts.push("COLOR PALETTE:");
    if (primaryColorHex) {
      promptParts.push(`- Primary brand color: ${primaryColorHex}`);
    }
    if (secondaryColorHex) {
      promptParts.push(`- Secondary color: ${secondaryColorHex}`);
    }
    if (accentColorHex) {
      promptParts.push(`- Accent color: ${accentColorHex}`);
    }

    promptParts.push("");
    promptParts.push("LABEL CONTENT (include all of this, but with clean modern typography):");
    
    // Use the front panel mock content
    if (frontPanelText) {
      // Extract key elements from front panel
      const lines = frontPanelText.split('\n').filter((l: string) => l.trim());
      const headline = lines[0] || primaryClaim;
      const subheadline = lines.find((l: string) => l.includes('Support') || l.includes('For ')) || '';
      const quantity = lines.find((l: string) => l.includes('CHEW') || l.includes('CAPSULE') || l.includes('SERVING')) || '';
      const flavor = lines.find((l: string) => l.toLowerCase().includes('flavor')) || '';
      
      promptParts.push(`- Main headline: "${headline}"`);
      if (subheadline) promptParts.push(`- Subheadline: "${subheadline}"`);
      if (quantity) promptParts.push(`- Quantity: "${quantity}"`);
      if (flavor) promptParts.push(`- Flavor callout: "${flavor}"`);
    } else if (primaryClaim) {
      promptParts.push(`- Main headline: "${primaryClaim}"`);
    }
    
    // Key differentiators as small badges/icons
    if (keyDifferentiators?.length > 0) {
      promptParts.push(`- Feature badges (small, icon-style): ${keyDifferentiators.slice(0, 3).join(', ')}`);
    }
    
    // Certification badges
    if (certifications?.length > 0) {
      promptParts.push(`- Certification seals: ${certifications.slice(0, 3).join(', ')}`);
    }

    // TARGET MARKET IMAGERY
    promptParts.push("");
    promptParts.push("IMAGERY ON PACKAGING (important!):");
    if (isDogProduct) {
      promptParts.push("- Include a beautiful, happy, healthy dog image/illustration on the label");
      promptParts.push("- Dog should look vibrant, active, and healthy (golden retriever, lab, or friendly breed)");
      promptParts.push("- Can be a photo or elegant line illustration style");
    } else if (isCatProduct) {
      promptParts.push("- Include an elegant cat image/illustration on the label");
      promptParts.push("- Cat should look healthy and content");
    } else {
      promptParts.push("- Include lifestyle imagery suggesting health, vitality, and wellness");
      promptParts.push("- Could be abstract shapes, nature elements, or subtle human silhouettes");
    }

    // BENEFIT BULLET POINTS - Key selling points visible on front label
    if (bulletPoints?.length > 0) {
      promptParts.push("");
      promptParts.push("BENEFIT BULLET POINTS (must be visible on front label with checkmark or icon):");
      bulletPoints.slice(0, 5).forEach((bullet: string) => {
        // Extract short version for label (first 8-10 words or up to first colon)
        const colonIndex = bullet.indexOf(':');
        const shortBullet = colonIndex > 0 
          ? bullet.substring(0, colonIndex).trim()
          : bullet.split(' ').slice(0, 8).join(' ');
        promptParts.push(`✓ ${shortBullet}`);
      });
      promptParts.push("- Display these as checkmarks (✓) or bullet icons on the front panel");
      promptParts.push("- Use clear, bold typography for benefit claims - must be readable");
      promptParts.push("- Position prominently below the main headline");
    }

    // MODERN GRAPHIC ELEMENTS
    promptParts.push("");
    promptParts.push("MODERN GRAPHIC ELEMENTS (critical for contemporary premium look):");
    promptParts.push("- Include subtle geometric shapes or abstract wave/curve patterns as background elements");
    promptParts.push("- Add gradient overlays or color blocking sections for visual interest");
    promptParts.push("- Use modern flat icons for benefits (checkmarks, shields, leaf icons, medical cross)");
    promptParts.push("- Include ribbon banners or badge shapes for key claims like 'X-in-1' or 'Vet Recommended'");
    promptParts.push("- Add subtle texture or grain effect for premium tactile feel");
    if (isPetProduct) {
      promptParts.push("- Include paw print icons, bone shapes, or pet silhouettes as decorative accent elements");
      promptParts.push("- Consider a stylized pet illustration (line art or flat design) as a hero element");
    }

    // MODERN LAYOUT & TYPOGRAPHY
    promptParts.push("");
    promptParts.push("MODERN LAYOUT & TYPOGRAPHY:");
    promptParts.push("- Use BOLD, condensed sans-serif for headlines (like Montserrat Black, Avenir Heavy, Proxima Nova Bold)");
    promptParts.push("- Strong size contrast: headline very large, subheads medium, body small");
    promptParts.push("- Asymmetric or modern grid layout - NOT boring centered design");
    promptParts.push("- Color-blocked sections to organize information (header zone, benefits zone, details zone)");
    promptParts.push("- Floating badges or callout bubbles for key claims");
    promptParts.push("- Consider angled elements or diagonal lines for dynamic energy");

    // DESIGN INSPIRATION
    promptParts.push("");
    promptParts.push("DESIGN INSPIRATION (match this premium aesthetic):");
    promptParts.push("- AG1/Athletic Greens: Clean lines, scientific credibility, bold green, modern minimalism");
    promptParts.push("- Ritual: Elegant simplicity, lots of white space, sophisticated typography");
    promptParts.push("- Native Pet: Bold claims, playful colors, friendly but premium");
    promptParts.push("- Ollie/Open Farm: Nature-inspired but modern, premium pet aesthetic");
    promptParts.push("- Think 2024 D2C supplement brand, not 2010 GNC shelf product");

    promptParts.push("");
    promptParts.push("PREMIUM PACKAGING REQUIREMENTS:");
    promptParts.push(`- Modern, sleek ${packagingFormat} with matte or soft-touch finish appearance`);
    promptParts.push("- Clean visual hierarchy - headline largest, benefits prominent, details smaller but readable");
    promptParts.push("- Good use of whitespace, not cluttered but information-rich");
    promptParts.push("- Premium feel with subtle textures, gradients, and metallic accents on logo/badges");
    promptParts.push("- Professional D2C supplement brand aesthetic (not cheap pharmacy or generic looking)");
    promptParts.push("- MUST include visible benefit claims/bullet points on front panel");
    
    promptParts.push("");
    promptParts.push("PHOTOGRAPHY STYLE:");
    promptParts.push("- Professional product photography, Amazon/e-commerce hero image quality");
    promptParts.push("- Clean white or very light gradient background");
    promptParts.push("- Soft studio lighting with gentle shadows for depth");
    promptParts.push("- Product at slight 3/4 angle to show dimension and label detail");
    promptParts.push("- Sharp focus, high resolution, photorealistic rendering");
    promptParts.push("- Would look premium on Amazon, Chewy, or brand DTC website");

    const prompt = promptParts.join("\n");

    console.log("Generating product mockup with Nano Banana Pro via OpenRouter");
    console.log("Design brief received:", JSON.stringify(designBrief, null, 2));
    console.log("Generated prompt:", prompt);

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://lovable.dev",
        "X-Title": "Noodle Search"
      },
      body: JSON.stringify({
        model: "google/gemini-3-pro-image-preview",
        messages: [
          {
            role: "user",
            content: prompt
          }
        ]
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
    console.log("OpenRouter response received:", JSON.stringify(data).substring(0, 500));

    // Extract the generated image - OpenRouter may return it in different formats
    let imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    
    // Alternative format: inline_data in content parts
    if (!imageUrl && data.choices?.[0]?.message?.content) {
      const content = data.choices[0].message.content;
      if (Array.isArray(content)) {
        const imagePart = content.find((part: any) => part.type === 'image_url' || part.inline_data);
        if (imagePart?.image_url?.url) {
          imageUrl = imagePart.image_url.url;
        } else if (imagePart?.inline_data?.data) {
          imageUrl = `data:${imagePart.inline_data.mime_type || 'image/png'};base64,${imagePart.inline_data.data}`;
        }
      }
    }
    
    const textResponse = data.choices?.[0]?.message?.content;

    if (!imageUrl) {
      console.error("No image in response:", JSON.stringify(data));
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