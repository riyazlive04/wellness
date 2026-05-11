import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.84.0';

import { getCorsHeaders } from '../_shared/cors.ts';
import { sendWebPush } from '../_shared/web-push.ts';

interface MessageRequest {
  client_id: string;
  template_name: string;
  variables: Record<string, any>;
}

Deno.serve(async (req) => {
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

    const { client_id, template_name, variables }: MessageRequest = await req.json();

    console.log('Sending automated message:', { client_id, template_name, variables });

    // Fetch template
    const { data: template, error: templateError } = await supabase
      .from('message_templates')
      .select('*')
      .eq('name', template_name)
      .eq('is_active', true)
      .maybeSingle();

    if (templateError || !template) {
      console.error('Template not found:', template_name, templateError);
      return new Response(
        JSON.stringify({ error: 'Template not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fill template variables
    let content = template.template;
    for (const [key, value] of Object.entries(variables)) {
      content = content.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
    }

    // Insert message
    const { data: message, error: messageError } = await supabase
      .from('messages')
      .insert({
        client_id,
        sender_id: null,
        sender_type: 'system',
        message_type: 'manual',
        content,
        metadata: { template_name, variables, trigger_event: template.trigger_event },
        is_read: false,
      })
      .select()
      .single();

    if (messageError) {
      console.error('Error inserting message:', messageError);
      return new Response(
        JSON.stringify({ error: 'Failed to send message' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Message sent successfully:', message.id);

    // --- Push Notification Logic ---
    try {
      // Fetch subscriptions
      const { data: subscriptions } = await supabase
        .from('push_subscriptions')
        .select('*')
        .eq('client_id', client_id);

      if (subscriptions && subscriptions.length > 0) {
        const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY') || 'BA11f-wSr9t_hdnn_hrkwKbqjVb2x-VKcG9CMym7IWXz1JwCa2LLdD1eTgGq2bfwOOPKScNlO7P8uyMAlIvWuu4';
        const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
        const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@sheizen.com';

        if (vapidPrivateKey) {
          const payload = JSON.stringify({
            title: 'New Message',
            body: content.substring(0, 100) + (content.length > 100 ? '...' : ''),
            url: '/dashboard?tab=messages',
            timestamp: Date.now()
          });

          await Promise.all(subscriptions.map(async (sub) => {
            const subscription = {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth }
            };
            try {
              await sendWebPush(subscription, payload, {
                subject: vapidSubject,
                publicKey: vapidPublicKey,
                privateKey: vapidPrivateKey
              });
            } catch (e) {
              console.error('Push failed for sub', sub.id, e);
            }
          }));
        } else {
          console.log('Skipping push: VAPID_PRIVATE_KEY not set');
        }
      }
    } catch (pushError) {
      console.error('Error triggering push notification:', pushError);
      // Don't fail the request if push fails, just log it
    }
    // -------------------------------

    return new Response(
      JSON.stringify({ success: true, message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in send-automated-message:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
