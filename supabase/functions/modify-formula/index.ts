import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.0";

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

    // Different system prompts based on mode
    let systemPrompt: string;

    if (generateFormula) {
      // GENERATION MODE: Output JSON with complete new formula
      systemPrompt = `You are a Formula Development Specialist. The user has been discussing modifications to their formula and is now ready to finalize changes.

CURRENT FORMULA BRIEF:
${currentFormula}

Your task: Review the ENTIRE conversation history and generate a COMPLETE updated formula brief that incorporates ALL the discussed changes.

You MUST respond with ONLY a JSON object in this exact format (no other text before or after):
{
  "change_summary": "Brief 1-2 sentence summary of all changes made",
  "new_formula_content": "The COMPLETE updated markdown document with all changes incorporated"
}

CRITICAL RULES:
1. Output ONLY the JSON object - no explanation, no markdown code blocks, just raw JSON
2. The new_formula_content must be the COMPLETE formula brief document, not just the changes
3. Maintain the exact same structure and formatting as the original
4. Incorporate ALL changes discussed in the conversation
5. Ensure the change_summary accurately describes what was modified`;
    } else {
      // CONVERSATION MODE: Be helpful and discuss, no JSON output
      systemPrompt = `You are a Formula Development Specialist helping to discuss and plan modifications to a product formula. You have access to the complete formula brief document below.

CURRENT FORMULA BRIEF:
${currentFormula}

Your role in this conversation:
1. Answer questions about ingredients, dosages, costs, regulatory considerations
2. Provide expert recommendations with scientific/clinical rationale
3. Discuss potential ingredient interactions and synergies
4. Help the user think through modifications before finalizing
5. Be conversational, helpful, and informative

IMPORTANT RULES:
- Do NOT output any JSON blocks
- Do NOT try to finalize or apply changes
- The user will click a separate button when they're ready to generate the final formula
- Keep responses focused and helpful
- If asked about multiple changes, discuss each thoughtfully`;
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

    // Call OpenRouter with Claude - streaming for conversation, non-streaming for generation
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://lovable.dev',
        'X-Title': 'Noodle Search Formula Modifier'
      },
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-4-20250514',
        messages,
        stream: !generateFormula, // Stream for conversation, not for generation
        max_tokens: 16000
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenRouter error:', response.status, errorText);
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    if (generateFormula) {
      // Non-streaming response for generation mode
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      
      console.log('Generation response received, length:', content.length);
      
      return new Response(JSON.stringify({ content }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } else {
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
