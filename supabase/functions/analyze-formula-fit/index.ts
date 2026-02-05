import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// Declare EdgeRuntime for Deno environment
declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface FormulaFitAnalysis {
  overall_score: number;
  score_label: string;
  executive_summary: string;
  strengths: Array<{
    aspect: string;
    explanation: string;
    market_evidence: string;
  }>;
  weaknesses: Array<{
    aspect: string;
    explanation: string;
    impact: "high" | "medium" | "low";
  }>;
  trend_alignment: Array<{
    trend_name: string;
    alignment_score: number;
    notes: string;
  }>;
  pain_point_coverage: Array<{
    pain_point: string;
    addressed: boolean;
    how_addressed: string;
  }>;
  competitive_position: {
    price_position: string;
    feature_position: string;
    summary: string;
  };
  recommendations: Array<{
    priority: number;
    action: string;
    effort: "Easy" | "Medium" | "Hard";
    expected_impact: string;
  }>;
  gaps: Array<{
    gap: string;
    market_opportunity: string;
  }>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { categoryId } = await req.json();

    if (!categoryId) {
      return new Response(
        JSON.stringify({ error: "categoryId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[analyze-formula-fit] Starting analysis for category: ${categoryId}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const xaiApiKey = Deno.env.get("XAI_API_KEY");

    if (!xaiApiKey) {
      console.error("[analyze-formula-fit] XAI_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "XAI_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check for existing pending/processing analysis
    const { data: existingAnalysis } = await supabase
      .from("formula_fit_analyses")
      .select("*")
      .eq("category_id", categoryId)
      .in("status", ["pending", "processing"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingAnalysis) {
      console.log(`[analyze-formula-fit] Analysis already in progress: ${existingAnalysis.id}`);
      return new Response(
        JSON.stringify({ status: "processing", id: existingAnalysis.id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create a new analysis record with pending status
    const { data: newAnalysis, error: insertError } = await supabase
      .from("formula_fit_analyses")
      .insert({
        category_id: categoryId,
        status: "pending",
      })
      .select()
      .single();

    if (insertError) {
      console.error("[analyze-formula-fit] Failed to create analysis record:", insertError);
      throw new Error(`Failed to create analysis record: ${insertError.message}`);
    }

    console.log(`[analyze-formula-fit] Created analysis record: ${newAnalysis.id}`);

    // Run the analysis in the background
    EdgeRuntime.waitUntil(runAnalysis(supabase, categoryId, newAnalysis.id, xaiApiKey));

    return new Response(
      JSON.stringify({ status: "processing", id: newAnalysis.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[analyze-formula-fit] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function runAnalysis(
  supabase: ReturnType<typeof createClient>,
  categoryId: string,
  analysisId: string,
  xaiApiKey: string
) {
  try {
    // Update status to processing
    await supabase
      .from("formula_fit_analyses")
      .update({ status: "processing" })
      .eq("id", analysisId);

    console.log(`[analyze-formula-fit] Fetching data for category: ${categoryId}`);

    // Fetch all required data in parallel
    const [formulaBriefResult, marketTrendResult, categoryAnalysisResult, formulaVersionResult] = await Promise.all([
      supabase
        .from("formula_briefs")
        .select("*")
        .eq("category_id", categoryId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("market_trend_analyses")
        .select("*")
        .eq("category_id", categoryId)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("category_analyses")
        .select("*")
        .eq("category_id", categoryId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("formula_brief_versions")
        .select("*")
        .eq("category_id", categoryId)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const formulaBrief = formulaBriefResult.data;
    const marketTrend = marketTrendResult.data;
    const categoryAnalysis = categoryAnalysisResult.data;
    const formulaVersion = formulaVersionResult.data;

    if (!marketTrend || !marketTrend.analysis) {
      throw new Error("No market trend analysis found. Please run market trend analysis first.");
    }

    if (!formulaBrief && !formulaVersion && !categoryAnalysis?.analysis_3_formula_brief) {
      throw new Error("No formula brief found. Please create a formula brief first.");
    }

    console.log(`[analyze-formula-fit] Data fetched successfully. Calling Grok API...`);

    // Prepare the complete data payload for Grok
    const dataPayload = {
      formula_brief: formulaBrief,
      formula_brief_version: formulaVersion?.formula_brief_content,
      extended_formula_brief: categoryAnalysis?.analysis_3_formula_brief,
      category_analysis: {
        executive_summary: categoryAnalysis?.executive_summary,
        recommendation: categoryAnalysis?.recommendation,
        opportunity_index: categoryAnalysis?.opportunity_index,
        opportunity_tier: categoryAnalysis?.opportunity_tier,
        key_insights: categoryAnalysis?.key_insights,
        top_strengths: categoryAnalysis?.top_strengths,
        top_weaknesses: categoryAnalysis?.top_weaknesses,
        criteria_scores: categoryAnalysis?.criteria_scores,
      },
      market_trend_analysis: marketTrend.analysis,
    };

    const systemPrompt = `You are a brutally honest market analyst evaluating a supplement formula's competitive viability. Your job is to compare the formula brief against real market trend data and provide an unflinching assessment.

CRITICAL INSTRUCTIONS:
1. Be brutally honest - no sugar-coating or marketing fluff
2. Every claim must reference specific data from the market analysis
3. If there are major gaps, say so clearly and explain the impact
4. If the formula is strong, explain why with specific evidence
5. Provide actionable recommendations with clear effort/impact tradeoffs
6. Score fairly - don't inflate scores to make the user feel good

You will receive:
- Complete formula brief with ingredients, positioning, pricing, etc.
- Full market trend analysis with trends, consumer insights, competitive landscape
- Category analysis with opportunity metrics

Respond with a JSON object matching this exact structure:
{
  "overall_score": <number 0-100>,
  "score_label": "<'Strong contender' if 80+, 'Needs improvement' if 50-79, 'Major gaps' if <50>",
  "executive_summary": "<2-3 sentences summarizing the formula's market fit - be direct>",
  "strengths": [
    {
      "aspect": "<specific strength>",
      "explanation": "<why this matters>",
      "market_evidence": "<cite specific market data>"
    }
  ],
  "weaknesses": [
    {
      "aspect": "<specific weakness>",
      "explanation": "<why this is a problem>",
      "impact": "<'high', 'medium', or 'low'>"
    }
  ],
  "trend_alignment": [
    {
      "trend_name": "<trend from market analysis>",
      "alignment_score": <0-100>,
      "notes": "<how well formula addresses this>"
    }
  ],
  "pain_point_coverage": [
    {
      "pain_point": "<consumer pain point from market analysis>",
      "addressed": <true/false>,
      "how_addressed": "<explanation or why it's missing>"
    }
  ],
  "competitive_position": {
    "price_position": "<'Below market', 'At market', 'Premium', 'Super-premium'>",
    "feature_position": "<'Basic', 'Competitive', 'Differentiated', 'Industry-leading'>",
    "summary": "<1-2 sentences on competitive stance>"
  },
  "recommendations": [
    {
      "priority": <1-5, lower is more urgent>,
      "action": "<specific actionable recommendation>",
      "effort": "<'Easy', 'Medium', or 'Hard'>",
      "expected_impact": "<what improvement to expect>"
    }
  ],
  "gaps": [
    {
      "gap": "<missing element>",
      "market_opportunity": "<why this gap matters and the opportunity size>"
    }
  ]
}

Provide at least 3 strengths, 3 weaknesses, 5 trend alignments, 5 pain point coverages, 5 recommendations, and 2-3 gaps. Be thorough but not repetitive.`;

    const userMessage = `Analyze this formula's competitive fit against the market data:

=== FORMULA BRIEF DATA ===
${JSON.stringify(dataPayload.formula_brief, null, 2)}

=== FORMULA BRIEF VERSION (FULL DOCUMENT) ===
${dataPayload.formula_brief_version || "Not available"}

=== EXTENDED FORMULA BRIEF ===
${JSON.stringify(dataPayload.extended_formula_brief, null, 2)}

=== CATEGORY ANALYSIS ===
${JSON.stringify(dataPayload.category_analysis, null, 2)}

=== MARKET TREND ANALYSIS (FULL) ===
${JSON.stringify(dataPayload.market_trend_analysis, null, 2)}

Now provide your brutally honest analysis. Remember: the user wants to know if their formula will compete or fail. Reference specific data points. If there are major gaps, say so clearly.`;

    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${xaiApiKey}`,
      },
      body: JSON.stringify({
        model: "grok-3-fast",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.3,
        max_tokens: 8000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[analyze-formula-fit] Grok API error:", errorText);
      throw new Error(`Grok API error: ${response.status} - ${errorText}`);
    }

    const grokResponse = await response.json();
    const content = grokResponse.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No content in Grok response");
    }

    console.log(`[analyze-formula-fit] Grok response received, parsing JSON...`);

    // Extract JSON from the response (handle markdown code blocks)
    let jsonContent = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonContent = jsonMatch[1].trim();
    }

    const analysisResult: FormulaFitAnalysis = JSON.parse(jsonContent);

    // Update the analysis record with results
    await supabase
      .from("formula_fit_analyses")
      .update({
        status: "completed",
        analysis: analysisResult,
      })
      .eq("id", analysisId);

    console.log(`[analyze-formula-fit] Analysis completed successfully for: ${analysisId}`);

  } catch (error) {
    console.error("[analyze-formula-fit] Background analysis error:", error);

    // Update record with error
    await supabase
      .from("formula_fit_analyses")
      .update({
        status: "error",
        error: error.message || "Unknown error occurred",
      })
      .eq("id", analysisId);
  }
}
