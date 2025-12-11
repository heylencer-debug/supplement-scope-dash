import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simplified interface for Gemini compatibility
interface IngredientAnalysis {
  summary: {
    overall_assessment: string;
    key_strengths: string[];
    key_gaps: string[];
    recommendation: string;
  };
  ingredients: Array<{
    name: string;
    our_dosage: string | null;
    avg_competitor_dosage: string | null;
    gap_status: string;
    gap_percentage: number | null;
    clinical_note: string;
    priority: string;
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
    type: string;
    ingredient: string;
    reason: string;
    impact: string;
  }>;
  customer_insights?: {
    pain_point_solutions: Array<{
      pain_point: string;
      solving_ingredient: string;
      confidence: string;
      evidence: string;
    }>;
    unaddressed_complaints: Array<{
      complaint: string;
      suggested_solution: string;
      ingredient_recommendation: string;
    }>;
  };
  competitive_matrix?: {
    advantages: Array<{
      category: string;
      our_position: string;
      vs_competitors: string;
      impact: string;
    }>;
    vulnerabilities: Array<{
      category: string;
      risk_description: string;
      mitigation: string;
    }>;
  };
  clinical_analysis?: {
    dosage_adequacy: Array<{
      ingredient: string;
      our_dosage: string;
      clinical_range: string;
      adequacy: string;
      research_note: string;
    }>;
    synergy_pairs: Array<{
      ingredients: string[];
      synergy_type: string;
      present_in_formula: boolean;
    }>;
  };
  swot?: {
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
    threats: string[];
  };
  priority_roadmap?: Array<{
    phase: number;
    action: string;
    ingredient: string;
    expected_impact: string;
    complexity: string;
    timeline: string;
  }>;
  ingredient_comparison_table?: {
    our_concept_name: string;
    competitors: Array<{
      brand: string;
      product_name: string;
    }>;
    rows: Array<{
      ingredient: string;
      category: string;
      our_concept: {
        amount: string | null;
        form: string | null;
      };
      competitor_1: { amount: string | null; present: boolean };
      competitor_2: { amount: string | null; present: boolean };
      competitor_3: { amount: string | null; present: boolean };
      status: string;
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

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY is not configured');
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`[analyze-ingredients] Starting analysis for category: ${categoryId}`);

    // Fetch category analysis
    const { data: analysisData, error: analysisError } = await supabase
      .from('category_analyses')
      .select('analysis_3_formula_brief, analysis_1_category_scores, category_name')
      .eq('category_id', categoryId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (analysisError) {
      console.error('[analyze-ingredients] Error fetching analysis:', analysisError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch analysis data' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch top 3 competitors
    const { data: competitors, error: competitorsError } = await supabase
      .from('products')
      .select('brand, title, all_nutrients, ingredients, other_ingredients, price, servings_per_container, review_analysis')
      .eq('category_id', categoryId)
      .order('monthly_sales', { ascending: false })
      .limit(3);

    if (competitorsError) {
      console.error('[analyze-ingredients] Error fetching competitors:', competitorsError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch competitor data' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const formulaBriefContent = analysisData?.analysis_3_formula_brief?.formula_brief_content || '';
    const categoryName = analysisData?.category_name || 'Unknown Category';

    // Format competitor data
    const competitorSummary = competitors?.map((c, idx) => {
      const nutrients = c.all_nutrients || [];
      const nutrientList = Array.isArray(nutrients) 
        ? nutrients.map((n: any) => `${n.name}: ${n.amount}${n.unit}`).join(', ')
        : 'No nutrient data';
      
      const reviewAnalysis = c.review_analysis as any;
      const painPoints = reviewAnalysis?.pain_points?.slice(0, 5)?.map((p: any) => p.issue || p).join(', ') || 'N/A';
      const positiveThemes = reviewAnalysis?.positive_themes?.slice(0, 5)?.map((t: any) => t.theme || t).join(', ') || 'N/A';
      
      return `Competitor ${idx + 1} (${c.brand || 'Unknown'} - ${c.title || 'Unknown'}):
- Nutrients: ${nutrientList}
- Ingredients: ${c.ingredients || 'N/A'}
- Other Ingredients: ${c.other_ingredients || 'N/A'}
- Price: $${c.price || 'N/A'}, Servings: ${c.servings_per_container || 'N/A'}
- Pain Points: ${painPoints}
- Positive Themes: ${positiveThemes}`;
    }).join('\n\n') || 'No competitor data available';

    // Background task
    async function runAnalysisInBackground() {
      console.log('[analyze-ingredients] Starting background analysis...');
      
      // Save in-progress state
      try {
        await supabase
          .from('ingredient_analyses')
          .upsert({
            category_id: categoryId,
            analysis: { 
              status: 'in_progress', 
              started_at: new Date().toISOString()
            },
            updated_at: new Date().toISOString()
          }, { onConflict: 'category_id' });
        console.log('[analyze-ingredients] In-progress state saved');
      } catch (dbError) {
        console.error('[analyze-ingredients] Failed to save in-progress state:', dbError);
      }
      
      try {
        console.log('[analyze-ingredients] Calling Gemini 2.5 Flash...');
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          console.log('[analyze-ingredients] Request timeout (5 min)');
          controller.abort();
        }, 300000); // 5 minute timeout

        const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            tools: [
              {
                type: 'function',
                function: {
                  name: 'analyze_ingredients',
                  description: 'Analyze ingredient formulation with competitive comparison',
                  parameters: {
                    type: 'object',
                    properties: {
                      summary: {
                        type: 'object',
                        properties: {
                          overall_assessment: { type: 'string', description: 'Strong, Moderate, or Weak' },
                          key_strengths: { type: 'array', items: { type: 'string' } },
                          key_gaps: { type: 'array', items: { type: 'string' } },
                          recommendation: { type: 'string' }
                        }
                      },
                      ingredients: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            name: { type: 'string' },
                            our_dosage: { type: 'string' },
                            avg_competitor_dosage: { type: 'string' },
                            gap_status: { type: 'string', description: 'leading, matching, trailing, missing, or unique' },
                            gap_percentage: { type: 'number' },
                            clinical_note: { type: 'string' },
                            priority: { type: 'string', description: 'high, medium, or low' }
                          }
                        }
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
                              }
                            }
                          },
                          coverage_score: { type: 'number' },
                          uniqueness_score: { type: 'number' },
                          efficacy_score: { type: 'number' }
                        }
                      },
                      actionable_insights: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            type: { type: 'string', description: 'add, increase, decrease, remove, or keep' },
                            ingredient: { type: 'string' },
                            reason: { type: 'string' },
                            impact: { type: 'string', description: 'high, medium, or low' }
                          }
                        }
                      },
                      customer_insights: {
                        type: 'object',
                        properties: {
                          pain_point_solutions: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                pain_point: { type: 'string' },
                                solving_ingredient: { type: 'string' },
                                confidence: { type: 'string' },
                                evidence: { type: 'string' }
                              }
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
                              }
                            }
                          }
                        }
                      },
                      competitive_matrix: {
                        type: 'object',
                        properties: {
                          advantages: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                category: { type: 'string' },
                                our_position: { type: 'string' },
                                vs_competitors: { type: 'string' },
                                impact: { type: 'string' }
                              }
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
                              }
                            }
                          }
                        }
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
                                clinical_range: { type: 'string' },
                                adequacy: { type: 'string', description: 'optimal, adequate, suboptimal, or insufficient' },
                                research_note: { type: 'string' }
                              }
                            }
                          },
                          synergy_pairs: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                ingredients: { type: 'array', items: { type: 'string' } },
                                synergy_type: { type: 'string' },
                                present_in_formula: { type: 'boolean' }
                              }
                            }
                          }
                        }
                      },
                      swot: {
                        type: 'object',
                        properties: {
                          strengths: { type: 'array', items: { type: 'string' } },
                          weaknesses: { type: 'array', items: { type: 'string' } },
                          opportunities: { type: 'array', items: { type: 'string' } },
                          threats: { type: 'array', items: { type: 'string' } }
                        }
                      },
                      priority_roadmap: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            phase: { type: 'number' },
                            action: { type: 'string' },
                            ingredient: { type: 'string' },
                            expected_impact: { type: 'string' },
                            complexity: { type: 'string' },
                            timeline: { type: 'string' }
                          }
                        }
                      },
                      ingredient_comparison_table: {
                        type: 'object',
                        properties: {
                          our_concept_name: { type: 'string' },
                          competitors: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                brand: { type: 'string' },
                                product_name: { type: 'string' }
                              }
                            }
                          },
                          rows: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                ingredient: { type: 'string' },
                                category: { type: 'string', description: 'primary_active, secondary_active, tertiary_active, excipient, or other' },
                                our_concept: {
                                  type: 'object',
                                  properties: {
                                    amount: { type: 'string' },
                                    form: { type: 'string' }
                                  }
                                },
                                competitor_1: {
                                  type: 'object',
                                  properties: {
                                    amount: { type: 'string' },
                                    present: { type: 'boolean' }
                                  }
                                },
                                competitor_2: {
                                  type: 'object',
                                  properties: {
                                    amount: { type: 'string' },
                                    present: { type: 'boolean' }
                                  }
                                },
                                competitor_3: {
                                  type: 'object',
                                  properties: {
                                    amount: { type: 'string' },
                                    present: { type: 'boolean' }
                                  }
                                },
                                status: { type: 'string', description: 'in_all, unique_to_us, missing_from_us, or partial' },
                                comparison_note: { type: 'string' }
                              }
                            }
                          },
                          summary: {
                            type: 'object',
                            properties: {
                              total_our_ingredients: { type: 'number' },
                              total_competitor_avg: { type: 'number' },
                              overlap_count: { type: 'number' },
                              unique_to_us_count: { type: 'number' },
                              missing_from_us_count: { type: 'number' },
                              overall_assessment: { type: 'string' }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            ],
            tool_choice: { type: 'function', function: { name: 'analyze_ingredients' } },
            messages: [
              {
                role: 'user',
                content: `Analyze this supplement formulation for "${categoryName}".

## OUR FORMULATION:
${formulaBriefContent}

## TOP 3 COMPETITORS:
${competitorSummary}

Provide comprehensive analysis including:
1. Ingredient comparison (our dosages vs competitors)
2. Clinical efficacy (dosages vs research-backed ranges)
3. Synergy pairs (beneficial ingredient combinations)
4. Customer pain point solutions
5. Competitive advantages/vulnerabilities
6. SWOT analysis
7. Priority roadmap (phase 1-3 actions)
8. Complete ingredient comparison table (ALL ingredients from both our concept and competitors)

Be specific with dosages and provide actionable insights.`
              }
            ]
          })
        });

        clearTimeout(timeoutId);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('[analyze-ingredients] API error:', response.status, errorText);
          throw new Error(`API error: ${response.status}`);
        }

        const geminiResponse = await response.json();
        console.log('[analyze-ingredients] Response received, finish_reason:', geminiResponse.choices?.[0]?.finish_reason);

        const toolCall = geminiResponse.choices?.[0]?.message?.tool_calls?.[0];
        if (!toolCall?.function?.arguments) {
          console.error('[analyze-ingredients] No tool call in response');
          throw new Error('No tool call in response');
        }

        const analysis: IngredientAnalysis = JSON.parse(toolCall.function.arguments);
        console.log('[analyze-ingredients] Analysis complete:', analysis.summary?.overall_assessment);
        console.log('[analyze-ingredients] Ingredients count:', analysis.ingredients?.length);
        console.log('[analyze-ingredients] Comparison table rows:', analysis.ingredient_comparison_table?.rows?.length);

        // Save to database
        const { error: upsertError } = await supabase
          .from('ingredient_analyses')
          .upsert({
            category_id: categoryId,
            analysis: analysis,
            updated_at: new Date().toISOString()
          }, { onConflict: 'category_id' });

        if (upsertError) {
          console.error('[analyze-ingredients] Database save error:', upsertError);
        } else {
          console.log('[analyze-ingredients] Saved to database');
        }
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isTimeout = error instanceof Error && error.name === 'AbortError';
        console.error('[analyze-ingredients] Analysis failed:', errorMessage);
        
        // Save error state
        try {
          await supabase
            .from('ingredient_analyses')
            .upsert({
              category_id: categoryId,
              analysis: { 
                error: true, 
                message: isTimeout 
                  ? 'Analysis timed out. Please try again.' 
                  : `Analysis failed: ${errorMessage}`,
                timestamp: new Date().toISOString()
              },
              updated_at: new Date().toISOString()
            }, { onConflict: 'category_id' });
        } catch (dbError) {
          console.error('[analyze-ingredients] Failed to save error state:', dbError);
        }
      }
    }

    // Start background task
    console.log('[analyze-ingredients] Starting background task...');
    EdgeRuntime.waitUntil(runAnalysisInBackground());

    return new Response(
      JSON.stringify({ success: true, status: 'processing' }),
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
