import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { getCorsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  // Get CORS headers based on origin
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ingredients } = await req.json();

    if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
      return new Response(
        JSON.stringify({ error: "No ingredients provided" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    // Prepare ingredients text for AI processing
    const ingredientsText = ingredients
      .map((ing, idx) => `Meal ${idx + 1}: ${ing}`)
      .join('\n');

    const systemPrompt = `You are a grocery list assistant. Given ingredients from multiple meals, you need to:

1. Parse each ingredient to identify: item name, quantity, and unit
2. Consolidate duplicate items (e.g., "2 tomatoes" + "3 tomatoes" = "5 tomatoes")
3. If quantities cannot be consolidated (different units or unclear), list them separately
4. Categorize items into these categories ONLY:
   - Produce (fruits, vegetables)
   - Proteins (meat, fish, eggs, tofu)
   - Dairy (milk, cheese, yogurt)
   - Grains (rice, bread, pasta, cereals)
   - Spices & Seasonings
   - Pantry (oils, sauces, canned goods)
   - Other

5. Return ONLY a valid JSON object with this exact structure:
{
  "categories": [
    {
      "name": "Category Name",
      "items": [
        { "name": "Item name", "quantity": "5", "unit": "pieces" }
      ]
    }
  ]
}

IMPORTANT:
- Keep quantities practical for shopping
- Use common units (g, kg, ml, L, pieces, cups, tbsp, tsp)
- If an ingredient doesn't specify quantity, use "as needed"
- Be smart about consolidation (don't combine if units are incompatible)
- Return ONLY the JSON, no additional text or markdown`;

    const userPrompt = `Parse and organize these ingredients into a consolidated grocery list:\n\n${ingredientsText}`;

    console.log("Calling OpenAI with", ingredients.length, "ingredient sets");

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI error:', response.status, errorText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI usage limit reached. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      throw new Error(`AI request failed: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content;

    if (!aiResponse) {
      throw new Error('No response from AI');
    }

    console.log("Raw AI response:", aiResponse);

    // Parse the AI response (remove markdown code blocks if present)
    let groceryList;
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : aiResponse;
      groceryList = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error("Failed to parse AI response:", aiResponse);
      throw new Error('Failed to parse AI response as JSON');
    }

    console.log("Successfully generated grocery list with", groceryList.categories?.length || 0, "categories");

    return new Response(
      JSON.stringify(groceryList),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in generate-grocery-list:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
