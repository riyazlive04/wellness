import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { getCorsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  // Get CORS headers based on origin
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { client_id, action_type } = await req.json();

    if (!client_id) {
      return new Response(
        JSON.stringify({ error: 'client_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Checking achievements for client ${client_id}, action: ${action_type}`);

    // Fetch all active achievements
    // Note: 'is_active' doesn't exist in new schema, but we'll assume they are all active or filter if needed
    // In migration 20251219000400, achievements table has no is_active.
    const { data: achievements, error: achievementsError } = await supabaseClient
      .from('achievements')
      .select('*');

    if (achievementsError) throw achievementsError;

    // Fetch client record to get user_id
    const { data: client, error: clientError } = await supabaseClient
      .from('clients')
      .select('user_id, target_kcal')
      .eq('id', client_id)
      .single();

    if (clientError) throw clientError;
    const userId = client.user_id;

    // Fetch client's current achievement records (Progress & Earned)
    const { data: existingRecords, error: recordsError } = await supabaseClient
      .from('user_achievements')
      .select('*')
      .eq('user_id', userId);

    if (recordsError) throw recordsError;

    const recordMap = new Map(existingRecords?.map(r => [r.achievement_id, r]) || []);
    const newlyEarned = [];
    const updatedProgress = [];

    // Check each achievement definition
    for (const achievement of achievements || []) {
      const existing = recordMap.get(achievement.id);
      if (existing?.is_unlocked) continue; // Already earned

      let currentValue = existing?.current_value || 0;
      let calculatedValue = 0;

      // Calculate progress based on category
      switch (achievement.category) {
        case 'meal': {
          const { count } = await supabaseClient
            .from('meal_logs')
            .select('*', { count: 'exact', head: true })
            .eq('client_id', client_id);
          calculatedValue = count || 0;
          break;
        }

        case 'water': {
          // If achievement is 'water_7_days', it might be a streak or a total
          // Based on code 'water_7_days', let's check for streak of 2000ml
          const { data: dailyLogs } = await supabaseClient
            .from('daily_logs')
            .select('log_date, water_intake')
            .eq('client_id', client_id)
            .gte('water_intake', 2000)
            .order('log_date', { ascending: false })
            .limit(30);

          calculatedValue = calculateStreak(dailyLogs?.map(d => d.log_date) || []);
          break;
        }

        case 'streak': {
          // General activity streak
          const { data: dailyLogs } = await supabaseClient
            .from('daily_logs')
            .select('log_date, activity_minutes')
            .eq('client_id', client_id)
            .gt('activity_minutes', 0)
            .order('log_date', { ascending: false })
            .limit(30);

          calculatedValue = calculateStreak(dailyLogs?.map(d => d.log_date) || []);
          break;
        }

        case 'activity': {
          // Total activity minutes
          const { data } = await supabaseClient
            .from('daily_logs')
            .select('activity_minutes')
            .eq('client_id', client_id);

          calculatedValue = data?.reduce((sum, log) => sum + (log.activity_minutes || 0), 0) || 0;
          break;
        }

        case 'assessment': {
          // Total assessments completed
          const { count } = await supabaseClient
            .from('assessments')
            .select('*', { count: 'exact', head: true })
            .eq('client_id', client_id);
          calculatedValue = count || 0;
          break;
        }
      }

      // Update if calculated value is higher
      if (calculatedValue > currentValue) {
        currentValue = calculatedValue;
        const shouldUnlock = currentValue >= achievement.target_value;

        const { data: updatedRecord, error: upsertError } = await supabaseClient
          .from('user_achievements')
          .upsert({
            user_id: userId,
            achievement_id: achievement.id,
            current_value: currentValue,
            is_unlocked: shouldUnlock,
            unlocked_at: shouldUnlock ? new Date().toISOString() : null,
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id,achievement_id' })
          .select()
          .single();

        if (upsertError) {
          console.error(`Error saving achievement ${achievement.code}:`, upsertError);
          continue;
        }

        updatedProgress.push({
          achievement_id: achievement.id,
          current_value: currentValue,
          target_value: achievement.target_value,
        });

        if (shouldUnlock) {
          newlyEarned.push({
            ...achievement,
            earned_at: updatedRecord.unlocked_at,
          });
          console.log(`Awarded achievement: ${achievement.title} to user ${userId}`);
        }
      }
    }

    return new Response(
      JSON.stringify({
        newAchievements: newlyEarned,
        updatedProgress,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in check-achievements:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Helper function to calculate consecutive day streaks
function calculateStreak(dates: string[]): number {
  if (!dates || dates.length === 0) return 0;

  const uniqueDates = [...new Set(dates.map(d => d.split('T')[0]))].sort().reverse();
  let streak = 0;
  const today = new Date().toISOString().split('T')[0];
  let expectedDate = new Date(today);

  for (const dateStr of uniqueDates) {
    const checkDate = new Date(dateStr);
    const expectedStr = expectedDate.toISOString().split('T')[0];

    if (dateStr === expectedStr) {
      streak++;
      expectedDate.setDate(expectedDate.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}
