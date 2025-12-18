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
    const { categoryId, userMessage, conversationHistory, currentFormula } = await req.json();

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

    // Build conversation messages for Claude
    const systemPrompt = `You are a Formula Development Specialist helping to modify and improve product formulations. You have access to the complete formula brief document below.

CURRENT FORMULA BRIEF:
${currentFormula}

Your role:
1. Understand the user's requests about modifying the formula
2. Provide expert recommendations based on:
   - Scientific/clinical evidence
   - Market positioning and competitive analysis
   - Cost implications
   - Regulatory considerations
3. When the user confirms they want to apply changes, generate a COMPLETE updated formula brief markdown document

IMPORTANT RULES:
- Always explain your reasoning
- Consider interactions between ingredients
- Maintain the overall structure and formatting of the formula brief
- When generating a new formula version, output the COMPLETE markdown document, not just the changes
- Be conversational but professional

When the user wants to apply changes, respond with a JSON block at the end of your message in this exact format:
\`\`\`json
{
  "ready_to_apply": true,
  "change_summary": "Brief summary of what changed",
  "new_formula_content": "The COMPLETE updated markdown content"
}
\`\`\`

If you're still discussing and not ready to apply, don't include this JSON block.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...(conversationHistory || []).map((msg: Message) => ({
        role: msg.role,
        content: msg.content
      })),
      { role: 'user', content: userMessage }
    ];

    console.log('Calling OpenRouter with Claude Sonnet 4.5...');

    // Call OpenRouter with Claude Sonnet 4.5 - streaming
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
        stream: true,
        max_tokens: 16000
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenRouter error:', response.status, errorText);
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    // Return streaming response
    return new Response(response.body, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });

  } catch (error) {
    console.error('Error in modify-formula:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
