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
                description: 'Create a comprehensive packaging design strategy with visual specifications, copy content, and competitive positioning.',
                input_schema: {
                  type: 'object',
                  properties: {
                    summary: {
                      type: 'object',
                      properties: {
                        design_strategy: { type: 'string', description: 'Overall design strategy in 2-3 sentences' },
                        key_differentiators: { type: 'array', items: { type: 'string' }, description: '3-5 key visual/messaging differentiators' },
                        target_shelf_positioning: { type: 'string', description: 'How product should stand out on shelf' }
                      },
                      required: ['design_strategy', 'key_differentiators', 'target_shelf_positioning']
                    },
                    visual_design: {
                      type: 'object',
                      properties: {
                        primary_color: {
                          type: 'object',
                          properties: {
                            hex: { type: 'string', description: 'Hex color code' },
                            name: { type: 'string', description: 'Color name' },
                            psychology: { type: 'string', description: 'Why this color works' }
                          },
                          required: ['hex', 'name', 'psychology']
                        },
                        secondary_color: {
                          type: 'object',
                          properties: {
                            hex: { type: 'string' },
                            name: { type: 'string' },
                            psychology: { type: 'string' }
                          },
                          required: ['hex', 'name', 'psychology']
                        },
                        accent_color: {
                          type: 'object',
                          properties: {
                            hex: { type: 'string' },
                            name: { type: 'string' },
                            psychology: { type: 'string' }
                          },
                          required: ['hex', 'name', 'psychology']
                        },
                        color_rationale: { type: 'string', description: 'Overall color palette rationale' },
                        typography: {
                          type: 'object',
                          properties: {
                            headline_font: { type: 'string', description: 'Recommended headline font family' },
                            body_font: { type: 'string', description: 'Recommended body font family' },
                            font_rationale: { type: 'string', description: 'Why these fonts work' }
                          },
                          required: ['headline_font', 'body_font', 'font_rationale']
                        },
                        imagery_style: { type: 'string', description: 'Style of imagery/illustrations to use' },
                        overall_aesthetic: { type: 'string', description: 'Overall visual aesthetic description' }
                      },
                      required: ['primary_color', 'secondary_color', 'accent_color', 'color_rationale', 'typography', 'imagery_style', 'overall_aesthetic']
                    },
                    front_panel: {
                      type: 'object',
                      properties: {
                        layout_structure: { type: 'string', description: 'How elements should be arranged' },
                        visual_hierarchy: { type: 'array', items: { type: 'string' }, description: 'Elements in order of visual importance' },
                        primary_claim: { type: 'string', description: 'The main claim/headline' },
                        secondary_claims: { type: 'array', items: { type: 'string' }, description: 'Supporting claims' },
                        brand_positioning_statement: { type: 'string', description: 'Brand positioning statement for package' },
                        required_elements: { type: 'array', items: { type: 'string' }, description: 'Must-have elements on front panel' }
                      },
                      required: ['layout_structure', 'visual_hierarchy', 'primary_claim', 'secondary_claims', 'brand_positioning_statement', 'required_elements']
                    },
                    trust_signals: {
                      type: 'object',
                      properties: {
                        recommended_certifications: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              badge: { type: 'string', description: 'Certification or badge name' },
                              importance: { type: 'string', enum: ['critical', 'high', 'medium'] },
                              rationale: { type: 'string', description: 'Why this certification matters' }
                            },
                            required: ['badge', 'importance', 'rationale']
                          }
                        },
                        trust_building_elements: { type: 'array', items: { type: 'string' }, description: 'Additional trust elements' }
                      },
                      required: ['recommended_certifications', 'trust_building_elements']
                    },
                    copy_content: {
                      type: 'object',
                      properties: {
                        headline: { type: 'string', description: 'Main headline text for front panel' },
                        subheadline: { type: 'string', description: 'Supporting subheadline' },
                        bullet_points: { type: 'array', items: { type: 'string' }, description: 'Key benefit bullet points' },
                        call_to_action: { type: 'string', description: 'CTA text' },
                        back_panel_copy: { type: 'string', description: 'Full back panel copy text' }
                      },
                      required: ['headline', 'subheadline', 'bullet_points', 'call_to_action', 'back_panel_copy']
                    },
                    conversion_triggers: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          trigger: { type: 'string', description: 'The conversion trigger text or element' },
                          placement: { type: 'string', description: 'Where to place on package' },
                          psychological_principle: { type: 'string', description: 'Psychology behind why it works' }
                        },
                        required: ['trigger', 'placement', 'psychological_principle']
                      },
                      description: 'Psychological conversion triggers to include'
                    },
                    competitive_positioning: {
                      type: 'object',
                      properties: {
                        vs_leader: {
                          type: 'object',
                          properties: {
                            competitor: { type: 'string', description: 'Name of market leader' },
                            our_advantage: { type: 'string', description: 'How we beat them visually' }
                          },
                          required: ['competitor', 'our_advantage']
                        },
                        market_gap_filled: { type: 'string', description: 'Market gap we fill with this design' },
                        differentiation_elements: { type: 'array', items: { type: 'string' }, description: 'Specific elements that differentiate us' }
                      },
                      required: ['vs_leader', 'market_gap_filled', 'differentiation_elements']
                    },
                    competitor_comparison: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          competitor: { type: 'string' },
                          their_approach: { type: 'string', description: 'Their packaging strategy' },
                          our_counter_strategy: { type: 'string', description: 'How we counter/beat them' },
                          advantage_score: { type: 'string', enum: ['strong', 'moderate', 'weak'] }
                        },
                        required: ['competitor', 'their_approach', 'our_counter_strategy', 'advantage_score']
                      },
                      description: 'Comparison against top 5 competitors'
                    },
                    implementation_priorities: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          priority: { type: 'number', enum: [1, 2, 3], description: '1=must have, 2=important, 3=nice to have' },
                          element: { type: 'string', description: 'Design element' },
                          impact: { type: 'string', description: 'Expected impact' },
                          complexity: { type: 'string', enum: ['easy', 'moderate', 'complex'] }
                        },
                        required: ['priority', 'element', 'impact', 'complexity']
                      },
                      description: 'Prioritized implementation list'
                    },
                    mock_content: {
                      type: 'object',
                      properties: {
                        front_panel_text: { type: 'string', description: 'Complete front panel text content as it should appear' },
                        back_panel_text: { type: 'string', description: 'Complete back panel text content' },
                        side_panel_suggestions: { type: 'array', items: { type: 'string' }, description: 'Side panel content suggestions' }
                      },
                      required: ['front_panel_text', 'back_panel_text', 'side_panel_suggestions']
                    }
                  },
                  required: ['summary', 'visual_design', 'front_panel', 'trust_signals', 'copy_content', 'conversion_triggers', 'competitive_positioning', 'competitor_comparison', 'implementation_priorities', 'mock_content']
                }
              }
            ],
            tool_choice: { type: 'tool', name: 'create_packaging_design' },
            messages: [
              {
                role: 'user',
                content: `You are an expert packaging designer, brand strategist, and consumer psychologist. Create a WINNING PACKAGING DESIGN PLAN for "${categoryName}" that will stand out on shelves and convert browsers into buyers.

## OUR PRODUCT POSITIONING & FORMULA:
${formulaBriefContent}

## RECOMMENDED PACKAGING FROM ANALYSIS:
- Type: ${recommendedPackaging.type || 'Not specified'}
- Design Elements: ${recommendedPackaging.design_elements?.join(', ') || 'Not specified'}

## TOP 10 COMPETITORS' PACKAGING AUDITS:
${competitorPackagingSummary}

## YOUR TASK:
Create a comprehensive packaging design specification that:

1. **VISUAL DESIGN SYSTEM**: Define a complete color palette with hex codes and psychology, typography choices, and imagery style that differentiates us from competitors while appealing to our target audience.

2. **FRONT PANEL LAYOUT**: Specify exact visual hierarchy, primary and secondary claims, required elements, and layout structure.

3. **TRUST SIGNALS**: Recommend specific certifications, badges, and trust-building elements with importance levels and rationale.

4. **COPY CONTENT**: Write actual headline, subheadline, bullet points, CTA, and full back panel copy that we can use.

5. **CONVERSION TRIGGERS**: Identify specific psychological triggers to incorporate with their placement and the principle behind each.

6. **COMPETITIVE POSITIONING**: Analyze how to beat each competitor visually and fill market gaps.

7. **IMPLEMENTATION PRIORITIES**: Rank design elements by priority, impact, and complexity.

8. **MOCK CONTENT**: Provide complete front and back panel text exactly as it should appear on the package.

Be specific with colors (exact hex codes), fonts (actual font names), and copy (actual words to use). This should be ready for a designer to execute.`
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
