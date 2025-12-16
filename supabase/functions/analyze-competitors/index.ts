import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CompetitorData {
  brand: string;
  title: string;
  price: number;
  bsr_current: number;
  monthly_sales: number;
  rating: number;
  reviews: number;
  ingredients: string;
  review_analysis: any;
  marketing_analysis: any;
  feature_bullets: string[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { categoryId } = await req.json();

    if (!categoryId) {
      return new Response(
        JSON.stringify({ error: "categoryId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Start background task for long-running AI analysis
    (globalThis as any).EdgeRuntime?.waitUntil?.(runCompetitiveAnalysis(supabase, categoryId)) 
      || runCompetitiveAnalysis(supabase, categoryId);

    return new Response(
      JSON.stringify({ status: "processing", message: "Analysis started" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in analyze-competitors:", error);
    const errMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function runCompetitiveAnalysis(supabase: any, categoryId: string) {
  try {
    console.log("Starting competitive analysis for category:", categoryId);

    // Fetch category analysis (Our Concept data)
    const { data: categoryAnalysis, error: analysisError } = await supabase
      .from("category_analyses")
      .select("*")
      .eq("category_id", categoryId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (analysisError) {
      console.error("Error fetching category analysis:", analysisError);
      throw analysisError;
    }

    // Fetch top competitors
    const { data: competitors, error: competitorsError } = await supabase
      .from("products")
      .select("*")
      .eq("category_id", categoryId)
      .order("monthly_sales", { ascending: false })
      .limit(10);

    if (competitorsError) {
      console.error("Error fetching competitors:", competitorsError);
      throw competitorsError;
    }

    // Prepare competitor data for AI
    const competitorData: CompetitorData[] = competitors.map((p: any) => ({
      brand: p.brand || "Unknown Brand",
      title: p.title || "Unknown Product",
      price: p.price || 0,
      bsr_current: p.bsr_current || 0,
      monthly_sales: p.monthly_sales || 0,
      rating: p.rating || 0,
      reviews: p.reviews || 0,
      ingredients: p.ingredients || "",
      review_analysis: p.review_analysis || {},
      marketing_analysis: p.marketing_analysis || {},
      feature_bullets: p.feature_bullets || [],
    }));

    // Extract Our Concept data
    const ourConcept = {
      pricing: categoryAnalysis.analysis_1_category_scores?.pricing_strategy || {},
      formulation: categoryAnalysis.analysis_1_category_scores?.product_development?.formulation || {},
      positioning: categoryAnalysis.analysis_1_category_scores?.go_to_market?.positioning || "",
      competitive_analysis: categoryAnalysis.analysis_1_category_scores?.competitive_analysis || {},
      strengths: categoryAnalysis.top_strengths || [],
      weaknesses: categoryAnalysis.top_weaknesses || [],
      key_insights: categoryAnalysis.key_insights || {},
      recommended_price: categoryAnalysis.recommended_price,
      opportunity_index: categoryAnalysis.opportunity_index,
    };

    // Call AI for analysis
    const analysis = await callAIForCompetitiveAnalysis(ourConcept, competitorData);

    // Save to database
    const { error: upsertError } = await supabase
      .from("competitive_analyses")
      .upsert({
        category_id: categoryId,
        analysis: analysis,
        updated_at: new Date().toISOString(),
      }, { onConflict: "category_id" });

    if (upsertError) {
      console.error("Error saving competitive analysis:", upsertError);
      throw upsertError;
    }

    console.log("Competitive analysis completed and saved for category:", categoryId);
  } catch (error) {
    console.error("Background analysis failed:", error);
  }
}

async function callAIForCompetitiveAnalysis(ourConcept: any, competitors: CompetitorData[]) {
  const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");

  if (!OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }

  const systemPrompt = `You are an expert competitive analyst for consumer products. Analyze "Our Concept" (a new product being developed) against existing competitors and provide strategic insights.

Your analysis should be actionable, specific, and data-driven. Focus on:
1. Where Our Concept is stronger than each competitor
2. Where each competitor is stronger and how to match them
3. Overall competitive positioning
4. Priority improvements ranked by impact`;

  const userPrompt = `Analyze our product concept against these competitors:

## OUR CONCEPT
${JSON.stringify(ourConcept, null, 2)}

## COMPETITORS (sorted by sales)
${competitors.map((c, i) => `
### Competitor ${i + 1}: ${c.brand} - ${c.title}
- Price: $${c.price}
- BSR: ${c.bsr_current}
- Monthly Sales: ${c.monthly_sales}
- Rating: ${c.rating} (${c.reviews} reviews)
- Ingredients: ${c.ingredients?.substring(0, 500) || "N/A"}
- Review Pain Points: ${JSON.stringify(c.review_analysis?.pain_points?.slice(0, 3) || [])}
- Review Positives: ${JSON.stringify(c.review_analysis?.positive_themes?.slice(0, 3) || [])}
- Marketing USPs: ${JSON.stringify(c.marketing_analysis?.creative_brief?.unique_selling_props?.slice(0, 3) || [])}
- Feature Bullets: ${c.feature_bullets?.slice(0, 3).join("; ") || "N/A"}
`).join("\n")}

Provide a comprehensive competitive analysis.`;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": Deno.env.get("SUPABASE_URL") || "https://lovable.dev",
      "X-Title": "Noodle Search Competitive Analysis",
    },
    body: JSON.stringify({
      model: "google/gemini-3-pro-preview",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "provide_competitive_analysis",
            description: "Provide structured competitive analysis comparing our concept to competitors",
            parameters: {
              type: "object",
              properties: {
                summary: {
                  type: "object",
                  properties: {
                    overall_position: { type: "string", enum: ["Leader", "Challenger", "Follower", "Niche"] },
                    market_readiness_score: { type: "number", description: "Score from 1-100" },
                    key_message: { type: "string", description: "One sentence summary of competitive position" },
                    top_advantages: { type: "array", items: { type: "string" }, description: "Top 3-5 advantages over competitors" },
                    critical_gaps: { type: "array", items: { type: "string" }, description: "Critical gaps that must be addressed" },
                  },
                  required: ["overall_position", "market_readiness_score", "key_message", "top_advantages", "critical_gaps"],
                },
                competitor_comparisons: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      competitor_brand: { type: "string" },
                      competitor_product: { type: "string" },
                      displacement_potential: { type: "number", description: "Score 1-10 for likelihood of displacing this competitor" },
                      where_we_win: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            area: { type: "string" },
                            our_advantage: { type: "string" },
                            impact: { type: "string", enum: ["high", "medium", "low"] },
                          },
                          required: ["area", "our_advantage", "impact"],
                        },
                      },
                      where_they_win: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            area: { type: "string" },
                            their_advantage: { type: "string" },
                            how_to_match: { type: "string" },
                            difficulty: { type: "string", enum: ["easy", "moderate", "hard"] },
                          },
                          required: ["area", "their_advantage", "how_to_match", "difficulty"],
                        },
                      },
                      overall_verdict: { type: "string" },
                    },
                    required: ["competitor_brand", "competitor_product", "displacement_potential", "where_we_win", "where_they_win", "overall_verdict"],
                  },
                },
                priority_improvements: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      rank: { type: "number" },
                      improvement: { type: "string" },
                      target_competitor: { type: "string" },
                      expected_impact: { type: "string" },
                      implementation_difficulty: { type: "string", enum: ["easy", "moderate", "hard"] },
                    },
                    required: ["rank", "improvement", "target_competitor", "expected_impact", "implementation_difficulty"],
                  },
                },
                strategic_recommendations: {
                  type: "object",
                  properties: {
                    positioning_strategy: { type: "string" },
                    messaging_focus: { type: "array", items: { type: "string" } },
                    differentiation_levers: { type: "array", items: { type: "string" } },
                    avoid_competing_on: { type: "array", items: { type: "string" } },
                  },
                  required: ["positioning_strategy", "messaging_focus", "differentiation_levers", "avoid_competing_on"],
                },
              },
              required: ["summary", "competitor_comparisons", "priority_improvements", "strategic_recommendations"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "provide_competitive_analysis" } },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("AI API error:", response.status, errorText);
    throw new Error(`AI API error: ${response.status}`);
  }

  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

  if (!toolCall?.function?.arguments) {
    throw new Error("No tool call response from AI");
  }

  return JSON.parse(toolCall.function.arguments);
}
