import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface IngredientAnalysis {
  summary: {
    overall_assessment: string;
    confidence_score: number;
    key_strengths: string[];
    key_gaps: string[];
    recommendation: string;
  };
  ingredients: Array<{
    name: string;
    our_dosage: string;
    competitor_avg: string;
    gap_status: string;
    clinical_notes: string;
  }>;
  charts: {
    coverage_score: number;
    uniqueness_score: number;
    efficacy_score: number;
  };
  actionable_insights: Array<{
    priority: string;
    insight: string;
    action: string;
  }>;
  comparison_table: {
    headers: string[];
    rows: Array<{
      ingredient: string;
      our_concept: string;
      competitors: string[];
      notes: string;
    }>;
  };
}

declare const EdgeRuntime: {
  waitUntil: (promise: Promise<any>) => void;
};

serve(async (req) => {
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

    console.log(`[analyze-ingredients] Starting analysis for category: ${categoryId}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch category analysis data
    const { data: categoryAnalysis, error: analysisError } = await supabase
      .from('category_analyses')
      .select('*')
      .eq('category_id', categoryId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (analysisError || !categoryAnalysis) {
      console.error('[analyze-ingredients] Error fetching category analysis:', analysisError);
      return new Response(
        JSON.stringify({ error: 'Category analysis not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch top 3 competitor products
    const { data: competitors, error: competitorsError } = await supabase
      .from('products')
      .select('title, brand, ingredients, other_ingredients, all_nutrients, supplement_facts_complete, price, monthly_sales')
      .eq('category_id', categoryId)
      .order('monthly_sales', { ascending: false })
      .limit(3);

    if (competitorsError) {
      console.error('[analyze-ingredients] Error fetching competitors:', competitorsError);
    }

    // Mark as in progress
    await supabase
      .from('ingredient_analyses')
      .upsert({
        category_id: categoryId,
        analysis: { status: 'in_progress', started_at: new Date().toISOString() },
        updated_at: new Date().toISOString()
      }, { onConflict: 'category_id' });

    console.log('[analyze-ingredients] Marked as in_progress');

    // Format competitor data
    const competitorData = (competitors || []).map((c, i) => ({
      rank: i + 1,
      brand: c.brand || 'Unknown',
      title: c.title || 'Unknown Product',
      ingredients: c.ingredients || c.other_ingredients || 'Not available',
      nutrients: c.all_nutrients || c.supplement_facts_complete || null,
      price: c.price,
      monthly_sales: c.monthly_sales
    }));

    // Run analysis in background
    async function runAnalysisInBackground() {
      const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
      
      if (!OPENROUTER_API_KEY) {
        console.error('[analyze-ingredients] OPENROUTER_API_KEY not configured');
        await supabase
          .from('ingredient_analyses')
          .upsert({
            category_id: categoryId,
            analysis: { status: 'error', error: 'OpenRouter API key not configured' },
            updated_at: new Date().toISOString()
          }, { onConflict: 'category_id' });
        return;
      }

      try {
        const formulaBriefContent = categoryAnalysis.analysis_3_formula_brief?.formula_brief_content || '';
        const categoryName = categoryAnalysis.category_name || 'Unknown Category';

        const systemPrompt = `You are an expert supplement formulation analyst. Analyze ingredient formulations and provide strategic recommendations.

Your task is to compare "Our Concept" formulation against competitor products and provide actionable insights.

IMPORTANT: You must call the "save_ingredient_analysis" function with your analysis results. Do not respond with plain text.`;

        const userPrompt = `Analyze the ingredient formulation for: ${categoryName}

## Our Concept Formula Brief:
${formulaBriefContent || 'No formula brief available'}

## Top Competitor Products:
${competitorData.map(c => `
### Competitor ${c.rank}: ${c.brand} - ${c.title}
- Price: $${c.price || 'N/A'}
- Monthly Sales: ${c.monthly_sales || 'N/A'}
- Ingredients: ${typeof c.ingredients === 'string' ? c.ingredients.substring(0, 500) : JSON.stringify(c.ingredients).substring(0, 500)}
- Nutrients: ${c.nutrients ? JSON.stringify(c.nutrients).substring(0, 500) : 'Not available'}
`).join('\n')}

Analyze Our Concept against these competitors and call the save_ingredient_analysis function with your findings.`;

        console.log('[analyze-ingredients] Calling OpenRouter API with Claude Sonnet 4...');

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'HTTP-Referer': 'https://lovable.dev',
            'X-Title': 'Noodle Search',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'anthropic/claude-sonnet-4-20250514',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            tools: [{
              type: 'function',
              function: {
                name: 'save_ingredient_analysis',
                description: 'Save the ingredient analysis results',
                parameters: {
                  type: 'object',
                  properties: {
                    summary: {
                      type: 'object',
                      description: 'Overall analysis summary',
                      properties: {
                        overall_assessment: { type: 'string', description: 'Brief assessment like Strong, Moderate, or Weak' },
                        confidence_score: { type: 'number', description: 'Confidence from 0-100' },
                        key_strengths: { type: 'array', items: { type: 'string' }, description: '3-5 key strengths' },
                        key_gaps: { type: 'array', items: { type: 'string' }, description: '3-5 key gaps or weaknesses' },
                        recommendation: { type: 'string', description: 'Overall strategic recommendation' }
                      },
                      required: ['overall_assessment', 'confidence_score', 'key_strengths', 'key_gaps', 'recommendation']
                    },
                    ingredients: {
                      type: 'array',
                      description: 'Individual ingredient analysis',
                      items: {
                        type: 'object',
                        properties: {
                          name: { type: 'string' },
                          our_dosage: { type: 'string' },
                          competitor_avg: { type: 'string' },
                          gap_status: { type: 'string', description: 'leading, matching, trailing, unique, or missing' },
                          clinical_notes: { type: 'string' }
                        },
                        required: ['name', 'our_dosage', 'competitor_avg', 'gap_status', 'clinical_notes']
                      }
                    },
                    charts: {
                      type: 'object',
                      description: 'Score metrics for visualization',
                      properties: {
                        coverage_score: { type: 'number', description: 'How well we cover competitor ingredients 0-100' },
                        uniqueness_score: { type: 'number', description: 'Unique ingredients we have 0-100' },
                        efficacy_score: { type: 'number', description: 'Clinical efficacy potential 0-100' }
                      },
                      required: ['coverage_score', 'uniqueness_score', 'efficacy_score']
                    },
                    actionable_insights: {
                      type: 'array',
                      description: 'Priority actions to take',
                      items: {
                        type: 'object',
                        properties: {
                          priority: { type: 'string', description: 'high, medium, or low' },
                          insight: { type: 'string' },
                          action: { type: 'string' }
                        },
                        required: ['priority', 'insight', 'action']
                      }
                    },
                    comparison_table: {
                      type: 'object',
                      description: 'Comparison table data',
                      properties: {
                        headers: { type: 'array', items: { type: 'string' } },
                        rows: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              ingredient: { type: 'string' },
                              our_concept: { type: 'string' },
                              competitors: { type: 'array', items: { type: 'string' } },
                              notes: { type: 'string' }
                            },
                            required: ['ingredient', 'our_concept', 'competitors', 'notes']
                          }
                        }
                      },
                      required: ['headers', 'rows']
                    }
                  },
                  required: ['summary', 'ingredients', 'charts', 'actionable_insights', 'comparison_table']
                }
              }
            }],
            tool_choice: { type: 'function', function: { name: 'save_ingredient_analysis' } }
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[analyze-ingredients] OpenRouter API error:', response.status, errorText);
          throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        console.log('[analyze-ingredients] OpenRouter response received');

        // Extract tool call
        const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
        
        if (!toolCall || toolCall.function?.name !== 'save_ingredient_analysis') {
          console.error('[analyze-ingredients] No valid tool call in response:', JSON.stringify(data));
          throw new Error('No valid tool call in OpenRouter response');
        }

        let analysisResult: IngredientAnalysis;
        try {
          analysisResult = JSON.parse(toolCall.function.arguments);
        } catch (parseError) {
          console.error('[analyze-ingredients] Error parsing tool arguments:', parseError);
          throw new Error('Failed to parse analysis result');
        }

        console.log('[analyze-ingredients] Analysis result parsed successfully');

        // Save to database
        const { error: saveError } = await supabase
          .from('ingredient_analyses')
          .upsert({
            category_id: categoryId,
            analysis: analysisResult,
            updated_at: new Date().toISOString()
          }, { onConflict: 'category_id' });

        if (saveError) {
          console.error('[analyze-ingredients] Error saving analysis:', saveError);
          throw saveError;
        }

        console.log('[analyze-ingredients] Analysis saved successfully for category:', categoryId);

      } catch (error) {
        console.error('[analyze-ingredients] Background analysis error:', error);
        await supabase
          .from('ingredient_analyses')
          .upsert({
            category_id: categoryId,
            analysis: { 
              status: 'error', 
              error: error instanceof Error ? error.message : 'Unknown error',
              timestamp: new Date().toISOString()
            },
            updated_at: new Date().toISOString()
          }, { onConflict: 'category_id' });
      }
    }

    // Start background processing
    EdgeRuntime.waitUntil(runAnalysisInBackground());

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Ingredient analysis started',
        categoryId 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[analyze-ingredients] Request error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
