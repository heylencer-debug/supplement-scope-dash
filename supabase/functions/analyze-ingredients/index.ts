import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface IngredientAnalysis {
  summary: {
    overall_assessment: 'Strong' | 'Moderate' | 'Weak';
    key_strengths: string[];
    key_gaps: string[];
    recommendation: string;
  };
  ingredients: Array<{
    name: string;
    our_dosage: string | null;
    avg_competitor_dosage: string | null;
    gap_status: 'leading' | 'matching' | 'trailing' | 'missing' | 'unique';
    gap_percentage: number | null;
    clinical_note: string;
    priority: 'high' | 'medium' | 'low';
  }>;
  charts: {
    dosage_comparison: Array<{
      ingredient: string;
      our_amount: number;
      competitor_avg: number;
      unit: string;
    }>;
    coverage_score: number;
    uniqueness_score: number;
    efficacy_score: number;
  };
  actionable_insights: Array<{
    type: 'add' | 'increase' | 'decrease' | 'remove' | 'keep';
    ingredient: string;
    reason: string;
    impact: 'high' | 'medium' | 'low';
  }>;
}

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

    console.log(`Fetching data for category: ${categoryId}`);

    // Fetch category analysis (contains formula brief)
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

    // Fetch top 3 competitors by monthly_sales
    const { data: competitors, error: competitorsError } = await supabase
      .from('products')
      .select('brand, all_nutrients, ingredients, other_ingredients, price, servings_per_container')
      .eq('category_id', categoryId)
      .order('monthly_sales', { ascending: false })
      .limit(3);

    if (competitorsError) {
      console.error('Error fetching competitors:', competitorsError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch competitor data' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract formula brief content
    const formulaBriefContent = analysisData?.analysis_3_formula_brief?.formula_brief_content || '';
    const categoryScores = analysisData?.analysis_1_category_scores || {};
    const categoryName = analysisData?.category_name || 'Unknown Category';

    // Format competitor data for the prompt
    const competitorSummary = competitors?.map((c, idx) => {
      const nutrients = c.all_nutrients || [];
      const nutrientList = Array.isArray(nutrients) 
        ? nutrients.map((n: any) => `${n.name}: ${n.amount}${n.unit}`).join(', ')
        : 'No nutrient data';
      
      return `Competitor ${idx + 1} (${c.brand || 'Unknown'}):
- Nutrients: ${nutrientList}
- Ingredients: ${c.ingredients || 'N/A'}
- Other Ingredients: ${c.other_ingredients || 'N/A'}
- Price: $${c.price || 'N/A'}, Servings: ${c.servings_per_container || 'N/A'}`;
    }).join('\n\n') || 'No competitor data available';

    console.log('Calling Claude API for ingredient analysis...');

    // Call Claude API with tool use for structured output
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        tools: [
          {
            name: 'analyze_ingredients',
            description: 'Analyze and compare ingredient formulations between our concept and competitors. Return structured analysis with dosage comparisons, gap analysis, and actionable insights.',
            input_schema: {
              type: 'object',
              properties: {
                summary: {
                  type: 'object',
                  properties: {
                    overall_assessment: { 
                      type: 'string', 
                      enum: ['Strong', 'Moderate', 'Weak'],
                      description: 'Overall competitive position of our formulation'
                    },
                    key_strengths: { 
                      type: 'array', 
                      items: { type: 'string' },
                      description: 'Top 3 formulation advantages'
                    },
                    key_gaps: { 
                      type: 'array', 
                      items: { type: 'string' },
                      description: 'Top 3 missing opportunities or weaknesses'
                    },
                    recommendation: { 
                      type: 'string',
                      description: 'One-sentence strategic recommendation'
                    }
                  },
                  required: ['overall_assessment', 'key_strengths', 'key_gaps', 'recommendation']
                },
                ingredients: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      our_dosage: { type: 'string', nullable: true },
                      avg_competitor_dosage: { type: 'string', nullable: true },
                      gap_status: { 
                        type: 'string', 
                        enum: ['leading', 'matching', 'trailing', 'missing', 'unique']
                      },
                      gap_percentage: { type: 'number', nullable: true },
                      clinical_note: { type: 'string' },
                      priority: { type: 'string', enum: ['high', 'medium', 'low'] }
                    },
                    required: ['name', 'gap_status', 'clinical_note', 'priority']
                  },
                  description: 'Detailed analysis of each key ingredient'
                },
                charts: {
                  type: 'object',
                  properties: {
                    dosage_comparison: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          ingredient: { type: 'string' },
                          our_amount: { type: 'number' },
                          competitor_avg: { type: 'number' },
                          unit: { type: 'string' }
                        },
                        required: ['ingredient', 'our_amount', 'competitor_avg', 'unit']
                      }
                    },
                    coverage_score: { type: 'number', description: '0-100 how well we cover competitor ingredients' },
                    uniqueness_score: { type: 'number', description: '0-100 how many unique ingredients we have' },
                    efficacy_score: { type: 'number', description: '0-100 based on clinical dosage adequacy' }
                  },
                  required: ['dosage_comparison', 'coverage_score', 'uniqueness_score', 'efficacy_score']
                },
                actionable_insights: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      type: { type: 'string', enum: ['add', 'increase', 'decrease', 'remove', 'keep'] },
                      ingredient: { type: 'string' },
                      reason: { type: 'string' },
                      impact: { type: 'string', enum: ['high', 'medium', 'low'] }
                    },
                    required: ['type', 'ingredient', 'reason', 'impact']
                  },
                  description: 'Specific actionable recommendations'
                }
              },
              required: ['summary', 'ingredients', 'charts', 'actionable_insights']
            }
          }
        ],
        tool_choice: { type: 'tool', name: 'analyze_ingredients' },
        messages: [
          {
            role: 'user',
            content: `You are an expert supplement formulator and competitive analyst. Analyze the following formulation data for "${categoryName}" and provide a comprehensive ingredient comparison.

## OUR FORMULATION BRIEF:
${formulaBriefContent.substring(0, 8000)}

## TOP 3 COMPETITORS BY SALES:
${competitorSummary}

Please analyze:
1. Compare our ingredient dosages vs competitor averages
2. Identify where we're leading, matching, trailing, or missing key ingredients
3. Evaluate clinical efficacy of our dosages based on research-backed amounts
4. Provide specific, actionable recommendations to strengthen our formulation
5. Calculate coverage score (how well we match competitor ingredients), uniqueness score (unique ingredients we have), and efficacy score (clinical adequacy)

Focus on the most important active ingredients first. Be specific about dosages and cite clinical ranges where relevant.`
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: 'AI analysis failed', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const claudeResponse = await response.json();
    console.log('Claude response received');

    // Extract the tool use result
    const toolUse = claudeResponse.content?.find((c: any) => c.type === 'tool_use');
    if (!toolUse || !toolUse.input) {
      console.error('No tool use in response:', claudeResponse);
      return new Response(
        JSON.stringify({ error: 'Invalid AI response format' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const analysis: IngredientAnalysis = toolUse.input;
    console.log('Analysis complete:', analysis.summary.overall_assessment);

    // Save analysis to database (upsert)
    const { error: upsertError } = await supabase
      .from('ingredient_analyses')
      .upsert({
        category_id: categoryId,
        analysis: analysis,
        updated_at: new Date().toISOString()
      }, { onConflict: 'category_id' });

    if (upsertError) {
      console.error('Error saving analysis to database:', upsertError);
      // Don't fail the request, just log the error
    } else {
      console.log('Analysis saved to database');
    }

    return new Response(
      JSON.stringify({ success: true, analysis }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in analyze-ingredients:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
