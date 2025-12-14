import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

declare const EdgeRuntime: {
  waitUntil: (promise: Promise<any>) => void;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { categoryId, type = 'top_performers' } = await req.json();
    
    if (!categoryId) {
      return new Response(
        JSON.stringify({ error: 'categoryId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[analyze-ingredients] Starting analysis for category: ${categoryId}, type: ${type}`);

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

    // Fetch competitors based on type
    let competitors;
    let competitorLabel = '';
    
    if (type === 'new_winners') {
      // Get formula reference ASINs from category_analyses.products_snapshot.formula_references
      const formulaRefs = (categoryAnalysis.products_snapshot as any)?.formula_references || [];
      const asins = formulaRefs.map((r: any) => r.asin).filter(Boolean);
      
      console.log(`[analyze-ingredients] New Winners mode - found ${asins.length} formula reference ASINs:`, asins);
      
      if (asins.length > 0) {
        const { data: refProducts, error: refError } = await supabase
          .from('products')
          .select('title, brand, ingredients, other_ingredients, all_nutrients, supplement_facts_complete, price, monthly_sales, review_analysis, age_months')
          .eq('category_id', categoryId)
          .in('asin', asins)
          .limit(5);
          
        if (refError) {
          console.error('[analyze-ingredients] Error fetching formula reference products:', refError);
        }
        competitors = refProducts || [];
        competitorLabel = 'New Winners (Formula References)';
      } else {
        // Fallback to young, high-growth products if no formula references
        const { data: youngProducts, error: youngError } = await supabase
          .from('products')
          .select('title, brand, ingredients, other_ingredients, all_nutrients, supplement_facts_complete, price, monthly_sales, review_analysis, age_months')
          .eq('category_id', categoryId)
          .lte('age_months', 24)
          .order('monthly_sales', { ascending: false })
          .limit(5);
          
        if (youngError) {
          console.error('[analyze-ingredients] Error fetching young products:', youngError);
        }
        competitors = youngProducts || [];
        competitorLabel = 'New Winners (Young High-Growth Products)';
      }
    } else {
      // Top Performers - original behavior: top products by monthly sales
      const { data: topProducts, error: topError } = await supabase
        .from('products')
        .select('title, brand, ingredients, other_ingredients, all_nutrients, supplement_facts_complete, price, monthly_sales, review_analysis, age_months')
        .eq('category_id', categoryId)
        .order('monthly_sales', { ascending: false })
        .limit(5);
        
      if (topError) {
        console.error('[analyze-ingredients] Error fetching top products:', topError);
      }
      competitors = topProducts || [];
      competitorLabel = 'Top Performers (Best Sellers)';
    }

    console.log(`[analyze-ingredients] Found ${competitors?.length || 0} ${competitorLabel} competitors`);

    // Mark as in progress with type
    await supabase
      .from('ingredient_analyses')
      .upsert({
        category_id: categoryId,
        type: type,
        analysis: { status: 'in_progress', started_at: new Date().toISOString() },
        updated_at: new Date().toISOString()
      }, { onConflict: 'category_id,type' });

    console.log(`[analyze-ingredients] Marked as in_progress for type: ${type}`);

    // Format competitor data
    const competitorData = (competitors || []).map((c: any, i: number) => ({
      rank: i + 1,
      brand: c.brand || 'Unknown',
      title: c.title || 'Unknown Product',
      ingredients: c.ingredients || c.other_ingredients || 'Not available',
      nutrients: c.all_nutrients || c.supplement_facts_complete || null,
      price: c.price,
      monthly_sales: c.monthly_sales,
      age_months: c.age_months,
      pain_points: c.review_analysis?.pain_points || []
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
            type: type,
            analysis: { status: 'error', error: 'OpenRouter API key not configured' },
            updated_at: new Date().toISOString()
          }, { onConflict: 'category_id,type' });
        return;
      }

      try {
        const formulaBriefContent = categoryAnalysis.analysis_3_formula_brief?.formula_brief_content || '';
        const categoryName = categoryAnalysis.category_name || 'Unknown Category';

        // Customize prompt based on analysis type
        const typeContext = type === 'new_winners' 
          ? `Focus on EMERGING TRENDS and GROWTH STRATEGIES. These are NEW WINNERS - young, high-growth products that are disrupting the market. Analyze what innovative formulation strategies they're using that are driving their rapid growth.`
          : `Focus on PROVEN FORMULATIONS and MARKET SHARE. These are TOP PERFORMERS - established best-sellers with proven track records. Analyze what formulation strategies have made them market leaders.`;

        const systemPrompt = `You are an expert supplement formulation analyst. Analyze ingredient formulations and provide comprehensive strategic recommendations.

${typeContext}

Your task is to compare "Our Concept" formulation against ${competitorLabel} and provide detailed analysis including:
- SWOT analysis
- Clinical dosage analysis with research notes
- Customer pain point solutions
- Competitive advantages and vulnerabilities
- Priority roadmap for improvements
- Complete ingredient comparison table

IMPORTANT: You must call the "save_ingredient_analysis" function with your complete analysis results. Do not respond with plain text.`;

        const userPrompt = `Analyze the ingredient formulation for: ${categoryName}

## Analysis Type: ${competitorLabel}
${type === 'new_winners' 
  ? 'These are emerging high-growth products. Focus on innovative formulation trends and growth drivers.' 
  : 'These are established market leaders. Focus on proven formulation strategies and competitive positioning.'}

## Our Concept Formula Brief:
${formulaBriefContent || 'No formula brief available'}

## ${competitorLabel}:
${competitorData.map((c: any) => `
### ${type === 'new_winners' ? 'New Winner' : 'Top Performer'} ${c.rank}: ${c.brand} - ${c.title}
- Price: $${c.price || 'N/A'}
- Monthly Sales: ${c.monthly_sales || 'N/A'}
${c.age_months ? `- Product Age: ${c.age_months} months` : ''}
- Ingredients: ${typeof c.ingredients === 'string' ? c.ingredients.substring(0, 800) : JSON.stringify(c.ingredients).substring(0, 800)}
- Nutrients: ${c.nutrients ? JSON.stringify(c.nutrients).substring(0, 800) : 'Not available'}
- Customer Pain Points: ${JSON.stringify(c.pain_points).substring(0, 300)}
`).join('\n')}

Provide a comprehensive analysis including SWOT, clinical dosage adequacy, customer insights, competitive matrix, priority roadmap, and a complete ingredient comparison table. Call the save_ingredient_analysis function with all fields populated.`;

        console.log(`[analyze-ingredients] Calling OpenRouter API for ${type} analysis...`);

        const toolSchema = {
          type: 'function',
          function: {
            name: 'save_ingredient_analysis',
            description: 'Save the complete ingredient analysis results',
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
                  },
                  required: ['overall_assessment', 'key_strengths', 'key_gaps', 'recommendation']
                },
                ingredients: {
                  type: 'array',
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
                  properties: {
                    coverage_score: { type: 'number', description: '0-100' },
                    uniqueness_score: { type: 'number', description: '0-100' },
                    efficacy_score: { type: 'number', description: '0-100' },
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
                    }
                  },
                  required: ['coverage_score', 'uniqueness_score', 'efficacy_score', 'dosage_comparison']
                },
                actionable_insights: {
                  type: 'array',
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
                swot: {
                  type: 'object',
                  properties: {
                    strengths: { type: 'array', items: { type: 'string' } },
                    weaknesses: { type: 'array', items: { type: 'string' } },
                    opportunities: { type: 'array', items: { type: 'string' } },
                    threats: { type: 'array', items: { type: 'string' } }
                  },
                  required: ['strengths', 'weaknesses', 'opportunities', 'threats']
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
                        },
                        required: ['ingredient', 'our_dosage', 'clinical_range', 'adequacy', 'research_note']
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
                        },
                        required: ['ingredients', 'synergy_type', 'present_in_formula']
                      }
                    }
                  },
                  required: ['dosage_adequacy', 'synergy_pairs']
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
                          confidence: { type: 'string', description: 'high, medium, or low' },
                          evidence: { type: 'string' }
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
                          category: { type: 'string' },
                          our_position: { type: 'string' },
                          vs_competitors: { type: 'string' },
                          impact: { type: 'string', description: 'high, medium, or low' }
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
                priority_roadmap: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      phase: { type: 'number', description: '1, 2, or 3' },
                      action: { type: 'string' },
                      ingredient: { type: 'string' },
                      expected_impact: { type: 'string' },
                      complexity: { type: 'string', description: 'easy, moderate, or complex' },
                      timeline: { type: 'string' }
                    },
                    required: ['phase', 'action', 'ingredient', 'expected_impact', 'complexity', 'timeline']
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
                        },
                        required: ['brand', 'product_name']
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
                        },
                        required: ['ingredient', 'category', 'our_concept', 'competitor_1', 'competitor_2', 'competitor_3', 'status', 'comparison_note']
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
                      },
                      required: ['total_our_ingredients', 'total_competitor_avg', 'overlap_count', 'unique_to_us_count', 'missing_from_us_count', 'overall_assessment']
                    }
                  },
                  required: ['our_concept_name', 'competitors', 'rows', 'summary']
                }
              },
              required: ['summary', 'ingredients', 'charts', 'actionable_insights', 'swot', 'clinical_analysis', 'customer_insights', 'competitive_matrix', 'priority_roadmap', 'ingredient_comparison_table']
            }
          }
        };

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'HTTP-Referer': 'https://lovable.dev',
            'X-Title': 'Noodle Search',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'google/gemini-3-pro-preview',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            tools: [toolSchema],
            tool_choice: { type: 'function', function: { name: 'save_ingredient_analysis' } }
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[analyze-ingredients] OpenRouter API error:', response.status, errorText);
          throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        console.log(`[analyze-ingredients] OpenRouter response received for ${type}`);

        // Extract tool call
        const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
        
        if (!toolCall || toolCall.function?.name !== 'save_ingredient_analysis') {
          console.error('[analyze-ingredients] No valid tool call in response:', JSON.stringify(data).substring(0, 500));
          throw new Error('No valid tool call in OpenRouter response');
        }

        let analysisResult;
        try {
          analysisResult = JSON.parse(toolCall.function.arguments);
        } catch (parseError) {
          console.error('[analyze-ingredients] Error parsing tool arguments:', parseError);
          throw new Error('Failed to parse analysis result');
        }

        console.log(`[analyze-ingredients] Analysis result parsed successfully for ${type} with keys:`, Object.keys(analysisResult).join(', '));

        // Save to database with type
        const { error: saveError } = await supabase
          .from('ingredient_analyses')
          .upsert({
            category_id: categoryId,
            type: type,
            analysis: analysisResult,
            updated_at: new Date().toISOString()
          }, { onConflict: 'category_id,type' });

        if (saveError) {
          console.error('[analyze-ingredients] Error saving analysis:', saveError);
          throw saveError;
        }

        console.log(`[analyze-ingredients] Analysis saved successfully for category: ${categoryId}, type: ${type}`);

      } catch (error) {
        console.error('[analyze-ingredients] Background analysis error:', error);
        await supabase
          .from('ingredient_analyses')
          .upsert({
            category_id: categoryId,
            type: type,
            analysis: { 
              status: 'error', 
              error: error instanceof Error ? error.message : 'Unknown error',
              timestamp: new Date().toISOString()
            },
            updated_at: new Date().toISOString()
          }, { onConflict: 'category_id,type' });
      }
    }

    // Start background processing
    EdgeRuntime.waitUntil(runAnalysisInBackground());

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Ingredient analysis started for ${competitorLabel}`,
        categoryId,
        type
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
