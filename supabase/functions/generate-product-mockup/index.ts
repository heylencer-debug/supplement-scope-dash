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
    const { designBrief, mode = 'mockup' } = await req.json();
    const isFlat = mode === 'flat_layout';
    
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
    
    // NEW: Get flavor text for the label
    const flavorText = designBrief.flavorText;
    
    // NEW: Get suggested tone for design aesthetic
    const suggestedTone = designBrief.suggestedTone;
    
    // Get recommended packaging format (e.g., "Resealable Stand-Up Pouch", "Wide-Mouth Jar", "Bottle")
    const packagingFormat = designBrief.packagingFormat || "supplement bottle";
    
    // Flavor to product appearance mapping for realistic chew/gummy colors
    const flavorToProductAppearance: Record<string, { colors: string; description: string }> = {
      'chicken': { colors: 'golden brown, tan', description: 'golden brown chicken-colored chews' },
      'bacon': { colors: 'reddish brown, marbled', description: 'brown chews with reddish bacon marbling' },
      'beef': { colors: 'deep brown, maroon', description: 'deep brown beef-colored chews' },
      'salmon': { colors: 'salmon pink, coral', description: 'salmon pink/coral colored chews' },
      'fish': { colors: 'light pink, pale', description: 'light pink fish-colored chews' },
      'peanut butter': { colors: 'tan, creamy brown', description: 'creamy tan peanut butter colored chews' },
      'turkey': { colors: 'light tan, beige', description: 'light tan turkey-colored chews' },
      'liver': { colors: 'dark brown, burgundy', description: 'dark brown liver-colored chews' },
      'duck': { colors: 'golden, amber', description: 'golden amber duck-colored chews' },
      'lamb': { colors: 'light brown, rosy', description: 'light brown lamb-colored chews' },
      'venison': { colors: 'deep red brown', description: 'deep reddish-brown venison-colored chews' },
      'pork': { colors: 'pink, light brown', description: 'pink-tinted pork-colored chews' },
    };
    
    // Packaging format to shape/proportion details for accurate container rendering
    const packagingFormatDetails: Record<string, { shape: string; proportions: string; style: string }> = {
      'narrow-mouth glass jar': {
        shape: 'tall, slim cylindrical glass jar with narrow threaded opening',
        proportions: 'HEIGHT-TO-WIDTH RATIO OF 3:1 (three times taller than wide). TALL and NARROW like a vitamin pill bottle or apothecary jar. NOT wide or squat.',
        style: 'elegant pharmaceutical glass, clear or amber, slim profile'
      },
      'narrow-mouth plastic jar': {
        shape: 'tall, slim cylindrical plastic jar with narrow threaded cap',
        proportions: 'HEIGHT-TO-WIDTH RATIO OF 3:1 (three times taller than wide). TALL and NARROW like a supplement bottle. NOT wide or squat.',
        style: 'modern HDPE plastic, sleek pharmaceutical style, slim profile'
      },
      'wide-mouth plastic jar': {
        shape: 'wide, shorter cylindrical plastic jar with large opening',
        proportions: 'HEIGHT-TO-WIDTH RATIO OF 1:1.2 (wider than tall). Like a peanut butter jar or protein powder tub.',
        style: 'sturdy HDPE plastic, easy-scoop design'
      },
      'wide-mouth glass jar': {
        shape: 'wide, shorter cylindrical glass jar with large opening',
        proportions: 'HEIGHT-TO-WIDTH RATIO OF 1:1.2 (wider than tall). Mason jar style.',
        style: 'classic glass jar, wide opening'
      },
      'glass jar with screw cap': {
        shape: 'standard glass jar with metal screw cap',
        proportions: 'HEIGHT-TO-WIDTH RATIO OF 1.5:1. Balanced proportions.',
        style: 'traditional glass supplement jar'
      },
      'hexagonal glass jar': {
        shape: 'hexagonal (6-sided) glass jar with flat panels and screw cap',
        proportions: 'HEIGHT-TO-WIDTH RATIO OF 1.8:1. Distinctive hexagonal cross-section.',
        style: 'artisanal honey jar style, premium geometric design, clear glass with visible facets'
      },
      'square glass jar': {
        shape: 'square/rectangular glass jar with flat sides and screw cap',
        proportions: 'HEIGHT-TO-WIDTH RATIO OF 1.5:1. Clean square cross-section.',
        style: 'modern minimalist design, clear glass, sharp corners, premium spice jar aesthetic'
      },
      'amber apothecary jar': {
        shape: 'tall, elegant amber glass apothecary jar with wide cork or black screw cap',
        proportions: 'HEIGHT-TO-WIDTH RATIO OF 2.5:1. Classic apothecary silhouette - tall and elegant.',
        style: 'vintage pharmaceutical amber glass, apothecary/herbalist aesthetic, Victorian-era inspired'
      },
      'cobalt blue glass jar': {
        shape: 'elegant cobalt blue glass jar with silver or black cap',
        proportions: 'HEIGHT-TO-WIDTH RATIO OF 2:1. Premium pharmaceutical look.',
        style: 'deep cobalt blue glass, high-end supplement aesthetic, premium medicinal appearance'
      },
      'mason jar': {
        shape: 'classic mason jar with two-piece lid (flat lid + screw band)',
        proportions: 'HEIGHT-TO-WIDTH RATIO OF 1.3:1. Iconic mason jar shape.',
        style: 'traditional Ball/Kerr mason jar style, clear glass, embossed details, farmhouse aesthetic'
      },
      'amber dropper bottle': {
        shape: 'tall amber glass bottle with dropper/pipette cap',
        proportions: 'HEIGHT-TO-WIDTH RATIO OF 3:1. Tall and slim dropper bottle.',
        style: 'pharmaceutical amber glass, essential oil/tincture aesthetic, black rubber dropper bulb'
      },
      'resealable stand-up pouch': {
        shape: 'flexible stand-up pouch with zip-lock top',
        proportions: 'Tall pouch format, stands upright, approximately 2:1 height to width',
        style: 'modern matte or glossy pouch, premium pet food aesthetic'
      },
      'flat-bottom pouch': {
        shape: 'flexible pouch with flat bottom gusset for stability',
        proportions: 'Square-ish base, taller than wide',
        style: 'premium coffee bag style, matte finish'
      },
      'kraft paper bag': {
        shape: 'eco-friendly kraft paper stand-up bag with resealable top',
        proportions: 'HEIGHT-TO-WIDTH RATIO OF 1.5:1. Natural paper bag shape.',
        style: 'brown kraft paper, eco-friendly/sustainable aesthetic, minimalist natural look'
      },
      'bottle': {
        shape: 'cylindrical bottle with flip-top or screw cap',
        proportions: 'HEIGHT-TO-WIDTH RATIO OF 2.5:1. Tall and slim.',
        style: 'modern supplement bottle, HDPE or PET plastic'
      }
    };
    
    // Get container shape details for the selected format
    const formatLower = packagingFormat.toLowerCase();
    let containerDetails = packagingFormatDetails['bottle']; // default
    
    // Direct match first
    for (const [format, details] of Object.entries(packagingFormatDetails)) {
      if (formatLower.includes(format) || format.includes(formatLower)) {
        containerDetails = details;
        break;
      }
    }
    
    // Specific format matching
    if (formatLower.includes('hexagonal')) {
      containerDetails = packagingFormatDetails['hexagonal glass jar'];
    } else if (formatLower.includes('square') && formatLower.includes('glass')) {
      containerDetails = packagingFormatDetails['square glass jar'];
    } else if (formatLower.includes('amber') && formatLower.includes('apothecary')) {
      containerDetails = packagingFormatDetails['amber apothecary jar'];
    } else if (formatLower.includes('cobalt') || formatLower.includes('blue glass')) {
      containerDetails = packagingFormatDetails['cobalt blue glass jar'];
    } else if (formatLower.includes('mason')) {
      containerDetails = packagingFormatDetails['mason jar'];
    } else if (formatLower.includes('amber') && formatLower.includes('dropper')) {
      containerDetails = packagingFormatDetails['amber dropper bottle'];
    } else if (formatLower.includes('kraft')) {
      containerDetails = packagingFormatDetails['kraft paper bag'];
    } else if (formatLower.includes('narrow') && formatLower.includes('glass')) {
      containerDetails = packagingFormatDetails['narrow-mouth glass jar'];
    } else if (formatLower.includes('narrow') && formatLower.includes('plastic')) {
      containerDetails = packagingFormatDetails['narrow-mouth plastic jar'];
    } else if (formatLower.includes('wide') && formatLower.includes('glass')) {
      containerDetails = packagingFormatDetails['wide-mouth glass jar'];
    } else if (formatLower.includes('wide') && formatLower.includes('plastic')) {
      containerDetails = packagingFormatDetails['wide-mouth plastic jar'];
    } else if (formatLower.includes('pouch') && formatLower.includes('flat')) {
      containerDetails = packagingFormatDetails['flat-bottom pouch'];
    } else if (formatLower.includes('pouch') || formatLower.includes('bag')) {
      containerDetails = packagingFormatDetails['resealable stand-up pouch'];
    }
    
    // Detect flavor for product appearance
    let productAppearance: { colors: string; description: string } | null = null;
    if (flavorText) {
      const flavorLower = flavorText.toLowerCase();
      for (const [flavor, appearance] of Object.entries(flavorToProductAppearance)) {
        if (flavorLower.includes(flavor)) {
          productAppearance = appearance;
          break;
        }
      }
    }

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

    // EXACT FRONT PANEL TEXT - This is the MOST IMPORTANT section
    // The AI must render THIS EXACT TEXT on the front of the package
    promptParts.push("");
    promptParts.push("=== CRITICAL: EXACT FRONT PANEL TEXT TO RENDER ===");
    promptParts.push("The following text MUST appear on the front of the package EXACTLY as written:");
    promptParts.push("(Render this text clearly and legibly on the label)");
    promptParts.push("");
    
    if (frontPanelText) {
      promptParts.push('"""');
      promptParts.push(frontPanelText);
      promptParts.push('"""');
    } else if (primaryClaim) {
      promptParts.push(`Main headline: "${primaryClaim}"`);
    }
    
    promptParts.push("");
    promptParts.push("=== END EXACT TEXT ===");
    promptParts.push("");
    promptParts.push("ADDITIONAL LABEL ELEMENTS:");
    
    // Key differentiators as small badges/icons
    if (keyDifferentiators?.length > 0) {
      promptParts.push(`- Feature badges (small, icon-style): ${keyDifferentiators.slice(0, 3).join(', ')}`);
    }
    
    // Certification badges
    if (certifications?.length > 0) {
      promptParts.push(`- Certification seals: ${certifications.slice(0, 3).join(', ')}`);
    }
    
    // FLAVOR TEXT - Important for product identity
    if (flavorText) {
      promptParts.push("");
      promptParts.push("FLAVOR CALLOUT (must appear prominently on label):");
      promptParts.push(`- "${flavorText}"`);
      promptParts.push("- Position this below the main headline or in a flavor banner");
      promptParts.push("- Use appetizing, appealing typography for the flavor name");
    }
    
    // PRODUCT APPEARANCE BASED ON FLAVOR - Critical for realistic mockups
    if (productAppearance) {
      promptParts.push("");
      promptParts.push("=== PRODUCT APPEARANCE (CRITICAL FOR REALISM) ===");
      promptParts.push("The actual soft chews/gummies visible in/on the packaging should match the flavor:");
      promptParts.push(`- Product Color: ${productAppearance.colors}`);
      promptParts.push(`- Appearance: ${productAppearance.description}`);
      promptParts.push("- Show some chews/treats visible (either through window or displayed near package)");
      promptParts.push("- The product appearance should be appetizing and match the flavor profile");
      promptParts.push("=== END PRODUCT APPEARANCE ===");
    }
    
    // SUGGESTED TONE - Design aesthetic based on competitor analysis
    if (suggestedTone) {
      promptParts.push("");
      promptParts.push("=== DESIGN TONE & PERSONALITY (from competitor analysis) ===");
      promptParts.push(`- Primary Tone: ${suggestedTone.primaryTone || suggestedTone.primary_tone || 'premium'}`);
      if (suggestedTone.toneDescriptors || suggestedTone.tone_descriptors) {
        const descriptors = suggestedTone.toneDescriptors || suggestedTone.tone_descriptors;
        promptParts.push(`- Feel: ${Array.isArray(descriptors) ? descriptors.join(', ') : descriptors}`);
      }
      promptParts.push(`- Emotional Appeal: ${suggestedTone.emotionalAppeal || suggestedTone.emotional_appeal || 'trust-building'}`);
      promptParts.push(`- Copy Voice: ${suggestedTone.copyVoice || suggestedTone.copy_voice || 'authoritative'}`);
      promptParts.push("- The overall packaging aesthetic, typography, and visual elements should embody this tone");
      promptParts.push("=== END TONE ===");
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
    promptParts.push("=== CONTAINER SHAPE (CRITICAL - FOLLOW EXACTLY) ===");
    promptParts.push(`- Container Type: ${containerDetails.shape}`);
    promptParts.push(`- PROPORTIONS: ${containerDetails.proportions}`);
    promptParts.push(`- Style: ${containerDetails.style}`);
    if (formatLower.includes('narrow')) {
      promptParts.push("- IMPORTANT: This is a TALL, SLIM jar - significantly taller than it is wide");
      promptParts.push("- Think pharmacy vitamin bottle or elegant apothecary jar shape");
      promptParts.push("- The jar should be at least 3x taller than its width");
      promptParts.push("- DO NOT make it wide or squat like a peanut butter jar");
    }
    promptParts.push("=== END CONTAINER SHAPE ===");

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

    // Packaging-type-specific flat layout structures
    const flatLayoutStructures: Record<string, { 
      panels: string[]; 
      arrangement: string; 
      description: string;
      dimensions: string;
    }> = {
      'jar': {
        panels: ['Front Label (cylindrical wrap)', 'Back Label (continuous wrap)', 'Lid Top Circle', 'Neck Band Strip (optional)'],
        arrangement: 'Horizontal rectangular strip for wrap-around label + separate circular lid artwork',
        description: 'Cylindrical wrap-around label that covers the full circumference of the jar, plus circular lid design',
        dimensions: 'Label width = jar circumference, Label height = jar body height. Lid = circular to match jar diameter'
      },
      'pouch': {
        panels: ['Front Face (full panel)', 'Back Face (with supplement facts)', 'Left Gusset', 'Right Gusset', 'Bottom Gusset', 'Top Seal/Zipper Area'],
        arrangement: 'Laid flat showing front and back as main panels with gusset panels extending from sides and bottom',
        description: 'Stand-up pouch dieline with all gussets expanded flat, showing how it folds into 3D shape',
        dimensions: 'Front/Back faces are the largest panels. Gussets are narrower strips on sides and bottom'
      },
      'bottle': {
        panels: ['Front Label Strip', 'Back Label Strip (continuous)', 'Cap Top Circle', 'Neck Ring Band'],
        arrangement: 'Horizontal rectangular strip for wrap-around bottle label + circular cap artwork',
        description: 'Cylindrical bottle wrap label as horizontal strip that wraps around bottle body',
        dimensions: 'Label width = bottle circumference, Label height = label area on bottle'
      },
      'box': {
        panels: ['Front Panel (hero)', 'Back Panel', 'Left Side Panel', 'Right Side Panel', 'Top Flap', 'Bottom Flap'],
        arrangement: 'Cross/crucifix dieline layout with front panel in center, sides extending left/right, top/bottom extending up/down',
        description: 'Standard box dieline showing all 6 faces connected with fold lines',
        dimensions: 'All panels proportional to actual box dimensions'
      },
      'bag': {
        panels: ['Front Face', 'Back Face', 'Bottom Gusset', 'Top Seal Area'],
        arrangement: 'Two main rectangular faces with gusset at bottom and seal area at top',
        description: 'Flat bag layout with front/back and bottom expansion gusset',
        dimensions: 'Front/Back are equal size, bottom gusset is narrower strip'
      },
      'dropper': {
        panels: ['Bottle Front Label', 'Bottle Back Label', 'Box Front', 'Box Back', 'Box Left Side', 'Box Right Side', 'Box Top', 'Box Bottom'],
        arrangement: 'Small cylindrical label strip for dropper bottle + full box dieline for secondary packaging',
        description: 'Dropper bottle label (small strip) plus outer carton box dieline',
        dimensions: 'Bottle label is small strip. Box panels sized for dropper bottle dimensions'
      }
    };

    // Helper function to detect packaging category from format string
    function getPackagingCategory(format: string): string {
      const f = format.toLowerCase();
      if (f.includes('stand-up') || f.includes('standup') || f.includes('resealable') && f.includes('pouch')) return 'pouch';
      if (f.includes('pouch') || f.includes('sachet')) return 'pouch';
      if (f.includes('flat-bottom') || f.includes('flat bottom')) return 'pouch';
      if (f.includes('kraft') || f.includes('paper bag')) return 'bag';
      if (f.includes('dropper')) return 'dropper';
      if (f.includes('bottle')) return 'bottle';
      if (f.includes('jar')) return 'jar';
      if (f.includes('box') || f.includes('carton')) return 'box';
      if (f.includes('bag')) return 'bag';
      return 'jar'; // default fallback
    }

    // Build the flat layout prompt if mode is 'flat_layout'
    let prompt: string;
    
    if (isFlat) {
      const packagingCategory = getPackagingCategory(packagingFormat);
      const layoutStructure = flatLayoutStructures[packagingCategory] || flatLayoutStructures['jar'];
      
      const flatPromptParts = [
        `=== 2D FLAT DIELINE LAYOUT FOR ${packagingFormat.toUpperCase()} ===`,
        "",
        "Create a FLAT, UNWRAPPED, 2D packaging dieline layout suitable for printing and die-cutting.",
        "This is a PRINT-READY layout that will be edited in Photoshop/Illustrator.",
        "",
        "=== CRITICAL REQUIREMENTS ===",
        "- This is a 2D FLAT VIEW - absolutely NO perspective, NO shadows, NO 3D effects",
        "- Show the packaging UNFOLDED as it would appear on a die-cut sheet before assembly",
        "- All panels must be connected showing how they fold together",
        "- Include visible fold/score lines (thin dotted or dashed lines between panels)",
        "- Include bleed area (slight color extension beyond trim lines)",
        "- White background surrounding the dieline",
        "- Registration/crop marks at corners",
        "",
        `=== PACKAGING TYPE: ${packagingFormat} ===`,
        `Category: ${packagingCategory.toUpperCase()}`,
        `Description: ${layoutStructure.description}`,
        "",
        "=== PANEL STRUCTURE ===",
        `Arrangement: ${layoutStructure.arrangement}`,
        `Dimensions: ${layoutStructure.dimensions}`,
        "",
        "PANELS TO INCLUDE:",
      ];
      
      layoutStructure.panels.forEach((panel, index) => {
        flatPromptParts.push(`${index + 1}. ${panel}`);
      });
      
      flatPromptParts.push("");
      flatPromptParts.push("=== DESIGN ELEMENTS (MUST MATCH 3D MOCKUP EXACTLY) ===");
      flatPromptParts.push("");
      flatPromptParts.push("COLOR PALETTE:");
      if (primaryColorHex) flatPromptParts.push(`- Primary: ${primaryColorName || ''} ${primaryColorHex}`);
      if (secondaryColorHex) flatPromptParts.push(`- Secondary: ${secondaryColorName || ''} ${secondaryColorHex}`);
      if (accentColorHex) flatPromptParts.push(`- Accent: ${accentColorName || ''} ${accentColorHex}`);
      
      // Include the design tone (critical for matching the mockup)
      if (suggestedTone) {
        flatPromptParts.push("");
        flatPromptParts.push("DESIGN TONE & AESTHETIC:");
        flatPromptParts.push(`- Primary Tone: ${suggestedTone.primaryTone || suggestedTone.primary_tone || 'premium'}`);
        if (suggestedTone.toneDescriptors || suggestedTone.tone_descriptors) {
          const descriptors = suggestedTone.toneDescriptors || suggestedTone.tone_descriptors;
          flatPromptParts.push(`- Style Descriptors: ${Array.isArray(descriptors) ? descriptors.join(', ') : descriptors}`);
        }
        flatPromptParts.push(`- Emotional Appeal: ${suggestedTone.emotionalAppeal || suggestedTone.emotional_appeal || 'trust-building'}`);
        flatPromptParts.push(`- Copy Voice: ${suggestedTone.copyVoice || suggestedTone.copy_voice || 'authoritative'}`);
      }
      
      flatPromptParts.push("");
      flatPromptParts.push("GRAPHIC ELEMENTS (replicate from mockup):");
      flatPromptParts.push("- Geometric shapes, wave patterns, or abstract elements as background");
      flatPromptParts.push("- Gradient overlays or color-blocked sections");
      flatPromptParts.push("- Icon badges (checkmarks, shields, certification seals)");
      flatPromptParts.push("- Ribbon banners or badge shapes for key claims");
      if (isPetProduct) {
        flatPromptParts.push("- Pet imagery: paw prints, animal silhouettes, pet illustrations");
      }
      
      flatPromptParts.push("");
      flatPromptParts.push("TYPOGRAPHY STYLE:");
      flatPromptParts.push("- Bold, condensed sans-serif for headlines");
      flatPromptParts.push("- Strong size contrast between headline, subheads, and body");
      flatPromptParts.push("- Modern grid layout with color-blocked sections");
      if (headlineFont) flatPromptParts.push(`- Headline Font Style: ${headlineFont}`);
      if (bodyFont) flatPromptParts.push(`- Body Font Style: ${bodyFont}`);
      
      flatPromptParts.push("");
      flatPromptParts.push("=== FRONT PANEL CONTENT (EXACT TEXT) ===");
      if (frontPanelText) {
        flatPromptParts.push('"""');
        flatPromptParts.push(frontPanelText);
        flatPromptParts.push('"""');
      } else if (primaryClaim) {
        flatPromptParts.push(`Main headline: "${primaryClaim}"`);
      }
      
      if (flavorText) {
        flatPromptParts.push("");
        flatPromptParts.push(`FLAVOR CALLOUT: "${flavorText}" - display prominently below headline`);
      }
      
      if (bulletPoints?.length > 0) {
        flatPromptParts.push("");
        flatPromptParts.push("BENEFIT BULLETS (with checkmarks):");
        bulletPoints.slice(0, 5).forEach((bullet: string) => {
          const colonIndex = bullet.indexOf(':');
          const shortBullet = colonIndex > 0 
            ? bullet.substring(0, colonIndex).trim()
            : bullet.split(' ').slice(0, 8).join(' ');
          flatPromptParts.push(`✓ ${shortBullet}`);
        });
      }
      
      if (keyDifferentiators?.length > 0) {
        flatPromptParts.push("");
        flatPromptParts.push(`FEATURE BADGES: ${keyDifferentiators.slice(0, 4).join(', ')}`);
      }
      
      flatPromptParts.push("");
      flatPromptParts.push("=== BACK PANEL CONTENT ===");
      flatPromptParts.push("- Supplement Facts box (structured table layout)");
      flatPromptParts.push("- Directions for use section");
      flatPromptParts.push("- Full ingredient list");
      flatPromptParts.push("- Warnings and storage information");
      flatPromptParts.push("- Manufacturer contact info");
      flatPromptParts.push("- Barcode placeholder (UPC area)");
      
      if (certifications?.length > 0) {
        flatPromptParts.push("");
        flatPromptParts.push(`CERTIFICATION SEALS: ${certifications.join(', ')}`);
        flatPromptParts.push("- Display as seal/badge graphics on front and/or back panel");
      }
      
      if (trustSignalsList) {
        flatPromptParts.push("");
        flatPromptParts.push(`TRUST SIGNALS: ${trustSignalsList}`);
      }
      
      // Product appearance for realistic chew/gummy imagery
      if (productAppearance) {
        flatPromptParts.push("");
        flatPromptParts.push("PRODUCT IMAGERY:");
        flatPromptParts.push(`- If showing product image: ${productAppearance.description}`);
        flatPromptParts.push(`- Product colors: ${productAppearance.colors}`);
      }
      
      flatPromptParts.push("");
      flatPromptParts.push("=== OUTPUT SPECIFICATIONS ===");
      flatPromptParts.push("- Flat 2D dieline on clean white background");
      flatPromptParts.push("- All panels connected with visible fold lines (dotted)");
      flatPromptParts.push("- Print-ready proportions matching actual packaging dimensions");
      flatPromptParts.push("- High contrast, sharp edges, readable text");
      flatPromptParts.push("- Professional packaging design quality");
      flatPromptParts.push("- Suitable for opening and editing in Photoshop/Illustrator");
      flatPromptParts.push("- Include safe zone inside trim and bleed outside trim");
      
      prompt = flatPromptParts.join("\n");
    } else {
      prompt = promptParts.join("\n");
    }

    console.log(`Generating ${isFlat ? 'flat layout' : 'product mockup'} with Nano Banana Pro via OpenRouter`);
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