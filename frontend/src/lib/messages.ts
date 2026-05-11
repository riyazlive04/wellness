import { supabase } from "@/integrations/supabase/client";

export interface Message {
  id: string;
  client_id: string;
  sender_id: string | null;
  sender_type: 'system' | 'admin' | 'client' | 'manager';
  message_type: string;
  content: string;
  metadata: Record<string, any>;
  is_read: boolean;
  created_at: string;
  attachment_url?: string | null;
  attachment_name?: string | null;
  attachment_type?: string | null;
  attachment_size?: number | null;
  batch_id?: string | null;
  is_bulk?: boolean;
}

export const fillTemplate = (template: string, variables: Record<string, any>): string => {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
  }
  return result;
};

export const sendAutomatedMessage = async (
  clientId: string,
  templateName: string,
  variables: Record<string, any>
): Promise<void> => {
  try {
    const { error } = await supabase.functions.invoke('send-automated-message', {
      body: {
        client_id: clientId,
        template_name: templateName,
        variables,
      },
    });

    if (error) {
      console.error('Error sending automated message:', error);
    }
  } catch (error) {
    console.error('Error invoking send-automated-message function:', error);
  }
};

export const getUnreadCount = async (clientId: string, viewerType: 'admin' | 'client' = 'client'): Promise<number> => {
  try {
    let query = supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('is_read', false);

    // If viewer is client, count only STAFF (admin/manager/system) messages
    // If viewer is staff (admin/manager), count only CLIENT messages
    if (viewerType === 'client') {
      query = query.in('sender_type', ['admin', 'manager', 'system']);
    } else {
      query = query.eq('sender_type', 'client');
    }

    const { count, error } = await query;

    if (error) {
      console.error('Error fetching unread count:', error);
      return 0;
    }

    return count || 0;
  } catch (error) {
    console.error('Error in getUnreadCount:', error);
    return 0;
  }
};

export const markMessagesAsRead = async (
  clientId: string,
  viewerType: 'admin' | 'client' = 'client'
): Promise<void> => {
  try {
    let query = supabase
      .from('messages')
      .update({ is_read: true })
      .eq('client_id', clientId)
      .eq('is_read', false);

    // Only mark messages sent by the OTHER party as read
    if (viewerType === 'client') {
      // Client marks staff messages as read
      query = query.in('sender_type', ['admin', 'manager', 'system']);
    } else {
      // Staff marks client messages as read
      query = query.eq('sender_type', 'client');
    }

    const { error } = await query;

    if (error) {
      console.error('Error marking messages as read:', error);
    }
  } catch (error) {
    console.error('Error in markMessagesAsRead:', error);
  }
};

export const sendBulkMessage = async (
  clientIds: string[],
  templateId: string | null,
  messageContent: string,
  adminId: string,
  senderType: 'admin' | 'manager' = 'admin'
): Promise<{ success: number; failed: number; batchId: string }> => {
  const batchId = crypto.randomUUID();
  let successCount = 0;
  let failedCount = 0;

  try {
    // Create batch tracking entry
    const { error: batchError } = await supabase
      .from('bulk_message_batches')
      .insert({
        id: batchId,
        admin_id: adminId,
        template_id: templateId,
        recipient_count: clientIds.length,
        status: 'sending',
      });

    if (batchError) throw batchError;

    // Fetch all clients data for personalization
    const { data: clients, error: clientsError } = await supabase
      .from('clients')
      .select('*')
      .in('id', clientIds);

    if (clientsError) throw clientsError;

    // Send messages in batches with rate limiting
    const batchSize = 10;
    for (let i = 0; i < clientIds.length; i += batchSize) {
      const batchClientIds = clientIds.slice(i, i + batchSize);

      const messages = batchClientIds.map(clientId => {
        const client = clients?.find(c => c.id === clientId);
        if (!client) return null;

        // Personalize message
        const personalizedContent = messageContent
          .replace(/\{name\}/g, client.name)
          .replace(/\{program_type\}/g, client.program_type?.replace("_", " ") || "your program")
          .replace(/\{service_type\}/g, client.service_type?.replace("_", " ") || "your service")
          .replace(/\{last_weight\}/g, client.last_weight?.toString() || "your weight")
          .replace(/\{target_kcal\}/g, client.target_kcal?.toString() || "your target");

        return {
          client_id: clientId,
          sender_id: adminId,
          sender_type: senderType,
          message_type: 'manual',
          content: personalizedContent,
          metadata: {},
          is_read: false,
          batch_id: batchId,
          is_bulk: true,
          created_at: new Date().toISOString(),
        };
      }).filter(Boolean);

      const { error: insertError } = await supabase
        .from('messages')
        .insert(messages);

      if (insertError) {
        failedCount += messages.length;
        console.error('Error inserting batch:', insertError);
      } else {
        successCount += messages.length;
        
        // Trigger push notifications for the successful batch
        try {
          await Promise.all(batchClientIds.map(clientId => 
            supabase.functions.invoke('send-push-notification', {
              body: {
                client_id: clientId,
                title: 'New Message from Sheizen AI',
                body: messageContent.length > 60 ? messageContent.substring(0, 57) + '...' : messageContent,
                url: '/dashboard?tab=messages',
              }
            })
          ));
        } catch (pushError) {
          console.error('Error triggering push notifications for bulk batch:', pushError);
          // Don't fail the whole process if push fails
        }
      }

      // Rate limiting: wait 500ms between batches
      if (i + batchSize < clientIds.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // Update batch status
    await supabase
      .from('bulk_message_batches')
      .update({
        sent_count: successCount,
        failed_count: failedCount,
        status: failedCount === 0 ? 'completed' : 'failed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', batchId);

    return { success: successCount, failed: failedCount, batchId };
  } catch (error) {
    console.error('Error in sendBulkMessage:', error);

    // Update batch status to failed
    await supabase
      .from('bulk_message_batches')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', batchId);

    throw error;
  }
};
