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
  customer_insights: {
    pain_point_solutions: Array<{
      pain_point: string;
      solving_ingredient: string;
      confidence: 'high' | 'medium' | 'low';
      evidence: string;
    }>;
    unaddressed_complaints: Array<{
      complaint: string;
      suggested_solution: string;
      ingredient_recommendation: string;
    }>;
  };
  competitive_matrix: {
    advantages: Array<{
      category: string;
      our_position: string;
      vs_competitors: string;
      impact: 'high' | 'medium' | 'low';
    }>;
    vulnerabilities: Array<{
      category: string;
      risk_description: string;
      mitigation: string;
    }>;
  };
  clinical_analysis: {
    dosage_adequacy: Array<{
      ingredient: string;
      our_dosage: string;
      clinical_range: string;
      adequacy: 'optimal' | 'adequate' | 'suboptimal' | 'insufficient';
      research_note: string;
    }>;
    synergy_pairs: Array<{
      ingredients: string[];
      synergy_type: string;
      present_in_formula: boolean;
    }>;
  };
  swot: {
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
    threats: string[];
  };
  priority_roadmap: Array<{
    phase: 1 | 2 | 3;
    action: string;
    ingredient: string;
    expected_impact: string;
    complexity: 'easy' | 'moderate' | 'complex';
    timeline: string;
  }>;
  // NEW: AI-Generated Ingredient Comparison Table
  ingredient_comparison_table: {
    our_concept_name: string;
    competitors: Array<{
      brand: string;
      product_name: string;
    }>;
    rows: Array<{
      ingredient: string;
      category: 'primary_active' | 'secondary_active' | 'tertiary_active' | 'excipient' | 'other';
      our_concept: {
        amount: string | null;
        form: string | null;
      };
      competitor_1: { amount: string | null; present: boolean };
      competitor_2: { amount: string | null; present: boolean };
      competitor_3: { amount: string | null; present: boolean };
      status: 'in_all' | 'unique_to_us' | 'missing_from_us' | 'partial';
      comparison_note: string;
    }>;
    summary: {
      total_our_ingredients: number;
      total_competitor_avg: number;
      overlap_count: number;
      unique_to_us_count: number;
      missing_from_us_count: number;
      overall_assessment: string;
    };
  };
}

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

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY is not configured');
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
      .select('brand, title, all_nutrients, ingredients, other_ingredients, price, servings_per_container, review_analysis')
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
      
      // Extract review analysis insights
      const reviewAnalysis = c.review_analysis as any;
      const painPoints = reviewAnalysis?.pain_points?.slice(0, 5)?.map((p: any) => p.issue || p).join(', ') || 'N/A';
      const positiveThemes = reviewAnalysis?.positive_themes?.slice(0, 5)?.map((t: any) => t.theme || t).join(', ') || 'N/A';
      const keyInsights = reviewAnalysis?.key_insights?.slice(0, 3)?.join(', ') || 'N/A';
      
      return `Competitor ${idx + 1} (${c.brand || 'Unknown'} - ${c.title || 'Unknown Product'}):
- Nutrients: ${nutrientList}
- Ingredients: ${c.ingredients || 'N/A'}
- Other Ingredients: ${c.other_ingredients || 'N/A'}
- Price: $${c.price || 'N/A'}, Servings: ${c.servings_per_container || 'N/A'}
- Customer Pain Points: ${painPoints}
- Positive Themes: ${positiveThemes}
- Key Insights: ${keyInsights}`;
    }).join('\n\n') || 'No competitor data available';

    // Background task to call Claude and save results with retry logic
    async function runAnalysisInBackground() {
      console.log('Starting background Claude API call...');
      
      // Save "in progress" state to database before starting
      try {
        await supabase
          .from('ingredient_analyses')
          .upsert({
            category_id: categoryId,
            analysis: { 
              status: 'in_progress', 
              started_at: new Date().toISOString(),
              message: 'AI analysis in progress. This typically takes 4-6 minutes for complex formulations.'
            },
            updated_at: new Date().toISOString()
          }, { onConflict: 'category_id' });
        console.log('In-progress state saved to database');
      } catch (dbError) {
        console.error('Failed to save in-progress state:', dbError);
      }
      
      const maxRetries = 1; // Reduced from 2 to avoid excessive wait times
      let lastError: Error | null = null;
      
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          if (attempt > 0) {
            console.log(`Retry attempt ${attempt}/${maxRetries}...`);
            await new Promise(r => setTimeout(r, 5000)); // Wait 5 seconds before retry
          }
          
          console.log('Calling Claude API for ingredient analysis - this may take 4-6 minutes for complex analysis...');
          
          // Create AbortController for timeout (8 minutes for complex analysis)
          const controller = new AbortController();
          const timeoutId = setTimeout(() => {
            console.log('Aborting fetch due to timeout (8 minutes)');
            controller.abort();
          }, 480000); // 8 minute timeout for complex analysis
          
          const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            },
            signal: controller.signal,
            body: JSON.stringify({
              model: 'google/gemini-3-pro-preview',
            tools: [
              {
                type: 'function',
                function: {
                  name: 'analyze_ingredients',
                  description: 'Comprehensive ingredient formulation analysis with clinical insights, competitive matrix, customer pain point solutions, SWOT analysis, and priority roadmap.',
                  parameters: {
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
                          description: 'Top 3-5 formulation advantages'
                        },
                        key_gaps: { 
                          type: 'array', 
                          items: { type: 'string' },
                          description: 'Top 3-5 missing opportunities or weaknesses'
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
                    },
                    customer_insights: {
                      type: 'object',
                      properties: {
                        pain_point_solutions: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              pain_point: { type: 'string', description: 'Customer complaint from reviews' },
                              solving_ingredient: { type: 'string', description: 'Ingredient or feature that addresses this' },
                              confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
                              evidence: { type: 'string', description: 'Clinical or market rationale' }
                            },
                            required: ['pain_point', 'solving_ingredient', 'confidence', 'evidence']
                          }
                        },
                        unaddressed_complaints: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              complaint: { type: 'string' },
                              suggested_solution: { type: 'string' },
                              ingredient_recommendation: { type: 'string' }
                            },
                            required: ['complaint', 'suggested_solution', 'ingredient_recommendation']
                          }
                        }
                      },
                      required: ['pain_point_solutions', 'unaddressed_complaints']
                    },
                    competitive_matrix: {
                      type: 'object',
                      properties: {
                        advantages: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              category: { type: 'string', description: 'Dosage, Form, Quality, Value, Ingredients' },
                              our_position: { type: 'string' },
                              vs_competitors: { type: 'string' },
                              impact: { type: 'string', enum: ['high', 'medium', 'low'] }
                            },
                            required: ['category', 'our_position', 'vs_competitors', 'impact']
                          }
                        },
                        vulnerabilities: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              category: { type: 'string' },
                              risk_description: { type: 'string' },
                              mitigation: { type: 'string' }
                            },
                            required: ['category', 'risk_description', 'mitigation']
                          }
                        }
                      },
                      required: ['advantages', 'vulnerabilities']
                    },
                    clinical_analysis: {
                      type: 'object',
                      properties: {
                        dosage_adequacy: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              ingredient: { type: 'string' },
                              our_dosage: { type: 'string' },
                              clinical_range: { type: 'string', description: 'Research-backed dosage range' },
                              adequacy: { type: 'string', enum: ['optimal', 'adequate', 'suboptimal', 'insufficient'] },
                              research_note: { type: 'string' }
                            },
                            required: ['ingredient', 'our_dosage', 'clinical_range', 'adequacy', 'research_note']
                          }
                        },
                        synergy_pairs: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              ingredients: { type: 'array', items: { type: 'string' }, description: 'Two ingredients that work together' },
                              synergy_type: { type: 'string', description: 'Enhanced absorption, Bioavailability, etc.' },
                              present_in_formula: { type: 'boolean' }
                            },
                            required: ['ingredients', 'synergy_type', 'present_in_formula']
                          }
                        }
                      },
                      required: ['dosage_adequacy', 'synergy_pairs']
                    },
                    swot: {
                      type: 'object',
                      properties: {
                        strengths: { type: 'array', items: { type: 'string' }, description: 'Internal advantages of our formulation' },
                        weaknesses: { type: 'array', items: { type: 'string' }, description: 'Internal disadvantages' },
                        opportunities: { type: 'array', items: { type: 'string' }, description: 'External opportunities to exploit' },
                        threats: { type: 'array', items: { type: 'string' }, description: 'External risks and challenges' }
                      },
                      required: ['strengths', 'weaknesses', 'opportunities', 'threats']
                    },
                    priority_roadmap: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          phase: { type: 'integer', description: '1=immediate, 2=next batch, 3=future' },
                          action: { type: 'string', description: 'Action to take' },
                          ingredient: { type: 'string', description: 'Target ingredient' },
                          expected_impact: { type: 'string', description: 'Expected impact' },
                          complexity: { type: 'string', description: 'easy, moderate, or complex' },
                          timeline: { type: 'string', description: 'Immediate, Next formulation, Future' }
                        }
                      },
                      description: 'Phased improvement roadmap'
                    },
                    ingredient_comparison_table: {
                      type: 'object',
                      description: 'Complete ingredient-by-ingredient comparison table of Our Concept vs all competitors',
                      properties: {
                        our_concept_name: { type: 'string', description: 'Name of our product concept' },
                        competitors: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              brand: { type: 'string' },
                              product_name: { type: 'string' }
                            },
                            required: ['brand', 'product_name']
                          }
                        },
                        rows: {
                          type: 'array',
                          description: 'ALL ingredients from both Our Concept and competitors - include EVERY ingredient',
                          items: {
                            type: 'object',
                            properties: {
                              ingredient: { type: 'string', description: 'Full ingredient name (e.g., Cranberry Extract, Pectin, Sodium Citrate)' },
                              category: { 
                                type: 'string', 
                                enum: ['primary_active', 'secondary_active', 'tertiary_active', 'excipient', 'other'],
                                description: 'Ingredient category'
                              },
                              our_concept: {
                                type: 'object',
                                properties: {
                                  amount: { type: 'string', nullable: true, description: 'Dosage amount (e.g., 500mg, 100IU) or null if not present' },
                                  form: { type: 'string', nullable: true, description: 'Form/standardization (e.g., KSM-66, 36:1 extract) or null' }
                                },
                                required: ['amount', 'form']
                              },
                              competitor_1: {
                                type: 'object',
                                properties: {
                                  amount: { type: 'string', nullable: true, description: 'Dosage or null' },
                                  present: { type: 'boolean', description: 'Whether ingredient is present' }
                                },
                                required: ['amount', 'present']
                              },
                              competitor_2: {
                                type: 'object',
                                properties: {
                                  amount: { type: 'string', nullable: true },
                                  present: { type: 'boolean' }
                                },
                                required: ['amount', 'present']
                              },
                              competitor_3: {
                                type: 'object',
                                properties: {
                                  amount: { type: 'string', nullable: true },
                                  present: { type: 'boolean' }
                                },
                                required: ['amount', 'present']
                              },
                              status: { 
                                type: 'string', 
                                enum: ['in_all', 'unique_to_us', 'missing_from_us', 'partial'],
                                description: 'in_all=all have it, unique_to_us=only we have it, missing_from_us=competitors have but we dont, partial=some have it'
                              },
                              comparison_note: { type: 'string', description: 'AI-generated insight about this ingredient comparison (e.g., Our dosage leads by 25%, Standard excipient, Differentiator)' }
                            },
                            required: ['ingredient', 'category', 'our_concept', 'competitor_1', 'competitor_2', 'competitor_3', 'status', 'comparison_note']
                          }
                        },
                        summary: {
                          type: 'object',
                          properties: {
                            total_our_ingredients: { type: 'number', description: 'Total ingredients in Our Concept' },
                            total_competitor_avg: { type: 'number', description: 'Average ingredient count across competitors' },
                            overlap_count: { type: 'number', description: 'Number of ingredients shared by all' },
                            unique_to_us_count: { type: 'number', description: 'Ingredients only we have' },
                            missing_from_us_count: { type: 'number', description: 'Ingredients competitors have that we lack' },
                            overall_assessment: { type: 'string', description: 'Brief overall comparison summary' }
                          },
                          required: ['total_our_ingredients', 'total_competitor_avg', 'overlap_count', 'unique_to_us_count', 'missing_from_us_count', 'overall_assessment']
                        }
                      },
                      required: ['our_concept_name', 'competitors', 'rows', 'summary']
                    }
                  },
                  },
                  required: ['summary', 'ingredients', 'charts', 'actionable_insights', 'customer_insights', 'competitive_matrix', 'clinical_analysis', 'swot', 'priority_roadmap', 'ingredient_comparison_table']
                }
              }
            ],
            tool_choice: { type: 'function', function: { name: 'analyze_ingredients' } },
            messages: [
              {
                role: 'user',
                content: `You are an expert supplement formulator, clinical nutritionist, and competitive analyst. Analyze the following formulation data for "${categoryName}" and provide a COMPREHENSIVE ingredient analysis.

## OUR FORMULATION BRIEF:
${formulaBriefContent}

## TOP 3 COMPETITORS BY SALES:
${competitorSummary}

Please provide a thorough analysis including:

1. **INGREDIENT COMPARISON**: Compare our ingredient dosages vs competitor averages. Identify where we're leading, matching, trailing, or missing key ingredients.

2. **CLINICAL EFFICACY**: Evaluate our dosages against research-backed clinical ranges. Note which ingredients are at optimal, adequate, suboptimal, or insufficient levels.

3. **SYNERGY PAIRS**: Identify ingredient combinations that work synergistically (e.g., Vitamin D + K2, Iron + Vitamin C) and whether we have them.

4. **CUSTOMER PAIN POINT SOLUTIONS**: Based on competitor review pain points and positive themes, identify which customer complaints our formulation solves and which remain unaddressed.

5. **COMPETITIVE MATRIX**: Create an advantages/vulnerabilities matrix across categories like Dosage, Form, Quality, Value, Ingredients.

6. **SWOT ANALYSIS**: Provide strengths, weaknesses, opportunities, and threats for our formulation.

7. **PRIORITY ROADMAP**: Create a phased action plan (Phase 1: Immediate, Phase 2: Next Batch, Phase 3: Future) with specific ingredient adjustments.

8. **COMPREHENSIVE INGREDIENT COMPARISON TABLE**: Create a COMPLETE ingredient-by-ingredient comparison table including:
   - ALL active ingredients from Our Concept (primary, secondary, tertiary actives)
   - ALL excipients and other ingredients from Our Concept
   - ALL nutrients from competitor products (from all_nutrients data)
   - ALL other ingredients from competitors (from other_ingredients field)
   - For each ingredient: dosage/amount if available, whether present in each entity
   - Status: in_all (everyone has it), unique_to_us (only we have), missing_from_us (competitors have, we don't), partial (some have)
   - A comparison note for each ingredient explaining the strategic significance

Include EVERY single ingredient - do not skip any. Include excipients like pectin, citric acid, natural flavors, etc.

Be specific about dosages, cite clinical ranges where relevant, and provide actionable insights.`
              }
            ]
          })
        });

          clearTimeout(timeoutId);
          
          if (!response.ok) {
            const errorText = await response.text();
            console.error('Gemini API error:', response.status, errorText);
            throw new Error(`Gemini API error: ${response.status}`);
          }

          const geminiResponse = await response.json();
          console.log('Gemini response received');
          console.log('Gemini finish_reason:', geminiResponse.choices?.[0]?.finish_reason);
          console.log('Gemini usage:', JSON.stringify(geminiResponse.usage));

          // Extract the tool call result (OpenAI format)
          const toolCall = geminiResponse.choices?.[0]?.message?.tool_calls?.[0];
          if (!toolCall || !toolCall.function?.arguments) {
            console.error('No tool call in response. Message:', JSON.stringify(geminiResponse.choices?.[0]?.message).substring(0, 1000));
            throw new Error('No tool call in Gemini response');
          }

          const analysis: IngredientAnalysis = JSON.parse(toolCall.function.arguments);
          console.log('Analysis complete:', analysis.summary.overall_assessment);
          
          // Log whether ingredient_comparison_table is present
          console.log('Has ingredient_comparison_table:', !!analysis.ingredient_comparison_table);
          if (analysis.ingredient_comparison_table) {
            console.log('Comparison table rows count:', analysis.ingredient_comparison_table.rows?.length || 0);
          }

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
          } else {
            console.log('Analysis saved to database successfully');
          }
          
          // Success - exit retry loop
          return;
          
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          const isTimeout = lastError.name === 'AbortError';
          console.error(`Attempt ${attempt + 1} failed (${isTimeout ? 'timeout' : 'error'}):`, lastError.message);
          
          // If this was the last attempt, save error state to database
          if (attempt === maxRetries) {
            console.error('All retry attempts exhausted. Saving error state.');
            try {
              await supabase
                .from('ingredient_analyses')
                .upsert({
                  category_id: categoryId,
                  analysis: { 
                    error: true, 
                    error_type: isTimeout ? 'timeout' : 'api_error',
                    message: isTimeout 
                      ? 'Analysis took longer than expected. This can happen with complex formulas. Please try again.' 
                      : `Analysis failed after ${maxRetries + 1} attempts: ${lastError.message}`,
                    timestamp: new Date().toISOString()
                  },
                  updated_at: new Date().toISOString()
                }, { onConflict: 'category_id' });
            } catch (dbError) {
              console.error('Failed to save error state:', dbError);
            }
          }
        }
      }
    }

    // Start background task and return immediately
    console.log('Starting background analysis task...');
    EdgeRuntime.waitUntil(runAnalysisInBackground());

    return new Response(
      JSON.stringify({ success: true, status: 'processing', message: 'Analysis started in background. Poll database for results.' }),
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
