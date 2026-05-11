import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

import { getCorsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  // Get CORS headers based on origin
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Running meeting reminders cron job...');

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get today and tomorrow's dates
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const todayStr = today.toISOString().split('T')[0];
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    // Fetch meetings for tomorrow
    const { data: upcomingMeetings, error: fetchError } = await supabase
      .from('calendar_events')
      .select('*, clients!inner(id, name)')
      .eq('event_date', tomorrowStr);

    if (fetchError) {
      console.error('Error fetching meetings:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch meetings' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!upcomingMeetings || upcomingMeetings.length === 0) {
      console.log('No meetings tomorrow');
      return new Response(
        JSON.stringify({ message: 'No meetings to remind about', sent: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${upcomingMeetings.length} meetings tomorrow`);

    // Send push notification for each meeting
    let sentCount = 0;
    for (const meeting of upcomingMeetings) {
      try {
        const timeStr = meeting.metadata?.time ? ` at ${meeting.metadata.time}` : '';
        
        // Call send-push-notification function
        const { error: pushError } = await supabase.functions.invoke('send-push-notification', {
          body: {
            client_id: meeting.client_id,
            title: '📅 Meeting Reminder',
            body: `You have "${meeting.title}" tomorrow${timeStr}`,
            url: `/dashboard?tab=calendar&date=${tomorrowStr}`
          }
        });

        if (pushError) {
          console.error('Error sending push for meeting:', meeting.id, pushError);
        } else {
          sentCount++;
          console.log('Sent reminder for meeting:', meeting.id);
        }

        // Also create an in-app message
        await supabase.from('messages').insert({
          client_id: meeting.client_id,
          sender_type: 'system',
          message_type: 'reminder',
          content: `📅 Reminder: You have "${meeting.title}" tomorrow${timeStr}. Don't forget to prepare any questions you might have!`,
          metadata: {
            meeting_id: meeting.id,
            meeting_date: meeting.event_date
          }
        });

      } catch (error) {
        console.error('Error processing meeting:', meeting.id, error);
      }
    }

    console.log(`Sent ${sentCount} meeting reminders`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        sent: sentCount, 
        total: upcomingMeetings.length 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in send-meeting-reminders:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});