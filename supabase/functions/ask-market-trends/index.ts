import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface RequestBody {
  categoryId: string;
  question: string;
  conversationHistory: Message[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { categoryId, question, conversationHistory } = await req.json() as RequestBody;

    if (!categoryId || !question) {
      return new Response(
        JSON.stringify({ error: "categoryId and question are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const XAI_API_KEY = Deno.env.get("XAI_API_KEY");
    if (!XAI_API_KEY) {
      console.error("XAI_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the market trend analysis from database
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: analysisData, error: dbError } = await supabase
      .from("market_trend_analyses")
      .select("analysis, category_name, product_type, updated_at")
      .eq("category_id", categoryId)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (dbError || !analysisData) {
      console.error("Failed to fetch analysis:", dbError);
      return new Response(
        JSON.stringify({ error: "No analysis found for this category" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build the context from the analysis
    const analysisContext = JSON.stringify(analysisData.analysis, null, 2);

    const systemPrompt = `You are an expert market analyst AI assistant. You have access to a comprehensive market trend analysis for "${analysisData.category_name}" (product type: ${analysisData.product_type || 'supplements'}).

Your role is to answer questions about this analysis clearly and accurately. Use the data provided to give specific, actionable insights.

## Analysis Data:
${analysisContext}

## Guidelines:
- Be specific and reference data points from the analysis when available
- If asked about something not in the analysis, say so clearly
- Keep responses concise but informative
- Use bullet points and formatting for readability
- When discussing trends or opportunities, tie them back to the data
- If the user asks for recommendations, base them on the analysis findings`;

    // Build messages array
    const messages = [
      { role: "system", content: systemPrompt },
      ...conversationHistory.map(msg => ({ role: msg.role, content: msg.content })),
      { role: "user", content: question }
    ];

    console.log(`Asking question about category ${categoryId}: "${question.substring(0, 50)}..."`);

    // Call Grok API with streaming
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${XAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-3-latest",
        messages,
        stream: true,
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Grok API error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "AI service error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Return the streaming response
    return new Response(response.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });

  } catch (error) {
    console.error("Error in ask-market-trends:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
