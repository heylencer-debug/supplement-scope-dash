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
    const { designBrief, mode = 'mockup', referenceImageUrl, flatLayoutMode = 'full', logoImageUrl } = await req.json();
    const isFlat = mode === 'flat_layout';
    const isFrontOnly = flatLayoutMode === 'front_only';
    
    // Debug logging for flat layout reference image
    console.log(`Mode: ${mode}, isFlat: ${isFlat}, flatLayoutMode: ${flatLayoutMode}`);
    console.log(`Reference image received: ${referenceImageUrl ? 'YES (length: ' + referenceImageUrl.length + ', starts with: ' + referenceImageUrl.substring(0, 50) + '...)' : 'NO'}`);
    
    // Validate reference image format
    const hasValidReferenceImage = isFlat && referenceImageUrl && 
      (referenceImageUrl.startsWith('data:image') || referenceImageUrl.startsWith('http'));
    
    if (isFlat) {
      console.log(`Has valid reference image for flat layout: ${hasValidReferenceImage}`);
    }
    
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
    
    // NEW: Get AI-decided hero imagery from packaging analysis
    const heroImagery = designBrief.heroImagery || designBrief.hero_imagery;
    
    // NEW: Get brand name and product name from packaging analysis
    const brandName = designBrief.brandName || designBrief.brand_name || 'PREMIUM';
    const productName = designBrief.productName || designBrief.product_name || primaryClaim;
    console.log("Hero imagery received:", JSON.stringify(heroImagery));
    console.log("Colors received:", { primary: primaryColorHex, secondary: secondaryColorHex, accent: accentColorHex });
    
    // Debug logging for new label design fields
    console.log("Label atmosphere received:", JSON.stringify(designBrief.labelAtmosphere || designBrief.label_atmosphere));
    console.log("Label hierarchy received:", JSON.stringify(designBrief.labelHierarchy || designBrief.label_hierarchy));
    console.log("Claims with icons received:", JSON.stringify(designBrief.claimsWithIcons || designBrief.claims_with_icons));
    
    // NEW: Check if user has customized colors
    const colorsCustomized = designBrief.colorsCustomized === true;
    console.log("Colors customized by user:", colorsCustomized);
    
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
    
    // Flavor to fruit/ingredient imagery mapping for prominent visual elements
    const flavorToImagery: Record<string, { fruit: string; colors: string; style: string }> = {
      // Berry flavors
      'berry': { fruit: 'mixed berries (blueberries, raspberries, blackberries)', colors: 'deep purple, red, blue', style: 'scattered fresh berries with juice splashes, glistening with dewdrops' },
      'blueberry': { fruit: 'fresh blueberries', colors: 'deep blue, purple', style: 'cluster of blueberries with green leaves, juice droplets, some berries cut to show interior' },
      'strawberry': { fruit: 'fresh strawberries', colors: 'bright red, pink', style: 'sliced strawberries showing seeds, strawberry halves with juice splash, leaves attached' },
      'raspberry': { fruit: 'fresh raspberries', colors: 'deep pink, magenta', style: 'raspberries with subtle texture detail, scattered with some crushed showing juice' },
      'blackberry': { fruit: 'fresh blackberries', colors: 'dark purple, black', style: 'glossy blackberries with small leaves, some showing drupelets' },
      'acai': { fruit: 'acai berries', colors: 'deep purple', style: 'acai berries in bowl or palm frond, tropical aesthetic' },
      'cranberry': { fruit: 'cranberries', colors: 'deep red, burgundy', style: 'whole cranberries, some halved, splash of juice' },
      'mixed berry': { fruit: 'assorted berries (strawberry, blueberry, raspberry)', colors: 'red, blue, purple medley', style: 'beautiful arrangement of multiple berry types with splashes' },
      
      // Citrus flavors
      'orange': { fruit: 'orange slices', colors: 'bright orange', style: 'orange cross-sections showing segments, peel zest curls, juice splash, refreshing' },
      'lemon': { fruit: 'lemon slices', colors: 'bright yellow', style: 'lemon wedges with zest, refreshing splash, water droplets' },
      'lime': { fruit: 'lime slices', colors: 'vibrant green', style: 'lime wedges, zest strips, mojito-fresh aesthetic' },
      'citrus': { fruit: 'mixed citrus (orange, lemon, lime)', colors: 'orange, yellow, green', style: 'citrus wheel arrangement, multiple slices overlapping' },
      'grapefruit': { fruit: 'grapefruit halves', colors: 'pink, coral', style: 'grapefruit segments, ruby red flesh, refreshing' },
      'tangerine': { fruit: 'tangerine segments', colors: 'deep orange', style: 'peeled tangerine segments, easy-peel aesthetic' },
      
      // Tropical flavors
      'mango': { fruit: 'mango slices', colors: 'golden yellow, orange', style: 'cubed mango hedgehog cut, tropical leaves, juice dripping' },
      'pineapple': { fruit: 'pineapple', colors: 'golden yellow', style: 'pineapple rings, chunks, tropical crown leaves' },
      'coconut': { fruit: 'coconut halves', colors: 'white, brown', style: 'coconut halves with white flesh, shavings, palm aesthetic' },
      'tropical': { fruit: 'tropical fruit mix', colors: 'bright multicolor', style: 'mango, pineapple, coconut paradise arrangement' },
      'passion fruit': { fruit: 'passion fruit halves', colors: 'purple, yellow', style: 'passion fruit cut open showing seeds and pulp' },
      'papaya': { fruit: 'papaya slices', colors: 'orange, coral', style: 'papaya halves with black seeds visible, tropical' },
      'guava': { fruit: 'guava slices', colors: 'pink, green', style: 'guava halves showing pink flesh, tropical leaves' },
      
      // Other fruits
      'apple': { fruit: 'apples', colors: 'red, green', style: 'apple slices, whole apples with leaves, crisp and fresh' },
      'grape': { fruit: 'grapes', colors: 'purple, green', style: 'grape clusters with vine leaves, wine country aesthetic' },
      'cherry': { fruit: 'cherries', colors: 'deep red', style: 'cherry pairs with stems, glossy, maraschino style' },
      'peach': { fruit: 'peaches', colors: 'peach, coral', style: 'peach halves showing pit, fuzzy skin texture, summer fresh' },
      'watermelon': { fruit: 'watermelon', colors: 'pink, green', style: 'watermelon slices, triangular cuts, seeds visible, refreshing' },
      'pomegranate': { fruit: 'pomegranate', colors: 'deep red', style: 'pomegranate seeds (arils) scattered, cut open fruit revealing jewel-like interior' },
      'banana': { fruit: 'bananas', colors: 'yellow, cream', style: 'peeled banana, banana slices, tropical smoothie feel' },
      'kiwi': { fruit: 'kiwi slices', colors: 'green, brown', style: 'kiwi cross-sections showing seeds and pattern, fuzzy skin' },
      
      // Non-fruit flavors
      'mint': { fruit: 'mint leaves', colors: 'fresh green', style: 'mint sprigs, scattered leaves, refreshing ice-cold aesthetic' },
      'vanilla': { fruit: 'vanilla beans', colors: 'cream, brown', style: 'vanilla pods split open, creamy swirls, seeds visible' },
      'chocolate': { fruit: 'cacao/chocolate', colors: 'rich brown', style: 'chocolate pieces, cacao nibs, chocolate drizzle, indulgent' },
      'honey': { fruit: 'honeycomb', colors: 'golden amber', style: 'honeycomb hexagons, honey drip, bee aesthetic' },
      'cinnamon': { fruit: 'cinnamon sticks', colors: 'warm brown', style: 'cinnamon sticks, ground spice, cozy warm aesthetic' },
      'ginger': { fruit: 'ginger root', colors: 'golden, tan', style: 'fresh ginger root, sliced ginger, spicy warmth' },
      'turmeric': { fruit: 'turmeric root', colors: 'bright orange-gold', style: 'fresh turmeric root, golden powder, wellness aesthetic' },
      'green tea': { fruit: 'tea leaves', colors: 'matcha green', style: 'green tea leaves, matcha powder, zen aesthetic' },
      'coffee': { fruit: 'coffee beans', colors: 'deep brown', style: 'coffee beans, espresso swirl, energizing aesthetic' },
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
    
    // Detect flavor for fruit/ingredient imagery (used by BOTH 3D mockup and flat layouts)
    let flavorImagery: { fruit: string; colors: string; style: string } | null = null;
    if (flavorText) {
      const flavorLower = flavorText.toLowerCase();
      for (const [flavor, imagery] of Object.entries(flavorToImagery)) {
        if (flavorLower.includes(flavor)) {
          flavorImagery = imagery;
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
    ];
    
    // Check if a valid logo image is provided (for brand name handling)
    const hasLogoProvided = logoImageUrl && 
      (logoImageUrl.startsWith('data:image') || logoImageUrl.startsWith('http'));
    
    // Check if text was customized (from AI rewriter) - if so, frontPanelText is the source of truth
    const textCustomized = designBrief.textCustomized === true;
    
    // =================================================================
    // VISUAL HIERARCHY FOR SUPPLEMENTS (ADD THIS FIRST)
    // =================================================================
    promptParts.push("");
    promptParts.push("=== VISUAL HIERARCHY FOR SUPPLEMENTS (FOLLOW THIS ORDER) ===");
    
    // If logo is provided, skip brand name text to avoid duplication
    if (hasLogoProvided) {
      promptParts.push("1. BRAND LOGO - Already provided as image, place at TOP CENTER of label. DO NOT add brand name as text - the logo IS the brand identity.");
      if (textCustomized && frontPanelText) {
        // Extract product name from customized front panel text (first line)
        const extractedName = frontPanelText.split('\n')[0].trim();
        promptParts.push(`2. PRODUCT NAME: "${extractedName}" - LARGEST text, main focus, directly below the logo`);
      } else {
        promptParts.push(`2. PRODUCT NAME: "${productName}" - LARGEST text, main focus, directly below the logo`);
      }
    } else {
      if (textCustomized && frontPanelText) {
        // When text is customized by AI, DO NOT use original brandName - extract from frontPanelText
        const extractedName = frontPanelText.split('\n')[0].trim();
        promptParts.push("1. BRAND NAME: Use brand identity from the front panel text content - design a stylized text logo treatment");
        promptParts.push(`2. PRODUCT NAME: "${extractedName}" - LARGEST text, main focus, center of label`);
      } else {
        promptParts.push(`1. BRAND NAME: "${brandName}" - Top of label, PROMINENT, stylized logo treatment with premium typography`);
        promptParts.push(`2. PRODUCT NAME: "${productName}" - LARGEST text, main focus, center of label`);
      }
    }
    promptParts.push("3. PRIMARY CLAIM - Key benefit statement, second largest");
    promptParts.push("4. BENEFIT BULLETS - Clear, readable, with SEMANTIC ICONS (see icon guidance below)");
    promptParts.push("5. FLAVOR TEXT - Visible but not dominant (e.g., 'Natural Mixed Berry Flavor')");
    promptParts.push("6. FLAVOR IMAGERY - Small accent only, NOT the hero element");
    promptParts.push("7. CERTIFICATIONS/BADGES - Bottom area, small but visible");
    promptParts.push("");
    promptParts.push("THE PACKAGING SHOULD CLEARLY READ AS A SUPPLEMENT, NOT A FOOD/DRINK PRODUCT.");
    promptParts.push("=== END HIERARCHY ===");
    promptParts.push("");
    
    // =================================================================
    // BENEFIT ICON GUIDANCE - SEMANTIC ICONS ONLY
    // =================================================================
    promptParts.push("=== BENEFIT ICON GUIDANCE (MANDATORY) ===");
    promptParts.push("");
    promptParts.push("When showing benefits/feature bullets, use SEMANTIC ICONS that visually represent each benefit:");
    promptParts.push("");
    promptParts.push("ICON EXAMPLES BY BENEFIT TYPE:");
    promptParts.push("- Energy/Strength: lightning bolt ⚡, flexed arm 💪, battery icon");
    promptParts.push("- Sleep/Calm: moon 🌙, pillow, cloud, ZZZ");
    promptParts.push("- Heart/Cardio: heart icon ❤️, heartbeat line");
    promptParts.push("- Brain/Focus: brain icon 🧠, lightbulb 💡, target 🎯");
    promptParts.push("- Bone/Joint: bone icon 🦴, joint/knee shape");
    promptParts.push("- Immune: shield icon 🛡️, plus sign");
    promptParts.push("- Digestion/Gut: stomach icon, leaf 🌿");
    promptParts.push("- Beauty/Skin: sparkle ✨, diamond 💎, dewdrop");
    promptParts.push("- Muscle: dumbbell 🏋️, flexed bicep");
    promptParts.push("- Mood: smiley face 😊, sun ☀️");
    promptParts.push("- Antioxidant: shield, cell icon");
    promptParts.push("");
    promptParts.push("❌ DO NOT USE:");
    promptParts.push("- Generic checkmarks (✓ ✔ ☑) for all bullets");
    promptParts.push("- Numbers or letters as bullets");
    promptParts.push("- Plain dots or dashes");
    promptParts.push("");
    promptParts.push("✅ DO USE:");
    promptParts.push("- A DIFFERENT, RELEVANT icon for each benefit");
    promptParts.push("- Icons that help readers understand the benefit at a glance");
    promptParts.push("- Clean, simple line icons (not complex illustrations)");
    promptParts.push("");
    promptParts.push("Example: If benefits are 'Supports Energy, Better Sleep, Heart Health'");
    promptParts.push("→ Use: ⚡ Supports Energy | 🌙 Better Sleep | ❤️ Heart Health");
    promptParts.push("→ NOT: ✓ Supports Energy | ✓ Better Sleep | ✓ Heart Health");
    promptParts.push("");
    promptParts.push("=== END ICON GUIDANCE ===");
    promptParts.push("");
    
    // =================================================================
    // HERO IMAGERY - REDUCED PROMINENCE FOR SUPPLEMENTS
    // =================================================================
    if (heroImagery && (heroImagery.primary_visual || heroImagery.primaryVisual)) {
      const primaryVisual = heroImagery.primary_visual || heroImagery.primaryVisual;
      const visualStyle = heroImagery.visual_style || heroImagery.visualStyle || 'photorealistic';
      const prominence = heroImagery.prominence || 'accent'; // DEFAULT TO ACCENT, NOT HERO
      
      promptParts.push("=== FLAVOR/INGREDIENT IMAGERY (SUPPORTING ELEMENT - NOT MAIN FOCUS) ===");
      promptParts.push("");
      promptParts.push("THIS IS A SUPPLEMENT PRODUCT, NOT A BEVERAGE OR FOOD PRODUCT.");
      promptParts.push("The imagery should SUPPORT the packaging design, not DOMINATE it.");
      promptParts.push("");
      promptParts.push(`IMAGERY TO INCLUDE: ${primaryVisual}`);
      promptParts.push(`STYLE: ${visualStyle}`);
      promptParts.push("");
      promptParts.push("🚨 CRITICAL SIZE & PLACEMENT RULES:");
      if (prominence === 'hero' || prominence === 'main') {
        // Only pet products should have hero prominence
        promptParts.push("- Imagery takes up 15-20% of the front label (pet products only)");
        promptParts.push("- Position prominently but product name is still the MAIN focus");
      } else {
        // Human supplements default to accent prominence
        promptParts.push("- Imagery should take up 8-12% of the front label AT MOST");
        promptParts.push("- Position as ACCENT element - corner, bottom, or alongside flavor text");
        promptParts.push("- DO NOT make fruit/ingredients the CENTER of the design");
        promptParts.push("- The PRODUCT NAME and CLAIMS should be the main focus");
        promptParts.push("- Fruit imagery should be SMALLER than the headline text");
      }
      promptParts.push("");
      promptParts.push("✅ GOOD EXAMPLES (what to do):");
      promptParts.push("- Small cluster of berries near the 'Mixed Berry Flavor' text");
      promptParts.push("- Subtle fruit accent in corner with main focus on product benefits");
      promptParts.push("- Think Olly vitamins, Ritual, HUM - small fruit accents, not fruit explosions");
      promptParts.push("");
      promptParts.push("❌ BAD EXAMPLES (what to avoid):");
      promptParts.push("- Large fruit taking up center of label (looks like juice/smoothie)");
      promptParts.push("- Fruit bigger than product name");
      promptParts.push("- Fruit splash effects covering the label");
      promptParts.push("- Design that could be mistaken for a beverage");
      promptParts.push("");
      promptParts.push("THE MAIN FOCUS MUST BE: Product name → Primary claim → Benefits");
      promptParts.push("=== END IMAGERY GUIDANCE ===");
      promptParts.push("");
    }
    
    // =================================================================
    // UNIVERSAL DESIGN LANGUAGE - AI ADAPTIVE PREMIUM AESTHETIC
    // =================================================================
    promptParts.push("=== IMAGE SCENE (STUDIO BACKGROUND) ===");
    promptParts.push("");
    promptParts.push("The SCENE/ENVIRONMENT behind the packaging:");
    promptParts.push("- Use PLAIN WHITE background like a professional studio shot");
    promptParts.push("- Clean, simple, uncluttered studio environment");
    promptParts.push("- White creates premium, professional product photography feel");
    promptParts.push("- Soft shadows so packaging FLOATS naturally in the scene");
    promptParts.push("- Allows product and label colors to POP without distraction");
    promptParts.push("");
    promptParts.push("=== LABEL DESIGN LANGUAGE (5 PILLARS) ===");
    promptParts.push("The following pillars define the design of the LABEL ITSELF:");
    promptParts.push("ANALYZE the product name, claims, ingredients, and flavor. Then INTELLIGENTLY ADAPT these 5 label design principles:");
    promptParts.push("");
    
    // PILLAR 1: THE ATMOSPHERE (LABEL BACKGROUND)
    promptParts.push("🎨 1. THE ATMOSPHERE (LABEL BACKGROUND)");
    promptParts.push("");
    promptParts.push("LABEL GRADIENT BACKGROUND:");
    promptParts.push("- Use GRADIENT backgrounds on the label - never flat solid colors");
    promptParts.push("- Gradient flows smoothly using the brand's color palette");
    promptParts.push("- Creates depth, dimension, and premium feel on the label surface");
    promptParts.push("- Gradient direction: top-to-bottom, radial, or diagonal");
    promptParts.push("");
    
    // Dynamic label atmosphere from Gemini analysis
    const labelAtmosphere = designBrief.labelAtmosphere || designBrief.label_atmosphere;
    if (labelAtmosphere) {
      promptParts.push("=== AI-RECOMMENDED ATMOSPHERE FOR THIS PRODUCT ===");
      
      // If user customized colors, tell AI to ignore gradient_description
      if (colorsCustomized) {
        promptParts.push("⚠️ USER HAS CUSTOMIZED COLORS - USE MANDATORY COLOR PALETTE BELOW INSTEAD OF:");
        promptParts.push(`(Ignored gradient: ${labelAtmosphere.gradient_description || labelAtmosphere.gradientDescription})`);
      } else {
        promptParts.push(`GRADIENT: ${labelAtmosphere.gradient_description || labelAtmosphere.gradientDescription}`);
      }
      
      // Decorative elements
      const decorativeElements = labelAtmosphere.decorative_elements || labelAtmosphere.decorativeElements || [];
      if (decorativeElements.length > 0) {
        promptParts.push(`DECORATIVE ELEMENTS ON LABEL: ${decorativeElements.join(', ')}`);
        promptParts.push("- These elements should appear subtly on the label at 10-20% opacity");
        promptParts.push("- They enhance the mood and create atmosphere WITHOUT cluttering");
      }
      
      // Ambient pattern (NEW) - STRENGTHENED for visibility
      const ambientPattern = labelAtmosphere.ambient_pattern || labelAtmosphere.ambientPattern;
      if (ambientPattern) {
        const patternOpacity = labelAtmosphere.pattern_opacity || labelAtmosphere.patternOpacity || '10%';
        promptParts.push("");
        promptParts.push(`⚠️ AMBIENT PATTERN (MUST BE VISIBLY RENDERED): ${ambientPattern}`);
        promptParts.push(`PATTERN OPACITY: ${patternOpacity}`);
        promptParts.push("PATTERN RENDERING REQUIREMENTS:");
        promptParts.push("- THIS PATTERN MUST BE CLEARLY VISIBLE on the label - not just a subtle hint");
        promptParts.push("- Starfield scatter = actual star shapes scattered across the background");
        promptParts.push("- Wave patterns = visible flowing wave lines or curves");
        promptParts.push("- Hexagonal grid = visible hexagon shapes creating geometric pattern");
        promptParts.push("- Cloud wisps = soft, visible cloud shapes floating in background");
        promptParts.push("- The pattern adds visual richness and depth - make it NOTICEABLE");
        promptParts.push("- Pattern should cover the gradient background area");
        
        // Extra geometry instructions
        const patternLower = ambientPattern.toLowerCase();
        if (patternLower.includes('geometric') || patternLower.includes('hexagon') || 
            patternLower.includes('grid') || patternLower.includes('wave') || patternLower.includes('line')) {
          promptParts.push("GEOMETRIC PATTERN RENDERING:");
          promptParts.push("- Render actual geometric shapes (not just texture hints)");
          promptParts.push("- Shapes should be clean, vector-like, and modern");
          promptParts.push("- Pattern should create visual interest and depth");
        }
      }
      
      // Texture finish (NEW) - STRENGTHENED for visibility
      const textureFinish = labelAtmosphere.texture_finish || labelAtmosphere.textureFinish;
      if (textureFinish) {
        promptParts.push("");
        promptParts.push(`⚠️ TEXTURE FINISH (MUST BE VISIBLE): ${textureFinish}`);
        promptParts.push("TEXTURE RENDERING REQUIREMENTS:");
        promptParts.push("- Render the label surface with this tactile quality");
        promptParts.push("- Matte soft-touch = soft diffuse lighting, no harsh reflections");
        promptParts.push("- Velvet = subtle grain/fiber texture visible on surface");
        promptParts.push("- Glossy = reflective highlights and shine");
        promptParts.push("- The label should NOT look like plain flat plastic");
        promptParts.push("- Texture adds premium, tactile quality to the design");
      }
      
      // Design accents (NEW)
      const designAccents = labelAtmosphere.design_accents || labelAtmosphere.designAccents || [];
      if (designAccents.length > 0) {
        promptParts.push(`DESIGN ACCENTS: ${designAccents.join(', ')}`);
        promptParts.push("- Include these premium finishing touches on the label");
        promptParts.push("- Accents should complement the overall design without overwhelming");
      }
      
      promptParts.push(`TEXT FINISH: ${labelAtmosphere.text_finish || labelAtmosphere.textFinish}`);
      const moodAdjectives = labelAtmosphere.mood_adjectives || labelAtmosphere.moodAdjectives || [];
      if (moodAdjectives.length > 0) {
        promptParts.push(`MOOD: ${moodAdjectives.join(', ')}`);
      }
      promptParts.push("=== END AI ATMOSPHERE ===");
      promptParts.push("");
    } else {
      promptParts.push("MOOD-APPROPRIATE LABEL GRADIENTS (if no specific guidance):");
      promptParts.push("  * Sleep → Deep purples fading to soft lavender, twilight blues");
      promptParts.push("  * Energy → Vibrant oranges to warm yellows, sunrise feel");
      promptParts.push("  * Focus → Cool teals to deep navy, crisp and clear");
      promptParts.push("  * Immunity → Fresh greens to golden yellows, morning light");
      promptParts.push("  * Beauty → Soft pinks to rose gold, luminous glow");
      promptParts.push("");
    }
    
    promptParts.push("DEPTH & TEXTURE ON LABEL:");
    promptParts.push("- Label design should feel like 'a little world'");
    promptParts.push("- Soft shadows behind text and elements so they FLOAT on the label");
    promptParts.push("- Create depth layers on the label surface");
    promptParts.push("");
    // REMOVED conflicting "3-5% opacity" instruction - let AI atmosphere control pattern opacity
    
    // PILLAR 2: THE TASTE
    promptParts.push("🍇 2. THE TASTE: 'DREAMY & DELICIOUS'");
    promptParts.push("");
    promptParts.push("PRODUCT INTERACTION (NOT JUST PLACED):");
    promptParts.push("- Show gummy/product in an ENVIRONMENT that matches its purpose:");
    promptParts.push("  * Sleep → resting on soft cloud, floating in moonlit mist");
    promptParts.push("  * Energy → bursting from citrus, surrounded by light rays");
    promptParts.push("  * Focus → centered with geometric precision");
    promptParts.push("  * Immunity → protected by shield glow, surrounded by botanicals");
    promptParts.push("  * Beauty → with dewdrop highlights, sparkles, soft petals");
    promptParts.push("- Product should look SOFT, PILLOWY, INVITING");
    promptParts.push("");
    promptParts.push("LIGHTING (ADAPT TO PRODUCT MOOD):");
    promptParts.push("  * Sleep → Moonlight: dramatic but soft, ethereal, silver highlights");
    promptParts.push("  * Energy → Sunrise: warm, golden, energizing rim lights");
    promptParts.push("  * Focus → Crystal: clean, sharp, focused spotlights");
    promptParts.push("  * Immunity → Fresh morning: bright, clean, airy");
    promptParts.push("  * Beauty → Dewy glow: soft luminosity, pearl-like");
    promptParts.push("- Always add small white SPECULARS to gummy surface");
    promptParts.push("- Gummy must look JUICY and FRESH");
    promptParts.push("");
    promptParts.push("COLOR SATURATION:");
    promptParts.push("- Background can be moody/atmospheric");
    promptParts.push("- Fruit and gummy colors MUST be RICH and SATURATED");
    promptParts.push("- High contrast between product and background - product POPS");
    promptParts.push("");
    
    // PILLAR 3: TYPOGRAPHY
    promptParts.push("✍️ 3. THE TYPOGRAPHY: 'CALM AUTHORITY'");
    promptParts.push("");
    promptParts.push("LOGO & BRAND NAME CONTRAST:");
    promptParts.push("- ADAPTIVE CONTRAST: Logo must always be READABLE");
    promptParts.push("- On WHITE/LIGHT backgrounds → Use DARK text (black, dark gray, navy)");
    promptParts.push("- On DARK backgrounds → Use LIGHT text (white, cream, silver)");
    promptParts.push("- Ensure minimum contrast ratio for readability");
    promptParts.push("- Logo should stand out clearly against any background");
    promptParts.push("");
    promptParts.push("PRODUCT NAME:");
    promptParts.push("- Clean, modern SANS-SERIF font");
    promptParts.push("- BOLD and CONFIDENT");
    promptParts.push("- Color adapts to background for maximum contrast");
    promptParts.push("");
    promptParts.push("TAGLINE/EMOTIONAL MESSAGE:");
    promptParts.push("- Delicate SERIF or handwritten SCRIPT font");
    promptParts.push("- Contrast with bold title = premium, human touch");
    promptParts.push("");
    promptParts.push("SPACING:");
    promptParts.push("- PLENTY of negative space around text");
    promptParts.push("- Crowded = stressful, Open = premium and relaxing");
    promptParts.push("");
    
    // PILLAR 4: TRUST & HEALTH
    promptParts.push("🏅 4. TRUST & HEALTH: 'LOWERING BARRIERS'");
    promptParts.push("");
    promptParts.push("QUALITY BADGES (THE 'JEWEL'):");
    promptParts.push("- DO NOT make badges look like cheap discount stickers");
    promptParts.push("- Design like a JEWEL or quality seal");
    promptParts.push("- Thin gold or silver circle with elegant text (e.g., '0g SUGAR')");
    promptParts.push("- Should look like a stamp of QUALITY");
    promptParts.push("");
    
    // Dynamic claims with icons from Gemini analysis
    const claimsWithIcons = designBrief.claimsWithIcons || designBrief.claims_with_icons;
    if (claimsWithIcons && claimsWithIcons.length > 0) {
      promptParts.push("=== CLAIMS WITH ICONS (MANDATORY - EVERY CLAIM MUST HAVE AN ICON) ===");
      promptParts.push("⚠️ CRITICAL: Render EACH claim with its paired icon. No exceptions.");
      promptParts.push("");
      claimsWithIcons.forEach((c: { claim: string; icon: string }) => {
        promptParts.push(`  • [${c.icon}] "${c.claim}"`);
      });
      promptParts.push("");
      promptParts.push("ICON RENDERING RULES:");
      promptParts.push("- Icons must be CLEARLY VISIBLE next to each claim");
      promptParts.push("- Consistent icon style (all line art OR all filled, not mixed)");
      promptParts.push("- Icons should be rendered as simple, elegant graphics");
      promptParts.push("- Size: Small but easily recognizable (approximately text height)");
      promptParts.push("- Position: Immediately LEFT of the claim text");
      promptParts.push("- Color: Match the label's accent color or white for contrast");
      promptParts.push("=== END CLAIMS WITH ICONS ===");
      promptParts.push("");
    } else {
      promptParts.push("=== CLAIMS WITH ICONS (MANDATORY - GENERATE ICONS) ===");
      promptParts.push("⚠️ EVERY claim/benefit MUST have an icon. Generate appropriate icons:");
      promptParts.push("");
      promptParts.push("| Claim Type | Required Icon |");
      promptParts.push("|------------|---------------|");
      promptParts.push("| Sleep/Calm | moon icon, star icon, cloud icon |");
      promptParts.push("| Energy | lightning bolt icon, sun icon, flame icon |");
      promptParts.push("| Focus/Brain | brain icon, target icon, lightbulb icon |");
      promptParts.push("| Muscle/Recovery | flexed arm icon, dumbbell icon |");
      promptParts.push("| Immunity/Health | shield icon, heart icon, plus icon |");
      promptParts.push("| Digestion | leaf icon, stomach icon |");
      promptParts.push("| Sugar-Free | zero icon, crossed sugar icon |");
      promptParts.push("| Made in USA | flag icon, star badge icon |");
      promptParts.push("");
      promptParts.push("ICON RENDERING RULES:");
      promptParts.push("- Icons must be CLEARLY VISIBLE next to each claim");
      promptParts.push("- Consistent icon style throughout");
      promptParts.push("- Position: Immediately LEFT of the claim text");
      promptParts.push("=== END CLAIMS WITH ICONS ===");
      promptParts.push("");
    }
    
    promptParts.push("CERTIFICATION GRAPHIC SEALS:");
    promptParts.push("- Render certifications as PROFESSIONAL GRAPHIC SEALS/STAMPS");
    promptParts.push("- These should look like REAL packaging seals you see on products:");
    promptParts.push("");
    promptParts.push("EXAMPLES OF GRAPHIC SEAL STYLES:");
    promptParts.push("  * 'Made in USA' → American flag ribbon seal or circular flag badge");
    promptParts.push("  * 'Sugar Free' → Circular stamp with '0g SUGAR' or 'SUGAR FREE' text");
    promptParts.push("  * 'Non-GMO' → Classic butterfly project seal or leaf emblem");
    promptParts.push("  * 'Vegan' → Green circular seal with 'V' or leaf graphic");
    promptParts.push("  * 'Gluten-Free' → Wheat stalk with cross-out in circular seal");
    promptParts.push("  * 'GMP Certified' → Shield or emblem with stars");
    promptParts.push("  * 'Third Party Tested' → Laboratory/checkmark seal");
    promptParts.push("  * 'Non-Habit Forming' → Gentle circular badge");
    promptParts.push("");
    promptParts.push("SEAL DESIGN GUIDELINES:");
    promptParts.push("- Each seal should be a COMPLETE GRAPHIC (not just icon + text)");
    promptParts.push("- Use circular, shield, ribbon, or emblem shapes");
    promptParts.push("- Seals can include: borders, stars, banners, emblems, symbols");
    promptParts.push("- Colors: Gold, silver, green, red/white/blue for USA, etc.");
    promptParts.push("- Should look like official certification marks");
    promptParts.push("- Arrange seals in a clean row, typically at bottom of label");
    promptParts.push("- Consistent sizing (small but legible)");
    promptParts.push("- These seals BUILD TRUST - make them look official and authoritative");
    promptParts.push("");
    
    // PILLAR 5: PRINT FINISH
    promptParts.push("🖨️ 5. PRINT FINISH: 'TACTILE LUXURY'");
    promptParts.push("");
    promptParts.push("MATTE VS GLOSS CONTRAST:");
    promptParts.push("- Label background: Soft-Touch MATTE finish (velvety texture)");
    promptParts.push("- HIGH-GLOSS Spot UV only on:");
    promptParts.push("  * The Logo");
    promptParts.push("  * The Gummy/product visual");
    promptParts.push("  * Quality badges");
    promptParts.push("- Matte/gloss contrast = immediate high-end feel");
    promptParts.push("- Glossy elements should show subtle reflections");
    promptParts.push("");
    promptParts.push("=== END UNIVERSAL DESIGN LANGUAGE ===");
    promptParts.push("");
    
    // Dynamic label hierarchy from Gemini analysis
    const labelHierarchy = designBrief.labelHierarchy || designBrief.label_hierarchy;
    if (labelHierarchy) {
      promptParts.push("=== LABEL HIERARCHY (RENDER IN THIS ORDER - FROM AI ANALYSIS) ===");
      promptParts.push(`1. BIG NAME: "${labelHierarchy.big_name || labelHierarchy.bigName}" - This is the main ingredient/term customers search for. Make it LARGEST and most prominent.`);
      promptParts.push(`2. PROMISE: "${labelHierarchy.promise}" - The benefit statement. Clear and compelling below the big name.`);
      promptParts.push(`3. DIFFERENTIATOR: "${labelHierarchy.differentiator}" - PROMINENT BADGE. This must stand out (e.g., "SUGAR FREE" in a visible badge).`);
      promptParts.push(`4. FLAVOR: "${labelHierarchy.flavor_name || labelHierarchy.flavorName}" - Evocative flavor name that fits the product mood.`);
      promptParts.push("=== END LABEL HIERARCHY ===");
      promptParts.push("");
    }
    
    promptParts.push("IMPORTANT: Analyze this specific product and INTELLIGENTLY choose the most appropriate gradient, lighting, line-art, and product environment based on its purpose, ingredients, and mood. Blend styles if the product serves multiple purposes.");
    promptParts.push("");
    
    // =================================================================
    // VIBRANCY & ENERGY - ALIVE, DYNAMIC VISUALS
    // =================================================================
    promptParts.push("=== VIBRANCY & ENERGY (MAKE IT ALIVE) ===");
    promptParts.push("");
    promptParts.push("CREATE VISUALS THAT FEEL ALIVE AND ENERGETIC:");
    promptParts.push("");
    promptParts.push("🎨 COLOR INTENSITY:");
    promptParts.push("- SATURATED, RICH colors - not muted or dusty");
    promptParts.push("- Colors should POP and feel fresh, not faded");
    promptParts.push("- High contrast between elements for visual punch");
    promptParts.push("- If using primary color, make it VIBRANT - full saturation");
    promptParts.push("- Whites should be crisp, colors should be bold");
    promptParts.push("");
    promptParts.push("✨ LIGHTING & GLOW EFFECTS:");
    promptParts.push("- Bright, energetic lighting - not flat or dull");
    promptParts.push("- Subtle rim lighting or backlight glow on the product");
    promptParts.push("- Fresh, dewy highlights on fruit/ingredient imagery");
    promptParts.push("- Slight luminosity behind key elements (subtle glow)");
    promptParts.push("- Reflections and shine that make it look premium and alive");
    promptParts.push("");
    promptParts.push("🌊 DYNAMIC ELEMENTS:");
    promptParts.push("- Ingredient imagery should look FRESH and JUICY");
    promptParts.push("- Add motion hints: juice droplets mid-splash, light rays");
    promptParts.push("- Fruit should glisten with water droplets or natural shine");
    promptParts.push("- Elements should feel like they're in motion, not static");
    promptParts.push("- Think TV commercial quality - appetizing and inviting");
    promptParts.push("");
    promptParts.push("❌ AVOID DULL/FLAT VISUALS:");
    promptParts.push("- Muted, desaturated, or 'dusty' color palettes");
    promptParts.push("- Flat lighting with no depth or dimension");
    promptParts.push("- Static, lifeless fruit or ingredient imagery");
    promptParts.push("- Overly matte/flat finishes without any shine");
    promptParts.push("- Washed out or faded looking colors");
    promptParts.push("");
    promptParts.push("REFERENCE ENERGY: Think Olly, Vital Proteins, Athletic Greens");
    promptParts.push("- Fresh, bright, alive - like you want to grab it off the shelf");
    promptParts.push("=== END VIBRANCY ===");
    promptParts.push("");

    // =================================================================
    // MANDATORY COLOR PALETTE (HIGHEST PRIORITY - MOVED TO TOP)
    // =================================================================
    promptParts.push("");
    promptParts.push("=== 🎨 MANDATORY COLOR PALETTE (HIGHEST PRIORITY - NON-NEGOTIABLE) ===");
    if (colorsCustomized) {
      promptParts.push("⚠️⚠️⚠️ USER HAS CUSTOMIZED THESE COLORS - THEY OVERRIDE ALL AI SUGGESTIONS ⚠️⚠️⚠️");
      promptParts.push("The user explicitly chose these colors. Use them EXACTLY as specified.");
      promptParts.push("IGNORE any gradient_description or atmosphere colors - USE THESE INSTEAD.");
    } else {
      promptParts.push("These colors were extracted from TOP-PERFORMING competitor packaging.");
    }
    promptParts.push("You MUST use these EXACT colors - do not interpret or improve them.");
    promptParts.push("");
    if (primaryColorHex) {
      promptParts.push(`PRIMARY COLOR: ${primaryColorHex}`);
      promptParts.push(`- This is the DOMINANT color - MUST cover at least 60% of the visible label area`);
      promptParts.push(`- Use for background gradient, main label area, or largest color blocks`);
      promptParts.push(`- This color should be IMMEDIATELY and OBVIOUSLY visible as the main color`);
    }
    if (secondaryColorHex) {
      promptParts.push(`SECONDARY COLOR: ${secondaryColorHex}`);
      promptParts.push(`- Use for text, headlines, accents, or secondary panels`);
      promptParts.push(`- Should contrast well with the primary color`);
    }
    if (accentColorHex) {
      promptParts.push(`ACCENT COLOR: ${accentColorHex}`);
      promptParts.push(`- Use for small accents, icons, badges, or highlights`);
      promptParts.push(`- Should pop against both primary and secondary colors`);
    }
    promptParts.push("");
    promptParts.push("⚠️ COLOR RULES (STRICT):");
    promptParts.push("- Use ONLY these 3 colors (plus white/black for text if needed)");
    promptParts.push("- DO NOT add new colors that 'look better'");
    promptParts.push("- DO NOT invert or complement these colors");
    promptParts.push("- The PRIMARY COLOR should be IMMEDIATELY visible as the dominant color");
    promptParts.push("- If user customized colors, IGNORE any AI atmosphere/gradient suggestions");
    promptParts.push("=== END MANDATORY COLORS ===");

    // EXACT FRONT PANEL TEXT - This is the MOST IMPORTANT and NON-NEGOTIABLE section
    promptParts.push("");
    promptParts.push("=== ⚠️ MANDATORY FRONT PANEL TEXT (NON-NEGOTIABLE) ===");
    promptParts.push("You MUST render ALL of the following text on the front of the package.");
    promptParts.push("This is the COMPLETE front panel copy plan - use it EXACTLY.");
    promptParts.push("DO NOT invent, add, or modify any text. Render ONLY what's provided below.");
    promptParts.push("");
    
    if (frontPanelText) {
      promptParts.push("=== EXACT TEXT TO RENDER (COPY THIS VERBATIM) ===");
      promptParts.push("```");
      promptParts.push(frontPanelText);
      promptParts.push("```");
      promptParts.push("");
      promptParts.push("⚠️ CRITICAL TEXT RULES:");
      promptParts.push("1. Render EVERY line of text above on the front label");
      promptParts.push("2. Use the EXACT wording - do not paraphrase or change");
      promptParts.push("3. Brand name and product name come FROM the text above");
      promptParts.push("4. Maintain the text hierarchy (top to bottom = top to bottom on label)");
      promptParts.push("5. DO NOT add any text that isn't in the content plan above");
    } else {
      // Fallback only if no front panel text provided
      promptParts.push(`🏷️ BRAND NAME (top of label, stylized): "${brandName}"`);
      promptParts.push(`📦 PRODUCT NAME (largest text): "${productName}"`);
      if (primaryClaim) {
        promptParts.push(`Main claim: "${primaryClaim}"`);
      }
    }
    
    promptParts.push("");
    promptParts.push("=== END MANDATORY TEXT ===");
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

    // =================================================================
    // HERO IMAGERY SECTION - AI-decided OR fallback to hardcoded
    // =================================================================
    promptParts.push("");
    
    // Check if AI provided hero_imagery in packaging analysis
    if (heroImagery && heroImagery.primary_visual) {
      promptParts.push("=== HERO VISUAL IMAGERY (AI-RECOMMENDED - FOLLOW THIS) ===");
      promptParts.push(`Imagery Type: ${heroImagery.imagery_type || heroImagery.imageryType || 'ingredient'}`);
      promptParts.push(`Primary Visual: ${heroImagery.primary_visual || heroImagery.primaryVisual}`);
      promptParts.push(`Style: ${heroImagery.visual_style || heroImagery.visualStyle || 'photorealistic'}`);
      promptParts.push(`Prominence: ${heroImagery.prominence || 'hero'}`);
      promptParts.push(`Placement: ${heroImagery.placement || 'front panel'}`);
      
      const prominence = heroImagery.prominence || 'hero';
      if (prominence === 'hero') {
        promptParts.push("");
        promptParts.push("THIS IS THE MAIN VISUAL ELEMENT - OLLY-STYLE (15-20% OF LABEL):");
        promptParts.push("- SIZE: Take up 15-20% of the front label area minimum");
        promptParts.push("- Should be immediately eye-catching and appetizing (Olly-style)");
        promptParts.push("- Use photorealistic style with natural shine and vibrancy");
        promptParts.push("- Add subtle splash, droplet, or glow effects for dynamism");
        promptParts.push("- DO NOT replace with generic abstract shapes or wellness icons");
      } else if (prominence === 'accent') {
        promptParts.push("");
        promptParts.push("- Feature as a supporting visual element");
        promptParts.push("- Should complement the main design without overpowering");
      } else if (prominence === 'subtle') {
        promptParts.push("");
        promptParts.push("- Use as background or subtle decorative element");
      }
      
      if (heroImagery.color_palette || heroImagery.colorPalette) {
        promptParts.push("");
        promptParts.push(`Color palette to incorporate: ${heroImagery.color_palette || heroImagery.colorPalette}`);
      }
      promptParts.push("=== END HERO IMAGERY ===");
      
    } else if (flavorImagery) {
      // FALLBACK: Use hardcoded flavorToImagery mapping - OLLY STYLE
      promptParts.push("=== 🍇 FLAVOR GRAPHICS - OLLY-STYLE (15-20% OF LABEL) ===");
      promptParts.push(`Flavor: "${flavorText}"`);
      promptParts.push(`- Feature: ${flavorImagery.fruit}`);
      promptParts.push(`- Colors: ${flavorImagery.colors}`);
      promptParts.push("");
      promptParts.push("OLLY-STYLE FLAVOR GRAPHICS (MANDATORY):");
      promptParts.push("- SIZE: Take up 15-20% of the front label area - PROMINENT, not subtle");
      promptParts.push("- STYLE: Bold, MAXIMUM SATURATION, photorealistic fruit/ingredient imagery");
      promptParts.push("- PLACEMENT: Position as a HERO element - either:");
      promptParts.push("  • Top/bottom banner area with fruit arrangement");
      promptParts.push("  • Side accent with fruits extending beyond label edge");
      promptParts.push("  • Corner cluster with juice splash effect");
      promptParts.push("- QUALITY: Fresh, vibrant, juicy - should look APPETIZING");
      promptParts.push("- ENERGY: Dynamic, not static - use splashes, droplets, or movement");
      promptParts.push("");
      promptParts.push("VIBRANCY REQUIREMENTS FOR IMAGERY:");
      promptParts.push("- Colors at MAXIMUM saturation - deep reds, bright yellows, vivid purples");
      promptParts.push("- Glistening with water droplets or juice splashes mid-air");
      promptParts.push("- Light catching the surface creating bright highlights and shine");
      promptParts.push("- Natural translucency where applicable (citrus, berries)");
      promptParts.push("- Fresh-picked, farm-to-table quality appearance");
      promptParts.push("- Juice mid-splash or droplets suspended in air for dynamism");
      promptParts.push("- NOT dried, dull, matte, or artificial looking");
      promptParts.push("");
      promptParts.push("REFERENCE: Olly supplements - bold fruit imagery that takes real visual space");
      promptParts.push("- NOT a tiny icon - a MAJOR design element");
      promptParts.push("- Fruit should have SHINE, texture, depth, and glistening highlights");
      promptParts.push("- Can overlap slightly with other elements for dynamism");
      promptParts.push("");
      promptParts.push("⚠️ DO NOT:");
      promptParts.push("- Use tiny fruit icons (less than 10% of label)");
      promptParts.push("- Use flat/illustrated style - must be photorealistic");
      promptParts.push("- Hide fruit in a corner where it's barely visible");
      promptParts.push("- Use muted, desaturated, or dull fruit colors");
      promptParts.push("=== END FLAVOR GRAPHICS ===");
      
    } else if (isDogProduct) {
      // FALLBACK: Pet product imagery
      promptParts.push("IMAGERY ON PACKAGING:");
      promptParts.push("- Include a beautiful, happy, healthy dog image/illustration on the label");
      promptParts.push("- Dog should look vibrant, active, and healthy (golden retriever, lab, or friendly breed)");
      promptParts.push("- Can be a photo or elegant line illustration style");
      
    } else if (isCatProduct) {
      // FALLBACK: Cat product imagery
      promptParts.push("IMAGERY ON PACKAGING:");
      promptParts.push("- Include an elegant cat image/illustration on the label");
      promptParts.push("- Cat should look healthy and content");
      
    } else {
      // FALLBACK: Minimal generic imagery for non-flavored, non-pet products
      promptParts.push("IMAGERY ON PACKAGING:");
      promptParts.push("- Use minimal, clean visual elements");
      promptParts.push("- Focus on premium typography and color rather than busy graphics");
      promptParts.push("- Subtle abstract shapes or gradients if needed");
    }

    // BENEFIT BULLET POINTS
    // User request: do NOT auto-generate or force bullet points on the front label.
    // If the content plan (frontPanelText) includes bullets, they will be rendered verbatim there.
    // Otherwise, we omit bullets entirely.

    // DISTINCTIVE, PREMIUM DESIGN - Not generic
    promptParts.push("");
    promptParts.push("=== DESIGN PHILOSOPHY: DISTINCTIVE & PREMIUM ===");
    promptParts.push("Create a MEMORABLE, PREMIUM design that stands out. NOT generic.");
    promptParts.push("");
    promptParts.push("WHAT MAKES IT DISTINCTIVE:");
    promptParts.push("- Strong brand personality - confident, ownable aesthetic");
    promptParts.push("- Bold typography choices - not default/safe fonts");
    promptParts.push("- Intentional color blocking with clear visual hierarchy");
    promptParts.push("- One signature design element (not many small ones)");
    promptParts.push("");
    promptParts.push("BACKGROUND:");
    promptParts.push("- Clean gradient OR solid color - pick ONE approach");
    promptParts.push("- Maximum 2-3 colors total in design");
    promptParts.push("- Generous breathing room around text");
    promptParts.push("");
    promptParts.push("AVOID GENERIC TRAPS & UNNECESSARY ELEMENTS:");
    promptParts.push("- NO busy patterns or multiple decorative elements UNLESS specified in AI ATMOSPHERE above");
    promptParts.push("- NO default-looking layouts - create DYNAMIC, eye-catching compositions");
    promptParts.push("- NO unnecessary icons, badges, or filler graphics");
    promptParts.push("- NO confetti, starbursts, or scattered shapes");
    promptParts.push("- NO decorative borders or frames");
    promptParts.push("- NO generic wellness icons (leaves, hearts, DNA strands) unless specifically part of hero imagery");
    promptParts.push("- NO gradient overlays or lens flares");
    promptParts.push("- NO abstract swooshes or wave patterns UNLESS specified in ambient_pattern above");
    promptParts.push("- If ambient_pattern is specified above, RENDER IT - it's intentional design, not filler");
    promptParts.push("- ONLY essential elements: brand, product name, hero imagery (if specified), key claims");
    promptParts.push("- LESS elements = MORE impact");
    promptParts.push("");
    promptParts.push("REFERENCE: Ritual, AG1, Seed - clean but DISTINCTIVE");
    promptParts.push("=== END DESIGN PHILOSOPHY ===");
    
    // =================================================================
    // DYNAMIC LAYOUT DESIGN - NOT PLAIN/STATIC
    // =================================================================
    promptParts.push("");
    promptParts.push("=== 🎯 DYNAMIC LAYOUT DESIGN (NOT PLAIN/STATIC) ===");
    promptParts.push("Create a VISUALLY DYNAMIC layout, not a boring centered stack:");
    promptParts.push("");
    promptParts.push("LAYOUT ENERGY (choose approaches that fit the product):");
    promptParts.push("- ASYMMETRIC COMPOSITION: Don't center everything - use off-center placement for visual interest");
    promptParts.push("- DIAGONAL ELEMENTS: Angled text, tilted badges, or diagonal divider lines add motion");
    promptParts.push("- LAYERED DEPTH: Elements that overlap slightly create dimension (e.g., fruit overlapping badge)");
    promptParts.push("- SCALE CONTRAST: One LARGE element + several small elements creates hierarchy");
    promptParts.push("- BREAKING THE FRAME: Hero imagery that extends to or beyond the label edge");
    promptParts.push("");
    promptParts.push("VISUAL RHYTHM:");
    promptParts.push("- Create FLOW that guides the eye: top-left → center → bottom-right");
    promptParts.push("- Use color blocking to create distinct zones on the label");
    promptParts.push("- Balance busy areas with breathing room");
    promptParts.push("");
    promptParts.push("DYNAMIC EXAMPLES BY PRODUCT TYPE:");
    promptParts.push("- SLEEP: Floating/dreamy layout with elements at varying depths, moon/stars at different scales");
    promptParts.push("- ENERGY: Explosive/burst layout with elements radiating outward, dynamic angles");
    promptParts.push("- FOCUS: Precision layout with intentional asymmetry, geometric alignment");
    promptParts.push("- IMMUNITY: Organic flow layout with natural curves and botanical arrangements");
    promptParts.push("- BEAUTY: Elegant asymmetry with delicate floating elements and soft overlaps");
    promptParts.push("");
    promptParts.push("❌ AVOID STATIC LAYOUTS:");
    promptParts.push("- Everything perfectly centered in a vertical stack");
    promptParts.push("- All text at the same size");
    promptParts.push("- Rigid left-to-right alignment");
    promptParts.push("- Flat, same-plane placement of all elements");
    promptParts.push("- Generic template look");
    promptParts.push("");
    promptParts.push("REFERENCE: Olly, Vital Proteins, Moon Juice - dynamic, eye-catching, shelf-stopping");
    promptParts.push("=== END DYNAMIC LAYOUT ===");

    // MODERN LAYOUT & TYPOGRAPHY
    promptParts.push("");
    promptParts.push("TYPOGRAPHY:");
    promptParts.push("- Bold sans-serif for headlines, clean hierarchy");
    promptParts.push("- Strong size contrast between headline and body");
    promptParts.push("- Clear, readable text - prioritize legibility");

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
    
    promptParts.push("");
    promptParts.push("PHOTOGRAPHY STYLE (VIBRANT & ALIVE):");
    promptParts.push("- Professional HERO product photography with VIBRANT energy");
    promptParts.push("- Clean white or subtle gradient background for depth");
    promptParts.push("- BRIGHT studio lighting - defined highlights and shadows, not flat");
    promptParts.push("- Rim lighting to separate product from background with subtle glow");
    promptParts.push("- Colors should POP - rich, saturated, ALIVE");
    promptParts.push("- Product at 3/4 angle with catch-light reflections on surface");
    promptParts.push("- Sharp focus, high contrast, commercial-quality rendering");
    promptParts.push("- Should look like a premium TV commercial still frame");
    promptParts.push("- Fresh, energetic, makes you want to pick it up immediately");
    
    // =================================================================
    // FINAL REMINDER - Repeat hero imagery at end (AI models also weight the end)
    // =================================================================
    if (heroImagery && (heroImagery.primary_visual || heroImagery.primaryVisual)) {
      const primaryVisual = heroImagery.primary_visual || heroImagery.primaryVisual;
      promptParts.push("");
      promptParts.push("=== 🍇 FINAL REMINDER: DO NOT FORGET THE HERO IMAGERY ===");
      promptParts.push(`The packaging MUST prominently feature: ${primaryVisual}`);
      promptParts.push("This is the HERO VISUAL - photorealistic, vibrant, 20-30% of label");
      promptParts.push("DO NOT generate a plain/clean/minimalist label without this imagery");
      promptParts.push("=== END REMINDER ===");
    }
    
    // What NOT to generate
    promptParts.push("");
    promptParts.push("=== DO NOT GENERATE THESE (AVOID) ===");
    promptParts.push("- Plain white/minimalist labels with NO imagery (unless specifically no hero_imagery was provided)");
    promptParts.push("- Abstract geometric shapes INSTEAD of specified fruit/ingredients");
    promptParts.push("- Generic wellness icons (random leaves, hearts) INSTEAD of the specific hero imagery");
    promptParts.push("- Boring corporate pharmaceutical look UNLESS that matches the brand tone");
    promptParts.push("=== END AVOID LIST ===")

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
      
      // Front-only mode: simplified prompt for just the front panel
      if (isFrontOnly) {
        const frontOnlyPromptParts = [
          `=== 2D FLAT FRONT PANEL LAYOUT FOR ${packagingFormat.toUpperCase()} ===`,
          "",
          "Create a SINGLE FLAT 2D front panel/label suitable for printing.",
          "This is a PRINT-READY layout that will be edited in Photoshop/Illustrator.",
          "",
          "=== CRITICAL REQUIREMENTS ===",
          "- Generate ONLY the FRONT PANEL/LABEL - not the full dieline",
          "- This is a 2D FLAT VIEW - absolutely NO perspective, NO shadows, NO 3D effects",
          "- Show just the front-facing label as a single rectangular artwork",
          "- Include bleed area (slight color extension beyond trim lines)",
          "- White/neutral background surrounding the label",
          "- Centered, high-resolution artwork",
          "",
          `=== PACKAGING TYPE: ${packagingFormat} ===`,
          "PANEL: Front Panel/Label ONLY",
          "",
          "=== DESIGN ELEMENTS (MUST MATCH 3D MOCKUP FRONT EXACTLY) ===",
          "",
          "COLOR PALETTE:",
        ];
        
        if (primaryColorHex) frontOnlyPromptParts.push(`- Primary: ${primaryColorName || ''} ${primaryColorHex}`);
        if (secondaryColorHex) frontOnlyPromptParts.push(`- Secondary: ${secondaryColorName || ''} ${secondaryColorHex}`);
        if (accentColorHex) frontOnlyPromptParts.push(`- Accent: ${accentColorName || ''} ${accentColorHex}`);
        
        frontOnlyPromptParts.push("");
        frontOnlyPromptParts.push("FRONT PANEL TEXT CONTENT:");
        if (frontPanelText) frontOnlyPromptParts.push(frontPanelText);
        
        frontOnlyPromptParts.push("");
        frontOnlyPromptParts.push("GRAPHIC ELEMENTS:");
        frontOnlyPromptParts.push("- Product name/brand prominently displayed");
        frontOnlyPromptParts.push("- Key claims and benefits");
        frontOnlyPromptParts.push("- Any badges, certifications, or seals");
        frontOnlyPromptParts.push("- Flavor/variant indicators");
        frontOnlyPromptParts.push("- Quantity/count information");
        
        // Add HERO IMAGERY to front-only mode (AI-decided OR fallback)
        if (heroImagery && heroImagery.primary_visual) {
          frontOnlyPromptParts.push("");
          frontOnlyPromptParts.push("=== HERO VISUAL IMAGERY (AI-RECOMMENDED) ===");
          frontOnlyPromptParts.push(`Imagery Type: ${heroImagery.imagery_type || heroImagery.imageryType || 'ingredient'}`);
          frontOnlyPromptParts.push(`Primary Visual: ${heroImagery.primary_visual || heroImagery.primaryVisual}`);
          frontOnlyPromptParts.push(`Style: ${heroImagery.visual_style || heroImagery.visualStyle || 'photorealistic'}`);
          frontOnlyPromptParts.push(`Prominence: ${heroImagery.prominence || 'hero'}`);
          frontOnlyPromptParts.push("");
          if ((heroImagery.prominence || 'hero') === 'hero') {
            frontOnlyPromptParts.push("THIS IS THE MAIN VISUAL - Feature prominently on front panel");
            frontOnlyPromptParts.push("- 20-30% of label area, photorealistic style");
          }
          frontOnlyPromptParts.push("=== END HERO IMAGERY ===");
        } else if (flavorImagery) {
          // FALLBACK: Use hardcoded flavor imagery
          frontOnlyPromptParts.push("");
          frontOnlyPromptParts.push("=== FLAVOR IMAGERY (VIBRANT & LIVELY) ===");
          frontOnlyPromptParts.push(`Flavor: "${flavorText}"`);
          frontOnlyPromptParts.push(`- Feature: ${flavorImagery.fruit}`);
          frontOnlyPromptParts.push(`- Colors: ${flavorImagery.colors}`);
          frontOnlyPromptParts.push("");
          frontOnlyPromptParts.push("STYLING:");
          frontOnlyPromptParts.push("- Fresh, vibrant, photorealistic with natural shine");
          frontOnlyPromptParts.push("- Position as HERO element - prominent but balanced");
          frontOnlyPromptParts.push("- NO cartoon style - photorealistic only");
          frontOnlyPromptParts.push("=== END FLAVOR IMAGERY ===");
        }
        
        frontOnlyPromptParts.push("");
        frontOnlyPromptParts.push("=== OUTPUT REQUIREMENTS ===");
        frontOnlyPromptParts.push("- Single panel, print-ready artwork");
        frontOnlyPromptParts.push("- Clean edges suitable for die-cutting");
        frontOnlyPromptParts.push("- High contrast, readable text");
        frontOnlyPromptParts.push("- Professional label design matching the 3D mockup front view");
        
        prompt = frontOnlyPromptParts.join("\n");
      } else {
        // Full dieline mode (existing logic)
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
      
      // Add HERO IMAGERY to full dieline mode (AI-decided OR fallback)
      if (heroImagery && heroImagery.primary_visual) {
        flatPromptParts.push("");
        flatPromptParts.push("=== HERO VISUAL IMAGERY (AI-RECOMMENDED) ===");
        flatPromptParts.push(`Imagery Type: ${heroImagery.imagery_type || heroImagery.imageryType || 'ingredient'}`);
        flatPromptParts.push(`Primary Visual: ${heroImagery.primary_visual || heroImagery.primaryVisual}`);
        flatPromptParts.push(`Style: ${heroImagery.visual_style || heroImagery.visualStyle || 'photorealistic'}`);
        flatPromptParts.push(`Prominence: ${heroImagery.prominence || 'hero'}`);
        flatPromptParts.push(`Placement: ${heroImagery.placement || 'front panel'}`);
        flatPromptParts.push("");
        if ((heroImagery.prominence || 'hero') === 'hero') {
          flatPromptParts.push("THIS IS THE MAIN VISUAL - Feature prominently on FRONT PANEL");
          flatPromptParts.push("- 20-30% of front panel area, photorealistic style");
        }
        flatPromptParts.push("=== END HERO IMAGERY ===");
      } else if (flavorImagery) {
        // FALLBACK: Use hardcoded flavor imagery
        flatPromptParts.push("");
        flatPromptParts.push("=== FLAVOR IMAGERY (VIBRANT & LIVELY) ===");
        flatPromptParts.push(`- Feature: ${flavorImagery.fruit}`);
        flatPromptParts.push(`- Colors: ${flavorImagery.colors}`);
        flatPromptParts.push("");
        flatPromptParts.push("STYLING:");
        flatPromptParts.push("- Fresh, vibrant, photorealistic with natural shine");
        flatPromptParts.push("- Position as HERO element on FRONT PANEL");
        flatPromptParts.push("- NO cartoon style - photorealistic only");
        flatPromptParts.push("=== END FLAVOR IMAGERY ===");
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
      }
    } else {
      prompt = promptParts.join("\n");
    }

    console.log(`Generating ${isFlat ? 'flat layout' : 'product mockup'} with OpenRouter Nanobanana Pro`);
    console.log("Design brief received:", JSON.stringify(designBrief, null, 2));
    console.log("Generated prompt:", prompt);

    // Build message content - include images as needed
    let messageContent: any[] = [];
    
    // Check if logo image is provided
    const hasValidLogoImage = logoImageUrl && 
      (logoImageUrl.startsWith('data:image') || logoImageUrl.startsWith('http'));
    
    if (hasValidLogoImage) {
      console.log("Adding logo image to multi-modal message");
      messageContent.push({
        type: "image_url",
        image_url: { url: logoImageUrl }
      });
    }
    
    // Add reference image for flat layout if available
    if (hasValidReferenceImage) {
      console.log("Creating multi-modal message with reference image for flat layout");
      messageContent.push({
        type: "image_url",
        image_url: { url: referenceImageUrl }
      });
    }
    
    // Build the prompt with logo and reference instructions
    let finalPrompt = prompt;
    
    if (hasValidLogoImage) {
      const logoInstruction = `=== BRAND LOGO PROVIDED (CRITICAL - USE EXACTLY) ===
${hasValidReferenceImage ? 'The FIRST attached image is the brand logo.' : 'The attached image is the brand logo.'}
You MUST:
1. Place this EXACT brand logo at the TOP CENTER of the front panel
2. DO NOT add any text-based brand name - the logo replaces the brand name text entirely
3. The product name should appear BELOW the logo as the main headline
4. Do NOT redesign, redraw, modify, or recreate the logo in any way
5. Use the logo EXACTLY as provided - same colors, proportions, and details
6. Size the logo appropriately (roughly 15-20% of the front panel width)
7. Ensure the logo is clearly visible and prominent
=== END LOGO ===

`;
      finalPrompt = logoInstruction + finalPrompt;
    }
    
    if (hasValidReferenceImage) {
      const referenceImagePrompt = `=== CRITICAL: REFERENCE IMAGE PROVIDED ===
${hasValidLogoImage ? 'The SECOND attached image is the 3D product mockup to copy.' : 'LOOK AT THE ATTACHED 3D PRODUCT MOCKUP IMAGE.'} You MUST create a FLAT, UNWRAPPED 2D dieline layout that EXACTLY COPIES the design from this image.

DO NOT GENERATE A NEW DESIGN. COPY THE EXISTING DESIGN FROM THE IMAGE:
- EXACT same color scheme, gradients, and color blocking as shown
- EXACT same typography, fonts, and text content as shown
- EXACT same graphic elements, icons, patterns as shown
- EXACT same layout hierarchy and positioning as shown
- EXACT same badges, certifications, seals as shown
- EXACT same product imagery style as shown

The flat layout is simply the 3D mockup "unwrapped" into a 2D template. Every visual element from the mockup image MUST appear in the flat layout.
=== END REFERENCE ===

`;
      finalPrompt = referenceImagePrompt + finalPrompt;
    }
    
    // Add the text prompt
    if (messageContent.length > 0) {
      messageContent.push({
        type: "text",
        text: finalPrompt
      });
    } else {
      console.log("Creating text-only message (no images)");
      messageContent = finalPrompt as any;
    }

    // Use OpenRouter with Nanobanana Pro (google/gemini-3-pro-image-preview) for highest quality
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://lovable.dev",
        "X-Title": "Lovable Product Mockup Generator"
      },
      body: JSON.stringify({
        model: "google/gemini-3-pro-image-preview",
        messages: [
          {
            role: "user",
            content: messageContent
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

    // Check for upstream provider errors (e.g., network issues, 502 errors)
    const choiceError = data.choices?.[0]?.error;
    if (choiceError) {
      console.error("Upstream provider error:", JSON.stringify(choiceError));
      const errorMessage = choiceError.message || "AI provider error";
      const errorCode = choiceError.code || 500;
      
      // Return a user-friendly error for transient issues
      if (errorCode === 502 || errorMessage.includes("Network") || errorMessage.includes("connection")) {
        return new Response(
          JSON.stringify({ error: "AI provider temporarily unavailable. Please try again in a few seconds." }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(errorMessage);
    }

    if (!imageUrl) {
      console.error("No image in response:", JSON.stringify(data));
      throw new Error("No image generated in response. Please try again.");
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