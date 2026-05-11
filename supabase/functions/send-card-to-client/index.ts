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
    const { card_id, display_name } = await req.json();

    console.log(`Sending card ${card_id} to client with display name: ${display_name}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get the card
    const { data: card, error: cardError } = await supabase
      .from('pending_review_cards')
      .select('*, clients(name, user_id)')
      .eq('id', card_id)
      .single();

    if (cardError) throw cardError;

    // Get admin user from auth header
    const authHeader = req.headers.get('Authorization');
    let reviewedBy = null;

    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      reviewedBy = user?.id;
    }

    // Update card status to sent
    const { error: updateError } = await supabase
      .from('pending_review_cards')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        reviewed_by: reviewedBy
      })
      .eq('id', card_id);

    if (updateError) throw updateError;

    // Create message to client
    const cardTypeNames = {
      'health_assessment': 'Health Assessment Card',
      'stress_card': 'Stress Assessment Card',
      'sleep_card': 'Sleep Quality Card',
      'action_plan': 'Health Action Plan',
      'diet_plan': 'Diet Plan'
    };

    const cardTypeName = cardTypeNames[card.card_type as keyof typeof cardTypeNames] || 'Assessment Card';

    const { error: messageError } = await supabase
      .from('messages')
      .insert({
        client_id: card.client_id,
        sender_type: 'system',
        message_type: 'automated',
        content: `Your ${cardTypeName} is ready! Your dietitian has reviewed and sent your personalized ${cardTypeName.toLowerCase()}. View it in your dashboard to see your detailed health insights and recommendations.`,
        metadata: {
          card_id: card_id,
          card_type: card.card_type
        }
      });

    if (messageError) console.error('Error creating message:', messageError);

    // Send push notification
    try {
      await supabase.functions.invoke('send-push-notification', {
        body: {
          client_id: card.client_id,
          title: `New ${cardTypeName} Ready`,
          body: `Your dietitian has reviewed and sent your ${cardTypeName.toLowerCase()}.`,
          url: '/dashboard'
        }
      });
    } catch (pushError) {
      console.error('Error sending push notification for card:', pushError);
    }

    // Update workflow stage
    const { error: workflowError } = await supabase
      .from('client_workflow_state')
      .update({
        workflow_stage: card.workflow_stage,
        stage_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('client_id', card.client_id);

    if (workflowError) console.error('Error updating workflow:', workflowError);

    // Create assessment record with display_name for tracking
    // Use provided display_name or fallback to generated name
    const assessmentName = display_name || `${cardTypeName} - ${new Date().toLocaleDateString()}`;

    const { error: assessmentError } = await supabase
      .from('assessments')
      .insert({
        client_id: card.client_id,
        assessment_type: card.card_type.includes('health') ? 'health' :
          card.card_type.includes('stress') ? 'stress' :
            card.card_type.includes('sleep') ? 'sleep' : 'custom',
        display_name: assessmentName,
        file_name: assessmentName,
        ai_generated: true,
        assessment_data: {
          card_id: card_id,
          card_type: card.card_type,
          generated_content: card.generated_content,
          sent_at: new Date().toISOString()
        }
      });

    if (assessmentError) {
      console.error('Error creating assessment record:', assessmentError);
      // We continue even if this fails, as the core message was sent
    }

    console.log(`Card ${card_id} sent to client successfully`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `${cardTypeName} sent to ${card.clients.name}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in send-card-to-client:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
