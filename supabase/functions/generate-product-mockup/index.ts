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
  // Default/legacy mappings
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
  'jar': { shape: 'standard cylindrical jar with screw lid', proportions: 'balanced 1.5:1 height-to-width', style: 'opaque plastic or glass', labelArea: 'wraparound or front panel label' },
  'canister': { shape: 'large cylindrical canister with removable lid', proportions: 'tall 2.5:1 ratio for powder storage', style: 'opaque plastic with scoop', labelArea: 'full wraparound label' },
  'box': { shape: 'rectangular cardboard box', proportions: 'varies by content', style: 'printed cardboard', labelArea: 'all six sides designable' },
  'tin': { shape: 'metal tin container with lid', proportions: 'round or rectangular', style: 'metal with printed graphics', labelArea: 'lid and sides' },
  
  // NEW: Frontend dropdown values (exact match)
  'soft chew resealable pouch': { shape: 'stand-up flexible pouch with resealable zipper', proportions: 'rectangular with rounded bottom gusset', style: 'matte finish flexible packaging for soft chews', labelArea: 'full front panel coverage' },
  'resealable stand-up pouch': { shape: 'stand-up flexible pouch with resealable zipper', proportions: 'rectangular with rounded bottom gusset', style: 'matte finish flexible packaging', labelArea: 'full front panel coverage' },
  'wide-mouth plastic jar': { shape: 'wide cylindrical jar with large screw-top lid', proportions: 'squat 1:1 ratio, wide opening', style: 'opaque HDPE plastic', labelArea: 'wraparound label, prominent lid visibility' },
  'narrow-mouth plastic jar': { shape: 'tall narrow plastic jar with screw cap', proportions: 'elongated 2.5:1 height-to-width', style: 'opaque HDPE plastic, slim profile', labelArea: 'full-height wraparound label' },
  'glass jar with screw cap': { shape: 'cylindrical glass jar with metal or plastic screw cap', proportions: 'standard 1.5:1 height-to-width', style: 'clear or amber glass, premium feel', labelArea: 'front label panel or wraparound' },
  'narrow-mouth glass jar': { shape: 'tall narrow glass jar with screw cap', proportions: 'elongated 2.5:1 height-to-width', style: 'clear glass, slim elegant profile', labelArea: 'full-height front label' },
  'tall clear glass jar': { shape: 'TALL cylindrical clear glass jar with wide screw-top lid', proportions: 'ELONGATED 3:1 height-to-width ratio (noticeably TALLER than wide)', style: 'TRANSPARENT clear glass showing contents, premium feel', labelArea: 'Front label panel (not wraparound) covering 60% of jar height' },
  'hexagonal glass jar': { shape: 'hexagonal glass jar with screw lid', proportions: 'balanced 1.5:1 ratio, 6-sided', style: 'clear glass with unique hexagonal shape', labelArea: 'front panel label on flat face' },
  'square glass jar': { shape: 'square glass jar with screw lid', proportions: 'balanced 1.5:1 ratio, 4 flat sides', style: 'clear glass with modern square shape', labelArea: 'front panel label on flat face' },
  'amber apothecary jar': { shape: 'apothecary-style jar with wide mouth', proportions: 'classic 1.5:1 ratio', style: 'amber glass with vintage apothecary aesthetic', labelArea: 'front label with vintage styling' },
  'cobalt blue glass jar': { shape: 'cylindrical glass jar with screw lid', proportions: 'balanced 1.5:1 ratio', style: 'deep cobalt blue glass, premium medicinal look', labelArea: 'front panel label' },
  'mason jar': { shape: 'mason jar with two-piece lid', proportions: 'classic mason jar 1.5:1 ratio', style: 'clear glass with embossed pattern, rustic charm', labelArea: 'front label or wraparound' },
  'supplement bottle with flip cap': { shape: 'cylindrical supplement bottle with flip-top cap', proportions: 'standard 2:1 height-to-width', style: 'opaque HDPE plastic with flip cap', labelArea: 'wraparound label covering 70% of height' },
  'amber dropper bottle': { shape: 'small amber glass bottle with dropper cap', proportions: 'compact 2:1 ratio', style: 'amber glass with rubber dropper, medicinal aesthetic', labelArea: 'front label with dropper visible' },
  'squeeze bottle': { shape: 'flexible squeeze bottle with nozzle', proportions: 'elongated 2.5:1 ratio', style: 'soft plastic squeeze bottle', labelArea: 'front and back labels' },
  'pump bottle': { shape: 'bottle with pump dispenser mechanism', proportions: 'standard bottle with pump head', style: 'plastic or glass with pump mechanism', labelArea: 'front label below pump' },
  'tube packaging': { shape: 'squeezable tube with flip cap', proportions: 'elongated cylinder 4:1 ratio', style: 'aluminum or plastic tube', labelArea: 'wraparound tube label' },
  'sachet packet': { shape: 'single-serve flat sachet packet', proportions: 'rectangular flat pouch', style: 'foil or matte finish', labelArea: 'full front and back coverage' },
  'tin container': { shape: 'metal tin container with removable lid', proportions: 'round or rectangular', style: 'metal with printed graphics, vintage appeal', labelArea: 'lid and sides' },
  'kraft paper bag': { shape: 'stand-up kraft paper bag with window', proportions: 'rectangular with flat bottom', style: 'natural kraft paper, eco-friendly aesthetic', labelArea: 'front panel with optional window' },
  
  // Legacy key (kept for backwards compatibility)
  'tall jar - glass (clear)': { shape: 'TALL cylindrical clear glass jar with wide screw-top lid', proportions: 'ELONGATED 3:1 height-to-width ratio (noticeably TALLER than wide)', style: 'TRANSPARENT clear glass showing contents, premium feel', labelArea: 'Front label panel (not wraparound) covering 60% of jar height' },
};

// =============================================================================
// TONE-SPECIFIC DESIGN SYSTEMS - EACH TONE HAS DISTINCT VISUAL CHARACTERISTICS
// =============================================================================
interface ToneDesignSystem {
  typography: string;
  dynamicLayout: string;
  colorApplication: string;
  finish: string;
  iconStyle: string;
  avoidList: string[];
}

const toneDesignSystems: Record<string, ToneDesignSystem> = {
  premium: {
    typography: "Elegant serif OR refined thin sans-serif (Playfair Display, Didot, Futura Light). Wide letter-spacing (0.1em+). Thin to medium weights ONLY. Gold or embossed text effects.",
    dynamicLayout: "Centered symmetry, ornate gold foil borders, subtle embossed textures, classical proportions. NO diagonal stripes or bold aggressive shapes.",
    colorApplication: "Deep jewel tones as primary (60%), metallic gold/silver accents (15%), rich gradients allowed. Colors should feel EXPENSIVE.",
    finish: "Soft-touch matte base with SPOT GLOSS accents, gold/silver FOIL STAMPING on key text, embossed logo, tactile premium feel.",
    iconStyle: "Thin-line elegant icons, gold-outlined, refined simplicity, ornate flourishes acceptable.",
    avoidList: ["Bold aggressive shapes", "Bright neon colors", "Playful rounded fonts", "Cluttered layouts", "Cheap plastic look"]
  },
  clean: {
    typography: "Minimal ultra-thin sans-serif (Helvetica Neue Light, Inter Thin, SF Pro Thin). Maximum letter-spacing. Single font weight throughout. NO decorative fonts.",
    dynamicLayout: "Strict invisible grid, asymmetric balance, 70%+ white space. ONLY horizontal or vertical lines allowed. ONE visual element maximum.",
    colorApplication: "Monochromatic palette (one hue + white + black). Single accent at 10% maximum. High contrast. NO gradients.",
    finish: "Pure flat matte, no textures, no embossing, no effects. Architectural clean lines. Paper-like simplicity.",
    iconStyle: "Single-line hairline icons, geometric precision, maximum reduction. Icons should be barely noticeable.",
    avoidList: ["Multiple colors", "Decorative elements", "Bold weights", "Busy layouts", "Gradients", "Textures"]
  },
  bold: {
    typography: "HEAVY condensed sans-serif (Impact, Bebas Neue, Anton). ALL-CAPS headlines. Extreme weight contrast. Thick strokes. Aggressive letterforms.",
    dynamicLayout: "Aggressive diagonal stripes (30-45° angles), sharp angular color blocks, asymmetric corner bursts, maximum visual tension.",
    colorApplication: "MAXIMUM saturation only, stark black/white contrast, NO pastels ever, aggressive color blocking with hard edges. Colors should SHOUT.",
    finish: "HIGH GLOSS maximum shine, bold metallic accents, no subtlety. Chrome or mirror effects acceptable.",
    iconStyle: "Thick bold filled icons, maximum visual weight, sharp edges, aggressive styling.",
    avoidList: ["Subtle elements", "Light font weights", "Gentle curves", "Muted colors", "Pastels", "Delicate details"]
  },
  natural: {
    typography: "Organic serif with personality (Garamond, Libre Baskerville) OR hand-lettered script. Warm, approachable. Intentional imperfection welcome.",
    dynamicLayout: "Asymmetric organic flow, botanical leaf/vine elements, hand-drawn borders, flowing curves that mimic nature. NO sharp geometric shapes.",
    colorApplication: "Earth tones ONLY (terracotta, sage, cream, olive, brown, forest green). Muted saturation. Kraft paper feel. NO bright colors.",
    finish: "Kraft paper or recycled texture, letterpress effect, uncoated matte, visible paper grain. NO gloss anywhere.",
    iconStyle: "Hand-drawn botanical icons, leaves, branches, sketch-style illustrations, woodcut aesthetic.",
    avoidList: ["Geometric precision", "Bright neon", "Metallic accents", "Clinical layouts", "Glossy finishes", "Sans-serif fonts"]
  },
  scientific: {
    typography: "Technical sans-serif (DIN, Eurostile Extended, IBM Plex Mono). Monospace for data points. Precise spacing. Medium weights.",
    dynamicLayout: "Infographic-style layout, hexagonal patterns, molecular structures, data visualization grids, precise measurements shown.",
    colorApplication: "Clinical blues, laboratory whites, data-viz palette (precise color ratios). Scientific precision in color choices. Cool temperature.",
    finish: "Matte technical, precision printing, no decorative elements whatsoever. Laboratory sterile.",
    iconStyle: "Geometric molecular icons, hexagons, atom symbols, chart/graph elements, scientific notation.",
    avoidList: ["Organic shapes", "Warm colors", "Handwriting", "Decorative flourishes", "Playful elements", "Rounded corners"]
  },
  playful: {
    typography: "Rounded bouncy sans-serif (Quicksand, Nunito, Fredoka One, Baloo). Varied sizes creating rhythm. Fun weight contrasts. Character-like letterforms.",
    dynamicLayout: "Asymmetric scattered elements, floating shapes, confetti-style accents, diagonal energy, corner bursts, speech bubbles acceptable.",
    colorApplication: "Bright CANDY colors (4+ colors OK), rainbow gradients encouraged, pink/yellow/turquoise/orange palette. NO muted tones.",
    finish: "GLOSSY bright finish, slight 3D depth on elements, bubble/balloon effects, cheerful reflections.",
    iconStyle: "Filled colorful cartoon-style icons, rounded shapes, character-like illustrations, emoji-inspired.",
    avoidList: ["Serif fonts", "Formal layouts", "Muted colors", "Thin typography", "Serious/clinical feel", "Monochromatic"]
  },
  clinical: {
    typography: "Medical-grade sans-serif (Helvetica, Arial, Roboto). Clean, precise, maximum readability. Regular weights. Pharmaceutical styling.",
    dynamicLayout: "Strict horizontal bands, drug-facts style boxes, structured data hierarchy, Rx-style layout. NO diagonal elements.",
    colorApplication: "White dominant (80%+), clinical blues, pharmaceutical greens. Single brand color accent. Sterile precision.",
    finish: "Pharmacy-grade clean matte, tamper-evident styling suggestion, sterile hospital appearance. No decorative elements.",
    iconStyle: "Medical crosses, Rx symbols, pill shapes, dosage icons, warning triangles, simple outlined medical imagery.",
    avoidList: ["Decorative elements", "Multiple bright colors", "Playful shapes", "Organic forms", "Hand-drawn anything", "Warm tones"]
  },
  organic: {
    typography: "Natural script elements OR soft serif (Libre Baskerville, EB Garamond). Hand-lettering accents. Warm and authentic feeling.",
    dynamicLayout: "Flowing botanical-inspired shapes, asymmetric natural balance, leaf/flower motifs, curved natural borders.",
    colorApplication: "Muted earth tones (sage, terracotta, mushroom, sand). Sustainable green accents. Eco-friendly palette. Desaturated.",
    finish: "Textured uncoated paper look, eco-friendly recycled feel, subtle organic patterns, no plastic appearance.",
    iconStyle: "Botanical line art, sustainability symbols, leaf/plant icons, eco-certification badges, nature-inspired.",
    avoidList: ["Synthetic colors", "Glossy plastic look", "Geometric precision", "Bold industrial fonts", "Neon anything"]
  },
  energetic: {
    typography: "Dynamic condensed sans (Oswald, Barlow Condensed, Bebas Neue). Italicized for speed. Motion blur text effects welcome.",
    dynamicLayout: "Diagonal compositions (15-30°), speed lines, motion blur effects, lightning bolt shapes, forward-leaning angles.",
    colorApplication: "Electric neon colors (electric blue, lime green, hot orange), energy drink palette, motion gradients, black backgrounds OK.",
    finish: "High gloss metallic, reflective speed accents, chrome energy effects, dynamic lighting.",
    iconStyle: "Lightning bolts, arrows, motion lines, speed indicators, energy symbols, athletic icons.",
    avoidList: ["Static centered layouts", "Calm pastel colors", "Serif fonts", "Gentle curves", "Slow/relaxed imagery"]
  },
  luxurious: {
    typography: "Ultra-elegant serif (Bodoni, Didot, Playfair Display). Hairline thin strokes. EXTREME letter-spacing. Refined uppercase.",
    dynamicLayout: "Perfect centered symmetry, ornate classical borders, refined margins (20%+ padding), aristocratic proportions.",
    colorApplication: "Deep blacks, rich golds, royal purples, champagne, jewel tones ONLY. 50% should feel metallic or rich.",
    finish: "METALLIC FOIL everywhere possible, velvet soft-touch, embossed crests/monograms, luxury unboxing feel.",
    iconStyle: "Ornate refined icons, gold-outlined crests, classical motifs, heraldic elements, monogram-style.",
    avoidList: ["Bright primary colors", "Casual fonts", "Asymmetric layouts", "Bold chunky weights", "Playful elements"]
  },
  minimalist: {
    typography: "Ultra-light sans-serif ONLY (Avenir Next Ultra Light, Helvetica Ultra Light). Single weight. Maximum tracking (0.2em+).",
    dynamicLayout: "EXTREME reduction - only essential elements. 85%+ white space. Invisible grid. ONE focal point only.",
    colorApplication: "Monochromatic with ONE accent at 5%. 85%+ white. Maximum restraint. Consider all-white with subtle gray.",
    finish: "Pure matte, ZERO effects, ZERO textures, ZERO decoration. Architectural museum quality.",
    iconStyle: "Hairline single-stroke icons only. Consider NO icons. If used, barely visible.",
    avoidList: ["Multiple colors", "Decorative anything", "Bold weights", "Patterns", "Textures", "More than 3 elements total"]
  },
  trustworthy: {
    typography: "Traditional serif (Times, Georgia) OR conservative sans (Arial, Calibri). Medium weights. Professional and established.",
    dynamicLayout: "Centered traditional hierarchy, badge/seal elements, established brand patterns, conventional structure.",
    colorApplication: "Navy blue, forest green, burgundy, conservative professional palette. Traditional color blocking.",
    finish: "Professional matte, subtle texture, conservative elegance, bank/institution quality.",
    iconStyle: "Traditional badges, shields, established trust seals, checkmarks, professional certification icons.",
    avoidList: ["Trendy fonts", "Neon colors", "Playful elements", "Extreme minimalism", "Avant-garde layouts"]
  },
  // NEW TONES
  pharmaceutical: {
    typography: "Medical precise sans-serif (Helvetica Neue, Arial Narrow, Roboto). Clean pharmaceutical styling. ALL regulatory text clearly readable.",
    dynamicLayout: "Rx-style horizontal bands, drug facts panel mimicry, dosage emphasis boxes, strict medical grid, FDA-compliant appearance.",
    colorApplication: "Clinical white base (85%+), single pharmacy blue or green accent. NO bright colors. Sterile medical palette.",
    finish: "Clinical matte, pharmacy-grade clean, tamper-evident visual cues, blister pack precision.",
    iconStyle: "Rx pharmacy symbols, medical dosage icons, capsule/pill shapes, healthcare professional imagery, warning symbols.",
    avoidList: ["Decorative elements", "Warm colors", "Playful anything", "Marketing-heavy design", "Lifestyle imagery"]
  },
  artisanal: {
    typography: "Hand-drawn letterforms OR vintage serif (hand-lettering, antique scripts, wood type revival). Intentionally imperfect. Batch-numbered feel.",
    dynamicLayout: "Intentionally imperfect alignment, wax seal elements, hand-stamped borders, maker's marks, craft label aesthetic.",
    colorApplication: "Vintage muted palette (mustard, burgundy, olive, aged cream). Single or two-color print look. Aged paper tones.",
    finish: "Letterpress texture, rough deckled edges, wax seal impression, stamp effects, uncoated fibrous paper.",
    iconStyle: "Hand-drawn illustrations, woodcut style, vintage emblems, maker's marks, craft badges.",
    avoidList: ["Perfect digital precision", "Modern sans-serif", "Bright saturated colors", "Glossy finish", "Corporate look"]
  },
  tech: {
    typography: "Futuristic/cyber sans OR monospace (Space Grotesk, JetBrains Mono, Orbitron, Rajdhani). Data-driven. Biohacker aesthetic.",
    dynamicLayout: "Circuit board patterns, hexagonal bio grids, data streams, holographic effects, tech startup aesthetic.",
    colorApplication: "Cyber palette (electric blue, neon green, purple glow), DARK backgrounds encouraged, matrix-style accents.",
    finish: "Holographic foil, circuit-board texture, LED glow effects, futuristic material simulation.",
    iconStyle: "Tech icons, circuits, DNA helixes, biometric patterns, data visualizations, futuristic symbols.",
    avoidList: ["Traditional fonts", "Warm earth tones", "Vintage styling", "Organic shapes", "Classical layouts"]
  },
  vintage: {
    typography: "Retro-revival fonts (Playfair, vintage scripts, Art Deco inspired, 1920s-1960s type). Nostalgic warmth. Period-accurate.",
    dynamicLayout: "Retro badge layouts, vintage frames, ribbon banners, classic symmetry, era-specific motifs (Art Deco, Mid-Century).",
    colorApplication: "Faded vintage palette (cream, rust, sage, faded navy, sepia). Aged appearance. Period-appropriate colors.",
    finish: "Aged paper texture, vintage printing effects (slight misregistration), patina, classic label appearance.",
    iconStyle: "Vintage emblems, retro badges, classic era illustrations, nostalgic imagery, hand-drawn vintage style.",
    avoidList: ["Modern minimalism", "Neon colors", "Futuristic elements", "Sharp digital precision", "Contemporary layouts"]
  },
  sporty: {
    typography: "Athletic condensed (Bebas Neue Bold, Oswald Bold, Impact). Aggressive angles. PERFORMANCE-focused. Action sports aesthetic.",
    dynamicLayout: "Dynamic 30-45° angles, racing stripes, performance stat callouts, athletic swooshes, victory podium energy.",
    colorApplication: "High-energy action colors (red, orange, electric blue), aggressive contrast, black as base. Team jersey palette.",
    finish: "Metallic performance accents, carbon fiber texture optional, athletic sheen, sports equipment material feel.",
    iconStyle: "Athletic icons, muscles, motion arrows, performance metrics, sports equipment, victory symbols.",
    avoidList: ["Delicate serif fonts", "Pastel colors", "Gentle curves", "Luxury styling", "Calm/zen aesthetic"]
  },
  zen: {
    typography: "Light airy sans-serif (Inter Light, Lato Light, Quicksand Light). Generous spacing. Peaceful breathing room. Meditation-app feel.",
    dynamicLayout: "Flowing organic curves, water ripple effects, minimal elements, maximum calm. Asymmetric natural balance. Japanese minimalism.",
    colorApplication: "Soft pastels (lavender, sage, cream, soft pink), 70%+ white/light space. Colors should lower heart rate.",
    finish: "Soft matte, gentle-touch paper feel, no harsh contrasts anywhere, spa-like calm.",
    iconStyle: "Simple nature icons, lotus flowers, gentle waves, leaves, minimal strokes, meditation symbols.",
    avoidList: ["Bold aggressive elements", "Bright saturated colors", "Busy layouts", "Sharp angles", "High contrast", "Energetic elements"]
  }
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

    const openRouterApiKey = Deno.env.get('OPENROUTER_API_KEY');
    if (!openRouterApiKey) {
      throw new Error('OPENROUTER_API_KEY not configured');
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
    
    // PILLAR 1: ATMOSPHERE & VISUAL STYLING (EXPANDED)
    promptParts.push("PILLAR 1: ATMOSPHERE & VISUAL STYLING");
    promptParts.push("─────────────────────────────────────");
    if (labelAtmosphere) {
      promptParts.push(`Overall mood: ${labelAtmosphere.overall_mood || 'Premium and trustworthy'}`);
      promptParts.push(`Design direction: ${labelAtmosphere.design_direction || 'Modern supplement aesthetic'}`);
      
      // GRADIENT STYLING - Respects user's brand colors when customized
      promptParts.push("");
      promptParts.push("🎨 GRADIENT STYLING:");
      if (colorsCustomized) {
        // User selected colors - generate gradient from their palette
        promptParts.push(`   Apply gradient using YOUR SELECTED BRAND COLORS:`);
        promptParts.push(`   Primary (${primaryColorHex}) → Secondary (${secondaryColorHex})`);
        promptParts.push(`   Use accent (${accentColorHex}) for highlights in the gradient`);
        promptParts.push("   → Create smooth transition between your brand colors on label background");
      } else if (labelAtmosphere.gradient_description) {
        // AI-suggested gradient when no customization
        promptParts.push(`   Apply this gradient effect: ${labelAtmosphere.gradient_description}`);
        promptParts.push("   → Use as subtle background transition or color flow across label");
      }
      
      // RESTORED: Ambient pattern (geometric elements)
      if (labelAtmosphere.ambient_pattern) {
        promptParts.push("");
        promptParts.push("🔷 BACKGROUND PATTERN:");
        promptParts.push(`   Pattern type: ${labelAtmosphere.ambient_pattern}`);
        if (labelAtmosphere.pattern_opacity) {
          promptParts.push(`   Opacity: ${labelAtmosphere.pattern_opacity}`);
        }
        promptParts.push("   → Apply as subtle background texture/pattern on label");
      }
      
      // RESTORED: Decorative elements
      if (labelAtmosphere.decorative_elements && labelAtmosphere.decorative_elements.length > 0) {
        promptParts.push("");
        promptParts.push("✨ DECORATIVE ELEMENTS:");
        promptParts.push(`   Include: ${labelAtmosphere.decorative_elements.join(', ')}`);
        promptParts.push("   → These are subtle background/accent elements matching product mood");
      }
      
      // RESTORED: Design accents
      if (labelAtmosphere.design_accents && labelAtmosphere.design_accents.length > 0) {
        promptParts.push("");
        promptParts.push("🏅 DESIGN ACCENTS:");
        promptParts.push(`   Add: ${labelAtmosphere.design_accents.join(', ')}`);
        promptParts.push("   → Premium finishing touches like borders, foil stamps, embossing");
      }
      
      // RESTORED: Texture finish
      if (labelAtmosphere.texture_finish) {
        promptParts.push("");
        promptParts.push("🎯 LABEL FINISH:");
        promptParts.push(`   Surface: ${labelAtmosphere.texture_finish}`);
      }
      
      // RESTORED: Text finish
      if (labelAtmosphere.text_finish) {
        promptParts.push("");
        promptParts.push("📝 TEXT STYLING:");
        promptParts.push(`   Text finish: ${labelAtmosphere.text_finish}`);
      }
      
      // RESTORED: Mood adjectives
      if (labelAtmosphere.mood_adjectives && labelAtmosphere.mood_adjectives.length > 0) {
        promptParts.push("");
        promptParts.push(`Label should feel: ${labelAtmosphere.mood_adjectives.join(', ')}`);
      }
    } else {
      promptParts.push("Overall mood: Premium, trustworthy, effective");
      promptParts.push("Design direction: Modern supplement aesthetic with professional appeal");
    }
    promptParts.push("");
    
    // =========================================================================
    // GET TONE-SPECIFIC DESIGN SYSTEM (if tone is selected)
    // =========================================================================
    const toneValue = suggestedTone 
      ? (typeof suggestedTone === 'string' ? suggestedTone : suggestedTone.primary_tone || 'premium')
      : null;
    const toneSystem = toneValue && toneValue !== 'auto' ? toneDesignSystems[toneValue.toLowerCase()] : null;

    // =========================================================================
    // TONE PRIORITY BLOCK (when user explicitly selects a tone)
    // =========================================================================
    if (toneSystem) {
      promptParts.push("╔══════════════════════════════════════════════════════════════╗");
      promptParts.push(`║  🎭 TONE PRIORITY: ${toneValue.toUpperCase()} - MANDATORY VISUAL STYLE  🎭    ║`);
      promptParts.push("╚══════════════════════════════════════════════════════════════╝");
      promptParts.push("");
      promptParts.push(`The design MUST look distinctly ${toneValue.toUpperCase()}.`);
      promptParts.push("The tone characteristics below OVERRIDE generic design guidance.");
      promptParts.push("If there's ANY conflict, the tone-specific instruction WINS.");
      promptParts.push("");
    }

    // PILLAR 2: DYNAMIC LAYOUT (tone-specific override)
    promptParts.push("PILLAR 2: DYNAMIC LAYOUT");
    promptParts.push("────────────────────────");
    if (toneSystem) {
      promptParts.push(`LAYOUT STYLE: ${toneSystem.dynamicLayout}`);
    } else {
      promptParts.push("The label MUST have visual movement and energy.");
      promptParts.push("");
      promptParts.push("CHOOSE ONE signature dynamic element:");
      promptParts.push("• WAVE SEPARATOR: Curved wave dividing color zones");
      promptParts.push("• DIAGONAL STRIPE: Angled color band creating energy");
      promptParts.push("• CURVED BANNER: Arched text banner for key claims");
      promptParts.push("• COLOR TIER: 2-3 horizontal color zones with transitions");
      promptParts.push("• CORNER BURST: Asymmetric corner element drawing the eye");
    }
    promptParts.push("");
    promptParts.push("⚠️ Choose ONLY ONE dynamic element. Multiple competing elements = cluttered.");
    promptParts.push("");
    
    // PILLAR 3: TYPOGRAPHY (tone-specific override)
    promptParts.push("PILLAR 3: TYPOGRAPHY");
    promptParts.push("─────────────────────");
    if (toneSystem) {
      promptParts.push(`TYPOGRAPHY STYLE: ${toneSystem.typography}`);
    } else {
      promptParts.push("• Headlines: Bold sans-serif (Montserrat, Poppins, Gilroy)");
      promptParts.push("• Body text: Clean, readable sans-serif");
    }
    promptParts.push("• Hierarchy: Clear size difference between levels");
    promptParts.push("• Contrast: Text ALWAYS readable against background");
    promptParts.push("");
    
    // PILLAR 4: SEMANTIC BENEFIT ICONS (tone-specific override)
    promptParts.push("PILLAR 4: BENEFIT ICONS");
    promptParts.push("───────────────────────");
    if (toneSystem) {
      promptParts.push(`ICON STYLE: ${toneSystem.iconStyle}`);
    } else {
      promptParts.push("Use SEMANTIC icons matching the benefit:");
      promptParts.push("  • Sleep → Moon    • Energy → Lightning");
      promptParts.push("  • Heart → Heart   • Brain → Brain");
      promptParts.push("  • Immunity → Shield  • Muscle → Flexed arm");
    }
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
    
    // PILLAR 6: FINISH & TEXTURE (tone-specific override)
    promptParts.push("PILLAR 6: FINISH & TEXTURE");
    promptParts.push("──────────────────────────");
    if (toneSystem) {
      promptParts.push(`FINISH STYLE: ${toneSystem.finish}`);
    } else {
      promptParts.push("• Matte or soft-touch label appearance");
      promptParts.push("• Subtle metallic accents optional");
    }
    promptParts.push("• Clean edges, precise alignment");
    promptParts.push("• Professional, shelf-ready appearance");
    promptParts.push("");

    // PILLAR 7: COLOR APPLICATION (tone-specific override)
    if (toneSystem && !colorsCustomized) {
      promptParts.push("PILLAR 7: COLOR APPLICATION");
      promptParts.push("───────────────────────────");
      promptParts.push(`COLOR STRATEGY: ${toneSystem.colorApplication}`);
      promptParts.push("");
    }

    // =========================================================================
    // SECTION 7B: DESIGN TONE DETAILS
    // =========================================================================
    if (suggestedTone) {
      promptParts.push("═══════════════════════════════════════════════════════════════");
      promptParts.push("                    🎭 DESIGN TONE DETAILS                       ");
      promptParts.push("═══════════════════════════════════════════════════════════════");
      promptParts.push("");
      
      const descriptors = typeof suggestedTone === 'object' && suggestedTone.tone_descriptors
        ? suggestedTone.tone_descriptors.join(', ')
        : '';
        
      const emotionalAppeal = typeof suggestedTone === 'object' && suggestedTone.emotional_appeal
        ? suggestedTone.emotional_appeal
        : '';

      const copyVoice = typeof suggestedTone === 'object' && suggestedTone.copy_voice
        ? suggestedTone.copy_voice
        : '';
        
      promptParts.push(`Active Tone: ${(toneValue || 'premium').toUpperCase()}`);
      
      if (descriptors) {
        promptParts.push(`Style Descriptors: ${descriptors}`);
      }
      
      if (emotionalAppeal) {
        promptParts.push(`Emotional Appeal: ${emotionalAppeal}`);
      }

      if (copyVoice) {
        promptParts.push(`Copy Voice: ${copyVoice}`);
      }
      
      promptParts.push("");
    }

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
    // SECTION 9: AVOID LIST (includes tone-specific restrictions)
    // =========================================================================
    promptParts.push("═══════════════════════════════════════════════════════════════");
    promptParts.push("                     ❌ AVOID THESE MISTAKES                     ");
    promptParts.push("═══════════════════════════════════════════════════════════════");
    promptParts.push("");
    promptParts.push("UNIVERSAL MISTAKES:");
    promptParts.push("• Adding text not in the front panel text");
    promptParts.push("• Changing the specified colors (if customized)");
    promptParts.push("• Generic checkmarks instead of semantic icons");
    promptParts.push("• Unreadable text (poor contrast)");
    promptParts.push("• Wrong container shape/proportions");
    promptParts.push("");
    
    // Add tone-specific avoid list
    if (toneSystem && toneSystem.avoidList.length > 0) {
      promptParts.push(`TONE-SPECIFIC (${(toneValue || 'premium').toUpperCase()}) - NEVER DO:`);
      toneSystem.avoidList.forEach(item => {
        promptParts.push(`• ${item}`);
      });
      promptParts.push("");
    } else {
      promptParts.push("• Plain centered text stack with no visual interest");
      promptParts.push("• Multiple competing graphic elements");
      promptParts.push("• Confetti, starbursts, or scattered shapes");
      promptParts.push("");
    }

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
    // FLAT LAYOUT MODE - 1:1 EXACT COPY OF 3D MOCKUP
    // =========================================================================
    if (mode === 'flat' || mode === 'flat_layout') {
      promptParts.length = 0;
      
      promptParts.push("═══════════════════════════════════════════════════════════════");
      promptParts.push("       FLAT LABEL LAYOUT - EXACT COPY OF 3D MOCKUP             ");
      promptParts.push("═══════════════════════════════════════════════════════════════");
      promptParts.push("");
      
      promptParts.push("⚠️ CRITICAL INSTRUCTION: You are provided with a 3D product mockup image.");
      promptParts.push("Your ONLY task is to create a FLAT 2D version of THE EXACT SAME DESIGN.");
      promptParts.push("Think of this as 'unwrapping' the label from the bottle and laying it flat.");
      promptParts.push("");
      
      promptParts.push("1:1 DESIGN FIDELITY REQUIREMENTS:");
      promptParts.push("───────────────────────────────────");
      promptParts.push("• SAME exact colors, gradients, and color placement as the mockup");
      promptParts.push("• SAME exact typography (fonts, sizes, weights, styling)");
      promptParts.push("• SAME exact text content - copy every word exactly as shown");
      promptParts.push("• SAME exact logo position, size, and styling");
      promptParts.push("• SAME exact hero imagery, graphics, and illustrations");
      promptParts.push("• SAME exact badges, icons, certifications, and trust signals");
      promptParts.push("• SAME exact overall layout and visual hierarchy");
      promptParts.push("• SAME exact decorative elements, lines, borders, patterns");
      promptParts.push("");
      
      if (flatLayoutMode === 'front-only') {
        promptParts.push("OUTPUT FORMAT: FRONT PANEL ONLY");
        promptParts.push("• Create ONLY the front panel as a flat 2D rectangle");
        promptParts.push("• Remove all 3D perspective, shadows, bottle curvature, and reflections");
        promptParts.push("• Output a perfectly flat, print-ready rectangular label");
        promptParts.push("• Maintain the original aspect ratio of the label");
      } else {
        promptParts.push("OUTPUT FORMAT: FULL DIELINE (unwrapped layout)");
        promptParts.push("• Front panel (center, largest) - EXACT copy of mockup front");
        promptParts.push("• Back panel - use supplement facts style or leave as placeholder area");
        promptParts.push("• Side panels if applicable to the packaging format");
        promptParts.push("• All panels laid out flat in a print-ready arrangement");
      }
      promptParts.push("");
      
      promptParts.push(`PACKAGING FORMAT: ${packagingFormat}`);
      promptParts.push("");
      
      // Include colors for reference (but AI should match the image exactly)
      promptParts.push("REFERENCE COLOR PALETTE (verify against mockup image):");
      promptParts.push(`   PRIMARY: ${primaryColorHex}`);
      promptParts.push(`   SECONDARY: ${secondaryColorHex}`);
      promptParts.push(`   ACCENT: ${accentColorHex}`);
      promptParts.push("");
      
      if (frontPanelText) {
        promptParts.push("FRONT PANEL TEXT (for reference - but COPY FROM IMAGE):");
        promptParts.push("```");
        promptParts.push(frontPanelText);
        promptParts.push("```");
        promptParts.push("");
      }
      
      promptParts.push("════════════════════════════════════════════════════════════════");
      promptParts.push("                    STRICT RULES - DO NOT VIOLATE               ");
      promptParts.push("════════════════════════════════════════════════════════════════");
      promptParts.push("• DO NOT redesign anything - COPY the design exactly from the reference image");
      promptParts.push("• DO NOT change any colors, fonts, or layout elements");
      promptParts.push("• DO NOT add new elements that aren't in the mockup");
      promptParts.push("• DO NOT remove any elements that are in the mockup");
      promptParts.push("• DO NOT interpret or improve - simply flatten/unwrap the 3D mockup");
      promptParts.push("• The result should look IDENTICAL to the mockup, just laid flat");
      promptParts.push("• If you printed both and compared, they should match perfectly");
      promptParts.push("");
      promptParts.push("Your output is the label as if peeled off the product and laid flat on a table.");
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
    if (referenceImageUrl && (mode === 'flat' || mode === 'flat_layout')) {
      messageContent.push({ type: "image_url", image_url: { url: referenceImageUrl } });
      console.log(`Reference image: ${referenceImageUrl.substring(0, 50)}...`);
    }
    
    // Add logo image
    if (logoImageUrl) {
      messageContent.push({ type: "image_url", image_url: { url: logoImageUrl } });
      console.log(`Logo image: ${logoImageUrl.substring(0, 50)}...`);
    }

    // =============================================================================
    // CALL OPENROUTER API
    // =============================================================================
    console.log("Calling OpenRouter API...");
    
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openRouterApiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://lovable.dev",
        "X-Title": "Product Mockup Generator"
      },
      body: JSON.stringify({
        model: "google/gemini-3-pro-image-preview",
        messages: [
          {
            role: "user",
            content: messageContent.length === 1 ? finalPrompt : messageContent
          }
        ],
        max_tokens: 4096,
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
