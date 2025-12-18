import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Declare EdgeRuntime for background tasks
declare const EdgeRuntime: {
  waitUntil: (promise: Promise<any>) => void;
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { categoryId, copyStyle, formulaVersionId } = await req.json();
    
    if (!categoryId) {
      return new Response(
        JSON.stringify({ error: 'categoryId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Packaging analysis request - categoryId: ${categoryId}, copyStyle: ${copyStyle || 'default'}`);

    const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
    if (!OPENROUTER_API_KEY) {
      console.error('OPENROUTER_API_KEY is not configured');
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`Fetching packaging data for category: ${categoryId}`);

    // Fetch category analysis (contains formula brief with packaging section)
    const { data: analysisData, error: analysisError } = await supabase
      .from('category_analyses')
      .select('analysis_3_formula_brief, analysis_1_category_scores, category_name')
      .eq('category_id', categoryId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (analysisError) {
      console.error('Error fetching analysis:', analysisError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch analysis data' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract analysis data
    const formulaBriefContent = analysisData?.analysis_3_formula_brief?.formula_brief_content || '';
    const categoryScores = analysisData?.analysis_1_category_scores || {};
    const categoryName = analysisData?.category_name || 'Unknown Category';
    const recommendedPackaging = categoryScores?.product_development?.packaging || {};
    
    console.log(`Formula brief content length: ${formulaBriefContent.length} characters`);
    console.log(`Formula brief preview: ${formulaBriefContent.substring(0, 200)}...`);
    
    // ============ FORMULATION-BASED COMPETITIVE ANALYSIS ============
    
    // ============ PARSE COMPLETE FORMULA BRIEF FOR ALL INGREDIENTS ============
    // The formula_brief_content contains markdown tables with ALL ingredients
    // We need to parse these tables to get the true ingredient count
    
    interface ParsedIngredient {
      name: string;
      dosage: string;
      category: 'primary' | 'secondary' | 'tertiary' | 'functional';
      benefitCategory?: string;
    }
    
    const parsedIngredients: ParsedIngredient[] = [];
    
    // Parse markdown tables from formula_brief_content
    // Looking for tables with ingredient data (headers contain "Ingredient" and "Amount" or "Dosage")
    if (formulaBriefContent) {
      // Split content into lines for parsing
      const lines = formulaBriefContent.split('\n');
      let currentSection = '';
      let inTable = false;
      let tableHeaders: string[] = [];
      
      for (const line of lines) {
        // Detect section headers
        if (line.includes('PRIMARY ACTIVE') || line.includes('Primary Active')) {
          currentSection = 'primary';
          inTable = false;
        } else if (line.includes('SECONDARY ACTIVE') || line.includes('Secondary Active')) {
          currentSection = 'secondary';
          inTable = false;
        } else if (line.includes('TERTIARY ACTIVE') || line.includes('Tertiary Active')) {
          currentSection = 'tertiary';
          inTable = false;
        } else if (line.includes('FUNCTIONAL') || line.includes('Excipient') || line.includes('Other Ingredients')) {
          currentSection = 'functional';
          inTable = false;
        }
        
        // Parse table rows (lines with | separators)
        if (line.includes('|') && line.trim().startsWith('|')) {
          const cells = line.split('|').map((c: string) => c.trim()).filter((c: string) => c);
          
          // Check if this is a header row
          if (cells.some((c: string) => c.toLowerCase().includes('ingredient') || c.toLowerCase().includes('active'))) {
            tableHeaders = cells.map((c: string) => c.toLowerCase());
            inTable = true;
            continue;
          }
          
          // Check if this is the separator row (contains dashes)
          if (cells.every((c: string) => /^[-:]+$/.test(c))) {
            continue;
          }
          
          // This is a data row - extract ingredient info
          if (inTable && cells.length >= 2 && currentSection) {
            const ingredientName = cells[0];
            // Find dosage column (usually 2nd or 3rd column)
            const dosageIdx = tableHeaders.findIndex(h => 
              h.includes('amount') || h.includes('dose') || h.includes('per serving') || h.includes('dosage')
            );
            const dosage = dosageIdx >= 0 && cells[dosageIdx] ? cells[dosageIdx] : cells[1] || '';
            
            // Skip if ingredient name looks like a header or is empty
            if (ingredientName && 
                !ingredientName.toLowerCase().includes('ingredient') && 
                ingredientName.length > 2 &&
                !/^[-]+$/.test(ingredientName)) {
              parsedIngredients.push({
                name: ingredientName,
                dosage: dosage,
                category: currentSection as 'primary' | 'secondary' | 'tertiary' | 'functional'
              });
            }
          }
        }
      }
    }
    
    console.log(`Parsed ${parsedIngredients.length} ingredients from formula brief markdown`);
    
    // Fallback to old method if parsing didn't find ingredients
    const ourFormulation = categoryScores?.product_development?.formulation || {};
    const fallbackIngredients: string[] = ourFormulation.recommended_ingredients || [];
    
    // Use parsed ingredients if we found them, otherwise fallback
    const ourIngredients: string[] = parsedIngredients.length > 0 
      ? parsedIngredients.map(i => `${i.name} ${i.dosage}`.trim())
      : fallbackIngredients;
    
    // Count by category for more accurate claims
    const primaryActiveCount = parsedIngredients.filter(i => i.category === 'primary').length;
    const secondaryActiveCount = parsedIngredients.filter(i => i.category === 'secondary').length;
    const tertiaryActiveCount = parsedIngredients.filter(i => i.category === 'tertiary').length;
    const functionalCount = parsedIngredients.filter(i => i.category === 'functional').length;
    const totalActiveCount = primaryActiveCount + secondaryActiveCount + tertiaryActiveCount;
    
    console.log(`Ingredient breakdown: Primary=${primaryActiveCount}, Secondary=${secondaryActiveCount}, Tertiary=${tertiaryActiveCount}, Functional=${functionalCount}, Total Active=${totalActiveCount}`);
    
    const ourKeyFeatures: string[] = ourFormulation.key_features || [];
    const ourThingsToAvoid: string[] = categoryScores?.product_development?.avoid || [];
    const ourFormFactor = ourFormulation.form_factor || '';
    const ourServingSize = ourFormulation.serving_size || '';
    
    // Use total active ingredients for the primary count (not including functional excipients)
    const ourIngredientCount = totalActiveCount > 0 ? totalActiveCount : ourIngredients.length;
    
    // Benefit category mapping for label icons/badges
    const benefitCategories: Record<string, string[]> = {
      'Hip & Joint': ['glucosamine', 'chondroitin', 'msm', 'collagen', 'hyaluronic'],
      'Skin & Coat': ['omega', 'fish oil', 'salmon', 'biotin', 'vitamin e', 'flaxseed', 'coconut'],
      'Digestive Health': ['probiotic', 'prebiotic', 'pumpkin', 'fiber', 'enzyme', 'lactobacillus'],
      'Immune Support': ['vitamin c', 'vitamin e', 'zinc', 'antioxidant', 'elderberry', 'turmeric'],
      'Heart Health': ['coq10', 'taurine', 'l-carnitine', 'omega-3'],
      'Brain & Cognitive': ['dha', 'epa', 'omega-3', 'phosphatidylserine'],
      'Energy & Vitality': ['b vitamins', 'iron', 'coq10', 'ginseng'],
      'Calming & Anxiety': ['chamomile', 'valerian', 'l-theanine', 'melatonin', 'hemp'],
      'Liver Support': ['milk thistle', 'sam-e', 'silymarin'],
      'Allergy Relief': ['quercetin', 'bromelain', 'colostrum'],
    };
    
    // Calculate which benefit categories we can claim based on our ingredients
    const ourBenefitClaims: string[] = [];
    ourIngredients.forEach(ing => {
      const ingLower = ing.toLowerCase();
      for (const [benefit, keywords] of Object.entries(benefitCategories)) {
        if (keywords.some(kw => ingLower.includes(kw))) {
          if (!ourBenefitClaims.includes(benefit)) {
            ourBenefitClaims.push(benefit);
          }
        }
      }
    });
    
    // Parse competitor ingredient counts for comparison
    interface CompetitorIngredientData {
      brand: string;
      count: number;
      ingredientSample: string;
      claimsOnLabel: string[];
    }
    
    console.log(`Our formulation: ${ourIngredientCount} active ingredients, ${ourBenefitClaims.length} benefit categories`);

    // Fetch TOP 2 Performers (established best-sellers by monthly_sales)
    const { data: topPerformers, error: performersError } = await supabase
      .from('products')
      .select('brand, title, main_image_url, image_urls, price, claims, claims_on_label, marketing_analysis, monthly_sales, servings_per_container, packaging_type, feature_bullets, review_analysis, packaging_image_analysis, ingredients, age_months')
      .eq('category_id', categoryId)
      .order('monthly_sales', { ascending: false })
      .limit(2);

    if (performersError) {
      console.error('Error fetching top performers:', performersError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch top performer data' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch TOP 2 New Winners (young products < 24 months with high sales)
    const { data: newWinners, error: winnersError } = await supabase
      .from('products')
      .select('brand, title, main_image_url, image_urls, price, claims, claims_on_label, marketing_analysis, monthly_sales, servings_per_container, packaging_type, feature_bullets, review_analysis, packaging_image_analysis, ingredients, age_months')
      .eq('category_id', categoryId)
      .lt('age_months', 24)
      .order('monthly_sales', { ascending: false })
      .limit(2);

    if (winnersError) {
      console.error('Error fetching new winners:', winnersError);
      // Non-fatal - continue with just top performers
    }

    // Combine both sets for comprehensive analysis (top performers + new winners)
    const competitors = [...(topPerformers || []), ...(newWinners || [])];
    const hasNewWinners = (newWinners?.length || 0) > 0;
    
    console.log(`Found ${topPerformers?.length || 0} top performers and ${newWinners?.length || 0} new winners`);
    
    // Separate ingredient analysis for each group
    const analyzeCompetitorIngredients = (products: any[]) => {
      return products.map(c => {
        const ingredientText = c.ingredients || '';
        const activeSection = ingredientText.split(/other ingredients/i)[0];
        const ingredientItems = activeSection.split(',').filter((i: string) => i.trim().length > 2);
        const count = ingredientItems.length;
        const claimsArray = c.claims_on_label || (c.claims ? c.claims.split(',').map((cl: string) => cl.trim()) : []);
        
        return {
          brand: c.brand || 'Unknown',
          count,
          age_months: c.age_months || null,
          monthly_sales: c.monthly_sales || 0,
          ingredientSample: ingredientItems.slice(0, 5).join(', ').substring(0, 100),
          claimsOnLabel: claimsArray.slice(0, 10),
          price: c.price
        };
      });
    };
    
    const topPerformerData = analyzeCompetitorIngredients(topPerformers || []);
    const newWinnerData = analyzeCompetitorIngredients(newWinners || []);
    
    // Calculate averages for each group
    const avgTopPerformerCount = topPerformerData.length > 0 
      ? Math.round(topPerformerData.reduce((sum, c) => sum + c.count, 0) / topPerformerData.length)
      : 0;
    const avgNewWinnerCount = newWinnerData.length > 0
      ? Math.round(newWinnerData.reduce((sum, c) => sum + c.count, 0) / newWinnerData.length)
      : 0;

    // ============ COMPETITIVE POSITION ANALYSIS ============
    // Determine our competitive position vs each group
    const vsLeadersPosition = ourIngredientCount >= avgTopPerformerCount ? 'EQUAL_OR_ABOVE' : 'BELOW';
    const vsDisruptorsPosition = ourIngredientCount >= avgNewWinnerCount * 0.7 ? 'CLOSE' : 'SIGNIFICANTLY_BELOW';
    
    console.log(`Competitive Position - vs Leaders: ${vsLeadersPosition} (${ourIngredientCount} vs ${avgTopPerformerCount}), vs Disruptors: ${vsDisruptorsPosition} (${ourIngredientCount} vs ${avgNewWinnerCount})`);

    // Extract dosage information from our ingredients for competitive advantage
    const ourDosageHighlights: { ingredient: string; dosage: string; amount: number; unit: string }[] = [];
    ourIngredients.forEach(ing => {
      const match = ing.match(/(\d+(?:,\d+)?)\s*(mg|mcg|iu|g|billion cfu|cfu)/i);
      if (match) {
        const ingredientName = ing.split(/\s+\d/)[0].trim();
        ourDosageHighlights.push({
          ingredient: ingredientName,
          dosage: match[0],
          amount: parseFloat(match[1].replace(',', '')),
          unit: match[2].toLowerCase()
        });
      }
    });
    
    // ============ MATCH OR IMPROVE CLAIM STRATEGY ============
    // NEVER weaken claims - always match or improve competitor X-in-1 claims
    
    // Calculate MAXIMUM claim we can make by creative counting
    const totalBenefitCount = ourBenefitClaims.length;
    const combinedClaimCount = ourIngredientCount + totalBenefitCount; // "7 actives + 6 benefits = 13"
    
    // Create match-or-improve claims for each strategy
    const matchOrImproveClaims = {
      forLeaders: {
        targetClaim: avgTopPerformerCount,
        ourClaim: ourIngredientCount >= avgTopPerformerCount 
          ? `${ourIngredientCount}-in-1`  // Match or beat
          : combinedClaimCount >= avgTopPerformerCount 
            ? `${combinedClaimCount}-in-1 Complete` // Use combined count
            : `${ourIngredientCount} Active + ${totalBenefitCount} Benefit Formula`, // Still position competitively
        strategy: ourIngredientCount >= avgTopPerformerCount ? 'DIRECT_MATCH' : 'COMBINED_CLAIM'
      },
      forDisruptors: {
        targetClaim: avgNewWinnerCount,
        ourClaim: ourIngredientCount >= avgNewWinnerCount 
          ? `${ourIngredientCount}-in-1` // Match or beat
          : combinedClaimCount >= avgNewWinnerCount * 0.7
            ? `Complete ${combinedClaimCount}-Point Formula` // Use combined count creatively
            : `${ourIngredientCount} Powerhouse Actives at Full Strength`, // Attack dust dosing
        strategy: ourIngredientCount >= avgNewWinnerCount ? 'DIRECT_MATCH' : 
                  combinedClaimCount >= avgNewWinnerCount * 0.7 ? 'COMBINED_CLAIM' : 'QUALITY_ATTACK'
      }
    };
    
    console.log(`Match-or-Improve Strategy - Leaders: ${matchOrImproveClaims.forLeaders.strategy} (${matchOrImproveClaims.forLeaders.ourClaim}), Disruptors: ${matchOrImproveClaims.forDisruptors.strategy} (${matchOrImproveClaims.forDisruptors.ourClaim})`);
    

    // Fetch existing per-product image analysis from Step 1
    const { data: existingImageAnalysis } = await supabase
      .from('packaging_analyses')
      .select('image_analysis')
      .eq('category_id', categoryId)
      .maybeSingle();

    const perProductAnalyses = (existingImageAnalysis?.image_analysis as any)?.competitor_analyses || [];
    console.log(`Found ${perProductAnalyses.length} per-product image analyses from Step 1`);

    // Extract competitor image URLs for Claude to analyze
    const competitorImages: { type: string; source: { type: string; url: string } }[] = [];
    competitors?.forEach((c, idx) => {
      // Get the first available image URL
      const imageUrl = c.main_image_url || (c.image_urls as string[])?.[0];
      if (imageUrl && competitorImages.length < 5) {
        competitorImages.push({
          type: 'image',
          source: {
            type: 'url',
            url: imageUrl
          }
        });
      }
    });

    console.log(`Found ${competitorImages.length} competitor images to analyze`);

    // Parse competitor ingredient counts and extract front label elements (using combined data)
    interface CompetitorIngredientData {
      brand: string;
      count: number;
      ingredientSample: string;
      claimsOnLabel: string[];
      isNewWinner?: boolean;
    }
    
    const competitorIngredientData: CompetitorIngredientData[] = [
      ...topPerformerData.map(c => ({ ...c, isNewWinner: false })),
      ...newWinnerData.map(c => ({ ...c, isNewWinner: true }))
    ];
    
    // Use top performer average for conservative strategy comparison
    const avgCompetitorCount = avgTopPerformerCount;
    
    // Find unique ingredients we have that competitors might not emphasize
    const uniqueIngredientHighlights: string[] = ourIngredients.filter(ourIng => {
      const ingName = ourIng.split(/[\s(]/)[0].toLowerCase();
      // Check if this ingredient is rarely mentioned in competitor claims
      const mentionedInClaims = competitorIngredientData.some(c => 
        c.claimsOnLabel.some(claim => claim.toLowerCase().includes(ingName))
      );
      return !mentionedInClaims && ingName.length > 3;
    }).slice(0, 5);
    
    // Generate verifiable front label claims based on our formulation
    const verifiableClaims: string[] = [];
    
    // X-in-1 claim (only if we have 6+ ingredients)
    if (ourIngredientCount >= 6) {
      verifiableClaims.push(`${ourIngredientCount}-in-1 Complete Formula`);
    }
    
    // Benefit areas claim
    if (ourBenefitClaims.length >= 3) {
      verifiableClaims.push(`Supports ${ourBenefitClaims.length} Areas of Health`);
    }
    
    // Ingredient advantage claim
    if (ourIngredientCount > avgCompetitorCount && avgCompetitorCount > 0) {
      verifiableClaims.push(`More Active Ingredients Than Leading Brands`);
    }
    
    // Key features as claims (grain-free, chicken-free, etc.)
    ourKeyFeatures.forEach(feature => {
      const featureLower = feature.toLowerCase();
      if (featureLower.includes('grain-free') || featureLower.includes('grain free')) {
        verifiableClaims.push('Grain-Free Formula');
      }
      if (featureLower.includes('chicken-free') || featureLower.includes('no chicken')) {
        verifiableClaims.push('Chicken-Free');
      }
      if (featureLower.includes('hypoallergenic')) {
        verifiableClaims.push('Hypoallergenic');
      }
      if (featureLower.includes('all natural') || featureLower.includes('natural')) {
        verifiableClaims.push('All Natural');
      }
    });
    
    // Things to avoid turned into positive claims
    const avoidancePositiveClaims: string[] = ourThingsToAvoid.slice(0, 3).map(avoid => {
      const avoidLower = avoid.toLowerCase();
      if (avoidLower.includes('artificial')) return 'No Artificial Ingredients';
      if (avoidLower.includes('filler')) return 'No Fillers';
      if (avoidLower.includes('corn') || avoidLower.includes('wheat') || avoidLower.includes('soy')) return 'No Corn, Wheat, or Soy';
      if (avoidLower.includes('proprietary')) return 'No Hidden Proprietary Blends';
      if (avoidLower.includes('preservative')) return 'No Artificial Preservatives';
      return `No ${avoid.split(' ').slice(0, 3).join(' ')}`;
    }).filter(c => c);
    
    verifiableClaims.push(...avoidancePositiveClaims.slice(0, 2));
    
    console.log(`Generated ${verifiableClaims.length} verifiable claims for front label`);

    // Format competitor packaging data with separate sections for TOP PERFORMERS vs NEW WINNERS
    const formatCompetitorData = (products: any[], label: string, ingredientData: any[]) => {
      return products?.map((c, idx) => {
        const designBlueprint = (c.marketing_analysis as any)?.design_blueprint || {};
        const claimsArray = c.claims_on_label || (c.claims ? c.claims.split(',').map((cl: string) => cl.trim()) : []);
        const bullets = c.feature_bullets || [];
        const reviewData = c.review_analysis as any;
        const painPoints = reviewData?.pain_points?.slice(0, 3).map((p: any) => p.issue || p).join('; ') || 'N/A';
        const positiveThemes = reviewData?.positive_themes?.slice(0, 3).map((t: any) => t.theme || t).join('; ') || 'N/A';
        const compData = ingredientData[idx];
        
        return `
${label} #${idx + 1}: ${c.brand || 'Unknown'} ($${c.monthly_sales?.toLocaleString() || 'N/A'}/month) - Age: ${c.age_months || 'N/A'} months
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Title: ${c.title || 'N/A'}
- Price: $${c.price || 'N/A'} | Servings: ${c.servings_per_container || 'N/A'}
- Packaging: ${c.packaging_type || 'Bottle'}
- INGREDIENT COUNT: ${compData?.count || 'Unknown'} active ingredients
- Image URL: ${c.main_image_url || 'N/A'}

THEIR FRONT LABEL CLAIMS:
${claimsArray.slice(0, 8).map((cl: string) => `  • ${cl}`).join('\n') || '  N/A'}

THEIR BULLET POINTS:
${bullets.slice(0, 4).map((b: string) => `  • ${b}`).join('\n') || '  N/A'}

WHAT CUSTOMERS LOVE:
${positiveThemes}

CUSTOMER COMPLAINTS:
${painPoints}

VISUAL STRATEGY:
- Visual Style: ${designBlueprint.visual_style || 'N/A'}
- Trust Signals: ${designBlueprint.trust_signals || 'N/A'}`;
      }).join('\n\n') || 'No data available';
    };
    
    const topPerformerSummary = formatCompetitorData(topPerformers || [], 'TOP PERFORMER', topPerformerData);
    const newWinnerSummary = formatCompetitorData(newWinners || [], 'NEW WINNER', newWinnerData);
    
    // Combined summary for backward compatibility
    const competitorPackagingSummary = `
## 🏆 TOP PERFORMERS (Established Best-Sellers - CONSERVATIVE APPROACH)
These are proven market leaders with consistent sales. Their approach is typically more conservative.
Average ingredient count: ${avgTopPerformerCount} ingredients

${topPerformerSummary}

## 🚀 NEW WINNERS (Young High-Growth Products - AGGRESSIVE APPROACH)  
These are newer products (<24 months) with high growth rates. They often use aggressive claims.
Average ingredient count: ${avgNewWinnerCount} ingredients

${newWinnerSummary}
`;

    // Format per-product image analysis from Step 1 - ENHANCED with X-in-1 claims extraction
    const extractedCompetitorClaims: { brand: string; xIn1Claim: string | null; benefitClaims: string[] }[] = [];
    
    const perProductImageAnalysisSummary = perProductAnalyses.length > 0 
      ? perProductAnalyses.map((analysis: any, idx: number) => {
          const labelContent = analysis.label_content || {};
          const messagingTone = analysis.messaging_tone || {};
          const productContents = analysis.product_contents || {};
          const packaging = analysis.packaging || {};
          
          // Extract X-in-1 claims for use in match-or-improve strategy
          const xIn1Claim = labelContent.x_in_1_claim || 
            labelContent.main_title?.match(/\d+[-\s]?in[-\s]?1/i)?.[0] ||
            (labelContent.all_visible_text as string[])?.find((t: string) => /\d+[-\s]?in[-\s]?1/i.test(t)) ||
            null;
          
          extractedCompetitorClaims.push({
            brand: analysis.brand || 'Unknown',
            xIn1Claim,
            benefitClaims: labelContent.benefit_claims || []
          });
          
          // Get COMPLETE visible text from competitor label - no truncation
          const allVisibleText = (labelContent.all_visible_text as string[]) || [];
          const completeVisibleText = allVisibleText.join('\n   ');
          
          return `
PRODUCT ${idx + 1}: ${analysis.brand || 'Unknown'} - ${analysis.title || 'N/A'}
═══════════════════════════════════════════════════════════════════════════════

📋 COMPLETE FRONT LABEL TEXT (REPLICATE THIS EXACT COPY STYLE):
────────────────────────────────────────────────────────────────
${completeVisibleText || 'No text extracted'}
────────────────────────────────────────────────────────────────

📝 LABEL CONTENT BREAKDOWN:
   • Main Title: ${labelContent.main_title || 'N/A'}
   • Subtitle: ${labelContent.subtitle || 'N/A'}
   • ⭐ X-in-1 CLAIM: ${xIn1Claim || 'None detected'}
   • Benefit Claims: ${(labelContent.benefit_claims as string[])?.join(', ') || 'N/A'}
   • Serving Info: ${labelContent.serving_info || 'N/A'}
   • Flavor: ${labelContent.flavor_text || 'N/A'}
   • Badges/Certifications: ${(labelContent.badges as string[])?.join(', ') || (labelContent.certifications as string[])?.join(', ') || 'N/A'}
   • Claims: ${(labelContent.claims as string[])?.join(', ') || 'N/A'}
   • Supporting Claims: ${(labelContent.supporting_claims as string[])?.join(', ') || 'N/A'}

🎯 MESSAGING TONE (MATCH THIS EXACTLY):
   • Primary Tone: ${messagingTone.primary_tone || 'N/A'}
   • Tone Descriptors: ${(messagingTone.tone_descriptors as string[])?.join(', ') || 'N/A'}
   • Urgency Level: ${messagingTone.urgency_level || 'N/A'}
   • Emotional Appeal: ${messagingTone.emotional_appeal || 'N/A'}

🍬 PRODUCT CONTENTS (COPY THIS FOR OUR PRODUCT APPEARANCE):
   • Type: ${productContents.type || 'N/A'}
   • Shape: ${productContents.shape || 'N/A'}
   • Colors: ${(productContents.colors as string[])?.join(', ') || 'N/A'}
   • Color Pattern: ${productContents.color_pattern || 'N/A'}
   • Texture: ${productContents.texture_appearance || 'N/A'}
   • Size: ${productContents.size_estimate || 'N/A'}

📦 PACKAGING FORMAT (USE THIS SAME TYPE):
   • Type: ${packaging.type || 'N/A'}
   • Material: ${packaging.material || 'N/A'}
   • Color: ${packaging.color || 'N/A'}
   • Features: ${(packaging.features as string[])?.join(', ') || 'N/A'}`;
        }).join('\n\n')
      : 'No per-product image analysis available - analyze packaging images first (Step 1)';
    
    // Extract highest competitor X-in-1 claims for reference
    const competitorXIn1Claims = extractedCompetitorClaims
      .filter(c => c.xIn1Claim)
      .map(c => ({ brand: c.brand, claim: c.xIn1Claim as string, number: parseInt(c.xIn1Claim?.match(/\d+/)?.[0] || '0') }));
    const highestCompetitorXIn1 = competitorXIn1Claims.length > 0 
      ? Math.max(...competitorXIn1Claims.map(c => c.number))
      : avgTopPerformerCount;
    
    console.log(`Extracted ${competitorXIn1Claims.length} X-in-1 claims from Step 1. Highest: ${highestCompetitorXIn1}`);
    const competitorClaimsSummary = competitorXIn1Claims.length > 0
      ? competitorXIn1Claims.map(c => `${c.brand}: "${c.claim}"`).join(', ')
      : 'No X-in-1 claims detected in Step 1 analysis';

    // Helper function to get copy style instructions
    function getCopyStyleInstructions(style: string | undefined): string {
      switch (style) {
        case 'match_leaders':
          return `STYLE: MATCH MARKET LEADERS
- Your goal is to LOOK AND FEEL like you belong alongside the #1 best-seller
- STUDY the competitor images and copy VERY CLOSELY - MATCH their tone, style, length, and visual language
- If top sellers use clinical/pharmaceutical style → use clinical style
- If top sellers use friendly/approachable style → use friendly style
- If top sellers use bold colors → use bold colors; if muted → use muted
- MIRROR their bullet point length (count the words, match it)
- MIRROR their headline style (direct vs. soft, short vs. medium)
- MIRROR their trust signal placement
- DO NOT try to be different - try to FIT IN while being slightly better on quality cues
- This is about SHELF COMPETITION - customers should think you belong next to the leaders
- Only differentiate where competitors are FAILING based on customer complaints`;
        case 'premium':
          return `STYLE: PREMIUM & LUXURIOUS
- Use sophisticated, elegant language that signals high-end quality
- Words like: Artisan, Curated, Exceptional, Exquisite, Refined
- Emphasize exclusivity, craftsmanship, and superior quality
- Color palette should be rich and elegant (deep navy, gold accents, cream)
- Think Rolex, Louis Vuitton, premium skincare vibes`;
        case 'clinical':
          return `STYLE: CLINICAL & SCIENTIFIC
- Use clinical, research-backed language that builds trust through science
- Words like: Clinically Proven, Lab-Tested, Research-Backed, Pharmaceutical-Grade
- Include specific dosages, clinical study references, doctor recommendations
- Color palette should be clean and medical (white, blue, clinical green)
- Think pharmaceutical packaging, doctor-approved supplements`;
        case 'friendly':
          return `STYLE: FRIENDLY & APPROACHABLE
- Use warm, conversational language like talking to a friend
- Words like: Feel Great, Your Daily Wellness Partner, Made for You
- Emphasize ease, simplicity, and everyday benefits
- Color palette should be warm and inviting (soft blues, friendly oranges, gentle greens)
- Think farmer's market, homemade, approachable wellness`;
        case 'urgent':
          return `STYLE: URGENT & ACTION-DRIVEN
- Create urgency and FOMO that drives immediate action
- Words like: Don't Wait, Limited Edition, Maximum Strength, Fast-Acting
- Use bold claims, strong CTAs, and scarcity messaging
- Color palette should be bold and energetic (reds, blacks, power colors)
- Think infomercial energy, must-have-NOW feeling`;
        case 'natural':
          return `STYLE: NATURAL & CLEAN
- Use organic, clean-label language that emphasizes purity
- Words like: Pure, Clean, Natural, Plant-Based, Earth-Friendly
- Emphasize minimal ingredients, sustainable sourcing, eco-conscious
- Color palette should be earthy and organic (forest greens, browns, cream, sage)
- Think Whole Foods, farmers market, sustainable wellness`;
        case 'bold':
          return `STYLE: BOLD & DISRUPTIVE
- Challenge the status quo with edgy, bold language
- Break conventions, challenge competitors directly
- Color palette should be unexpected and bold (neon accents, black, unconventional combos)
- Think startup energy, category disruptor, rule-breaker`;
        default:
          return `STYLE: MATCH MARKET LEADERS (DEFAULT)
- Your goal is to LOOK AND FEEL like you belong alongside the #1 best-seller
- STUDY the competitor images and copy VERY CLOSELY - MATCH their tone, style, length, and visual language
- If top sellers use clinical/pharmaceutical style → use clinical style
- If top sellers use friendly/approachable style → use friendly style
- MIRROR their bullet point length and headline style
- DO NOT invent a new aggressive style - MATCH what's already working
- Only differentiate where competitors are FAILING based on customer complaints`;
      }
    }

    // Background task to call Claude and save results
    async function runPackagingAnalysisInBackground() {
      console.log(`Starting background Claude API call for packaging analysis with style: ${copyStyle || 'default'}...`);
      
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'HTTP-Referer': 'https://lovable.dev',
            'X-Title': 'Noodle Search Packaging Analysis',
          },
          body: JSON.stringify({
            model: 'google/gemini-3-pro-preview',
            max_tokens: 16384,
            tools: [
              {
                type: 'function',
                function: {
                  name: 'create_dual_packaging_strategies',
                  description: 'Create TWO packaging strategies: one matching established leaders (conservative) and one matching new disruptors (aggressive).',
                  parameters: {
                    type: 'object',
                    properties: {
                      match_leaders: {
                        type: 'object',
                        description: 'CONSERVATIVE strategy to compete with TOP PERFORMERS (established best-sellers)',
                        properties: {
                          target_competitors: { type: 'array', items: { type: 'string' }, description: 'Names of the top performer brands this strategy matches' },
                          strategy_summary: { type: 'string', description: '1-2 sentences explaining this conservative approach' },
                          design_brief: {
                            type: 'object',
                            properties: {
                              primary_color: { type: 'object', properties: { hex: { type: 'string' }, name: { type: 'string' } }, required: ['hex', 'name'] },
                              secondary_color: { type: 'object', properties: { hex: { type: 'string' }, name: { type: 'string' } }, required: ['hex', 'name'] },
                              accent_color: { type: 'object', properties: { hex: { type: 'string' }, name: { type: 'string' } }, required: ['hex', 'name'] },
                              headline_font: { type: 'string' },
                              body_font: { type: 'string' },
                              primary_claim: { type: 'string', description: 'Strategic primary claim - use quality positioning (e.g., Maximum Potency Formula) if our count is lower than competitors, or X-in-1 if competitive' },
                              key_differentiators: { type: 'array', items: { type: 'string' } },
                              certifications: { type: 'array', items: { type: 'string' } }
                            },
                            required: ['primary_color', 'secondary_color', 'accent_color', 'headline_font', 'body_font', 'primary_claim', 'key_differentiators', 'certifications']
                          },
                          elements_checklist: {
                            type: 'object',
                            properties: {
                              front_panel_hierarchy: { type: 'array', items: { type: 'string' } },
                              bullet_points: { type: 'array', items: { type: 'string' } },
                              call_to_action: { type: 'string' },
                              trust_signals: { type: 'array', items: { type: 'string' } }
                            },
                            required: ['front_panel_hierarchy', 'bullet_points', 'call_to_action', 'trust_signals']
                          },
                          mock_content: {
                            type: 'object',
                            properties: {
                              front_panel_text: { type: 'string' },
                              back_panel_text: { type: 'string' },
                              side_panel_suggestions: { type: 'array', items: { type: 'string' } }
                            },
                            required: ['front_panel_text', 'back_panel_text', 'side_panel_suggestions']
                          },
                          reasoning: { type: 'string', description: 'Why this conservative approach works for competing with established leaders' }
                        },
                        required: ['target_competitors', 'strategy_summary', 'design_brief', 'elements_checklist', 'mock_content', 'reasoning']
                      },
                      match_disruptors: {
                        type: 'object',
                        description: 'AGGRESSIVE strategy to compete with NEW WINNERS (young, high-growth products)',
                        properties: {
                          target_competitors: { type: 'array', items: { type: 'string' }, description: 'Names of the new winner brands this strategy matches' },
                          strategy_summary: { type: 'string', description: '1-2 sentences explaining this aggressive approach' },
                          design_brief: {
                            type: 'object',
                            properties: {
                              primary_color: { type: 'object', properties: { hex: { type: 'string' }, name: { type: 'string' } }, required: ['hex', 'name'] },
                              secondary_color: { type: 'object', properties: { hex: { type: 'string' }, name: { type: 'string' } }, required: ['hex', 'name'] },
                              accent_color: { type: 'object', properties: { hex: { type: 'string' }, name: { type: 'string' } }, required: ['hex', 'name'] },
                              headline_font: { type: 'string' },
                              body_font: { type: 'string' },
                              primary_claim: { type: 'string', description: 'Strategic attack claim - if significantly fewer ingredients, attack dust dosing (e.g., "Zero Fillers, Pure Results", "7 Powerhouse Actives") rather than weak X-in-1' },
                              key_differentiators: { type: 'array', items: { type: 'string' } },
                              certifications: { type: 'array', items: { type: 'string' } }
                            },
                            required: ['primary_color', 'secondary_color', 'accent_color', 'headline_font', 'body_font', 'primary_claim', 'key_differentiators', 'certifications']
                          },
                          elements_checklist: {
                            type: 'object',
                            properties: {
                              front_panel_hierarchy: { type: 'array', items: { type: 'string' } },
                              bullet_points: { type: 'array', items: { type: 'string' } },
                              call_to_action: { type: 'string' },
                              trust_signals: { type: 'array', items: { type: 'string' } }
                            },
                            required: ['front_panel_hierarchy', 'bullet_points', 'call_to_action', 'trust_signals']
                          },
                          mock_content: {
                            type: 'object',
                            properties: {
                              front_panel_text: { type: 'string' },
                              back_panel_text: { type: 'string' },
                              side_panel_suggestions: { type: 'array', items: { type: 'string' } }
                            },
                            required: ['front_panel_text', 'back_panel_text', 'side_panel_suggestions']
                          },
                          reasoning: { type: 'string', description: 'Why this aggressive approach works for competing with new disruptors' }
                        },
                        required: ['target_competitors', 'strategy_summary', 'design_brief', 'elements_checklist', 'mock_content', 'reasoning']
                      },
                      recommendation: {
                        type: 'object',
                        description: 'Which strategy to choose and why',
                        properties: {
                          preferred_strategy: { type: 'string', enum: ['match_leaders', 'match_disruptors'], description: 'Which strategy is recommended' },
                          reasoning: { type: 'string', description: 'Why this strategy is recommended based on market analysis and our formulation' }
                        },
                        required: ['preferred_strategy', 'reasoning']
                      }
                    },
                    required: ['match_leaders', 'match_disruptors', 'recommendation']
                  }
                }
              }
            ],
            tool_choice: { type: 'function', function: { name: 'create_dual_packaging_strategies' } },
            messages: [
              {
                role: 'user',
                content: [
                  // Include competitor product images for visual analysis
                  ...competitorImages,
                  {
                    type: 'text',
                    text: `You are an EXPERT PACKAGING COPYWRITER & DESIGNER analyzing TWO DISTINCT COMPETITOR GROUPS in "${categoryName}" to create TWO DIFFERENT PACKAGING STRATEGIES.

## 🎯 YOUR MISSION: CREATE TWO COMPETITIVE STRATEGIES

You must create TWO complete packaging strategies:
1. **MATCH LEADERS** - Strategy to compete with TOP PERFORMERS (established best-sellers)
2. **MATCH DISRUPTORS** - Strategy to compete with NEW WINNERS (young, high-growth products)

Study the competitor product images I've included above VERY CAREFULLY.

## ⚠️ CRITICAL COMPETITIVE REALITY:

**OUR FORMULATION:**
- **We have: ${ourIngredientCount} Active Ingredients** (${ourFormFactor || 'Standard Form'})
- Ingredients: ${ourIngredients.join(', ') || 'See formulation'}

**TOP PERFORMERS** (established brands):
- Average: ${avgTopPerformerCount} ingredients
- Our Position: ${vsLeadersPosition === 'EQUAL_OR_ABOVE' ? `✅ WE MATCH OR BEAT THEM (${ourIngredientCount} vs ${avgTopPerformerCount})` : `⚠️ WE HAVE FEWER (${ourIngredientCount} vs ${avgTopPerformerCount})`}

**NEW WINNERS** (disruptors):
- Average: ${avgNewWinnerCount} ingredients
- Our Position: ${vsDisruptorsPosition === 'CLOSE' ? `✅ WE'RE COMPETITIVE (${ourIngredientCount} vs ${avgNewWinnerCount})` : `⚠️ SIGNIFICANTLY FEWER (${ourIngredientCount} vs ${avgNewWinnerCount})`}

${ourDosageHighlights.length > 0 ? `
## 💪 OUR DOSAGE ADVANTAGES (USE THESE!):
${ourDosageHighlights.map(d => `• ${d.ingredient}: ${d.dosage}`).join('\n')}

These dosages may be HIGHER than competitors who spread their ingredients thin across ${avgNewWinnerCount}+ actives!
` : ''}

## STRATEGY 1: MATCH LEADERS (vs Top Performers with ~${avgTopPerformerCount} ingredients)

**🎯 MATCH OR IMPROVE - NEVER WEAKEN:**
- Top performers use claims like: "${avgTopPerformerCount}-in-1"
- OUR RECOMMENDED CLAIM: **"${matchOrImproveClaims.forLeaders.ourClaim}"**
- Strategy: ${matchOrImproveClaims.forLeaders.strategy}

${matchOrImproveClaims.forLeaders.strategy === 'DIRECT_MATCH' 
  ? `✅ We match or beat their count! Use "${ourIngredientCount}-in-1" confidently - it's EQUAL OR BETTER.`
  : matchOrImproveClaims.forLeaders.strategy === 'COMBINED_CLAIM'
    ? `✅ Use COMBINED counting: ${ourIngredientCount} active ingredients + ${totalBenefitCount} benefit areas = "${combinedClaimCount}-in-1 Complete Formula"`
    : `✅ Position competitively: "${ourIngredientCount} Active + ${totalBenefitCount} Benefit Formula" - emphasizes comprehensive coverage`
}

**YOUR PRIMARY CLAIM MUST BE:** "${matchOrImproveClaims.forLeaders.ourClaim}"
DO NOT use a weaker claim than top performers!

**FRONT LABEL EXAMPLE:**
┌─────────────────────────────────────┐
│        [BRAND NAME]                 │
│   ${matchOrImproveClaims.forLeaders.ourClaim.toUpperCase().padEnd(30)}│
│                                     │
│ ${ourBenefitClaims.slice(0, 4).join(' • ')}     │
│                                     │
│  ✓ Human-Grade ✓ Vet Formulated    │
│  90 Soft Chews                      │
└─────────────────────────────────────┘

## STRATEGY 2: MATCH DISRUPTORS (vs New Winners with ~${avgNewWinnerCount} ingredients)

**🎯 MATCH OR IMPROVE - NEVER APPEAR WEAKER:**
- New winners use aggressive claims like: "${avgNewWinnerCount}-in-1"
- OUR RECOMMENDED CLAIM: **"${matchOrImproveClaims.forDisruptors.ourClaim}"**
- Strategy: ${matchOrImproveClaims.forDisruptors.strategy}

${matchOrImproveClaims.forDisruptors.strategy === 'DIRECT_MATCH' 
  ? `✅ We match or beat their count! Use bold "${ourIngredientCount}-in-1" claim.`
  : matchOrImproveClaims.forDisruptors.strategy === 'COMBINED_CLAIM'
    ? `✅ Use CREATIVE counting: "Complete ${combinedClaimCount}-Point Formula" (${ourIngredientCount} actives + ${totalBenefitCount} benefits)`
    : `✅ ATTACK their dust dosing: "${ourIngredientCount} Powerhouse Actives at Full Strength" - implies their high count = tiny doses`
}

**YOUR PRIMARY CLAIM MUST BE:** "${matchOrImproveClaims.forDisruptors.ourClaim}"
DO NOT appear weaker than the disruptors!

${matchOrImproveClaims.forDisruptors.strategy === 'QUALITY_ATTACK' ? `
**ATTACK ANGLES (use these in your copy):**
• "${avgNewWinnerCount} ingredients = ${avgNewWinnerCount} tiny doses. ${ourIngredientCount} Powerhouse Actives = REAL results."
• "They count ingredients. We count results."
• "Full clinical doses, not marketing doses"
${ourDosageHighlights.length > 0 ? `• "Our ${ourDosageHighlights[0]?.ingredient} at ${ourDosageHighlights[0]?.dosage} - not a dust dose"` : ''}
` : ''}

**FRONT LABEL EXAMPLE:**
┌─────────────────────────────────────┐
│        [BRAND NAME]                 │
│   ${matchOrImproveClaims.forDisruptors.ourClaim.toUpperCase().padEnd(30)}│
│                                     │
│ ${ourBenefitClaims.slice(0, 5).join(' • ')}     │
│                                     │
│  ✓ Maximum Value ✓ Full Spectrum   │
│  90 Soft Chews                      │
└─────────────────────────────────────┘

## BENEFIT CATEGORIES WE CAN CLAIM:
${ourBenefitClaims.length > 0 ? ourBenefitClaims.map(b => `✓ ${b}`).join('\n') : 'Analyze from ingredients'}

## KEY FEATURES (convert to positive claims):
${ourKeyFeatures.length > 0 ? ourKeyFeatures.map(f => `• ${f}`).join('\n') : 'N/A'}

## THINGS TO AVOID → POSITIVE CLAIMS:
${ourThingsToAvoid.length > 0 ? ourThingsToAvoid.slice(0, 4).map(a => `• No ${a} → "Free from ${a}"`).join('\n') : 'N/A'}

## 📄 COMPLETE FORMULA BRIEF DOCUMENT (RAW):
════════════════════════════════════════════════════════════════════════════════
${formulaBriefContent || 'No formula brief content available'}
════════════════════════════════════════════════════════════════════════════════

**USE THE ABOVE DOCUMENT** to extract:
- ALL ingredient tables (Primary Active, Secondary Active, Tertiary Active, Functional)
- Exact dosages and forms for each ingredient
- Key differentiators and positioning statements
- Target market and competitive strategy

## COMPETITOR INTELLIGENCE:
${competitorPackagingSummary}

## 🔬 PER-PRODUCT IMAGE ANALYSIS FROM STEP 1:
${perProductImageAnalysisSummary}

## ⚠️ CRITICAL RULES:
1. **Match Leaders**: ${vsLeadersPosition === 'BELOW' ? `DO NOT use "${ourIngredientCount}-in-1" - it's WEAKER! Use quality positioning instead.` : `Use "${ourIngredientCount}-in-1" confidently.`}
2. **Match Disruptors**: ${vsDisruptorsPosition === 'SIGNIFICANTLY_BELOW' ? `DO NOT compete on count! Attack their "dust dosing" weakness with quality claims.` : `Use bold "${ourIngredientCount}-in-1" claim.`}
3. Every claim MUST be verifiable from our formulation document above
4. Match competitor visual styles (colors, fonts, layout) while being STRATEGICALLY different on claims
5. Count ALL active ingredients from the formula brief tables (Primary + Secondary + Tertiary) for accurate X-in-1 claims

## YOUR DELIVERABLES (FOR EACH STRATEGY):

**1. DESIGN BRIEF**: Color palette, typography, PRIMARY CLAIM (based on ACTUAL ingredient count from formula brief), differentiators, certifications

**2. ELEMENTS CHECKLIST**: Front panel hierarchy, 5 bullet points matching competitor style, CTA, trust signals

**3. MOCK CONTENT**: Complete front panel text, back panel text, side panel suggestions

**4. REASONING**: Why this strategy is COMPETITIVE based on our complete formulation

**5. RECOMMENDATION**: Which strategy you recommend based on market reality`
                  }
                ]
              }
            ]
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Claude API error:', response.status, errorText);
          return;
        }

        const openrouterResponse = await response.json();
        console.log('OpenRouter response received for packaging analysis');
        console.log('OpenRouter finish_reason:', openrouterResponse.choices?.[0]?.finish_reason);
        console.log('OpenRouter usage:', JSON.stringify(openrouterResponse.usage));

        // Extract the tool call result from OpenRouter format
        const toolCall = openrouterResponse.choices?.[0]?.message?.tool_calls?.[0];
        if (!toolCall || !toolCall.function?.arguments) {
          console.error('No tool call in response. Message:', JSON.stringify(openrouterResponse.choices?.[0]?.message).substring(0, 500));
          console.error('Full response:', JSON.stringify(openrouterResponse).substring(0, 1000));
          return;
        }

        const analysis = JSON.parse(toolCall.function.arguments);
        console.log('Packaging analysis complete:', analysis.summary?.design_strategy?.substring(0, 100));

        // Save analysis to database with retry logic and verification
        console.log('========== SAVING STEP 2 DATA ==========');
        console.log(`Category ID: ${categoryId}`);
        console.log(`Analysis data size: ${JSON.stringify(analysis).length} bytes`);
        
        let saveSuccess = false;
        let lastError: any = null;
        
        for (let attempt = 1; attempt <= 3 && !saveSuccess; attempt++) {
          console.log(`Step 2 save attempt ${attempt}/3`);
          
          try {
            // First check if record exists and get existing image_analysis
            const { data: existingRecord, error: fetchError } = await supabase
              .from('packaging_analyses')
              .select('id, image_analysis, analysis')
              .eq('category_id', categoryId)
              .maybeSingle();
            
            if (fetchError) {
              console.error(`Attempt ${attempt}: Error fetching existing record:`, fetchError);
              lastError = fetchError;
              continue;
            }

            console.log(`Existing record found: ${!!existingRecord}`);
            if (existingRecord) {
              const hasExistingImageAnalysis = existingRecord.image_analysis && 
                (existingRecord.image_analysis as any)?.competitor_analyses?.length > 0;
              console.log(`Existing image_analysis: ${hasExistingImageAnalysis ? 'PRESENT with ' + (existingRecord.image_analysis as any)?.competitor_analyses?.length + ' analyses' : 'null/empty'}`);
              console.log(`Existing analysis: ${existingRecord.analysis ? 'present' : 'null'}`);
            }

            if (existingRecord) {
              // UPDATE existing record - ONLY update 'analysis' column, preserve 'image_analysis'
              console.log(`Attempt ${attempt}: Updating 'analysis' column only (preserving image_analysis)...`);
              const { data: updateData, error: updateError } = await supabase
                .from('packaging_analyses')
                .update({ 
                  analysis: analysis,
                  formula_version_id: formulaVersionId || null,
                  updated_at: new Date().toISOString()
                })
                .eq('category_id', categoryId)
                .select('id, image_analysis, analysis');

              if (updateError) {
                console.error(`Attempt ${attempt}: Update error:`, updateError);
                lastError = updateError;
                continue;
              }
              
              console.log(`Attempt ${attempt}: Update returned data:`, updateData ? 'yes' : 'no');
            } else {
              // INSERT new record with empty image_analysis
              console.log(`Attempt ${attempt}: Inserting new record with analysis...`);
              const { data: insertData, error: insertError } = await supabase
                .from('packaging_analyses')
                .insert({
                  category_id: categoryId,
                  analysis: analysis,
                  formula_version_id: formulaVersionId || null,
                  image_analysis: null
                })
                .select('id, image_analysis, analysis');

              if (insertError) {
                console.error(`Attempt ${attempt}: Insert error:`, insertError);
                lastError = insertError;
                continue;
              }
              
              console.log(`Attempt ${attempt}: Insert returned data:`, insertData ? 'yes' : 'no');
            }

            // VERIFICATION: Re-fetch to confirm data was saved correctly
            console.log(`Attempt ${attempt}: Verifying save...`);
            const { data: verifyRecord, error: verifyError } = await supabase
              .from('packaging_analyses')
              .select('id, image_analysis, analysis, updated_at')
              .eq('category_id', categoryId)
              .maybeSingle();
            
            if (verifyError) {
              console.error(`Attempt ${attempt}: Verification fetch error:`, verifyError);
              lastError = verifyError;
              continue;
            }
            
            if (!verifyRecord) {
              console.error(`Attempt ${attempt}: VERIFICATION FAILED - no record found after save`);
              lastError = new Error('Record not found after save');
              continue;
            }
            
            const hasAnalysis = verifyRecord.analysis && Object.keys(verifyRecord.analysis as object).length > 0;
            const hasImageAnalysis = verifyRecord.image_analysis && 
              (verifyRecord.image_analysis as any)?.competitor_analyses?.length > 0;
            
            console.log(`Attempt ${attempt}: VERIFICATION RESULT:`);
            console.log(`  - Record ID: ${verifyRecord.id}`);
            console.log(`  - analysis present: ${hasAnalysis}`);
            console.log(`  - image_analysis present: ${hasImageAnalysis}`);
            console.log(`  - image_analysis count: ${(verifyRecord.image_analysis as any)?.competitor_analyses?.length || 0}`);
            console.log(`  - updated_at: ${verifyRecord.updated_at}`);
            
            if (hasAnalysis) {
              saveSuccess = true;
              console.log(`✅ STEP 2 SAVE VERIFIED SUCCESSFULLY on attempt ${attempt}`);
              
              if (!hasImageAnalysis) {
                console.warn('⚠️ WARNING: image_analysis is null/empty after Step 2 save - Step 1 may not have completed');
              }
            } else {
              console.error(`Attempt ${attempt}: analysis is empty after save!`);
              lastError = new Error('analysis empty after save');
            }
            
          } catch (attemptError) {
            console.error(`Attempt ${attempt}: Exception:`, attemptError);
            lastError = attemptError;
          }
          
          // Wait before retry
          if (!saveSuccess && attempt < 3) {
            console.log('Waiting 1 second before retry...');
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
        
        if (!saveSuccess) {
          console.error('❌ STEP 2 FAILED TO SAVE after 3 attempts. Last error:', lastError);
        }
        
        console.log('========== STEP 2 SAVE COMPLETE ==========');
        
      } catch (error) {
        console.error('Background packaging analysis error:', error);
        console.error('Stack:', error instanceof Error ? error.stack : 'N/A');
      }
    }

    // Start background task and return immediately
    console.log('Starting background packaging analysis task...');
    EdgeRuntime.waitUntil(runPackagingAnalysisInBackground());

    return new Response(
      JSON.stringify({ success: true, status: 'processing', message: 'Packaging analysis started in background. Poll database for results.' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in analyze-packaging:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
