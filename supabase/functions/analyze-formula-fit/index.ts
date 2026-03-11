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

interface BrandSummary {
  product_count: number;
  avg_price: number;
  avg_rating: number;
  total_reviews: number;
  total_revenue: number;
  packaging_types: string[];
}

interface TopProduct {
  title: string;
  price: number;
  rating: number;
  reviews: number;
  monthly_revenue: number;
  supplement_facts_complete: unknown;
  all_nutrients: unknown;
  feature_bullets_text: string;
  claims_on_label: string[];
  other_ingredients: string;
  packaging_type: string;
  directions: string;
}

interface BrandData {
  summary: BrandSummary;
  top_products: TopProduct[];
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
    EdgeRuntime.waitUntil(runAnalysis(supabase as any, categoryId, newAnalysis.id, xaiApiKey));

    return new Response(
      JSON.stringify({ status: "processing", id: newAnalysis.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("[analyze-formula-fit] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/**
 * Extract brand names from market trend analysis
 */
function extractBrandNames(marketTrendAnalysis: unknown): string[] {
  const brands = new Set<string>();

  try {
    const analysis = marketTrendAnalysis as Record<string, unknown>;
    const sections = analysis?.sections as Record<string, unknown>;

    // Extract from competitiveLandscape.brandRankings
    const competitiveLandscape = sections?.competitiveLandscape as Record<string, unknown>;
    const brandRankings = competitiveLandscape?.brandRankings as Array<{ brandName?: string }>;
    if (Array.isArray(brandRankings)) {
      for (const ranking of brandRankings) {
        if (ranking.brandName) {
          brands.add(ranking.brandName.trim());
        }
      }
    }

    // Extract from topProducts.products (format: "Brand - Product Name")
    const topProducts = sections?.topProducts as Record<string, unknown>;
    const products = topProducts?.products as Array<{ brandProductName?: string }>;
    if (Array.isArray(products)) {
      for (const product of products) {
        if (product.brandProductName) {
          // Extract brand from "Brand - Product" or "Brand: Product" format
          const brandMatch = product.brandProductName.match(/^([^-:]+)[-:]/);
          if (brandMatch) {
            brands.add(brandMatch[1].trim());
          } else {
            // Try to get first 2-3 words as brand name
            const words = product.brandProductName.split(' ').slice(0, 3).join(' ');
            if (words.length > 2) {
              brands.add(words.trim());
            }
          }
        }
      }
    }

    // Also check for any other brand mentions in the analysis
    const marketLeaders = competitiveLandscape?.marketLeaders as Array<{ brand?: string; name?: string }>;
    if (Array.isArray(marketLeaders)) {
      for (const leader of marketLeaders) {
        if (leader.brand) brands.add(leader.brand.trim());
        if (leader.name) brands.add(leader.name.trim());
      }
    }

  } catch (error) {
    console.error("[analyze-formula-fit] Error extracting brand names:", error);
  }

  const brandList = Array.from(brands).filter(b => b.length > 1);
  console.log(`[analyze-formula-fit] Extracted ${brandList.length} brand names:`, brandList);
  return brandList;
}

/**
 * Fetch and aggregate product data for mentioned brands
 */
async function fetchBrandProductData(
  supabase: ReturnType<typeof createClient>,
  categoryId: string,
  brandNames: string[]
): Promise<Record<string, BrandData>> {
  if (brandNames.length === 0) {
    console.log("[analyze-formula-fit] No brand names to fetch");
    return {};
  }

  console.log(`[analyze-formula-fit] Fetching product data for ${brandNames.length} brands`);

  // Fetch products for the mentioned brands
  // Use ilike for case-insensitive matching
  const { data: products, error } = await supabase
    .from("products")
    .select(`
      brand,
      title,
      price,
      rating,
      reviews,
      monthly_revenue,
      supplement_facts_complete,
      all_nutrients,
      feature_bullets_text,
      claims_on_label,
      other_ingredients,
      packaging_type,
      directions
    `)
    .eq("category_id", categoryId)
    .order("monthly_revenue", { ascending: false, nullsFirst: false });

  if (error) {
    console.error("[analyze-formula-fit] Error fetching products:", error);
    return {};
  }

  if (!products || products.length === 0) {
    console.log("[analyze-formula-fit] No products found for category");
    return {};
  }

  console.log(`[analyze-formula-fit] Found ${products.length} total products in category`);

  // Filter products that match our brand names (case-insensitive)
  const lowerBrandNames = brandNames.map(b => b.toLowerCase());
  const matchingProducts = products.filter(p => {
    if (!p.brand) return false;
    const productBrand = String(p.brand).toLowerCase();
    return lowerBrandNames.some(b => 
      productBrand.includes(b) || b.includes(productBrand)
    );
  });

  console.log(`[analyze-formula-fit] Found ${matchingProducts.length} products matching mentioned brands`);

  // Group products by brand
  const brandMap: Record<string, typeof products> = {};
  for (const product of matchingProducts) {
    const brand = String(product.brand || "Unknown");
    if (!brandMap[brand]) {
      brandMap[brand] = [];
    }
    brandMap[brand].push(product);
  }

  // Build the brand data structure
  const topBrandsData: Record<string, BrandData> = {};

  for (const [brand, brandProducts] of Object.entries(brandMap)) {
    // Calculate summary metrics
    const prices = brandProducts.filter(p => p.price).map(p => Number(p.price));
    const ratings = brandProducts.filter(p => p.rating).map(p => Number(p.rating));
    const revenues = brandProducts.filter(p => p.monthly_revenue).map(p => Number(p.monthly_revenue));
    const packagingTypes = [...new Set(brandProducts.filter(p => p.packaging_type).map(p => String(p.packaging_type)))] as string[];

    const summary: BrandSummary = {
      product_count: brandProducts.length,
      avg_price: prices.length > 0 ? Math.round(prices.reduce((a: number, b: number) => a + b, 0) / prices.length * 100) / 100 : 0,
      avg_rating: ratings.length > 0 ? Math.round(ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length * 100) / 100 : 0,
      total_reviews: brandProducts.reduce((sum: number, p) => sum + (Number(p.reviews) || 0), 0),
      total_revenue: revenues.reduce((a: number, b: number) => a + b, 0),
      packaging_types: packagingTypes,
    };

    // Get top 3 products by revenue (already sorted)
    const topProducts: TopProduct[] = brandProducts.slice(0, 3).map(p => ({
      title: String(p.title || ""),
      price: Number(p.price) || 0,
      rating: Number(p.rating) || 0,
      reviews: Number(p.reviews) || 0,
      monthly_revenue: Number(p.monthly_revenue) || 0,
      supplement_facts_complete: p.supplement_facts_complete,
      all_nutrients: p.all_nutrients,
      feature_bullets_text: String(p.feature_bullets_text || ""),
      claims_on_label: (p.claims_on_label as string[]) || [],
      other_ingredients: String(p.other_ingredients || ""),
      packaging_type: String(p.packaging_type || ""),
      directions: String(p.directions || ""),
    }));

    topBrandsData[brand] = {
      summary,
      top_products: topProducts,
    };
  }

  console.log(`[analyze-formula-fit] Compiled data for ${Object.keys(topBrandsData).length} brands`);
  return topBrandsData;
}

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

    // Extract brand names from market trend analysis
    const brandNames = extractBrandNames(marketTrend.analysis);

    // Fetch detailed product data for mentioned brands
    const topBrandsData = await fetchBrandProductData(supabase, categoryId, brandNames);

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
      top_brands_data: topBrandsData,
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
- DETAILED PRODUCT DATA for top brands mentioned in the market trends

CRITICAL: You now have access to ACTUAL competitor product data including:
- Real supplement facts with exact ingredient amounts and dosages
- Nutrient profiles with daily value percentages
- Marketing claims and feature bullets used by competitors
- Performance metrics (reviews, ratings, revenue)

Use this real product data to:
1. Compare the user's formula ingredients DIRECTLY against competitor formulations
2. Identify SPECIFIC dosage differences (e.g., "Liquid I.V. uses 500mg sodium per serving, your formula has 400mg")
3. Highlight claims competitors are making that the user's formula could support (or can't)
4. Reference actual competitor pricing when evaluating price positioning
5. Call out specific ingredients competitors include that the user's formula lacks
6. Provide evidence-based recommendations like "Increase sodium to 500mg to match category leaders"

Respond with a JSON object matching this exact structure:
{
  "overall_score": <number 0-100>,
  "score_label": "<'Strong contender' if 80+, 'Needs improvement' if 50-79, 'Major gaps' if <50>",
  "executive_summary": "<2-3 sentences summarizing the formula's market fit - be direct and reference specific competitor comparisons>",
  "strengths": [
    {
      "aspect": "<specific strength>",
      "explanation": "<why this matters>",
      "market_evidence": "<cite specific market data or competitor comparison>"
    }
  ],
  "weaknesses": [
    {
      "aspect": "<specific weakness>",
      "explanation": "<why this is a problem - compare to specific competitor formulations>",
      "impact": "<'high', 'medium', or 'low'>"
    }
  ],
  "trend_alignment": [
    {
      "trend_name": "<trend from market analysis>",
      "alignment_score": <0-100>,
      "notes": "<how well formula addresses this - reference competitor approaches>"
    }
  ],
  "pain_point_coverage": [
    {
      "pain_point": "<consumer pain point from market analysis>",
      "addressed": <true/false>,
      "how_addressed": "<explanation with specific ingredient references>"
    }
  ],
  "competitive_position": {
    "price_position": "<'Below market', 'At market', 'Premium', 'Super-premium' - with actual price comparisons>",
    "feature_position": "<'Basic', 'Competitive', 'Differentiated', 'Industry-leading'>",
    "summary": "<1-2 sentences on competitive stance with specific brand comparisons>"
  },
  "recommendations": [
    {
      "priority": <1-5, lower is more urgent>,
      "action": "<specific actionable recommendation - include exact dosages when relevant>",
      "effort": "<'Easy', 'Medium', or 'Hard'>",
      "expected_impact": "<what improvement to expect>"
    }
  ],
  "gaps": [
    {
      "gap": "<missing element - be specific about what competitors have>",
      "market_opportunity": "<why this gap matters and reference successful competitor approaches>"
    }
  ]
}

Provide at least 3 strengths, 3 weaknesses, 5 trend alignments, 5 pain point coverages, 5 recommendations, and 2-3 gaps. Be thorough but not repetitive. Always reference specific competitor data when available.`;

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

=== TOP BRANDS DETAILED DATA ===
${JSON.stringify(dataPayload.top_brands_data, null, 2)}

This TOP BRANDS DETAILED DATA contains ACTUAL product data from the mentioned brands including:
- Complete supplement facts with exact ingredient amounts (supplement_facts_complete)
- All nutrients with dosages and daily values (all_nutrients)
- Marketing claims and feature bullets (feature_bullets_text, claims_on_label)
- Other ingredients used (other_ingredients)
- Performance metrics (reviews, ratings, revenue)

USE THIS DATA to make SPECIFIC ingredient-by-ingredient comparisons. For example:
- "Competitor X uses 500mg of ingredient Y, your formula has 300mg"
- "Top performers all include ingredient Z which your formula lacks"
- "Your sodium level matches Liquid I.V. but is lower than LMNT's premium positioning"

Now provide your brutally honest analysis. Remember: the user wants to know if their formula will compete or fail. Reference specific data points from the competitor products. If there are major gaps, say so clearly.`;

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

    // Add the brands_analyzed metadata to the result so UI knows what was compared
    const finalResult = {
      ...analysisResult,
      brands_analyzed: topBrandsData,
    };

    // Update the analysis record with results
    await supabase
      .from("formula_fit_analyses")
      .update({
        status: "completed",
        analysis: finalResult,
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
        error: error instanceof Error ? error.message : "Unknown error occurred",
      })
      .eq("id", analysisId);
  }
}
