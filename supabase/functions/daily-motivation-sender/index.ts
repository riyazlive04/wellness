import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.84.0';

Deno.serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Starting daily motivation sender...');

    // Fetch all active clients
    const { data: clients, error: clientsError } = await supabase
      .from('clients')
      .select('id, name')
      .eq('status', 'active');

    if (clientsError) {
      console.error('Error fetching clients:', clientsError);
      throw clientsError;
    }

    if (!clients || clients.length === 0) {
      console.log('No active clients found');
      return new Response(
        JSON.stringify({ message: 'No active clients to send messages to' }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Fetch morning motivation templates
    const { data: templates, error: templatesError } = await supabase
      .from('message_templates')
      .select('*')
      .eq('trigger_event', 'daily_morning')
      .eq('is_active', true);

    if (templatesError || !templates || templates.length === 0) {
      console.error('Error fetching templates:', templatesError);
      throw new Error('No morning motivation templates found');
    }

    // Send a random template to each client
    const messagesToInsert = clients.map((client) => {
      const randomTemplate = templates[Math.floor(Math.random() * templates.length)];
      const content = randomTemplate.template.replace(/\{name\}/g, client.name);

      return {
        client_id: client.id,
        sender_id: null,
        sender_type: 'system',
        message_type: 'motivation',
        content,
        metadata: { template_name: randomTemplate.name },
        is_read: false,
      };
    });

    // Batch insert messages
    const { data: insertedMessages, error: insertError } = await supabase
      .from('messages')
      .insert(messagesToInsert)
      .select();

    if (insertError) {
      console.error('Error inserting messages:', insertError);
      throw insertError;
    }

    console.log(`Successfully sent ${insertedMessages.length} morning motivation messages`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Sent ${insertedMessages.length} morning motivation messages`,
        clients_reached: clients.length,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in daily-motivation-sender:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
