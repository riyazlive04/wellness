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

        // Get a random client
        const { data: clients, error: clientError } = await supabase
            .from('clients')
            .select('id, user_id')
            .limit(1);

        if (clientError || !clients || clients.length === 0) {
            throw new Error('No clients found to test with.');
        }

        const clientId = clients[0].id;
        console.log('Using client:', clientId);

        // Insert Stress Card
        const { data: stressCard, error: stressError } = await supabase
            .from('pending_review_cards')
            .insert({
                client_id: clientId,
                card_type: 'stress_card',
                generated_content: {
                    client_name: 'Debug Test Client',
                    assessment_text: 'Manual debug insertion for Stress Card.',
                    generated_at: new Date().toISOString()
                },
                status: 'pending',
                workflow_stage: 'debug_inserted',
            })
            .select()
            .single();

        if (stressError) {
            console.error('Stress Insert Error:', stressError);
        } else {
            console.log('Stress Card Inserted:', stressCard.id);
        }

        // Insert Health Card
        const { data: healthCard, error: healthError } = await supabase
            .from('pending_review_cards')
            .insert({
                client_id: clientId,
                card_type: 'health_assessment',
                generated_content: {
                    client_details: { name: 'Debug Test Client' },
                    ai_analysis: 'Manual debug insertion for Health Card.',
                    generated_at: new Date().toISOString()
                },
                status: 'pending',
                workflow_stage: 'debug_inserted',
            })
            .select()
            .single();

        if (healthError) {
            console.error('Health Insert Error:', healthError);
        } else {
            console.log('Health Card Inserted:', healthCard.id);
        }

        return new Response(
            JSON.stringify({
                success: true,
                stress_card: stressCard,
                health_card: healthCard,
                errors: { stress: stressError, health: healthError }
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('Error:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
