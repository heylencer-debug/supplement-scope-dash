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
    const { categoryId, copyStyle } = await req.json();
    
    if (!categoryId) {
      return new Response(
        JSON.stringify({ error: 'categoryId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Packaging analysis request - categoryId: ${categoryId}, copyStyle: ${copyStyle || 'default'}`);

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      console.error('ANTHROPIC_API_KEY is not configured');
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

    // Fetch top 5 competitors by monthly_sales with packaging data and images
    const { data: competitors, error: competitorsError } = await supabase
      .from('products')
      .select('brand, title, main_image_url, image_urls, price, claims, claims_on_label, marketing_analysis, monthly_sales, servings_per_container, packaging_type, feature_bullets, review_analysis')
      .eq('category_id', categoryId)
      .order('monthly_sales', { ascending: false })
      .limit(5);

    if (competitorsError) {
      console.error('Error fetching competitors:', competitorsError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch competitor data' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

    // Format competitor packaging data with richer details
    const competitorPackagingSummary = competitors?.map((c, idx) => {
      const designBlueprint = (c.marketing_analysis as any)?.design_blueprint || {};
      const claimsArray = c.claims_on_label || (c.claims ? c.claims.split(',').map((cl: string) => cl.trim()) : []);
      const bullets = c.feature_bullets || [];
      const reviewData = c.review_analysis as any;
      const painPoints = reviewData?.pain_points?.slice(0, 3).map((p: any) => p.issue || p).join('; ') || 'N/A';
      const positiveThemes = reviewData?.positive_themes?.slice(0, 3).map((t: any) => t.theme || t).join('; ') || 'N/A';
      
      return `
COMPETITOR ${idx + 1}: ${c.brand || 'Unknown'} - BEST SELLER ($${c.monthly_sales?.toLocaleString() || 'N/A'}/month)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Title: ${c.title || 'N/A'}
- Price: $${c.price || 'N/A'} | Servings: ${c.servings_per_container || 'N/A'}
- Packaging: ${c.packaging_type || 'Bottle'}
- Image URL: ${c.main_image_url || 'N/A'}

THEIR LABEL CLAIMS:
${claimsArray.slice(0, 8).map((cl: string) => `  • ${cl}`).join('\n') || '  N/A'}

THEIR BULLET POINTS (from Amazon listing):
${bullets.slice(0, 4).map((b: string) => `  • ${b}`).join('\n') || '  N/A'}

WHAT CUSTOMERS LOVE ABOUT THEM:
${positiveThemes}

CUSTOMER COMPLAINTS (opportunities for us):
${painPoints}

THEIR VISUAL STRATEGY:
- Visual Style: ${designBlueprint.visual_style || 'N/A'}
- Trust Signals: ${designBlueprint.trust_signals || 'N/A'}
- Conversion Triggers: ${designBlueprint.conversion_triggers || 'N/A'}
- Differentiation: ${designBlueprint.differentiation_factor || 'N/A'}`;
    }).join('\n\n') || 'No competitor data available';

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
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY!,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-5',
            max_tokens: 4096,
            tools: [
              {
                name: 'create_packaging_design',
                description: 'Create a designer-ready packaging brief with concise copy and clear specifications.',
                input_schema: {
                  type: 'object',
                  properties: {
                    design_brief: {
                      type: 'object',
                      description: 'Core design specifications for the designer',
                      properties: {
                        primary_color: {
                          type: 'object',
                          properties: {
                            hex: { type: 'string', description: 'Hex color code e.g. #2D5A3D' },
                            name: { type: 'string', description: 'Color name e.g. Forest Green' }
                          },
                          required: ['hex', 'name']
                        },
                        secondary_color: {
                          type: 'object',
                          properties: {
                            hex: { type: 'string' },
                            name: { type: 'string' }
                          },
                          required: ['hex', 'name']
                        },
                        accent_color: {
                          type: 'object',
                          properties: {
                            hex: { type: 'string' },
                            name: { type: 'string' }
                          },
                          required: ['hex', 'name']
                        },
                        headline_font: { type: 'string', description: 'Font family name for headlines e.g. Montserrat Bold' },
                        body_font: { type: 'string', description: 'Font family name for body text e.g. Open Sans' },
                        primary_claim: { type: 'string', description: 'Main headline claim - 3-8 words MAX. This is the hero text on front panel.' },
                        key_differentiators: { 
                          type: 'array', 
                          items: { type: 'string' }, 
                          description: '3-5 short badges/tags that make us stand out e.g. "Clinically Dosed", "3rd Party Tested"' 
                        },
                        certifications: { 
                          type: 'array', 
                          items: { type: 'string' }, 
                          description: 'Required certification badges e.g. "GMP Certified", "Non-GMO", "Vegan"' 
                        }
                      },
                      required: ['primary_color', 'secondary_color', 'accent_color', 'headline_font', 'body_font', 'primary_claim', 'key_differentiators', 'certifications']
                    },
                    elements_checklist: {
                      type: 'object',
                      description: 'Checklist of elements to include on the package',
                      properties: {
                        front_panel_hierarchy: { 
                          type: 'array', 
                          items: { type: 'string' }, 
                          description: 'Elements in order of visual importance for front panel e.g. ["Brand Logo", "Primary Claim", "Serving Count", "Certification Badges"]' 
                        },
                        bullet_points: { 
                          type: 'array', 
                          items: { type: 'string' }, 
                          description: '3-5 benefit bullets - CONCISE, 5-10 words each. Ready to use on package.' 
                        },
                        call_to_action: { type: 'string', description: 'CTA text - 2-5 words e.g. "Feel the Difference"' },
                        trust_signals: { 
                          type: 'array', 
                          items: { type: 'string' }, 
                          description: 'Trust elements to include e.g. "Made in USA", "Money-Back Guarantee", "Doctor Recommended"' 
                        }
                      },
                      required: ['front_panel_hierarchy', 'bullet_points', 'call_to_action', 'trust_signals']
                    },
                    mock_content: {
                      type: 'object',
                      description: 'Ready-to-use text content exactly as it should appear on packaging',
                      properties: {
                        front_panel_text: { 
                          type: 'string', 
                          description: 'Complete front panel text layout. Format as it appears on the actual package with line breaks. Keep text SHORT - this is packaging, not a brochure.' 
                        },
                        back_panel_text: { 
                          type: 'string', 
                          description: 'Complete back panel text including benefits section, directions, and any required copy. Format with sections and line breaks.' 
                        },
                        side_panel_suggestions: { 
                          type: 'array', 
                          items: { type: 'string' }, 
                          description: 'Brief suggestions for side panel content e.g. "Storage instructions", "Contact info", "Website QR code"' 
                        }
                      },
                      required: ['front_panel_text', 'back_panel_text', 'side_panel_suggestions']
                    },
                    client_rationale: {
                      type: 'object',
                      description: 'Brief explanations for client presentation - why these design choices win',
                      properties: {
                        color_explanation: { type: 'string', description: '1-2 sentences explaining why this color palette beats competitors' },
                        positioning_explanation: { type: 'string', description: '2-3 sentences on how this design positions us to win shelf space' },
                        differentiation_summary: { type: 'string', description: '2-3 sentences on what makes this design stand out from top competitors' }
                      },
                      required: ['color_explanation', 'positioning_explanation', 'differentiation_summary']
                    }
                  },
                  required: ['design_brief', 'elements_checklist', 'mock_content', 'client_rationale']
                }
              }
            ],
            tool_choice: { type: 'tool', name: 'create_packaging_design' },
            messages: [
              {
                role: 'user',
                content: [
                  // Include competitor product images for visual analysis
                  ...competitorImages,
                  {
                    type: 'text',
                    text: `You are an EXPERT PACKAGING COPYWRITER & DESIGNER analyzing the BEST-SELLING competitor products in "${categoryName}" to create packaging that MATCHES THEIR PROVEN APPROACH while addressing their weaknesses.

## YOUR MISSION:
Study the competitor product images I've included above VERY CAREFULLY. Look at:
- Their EXACT color schemes and visual hierarchy
- Their EXACT bullet point length (count the words!)
- Their EXACT headline style (how many words? what tone?)
- Their typography choices and font styles
- Their trust signals and certifications placement
- What makes shoppers pick them - and MATCH that approach

Your goal is to create packaging that LOOKS LIKE IT BELONGS next to the #1 best-seller. NOT to be radically different - but to FIT IN while being slightly better.

## COPY STYLE DIRECTION:
${getCopyStyleInstructions(copyStyle)}

## CRITICAL COPY RULES:
- MATCH the competitor's bullet point length (if theirs are 5-7 words, yours should be too)
- MATCH their headline style (if direct, be direct; if soft, be soft)
- MATCH their tone (if clinical/pharmaceutical, be clinical; if friendly, be friendly)
- DO NOT use aggressive urgency tactics unless competitors are also using them
- DO NOT write infomercial-style copy unless that's what competitors do
- Address the #1 customer pain point - but in the SAME STYLE as competitors

## STUDY THESE COMPETITOR BULLETS AND CREATE SIMILAR ONES:
${competitors?.slice(0, 3).map((c, i) => {
  const bullets = c.feature_bullets || [];
  return `Competitor ${i + 1} (${c.brand}): ${bullets.slice(0, 3).map((b: string) => `"${b.substring(0, 60)}..."`).join(' | ')}`;
}).join('\n') || 'N/A'}

## OUR PRODUCT FORMULATION:
${formulaBriefContent}

## RECOMMENDED PACKAGING FORMAT:
- Type: ${recommendedPackaging.type || 'Premium Bottle'}
- Key Design Elements: ${recommendedPackaging.design_elements?.join(', ') || 'Modern, clean, premium aesthetic'}

## COMPETITOR INTELLIGENCE (STUDY THEM, MATCH THEIR APPROACH):
${competitorPackagingSummary}

## HOW TO WIN (WITHOUT BEING RADICALLY DIFFERENT):
1. MATCH the visual style of the #1 seller (colors, fonts, layout)
2. MATCH their bullet point length and tone exactly
3. Only differentiate on the pain points where competitors are FAILING
4. Use the same trust signal approach but add 1 extra credibility cue
5. Look like you belong on the same shelf - customers should feel familiar

## YOUR DELIVERABLES:

**1. DESIGN BRIEF**: 
   - Color palette (3 hex codes) - should feel premium and trustworthy for this category
   - Typography - modern, clean, highly legible
   - Primary claim that STOPS the scroll
   - Key differentiator badges (what makes us special)
   - Required certifications

**2. ELEMENTS CHECKLIST**: 
   - Front panel elements in visual hierarchy order
   - 5 KILLER bullet points that sell
   - CTA that drives action
   - Trust signals that build confidence

**3. MOCK CONTENT** (COPY-PASTE READY):
   - Front panel: Exact text with line breaks as it appears
   - Back panel: Complete with benefit section, why it works, directions, disclaimer
   - Think: Would I buy this product? Does this copy make me NEED it?

**4. CLIENT RATIONALE**: 
   - Why this design beats the top sellers
   - What gap in the market we're filling

CREATE COPY THAT MAKES SHOPPERS THINK: "This is THE ONE I've been looking for."`
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

        const claudeResponse = await response.json();
        console.log('Claude response received for packaging analysis');
        console.log('Claude stop_reason:', claudeResponse.stop_reason);
        console.log('Claude usage:', JSON.stringify(claudeResponse.usage));

        // Extract the tool use result
        const toolUse = claudeResponse.content?.find((c: any) => c.type === 'tool_use');
        if (!toolUse || !toolUse.input) {
          console.error('No tool use in response. Content types:', claudeResponse.content?.map((c: any) => c.type));
          console.error('Full response:', JSON.stringify(claudeResponse).substring(0, 1000));
          return;
        }

        const analysis = toolUse.input;
        console.log('Packaging analysis complete:', analysis.summary?.design_strategy?.substring(0, 100));

        // Save analysis to database (upsert)
        const { error: upsertError } = await supabase
          .from('packaging_analyses')
          .upsert({
            category_id: categoryId,
            analysis: analysis,
            updated_at: new Date().toISOString()
          }, { onConflict: 'category_id' });

        if (upsertError) {
          console.error('Error saving packaging analysis to database:', upsertError);
        } else {
          console.log('Packaging analysis saved to database successfully');
        }
      } catch (error) {
        console.error('Background packaging analysis error:', error);
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
