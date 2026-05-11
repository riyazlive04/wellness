import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { getCorsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  // Get CORS headers based on origin
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing Supabase environment variables');
      return new Response(
        JSON.stringify({ success: false, error: 'Server configuration error' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    }

    // Parse request body
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid request body' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    }

    const { client_id, assessment_type, notes } = body;

    if (!client_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing client_id' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    }

    if (!assessment_type) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing assessment_type' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    }

    console.log('Requesting assessment:', { client_id, assessment_type });

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get auth header and verify admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'No authorization header' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    }

    // Check if client exists
    const { data: client, error: clientFetchError } = await supabase
      .from('clients')
      .select('id, name, user_id')
      .eq('id', client_id)
      .single();

    if (clientFetchError || !client) {
      console.error('Client not found:', clientFetchError);
      return new Response(
        JSON.stringify({ success: false, error: 'Client not found in database' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    }

    // Create assessment request
    const { data: request, error: requestError } = await supabase
      .from('assessment_requests')
      .insert({

        client_id,
        assessment_type,
        status: 'pending',
        requested_by: user.id,
        notes: notes || `Requested via admin dashboard`
      })
      .select()
      .single();

    if (requestError) {
      console.error('Error creating request:', requestError);
      return new Response(
        JSON.stringify({ success: false, error: requestError.message }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    }

    console.log('Assessment request created:', request.id);

    // Format assessment type for display
    const assessmentTypeMap: Record<string, { title: string; description: string }> = {
      'health_assessment': {
        title: 'Health Assessment',
        description: 'Please complete your health assessment form to help us create a personalized plan for you.'
      },
      'stress_assessment': {
        title: 'Stress Assessment',
        description: 'Please complete your stress assessment to help us understand your current stress levels.'
      },
      'sleep_assessment': {
        title: 'Sleep Assessment',
        description: 'Please complete your sleep assessment to help us improve your sleep quality.'
      },
      'comprehensive_assessment': {
        title: 'Comprehensive Nutritional Assessment',
        description: 'Please complete your comprehensive nutritional assessment form to help us understand your overall wellness goals.'
      }
    };

    const assessmentInfo = assessmentTypeMap[assessment_type] || {
      title: 'Assessment',
      description: 'Please complete your assessment form.'
    };

    const messageContent = `📋 **${assessmentInfo.title} Requested**\n\n${assessmentInfo.description}\n\nClick the button below to get started.`;

    // Create message for client
    const { error: messageError } = await supabase.from('messages').insert({
      client_id,
      sender_id: user.id,
      sender_type: 'system',
      message_type: 'assessment_request',
      content: messageContent,
      metadata: {
        assessment_type,
        request_id: request.id,
        assessment_title: assessmentInfo.title
      }
    });

    if (messageError) {
      console.error('Error creating message:', messageError);
      // Don't fail the request if message creation fails, just log it.
    }

    // Send push notification
    try {
      await supabase.functions.invoke('send-push-notification', {
        body: {
          client_id,
          title: `${assessmentInfo.title} Requested`,
          body: 'Please complete your assessment form',
          data: {
            type: 'assessment_request',
            request_id: request.id,
            assessment_type
          }
        }
      });
    } catch (pushError) {
      console.error('Error sending push notification:', pushError);
      // Don't fail the request if push fails
    }

    console.log('Assessment request completed successfully');

    return new Response(
      JSON.stringify({
        success: true,
        request,
        message: 'Assessment request sent to client successfully'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('Error in request-assessment:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );
  }
});
