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

    console.log(`Generating diet plan card for client ${client_id}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch client data
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('*, diet_preferences(*)')
      .eq('id', client_id)
      .single();

    if (clientError) throw clientError;

    const dietPrefs = client.diet_preferences;
    const targetKcal = client.target_kcal || 1800;

    // Generate AI diet plan table using OpenAI DALL-E for image generation
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

    const prompt = `Create a professional diet plan table image for ${client_name}.

Target Calories: ${targetKcal} kcal/day
Dietary Type: ${dietPrefs?.dietary_type || 'Balanced'}
Allergies: ${dietPrefs?.allergies?.join(', ') || 'None'}
Meals per day: ${dietPrefs?.meals_per_day || 4}

Generate a clean table with columns:
- Meal Time
- Meal Name
- Portion Size
- Calories (kcal)

Include: Breakfast, Lunch, Evening Snack, Dinner
Total daily calories should equal ${targetKcal} kcal

Style: Professional table format, clean typography, wellness colors (green theme), easy to read. Include total row at bottom.`;

    // OpenAI DALL-E for image generation
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
      target_kcal: targetKcal,
      dietary_type: dietPrefs?.dietary_type,
      diet_plan_image: imageUrl,
      generated_at: new Date().toISOString()
    };

    // Save to pending review cards
    const { data: card, error: cardError } = await supabase
      .from('pending_review_cards')
      .insert({
        client_id: client_id,
        card_type: 'diet_plan',
        generated_content: cardData,
        workflow_stage: 'diet_plan_generated',
        status: 'pending'
      })
      .select()
      .single();

    if (cardError) throw cardError;

    console.log(`Diet plan card generated for client ${client_id}, card ID: ${card.id}`);

    return new Response(
      JSON.stringify({
        success: true,
        card_id: card.id,
        message: 'Diet plan card generated and pending admin review'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-diet-plan-card:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
