import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getCorsHeaders } from "../_shared/cors.ts";
import { sendWebPush } from "../_shared/web-push.ts";

interface PushNotificationRequest {
  client_id?: string;
  target_roles?: string[]; // e.g. ['admin', 'manager']
  title: string;
  body: string;
  url?: string;
}

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { client_id, target_roles, title, body, url } = await req.json() as PushNotificationRequest;

    if ((!client_id && (!target_roles || target_roles.length === 0)) || !title || !body) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: client_id OR target_roles, title, body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get VAPID keys
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY') || 'BA4PmjN1Np_fvvN8ABQ2pcYF_nTDTc_tizzRelPNQ_EYnMMWiZXY6H_LvksgiRFOqcORB8JndEH8BXZ-IwSK7lY';
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@sheizen.com';

    if (!vapidPrivateKey) {
      console.error('VAPID_PRIVATE_KEY not set');
      // For now, return a specific error so user knows to set it
      return new Response(
        JSON.stringify({ error: 'Server configuration error: VAPID_PRIVATE_KEY missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine target User IDs
    const targetUserIds: string[] = [];

    // 1. Add direct client_id if present
    if (client_id) {
      targetUserIds.push(client_id);
    }

    // 2. Add users by role if present
    if (target_roles && target_roles.length > 0) {
      console.log(`Fetching users with roles: ${target_roles.join(', ')}`);

      const { data: roleUsers, error: roleError } = await supabase
        .from('user_roles')
        .select('user_id')
        .in('role', target_roles);

      if (roleError) {
        console.error('Error fetching users by role:', roleError);
        // Continue but log error
      } else if (roleUsers) {
        roleUsers.forEach(u => targetUserIds.push(u.user_id));
      }
    }

    // Deduplicate IDs
    const uniqueUserIds = [...new Set(targetUserIds)];

    if (uniqueUserIds.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No target users found', sent: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch subscriptions for all unique users
    const { data: subscriptions, error: fetchError } = await supabase
      .from('push_subscriptions')
      .select('*')
      .in('client_id', uniqueUserIds);

    if (fetchError) {
      console.error('Error fetching subscriptions:', fetchError);
      throw fetchError;
    }

    if (!subscriptions || subscriptions.length === 0) {
      console.log('No subscriptions found for users:', uniqueUserIds);
      return new Response(
        JSON.stringify({ message: 'No subscriptions found', sent: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Payload - include tag to group related notifications
    const payload = JSON.stringify({
      title,
      body,
      url: url || '/dashboard',
      tag: `sheizen-${title.toLowerCase().replace(/\s+/g, '-').slice(0, 30)}`,
      timestamp: Date.now(),
    });

    // Filter out subscriptions with missing keys (corrupted data)
    const validSubscriptions = subscriptions.filter(sub => {
      if (!sub.endpoint || !sub.p256dh || !sub.auth) {
        console.warn(`Skipping subscription ${sub.id}: missing endpoint/keys`);
        return false;
      }
      return true;
    });

    if (validSubscriptions.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No valid subscriptions found', sent: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Send to all valid subscriptions
    const results = await Promise.all(validSubscriptions.map(async (sub) => {
      const subscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      };

      try {
        const result = await sendWebPush(subscription, payload, {
          subject: vapidSubject,
          publicKey: vapidPublicKey,
          privateKey: vapidPrivateKey,
        });

        // Clean up expired/invalid subscriptions
        if (!result.success && (result.statusCode === 410 || result.statusCode === 404)) {
          console.log(`Removing expired subscription ${sub.id}`);
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        }

        // Also clean up on 403 (VAPID key mismatch - user needs to re-subscribe)
        if (!result.success && result.statusCode === 403) {
          console.log(`Removing subscription ${sub.id} due to VAPID mismatch`);
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        }

        return { ...result, subscriptionId: sub.id };
      } catch (e: any) {
        console.error(`Error sending to subscription ${sub.id}:`, e);
        return { success: false, error: e.message, subscriptionId: sub.id };
      }
    }));

    const successCount = results.filter(r => r.success).length;

    return new Response(
      JSON.stringify({
        success: true,
        sent: successCount,
        total: subscriptions.length,
        results: results
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in send-push-notification:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});