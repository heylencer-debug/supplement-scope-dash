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
    const { categoryId } = await req.json();
    
    if (!categoryId) {
      return new Response(
        JSON.stringify({ error: 'categoryId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

    // Fetch top 10 competitors by monthly_sales with packaging data
    const { data: competitors, error: competitorsError } = await supabase
      .from('products')
      .select('brand, title, main_image_url, price, claims, claims_on_label, marketing_analysis, monthly_sales, servings_per_container, packaging_type')
      .eq('category_id', categoryId)
      .order('monthly_sales', { ascending: false })
      .limit(10);

    if (competitorsError) {
      console.error('Error fetching competitors:', competitorsError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch competitor data' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract data
    const formulaBriefContent = analysisData?.analysis_3_formula_brief?.formula_brief_content || '';
    const categoryScores = analysisData?.analysis_1_category_scores || {};
    const categoryName = analysisData?.category_name || 'Unknown Category';
    const recommendedPackaging = categoryScores?.product_development?.packaging || {};

    // Format competitor packaging data
    const competitorPackagingSummary = competitors?.map((c, idx) => {
      const designBlueprint = (c.marketing_analysis as any)?.design_blueprint || {};
      const claimsArray = c.claims_on_label || (c.claims ? c.claims.split(',').map((cl: string) => cl.trim()) : []);
      
      return `
Competitor ${idx + 1}: ${c.brand || 'Unknown'} - ${c.title || 'Unknown Product'}
- Monthly Sales: ${c.monthly_sales || 'N/A'}
- Price: $${c.price || 'N/A'}
- Packaging Type: ${c.packaging_type || 'N/A'}
- Servings: ${c.servings_per_container || 'N/A'}
- Claims on Label: ${claimsArray.slice(0, 10).join(', ') || 'N/A'}
- Visual Style: ${designBlueprint.visual_style || 'N/A'}
- Visual Hierarchy: ${designBlueprint.visual_hierarchy || 'N/A'}
- Trust Signals: ${designBlueprint.trust_signals || 'N/A'}
- Color Strategy: ${designBlueprint.color_strategy || 'N/A'}
- Typography Style: ${designBlueprint.typography_style || 'N/A'}
- Layout Structure: ${designBlueprint.layout_structure || 'N/A'}
- Conversion Triggers: ${designBlueprint.conversion_triggers || 'N/A'}
- Differentiation Factor: ${designBlueprint.differentiation_factor || 'N/A'}`;
    }).join('\n') || 'No competitor data available';

    // Background task to call Claude and save results
    async function runPackagingAnalysisInBackground() {
      console.log('Starting background Claude API call for packaging analysis...');
      
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
            max_tokens: 32768,
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
                content: `You are an expert packaging designer creating a DESIGNER-READY BRIEF for "${categoryName}".

## CRITICAL REQUIREMENTS:
- ALL COPY MUST BE SHORT - this is packaging, not marketing material
- Headlines: 3-8 words MAX
- Subheadlines: 5-12 words MAX  
- Bullet points: 5-10 words each
- Claims/badges: 2-5 words each
- Think ACTUAL PACKAGE TEXT, not descriptions

## OUR PRODUCT:
${formulaBriefContent}

## RECOMMENDED PACKAGING:
- Type: ${recommendedPackaging.type || 'Not specified'}
- Design Elements: ${recommendedPackaging.design_elements?.join(', ') || 'Not specified'}

## TOP COMPETITORS:
${competitorPackagingSummary}

## YOUR DELIVERABLES:

1. **DESIGN BRIEF**: Color palette (3 hex codes), typography (2 fonts), primary claim (SHORT!), key differentiators (badges), certifications to include

2. **ELEMENTS CHECKLIST**: What goes on the package in priority order, short bullet points ready to print, CTA, trust signals

3. **MOCK CONTENT**: 
   - Front panel text EXACTLY as it appears (with line breaks, formatted)
   - Back panel text EXACTLY as it appears (with sections)
   - Side panel suggestions

4. **CLIENT RATIONALE**: Brief explanations for why these choices beat competitors (for presenting to stakeholders)

Make the mock content READY TO SEND TO A DESIGNER - exact text, proper formatting, copy-paste ready.`
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
