import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.86.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

// Fetch with timeout helper
async function fetchWithTimeout(
  url: string, 
  options: RequestInit, 
  timeoutMs: number = 240000
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    console.log(`[fetchWithTimeout] Aborting request after ${timeoutMs}ms`);
    controller.abort();
  }, timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

// Background task to process formula generation with retry logic
async function processGenerationTask(
  taskId: string,
  supabaseUrl: string,
  supabaseKey: string,
  messages: Array<{ role: string; content: string }>,
  originalLength: number // Length of original formula for validation
) {
  console.log(`[Background Task] Starting generation for task: ${taskId}`);
  
  const MAX_RETRIES = 3;
  const TIMEOUT_MS = 240000; // 4 minutes
  
  // Create a new client for the background task
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  // Update status to processing
  await supabase
    .from('formula_generation_tasks')
    .update({ status: 'processing', updated_at: new Date().toISOString() } as Record<string, unknown>)
    .eq('id', taskId);

  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[Background Task] Attempt ${attempt}/${MAX_RETRIES} for task: ${taskId}`);

      // Call OpenRouter with timeout
      const response = await fetchWithTimeout(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://lovable.dev',
            'X-Title': 'Noodle Search Formula Modifier'
          },
          body: JSON.stringify({
            model: 'anthropic/claude-sonnet-4-6',
            messages,
            stream: false,
            max_tokens: 64000
          })
        },
        TIMEOUT_MS
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Background Task] OpenRouter error: ${response.status}`, errorText);
        throw new Error(`OpenRouter API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      
      console.log(`[Background Task] Generation complete, content length: ${content.length}`);

      // Validate output length - warn if too short
      const minExpectedLength = Math.floor(originalLength * 0.85);
      if (content.length < minExpectedLength && originalLength > 0) {
        console.warn(`[Background Task] OUTPUT TOO SHORT! Generated: ${content.length} chars, Expected min: ${minExpectedLength} chars (85% of original ${originalLength})`);
        console.warn(`[Background Task] Ratio: ${Math.round((content.length / originalLength) * 100)}% of original length`);
      } else {
        console.log(`[Background Task] Length validation passed: ${content.length} >= ${minExpectedLength} (${Math.round((content.length / originalLength) * 100)}% of original)`);
      }

      // Update task with result
      await supabase
        .from('formula_generation_tasks')
        .update({ 
          status: 'completed', 
          result: { content, originalLength, generatedLength: content.length },
          updated_at: new Date().toISOString()
        } as Record<string, unknown>)
        .eq('id', taskId);

      console.log(`[Background Task] Task ${taskId} completed successfully`);
      return; // Success - exit function

    } catch (error) {
      lastError = error as Error;
      console.error(`[Background Task] Attempt ${attempt} failed for task ${taskId}:`, error);
      
      if (attempt < MAX_RETRIES) {
        const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s exponential backoff
        console.log(`[Background Task] Waiting ${delay}ms before retry...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  
  // All retries failed
  console.error(`[Background Task] All ${MAX_RETRIES} attempts failed for task ${taskId}`);
  await supabase
    .from('formula_generation_tasks')
    .update({ 
      status: 'failed', 
      error: `Failed after ${MAX_RETRIES} attempts: ${lastError?.message || 'Unknown error'}`,
      updated_at: new Date().toISOString()
    } as Record<string, unknown>)
    .eq('id', taskId);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { categoryId, userMessage, conversationHistory, currentFormula, generateFormula } = await req.json();

    if (!categoryId || !userMessage) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: categoryId, userMessage' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY is not configured');
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Fetch competitor ingredient analysis data
    console.log('Fetching ingredient analysis for category:', categoryId);
    const { data: ingredientAnalysis, error: ingredientError } = await supabase
      .from('ingredient_analyses')
      .select('analysis, type')
      .eq('category_id', categoryId);

    if (ingredientError) {
      console.error('Error fetching ingredient analysis:', ingredientError);
    }

    // Build competitor context from ingredient analysis
    let competitorContext = '';
    if (ingredientAnalysis && ingredientAnalysis.length > 0) {
      competitorContext = '\n\n=== COMPETITOR INGREDIENT INTELLIGENCE ===\n';
      
      for (const analysis of ingredientAnalysis) {
        const data = analysis.analysis as Record<string, unknown>;
        const analysisType = analysis.type === 'new_winners' ? 'NEW WINNERS (Fast-Growing Products)' : 'TOP PERFORMERS (Best Sellers)';
        
        competitorContext += `\n### ${analysisType}:\n`;
        
        // Extract key ingredient data
        if (data?.ingredients && Array.isArray(data.ingredients)) {
          competitorContext += '\n**Key Ingredients Found in Competitors:**\n';
          for (const ing of data.ingredients.slice(0, 15)) {
            const ingredient = ing as Record<string, unknown>;
            const name = ingredient.name || ingredient.ingredient || 'Unknown';
            const prevalence = ingredient.prevalence || ingredient.frequency || '';
            const avgDosage = ingredient.avg_dosage || ingredient.dosage || '';
            const trend = ingredient.trend || '';
            competitorContext += `- ${name}${prevalence ? ` (${prevalence}% of products)` : ''}${avgDosage ? ` - typical dose: ${avgDosage}` : ''}${trend ? ` - trend: ${trend}` : ''}\n`;
          }
        }
        
        // Extract summary insights
        if (data?.summary) {
          competitorContext += `\n**Summary:** ${data.summary}\n`;
        }
        
        // Extract actionable insights
        if (data?.actionable_insights && Array.isArray(data.actionable_insights)) {
          competitorContext += '\n**Key Insights:**\n';
          for (const insight of data.actionable_insights.slice(0, 5)) {
            const insightObj = insight as Record<string, unknown>;
            const text = insightObj.insight || insightObj.text || insightObj.recommendation || String(insight);
            if (typeof text === 'string') {
              competitorContext += `- ${text}\n`;
            }
          }
        }
        
        // Extract competitor details if available
        if (data?.competitor_details && Array.isArray(data.competitor_details)) {
          competitorContext += '\n**Top Competitor Formulations:**\n';
          for (const comp of data.competitor_details.slice(0, 5)) {
            const competitor = comp as Record<string, unknown>;
            const brand = competitor.brand || competitor.name || 'Unknown Brand';
            const keyIngredients = competitor.key_ingredients || competitor.ingredients;
            if (keyIngredients) {
              competitorContext += `- ${brand}: ${Array.isArray(keyIngredients) ? keyIngredients.join(', ') : keyIngredients}\n`;
            }
          }
        }
      }
      
      competitorContext += '\n=== END COMPETITOR INTELLIGENCE ===\n';
      console.log('Added competitor context, length:', competitorContext.length);
    } else {
      console.log('No ingredient analysis data found for category');
    }

    // Fetch P12 compliance template + recommended flavors as locked reference
    let p12Reference = '';
    let p12TemplateContent = '';
    let recommendedFlavorsBlock = '';
    {
      const { data: briefRow } = await supabase
        .from('formula_briefs')
        .select('ingredients')
        .eq('category_id', categoryId)
        .limit(1)
        .maybeSingle();

      if (briefRow?.ingredients && typeof briefRow.ingredients === 'object') {
        const ing = briefRow.ingredients as Record<string, unknown>;
        const p12Content = ing.final_formula_brief || ing.adjusted_formula;
        if (typeof p12Content === 'string' && p12Content.trim()) {
          p12TemplateContent = p12Content.trim();
          p12Reference += `\n\n=== P12 COMPLIANCE TEMPLATE (LOCKED FORMAT + FLAVOR SOURCE OF TRUTH) ===\nYou MUST preserve the same section order, heading hierarchy, table structure, and flavor/variant coverage as this template.\n---BEGIN P12 TEMPLATE---\n${p12Content}\n---END P12 TEMPLATE---\n`;
        }

        const flavorRecs = ing.flavor_recommendations;
        if (Array.isArray(flavorRecs) && flavorRecs.length > 0) {
          const flavorLines = flavorRecs.map((f: Record<string, unknown>, i: number) => {
            const name = String(f.flavor_name || 'Unknown').replace(/^\w/, (c: string) => c.toUpperCase());
            const confidence = f.confidence ?? 'N/A';
            const evidence = f.evidence as Record<string, unknown> | undefined;
            const presence = evidence?.competitor_presence ?? '';
            return `${i + 1}. **${name}** — Confidence: ${confidence}%${presence ? `, Competitor presence: ${presence}` : ''}`;
          });
          recommendedFlavorsBlock = flavorLines.join('\n');
          p12Reference += `\n=== MARKET-ANALYZED RECOMMENDED FLAVORS (MUST be included in output) ===\n${recommendedFlavorsBlock}\n=== END RECOMMENDED FLAVORS ===\n`;
        }
      }
      console.log('P12 reference length:', p12Reference.length);
      console.log('P12 template content length:', p12TemplateContent.length);
      console.log('Recommended flavors block:', recommendedFlavorsBlock ? 'present' : 'none');
    }

    // Different system prompts based on mode
    let systemPrompt: string;

    // Build a summary of conversation for context
    const conversationSummary = (conversationHistory || []).length > 0 
      ? `\n\nCONVERSATION CONTEXT: There are ${conversationHistory.length} previous messages in this conversation. You MUST maintain awareness of ALL previous discussions and changes mentioned.`
      : '';

    // Calculate original document length for reference
    const originalLength = currentFormula ? currentFormula.length : 0;
    const originalWordCount = currentFormula ? currentFormula.split(/\s+/).length : 0;

    if (generateFormula) {
      // GENERATION MODE: Output JSON with complete new formula
      systemPrompt = `You are a Formula Development Specialist generating an updated formula brief document.

=== TWO-DOCUMENT MERGE APPROACH ===
You have TWO source documents. Your job is to merge them into one complete output:

1. **P12 COMPLIANCE TEMPLATE** — This is the STRUCTURAL AUTHORITY. Use its exact section order, heading hierarchy, table structures, and flavor/variant coverage as the skeleton.
2. **CURRENT ACTIVE FORMULA** — This contains the latest business content (accepted changes from manufacturer feedback, ingredient tweaks, etc.). Carry forward all its substantive content.

=== P12 COMPLIANCE TEMPLATE (STRUCTURAL BASE — ${p12TemplateContent.length} chars) ===
---BEGIN P12 TEMPLATE---
${p12TemplateContent || currentFormula}
---END P12 TEMPLATE---

=== CURRENT ACTIVE FORMULA (BUSINESS CONTENT SOURCE — ${originalLength} chars) ===
---BEGIN ACTIVE FORMULA---
${currentFormula}
---END ACTIVE FORMULA---

=== MARKET-ANALYZED RECOMMENDED FLAVORS (MANDATORY — from pipeline market analysis) ===
${recommendedFlavorsBlock || 'No recommended flavors data available.'}
These flavors MUST ALL appear in the Flavor / Variant section of the output. They came from competitive market analysis and are non-negotiable.
=== END RECOMMENDED FLAVORS ===

${competitorContext}
${conversationSummary}

=== MERGE INSTRUCTIONS ===
Step 1: Use the P12 TEMPLATE as your structural skeleton — same sections, same order, same heading levels, same table formats
Step 2: For each section, use the ACTIVE FORMULA's content if it contains accepted changes or updates; otherwise use the P12 content
Step 3: Apply any new changes discussed in the conversation
Step 4: Ensure ALL recommended flavors appear in the Flavor/Variant section — restore any that are missing from the active formula
Step 5: Verify the output has the complete P12 structure with no sections dropped

=== FAILURE CONDITIONS ===
❌ Missing any section that exists in the P12 template
❌ Missing any of the recommended flavors (${recommendedFlavorsBlock ? recommendedFlavorsBlock.split('\n').length + ' flavors required' : 'check P12 template'})
❌ Output shorter than ${Math.floor(Math.max(originalLength, p12TemplateContent.length) * 0.90)} characters
❌ Sections reordered from P12 structure
❌ Tables reformatted differently from P12

=== SUCCESS CONDITIONS ===
✓ Every P12 section present in output
✓ All ${recommendedFlavorsBlock ? recommendedFlavorsBlock.split('\n').length : 5}+ recommended flavors in the Flavor section
✓ Latest accepted changes from active formula preserved
✓ Conversation changes applied
✓ Same markdown structure as P12

CHANGES TO INCORPORATE (review conversation for):
- All ingredient changes (additions, removals, dosage adjustments)
- All cost/pricing adjustments
- All packaging or formulation changes
- All targeting or positioning changes

You MUST respond with ONLY a JSON object (no markdown code blocks, no explanation):
{
  "change_summary": "List each specific change made",
  "new_formula_content": "The COMPLETE merged document with P12 structure, all flavors, and conversation changes applied"
}

CRITICAL RULES:
1. Output ONLY raw JSON - no code blocks, no explanation
2. new_formula_content MUST be the COMPLETE document
3. Use P12 structure as the skeleton, active formula content as the fill
4. ALL recommended flavors MUST appear — this is non-negotiable
5. If unsure whether to include something, INCLUDE IT`;
    } else {
      // CONVERSATION MODE: Be helpful and discuss, no JSON output
      systemPrompt = `You are a Formula Development Specialist helping to discuss and plan modifications to a product formula. You have access to the complete formula brief document AND competitive intelligence about what ingredients competitors are using.

CURRENT FORMULA BRIEF:
${currentFormula}
${p12Reference}
${competitorContext}
${conversationSummary}

YOUR ROLE:
1. Answer questions about ingredients, dosages, costs, regulatory considerations
2. Provide expert recommendations with scientific/clinical rationale
3. Discuss potential ingredient interactions and synergies
4. Help the user think through modifications before finalizing
5. Be conversational, helpful, and informative
6. Reference COMPETITOR INTELLIGENCE when relevant - tell the user what competitors are using and at what dosages

USING COMPETITOR DATA:
- When discussing ingredients, reference what competitors are using successfully
- Compare proposed changes against competitor formulations
- Highlight opportunities where the user's formula can outperform competitors
- Point out any gaps where competitors have ingredients the user doesn't
- Suggest dosages based on what's working in the market

CONVERSATION CONTINUITY - CRITICAL:
- You MUST maintain awareness of ALL previous messages in this conversation
- If the user has previously discussed changes, acknowledge them when relevant
- When discussing new changes, consider how they interact with previously discussed changes
- If helpful, briefly recap what has been discussed so far
- Keep a mental running list of all modifications discussed

RESPONSE FORMAT:
- Use markdown formatting for clarity (bullet points, bold text, headers)
- Structure your responses with clear sections when discussing multiple topics
- Keep responses comprehensive but well-organized

IMPORTANT RULES:
- Do NOT output any JSON blocks
- Do NOT try to finalize or apply changes
- The user will click "Modify Formula Now" when they're ready to generate the final formula
- If asked about multiple changes, discuss each thoughtfully while noting how they relate`;
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      ...(conversationHistory || []).map((msg: Message) => ({
        role: msg.role,
        content: msg.content
      })),
      { role: 'user', content: userMessage }
    ];

    console.log(`Calling OpenRouter - Mode: ${generateFormula ? 'GENERATION' : 'CONVERSATION'}`);

    if (generateFormula) {
      // GENERATION MODE: Use background task with polling
      console.log('[Generation] Creating background task...');
      
      // Create a task record in the database
      const { data: task, error: taskError } = await supabase
        .from('formula_generation_tasks')
        .insert({
          category_id: categoryId,
          status: 'pending',
          request_payload: {
            categoryId,
            userMessage,
            conversationHistoryLength: conversationHistory?.length || 0,
            currentFormulaLength: currentFormula?.length || 0
          }
        })
        .select()
        .single();

      if (taskError) {
        console.error('[Generation] Failed to create task:', taskError);
        throw new Error('Failed to create generation task');
      }

      console.log(`[Generation] Task created: ${task.id}`);

      // Return task ID immediately
      const immediateResponse = new Response(
        JSON.stringify({ 
          taskId: task.id, 
          status: 'processing',
          message: 'Generation started. Poll for status.'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

      // Process generation in background using EdgeRuntime.waitUntil
      // Pass original formula length for validation
      // @ts-ignore - EdgeRuntime is available in Supabase Edge Functions
      EdgeRuntime.waitUntil(processGenerationTask(task.id, SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, messages, originalLength));

      return immediateResponse;

    } else {
      // CONVERSATION MODE: Streaming response (unchanged)
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://lovable.dev',
          'X-Title': 'Noodle Search Formula Modifier'
        },
        body: JSON.stringify({
          model: 'anthropic/claude-sonnet-4-6',
          messages,
          stream: true,
          max_tokens: 16000
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('OpenRouter error:', response.status, errorText);
        throw new Error(`OpenRouter API error: ${response.status}`);
      }

      // Streaming response for conversation mode
      return new Response(response.body, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      });
    }

  } catch (error) {
    console.error('Error in modify-formula:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
