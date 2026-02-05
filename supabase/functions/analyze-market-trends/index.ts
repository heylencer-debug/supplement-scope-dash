import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

// Declare EdgeRuntime for Deno environment
declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MarketTrendAnalysis {
  sections: {
    marketOverview: {
      globalMarketSize: string;
      usMarketSize: string;
      growthDrivers: string[];
      amazonContext: string;
    };
    keyMarketTrends: {
      trends: Array<{
        trendName: string;
        description: string;
        statistics?: string;
      }>;
    };
    topProducts: {
      products: Array<{
        rank: number;
        brandProductName: string;
        priceUsd: number;
        averageRating: number;
        numberOfReviews: number;
        keyFeatures: string;
        notableTrendsFromReviews: string;
      }>;
      summaryInsights: string;
    };
    competitiveLandscape: {
      brandRankings: Array<{
        brandName: string;
        amazonRevenue: number;
        yoyChange: number;
        strengths: string;
      }>;
      marketShareInsights: string;
    };
    consumerInsights: {
      useCases: string[];
      praisesComplaints: string;
      preferredAttributes: string[];
      emergingBehaviors: string;
    };
    futureOutlook: {
      projectedCagr: string;
      timeframe: string;
      growthRegions: string[];
      innovations: string;
      opportunities: string;
      externalFactors: string;
    };
  };
  citations: Array<{ url: string; title: string }>;
  generatedAt: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const xaiApiKey = Deno.env.get('XAI_API_KEY');

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { categoryId: inputCategoryId, categoryName, productType } = await req.json();

    if (!categoryName) {
      return new Response(
        JSON.stringify({ error: 'categoryName is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!xaiApiKey) {
      return new Response(
        JSON.stringify({ error: 'XAI_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[analyze-market-trends] Starting analysis for: ${categoryName}`);

    // If categoryId not provided, look it up by name
    let categoryId = inputCategoryId;
    if (!categoryId) {
      // Try to find category by name - wait a bit for n8n to create it if needed
      for (let attempt = 0; attempt < 6; attempt++) {
        const { data: category } = await supabase
          .from('categories')
          .select('id')
          .eq('name', categoryName)
          .maybeSingle();
        
        if (category?.id) {
          categoryId = category.id;
          console.log(`[analyze-market-trends] Found category ID: ${categoryId}`);
          break;
        }
        
        // Wait 5 seconds before retrying
        if (attempt < 5) {
          console.log(`[analyze-market-trends] Category not found, waiting... (attempt ${attempt + 1})`);
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
      
      if (!categoryId) {
        console.log('[analyze-market-trends] Category not found after retries, proceeding without category_id');
        // We'll still run the analysis but won't be able to link it to a category
        return new Response(
          JSON.stringify({ error: 'Category not found. Analysis will run once category is created.' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Insert initial pending record
    const { data: insertedRecord, error: insertError } = await supabase
      .from('market_trend_analyses')
      .insert({
        category_id: categoryId,
        category_name: categoryName,
        product_type: productType || null,
        status: 'pending',
        analysis: null,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('[analyze-market-trends] Insert error:', insertError);
      throw new Error(`Failed to create analysis record: ${insertError.message}`);
    }

    const recordId = insertedRecord.id;
    console.log(`[analyze-market-trends] Created record: ${recordId}`);

    // Start background task
    const backgroundTask = async () => {
      try {
        // Update to processing
        await supabase
          .from('market_trend_analyses')
          .update({ status: 'processing' })
          .eq('id', recordId);

        const systemPrompt = `You are a market research analyst specializing in Amazon product categories. Provide comprehensive, data-driven market trend analysis with citations where possible. Always respond with valid JSON matching the exact structure requested.`;

        const userPrompt = `Provide a comprehensive market trend analysis for Amazon "${categoryName}" products${productType ? ` (specifically ${productType} form)` : ''}.

Return your analysis as a JSON object with this exact structure:
{
  "sections": {
    "marketOverview": {
      "globalMarketSize": "Global market value and forecast (e.g., 'USD X billion in 2024, projected to USD Y billion by 2030')",
      "usMarketSize": "U.S.-specific market value with CAGR",
      "growthDrivers": ["List of 3-5 key growth drivers"],
      "amazonContext": "Amazon-specific insights including subcategory performance and trends"
    },
    "keyMarketTrends": {
      "trends": [
        {
          "trendName": "Name of trend",
          "description": "Detailed description of the trend",
          "statistics": "Optional relevant statistics"
        }
      ]
    },
    "topProducts": {
      "products": [
        {
          "rank": 1,
          "brandProductName": "Brand - Product Name",
          "priceUsd": 29.99,
          "averageRating": 4.5,
          "numberOfReviews": 15000,
          "keyFeatures": "Main features/benefits",
          "notableTrendsFromReviews": "Key themes from customer reviews"
        }
      ],
      "summaryInsights": "Price range analysis, dominant features, and market observations"
    },
    "competitiveLandscape": {
      "brandRankings": [
        {
          "brandName": "Brand Name",
          "amazonRevenue": 50.0,
          "yoyChange": 15.5,
          "strengths": "Key competitive advantages"
        }
      ],
      "marketShareInsights": "Analysis of market leaders vs challengers"
    },
    "consumerInsights": {
      "useCases": ["Primary use case 1", "Primary use case 2"],
      "praisesComplaints": "Summary of common praises and complaints",
      "preferredAttributes": ["Attribute 1", "Attribute 2", "Attribute 3"],
      "emergingBehaviors": "New consumer patterns and behaviors"
    },
    "futureOutlook": {
      "projectedCagr": "Projected CAGR percentage",
      "timeframe": "e.g., 2024-2030",
      "growthRegions": ["Region 1", "Region 2"],
      "innovations": "Emerging products and packaging innovations",
      "opportunities": "Key opportunities for sellers/brands",
      "externalFactors": "External influences like regulations, climate, trends"
    }
  },
  "citations": [
    {"url": "https://example.com", "title": "Source Title"}
  ],
  "generatedAt": "${new Date().toISOString()}"
}

Include 5-10 top products, 4-6 key trends, and 5-8 brand rankings. Be specific with numbers and data where possible. Use realistic market data and trends. Ensure all arrays have at least the minimum required items.`;

        console.log(`[analyze-market-trends] Calling Grok API...`);

        const grokResponse = await fetch('https://api.x.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${xaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'grok-2-1212',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            temperature: 0.7,
            max_tokens: 8000,
          }),
        });

        if (!grokResponse.ok) {
          const errorText = await grokResponse.text();
          console.error(`[analyze-market-trends] Grok API error: ${grokResponse.status} - ${errorText}`);
          
          // Parse specific error messages
          let errorMessage = `Grok API error: ${grokResponse.status}`;
          try {
            const errorJson = JSON.parse(errorText);
            if (grokResponse.status === 404) {
              if (errorJson.error?.includes('does not exist') || errorJson.error?.includes('not have access')) {
                errorMessage = `Model not available: The requested Grok model is not accessible with your API key. Please check your xAI account permissions or try a different model.`;
              } else {
                errorMessage = `Resource not found: ${errorJson.error || errorJson.message || 'Unknown resource'}`;
              }
            } else if (grokResponse.status === 401) {
              errorMessage = `Authentication failed: Your XAI_API_KEY is invalid or expired. Please update your API key in Supabase secrets.`;
            } else if (grokResponse.status === 403) {
              errorMessage = `Access denied: Your API key doesn't have permission to access this resource.`;
            } else if (grokResponse.status === 429) {
              errorMessage = `Rate limit exceeded: Too many requests to the Grok API. Please wait a moment and try again.`;
            } else if (grokResponse.status === 402) {
              errorMessage = `Payment required: Your xAI account may need additional credits or an active subscription.`;
            } else if (grokResponse.status >= 500) {
              errorMessage = `Grok API server error: The xAI service is temporarily unavailable. Please try again later.`;
            } else if (errorJson.error) {
              errorMessage = `Grok API error: ${errorJson.error}`;
            }
          } catch {
            // Keep the default error message if parsing fails
          }
          
          await supabase
            .from('market_trend_analyses')
            .update({
              status: 'error',
              error: errorMessage,
            })
            .eq('id', recordId);
          return;
        }

        const grokData = await grokResponse.json();
        console.log(`[analyze-market-trends] Grok API response received`);

        const content = grokData.choices?.[0]?.message?.content;
        if (!content) {
          throw new Error('No content in Grok response');
        }

        // Parse JSON from response (handle markdown code blocks)
        let analysisJson: MarketTrendAnalysis;
        try {
          // Remove markdown code blocks if present
          let cleanContent = content.trim();
          if (cleanContent.startsWith('```json')) {
            cleanContent = cleanContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
          } else if (cleanContent.startsWith('```')) {
            cleanContent = cleanContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
          }
          analysisJson = JSON.parse(cleanContent);
        } catch (parseError) {
          console.error('[analyze-market-trends] JSON parse error:', parseError);
          console.error('[analyze-market-trends] Raw content:', content.substring(0, 500));
          throw new Error('Failed to parse Grok response as JSON');
        }

        // Update with completed analysis
        const { error: updateError } = await supabase
          .from('market_trend_analyses')
          .update({
            status: 'completed',
            analysis: analysisJson,
            updated_at: new Date().toISOString(),
          })
          .eq('id', recordId);

        if (updateError) {
          console.error('[analyze-market-trends] Update error:', updateError);
        } else {
          console.log(`[analyze-market-trends] Analysis completed for: ${categoryName}`);
        }

      } catch (bgError) {
        console.error('[analyze-market-trends] Background task error:', bgError);
        await supabase
          .from('market_trend_analyses')
          .update({
            status: 'error',
            error: bgError instanceof Error ? bgError.message : 'Unknown error',
          })
          .eq('id', recordId);
      }
    };

    // Use waitUntil for background processing
    EdgeRuntime.waitUntil(backgroundTask());

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Analysis started',
        recordId 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[analyze-market-trends] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
