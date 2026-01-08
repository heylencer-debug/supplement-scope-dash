import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// =============================================================================
// FLAVOR TO IMAGERY MAPPING (ALL 40+ MAPPINGS PRESERVED)
// =============================================================================
const flavorToImageryMap: Record<string, { visual: string; style: string; colors: string[] }> = {
  'berry': { visual: 'mixed berries (blueberries, raspberries, blackberries)', style: 'photorealistic with water droplets', colors: ['#4A1C6B', '#8B2252', '#2E1A47'] },
  'blueberry': { visual: 'fresh blueberries with bloom', style: 'photorealistic macro', colors: ['#4169E1', '#1E3A5F', '#2E1A47'] },
  'raspberry': { visual: 'ripe raspberries', style: 'photorealistic with seeds visible', colors: ['#DC143C', '#8B0A50', '#4A0E2C'] },
  'strawberry': { visual: 'sliced strawberries showing seeds', style: 'photorealistic fresh', colors: ['#FF4757', '#DC143C', '#8B0A50'] },
  'mixed berry': { visual: 'assorted fresh berries cascading', style: 'photorealistic abundance', colors: ['#4A1C6B', '#DC143C', '#4169E1'] },
  'citrus': { visual: 'orange and lemon slices', style: 'bright and zesty', colors: ['#FF8C00', '#FFD700', '#FFA500'] },
  'orange': { visual: 'fresh orange slice with peel', style: 'photorealistic juicy', colors: ['#FF8C00', '#FF6600', '#CC5500'] },
  'lemon': { visual: 'lemon wedge with zest', style: 'bright photorealistic', colors: ['#FFF44F', '#FFD700', '#F0E68C'] },
  'lime': { visual: 'lime slice with water droplets', style: 'fresh photorealistic', colors: ['#32CD32', '#228B22', '#006400'] },
  'grapefruit': { visual: 'pink grapefruit half', style: 'photorealistic with segments', colors: ['#FF6B6B', '#FF8E8E', '#FFB6C1'] },
  'tropical': { visual: 'pineapple and mango slices', style: 'vibrant tropical', colors: ['#FFD700', '#FF8C00', '#32CD32'] },
  'mango': { visual: 'sliced mango with cube cuts', style: 'photorealistic golden', colors: ['#FFB347', '#FF8C00', '#FFA500'] },
  'pineapple': { visual: 'pineapple rings and chunks', style: 'photorealistic tropical', colors: ['#FFD700', '#F0E68C', '#DAA520'] },
  'coconut': { visual: 'coconut half with water splash', style: 'photorealistic tropical', colors: ['#FFFAF0', '#DEB887', '#8B7355'] },
  'passionfruit': { visual: 'passionfruit halved showing seeds', style: 'exotic photorealistic', colors: ['#9B30FF', '#FFD700', '#FF6347'] },
  'peach': { visual: 'sliced peach with pit', style: 'soft photorealistic', colors: ['#FFCBA4', '#FF9966', '#FF6B6B'] },
  'apple': { visual: 'red apple slice', style: 'crisp photorealistic', colors: ['#FF0000', '#228B22', '#FFFAF0'] },
  'green apple': { visual: 'green apple slice', style: 'tart photorealistic', colors: ['#7CFC00', '#32CD32', '#FFFAF0'] },
  'grape': { visual: 'purple grape cluster', style: 'photorealistic with bloom', colors: ['#6B238E', '#4B0082', '#8B008B'] },
  'watermelon': { visual: 'watermelon slice with seeds', style: 'summer photorealistic', colors: ['#FF6B6B', '#32CD32', '#2F4F4F'] },
  'cherry': { visual: 'pair of cherries with stems', style: 'glossy photorealistic', colors: ['#DC143C', '#8B0000', '#4A0E2C'] },
  'pomegranate': { visual: 'pomegranate seeds spilling', style: 'jewel-like photorealistic', colors: ['#C41E3A', '#8B0000', '#FFD700'] },
  'acai': { visual: 'acai berries in bowl', style: 'superfood photorealistic', colors: ['#4B0082', '#2E0854', '#1A0033'] },
  'cranberry': { visual: 'fresh cranberries', style: 'tart photorealistic', colors: ['#9F0000', '#DC143C', '#8B0000'] },
  'elderberry': { visual: 'elderberry cluster', style: 'medicinal photorealistic', colors: ['#2E0854', '#4B0082', '#1A0033'] },
  'mint': { visual: 'fresh mint leaves', style: 'crisp photorealistic', colors: ['#98FF98', '#00FF7F', '#228B22'] },
  'vanilla': { visual: 'vanilla bean and orchid', style: 'elegant photorealistic', colors: ['#F3E5AB', '#FFFAF0', '#DEB887'] },
  'chocolate': { visual: 'chocolate pieces and cocoa', style: 'rich photorealistic', colors: ['#3D1C02', '#5C3317', '#8B4513'] },
  'coffee': { visual: 'coffee beans and cup', style: 'aromatic photorealistic', colors: ['#3D1C02', '#5C3317', '#DEB887'] },
  'mocha': { visual: 'coffee and chocolate swirl', style: 'indulgent photorealistic', colors: ['#3D1C02', '#5C3317', '#FFFAF0'] },
  'caramel': { visual: 'caramel drizzle', style: 'golden photorealistic', colors: ['#FFD700', '#DAA520', '#8B4513'] },
  'honey': { visual: 'honey dripping from dipper', style: 'golden photorealistic', colors: ['#FFD700', '#FFA500', '#DAA520'] },
  'ginger': { visual: 'fresh ginger root sliced', style: 'spicy photorealistic', colors: ['#B8860B', '#DAA520', '#FFD700'] },
  'turmeric': { visual: 'turmeric root and powder', style: 'earthy photorealistic', colors: ['#FFD700', '#FFA500', '#B8860B'] },
  'cinnamon': { visual: 'cinnamon sticks and powder', style: 'warm photorealistic', colors: ['#D2691E', '#8B4513', '#A0522D'] },
  'unflavored': { visual: 'clean minimalist design', style: 'pharmaceutical elegance', colors: ['#FFFFFF', '#F5F5F5', '#E0E0E0'] },
  'natural': { visual: 'green leaves and herbs', style: 'organic photorealistic', colors: ['#228B22', '#32CD32', '#90EE90'] },
  'fruit punch': { visual: 'mixed tropical fruits', style: 'vibrant party', colors: ['#FF4757', '#FF8C00', '#FFD700'] },
  'cotton candy': { visual: 'pink and blue cotton candy', style: 'whimsical fun', colors: ['#FFB6C1', '#87CEEB', '#DDA0DD'] },
  'bubblegum': { visual: 'pink bubblegum bubble', style: 'playful nostalgic', colors: ['#FF69B4', '#FFB6C1', '#DDA0DD'] },
};

// =============================================================================
// PACKAGING FORMAT DEFINITIONS (ALL 15 FORMATS PRESERVED)
// =============================================================================
const packagingFormatDetails: Record<string, { shape: string; proportions: string; style: string; labelArea: string }> = {
  'bottle': { shape: 'cylindrical supplement bottle with screw cap', proportions: 'standard 2:1 height-to-width ratio', style: 'opaque HDPE plastic', labelArea: 'wraparound label covering 70% of bottle height' },
  'wide-mouth jar': { shape: 'wide cylindrical jar with large screw-top lid', proportions: 'squat 1:1 ratio, wide opening', style: 'opaque HDPE plastic', labelArea: 'wraparound label, prominent lid visibility' },
  'narrow-mouth bottle': { shape: 'tall narrow bottle with small cap', proportions: 'elongated 3:1 height-to-width', style: 'sleek modern HDPE', labelArea: 'full-height wraparound label' },
  'pouch': { shape: 'stand-up flexible pouch with resealable zipper', proportions: 'rectangular with rounded bottom gusset', style: 'matte finish flexible packaging', labelArea: 'full front panel coverage' },
  'stick pack box': { shape: 'rectangular box containing individual stick packs', proportions: 'standard box 3:2:1 ratio', style: 'cardboard with premium coating', labelArea: 'front panel focus with side details' },
  'sachet': { shape: 'single-serve flat sachet packet', proportions: 'rectangular flat pouch', style: 'foil or matte finish', labelArea: 'full front and back coverage' },
  'blister pack': { shape: 'plastic blister card with backing', proportions: 'rectangular card format', style: 'clear plastic bubbles on printed card', labelArea: 'backing card design' },
  'tube': { shape: 'squeezable tube with flip cap', proportions: 'elongated cylinder 4:1 ratio', style: 'aluminum or plastic tube', labelArea: 'wraparound tube label' },
  'dropper bottle': { shape: 'small glass bottle with dropper cap', proportions: 'compact 2:1 ratio', style: 'amber or clear glass with rubber dropper', labelArea: 'front label with dropper visible' },
  'spray bottle': { shape: 'bottle with pump spray mechanism', proportions: 'standard bottle with spray head', style: 'plastic with spray pump', labelArea: 'front label below spray mechanism' },
  'tall jar - glass (clear)': { shape: 'TALL cylindrical clear glass jar with wide screw-top lid', proportions: 'ELONGATED 3:1 height-to-width ratio (noticeably TALLER than wide)', style: 'TRANSPARENT clear glass showing contents, premium feel', labelArea: 'Front label panel (not wraparound) covering 60% of jar height' },
  'jar': { shape: 'standard cylindrical jar with screw lid', proportions: 'balanced 1.5:1 height-to-width', style: 'opaque plastic or glass', labelArea: 'wraparound or front panel label' },
  'canister': { shape: 'large cylindrical canister with removable lid', proportions: 'tall 2.5:1 ratio for powder storage', style: 'opaque plastic with scoop', labelArea: 'full wraparound label' },
  'box': { shape: 'rectangular cardboard box', proportions: 'varies by content', style: 'printed cardboard', labelArea: 'all six sides designable' },
  'tin': { shape: 'metal tin container with lid', proportions: 'round or rectangular', style: 'metal with printed graphics', labelArea: 'lid and sides' },
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { designBrief, mode = 'mockup', referenceImageUrl, flatLayoutMode, logoImageUrl } = await req.json();
    
    if (!designBrief) {
      throw new Error('Design brief is required');
    }

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // =============================================================================
    // EXTRACT ALL VARIABLES FROM DESIGN BRIEF
    // =============================================================================
    const {
      packagingFormat = 'bottle',
      brandName = 'Brand',
      productName = 'Product',
      frontPanelText,
      textCustomized = false,
      primaryColor,
      secondaryColor,
      accentColor,
      colorsCustomized = false,
      labelAtmosphere,
      heroImagery,
      flavorImagery,
      suggestedClaims,
      certifications,
      benefitIcons,
      suggestedTone,
      productType,
      flavor,
      servingSize,
      servingsPerContainer,
    } = designBrief;

    // Get container details
    const containerDetails = packagingFormatDetails[packagingFormat] || packagingFormatDetails['bottle'];
    
    // Extract colors (USER COLORS TAKE PRIORITY)
    const primaryColorHex = primaryColor?.hex || '#1E3A5F';
    const secondaryColorHex = secondaryColor?.hex || '#FFFFFF';
    const accentColorHex = accentColor?.hex || '#FFD700';
    
    // Detect pet product
    const isPetProduct = productType?.toLowerCase()?.includes('pet') || 
                         productName?.toLowerCase()?.includes('pet') ||
                         productName?.toLowerCase()?.includes('dog') ||
                         productName?.toLowerCase()?.includes('cat');

    // Get flavor imagery if applicable
    const flavorKey = flavor?.toLowerCase() || '';
    const flavorMapping = flavorToImageryMap[flavorKey];
    
    // Determine if we have hero/flavor imagery
    const hasHeroImagery = heroImagery && (heroImagery.primary_visual || heroImagery.primaryVisual);
    const hasFlavorImagery = flavorMapping || (flavorImagery && flavorImagery.visual);

    // =============================================================================
    // BUILD OPTIMIZED PROMPT (CLEAR, COMPLETE, NON-CONTRADICTORY)
    // =============================================================================
    const promptParts: string[] = [];

    // =========================================================================
    // SECTION 0: USER COLOR OVERRIDE (CRITICAL - MUST BE AT TOP)
    // =========================================================================
    if (colorsCustomized) {
      promptParts.push("╔══════════════════════════════════════════════════════════════╗");
      promptParts.push("║  ⚠️  CRITICAL: USER CUSTOMIZED COLORS - MANDATORY  ⚠️         ║");
      promptParts.push("╚══════════════════════════════════════════════════════════════╝");
      promptParts.push("");
      promptParts.push("The user has MANUALLY EDITED these colors. You MUST use them EXACTLY:");
      promptParts.push(`   PRIMARY COLOR (60% of label): ${primaryColorHex}`);
      promptParts.push(`   SECONDARY COLOR (text/headers): ${secondaryColorHex}`);
      promptParts.push(`   ACCENT COLOR (highlights/badges): ${accentColorHex}`);
      promptParts.push("");
      promptParts.push("⛔ IGNORE any gradient_description, atmosphere, or AI-suggested colors.");
      promptParts.push("⛔ DO NOT substitute, soften, or 'improve' these colors.");
      promptParts.push("✅ USE ONLY these 3 hex values plus white/black for text contrast.");
      promptParts.push("");
    }

    // =========================================================================
    // SECTION 1: TASK DESCRIPTION
    // =========================================================================
    promptParts.push("═══════════════════════════════════════════════════════════════");
    promptParts.push("                    PRODUCT MOCKUP GENERATION                   ");
    promptParts.push("═══════════════════════════════════════════════════════════════");
    promptParts.push("");
    promptParts.push(`Create PREMIUM COMMERCIAL PRODUCT PHOTOGRAPHY of a ${packagingFormat}.`);
    promptParts.push("");
    promptParts.push("PHOTOGRAPHY REQUIREMENTS:");
    promptParts.push("• Studio setting with PURE WHITE background (#FFFFFF)");
    promptParts.push("• Professional softbox lighting from upper-left");
    promptParts.push("• Subtle shadow beneath product for grounding");
    promptParts.push("• 3/4 angle view with rim lighting for depth");
    promptParts.push("• Sharp focus, high resolution, commercial quality");
    promptParts.push("• Colors should POP - vibrant and saturated, not muted");
    promptParts.push("");

    // =========================================================================
    // SECTION 2: CONTAINER SHAPE (DETAILED)
    // =========================================================================
    promptParts.push("═══════════════════════════════════════════════════════════════");
    promptParts.push("                       CONTAINER SHAPE                          ");
    promptParts.push("═══════════════════════════════════════════════════════════════");
    promptParts.push("");
    promptParts.push(`PACKAGING FORMAT: ${packagingFormat}`);
    promptParts.push(`SHAPE: ${containerDetails.shape}`);
    promptParts.push(`PROPORTIONS: ${containerDetails.proportions}`);
    promptParts.push(`STYLE: ${containerDetails.style}`);
    promptParts.push(`LABEL AREA: ${containerDetails.labelArea}`);
    promptParts.push("");
    
    // Special handling for tall glass jar
    if (packagingFormat.toLowerCase().includes('tall') && packagingFormat.toLowerCase().includes('glass')) {
      promptParts.push("⚠️ TALL GLASS JAR SPECIAL INSTRUCTIONS:");
      promptParts.push("• Container must be NOTICEABLY TALLER than it is wide (3:1 ratio)");
      promptParts.push("• Glass must be TRANSPARENT/CLEAR - show contents inside");
      promptParts.push("• Premium quality glass appearance with subtle reflections");
      promptParts.push("• Wide screw-top lid, typically white or metallic");
      promptParts.push("");
    }
    
    // Special handling for pouches
    if (packagingFormat.toLowerCase().includes('pouch')) {
      promptParts.push("⚠️ STAND-UP POUCH SPECIAL INSTRUCTIONS:");
      promptParts.push("• Must be a FLEXIBLE STAND-UP POUCH, not a rigid container");
      promptParts.push("• Show the gusseted bottom that allows it to stand");
      promptParts.push("• Resealable zipper visible at top");
      promptParts.push("• Matte or soft-touch finish appearance");
      promptParts.push("");
    }

    // =========================================================================
    // SECTION 3: MANDATORY COLOR PALETTE
    // =========================================================================
    promptParts.push("═══════════════════════════════════════════════════════════════");
    promptParts.push("                    🎨 COLOR PALETTE (MANDATORY)                ");
    promptParts.push("═══════════════════════════════════════════════════════════════");
    promptParts.push("");
    promptParts.push(`PRIMARY COLOR: ${primaryColorHex}`);
    promptParts.push("   → Use for 60% of label area (main background, dominant color)");
    promptParts.push(`   → Name: ${primaryColor?.name || 'Primary'}`);
    promptParts.push("");
    promptParts.push(`SECONDARY COLOR: ${secondaryColorHex}`);
    promptParts.push("   → Use for text, headers, and supporting elements");
    promptParts.push(`   → Name: ${secondaryColor?.name || 'Secondary'}`);
    promptParts.push("");
    promptParts.push(`ACCENT COLOR: ${accentColorHex}`);
    promptParts.push("   → Use for highlights, badges, icons, call-to-action elements");
    promptParts.push(`   → Name: ${accentColor?.name || 'Accent'}`);
    promptParts.push("");
    promptParts.push("COLOR RULES:");
    promptParts.push("• Use ONLY these 3 colors plus white (#FFFFFF) and black (#000000) for contrast");
    promptParts.push("• Ensure HIGH CONTRAST between text and background (readable)");
    promptParts.push("• Colors should appear VIBRANT and SATURATED, not washed out");
    promptParts.push("");

    // =========================================================================
    // SECTION 4: MANDATORY FRONT PANEL TEXT
    // =========================================================================
    promptParts.push("═══════════════════════════════════════════════════════════════");
    promptParts.push("                 📝 FRONT PANEL TEXT (VERBATIM)                 ");
    promptParts.push("═══════════════════════════════════════════════════════════════");
    promptParts.push("");
    
    if (frontPanelText && frontPanelText.trim()) {
      promptParts.push("⚠️ RENDER THIS TEXT EXACTLY AS SHOWN - DO NOT MODIFY:");
      promptParts.push("```");
      promptParts.push(frontPanelText);
      promptParts.push("```");
      promptParts.push("");
      promptParts.push("TEXT RULES:");
      promptParts.push("• Every word above MUST appear on the label");
      promptParts.push("• DO NOT add text that isn't listed above");
      promptParts.push("• DO NOT change spelling, capitalization, or wording");
      promptParts.push("• Arrange text with clear visual hierarchy");
    } else {
      promptParts.push(`BRAND NAME: ${brandName}`);
      promptParts.push(`PRODUCT NAME: ${productName}`);
      if (suggestedClaims && suggestedClaims.length > 0) {
        promptParts.push(`KEY CLAIMS: ${suggestedClaims.slice(0, 3).join(' • ')}`);
      }
    }
    promptParts.push("");

    // Logo handling
    if (logoImageUrl) {
      promptParts.push("LOGO INSTRUCTION:");
      promptParts.push("• A logo image has been provided - incorporate it prominently");
      promptParts.push("• Place logo at TOP of label, above product name");
      promptParts.push("• Logo should be clearly visible but not overwhelm the design");
      promptParts.push("");
    }

    // =========================================================================
    // SECTION 5: VISUAL HIERARCHY
    // =========================================================================
    promptParts.push("═══════════════════════════════════════════════════════════════");
    promptParts.push("                      VISUAL HIERARCHY                          ");
    promptParts.push("═══════════════════════════════════════════════════════════════");
    promptParts.push("");
    promptParts.push("Arrange label elements in this order of visual prominence:");
    promptParts.push("");
    promptParts.push("1️⃣ BRAND NAME (if no logo) or LOGO → Top of label");
    promptParts.push("2️⃣ PRODUCT NAME / HERO CLAIM → LARGEST text element");
    promptParts.push("3️⃣ HERO IMAGERY (if applicable) → Supporting the product name");
    promptParts.push("4️⃣ KEY BENEFITS / CLAIMS → Smaller but readable, with icons");
    promptParts.push("5️⃣ TRUST SIGNALS → Certifications, badges at bottom/corners");
    promptParts.push("");

    // =========================================================================
    // SECTION 6: HERO IMAGERY (SINGLE CONSOLIDATED SECTION)
    // =========================================================================
    promptParts.push("═══════════════════════════════════════════════════════════════");
    promptParts.push("                    🍇 HERO IMAGERY                             ");
    promptParts.push("═══════════════════════════════════════════════════════════════");
    promptParts.push("");
    
    if (hasHeroImagery || hasFlavorImagery) {
      const primaryVisual = heroImagery?.primary_visual || heroImagery?.primaryVisual || 
                           flavorImagery?.visual || flavorMapping?.visual || '';
      const visualStyle = heroImagery?.visual_style || heroImagery?.visualStyle || 
                         flavorImagery?.style || flavorMapping?.style || 'photorealistic';
      const prominence = heroImagery?.prominence || 'accent';
      
      // SINGLE SOURCE OF TRUTH FOR IMAGERY SIZING
      const imageryGuidelines: Record<string, { size: string; placement: string; style: string }> = {
        'hero': {
          size: '15-20% of label area',
          placement: 'Prominently featured near product name (Olly-style bold imagery)',
          style: 'Bold, vibrant, photorealistic with dramatic lighting'
        },
        'accent': {
          size: '8-12% of label area',
          placement: 'Supporting element, corner or alongside text',
          style: 'Clean, professional, complements typography'
        },
        'subtle': {
          size: '3-5% of label area',
          placement: 'Background element or small icon',
          style: 'Understated, doesn\'t compete with text'
        }
      };
      
      const guidelines = imageryGuidelines[prominence] || imageryGuidelines['accent'];
      
      promptParts.push(`PRIMARY VISUAL: ${primaryVisual}`);
      promptParts.push(`VISUAL STYLE: ${visualStyle}`);
      promptParts.push(`PROMINENCE LEVEL: ${prominence.toUpperCase()}`);
      promptParts.push("");
      promptParts.push(`SIZE: ${guidelines.size}`);
      promptParts.push(`PLACEMENT: ${guidelines.placement}`);
      promptParts.push(`RENDERING: ${guidelines.style}`);
      promptParts.push("");
      
      if (flavorMapping) {
        promptParts.push(`FLAVOR IMAGERY REFERENCE: ${flavorMapping.visual}`);
        promptParts.push(`FLAVOR STYLE: ${flavorMapping.style}`);
        promptParts.push("");
      }
      
      promptParts.push("IMAGERY RULES:");
      promptParts.push("• Imagery should be PHOTOREALISTIC unless otherwise specified");
      promptParts.push("• Must harmonize with the color palette");
      promptParts.push("• Should evoke taste, freshness, or efficacy");
      promptParts.push("• NO clip-art, cartoons, or generic stock imagery");
    } else {
      promptParts.push("NO HERO IMAGERY SPECIFIED");
      promptParts.push("→ Focus on TYPOGRAPHY and COLOR as primary design elements");
      promptParts.push("→ Create visual interest through layout and graphic elements");
    }
    promptParts.push("");

    // =========================================================================
    // SECTION 7: DESIGN SYSTEM (UNIFIED - NO CONTRADICTIONS)
    // =========================================================================
    promptParts.push("═══════════════════════════════════════════════════════════════");
    promptParts.push("                      🎯 DESIGN SYSTEM                          ");
    promptParts.push("═══════════════════════════════════════════════════════════════");
    promptParts.push("");
    
    // PILLAR 1: ATMOSPHERE
    promptParts.push("PILLAR 1: ATMOSPHERE");
    promptParts.push("─────────────────────");
    if (labelAtmosphere) {
      promptParts.push(`Overall mood: ${labelAtmosphere.overall_mood || 'Premium and trustworthy'}`);
      promptParts.push(`Design direction: ${labelAtmosphere.design_direction || 'Modern supplement aesthetic'}`);
    } else {
      promptParts.push("Overall mood: Premium, trustworthy, effective");
      promptParts.push("Design direction: Modern supplement aesthetic with professional appeal");
    }
    promptParts.push("");
    
    // PILLAR 2: DYNAMIC LAYOUT
    promptParts.push("PILLAR 2: DYNAMIC LAYOUT");
    promptParts.push("────────────────────────");
    promptParts.push("The label MUST have visual movement and energy.");
    promptParts.push("");
    promptParts.push("CHOOSE ONE signature dynamic element:");
    promptParts.push("• WAVE SEPARATOR: Curved wave dividing color zones");
    promptParts.push("• DIAGONAL STRIPE: Angled color band creating energy");
    promptParts.push("• CURVED BANNER: Arched text banner for key claims");
    promptParts.push("• COLOR TIER: 2-3 horizontal color zones with transitions");
    promptParts.push("• CORNER BURST: Asymmetric corner element drawing the eye");
    promptParts.push("");
    promptParts.push("⚠️ Choose ONLY ONE. Multiple competing elements = cluttered.");
    promptParts.push("");
    
    // PILLAR 3: TYPOGRAPHY
    promptParts.push("PILLAR 3: TYPOGRAPHY");
    promptParts.push("─────────────────────");
    promptParts.push("• Headlines: Bold sans-serif (Montserrat, Poppins, Gilroy)");
    promptParts.push("• Body text: Clean, readable sans-serif");
    promptParts.push("• Hierarchy: Clear size difference between levels");
    promptParts.push("• Contrast: Text ALWAYS readable against background");
    promptParts.push("");
    
    // PILLAR 4: SEMANTIC BENEFIT ICONS
    promptParts.push("PILLAR 4: BENEFIT ICONS");
    promptParts.push("───────────────────────");
    promptParts.push("Use SEMANTIC icons matching the benefit:");
    promptParts.push("  • Sleep → Moon    • Energy → Lightning");
    promptParts.push("  • Heart → Heart   • Brain → Brain");
    promptParts.push("  • Immunity → Shield  • Muscle → Flexed arm");
    promptParts.push("");
    promptParts.push("✗ NO generic checkmarks for everything");
    promptParts.push("");
    
    // PILLAR 5: TRUST SIGNALS
    promptParts.push("PILLAR 5: TRUST SIGNALS");
    promptParts.push("───────────────────────");
    if (certifications && certifications.length > 0) {
      promptParts.push(`Include: ${certifications.slice(0, 4).join(', ')}`);
    }
    promptParts.push("• Place at bottom or corners");
    promptParts.push("• Small but legible, badge/seal styling");
    promptParts.push("");
    
    // PILLAR 6: PREMIUM FINISH
    promptParts.push("PILLAR 6: PREMIUM FINISH");
    promptParts.push("────────────────────────");
    promptParts.push("• Matte or soft-touch label appearance");
    promptParts.push("• Subtle metallic accents optional");
    promptParts.push("• Clean edges, precise alignment");
    promptParts.push("• Professional, shelf-ready appearance");
    promptParts.push("");

    // =========================================================================
    // SECTION 8: PET PRODUCT (CONDITIONAL)
    // =========================================================================
    if (isPetProduct) {
      promptParts.push("═══════════════════════════════════════════════════════════════");
      promptParts.push("                    🐾 PET PRODUCT STYLING                      ");
      promptParts.push("═══════════════════════════════════════════════════════════════");
      promptParts.push("");
      promptParts.push("This is a PET supplement. Adjust accordingly:");
      promptParts.push("• Include friendly pet imagery if appropriate");
      promptParts.push("• Approachable, friendly typography");
      promptParts.push("• Emphasize safety and pet-specific benefits");
      promptParts.push("");
    }

    // =========================================================================
    // SECTION 9: AVOID LIST
    // =========================================================================
    promptParts.push("═══════════════════════════════════════════════════════════════");
    promptParts.push("                     ❌ AVOID THESE MISTAKES                     ");
    promptParts.push("═══════════════════════════════════════════════════════════════");
    promptParts.push("");
    promptParts.push("• Adding text not in the front panel text");
    promptParts.push("• Changing the specified colors");
    promptParts.push("• Generic checkmarks instead of semantic icons");
    promptParts.push("• Plain centered text stack with no visual interest");
    promptParts.push("• Muted, desaturated, or washed-out colors");
    promptParts.push("• Multiple competing graphic elements");
    promptParts.push("• Confetti, starbursts, or scattered shapes");
    promptParts.push("• Unreadable text (poor contrast)");
    promptParts.push("• Wrong container shape/proportions");
    promptParts.push("");

    // =========================================================================
    // SECTION 10: FINAL CHECKLIST
    // =========================================================================
    promptParts.push("═══════════════════════════════════════════════════════════════");
    promptParts.push("                     ✅ FINAL CHECKLIST                          ");
    promptParts.push("═══════════════════════════════════════════════════════════════");
    promptParts.push("");
    promptParts.push(`☐ Container is ${packagingFormat} with correct proportions`);
    promptParts.push(`☐ Primary color ${primaryColorHex} is dominant (60%)`);
    promptParts.push(`☐ Secondary ${secondaryColorHex} for text`);
    promptParts.push(`☐ Accent ${accentColorHex} for highlights`);
    promptParts.push("☐ All front panel text rendered exactly");
    if (hasHeroImagery || hasFlavorImagery) {
      const visual = heroImagery?.primary_visual || heroImagery?.primaryVisual || 
                    flavorImagery?.visual || flavorMapping?.visual || '';
      promptParts.push(`☐ Hero imagery (${visual}) visible`);
    }
    promptParts.push("☐ ONE dynamic layout element included");
    promptParts.push("☐ Professional studio photography quality");
    promptParts.push("☐ White background, soft shadows");
    promptParts.push("");

    // =========================================================================
    // FLAT LAYOUT MODE
    // =========================================================================
    if (mode === 'flat') {
      promptParts.length = 0;
      
      promptParts.push("═══════════════════════════════════════════════════════════════");
      promptParts.push("              FLAT PACKAGING LABEL DESIGN (2D)                 ");
      promptParts.push("═══════════════════════════════════════════════════════════════");
      promptParts.push("");
      
      if (colorsCustomized) {
        promptParts.push("⚠️ USER CUSTOMIZED COLORS - USE EXACTLY:");
        promptParts.push(`   PRIMARY: ${primaryColorHex}`);
        promptParts.push(`   SECONDARY: ${secondaryColorHex}`);
        promptParts.push(`   ACCENT: ${accentColorHex}`);
        promptParts.push("");
      }
      
      if (flatLayoutMode === 'front-only') {
        promptParts.push("MODE: FRONT PANEL ONLY");
        promptParts.push("");
        promptParts.push("Create a FLAT 2D design of JUST the FRONT PANEL.");
        promptParts.push("CANVAS: Rectangular, 16:9 or 4:3 aspect ratio");
        promptParts.push("VIEW: Perfectly flat, no perspective, no 3D");
        promptParts.push("");
      } else {
        promptParts.push("MODE: FULL DIELINE LAYOUT");
        promptParts.push("");
        promptParts.push("Create a FLAT 2D dieline showing ALL PANELS:");
        promptParts.push("• Front panel (center, largest)");
        promptParts.push("• Back panel (product info)");
        promptParts.push("• Side panels if applicable");
        promptParts.push("");
      }
      
      promptParts.push(`PACKAGING FORMAT: ${packagingFormat}`);
      promptParts.push("");
      promptParts.push("COLOR PALETTE:");
      promptParts.push(`   PRIMARY: ${primaryColorHex}`);
      promptParts.push(`   SECONDARY: ${secondaryColorHex}`);
      promptParts.push(`   ACCENT: ${accentColorHex}`);
      promptParts.push("");
      
      if (frontPanelText) {
        promptParts.push("FRONT PANEL TEXT (EXACT):");
        promptParts.push("```");
        promptParts.push(frontPanelText);
        promptParts.push("```");
        promptParts.push("");
      }
      
      if (hasHeroImagery || hasFlavorImagery) {
        const visual = heroImagery?.primary_visual || heroImagery?.primaryVisual || 
                      flavorImagery?.visual || flavorMapping?.visual || '';
        promptParts.push(`HERO IMAGERY: ${visual}`);
        promptParts.push("");
      }
      
      promptParts.push("DESIGN REQUIREMENTS:");
      promptParts.push("• Professional label design, print-ready");
      promptParts.push("• Clear visual hierarchy");
      promptParts.push("• ONE dynamic layout element");
      promptParts.push("• High contrast, readable text");
    }

    // =============================================================================
    // PREPARE API REQUEST
    // =============================================================================
    const finalPrompt = promptParts.join('\n');
    
    console.log(`=== MOCKUP GENERATION REQUEST ===`);
    console.log(`Mode: ${mode}`);
    console.log(`Packaging: ${packagingFormat}`);
    console.log(`Colors customized: ${colorsCustomized}`);
    console.log(`Colors: Primary=${primaryColorHex}, Secondary=${secondaryColorHex}, Accent=${accentColorHex}`);
    console.log(`Prompt: ${finalPrompt.length} chars, ${promptParts.length} lines`);
    console.log(`Hero imagery: ${hasHeroImagery}, Flavor imagery: ${hasFlavorImagery}`);
    
    // Build messages array
    const messageContent: any[] = [{ type: "text", text: finalPrompt }];
    
    // Add reference image for flat layout
    if (referenceImageUrl && mode === 'flat') {
      messageContent.push({ type: "image_url", image_url: { url: referenceImageUrl } });
      console.log(`Reference image: ${referenceImageUrl.substring(0, 50)}...`);
    }
    
    // Add logo image
    if (logoImageUrl) {
      messageContent.push({ type: "image_url", image_url: { url: logoImageUrl } });
      console.log(`Logo image: ${logoImageUrl.substring(0, 50)}...`);
    }

    // =============================================================================
    // CALL AI IMAGE GENERATION API
    // =============================================================================
    console.log("Calling Lovable AI Gateway...");
    
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image-preview",
        messages: [
          {
            role: "user",
            content: messageContent.length === 1 ? finalPrompt : messageContent
          }
        ],
        modalities: ["image", "text"]
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`API error: ${response.status} - ${errorText}`);
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log("API response received");
    
    // Extract image from response
    let imageUrl = null;
    
    if (data.choices?.[0]?.message?.images?.[0]?.image_url?.url) {
      imageUrl = data.choices[0].message.images[0].image_url.url;
    } else if (data.choices?.[0]?.message?.content) {
      const content = data.choices[0].message.content;
      if (Array.isArray(content)) {
        for (const item of content) {
          if (item.type === 'image_url' && item.image_url?.url) {
            imageUrl = item.image_url.url;
            break;
          }
        }
      }
    }

    console.log(`Generated image: ${imageUrl ? 'SUCCESS' : 'NOT FOUND'}`);

    return new Response(JSON.stringify({ 
      success: true,
      imageUrl,
      promptLength: finalPrompt.length,
      promptLines: promptParts.length,
      colorsUsed: {
        primary: primaryColorHex,
        secondary: secondaryColorHex,
        accent: accentColorHex,
        customized: colorsCustomized
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Error in generate-product-mockup:', errorMessage);
    return new Response(JSON.stringify({ 
      success: false,
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
