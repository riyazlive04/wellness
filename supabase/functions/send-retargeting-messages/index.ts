import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { getCorsHeaders } from '../_shared/cors.ts';

const educationalTemplates = [
  "Hi {name}! 💡 Quick tip: Start your day with a glass of warm water and lemon to boost digestion and metabolism.",
  "Hi {name}! 🥗 Remember: Fill half your plate with colorful vegetables for maximum nutrition and fiber.",
  "Hi {name}! 🏃‍♀️ Movement matters! Even a 10-minute walk after meals can improve digestion and blood sugar levels.",
  "Hi {name}! 😴 Quality sleep is essential for weight management. Aim for 7-8 hours of consistent sleep each night.",
  "Hi {name}! 💧 Staying hydrated helps control hunger. Drink a glass of water before meals to feel fuller.",
  "Hi {name}! 🥑 Healthy fats like avocados, nuts, and olive oil support hormone balance and satiety.",
  "Hi {name}! 🧘‍♀️ Stress management is key. Try 5 minutes of deep breathing or meditation daily.",
  "Hi {name}! 🍽️ Mindful eating tip: Chew your food slowly and put your fork down between bites.",
  "Hi {name}! 🥚 Protein at breakfast helps maintain stable energy levels throughout the day.",
  "Hi {name}! 🌞 Get some sunlight! 15 minutes of morning sun helps regulate your circadian rhythm and mood.",
];

serve(async (req) => {
  // Get CORS headers based on origin
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting retargeting message process...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find clients eligible for retargeting
    const { data: eligibleClients, error: fetchError } = await supabase
      .from('client_workflow_state')
      .select('*, clients(name, email)')
      .eq('service_type', 'consultation')
      .in('workflow_stage', ['consultation_complete', 'soft_retargeting_active'])
      .eq('retargeting_enabled', true);

    if (fetchError) throw fetchError;

    console.log(`Found ${eligibleClients?.length || 0} clients eligible for retargeting`);

    const results = [];

    for (const client of eligibleClients || []) {
      try {
        // Check if message was sent recently based on frequency
        const lastSent = client.retargeting_last_sent ? new Date(client.retargeting_last_sent) : null;
        const now = new Date();
        
        let daysSinceLastSent = 999;
        if (lastSent) {
          daysSinceLastSent = Math.floor((now.getTime() - lastSent.getTime()) / (1000 * 60 * 60 * 24));
        }

        const frequencyDays = client.retargeting_frequency === 'weekly' ? 7 : 
                             client.retargeting_frequency === 'bi-weekly' ? 14 : 30;

        if (daysSinceLastSent < frequencyDays) {
          console.log(`Skipping client ${client.client_id} - message sent ${daysSinceLastSent} days ago`);
          continue;
        }

        // Get previously sent messages to avoid repeats
        const { data: sentMessages } = await supabase
          .from('messages')
          .select('content')
          .eq('client_id', client.client_id)
          .eq('message_type', 'retargeting')
          .order('created_at', { ascending: false })
          .limit(5);

        const sentContents = sentMessages?.map(m => m.content) || [];

        // Select a random template that wasn't sent recently
        let selectedTemplate = null;
        const shuffled = [...educationalTemplates].sort(() => Math.random() - 0.5);
        
        for (const template of shuffled) {
          const content = template.replace('{name}', client.clients.name);
          if (!sentContents.some(sent => sent === content)) {
            selectedTemplate = content;
            break;
          }
        }

        // If all templates were used, pick any random one
        if (!selectedTemplate) {
          selectedTemplate = shuffled[0].replace('{name}', client.clients.name);
        }

        // Send message
        await supabase.from('messages').insert({
          client_id: client.client_id,
          sender_type: 'system',
          message_type: 'retargeting',
          content: selectedTemplate,
        });

        // Update retargeting last sent time
        await supabase
          .from('client_workflow_state')
          .update({
            retargeting_last_sent: now.toISOString(),
            workflow_stage: 'soft_retargeting_active',
          })
          .eq('client_id', client.client_id);

        results.push({ client_id: client.client_id, status: 'success' });
        console.log(`Sent retargeting message to client ${client.client_id}`);

      } catch (error) {
        console.error(`Error sending retargeting message to client ${client.client_id}:`, error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.push({ client_id: client.client_id, status: 'error', error: errorMessage });
      }
    }

    console.log('Retargeting message process complete');

    return new Response(
      JSON.stringify({ 
        success: true, 
        sent: results.filter(r => r.status === 'success').length,
        results 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in send-retargeting-messages:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
