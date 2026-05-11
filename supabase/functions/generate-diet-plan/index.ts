import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { getCorsHeaders } from "../_shared/cors.ts";
serve(async (req) => {
  // Get CORS headers based on origin
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { client_id, week_number } = await req.json();
    console.log('Generating diet plan for client:', client_id, 'week:', week_number);

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch client data
    const { data: clientData, error: clientError } = await supabaseClient
      .from('clients')
      .select('target_kcal, program_type, name')
      .eq('id', client_id)
      .single();

    if (clientError || !clientData) {
      throw new Error('Client not found');
    }

    // Fetch diet preferences
    const { data: preferences, error: prefError } = await supabaseClient
      .from('diet_preferences')
      .select('*')
      .eq('client_id', client_id)
      .single();

    if (prefError || !preferences) {
      throw new Error('Diet preferences not found. Please configure preferences first.');
    }

    // Fetch available food items
    const { data: foodItems, error: foodError } = await supabaseClient
      .from('food_items')
      .select('*');

    if (foodError) throw foodError;

    // Filter food items based on diet type
    const filteredFoods = foodItems?.filter(item => {
      // Basic filtering logic - you can enhance this
      return true; // For now, include all foods
    }) || [];

    console.log(`Fetched ${filteredFoods.length} food items for meal planning`);

    // Create AI prompt with tool calling for structured output
    const userPrompt = `Create a personalized 7-day meal plan for ${clientData.name}.

**Client Requirements:**
- Dietary Type: ${preferences.dietary_type}
- Daily Calorie Target: ${preferences.calorie_target || clientData.target_kcal || 1800} kcal
- Meals Per Day: ${preferences.meals_per_day}
- Meal Timings: ${JSON.stringify(preferences.meal_timings)}
- Food Dislikes: ${Array.isArray(preferences.food_dislikes) ? preferences.food_dislikes.join(', ') : 'None'}
- Allergies: ${Array.isArray(preferences.allergies) ? preferences.allergies.join(', ') : 'None'}
- Additional Notes: ${preferences.preferences_notes || 'None'}

**Available Ingredients (sample):**
${filteredFoods.slice(0, 50).map(f => `- ${f.name}: ${f.kcal_per_serving} kcal per ${f.serving_size}${f.serving_unit}`).join('\n')}

**Requirements:**
1. Generate exactly 7 days of meals
2. Each day should have 4 meals: breakfast, lunch, evening_snack, dinner
3. Balance macros appropriately
4. Meet daily calorie targets (±100 kcal)
5. Ensure variety across days
6. Include culturally appropriate Indian meals
7. Easy to prepare recipes
8. Include specific portion sizes and ingredients
9. Respect dietary restrictions and allergies
10. Provide cooking instructions for each meal`;

    console.log('Calling OpenAI with function calling for structured meal plan...');

    // Call OpenAI with function calling for structured output
    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert nutritionist creating personalized meal plans. Generate balanced, culturally appropriate, and easy-to-prepare meals.'
          },
          { role: 'user', content: userPrompt }
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'generate_weekly_meal_plan',
            description: 'Generate a structured 7-day meal plan',
            parameters: {
              type: 'object',
              properties: {
                days: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      day_number: { type: 'integer', minimum: 1, maximum: 7 },
                      meals: {
                        type: 'object',
                        properties: {
                          breakfast: {
                            type: 'object',
                            properties: {
                              meal_name: { type: 'string' },
                              description: { type: 'string' },
                              ingredients: { type: 'string' },
                              instructions: { type: 'string' },
                              kcal: { type: 'integer' }
                            },
                            required: ['meal_name', 'description', 'kcal']
                          },
                          lunch: {
                            type: 'object',
                            properties: {
                              meal_name: { type: 'string' },
                              description: { type: 'string' },
                              ingredients: { type: 'string' },
                              instructions: { type: 'string' },
                              kcal: { type: 'integer' }
                            },
                            required: ['meal_name', 'description', 'kcal']
                          },
                          evening_snack: {
                            type: 'object',
                            properties: {
                              meal_name: { type: 'string' },
                              description: { type: 'string' },
                              ingredients: { type: 'string' },
                              instructions: { type: 'string' },
                              kcal: { type: 'integer' }
                            },
                            required: ['meal_name', 'description', 'kcal']
                          },
                          dinner: {
                            type: 'object',
                            properties: {
                              meal_name: { type: 'string' },
                              description: { type: 'string' },
                              ingredients: { type: 'string' },
                              instructions: { type: 'string' },
                              kcal: { type: 'integer' }
                            },
                            required: ['meal_name', 'description', 'kcal']
                          }
                        },
                        required: ['breakfast', 'lunch', 'evening_snack', 'dinner']
                      }
                    },
                    required: ['day_number', 'meals']
                  }
                }
              },
              required: ['days']
            }
          }
        }],
        tool_choice: { type: 'function', function: { name: 'generate_weekly_meal_plan' } }
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI generation failed:', aiResponse.status, errorText);
      throw new Error(`AI generation failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices[0].message.tool_calls?.[0];

    if (!toolCall || !toolCall.function.arguments) {
      throw new Error('No structured meal plan generated');
    }

    const mealPlan = JSON.parse(toolCall.function.arguments);
    console.log('Meal plan generated successfully');

    // Calculate start and end dates
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + ((week_number - 1) * 7));
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);

    // Calculate total kcal with explicit number conversion to prevent string concatenation
    let totalKcal = 0;
    mealPlan.days.forEach((day: any) => {
      const breakfastKcal = Number(day.meals.breakfast.kcal) || 0;
      const lunchKcal = Number(day.meals.lunch.kcal) || 0;
      const eveningSnackKcal = Number(day.meals.evening_snack.kcal) || 0;
      const dinnerKcal = Number(day.meals.dinner.kcal) || 0;

      totalKcal += breakfastKcal + lunchKcal + eveningSnackKcal + dinnerKcal;
    });

    // Insert weekly plan
    const { data: weeklyPlan, error: planError } = await supabaseClient
      .from('weekly_plans')
      .insert({
        client_id,
        week_number,
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        status: 'draft',
        total_kcal: totalKcal,
      })
      .select()
      .single();

    if (planError) {
      console.error('Error creating weekly plan:', planError);
      throw planError;
    }

    console.log('Weekly plan created:', weeklyPlan.id);

    // Prepare meal cards for batch insert
    const mealCards = [];
    const mealTypes = ['breakfast', 'lunch', 'evening_snack', 'dinner'];

    for (const day of mealPlan.days) {
      for (const mealType of mealTypes) {
        const meal = day.meals[mealType];
        mealCards.push({
          plan_id: weeklyPlan.id,
          day_number: day.day_number,
          meal_type: mealType,
          meal_name: meal.meal_name,
          description: meal.description || null,
          ingredients: meal.ingredients || null,
          instructions: meal.instructions || null,
          kcal: Number(meal.kcal) || 0,
        });
      }
    }

    // Batch insert meal cards
    const { error: cardsError } = await supabaseClient
      .from('meal_cards')
      .insert(mealCards);

    if (cardsError) {
      console.error('Error inserting meal cards:', cardsError);
      // Cleanup: delete the weekly plan if meal cards failed
      await supabaseClient.from('weekly_plans').delete().eq('id', weeklyPlan.id);
      throw cardsError;
    }

    console.log(`Inserted ${mealCards.length} meal cards`);

    return new Response(
      JSON.stringify({
        plan_id: weeklyPlan.id,
        week_number,
        total_kcal: totalKcal,
        meal_count: mealCards.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in generate-diet-plan:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: error.message.includes('429') ? 429 : error.message.includes('402') ? 402 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
