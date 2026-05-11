import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { getCorsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  // Get CORS headers based on origin
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { client_id, client_name } = await req.json();

    console.log(`Generating action plan card for client ${client_id}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch client data
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('*')
      .eq('id', client_id)
      .single();

    if (clientError) throw clientError;

    // Generate AI action plan using OpenAI DALL-E for image generation
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

    const prompt = `Create a visual action plan pictogram for ${client_name}'s health goals: ${client.goals || 'General wellness'}.

Generate a clean, professional Napkin AI style pictogram with 5-7 key action items. Each item should have:
- A simple icon representation
- Short actionable text (3-5 words)
- Clear visual flow from top to bottom

Focus on: nutrition, exercise, sleep, hydration, stress management.

Style: Minimalist, professional, wellness-themed colors (greens, blues), easy to understand at a glance.`;

    const aiResponse = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: prompt,
        n: 1,
        size: '1024x1024',
        quality: 'standard'
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      throw new Error(`AI generation failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const imageUrl = aiData.data?.[0]?.url;

    if (!imageUrl) {
      throw new Error('No image generated from AI');
    }

    // Structure the card data
    const cardData = {
      client_name: client_name,
      goals: client.goals,
      action_plan_image: imageUrl,
      generated_at: new Date().toISOString()
    };

    // Save to pending review cards
    const { data: card, error: cardError } = await supabase
      .from('pending_review_cards')
      .insert({
        client_id: client_id,
        card_type: 'action_plan',
        generated_content: cardData,
        workflow_stage: 'action_plan_generated',
        status: 'pending'
      })
      .select()
      .single();

    if (cardError) throw cardError;

    console.log(`Action plan card generated for client ${client_id}, card ID: ${card.id}`);

    return new Response(
      JSON.stringify({
        success: true,
        card_id: card.id,
        message: 'Action plan card generated and pending admin review'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-action-plan-card:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
