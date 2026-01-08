import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sourceImageUrl, editPrompt } = await req.json();
    
    if (!sourceImageUrl) {
      return new Response(
        JSON.stringify({ error: 'sourceImageUrl is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (!editPrompt) {
      return new Response(
        JSON.stringify({ error: 'editPrompt is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
    if (!OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY is not configured');
    }

    console.log('Editing mockup with prompt:', editPrompt);
    console.log('Source image URL length:', sourceImageUrl.length);

    // Call OpenRouter API with Gemini for image editing
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://lovable.dev',
        'X-Title': 'Product Mockup Editor'
      },
      body: JSON.stringify({
        model: 'google/gemini-3-pro-image-preview',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `You are editing a product packaging mockup image. Apply the following edit to the image while preserving the overall product design, text, and branding elements as much as possible. Keep it professional and product-ready.

Edit instruction: ${editPrompt}

Important:
- Maintain the product container shape and type
- Keep text legible and positioned correctly
- Preserve brand colors unless specifically asked to change them
- Make the edit look natural and professional`
              },
              {
                type: 'image_url',
                image_url: {
                  url: sourceImageUrl
                }
              }
            ]
          }
        ],
        max_tokens: 4096
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenRouter API error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'API credits exhausted. Please add credits to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('OpenRouter response received');

    // Extract the edited image from the response (matching generate-product-mockup logic)
    let editedImageUrl = null;

    if (data.choices?.[0]?.message?.images?.[0]?.image_url?.url) {
      editedImageUrl = data.choices[0].message.images[0].image_url.url;
    } else if (data.choices?.[0]?.message?.content) {
      const content = data.choices[0].message.content;
      if (Array.isArray(content)) {
        for (const item of content) {
          if (item.type === 'image_url' && item.image_url?.url) {
            editedImageUrl = item.image_url.url;
            break;
          }
        }
      }
    }
    
    if (!editedImageUrl) {
      console.error('No image in response:', JSON.stringify(data, null, 2));
      throw new Error('No edited image returned from AI');
    }

    console.log('Edited image generated successfully');

    return new Response(
      JSON.stringify({ 
        editedImageUrl,
        message: 'Mockup edited successfully'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Edit mockup error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to edit mockup' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
