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
    console.log('Starting workflow automation process...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date().toISOString();

    // Find clients with pending actions that are due
    const { data: pendingWorkflows, error: fetchError } = await supabase
      .from('client_workflow_state')
      .select('*, clients(name, email)')
      .not('next_action', 'is', null)
      .not('next_action_due_at', 'is', null)
      .lte('next_action_due_at', now);

    if (fetchError) {
      console.error('Error fetching pending workflows:', fetchError);
      throw fetchError;
    }

    console.log(`Found ${pendingWorkflows?.length || 0} workflows to process`);

    const results = [];

    for (const workflow of pendingWorkflows || []) {
      try {
        console.log(`Processing workflow for client ${workflow.client_id}, action: ${workflow.next_action}`);

        let nextStage = workflow.workflow_stage;
        let nextAction = null;
        let nextActionDue = null;
        let messageContent = '';

        // Determine next action based on current workflow stage
        if (workflow.service_type === 'consultation') {
          switch (workflow.next_action) {
            case 'send_health_assessment':
              messageContent = `Hi ${workflow.clients.name}! It's time to complete your health assessment. This will help us create your personalized wellness plan.`;
              nextStage = 'health_assessment_sent';
              nextAction = 'follow_up_assessment';
              nextActionDue = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours later
              break;
          }
        } else if (workflow.service_type === 'hundred_days') {
          switch (workflow.next_action) {
            case 'send_health_assessment':
              messageContent = `Hi ${workflow.clients.name}! Welcome to the 100-Day Program! Let's start with your health assessment.`;
              nextStage = 'health_assessment_sent';
              nextAction = 'send_stress_card';
              nextActionDue = new Date(Date.now() + 2.5 * 60 * 60 * 1000).toISOString(); // 2.5 hours later
              break;
            case 'send_stress_card':
              messageContent = `Hi ${workflow.clients.name}! Time to complete your stress assessment. This helps us understand your stress patterns better.`;
              nextStage = 'stress_card_sent';
              nextAction = 'send_sleep_card';
              nextActionDue = new Date(Date.now() + 3.5 * 60 * 60 * 1000).toISOString(); // 3.5 hours later
              break;
            case 'send_sleep_card':
              messageContent = `Hi ${workflow.clients.name}! Let's assess your sleep patterns. Good sleep is crucial for your wellness journey!`;
              nextStage = 'sleep_card_sent';
              nextAction = 'prepare_action_plan';
              nextActionDue = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(); // 2 days later
              break;
          }
        }

        // Send in-app message
        if (messageContent) {
          await supabase.from('messages').insert({
            client_id: workflow.client_id,
            sender_type: 'system',
            message_type: 'automated',
            content: messageContent,
          });

          console.log(`Message sent to client ${workflow.client_id}`);
        }

        // Update workflow state
        const { error: updateError } = await supabase
          .from('client_workflow_state')
          .update({
            workflow_stage: nextStage,
            stage_completed_at: now,
            next_action: nextAction,
            next_action_due_at: nextActionDue,
            updated_at: now,
          })
          .eq('id', workflow.id);

        if (updateError) throw updateError;

        // Log workflow history
        await supabase.from('workflow_history').insert({
          client_id: workflow.client_id,
          workflow_stage: nextStage,
          action: workflow.next_action,
          triggered_by: 'system',
        });

        results.push({ client_id: workflow.client_id, status: 'success', action: workflow.next_action });
        console.log(`Successfully processed workflow for client ${workflow.client_id}`);

      } catch (error) {
        console.error(`Error processing workflow for client ${workflow.client_id}:`, error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.push({ client_id: workflow.client_id, status: 'error', error: errorMessage });
      }
    }

    console.log('Workflow automation process complete');

    return new Response(
      JSON.stringify({ 
        success: true, 
        processed: results.length,
        results 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in process-workflow-automation:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
