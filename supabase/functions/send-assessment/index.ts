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
    const { assessment_id, client_id } = await req.json();

    if (!assessment_id || !client_id) {
      throw new Error('Missing required parameters');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get assessment details
    const { data: assessment, error: assessmentError } = await supabase
      .from('assessments')
      .select('*, clients(name, email)')
      .eq('id', assessment_id)
      .single();

    if (assessmentError) throw assessmentError;

    // Create in-app message for client
    const { error: messageError } = await supabase
      .from('messages')
      .insert({
        client_id: client_id,
        sender_type: 'admin',
        message_type: 'manual',
        content: `Your ${assessment.assessment_type || 'assessment'} has been completed and is ready to view.`,
        attachment_url: assessment.file_url,
        attachment_name: assessment.display_name,
        attachment_type: 'application/pdf',
        metadata: {
          assessment_id: assessment_id,
          assessment_type: assessment.assessment_type,
        },
      });

    if (messageError) throw messageError;

    // Send push notification
    try {
      await supabase.functions.invoke('send-push-notification', {
        body: {
          client_id: client_id,
          title: 'New Assessment Available',
          body: `Your ${assessment.assessment_type || 'assessment'} is ready to view`,
          data: {
            type: 'assessment',
            assessment_id: assessment_id,
          },
        },
      });
    } catch (pushError) {
      console.error('Push notification error:', pushError);
    }

    console.log(`Assessment ${assessment_id} sent to client ${client_id}`);

    return new Response(
      JSON.stringify({ success: true, message: 'Assessment sent successfully' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in send-assessment:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
