import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

import { getCorsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  // Get CORS headers based on origin
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Running check-follow-ups cron job...');

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch all active clients with 100-day program
    const { data: clients, error: clientsError } = await supabaseClient
      .from('clients')
      .select('id, name, user_id, created_at, service_type')
      .eq('service_type', 'hundred_days')
      .eq('status', 'active');

    if (clientsError) {
      console.error('Error fetching clients:', clientsError);
      throw clientsError;
    }

    console.log(`Found ${clients?.length || 0} active 100-day program clients`);

    const followUpMilestones = [14, 28, 42, 56, 70, 84, 100];
    let createdFollowUps = 0;
    let messagesCreated = 0;
    const today = new Date();

    for (const client of clients || []) {
      const programStartDate = new Date(client.created_at);
      const daysSinceStart = Math.floor((today.getTime() - programStartDate.getTime()) / (1000 * 60 * 60 * 24));

      // Check if today matches any milestone
      for (const milestone of followUpMilestones) {
        if (daysSinceStart === milestone) {
          console.log(`Client ${client.name} reached ${milestone}-day milestone`);

          // Check if follow-up already exists for this milestone
          const { data: existing, error: existingError } = await supabaseClient
            .from('follow_ups')
            .select('id')
            .eq('client_id', client.id)
            .eq('follow_up_type', `${milestone}_day`)
            .maybeSingle();

          if (existingError && existingError.code !== 'PGRST116') {
            console.error('Error checking existing follow-up:', existingError);
            continue;
          }

          if (existing) {
            console.log(`Follow-up already exists for ${milestone}-day milestone`);
            continue;
          }

          // Create follow-up record
          const scheduledDate = new Date(today);
          scheduledDate.setDate(scheduledDate.getDate() + 1); // Schedule for tomorrow

          const { data: followUp, error: followUpError } = await supabaseClient
            .from('follow_ups')
            .insert({
              client_id: client.id,
              scheduled_date: scheduledDate.toISOString().split('T')[0],
              status: 'pending',
              follow_up_type: `${milestone}_day`,
            })
            .select()
            .single();

          if (followUpError) {
            console.error('Error creating follow-up:', followUpError);
            continue;
          }

          createdFollowUps++;
          console.log(`Created follow-up for ${client.name} - ${milestone}-day check-in`);

          // Send in-app message notification
          const messageContent = milestone === 100 
            ? `🎉 Congratulations! You've completed your 100-day wellness journey! Your final check-in is scheduled. Please complete the pre-call form to share your experience and achievements.`
            : `📞 Your ${milestone}-day check-in is due! This is a great time to review your progress. Please complete the pre-call form before your scheduled consultation.`;

          const { error: messageError } = await supabaseClient
            .from('messages')
            .insert({
              client_id: client.id,
              sender_type: 'system',
              message_type: 'automated',
              content: messageContent,
              is_read: false,
              metadata: {
                follow_up_id: followUp.id,
                milestone_day: milestone,
                trigger: 'follow_up_automation',
              },
            });

          if (messageError) {
            console.error('Error sending message:', messageError);
          } else {
            messagesCreated++;
            console.log(`Sent notification message to ${client.name}`);
          }

          // Create calendar event
          const { error: eventError } = await supabaseClient
            .from('calendar_events')
            .insert({
              client_id: client.id,
              event_type: 'follow_up',
              event_date: scheduledDate.toISOString().split('T')[0],
              title: `${milestone}-Day Check-In`,
              description: `Follow-up consultation for ${milestone}-day milestone`,
              metadata: {
                follow_up_id: followUp.id,
                milestone: milestone,
              },
            });

          if (eventError) {
            console.error('Error creating calendar event:', eventError);
          } else {
            console.log(`Created calendar event for ${client.name}`);
          }
        }

        // Send reminder for upcoming follow-ups (2 days before)
        if (daysSinceStart === milestone - 2) {
          const { data: upcomingFollowUp } = await supabaseClient
            .from('follow_ups')
            .select('id, status')
            .eq('client_id', client.id)
            .eq('follow_up_type', `${milestone}_day`)
            .eq('status', 'pending')
            .maybeSingle();

          if (upcomingFollowUp) {
            const reminderContent = `⏰ Reminder: Your ${milestone}-day check-in is in 2 days. Please complete the pre-call form when you have a moment.`;

            const { error: reminderError } = await supabaseClient
              .from('messages')
              .insert({
                client_id: client.id,
                sender_type: 'system',
                message_type: 'automated',
                content: reminderContent,
                is_read: false,
                metadata: {
                  follow_up_id: upcomingFollowUp.id,
                  milestone_day: milestone,
                  trigger: 'follow_up_reminder',
                },
              });

            if (!reminderError) {
              messagesCreated++;
              console.log(`Sent reminder to ${client.name} for ${milestone}-day check-in`);
            }
          }
        }
      }
    }

    const summary = {
      timestamp: today.toISOString(),
      clients_checked: clients?.length || 0,
      follow_ups_created: createdFollowUps,
      messages_sent: messagesCreated,
    };

    console.log('Cron job completed:', summary);

    return new Response(
      JSON.stringify(summary),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in check-follow-ups cron:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
