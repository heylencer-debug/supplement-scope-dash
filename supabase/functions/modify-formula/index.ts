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
          p12Reference += `\n\n=== P12 COMPLIANCE TEMPLATE (LOCKED FORMAT + FLAVOR SOURCE OF TRUTH) ===\nYou MUST preserve the same section order, heading hierarchy, table structure, and flavor/variant coverage as this template.\n---BEGIN P12 TEMPLATE---\n${p12Content}\n---END P12 TEMPLATE---\n`;
        }

        const flavorRecs = ing.flavor_recommendations;
        if (Array.isArray(flavorRecs) && flavorRecs.length > 0) {
          const flavorLines = flavorRecs.map((f: Record<string, unknown>, i: number) => {
            const name = String(f.flavor_name || 'Unknown').replace(/^\w/, (c: string) => c.toUpperCase());
            const confidence = f.confidence ?? 'N/A';
            return `${i + 1}. ${name} (Confidence: ${confidence}%)`;
          });
          p12Reference += `\n=== MARKET-ANALYZED RECOMMENDED FLAVORS (MUST be included in output) ===\n${flavorLines.join('\n')}\n=== END RECOMMENDED FLAVORS ===\n`;
        }
      }
      console.log('P12 reference length:', p12Reference.length);
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
      systemPrompt = `You are a Formula Development Specialist performing a SURGICAL EDIT operation on a formula brief document.

=== ABSOLUTE RULE: THIS IS A COPY-THEN-PATCH OPERATION ===
You will COPY the ENTIRE original document, then ONLY change the specific sentences/paragraphs related to the conversation.
This is NOT a rewrite. This is NOT a summarization. You are a TEXT EDITOR performing find-and-replace.

CURRENT FORMULA BRIEF (ORIGINAL DOCUMENT - ${originalLength} characters, ~${originalWordCount} words):
---BEGIN ORIGINAL DOCUMENT---
${currentFormula}
---END ORIGINAL DOCUMENT---
${p12Reference}
${competitorContext}
${conversationSummary}

=== MANDATORY APPROACH: COPY-PASTE FIRST ===
Step 1: Start by mentally copying the ENTIRE original document above (all ${originalLength} characters)
Step 2: Identify ONLY the specific sentences/paragraphs that relate to changes discussed in conversation
Step 3: Replace ONLY those specific sentences/paragraphs with updated versions
Step 4: Everything else remains EXACTLY as it was - character for character

=== FAILURE CONDITIONS (Your output will be REJECTED if): ===
❌ Output is less than ${Math.floor(originalLength * 0.90)} characters (must be ≥90% of ${originalLength})
❌ Any section is summarized or condensed
❌ Any unchanged section is rewritten in different words
❌ Any bullet points, examples, or details are removed
❌ The document structure or section order is changed

=== SUCCESS CONDITIONS: ===
✓ Output is ${originalLength}+ characters (same length or longer than original)
✓ Unchanged sections are IDENTICAL to original (copy-pasted verbatim)
✓ Only the discussed changes are modified
✓ All original formatting, bullet points, and structure preserved

CRITICAL TASK: Review the ENTIRE conversation history and identify EVERY change discussed. Then:
1. COPY the entire original document
2. PATCH only the specific parts that need to change
3. The result should be the same document with surgical edits

Use the COMPETITOR INGREDIENT INTELLIGENCE to:
- Validate suggested ingredient choices against what's working for competitors
- Ensure dosages are competitive with successful products

CHANGES TO INCORPORATE (review conversation for):
- All ingredient changes (additions, removals, dosage adjustments)
- All cost/pricing adjustments
- All packaging or formulation changes
- All targeting or positioning changes

You MUST respond with ONLY a JSON object (no markdown code blocks, no explanation):
{
  "change_summary": "List each specific change made",
  "new_formula_content": "The COMPLETE document (${originalLength}+ chars) with surgical edits applied"
}

=== FINAL VERIFICATION BEFORE OUTPUT ===
□ Count your output length - is it at least ${Math.floor(originalLength * 0.90)} characters?
□ Did you copy unchanged sections word-for-word (not paraphrase)?
□ Did you preserve ALL bullet points, examples, and details?
□ Did you incorporate EVERY change from the conversation?
□ Is the structure and section order identical to the original?

CRITICAL RULES:
1. Output ONLY raw JSON - no code blocks, no explanation
2. new_formula_content MUST be the COMPLETE document, not just changes
3. COPY unchanged sections EXACTLY - do not rewrite them
4. Your output MUST be at least ${Math.floor(originalLength * 0.90)} characters
5. If unsure whether to include something from original, INCLUDE IT
6. **RECOMMENDED FLAVORS ARE MANDATORY**: If the P12 COMPLIANCE TEMPLATE or MARKET-ANALYZED RECOMMENDED FLAVORS section lists flavors (e.g. Strawberry, Citrus, Apple, Mixed Berry, Blackberry), ALL of them MUST appear in the Flavor section of the output. If the current formula is missing any of these flavors, RESTORE them from the P12 template. Never drop or omit recommended flavors.`;
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
