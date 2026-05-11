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
    const { client_id, stage } = await req.json();

    console.log(`Manually triggering workflow stage for client ${client_id}:`, stage);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date().toISOString();

    // Get current workflow state
    const { data: currentState, error: fetchError } = await supabase
      .from('client_workflow_state')
      .select('*')
      .eq('client_id', client_id)
      .single();

    if (fetchError) throw fetchError;

    // Determine next action based on triggered stage
    let nextAction = null;
    let nextActionDue = null;

    const stageActions: Record<string, any> = {
      consultation_scheduled: {
        next: 'send_health_assessment',
        due: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 minutes
      },
      health_assessment_sent: {
        next: currentState.service_type === 'hundred_days' ? 'send_stress_card' : null,
        due: currentState.service_type === 'hundred_days' ? new Date(Date.now() + 2.5 * 60 * 60 * 1000).toISOString() : null,
      },
      stress_card_sent: {
        next: 'send_sleep_card',
        due: new Date(Date.now() + 3.5 * 60 * 60 * 1000).toISOString(),
      },
      sleep_card_sent: {
        next: 'prepare_action_plan',
        due: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      },
    };

    if (stageActions[stage]) {
      nextAction = stageActions[stage].next;
      nextActionDue = stageActions[stage].due;
    }

    // Update workflow state
    const { error: updateError } = await supabase
      .from('client_workflow_state')
      .update({
        workflow_stage: stage,
        stage_completed_at: now,
        next_action: nextAction,
        next_action_due_at: nextActionDue,
        updated_at: now,
      })
      .eq('client_id', client_id);

    if (updateError) throw updateError;

    // Log workflow history
    const authHeader = req.headers.get('Authorization');
    let triggeredBy = 'admin';
    
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      triggeredBy = user?.id || 'admin';
    }

    await supabase.from('workflow_history').insert({
      client_id,
      workflow_stage: stage,
      action: `Manual trigger: ${stage}`,
      triggered_by: triggeredBy,
    });

    console.log(`Workflow stage triggered successfully for client ${client_id}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        workflow_stage: stage,
        next_action: nextAction,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in trigger-workflow-stage:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
