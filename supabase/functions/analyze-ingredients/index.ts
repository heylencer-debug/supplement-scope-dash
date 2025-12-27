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
    const { categoryId, type = 'top_performers', formulaVersionId } = await req.json();
    
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

    // SEQUENTIAL WORKFLOW: For top_performers, require new_winners analysis first
    let groundTruthIngredientCount: number | null = null;
    
    if (type === 'top_performers') {
      console.log(`[analyze-ingredients] Checking for existing new_winners analysis...`);
      
      const { data: newWinnersAnalysis, error: nwError } = await supabase
        .from('ingredient_analyses')
        .select('analysis')
        .eq('category_id', categoryId)
        .eq('type', 'new_winners')
        .maybeSingle();
      
      if (nwError) {
        console.error('[analyze-ingredients] Error checking new_winners analysis:', nwError);
      }
      
      // Check if new_winners analysis exists and has ingredient count
      const newWinnersCount = newWinnersAnalysis?.analysis?.ingredient_comparison_table?.summary?.total_our_ingredients;
      
      if (!newWinnersCount) {
        console.log('[analyze-ingredients] new_winners analysis not found or incomplete - rejecting top_performers request');
        return new Response(
          JSON.stringify({ 
            error: 'Please run New Winners analysis first to establish ingredient count',
            code: 'NEW_WINNERS_REQUIRED'
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      groundTruthIngredientCount = newWinnersCount;
      console.log(`[analyze-ingredients] Using ground truth ingredient count from new_winners: ${groundTruthIngredientCount}`);
    }

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
          .select('title, brand, ingredients, other_ingredients, all_nutrients, supplement_facts_complete, important_information, specifications, price, monthly_sales, review_analysis, age_months')
          .eq('category_id', categoryId)
          .in('asin', asins)
          .limit(5);
          
        if (refError) {
          console.error('[analyze-ingredients] Error fetching formula reference products:', refError);
        }
        competitors = refProducts || [];
        competitorLabel = 'New Winners (Formula References)';
      } else {
        // Check if this is a "Targeted Analysis" (few products in category)
        const { count: productCount } = await supabase
          .from('products')
          .select('*', { count: 'exact', head: true })
          .eq('category_id', categoryId);
        
        const isTargetedAnalysis = productCount !== null && productCount <= 10;
        console.log(`[analyze-ingredients] Product count: ${productCount}, isTargetedAnalysis: ${isTargetedAnalysis}`);
        
        if (isTargetedAnalysis) {
          // Targeted Analysis mode: use ALL available products for this category
          const { data: allProducts, error: allError } = await supabase
            .from('products')
            .select('title, brand, ingredients, other_ingredients, all_nutrients, supplement_facts_complete, important_information, specifications, price, monthly_sales, review_analysis, age_months')
            .eq('category_id', categoryId)
            .order('monthly_sales', { ascending: false })
            .limit(productCount || 10);
            
          if (allError) {
            console.error('[analyze-ingredients] Error fetching targeted analysis products:', allError);
          }
          competitors = allProducts || [];
          competitorLabel = `Targeted Analysis (${competitors.length} Product${competitors.length === 1 ? '' : 's'})`;
          console.log(`[analyze-ingredients] Targeted Analysis mode - using all ${competitors.length} products in category`);
        } else {
          // Fallback to young, high-growth products if no formula references
          const { data: youngProducts, error: youngError } = await supabase
            .from('products')
            .select('title, brand, ingredients, other_ingredients, all_nutrients, supplement_facts_complete, important_information, specifications, price, monthly_sales, review_analysis, age_months')
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
      }
    } else {
      // Top Performers - original behavior: top products by monthly sales
      const { data: topProducts, error: topError } = await supabase
        .from('products')
        .select('title, brand, ingredients, other_ingredients, all_nutrients, supplement_facts_complete, important_information, specifications, price, monthly_sales, review_analysis, age_months')
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
        formula_version_id: formulaVersionId || null,
        analysis: { status: 'in_progress', started_at: new Date().toISOString() },
        updated_at: new Date().toISOString()
      }, { onConflict: 'category_id,type' });

    console.log(`[analyze-ingredients] Marked as in_progress for type: ${type}`);

    // Format competitor data with FULL formulation details (no truncation)
    const competitorData = (competitors || []).map((c: any, i: number) => {
      return {
        rank: i + 1,
        brand: c.brand || 'Unknown',
        title: c.title || 'Unknown Product',
        price: c.price,
        monthly_sales: c.monthly_sales,
        age_months: c.age_months,
        // Full raw data - no truncation
        ingredients: c.ingredients || 'Not available',
        other_ingredients: c.other_ingredients || null,
        nutrients: c.all_nutrients || null,
        // Complete raw objects
        supplement_facts_complete: c.supplement_facts_complete || null,
        specifications: c.specifications || null,
        important_information: c.important_information || null,
        pain_points: c.review_analysis?.pain_points || []
      };
    });

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
            formula_version_id: formulaVersionId || null,
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

        // Different instructions based on whether we have a ground truth count
        let ingredientCountInstructions: string;
        
        if (groundTruthIngredientCount !== null) {
          // Top Performers: Use the ground truth count from New Winners
          ingredientCountInstructions = `
CRITICAL: The New Winners analysis has already identified EXACTLY ${groundTruthIngredientCount} ingredients in Our Concept's formula.
YOU MUST CREATE EXACTLY ${groundTruthIngredientCount} ROWS in ingredient_comparison_table - ONE ROW PER INGREDIENT.
DO NOT ADD OR REMOVE ANY INGREDIENTS. The count MUST match ${groundTruthIngredientCount}.
summary.total_our_ingredients MUST equal ${groundTruthIngredientCount}.`;
        } else {
          // New Winners: AI determines the count from raw data
          ingredientCountInstructions = `
CRITICAL: You must parse ALL ingredients from the formula brief below.
This formula typically contains 30-45+ individual ingredients organized across:
- PRIMARY ACTIVE INGREDIENTS
- SECONDARY ACTIVE INGREDIENTS  
- TERTIARY ACTIVES
- FUNCTIONAL EXCIPIENTS

IMPORTANT - BLEND COMPONENTS MUST BE COUNTED INDIVIDUALLY:
- "Probiotic Blend" containing Bacillus coagulans + Bacillus subtilis = 2 rows (not 1)
- "Prebiotic Complex" containing FOS + GOS + Inulin = 3 rows (not 1)
- "Enzyme Blend" containing Amylase + Lipase + Cellulase + Protease = 4 rows (not 1)
- Each sub-ingredient in a blend gets its OWN ROW with its OWN dosage

Parse EVERY ingredient AND every sub-ingredient from the markdown tables. 
Create ONE ROW per ingredient/sub-ingredient in ingredient_comparison_table.
summary.total_our_ingredients MUST equal the actual count you extract.
DO NOT MISS ANY INGREDIENTS - the New Winners analysis sets the ground truth count for Top Performers.`;
        }

        const systemPrompt = `You are an expert supplement formulation analyst. Analyze ingredient formulations and provide comprehensive strategic recommendations.

${typeContext}

Your task is to compare "Our Concept" formulation against ${competitorLabel} and provide detailed analysis including:
- SWOT analysis
- Clinical dosage analysis with research notes
- Customer pain point solutions
- Competitive advantages and vulnerabilities
- Priority roadmap for improvements
- COMPREHENSIVE ingredient comparison table (ALL ingredients)

${ingredientCountInstructions}

For EACH Our Concept ingredient, analyze if competitors have:
- EXACT MATCH: Same ingredient (present = true, uses_alternative = false)
- FUNCTIONAL ALTERNATIVE: Different ingredient serving same function (present = false, uses_alternative = true, alternative_name = their ingredient)
- ABSENT: Neither exact nor alternative (present = false, uses_alternative = false)

FUNCTIONAL ALTERNATIVES - Automatically detect when competitor uses different ingredient for same purpose:
- FIBER SOURCES: Pumpkin, Sweet Potato, Beet Fiber, Psyllium, Apple Pectin, Chicory Root are alternatives to each other
- PROBIOTICS: Different strains are alternatives (Bacillus coagulans, Lactobacillus, Bifidobacterium, DE111, etc.)
- PREBIOTICS: FOS, GOS, XOS, Inulin, Chicory Root, MOS are alternatives to each other
- OMEGA-3 SOURCES: Salmon Oil, Fish Oil, Flaxseed Oil, Krill Oil, Anchovy Oil are alternatives
- ANTI-INFLAMMATORIES: Turmeric, Ginger, Boswellia, Quercetin, MSM are alternatives
- DIGESTIVE ENZYMES: Protease, Amylase, Lipase, Papain, Bromelain, Cellulase are alternatives
- GUT SOOTHERS: Slippery Elm, Marshmallow Root, Licorice Root, Aloe Vera, L-Glutamine are alternatives
- IMMUNE SUPPORT: Colostrum, Beta-glucan, Echinacea, Astragalus are alternatives
- HUMECTANTS/BINDING: Glycerin, Vegetable Glycerin, Coconut Glycerin are alternatives
- PRESERVATIVES: Rosemary Extract, Mixed Tocopherols, Vitamin E, Natural Preservatives are alternatives

When competitor uses an ALTERNATIVE, populate these fields:
- uses_alternative: true
- alternative_name: "Name of their ingredient"
- alternative_amount: "Their dosage"
- status: "alternative_used"
- comparison_note: "Uses [X] instead of [Y] for [function]"

IMPORTANT: You must call the "save_ingredient_analysis" function with your complete analysis results. Do not respond with plain text.`;

        const userPrompt = `Analyze the ingredient formulation for: ${categoryName}

## Analysis Type: ${competitorLabel}
${type === 'new_winners' 
  ? 'These are emerging high-growth products. Focus on innovative formulation trends and growth drivers.' 
  : 'These are established market leaders. Focus on proven formulation strategies and competitive positioning.'}

## RAW FORMULA BRIEF (parse ALL ingredients from this - NO TRUNCATION):
${formulaBriefContent || 'No formula brief available'}

${groundTruthIngredientCount !== null 
  ? `REMINDER: You MUST create EXACTLY ${groundTruthIngredientCount} rows to match the New Winners analysis.` 
  : 'REMINDER: Parse ALL ingredients from the formula brief above. Count carefully - this sets the ground truth.'}

## ${competitorLabel}:
${competitorData.map((c: any) => `
### ${type === 'new_winners' ? 'New Winner' : 'Top Performer'} ${c.rank}: ${c.brand} - ${c.title}
- Price: $${c.price || 'N/A'}
- Monthly Sales: ${c.monthly_sales || 'N/A'}
${c.age_months ? `- Product Age: ${c.age_months} months` : ''}

#### PRIMARY INGREDIENTS (FULL - NO TRUNCATION):
${typeof c.ingredients === 'string' ? c.ingredients : JSON.stringify(c.ingredients)}

${c.other_ingredients ? `#### OTHER INGREDIENTS (FULL - Inactive/Fillers - NO TRUNCATION):
${c.other_ingredients}` : ''}

${c.nutrients ? `#### NUTRIENT PROFILE (FULL - NO TRUNCATION):
${JSON.stringify(c.nutrients)}` : ''}

${c.supplement_facts_complete ? `#### SUPPLEMENT FACTS COMPLETE (RAW - NO TRUNCATION):
${JSON.stringify(c.supplement_facts_complete)}` : ''}

${c.specifications ? `#### SPECIFICATIONS (RAW):
${JSON.stringify(c.specifications)}` : ''}

${c.important_information ? `#### IMPORTANT INFORMATION (RAW - Safety/Usage):
${JSON.stringify(c.important_information)}` : ''}

#### CUSTOMER PAIN POINTS:
${JSON.stringify(c.pain_points)}`).join('\n\n---\n')}

FINAL REMINDER: Parse EVERY ingredient from Our Concept's formula brief. Detect functional alternatives when competitors use different ingredients for the same purpose.

Provide a comprehensive analysis including SWOT, clinical dosage adequacy, customer insights, competitive matrix, priority roadmap, and the COMPLETE ingredient comparison table. Call the save_ingredient_analysis function with all fields populated.`;

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
                          adequacy: { type: 'string' },
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
                          category: { type: 'string' },
                          functional_group: { type: 'string' },
                          our_concept: {
                            type: 'object',
                            properties: {
                              amount: { type: 'string' },
                              form: { type: 'string' },
                              function: { type: 'string' }
                            }
                          },
                          competitor_1: {
                            type: 'object',
                            properties: {
                              amount: { type: 'string' },
                              present: { type: 'boolean' },
                              uses_alternative: { type: 'boolean' },
                              alternative_name: { type: 'string' },
                              alternative_amount: { type: 'string' }
                            }
                          },
                          competitor_2: {
                            type: 'object',
                            properties: {
                              amount: { type: 'string' },
                              present: { type: 'boolean' },
                              uses_alternative: { type: 'boolean' },
                              alternative_name: { type: 'string' },
                              alternative_amount: { type: 'string' }
                            }
                          },
                          competitor_3: {
                            type: 'object',
                            properties: {
                              amount: { type: 'string' },
                              present: { type: 'boolean' },
                              uses_alternative: { type: 'boolean' },
                              alternative_name: { type: 'string' },
                              alternative_amount: { type: 'string' }
                            }
                          },
                          competitor_4: {
                            type: 'object',
                            properties: {
                              amount: { type: 'string' },
                              present: { type: 'boolean' },
                              uses_alternative: { type: 'boolean' },
                              alternative_name: { type: 'string' },
                              alternative_amount: { type: 'string' }
                            }
                          },
                          competitor_5: {
                            type: 'object',
                            properties: {
                              amount: { type: 'string' },
                              present: { type: 'boolean' },
                              uses_alternative: { type: 'boolean' },
                              alternative_name: { type: 'string' },
                              alternative_amount: { type: 'string' }
                            }
                          },
                          status: { type: 'string' },
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
                        alternatives_detected_count: { type: 'number' },
                        overall_assessment: { type: 'string' }
                      }
                    }
                  }
                }
              },
              required: ['summary', 'ingredients', 'charts', 'actionable_insights', 'ingredient_comparison_table']
            }
          }
        };

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://lovable.dev',
            'X-Title': 'Noodle Search - Ingredient Analysis'
          },
          body: JSON.stringify({
            model: 'anthropic/claude-sonnet-4',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            tools: [toolSchema],
            tool_choice: { type: 'function', function: { name: 'save_ingredient_analysis' } },
            max_tokens: 32000,
            temperature: 0.1
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[analyze-ingredients] OpenRouter API error:', response.status, errorText);
          throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        console.log('[analyze-ingredients] OpenRouter API response received');

        // Extract tool call result
        const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
        if (!toolCall || toolCall.function.name !== 'save_ingredient_analysis') {
          console.error('[analyze-ingredients] No valid tool call in response');
          throw new Error('AI did not return a valid analysis');
        }

        // Try to repair common JSON issues
        const repairJson = (jsonStr: string): string => {
          let repaired = jsonStr;
          
          // Remove trailing commas before ] or }
          repaired = repaired.replace(/,(\s*[}\]])/g, '$1');
          
          // Try to close unclosed brackets/braces at the end
          const openBraces = (repaired.match(/{/g) || []).length;
          const closeBraces = (repaired.match(/}/g) || []).length;
          const openBrackets = (repaired.match(/\[/g) || []).length;
          const closeBrackets = (repaired.match(/]/g) || []).length;
          
          // If truncated, try to close the structure
          if (openBraces > closeBraces || openBrackets > closeBrackets) {
            // Find last complete property and truncate there
            const lastCompleteMatch = repaired.match(/^([\s\S]*"[^"]+"\s*:\s*(?:"[^"]*"|true|false|null|\d+(?:\.\d+)?|\{[^{}]*\}|\[[^\[\]]*\]))\s*,?\s*"[^"]*$/);
            if (lastCompleteMatch) {
              repaired = lastCompleteMatch[1];
            }
            
            // Close missing brackets/braces
            for (let i = 0; i < openBrackets - closeBrackets; i++) repaired += ']';
            for (let i = 0; i < openBraces - closeBraces; i++) repaired += '}';
          }
          
          return repaired;
        };

        let analysisResult;
        try {
          analysisResult = JSON.parse(toolCall.function.arguments);
        } catch (parseError) {
          console.error('[analyze-ingredients] Initial parse failed, attempting repair...');
          try {
            const repairedJson = repairJson(toolCall.function.arguments);
            analysisResult = JSON.parse(repairedJson);
            console.log('[analyze-ingredients] JSON repair successful');
          } catch (repairError) {
            console.error('[analyze-ingredients] JSON repair failed:', repairError);
            console.error('[analyze-ingredients] Raw response (first 500 chars):', toolCall.function.arguments.substring(0, 500));
            console.error('[analyze-ingredients] Raw response (last 500 chars):', toolCall.function.arguments.substring(toolCall.function.arguments.length - 500));
            throw new Error('Failed to parse AI analysis results - response may have been truncated');
          }
        }

        // Log the ingredient count for debugging
        const rowCount = analysisResult.ingredient_comparison_table?.rows?.length || 0;
        const summaryCount = analysisResult.ingredient_comparison_table?.summary?.total_our_ingredients || 0;
        console.log(`[analyze-ingredients] AI returned ${rowCount} ingredient rows, summary says ${summaryCount}`);
        
        if (groundTruthIngredientCount !== null && rowCount !== groundTruthIngredientCount) {
          console.warn(`[analyze-ingredients] WARNING: Row count (${rowCount}) does not match ground truth (${groundTruthIngredientCount})`);
        }

        // Add competitor details and metadata to the analysis
        analysisResult.competitor_details = competitorData;
        analysisResult.data_sent_to_ai = {
          competitor_count: competitorData.length,
          analysis_type: type,
          competitor_label: competitorLabel,
          formula_brief_included: !!formulaBriefContent,
          ground_truth_count: groundTruthIngredientCount
        };

        // Save to database
        const { error: saveError } = await supabase
          .from('ingredient_analyses')
          .upsert({
            category_id: categoryId,
            type: type,
            formula_version_id: formulaVersionId || null,
            analysis: analysisResult,
            updated_at: new Date().toISOString()
          }, { onConflict: 'category_id,type' });

        if (saveError) {
          console.error('[analyze-ingredients] Error saving analysis:', saveError);
          throw new Error('Failed to save analysis results');
        }

        console.log(`[analyze-ingredients] Successfully saved ${type} analysis with ${rowCount} ingredients`);

      } catch (error) {
        console.error('[analyze-ingredients] Background analysis error:', error);
        
        // Save error state
        await supabase
          .from('ingredient_analyses')
          .upsert({
            category_id: categoryId,
            type: type,
            formula_version_id: formulaVersionId || null,
            analysis: { 
              status: 'error', 
              error: true, 
              message: error instanceof Error ? error.message : 'Unknown error occurred'
            },
            updated_at: new Date().toISOString()
          }, { onConflict: 'category_id,type' });
      }
    }

    // Start background analysis
    EdgeRuntime.waitUntil(runAnalysisInBackground());

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `${type === 'new_winners' ? 'New Winners' : 'Top Performers'} analysis started`,
        type: type
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[analyze-ingredients] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
