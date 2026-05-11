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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user is admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    // Check if user has admin role
    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single();

    if (roleError || !roleData) {
      throw new Error('User does not have admin privileges');
    }

    const { action, jobId, jobData } = await req.json();

    switch (action) {
      case 'create': {
        // Insert into metadata table
        const { data, error } = await supabase
          .from('cron_job_metadata')
          .insert({
            job_name: jobData.job_name,
            description: jobData.description,
            schedule: jobData.schedule,
            edge_function_name: jobData.edge_function_name,
            is_active: true
          })
          .select()
          .single();

        if (error) throw error;

        // Schedule the cron job using pg_cron
        const { error: cronError } = await supabase.rpc('schedule_cron_job', {
          p_job_name: jobData.job_name,
          p_schedule: jobData.schedule,
          p_function_url: `${supabaseUrl}/functions/v1/${jobData.edge_function_name}`,
          p_anon_key: Deno.env.get('SUPABASE_ANON_KEY')!
        });

        if (cronError) {
          // Rollback metadata insert
          await supabase.from('cron_job_metadata').delete().eq('id', data.id);
          throw cronError;
        }

        return new Response(
          JSON.stringify({ success: true, data }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'update': {
        // Update metadata
        const { error: updateError } = await supabase
          .from('cron_job_metadata')
          .update({
            schedule: jobData.schedule,
            description: jobData.description
          })
          .eq('id', jobId);

        if (updateError) throw updateError;

        // Update cron schedule
        const { data: jobInfo } = await supabase
          .from('cron_job_metadata')
          .select('job_name, edge_function_name')
          .eq('id', jobId)
          .single();

        if (jobInfo) {
          // Unschedule old job
          await supabase.rpc('unschedule_cron_job', {
            p_job_name: jobInfo.job_name
          });

          // Reschedule with new schedule
          await supabase.rpc('schedule_cron_job', {
            p_job_name: jobInfo.job_name,
            p_schedule: jobData.schedule,
            p_function_url: `${supabaseUrl}/functions/v1/${jobInfo.edge_function_name}`,
            p_anon_key: Deno.env.get('SUPABASE_ANON_KEY')!
          });
        }

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'delete': {
        const { data: jobInfo } = await supabase
          .from('cron_job_metadata')
          .select('job_name')
          .eq('id', jobId)
          .single();

        if (jobInfo) {
          // Unschedule from pg_cron
          await supabase.rpc('unschedule_cron_job', {
            p_job_name: jobInfo.job_name
          });
        }

        // Mark as inactive in metadata
        const { error } = await supabase
          .from('cron_job_metadata')
          .update({ is_active: false })
          .eq('id', jobId);

        if (error) throw error;

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'trigger': {
        const { data: jobInfo } = await supabase
          .from('cron_job_metadata')
          .select('edge_function_name')
          .eq('id', jobId)
          .single();

        if (!jobInfo) {
          throw new Error('Job not found');
        }

        // Manually invoke the edge function
        const { error: invokeError } = await supabase.functions.invoke(
          jobInfo.edge_function_name,
          { body: { manual_trigger: true } }
        );

        // Update last run status
        await supabase
          .from('cron_job_metadata')
          .update({
            last_run_at: new Date().toISOString(),
            last_run_status: invokeError ? 'failed' : 'success'
          })
          .eq('id', jobId);

        if (invokeError) throw invokeError;

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error) {
    console.error('Error in manage-cron-jobs function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
